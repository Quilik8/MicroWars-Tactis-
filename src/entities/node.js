/**
 * Clase Node — Nodo táctico del mapa (PixiJS / WebGL)
 * Soporta evolución (espinoso, artillería, tanque) y menú radial.
 */
import * as PIXI from 'pixi.js';

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

        // Gráficos PixiJS
        this.gfx = null;
    }

    static TYPES = {
        normal: { radius: 25, maxUnits: 200, regenInterval: 1.0 },
        enjambre: { radius: 35, maxUnits: 300, regenInterval: 0.5 },
        gigante: { radius: 60, maxUnits: 500, regenInterval: 1.25 }
    };

    static COLORS = {
        player: { fill: 0x2e86c1, stroke: 0x5dade2, glow: 0x3498db, alpha: 0.50 },
        enemy: { fill: 0x922b21, stroke: 0xe74c3c, glow: 0xe74c3c, alpha: 0.50 },
        neutral: { fill: 0x4d5656, stroke: 0x95a5a6, glow: 0x95a5a6, alpha: 0.35 },
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
        if (!this.gfx || this.gfx.destroyed) return;

        // 1. Determinar esquema de colores
        const c = Node.COLORS[this.owner] || Node.COLORS.neutral;

        let fill = factionData ? factionData.color : c.fill;
        let stroke = factionData ? 0xffffff : c.stroke;
        let alpha = factionData ? 0.45 : c.alpha;
        let glow = factionData ? factionData.color : (c.glow || fill);

        const r = this.radius;
        const g = this.gfx;
        g.clear();

        // ── Capas de Renderizado ──

        // A. Halo exterior (glow reactivo)
        const ev = this.evolution ? Node.EVOLUTION_COLORS[this.evolution] : null;
        g.circle(this.x, this.y, r + 6);
        g.stroke({ color: ev ? ev.accent : glow, alpha: 0.25, width: 8 });

        // B. Cuerpo principal
        g.circle(this.x, this.y, r);
        g.fill({ color: fill, alpha: alpha });
        g.stroke({ color: stroke, alpha: 0.5, width: 2.5 });

        // ── Evoluciones Visuales ──
        if (this.evolution === 'espinoso') {
            const numSpikes = 26;
            for (let i = 0; i < numSpikes; i++) {
                const ang = (i / numSpikes) * Math.PI * 2;
                const rx = this.x + Math.cos(ang) * (r + 4);
                const ry = this.y + Math.sin(ang) * (r + 4);
                const rx2 = this.x + Math.cos(ang) * (r + 18);
                const ry2 = this.y + Math.sin(ang) * (r + 18);
                g.moveTo(rx, ry).lineTo(rx2, ry2);
            }
            g.stroke({ color: 0x27ae60, alpha: 0.8, width: 1.5 });
        } else if (this.evolution === 'artilleria') {
            g.moveTo(this.x - r * 0.4, this.y).lineTo(this.x + r * 0.4, this.y);
            g.moveTo(this.x, this.y - r * 0.4).lineTo(this.x, this.y + r * 0.4);
            g.stroke({ color: 0xf39c12, alpha: 0.9, width: 4 });
            g.circle(this.x, this.y, this.artilleryRange);
            g.stroke({ color: 0xf39c12, alpha: 0.1, width: 1 });
        } else if (this.evolution === 'tanque') {
            g.circle(this.x, this.y, r * 0.6);
            g.fill({ color: 0x8e44ad, alpha: 0.4 });
            g.stroke({ color: 0xffffff, alpha: 0.3, width: 1 });
        }

        // C. Indicadores de Estado
        if (this.isSelected) {
            g.circle(this.x, this.y, r + 10);
            g.stroke({ color: 0xffffff, alpha: 1, width: 2.5 });
        }

        if (!this.evolution && this.owner === 'player') {
            g.circle(this.x, this.y, r + 2);
            g.stroke({ color: 0xffffff, alpha: 0.2, width: 1 });
        }
    }

    /** Tooltip al pasar el mouse */
    drawTooltip(ctx, playerCount, enemyCount, neutralCount) {
        if (!this.hovered) return;

        let total = playerCount + enemyCount + neutralCount;
        let evLabel = this.evolution ? `Evo: ${this.evolution.toUpperCase()}` : 'Sin evolución';
        let lines = [
            `[${this.type.toUpperCase()}]`,
            evLabel,
            `Dueño:  ${this.owner}`,
            `Límite: ${total} / ${this.maxUnits}`,
            `---`,
            `Azules: ${playerCount}`,
            `Rojos:  ${enemyCount}`,
        ];

        let px = this.x + this.radius + 12;
        let py = this.y - 55;
        let lh = 14;
        let padX = 8, padY = 6;
        let width = 150;
        let height = lines.length * lh + padY * 2;

        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.beginPath();
        ctx.roundRect(px - padX, py - padY, width, height, 4);
        ctx.fill();

        ctx.fillStyle = '#eee';
        ctx.font = '11px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], px, py + i * lh);
        }
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
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
            const neighbors = [];
            grid.findNear(this.x, this.y, this.radius + 15, neighbors);

            // Daño basado en tiempo: 2.4 unidades por segundo aprox (antes 4% en 60fps)
            const killProbability = 2.4 * dt;

            for (let idx of neighbors) {
                let u = allUnits[idx];
                if (u && u.faction !== this.owner && !u.pendingRemoval) {
                    if (Math.random() < killProbability) {
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
                        if (distSq < this.artilleryRange * this.artilleryRange) {
                            targets.push(u);
                        }
                    }
                }

                if (targets.length > 0) {
                    let toKill = Math.min(targets.length, 8);
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
    }
}
