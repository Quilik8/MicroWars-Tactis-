/**
 * Clase Node — Nodo táctico del mapa (PixiJS / WebGL)
 */
import * as PIXI from 'pixi.js';
import { NodeRenderer } from './node_renderer.js';

export class Node {
    static bulletPool = [];

    static getBullet(layer) {
        let b = null;
        while (this.bulletPool.length > 0) {
            b = this.bulletPool.pop();
            if (b && !b.destroyed) break;
            b = null;
        }

        if (!b) {
            b = new PIXI.Graphics();
            if (layer) layer.addChild(b);
        }
        return b;
    }

    static recycleBullet(b) {
        if (!b || b.destroyed) return;
        b.clear();
        b.visible = false;
        this.bulletPool.push(b);
    }

    static clearPool() {
        this.bulletPool = [];
    }

    constructor(x, y, owner, type = 'normal') {
        this.x = x;
        this.y = y;
        this.owner = owner;
        this.type = type;

        let stats = Node.TYPES[type] || Node.TYPES['normal'];
        this.radius = stats.radius;
        this.maxUnits = stats.maxUnits;
        this.regenInterval = stats.regenInterval;

        // Propiedades de movilidad orbital
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
        this.tunnelTo = null;
        this.counts = { player: 0, enemy: 0, neutral: 0 };

        // ── Evolución ──
        // null | 'espinoso' | 'artilleria' | 'tanque'
        this.evolution = null;

        // Artillería: temporizadores y parámetros
        this.artilleryTimer = 0;
        this.artilleryInterval = 2.5; // segundos entre disparos
        this.artilleryRange = 180;    // radio de detección de enemigos
        this.regenTimer = 0;
        this.combatTimer = 0;

        // BUGFIX #7: timer para el flash visual (reemplaza setTimeout)
        this.flashTimer = 0;
        this.flashColor = 0xffffff; // color al que volver al terminar el flash
        this.flashTargetColor = null; // null = sin flash activo

        // Animación de Chispas (Combat sparks)
        this.sparks = []; 
        this.battleCooldown = 0;
        this.lastDominantColor = 0xffffff;
        this.lastSparkIntensity = 0;

        // Conquista Visual (Anillo)
        this.conquestProgress = 0; // 0.0 a 1.0
        this.conqueringFaction = null;

        // Gráficos PixiJS
        this.gfx = null;
    }

    static TYPES = {
        normal: { radius: 25, maxUnits: 200, regenInterval: 1.0 },
        enjambre: { radius: 35, maxUnits: 300, regenInterval: 0.5 },
        gigante: { radius: 60, maxUnits: 500, regenInterval: 1.25 },
        tunel: { radius: 35, maxUnits: 0, regenInterval: 9999 } // Transport tunnel
    };

    static COLORS = {
        player: { fill: 0x3498db, stroke: 0x2980b9, accent: 0x85c1e9, name: "Azul" }, // Azul
        enemy: { fill: 0xe74c3c, stroke: 0xc0392b, accent: 0xf1948a, name: "Rojo" },  // Rojo
        neutral: { fill: 0x95a5a6, stroke: 0x7f8c8d, name: "Neutral" },
        fuego: { fill: 0xd35400, stroke: 0xa04000, accent: 0xe59866, name: "Naranja" }, // Naranja
        carpinteras: { fill: 0x5dade2, stroke: 0x2874a6, accent: 0x85c1e9, name: "Celeste" },
        negras: { fill: 0x566573, stroke: 0x273746, name: "Gris oscuro" },
        bala: { fill: 0x111111, stroke: 0x000000, name: "Negro" },
        tejedoras: { fill: 0x2ecc71, stroke: 0x27ae60, accent: 0x82e0aa, name: "Verde" },
        // Legacy support por si usan ID mostaza
        mostaza: { fill: 0xf39c12, stroke: 0xd68910, accent: 0xf8c471, name: "Mostaza" } 
    };

    static EVOLUTION_COLORS = {
        espinoso: { accent: 0x27ae60, symbol: '🌵' },
        artilleria: { accent: 0xf39c12, symbol: '🔫' },
        tanque: { accent: 0x8e44ad, symbol: '🛡️' },
    };

