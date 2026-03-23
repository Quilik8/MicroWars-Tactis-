import { Unit } from '../entities/unit.js';
import { Node } from '../entities/node.js';
import { SpatialHashGrid } from '../core/logic_grid.js';
import { PIXI } from '../core/engine.js';
import { FACTIONS } from '../campaign/faction_data.js';
import { CombatManager } from './combat_manager.js';
import { PhysicsManager } from './physics_manager.js';

export class WorldManager {
    constructor(game, ui, config) {
        this.game = game;
        this.ui = ui;
        this.gridSize = config.gridCellSize || 30;
        this.grid = new SpatialHashGrid(1920, 1080, this.gridSize, 10000);

        this.allUnits = [];
        this.nodes = [];
        this.zones = [];
        this.travelingIds = [];
        this.neighbors = [];
        this.menuAnts = [];
        this.textures = {};

        this.combatInterval = config.combatInterval || 0.7;
        // FIX #8: dirty flag para evitar redibujar túneles en cada frame
        this._tunnelsDirty = true;
    }

    init(app) {
        // Inicializar texturas para todas las facciones base y premium
        FACTIONS.forEach(f => {
            this.textures[f.id] = this.makeTexture(app, f.color);
        });

        // ── ESTÉTICA CLÁSICA PARA "NIVELES" ──
        // (Azul Intenso y Rojo Sangre clásicos)
        this.textures.player = this.makeTexture(app, 0x3498db);
        this.textures.enemy = this.makeTexture(app, 0xe74c3c);
        this.textures.neutral = this.makeTexture(app, 0x95a5a6);

        this.zoneGraphics = new PIXI.Graphics();
        this.game.layerNodes.addChild(this.zoneGraphics);

        this.tunnelGraphics = new PIXI.Graphics();
        this.game.layerNodes.addChild(this.tunnelGraphics);

        // VFX: un único Graphics estático para artillería (dibujado cada frame desde layerVFX)
        this.vfxGraphics = new PIXI.Graphics();
        this.game.layerVFX.addChild(this.vfxGraphics);

        // Sparks: un único Graphics estático para chispas de batalla
        this.sparksGraphics = new PIXI.Graphics();
        this.game.layerVFX.addChild(this.sparksGraphics);
    }

    makeTexture(app, color) {
        const g = new PIXI.Graphics();
        // 1. Patas
        g.moveTo(1.5, -1.5); g.lineTo(7.5, -7.5);
        g.moveTo(1.5, 1.5); g.lineTo(7.5, 7.5);
        g.moveTo(0, -2.25); g.lineTo(0, -8.25);
        g.moveTo(0, 2.25); g.lineTo(0, 8.25);
        g.moveTo(-3, -1.5); g.lineTo(-8.25, -7.5);
        g.moveTo(-3, 1.5); g.lineTo(-8.25, 7.5);
        g.stroke({ color: 0x000000, alpha: 0.8, width: 1.5 });
        // 2. Antenas
        g.moveTo(6, -1.5); g.lineTo(9.75, -5.25);
        g.moveTo(6, 1.5); g.lineTo(9.75, 5.25);
        g.stroke({ color: color, alpha: 1, width: 1.2 });
        // 3. Cuerpo
        g.moveTo(-11, 0);
        g.bezierCurveTo(-11, -5.5, -3, -5.5, -2, -1.5);
        g.bezierCurveTo(-1, -3.5, 3, -3.5, 4, -1.5);
        g.bezierCurveTo(4.5, -3, 8, -3, 8.5, 0);
        g.bezierCurveTo(8, 3, 4.5, 3, 4, 1.5);
        g.bezierCurveTo(3, 3.5, -1, 3.5, -2, 1.5);
        g.bezierCurveTo(-3, 5.5, -11, 5.5, -11, 0);
        g.fill({ color });
        g.stroke({ color: 0x000000, alpha: 0.7, width: 1.2, alignment: 0 });

        return app.renderer.generateTexture(g);
    }

