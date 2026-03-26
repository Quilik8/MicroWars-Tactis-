/**
 * Clase Node — Nodo táctico del mapa (PixiJS / WebGL)
 * VFX usa Graphics estáticos compartidos (vfxGraphics, sparksGraphics)
 * que se limpian y redibujan cada frame — patrón correcto para PixiJS v8.
 *
 * ARTILLERÍA v2 — Sistema de proyectil de ácido con splash damage:
 *  - Un proyectil visible viaja en arco de parábola hacia el centroide del cluster enemigo.
 *  - Al impactar, explota en splash radius y aplica daño con falloff a TODAS las unidades en área.
 *  - Las partículas de ácido se dispersan desde el punto de impacto.
 *  - Un solo disparo afecta al grupo completo — sin iterar hormiga por hormiga.
 */
import * as PIXI from 'pixi.js';
import { NodeRenderer } from './node_renderer.js';

// ─── Proyectil de ácido (dato plano, sin objetos PIXI) ───────────────────────
// Campos:
//   ox, oy       — origen (borde del nodo)
//   tx, ty       — destino (centroide del cluster)
//   progress     — 0..1, avance normalizado del vuelo
//   duration     — segundos que tarda en llegar
//   arcHeight    — altura máxima del arco en píxeles
//   splashRadius — radio de explosión al impactar
//   color        — color del propietario del nodo
//   exploding    — false mientras vuela, true al detonar
//   explodeTimer — cuenta regresiva de la explosión (segundos)
//   explodeX/Y   — posición real de impacto
//   particles    — array de partículas de ácido generadas al explotar
// ─────────────────────────────────────────────────────────────────────────────

export class Node {
    // Pool heredado — ya no se usa para VFX, se mantiene por compatibilidad
    static bulletPool = [];
    static getBullet(layer) { return null; }
    static recycleBullet(b) {}
    static clearPool() { this.bulletPool = []; }

    constructor(x, y, owner, type = 'normal') {
        this.x = x;
        this.y = y;
        this.owner = owner;
        this.type = type;

        let stats = Node.TYPES[type] || Node.TYPES['normal'];
        this.radius = stats.radius;
        this.maxUnits = stats.maxUnits;
        this.regenInterval = stats.regenInterval;

        // Movilidad orbital
        this.isMobile = false;
        this.orbitAnchorX = 0;
        this.orbitAnchorY = 0;
        this.orbitRadiusX = 0;
        this.orbitRadiusY = 0;
        this.orbitSpeed = 0;
        this.orbitAngle = 0;
        this.vx = 0;
        this.vy = 0;

        this.isSelected = false;
        this.hovered = false;

        // Nivel 8 — Rayo de Luz
        this.isMarkedForSweep = false;  // true si el rayo lo puede neutralizar
        this._sweepMarkAngle  = 0;      // ángulo rotacional del anillo de marca (visual)
        this._sweepAlerting   = false;  // true durante la fase de alerta (activa el pulso)
        this.tunnelTo = null;
        this.counts = { player: 0, enemy: 0, neutral: 0 };

        // Evolución: null | 'espinoso' | 'artilleria' | 'tanque'
        this.evolution = null;

        // ── Artillería v2 ──────────────────────────────────────────
        this.artilleryTimer    = 1.8;   // inicia listo para disparar de inmediato
        this.artilleryInterval = 1.8;
        this.artilleryRange    = 180;
        this.splashRadius      = 38;    // radio de explosión al impactar

        // Proyectiles activos — cada elemento es un proyectil de ácido en vuelo o explosión
        this.activeShots = [];
        // ──────────────────────────────────────────────────────────

        this.regenTimer  = 0;
        this.combatTimer = 0;

        // Flash visual
        this.flashTimer       = 0;
        this.flashColor       = 0xffffff;
        this.flashTargetColor = null;

        // Chispas de batalla como datos planos JS (NO PIXI.Graphics)
        this.sparks           = [];
        this.battleCooldown   = 0;
        this.lastDominantColor  = 0xffffff;
        this.lastSparkIntensity = 0;

        // Conquista visual
        this.conquestProgress  = 0;
        this.conqueringFaction = null;

        // Gráficos PixiJS
        this.gfx = null;
    }