    static EVOLUTION_COSTS = {
        espinoso: 30,
        artilleria: 40,
        tanque: 35,
    };

    /** Dibuja el nodo en su PIXI.Graphics — se llama cuando cambia estado */
    redraw(factionData = null) {
        NodeRenderer.redraw(this, factionData);
    }

    /** Tooltip al pasar el mouse */
    drawTooltip(ctx) {
        NodeRenderer.drawTooltip(this, ctx);
    }

    containsPoint(mx, my) {
        let dx = mx - this.x;
        let dy = my - this.y;
        return dx * dx + dy * dy <= this.radius * this.radius;
    }

    update(dt, grid, allUnits, layerNodes, sfx) {
        if (this.owner === 'neutral') return;

        // BUGFIX #7: gestionar flash visual dentro del game loop (reemplaza setTimeout)
        if (this.flashTimer > 0) {
            this.flashTimer -= dt;
            if (this.flashTimer <= 0) {
                this.flashTimer = 0;
                if (this.gfx && !this.gfx.destroyed) this.gfx.tint = 0xffffff;
            }
        }

        // 1. ESPINOSO: Daño pasivo al enjambre enemigo cercano
        if (this.evolution === 'espinoso') {
            const espinosoRange = this.radius + (this.artilleryRange * 0.25);
            const neighbors = [];
            grid.findNear(this.x, this.y, espinosoRange, neighbors);

            // Daño basado en tiempo: 2.4 unidades por segundo aprox (antes 4% en 60fps)
            const killProbability = 2.4 * dt;

            for (let idx of neighbors) {
                let u = allUnits[idx];
                if (u && u.faction !== this.owner && !u.pendingRemoval) {
                    let distSq = Math.pow(u.x - this.x, 2) + Math.pow(u.y - this.y, 2);
                    if (distSq < espinosoRange * espinosoRange && distSq > this.radius * this.radius && Math.random() < killProbability) {
                        u.pendingRemoval = true;
                        // Flash rojo sin setTimeout
                        if (this.gfx && !this.gfx.destroyed && this.flashTimer <= 0) {
                            this.gfx.tint = 0xff6666;
                            this.flashTimer = 0.15;
                        }
                    }
                }
            }
        }

        // 2. ARTILLERÍA: Disparo automático con rastro visual
        if (this.evolution === 'artilleria') {
            this.artilleryTimer += dt;
            if (this.artilleryTimer >= this.artilleryInterval) {
                this.artilleryTimer = 0;

                const neighbors = [];
                grid.findNear(this.x, this.y, this.artilleryRange, neighbors);
                let targets = [];
                for (let idx of neighbors) {
                    let u = allUnits[idx];
                    if (u && u.faction !== this.owner && !u.pendingRemoval) {
                        let distSq = Math.pow(u.x - this.x, 2) + Math.pow(u.y - this.y, 2);
                        if (distSq < this.artilleryRange * this.artilleryRange && distSq > this.radius * this.radius) {
                            targets.push(u);
                        }
                    }
                }

                if (targets.length > 0) {
                    let toKill = Math.min(targets.length, 5);
                    for (let i = 0; i < toKill; i++) {
                        let u = targets[i];
                        u.pendingRemoval = true;

                        // Rastro visual con Pool de Objetos (el bullet se recicla via timer en el proximo disparo)
                        const bullet = Node.getBullet(layerNodes);
                        if (!bullet || bullet.destroyed) continue;
                        bullet.clear();
                        bullet.moveTo(this.x, this.y).lineTo(u.x, u.y);
                        bullet.stroke({ color: 0xffffff, width: 2, alpha: 0.8 });
                        bullet.visible = true;

                        // Usar un campo expiry en el bullet en lugar de setTimeout
                        bullet._expiryTimer = 0.1;
                    }
                    // Flash amarillo sin setTimeout
                    if (this.gfx && !this.gfx.destroyed) {
                        this.gfx.tint = 0xffdd44;
                        this.flashTimer = 0.1;
                    }
                    if (sfx) sfx.shoot();
                }
            }

            // Tick de expiry para bullets activos (gestiona reciclado dentro del game loop)
            if (layerNodes) {
                for (let i = layerNodes.children.length - 1; i >= 0; i--) {
                    const child = layerNodes.children[i];
                    if (child._expiryTimer !== undefined && child._expiryTimer > 0) {
                        child._expiryTimer -= dt;
                        if (child._expiryTimer <= 0) {
                            child._expiryTimer = 0;
                            Node.recycleBullet(child);
                        }
                    }
                }
            }
        }

        // 3. INDICADOR VISUAL DE COMBATE INTERNO (Micro-chispas persistentes)
        if (this.gfx && !this.gfx.destroyed) {
            let activeFactions = Object.keys(this.counts).filter(f => this.counts[f] > 0);
            let underAttack = false;
            let attackers = 0;
            let dominantFaction = null;

            if (activeFactions.length > 1 || (activeFactions.length === 1 && activeFactions[0] !== this.owner)) {
                underAttack = true;
                let maxCount = -1;
                for (let f of activeFactions) {
                    if (this.counts[f] > maxCount) {
                        maxCount = this.counts[f];
                        dominantFaction = f;
                    }
                }
                attackers = maxCount;
            }

            if (underAttack) {
                this.battleCooldown = 3.0; // Persistir 3 segundos tras la batalla
                if (dominantFaction && Node.COLORS[dominantFaction]) {
                    this.lastDominantColor = Node.COLORS[dominantFaction].fill;
                }
                this.lastSparkIntensity = attackers > 100 ? 15 : (attackers > 30 ? 10 : 5);
            } else {
                if (this.battleCooldown > 0) {
                    this.battleCooldown -= dt;
                } else {
                    this.lastSparkIntensity = 0;
                }
            }

            let desiredSparks = this.battleCooldown > 0 ? this.lastSparkIntensity : 0;

            // Instanciar chispas si faltan
            while (this.sparks.length < desiredSparks) {
                const spark = Node.getBullet(layerNodes);
                if (!spark) break;
                spark.visible = true;
                spark._sx = this.x + (Math.random() - 0.5) * this.radius * 0.8;
                spark._sy = this.y + (Math.random() - 0.5) * this.radius * 0.8;
                spark._vx = (Math.random() - 0.5) * 200;
                spark._vy = (Math.random() - 0.5) * 200;
                this.sparks.push(spark);
            }

            // Limpiar chispas si ya no hay batalla ni cooldown
            if (desiredSparks === 0 && this.sparks.length > 0) {
                for (const spark of this.sparks) {
                    Node.recycleBullet(spark);
                }
                this.sparks = [];
            }

            // Actualizar físicas y dibujo de chispas vivas
            for (let i = this.sparks.length - 1; i >= 0; i--) {
                let spark = this.sparks[i];
                if (spark.destroyed) {
                    this.sparks.splice(i, 1);
                    continue;
                }

                spark._sx += spark._vx * dt;
                spark._sy += spark._vy * dt;

                // Rebote circular dentro del nodo
                let dx = spark._sx - this.x;
                let dy = spark._sy - this.y;
                let dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > this.radius * 0.9) {
                    let nx = dx / dist;
                    let ny = dy / dist;
                    let dot = spark._vx * nx + spark._vy * ny;
                    spark._vx -= 2 * dot * nx;
                    spark._vy -= 2 * dot * ny;
                    spark._sx = this.x + nx * this.radius * 0.89;
                    spark._sy = this.y + ny * this.radius * 0.89;
                }

                // Movimiento caótico (electricidad)
                spark._vx += (Math.random() - 0.5) * 800 * dt;
                spark._vy += (Math.random() - 0.5) * 800 * dt;

                let speed = Math.sqrt(spark._vx * spark._vx + spark._vy * spark._vy);
                if (speed > 250) {
                    spark._vx = (spark._vx / speed) * 250;
                    spark._vy = (spark._vy / speed) * 250;
                }

                // Fade out el último segundo
                let alpha = 0.95;
                if (this.battleCooldown < 1.0) alpha = 0.95 * this.battleCooldown;

                spark.clear();
                spark.moveTo(spark._sx, spark._sy);
                spark.lineTo(spark._sx - spark._vx * 0.05, spark._sy - spark._vy * 0.05);

                // Todas adoptan el color ganador instantáneamente
                spark.stroke({ color: this.lastDominantColor, width: 2.5, alpha: alpha });
            }
        }
    }
}