    attachSprite(unit) {
        const tex = this.textures[unit.faction] || this.textures.player || this.textures.neutral;
        if (!tex) {
            console.warn("No texture found for faction:", unit.faction);
            return;
        }
        const sprite = new PIXI.Sprite(tex);
        sprite.anchor.set(0.5);
        sprite.x = unit.x;
        sprite.y = unit.y;
        const baseScale = 0.8;
        const scaleFactor = (unit.power > 1) ? 1.5 : 1.0;
        sprite.scale.set(baseScale * scaleFactor);
        unit.sprite = sprite;
        this.game.layerUnits.addChild(sprite);
    }

    spawnUnitsAt(node, faction, count) {
        for (let i = 0; i < count; i++) {
            let u = new Unit(node.x + (Math.random() - 0.5) * node.radius, node.y + (Math.random() - 0.5) * node.radius, faction);
            u.targetNode = node;
            u.homeNode = node;
            u.state = 'idle';
            if (node.evolution === 'tanque') u.power = 3;
            this.attachSprite(u);
            this.allUnits.push(u);
        }
    }

    createNodeGfx(node) {
        node.gfx = new PIXI.Graphics();
        this.game.layerNodes.addChild(node.gfx);
        node.redraw();
    }

    spawnMenuAnts() {
        this.clearMenuAnts();
        let w = window.innerWidth;
        let h = window.innerHeight;
        const PER_FACTION = 400;
        const FACTIONS = ['player', 'enemy'];
        for (let f of FACTIONS) {
            for (let i = 0; i < PER_FACTION; i++) {
                let ant = {
                    x: Math.random() * w,
                    y: Math.random() * h,
                    angle: Math.random() * Math.PI * 2,
                    speed: 15 + Math.random() * 25,
                    wander: (Math.random() - 0.5) * 0.08,
                    faction: f,
                    sprite: null
                };
                const sprite = new PIXI.Sprite(this.textures[f]);
                sprite.anchor.set(0.5);
                sprite.x = ant.x;
                sprite.y = ant.y;
                sprite.alpha = 0.75;
                sprite.scale.set(0.9);
                this.game.layerMenu.addChild(sprite);
                ant.sprite = sprite;
                this.menuAnts.push(ant);
            }
        }
    }

    clearMenuAnts() {
        if (this.game.layerMenu) {
            this.game.layerMenu.removeChildren();
        }
        this.menuAnts = [];
    }

    clearLevel() {
        // Clear logic arrays
        this.allUnits.length = 0;
        this.travelingIds.length = 0;
        this.nodes.length = 0;
        this.zones.length = 0;
        this.grid.clear();

        // Clear Pixi layers safely
        if (this.game.layerUnits) {
            const children = this.game.layerUnits.removeChildren();
            for (let c of children) c.destroy({ children: true });
        }

        if (this.game.layerVFX) {
            const children = this.game.layerVFX.removeChildren();
            for (let c of children) c.destroy({ children: true });
        }

        if (this.game.layerNodes) {
            const children = this.game.layerNodes.removeChildren();
            for (let c of children) c.destroy({ children: true });

            // Re-create/Re-add graphics since they were children of layerNodes
            this.zoneGraphics = new PIXI.Graphics();
            this.game.layerNodes.addChild(this.zoneGraphics);
            
            this.tunnelGraphics = new PIXI.Graphics();
            this.game.layerNodes.addChild(this.tunnelGraphics);
        }

        // Re-crear VFX graphics tras limpiar layerVFX
        this.vfxGraphics = new PIXI.Graphics();
        if (this.game.layerVFX) this.game.layerVFX.addChild(this.vfxGraphics);

        this.sparksGraphics = new PIXI.Graphics();
        if (this.game.layerVFX) this.game.layerVFX.addChild(this.sparksGraphics);

        if (this.ui) this.ui.hideNodeTooltip();
        Node.clearPool();
    }