    static TYPES = {
        normal:   { radius: 25, maxUnits: 200, regenInterval: 1.0 },
        enjambre: { radius: 35, maxUnits: 300, regenInterval: 0.5 },
        gigante:  { radius: 60, maxUnits: 500, regenInterval: 1.25 },
        tunel:    { radius: 35, maxUnits: 0,   regenInterval: 9999 }
    };

    static COLORS = {
        player:      { fill: 0x3498db, stroke: 0x2980b9, accent: 0x85c1e9, name: "Azul" },
        enemy:       { fill: 0xe74c3c, stroke: 0xc0392b, accent: 0xf1948a, name: "Rojo" },
        neutral:     { fill: 0x95a5a6, stroke: 0x7f8c8d, name: "Neutral" },
        fuego:       { fill: 0xd35400, stroke: 0xa04000, accent: 0xe59866, name: "Naranja" },
        carpinteras: { fill: 0x5dade2, stroke: 0x2874a6, accent: 0x85c1e9, name: "Celeste" },
        negras:      { fill: 0x566573, stroke: 0x273746, name: "Gris oscuro" },
        bala:        { fill: 0x111111, stroke: 0x000000, name: "Negro" },
        tejedoras:   { fill: 0x2ecc71, stroke: 0x27ae60, accent: 0x82e0aa, name: "Verde" },
        mostaza:     { fill: 0xf39c12, stroke: 0xd68910, accent: 0xf8c471, name: "Mostaza" }
    };

    static EVOLUTION_COLORS = {
        espinoso:   { accent: 0x27ae60, symbol: '🌵' },
        artilleria: { accent: 0xf39c12, symbol: '🔫' },
        tanque:     { accent: 0x8e44ad, symbol: '🛡️' },
    };

    static EVOLUTION_COSTS = {
        espinoso:   30,
        artilleria: 40,
        tanque:     35,
    };

    redraw(factionData = null) { NodeRenderer.redraw(this, factionData); }
    drawTooltip(ctx)           { NodeRenderer.drawTooltip(this, ctx); }

    containsPoint(mx, my) {
        let dx = mx - this.x, dy = my - this.y;
        // Nodos marcados con el anillo de rayo de sol tienen radio interactivo
        // extendido (+12 px) para que coincida con el área visual del anillo orbital
        // (orbitR = r + 14 en NodeRenderer, dejamos 2 px de margen interior).
        const r = this.isMarkedForSweep ? this.radius + 12 : this.radius;
        return dx * dx + dy * dy <= r * r;
    }

    /**
     * @param {number}          dt
     * @param {SpatialHashGrid} grid
     * @param {Unit[]}          allUnits
     * @param {PIXI.Graphics}   vfxGraphics    — Graphics estático compartido para artillería
     * @param {PIXI.Graphics}   sparksGraphics — Graphics estático compartido para chispas
     * @param sfx
     */
    update(dt, grid, allUnits, vfxGraphics, sparksGraphics, sfx) {

        // ── Animación del anillo de marca (Nivel 8) ──
        // update() es el único responsable de animar y redibujar el anillo orbital.
        // Centralizar aquí el redraw del sweep mark permite que combat_manager deje
        // de llamar redraw() cada frame en nodos sin combate activo (Pass 2).
        if (this.isMarkedForSweep) {
            this._sweepMarkAngle += dt * 1.2; // ~1.2 rad/s de rotación
            if (this._sweepMarkAngle > Math.PI * 2) this._sweepMarkAngle -= Math.PI * 2;
            this.redraw();
        }

        // ── Flash visual del nodo ──
        if (this.flashTimer > 0) {
            this.flashTimer -= dt;
            if (this.flashTimer <= 0) {
                this.flashTimer = 0;
                this.flashTargetColor = null;
                this.redraw();
            }
        }

        // ─────────────────────────────────────────────────────────
        // 1. ESPINOSO: Aura de daño pasivo
        // ─────────────────────────────────────────────────────────
        if (this.evolution === 'espinoso') {
            const espinosoRange = this.radius + (this.artilleryRange * 0.25);
            const neighbors = [];
            grid.findNear(this.x, this.y, espinosoRange, neighbors);
            const killProbability = 2.4 * dt;
            for (let idx of neighbors) {
                let u = allUnits[idx];
                if (u && u.faction !== this.owner && !u.pendingRemoval && u.state === 'traveling') {
                    const ddx = u.x - this.x;
                    const ddy = u.y - this.y;
                    if (ddx * ddx + ddy * ddy < espinosoRange * espinosoRange
                        && ddx * ddx + ddy * ddy > this.radius * this.radius
                        && Math.random() < killProbability) {
                        u.pendingRemoval = true;
                        if (this.flashTimer <= 0) {
                            this.flashTargetColor = 0xff6666;
                            this.flashTimer = 0.15;
                            this.redraw();
                        }
                    }
                }
            }
        }

        // ─────────────────────────────────────────────────────────
        // 2. ARTILLERÍA v2: Proyectil de ácido con splash damage
        // ─────────────────────────────────────────────────────────
        if (this.evolution === 'artilleria') {
            this._updateArtillery(dt, grid, allUnits, vfxGraphics, sfx);
        }

        // ─────────────────────────────────────────────────────────
        // 3. CHISPAS DE BATALLA
        // ─────────────────────────────────────────────────────────
        this._updateBattleSparks(dt, sparksGraphics);
    }

