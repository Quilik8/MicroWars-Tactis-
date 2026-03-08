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

        // Gráficos PixiJS
        this.gfx = null;
    }

    static TYPES = {
        normal: { radius: 25, maxUnits: 200, regenInterval: 1.0 },
        enjambre: { radius: 35, maxUnits: 300, regenInterval: 0.5 },
        gigante: { radius: 60, maxUnits: 500, regenInterval: 1.25 }
    };

    static COLORS = {
        player: { fill: 0x1a5276, stroke: 0x3498db, glow: 0x3498db, alpha: 0.35 },
        enemy: { fill: 0x6e2c21, stroke: 0xe74c3c, glow: 0xe74c3c, alpha: 0.35 },
        neutral: { fill: 0x2c3e50, stroke: 0x7f8c8d, glow: 0x7f8c8d, alpha: 0.20 },
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
    redraw() {
        if (!this.gfx || this.gfx.destroyed) return;
        const c = Node.COLORS[this.owner];
        const r = this.radius;
        const g = this.gfx;
        const ev = this.evolution ? Node.EVOLUTION_COLORS[this.evolution] : null;

        g.clear();

        // Halo exterior (glow suave)
        g.circle(this.x, this.y, r + 6);
        g.stroke({ color: ev ? ev.accent : c.glow, alpha: 0.3, width: 10 });

        // Relleno del nodo
        g.circle(this.x, this.y, r);
        g.fill({ color: c.fill, alpha: c.alpha });

        // ── Visual diferenciado por evolución ──
        if (this.evolution === 'espinoso') {
            // Anillo verde espinoso (Espinas mucho más finas y abundantes)
            const numSpikes = 30;
            for (let i = 0; i < numSpikes; i++) {
                const ang = (i / numSpikes) * Math.PI * 2;
                const rx = this.x + Math.cos(ang) * (r + 4);
                const ry = this.y + Math.sin(ang) * (r + 4);
                const rx2 = this.x + Math.cos(ang) * (r + 22);
                const ry2 = this.y + Math.sin(ang) * (r + 22);
                g.moveTo(rx, ry);
                g.lineTo(rx2, ry2);
            }
            g.stroke({ color: 0x27ae60, alpha: 0.9, width: 1.2 });
        } else if (this.evolution === 'artilleria') {
            // Cruz dorada
            g.moveTo(this.x - r * 0.5, this.y);
            g.lineTo(this.x + r * 0.5, this.y);
            g.moveTo(this.x, this.y - r * 0.5);
            g.lineTo(this.x, this.y + r * 0.5);
            g.stroke({ color: 0xf39c12, alpha: 0.9, width: 3 });
            // Círculo de rango (tenue)
            g.circle(this.x, this.y, this.artilleryRange);
            g.stroke({ color: 0xf39c12, alpha: 0.08, width: 1 });
        } else if (this.evolution === 'tanque') {
            // Círculo interior morado (indica tanques)
            g.circle(this.x, this.y, r * 0.5);
            g.fill({ color: 0x8e44ad, alpha: 0.5 });
        }

        // Anillo de selección
        if (this.isSelected) {
            g.circle(this.x, this.y, r + 10);
            g.stroke({ color: 0xffffff, alpha: 0.9, width: 2 });
        }

        // Anillo de evolución disponible (solo nodos propios sin evolución)
        if (!this.evolution && this.owner === 'player') {
            g.circle(this.x, this.y, r + 2);
            g.stroke({ color: c.stroke, alpha: 0.5, width: 1 });
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

        // 1. ESPINOSO: Daño pasivo al enjambre enemigo cercano
        if (this.evolution === 'espinoso') {
            const neighbors = [];
            grid.findNear(this.x, this.y, this.radius + 15, neighbors);
            for (let idx of neighbors) {
                let u = allUnits[idx];
                if (u && u.faction !== this.owner && !u.pendingRemoval) {
                    if (Math.random() < 0.04) { // 4% chance por frame de morir al tocar espinas
                        u.pendingRemoval = true;
                        if (this.gfx && !this.gfx.destroyed) {
                            this.gfx.tint = 0xff6666;
                            setTimeout(() => { if (this.gfx && !this.gfx.destroyed) this.gfx.tint = 0xffffff; }, 150);
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

                        // Rastro visual (pool de objetos pendiente)
                        // Rastro visual con Pool de Objetos
                        const bullet = Node.getBullet(layerNodes);
                        if (!bullet || bullet.destroyed) continue;
                        bullet.clear();
                        bullet.moveTo(this.x, this.y).lineTo(u.x, u.y);
                        bullet.stroke({ color: 0xffffff, width: 2, alpha: 0.8 });
                        bullet.visible = true;

                        setTimeout(() => {
                            if (bullet && !bullet.destroyed) {
                                bullet.visible = false;
                                Node.recycleBullet(bullet);
                            }
                        }, 100);
                    }
                    if (this.gfx && !this.gfx.destroyed) {
                        this.gfx.tint = 0xffdd44;
                        setTimeout(() => { if (this.gfx && !this.gfx.destroyed) this.gfx.tint = 0xffffff; }, 100);
                    }
                    if (sfx) sfx.shoot();
                }
            }
        }
    }
}