    drawZones() {
        if (!this.zoneGraphics) return;
        this.zoneGraphics.clear();
        
        for (let z of this.zones) {
            this.zoneGraphics.rect(
                z.x * this.game.width, 
                z.y * this.game.height, 
                z.width * this.game.width, 
                z.height * this.game.height
            );
            this.zoneGraphics.fill({ color: z.color, alpha: z.alpha || 0.3 });
        }
    }

    update(dt, gameState, isPaused, SFX) {
        if (gameState === 'MENU') {
            this.updateMenuAnts(dt);
            return;
        }

        if (gameState !== 'PLAYING' || isPaused) return;

        this.updateNodeCounts();
        PhysicsManager.updateGrid(this);
        PhysicsManager.updatePhysics(this, dt);
        this.processSimulation(dt, SFX);
        this.cleanupUnits();
    }

    updateMenuAnts(dt) {
        let w = window.innerWidth;
        let h = window.innerHeight;
        for (let a of this.menuAnts) {
            a.angle += a.wander + (Math.random() - 0.5) * 0.06;
            a.x += Math.cos(a.angle) * a.speed * dt;
            a.y += Math.sin(a.angle) * a.speed * dt;
            if (a.x < 0) { a.x = 0; a.angle = Math.PI - a.angle; }
            if (a.x > w) { a.x = w; a.angle = Math.PI - a.angle; }
            if (a.y < 0) { a.y = 0; a.angle = -a.angle; }
            if (a.y > h) { a.y = h; a.angle = -a.angle; }
            if (a.sprite) {
                a.sprite.x = a.x;
                a.sprite.y = a.y;
                a.sprite.rotation = a.angle;
            }
        }
    }

    updateNodeCounts() {
        // Reset selectivo: reutilizar los mismos objetos en vez de recrearlos cada frame.
        // Nota: Node.constructor solo inicializa `counts`. population y power se crean aquí
        // la primera vez (primer frame tras nivel cargado).
        for (let n of this.nodes) {
            // Garantizar que existen antes de iterar
            if (!n.population) n.population = {};
            if (!n.power)      n.power      = {};

            const c   = n.counts;
            const pop = n.population;
            const pw  = n.power;
            for (const k in c)   c[k]   = 0;
            for (const k in pop) pop[k] = 0;
            for (const k in pw)  pw[k]  = 0;
        }

        const CAPTURE_DIST_MULT = 2.5;

        for (let u of this.allUnits) {
            if (u.pendingRemoval || !u.targetNode) continue;

            const node = u.targetNode;
            const p    = u.power || 1;
            const f    = u.faction;

            const dx     = u.x - node.x;
            const dy     = u.y - node.y;
            const distSq = dx * dx + dy * dy;
            const capSq  = (node.radius * CAPTURE_DIST_MULT) * (node.radius * CAPTURE_DIST_MULT);

            if (u.state === 'idle' || distSq < capSq) {
                // Inicializar la clave solo la primera vez que aparece en este nodo
                if (node.counts[f] === undefined) {
                    node.counts[f]     = 0;
                    node.population[f] = 0;
                    node.power[f]      = 0;
                }
                node.counts[f]++;
                node.population[f] += p;
                node.power[f]      += p;
            }
        }
    }



    processSimulation(dt, SFX) {
        PhysicsManager.processArrivals(this);
        PhysicsManager.drawTunnels(this);

        // Limpiar VFX graphics al inicio de cada frame (se redibujarán en node.update)
        if (this.vfxGraphics) this.vfxGraphics.clear();
        if (this.sparksGraphics) this.sparksGraphics.clear();

        let hoveredNode = null;
        for (let i = 0; i < this.nodes.length; i++) {
            CombatManager.processCombat(this, i, dt, SFX);
            this.processRegen(i, dt);
            // Pasar los Graphics estáticos a node.update para que acumule sus dibujos
            this.nodes[i].update(dt, this.grid, this.allUnits, this.vfxGraphics, this.sparksGraphics, SFX);

            if (this.nodes[i].hovered) hoveredNode = this.nodes[i];
        }

        if (hoveredNode) {
            this.updateNodeTooltip(hoveredNode);
        } else {
            if (this.ui) this.ui.hideNodeTooltip();
        }
    }