    // ═══════════════════════════════════════════════════════════════
    // ARTILLERÍA v2 — Lógica completa
    // ═══════════════════════════════════════════════════════════════
    _updateArtillery(dt, grid, allUnits, vfxGraphics, sfx) {

        // ── A. Cooldown y disparo ─────────────────────────────────
        this.artilleryTimer += dt;

        if (this.artilleryTimer >= this.artilleryInterval) {

            // Buscar todos los enemigos en rango en UN SOLO PASE
            const neighbors = [];
            grid.findNear(this.x, this.y, this.artilleryRange, neighbors);

            // Calcular centroide del cluster enemigo y contar targets
            let sumX = 0, sumY = 0, count = 0;
            const rangeSq   = this.artilleryRange * this.artilleryRange;
            const radiusSq  = this.radius * this.radius;

            for (let idx of neighbors) {
                const u = allUnits[idx];
                if (!u || u.faction === this.owner || u.pendingRemoval || u.state !== 'traveling') continue;
                const ddx = u.x - this.x;
                const ddy = u.y - this.y;
                const dSq = ddx * ddx + ddy * ddy;
                if (dSq < rangeSq && dSq > radiusSq) {
                    sumX += u.x;
                    sumY += u.y;
                    count++;
                }
            }

            if (count > 0) {
                // Centroide del grupo como punto de impacto
                const targetX = sumX / count;
                const targetY = sumY / count;

                // Dirección cañón → centroide para el origen del proyectil
                const tdx   = targetX - this.x;
                const tdy   = targetY - this.y;
                const tdist = Math.sqrt(tdx * tdx + tdy * tdy) || 1;
                const originX = this.x + (tdx / tdist) * (this.radius + 3);
                const originY = this.y + (tdy / tdist) * (this.radius + 3);

                const factionColor = (Node.COLORS[this.owner] || Node.COLORS.neutral).fill;
                const flightDist   = tdist;
                // Duración del vuelo: proporcional a la distancia, entre 0.25 y 0.55 s
                const duration = Math.max(0.25, Math.min(0.55, flightDist / 360));
                // Altura del arco: proporcional a la distancia
                const arcHeight = flightDist * 0.30;

                this.activeShots.push({
                    ox: originX, oy: originY,
                    tx: targetX, ty: targetY,
                    progress: 0,
                    duration,
                    arcHeight,
                    splashRadius: this.splashRadius,
                    color: factionColor,
                    // Estado de explosión
                    exploding:    false,
                    explodeTimer: 0,
                    explodeX:     0,
                    explodeY:     0,
                    // Partículas de ácido (generadas al detonar)
                    particles:    null,
                    // Flag para aplicar daño una sola vez al detonar
                    damageDone:   false,
                });

                // Flash en el cañón
                this.flashTargetColor = (Node.COLORS[this.owner] || Node.COLORS.neutral).accent || 0xffdd44;
                this.flashTimer = 0.10;
                this.redraw();
                if (sfx) sfx.shoot();

                this.artilleryTimer = 0;
            } else {
                // Sin objetivos: mantener listo para disparar en cuanto aparezcan
                this.artilleryTimer = this.artilleryInterval;
            }
        }

        // ── B. Actualizar proyectiles en vuelo y explosiones ──────
        if (!vfxGraphics) return;

        let si = this.activeShots.length - 1;
        while (si >= 0) {
            const shot = this.activeShots[si];
            let remove = false;

            if (!shot.exploding) {
                // ── VUELO EN ARCO (parábola cuadrática) ──
                shot.progress += dt / shot.duration;

                if (shot.progress >= 1.0) {
                    shot.progress  = 1.0;
                    shot.exploding = true;
                    shot.explodeTimer = 0.45;
                    shot.explodeX  = shot.tx;
                    shot.explodeY  = shot.ty;

                    if (!shot.damageDone) {
                        shot.damageDone = true;
                        this._applySplashDamage(shot.tx, shot.ty, shot.splashRadius, grid, allUnits);
                    }

                    shot.particles = this._createAcidParticles(shot.tx, shot.ty, shot.color, shot.splashRadius);

                    this.flashTargetColor = 0x39ff14;
                    this.flashTimer = 0.18;
                    this.redraw();
                    if (sfx && sfx.acidExplode) sfx.acidExplode();

                } else {
                    const t  = shot.progress;
                    const cx = shot.ox + (shot.tx - shot.ox) * t;
                    const cy = shot.oy + (shot.ty - shot.oy) * t;
                    const arcOffset = -Math.sin(Math.PI * t) * shot.arcHeight;
                    this._drawProjectileInFlight(vfxGraphics, shot, cx, cy + arcOffset, t);
                }
            }

            if (shot.exploding) {
                shot.explodeTimer -= dt;
                if (shot.explodeTimer <= 0) {
                    remove = true;
                } else {
                    this._drawExplosion(vfxGraphics, shot, dt);
                }
            }

            if (remove) {
                // Swap-and-pop: O(1) en vez de splice O(n)
                const last = this.activeShots.length - 1;
                if (si !== last) this.activeShots[si] = this.activeShots[last];
                this.activeShots.pop();
            }
            si--;
        }
    }

    // ─── Proyectil en vuelo: gota de ácido con estela ────────────
    _drawProjectileInFlight(gfx, shot, cx, cy, t) {
        // Estela de gotas pequeñas que se desvanece
        const trailCount = 4;
        for (let j = 1; j <= trailCount; j++) {
            const tj     = t - (j * 0.05);
            if (tj < 0) continue;
            const tx2  = shot.ox + (shot.tx - shot.ox) * tj;
            const ty2  = shot.oy + (shot.ty - shot.oy) * tj;
            const arc2 = -Math.sin(Math.PI * tj) * shot.arcHeight;
            const trailAlpha = (1 - j / trailCount) * 0.45;
            const trailR = Math.max(1, 4 - j);

            gfx.circle(tx2, ty2 + arc2, trailR);
            gfx.fill({ color: 0x39ff14, alpha: trailAlpha }); // verde ácido brillante
        }

        // Núcleo del proyectil: gota verde brillante con borde amarillo
        gfx.circle(cx, cy, 6.5);
        gfx.fill({ color: shot.color, alpha: 0.85 });

        gfx.circle(cx, cy, 4.5);
        gfx.fill({ color: 0x39ff14, alpha: 0.95 }); // núcleo ácido

        // Destello blanco en el centro
        gfx.circle(cx, cy, 2);
        gfx.fill({ color: 0xffffff, alpha: 0.9 });

        // Sombra proyectada en el suelo (línea punteada vertical hasta el piso)
        // solo cuando está en el aire con arco notable
        if (shot.arcHeight > 15) {
            const groundY = shot.oy + (shot.ty - shot.oy) * t;
            gfx.moveTo(cx, cy).lineTo(cx, groundY);
            gfx.stroke({ color: 0x000000, alpha: 0.12, width: 1 });

            // Sombra circular en el suelo
            const shadowScale = 0.3 + t * 0.7;
            gfx.ellipse(cx, groundY, 5 * shadowScale, 2.5 * shadowScale);
            gfx.fill({ color: 0x000000, alpha: 0.15 });
        }
    }