    updateNodeTooltip(node) {
        if (this.ui) this.ui.showNodeTooltip(node);
    }





    processRegen(nodeIdx, dt) {
        let node = this.nodes[nodeIdx];
        if (node.owner === 'neutral' || node.type === 'tunel') return;

        let faction = node.owner;
        if (node.population[faction] >= node.maxUnits) return;
        if (this.allUnits.length >= 3000) return;

        node.regenTimer += dt;
        let interval = node.regenInterval;
        if (node.evolution === 'tanque') interval *= 1.5;

        if (node.regenTimer >= interval) {
            node.regenTimer = 0;
            let angle = Math.random() * Math.PI * 2;
            let r = Math.random() * node.radius * 0.7;
            let u = new Unit(node.x + Math.cos(angle) * r, node.y + Math.sin(angle) * r, faction);
            if (node.evolution === 'tanque') u.power = 3;

            // Logística automática si hay un túnel (no de transporte) que no sea del tipo 'tunel'
            if (node.tunnelTo && node.tunnelTo.owner === node.owner && node.type !== 'tunel') {
                u.targetNode = node.tunnelTo;
                u.homeNode = node;
                u.state = 'traveling';
                u.speedMult = 2.0;
            } else {
                u.targetNode = node; u.homeNode = node;
                u.state = 'idle'; u.speedMult = 1.0;
            }
            this.attachSprite(u);
            this.allUnits.push(u);
        }
    }



    cleanupUnits() {
        // BUGFIX #6: Array.splice() es O(n) por elemento → O(n²) total.
        // Swap-and-pop es O(1): intercambia el elemento con el último y hace pop().
        // Nota: el orden del array no importa para la simulación.
        let i = this.allUnits.length - 1;
        while (i >= 0) {
            if (this.allUnits[i].pendingRemoval) {
                this.allUnits[i].destroy();
                const last = this.allUnits.length - 1;
                if (i !== last) {
                    this.allUnits[i] = this.allUnits[last];
                }
                this.allUnits.pop();
            }
            i--;
        }
    }

    // UTILITIES
    countAt(node, faction) { return node.counts ? (node.counts[faction] || 0) : 0; }
    popAt(node, faction) { return node.population ? (node.population[faction] || 0) : 0; }
    powerAt(node, faction) { return node.power ? (node.power[faction] || 0) : 0; }

    sendTroops(fromNode, toNode, percent, faction = 'player') {
        // Loop directo sin filter() para evitar allocations en cada interacción
        let eligible = 0;
        for (let u of this.allUnits) {
            if (u.faction === faction && !u.pendingRemoval &&
                u.targetNode === fromNode && u.state === 'idle') eligible++;
        }

        let count = (percent >= 0.99) ? eligible : Math.floor(eligible * percent);
        if (count < 1 && eligible > 0 && percent > 0) count = 1;
        if (count === 0) return;

        let sent = 0;
        for (let u of this.allUnits) {
            if (sent >= count) break;
            if (u.faction === faction && !u.pendingRemoval &&
                u.targetNode === fromNode && u.state === 'idle') {
                u.targetNode = toNode;
                u.state      = 'traveling';
                u.speedMult  = 1.0;
                sent++;
            }
        }
    }

    recallToHome(targetNode, faction = 'player') {
        for (let u of this.allUnits) {
            if (u.faction === faction && u.targetNode === targetNode) {
                if (u.homeNode && u.homeNode !== targetNode) {
                    u.targetNode = u.homeNode;
                    u.state = 'traveling';
                }
            }
        }
    }
}