    // ─── Explosión de ácido con partículas ───────────────────────
    _drawExplosion(gfx, shot, dt) {
        const progress = 1 - (shot.explodeTimer / 0.45); // 0..1
        const alpha    = shot.explodeTimer / 0.45;        // 1..0
        const maxR     = shot.splashRadius;

        // Onda expansiva exterior (blanco → verde)
        const waveR = maxR * Math.pow(progress, 0.6);
        gfx.circle(shot.explodeX, shot.explodeY, waveR);
        gfx.stroke({ color: 0xffffff, alpha: alpha * 0.8, width: 3 });

        // Relleno ácido interior que se expande y desvanece
        const innerR = maxR * 0.65 * Math.pow(progress, 0.45);
        gfx.circle(shot.explodeX, shot.explodeY, innerR);
        gfx.fill({ color: 0x39ff14, alpha: alpha * 0.35 });

        // Segunda onda más lenta (ácido salpicando)
        const wave2R = maxR * 0.45 * Math.pow(progress, 0.3);
        gfx.circle(shot.explodeX, shot.explodeY, wave2R);
        gfx.fill({ color: shot.color, alpha: alpha * 0.50 });

        // Destello central intenso (solo al inicio)
        if (progress < 0.35) {
            const coreAlpha = (1 - progress / 0.35) * alpha;
            gfx.circle(shot.explodeX, shot.explodeY, 14 * (1 - progress));
            gfx.fill({ color: 0xffffff, alpha: coreAlpha * 0.9 });
        }

        // ── Partículas de ácido ──
        if (shot.particles) {
            let pi = shot.particles.length - 1;
            while (pi >= 0) {
                const p = shot.particles[pi];
                p.x  += p.vx * dt;
                p.y  += p.vy * dt;
                p.vy += 180 * dt;
                p.life -= dt;

                if (p.life <= 0) {
                    // Swap-and-pop
                    const last = shot.particles.length - 1;
                    if (pi !== last) shot.particles[pi] = shot.particles[last];
                    shot.particles.pop();
                } else {
                    const pAlpha = (p.life / p.maxLife) * alpha;
                    const pr     = Math.max(0.5, p.r * (p.life / p.maxLife));
                    gfx.circle(p.x, p.y, pr);
                    gfx.fill({ color: p.color, alpha: pAlpha });
                }
                pi--;
            }
        }
    }

    // ─── Splash damage — presupuesto fijo por disparo ────────────
    //
    // Cada proyectil tiene un presupuesto de MAX_KILLS (fijo).
    // El daño es predecible e independiente del tamaño del ejército:
    //   · Ejército de 300: pierde ~5-8 por disparo   (~2%)
    //   · Ejército de 20:  pierde ~2-4 por disparo   (~10-20%)
    //
    // Probabilidades con falloff suave:
    //   · Centro (t=0): 55% → borde (t=1): 10%
    _applySplashDamage(cx, cy, splashR, grid, allUnits) {
        const splashSq = splashR * splashR;
        const nearIds  = [];
        grid.findNear(cx, cy, splashR, nearIds);

        // Máximo 8 kills por disparo — fijo, independiente del tamaño del grupo
        const MAX_KILLS = 8;
        let killed = 0;

        for (const idx of nearIds) {
            if (killed >= MAX_KILLS) break;

            const u = allUnits[idx];
            if (!u || u.pendingRemoval || u.faction === this.owner) continue;

            const ddx = u.x - cx;
            const ddy = u.y - cy;
            const dSq = ddx * ddx + ddy * ddy;
            if (dSq > splashSq) continue;

            // t = 0 en el centro, t = 1 en el borde
            const t = Math.sqrt(dSq) / splashR;
            // 55% chance en centro → 10% en borde
            if (Math.random() < 0.55 - t * 0.45) {
                u.pendingRemoval = true;
                killed++;
            }
        }
    }

    // ─── Generar partículas de ácido al detonar ───────────────────
    _createAcidParticles(cx, cy, color, splashR) {
        const particles = [];
        const count = 18 + Math.floor(Math.random() * 10); // 18–27 partículas

        for (let i = 0; i < count; i++) {
            const angle  = Math.random() * Math.PI * 2;
            const speed  = 40 + Math.random() * (splashR * 2.2);
            const maxLife = 0.25 + Math.random() * 0.20;
            // Alternar entre verde ácido brillante y el color de la facción
            const pColor = Math.random() < 0.6 ? 0x39ff14 : color;

            particles.push({
                x:       cx,
                y:       cy,
                vx:      Math.cos(angle) * speed,
                vy:      Math.sin(angle) * speed - (20 + Math.random() * 30), // leve impulso hacia arriba
                r:       1.5 + Math.random() * 3.5,
                color:   pColor,
                life:    maxLife,
                maxLife,
            });
        }
        return particles;
    }

    // ═══════════════════════════════════════════════════════════════
    // CHISPAS DE BATALLA — sin cambios respecto a la versión anterior
    // ═══════════════════════════════════════════════════════════════
    _updateBattleSparks(dt, sparksGraphics) {
        let underAttack     = false;
        let attackers       = 0;
        let dominantFaction = null;

        const factionPairs = Object.entries(this.counts).filter(([, v]) => v > 0);

        if (factionPairs.length > 1) {
            underAttack = true;
            let maxCount = -1;
            for (const [f, cnt] of factionPairs) {
                if (cnt > maxCount) { maxCount = cnt; dominantFaction = f; }
            }
            attackers = maxCount;
        } else if (factionPairs.length === 1 && factionPairs[0][0] !== this.owner) {
            underAttack     = true;
            dominantFaction = factionPairs[0][0];
            attackers       = factionPairs[0][1];
        }

        if (underAttack) {
            this.battleCooldown = 5.0;
            if (dominantFaction && Node.COLORS[dominantFaction]) {
                this.lastDominantColor = Node.COLORS[dominantFaction].fill;
            }
            this.lastSparkIntensity = attackers > 80 ? 18 : (attackers > 25 ? 12 : 6);
        } else {
            if (this.battleCooldown > 0) this.battleCooldown -= dt;
            else this.lastSparkIntensity = 0;
        }

        const desiredSparks = this.battleCooldown > 0 ? this.lastSparkIntensity : 0;

        // Crear partículas JS planas si faltan
        while (this.sparks.length < desiredSparks) {
            this.sparks.push({
                sx: this.x + (Math.random() - 0.5) * this.radius * 0.8,
                sy: this.y + (Math.random() - 0.5) * this.radius * 0.8,
                vx: (Math.random() - 0.5) * 400,
                vy: (Math.random() - 0.5) * 400
            });
        }
        if (this.sparks.length > desiredSparks) this.sparks.length = desiredSparks;

        if (!sparksGraphics || this.sparks.length === 0) return;

        const alpha = this.battleCooldown < 1.5
            ? Math.max(0, this.battleCooldown / 1.5)
            : 1.0;

        for (const s of this.sparks) {
            s.sx += s.vx * dt;
            s.sy += s.vy * dt;

            // Rebote circular dentro del radio del nodo
            const sdx   = s.sx - this.x;
            const sdy   = s.sy - this.y;
            const sdist = Math.sqrt(sdx * sdx + sdy * sdy);
            if (sdist > this.radius * 0.9) {
                const nx  = sdx / sdist;
                const ny  = sdy / sdist;
                const dot = s.vx * nx + s.vy * ny;
                s.vx -= 2 * dot * nx;
                s.vy -= 2 * dot * ny;
                s.sx = this.x + nx * this.radius * 0.88;
                s.sy = this.y + ny * this.radius * 0.88;
            }

            // Caos eléctrico
            s.vx += (Math.random() - 0.5) * 1400 * dt;
            s.vy += (Math.random() - 0.5) * 1400 * dt;
            const spd = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
            if (spd > 450) { s.vx = (s.vx / spd) * 450; s.vy = (s.vy / spd) * 450; }

            // Línea corta (dirección de movimiento)
            const ex = s.sx - s.vx * 0.12;
            const ey = s.sy - s.vy * 0.12;
            sparksGraphics.moveTo(s.sx, s.sy).lineTo(ex, ey);
            sparksGraphics.stroke({ color: this.lastDominantColor, width: 2.5, alpha });

            // Punto central brillante
            sparksGraphics.circle(s.sx, s.sy, 1.5);
            sparksGraphics.fill({ color: 0xffffff, alpha });
        }
    }
}
