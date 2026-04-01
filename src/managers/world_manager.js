import { Unit } from '../entities/unit.js';
import { Node } from '../entities/node.js';
import { SpatialHashGrid } from '../core/logic_grid.js';
import { PIXI } from '../core/engine.js';
import { FACTIONS } from '../campaign/faction_data.js';
import { CombatManager } from './combat_manager.js';
import { PhysicsManager } from './physics_manager.js';
import { NavigationSystem } from '../navigation/navigation_system.js';
import { getNodeSeed, hashStringSeed, mixSeeds, placeUnitInCircle } from '../simulation/deterministic_layout.js';

export class WorldManager {
    constructor(game, ui, config) {
        this.game = game;
        this.ui = ui;
        this.gridSize = config.gridCellSize || 30;
        this.grid = new SpatialHashGrid(1920, 1080, this.gridSize, 10000);
        this.unitBaseSpeed = 75;
        this.simTime = 0;

        this.allUnits = [];
        this.nodes = [];
        this.zones = [];
        this.hazards = [];
        this.travelingIds = [];
        this.neighbors = [];
        this.menuAnts = [];
        this.textures = {};
        this.unitSequence = 1;

        // Marea Barriente — instancias WaterSweep del nivel actual.
        // Cada instancia gestiona su propio PIXI.Graphics en el layerVFX,
        // así la barra se mueve con el mundo igual que nodos y unidades.
        this.waterSweeps = [];

        // Rayo de Luz — instancias LightSweep del nivel actual (Nivel 8).
        this.lightSweeps = [];

        // Barreras de Bloqueo (Nivel 9) — rectángulos AABB que las hormigas
        // no pueden atravesar, salvo si van dentro de un nodo móvil (ferry).
        this.barriers = [];

        // Barreras Intermitentes (Nivel 11)
        this.intermittentBarriers = [];

        this.combatInterval = config.combatInterval || 0.7;
        this._tunnelsDirty = true;
        this.navigation = new NavigationSystem({ baseSpeedPxSec: this.unitBaseSpeed });

        // Punto de reunión del menú principal
        // Se activa con setMenuGather(x, y); las hormigas cercanas
        // se acercan y orbitan el punto durante GATHER_DURATION segundos.
        this.menuGatherPoint = null; // { x, y, timer, orbitAngles[] }
        this._GATHER_RADIUS   = 160; // px — radio de atracción
        this._GATHER_ORBIT    = 45;  // px — radio de órbita final
        this._GATHER_DURATION = 4.0; // s — tiempo hasta disolver
    }

    init(app) {
        FACTIONS.forEach(f => {
            this.textures[f.id] = this.makeTexture(app, f.color);
        });

        this.textures.player  = this.makeTexture(app, 0x3498db);
        this.textures.enemy   = this.makeTexture(app, 0xe74c3c);
        this.textures.neutral = this.makeTexture(app, 0x95a5a6);

        this.zoneGraphics = new PIXI.Graphics();
        this.game.layerNodes.addChild(this.zoneGraphics);

        this.hazardGraphics = new PIXI.Graphics();
        this.game.layerNodes.addChild(this.hazardGraphics);

        this.tunnelGraphics = new PIXI.Graphics();
        this.game.layerNodes.addChild(this.tunnelGraphics);

        this.vfxGraphics = new PIXI.Graphics();
        this.game.layerVFX.addChild(this.vfxGraphics);

        this.sparksGraphics = new PIXI.Graphics();
        this.game.layerVFX.addChild(this.sparksGraphics);
    }

    makeTexture(app, color) {
        const g = new PIXI.Graphics();
        g.moveTo(1.5, -1.5); g.lineTo(7.5, -7.5);
        g.moveTo(1.5,  1.5); g.lineTo(7.5,  7.5);
        g.moveTo(0, -2.25);  g.lineTo(0, -8.25);
        g.moveTo(0,  2.25);  g.lineTo(0,  8.25);
        g.moveTo(-3, -1.5);  g.lineTo(-8.25, -7.5);
        g.moveTo(-3,  1.5);  g.lineTo(-8.25,  7.5);
        g.stroke({ color: 0x000000, alpha: 0.8, width: 1.5 });
        g.moveTo(6, -1.5); g.lineTo(9.75, -5.25);
        g.moveTo(6,  1.5); g.lineTo(9.75,  5.25);
        g.stroke({ color: color, alpha: 1, width: 1.2 });
        g.moveTo(-11, 0);
        g.bezierCurveTo(-11, -5.5,  -3, -5.5, -2, -1.5);
        g.bezierCurveTo(-1,  -3.5,   3, -3.5,  4, -1.5);
        g.bezierCurveTo( 4.5,-3,     8, -3,   8.5,  0);
        g.bezierCurveTo( 8,   3,   4.5,  3,    4,   1.5);
        g.bezierCurveTo( 3,   3.5, -1,   3.5, -2,   1.5);
        g.bezierCurveTo(-3,   5.5,-11,   5.5,-11,   0);
        g.fill({ color });
        g.stroke({ color: 0x000000, alpha: 0.7, width: 1.2, alignment: 0 });
        return app.renderer.generateTexture(g);
    }

    attachSprite(unit) {
        const tex = this.textures[unit.faction] || this.textures.player || this.textures.neutral;
        if (!tex) { console.warn("No texture found for faction:", unit.faction); return; }
        const sprite = new PIXI.Sprite(tex);
        sprite.anchor.set(0.5);
        sprite.x = unit.x;
        sprite.y = unit.y;
        const baseScale   = 0.8;
        const scaleFactor = (unit.power > 1) ? 1.5 : 1.0;
        sprite.scale.set(baseScale * scaleFactor);
        unit.sprite = sprite;
        this.game.layerUnits.addChild(sprite);
    }

    nextUnitSeed(node = null, faction = '') {
        this.unitSequence = (this.unitSequence + 1) >>> 0;
        return mixSeeds(
            this.unitSequence,
            (node ? getNodeSeed(node) : 0) ^ (faction ? hashStringSeed(faction) : 0)
        );
    }

    positionUnitInNode(unit, node, radiusScale = 0.7, salt = 0) {
        if (!unit || !node) return;
        const baseSeed = mixSeeds(
            unit.deterministicSeed != null ? unit.deterministicSeed : this.nextUnitSeed(node, unit.faction),
            salt >>> 0
        );
        placeUnitInCircle(unit, node.x, node.y, node.radius, baseSeed, radiusScale);
    }

    spawnUnitsAt(node, faction, count) {
        for (let i = 0; i < count; i++) {
            const seed = this.nextUnitSeed(node, faction);
            let u = new Unit(
                node.x,
                node.y,
                faction,
                seed
            );
            this.positionUnitInNode(u, node, 1.0, i + 1);
            u.targetNode = node;
            u.homeNode   = node;
            u.state      = 'idle';
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
        const w = window.innerWidth;
        const h = window.innerHeight;
        const PER_FACTION = 400;
        const FACTIONS_MENU = ['player', 'enemy'];
        for (let f of FACTIONS_MENU) {
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
        if (this.game.layerMenu) this.game.layerMenu.removeChildren();
        this.menuAnts = [];
        this.menuGatherPoint = null;
    }

    // Activa el punto de reunión en (x, y).
    // Las hormigas en radio _GATHER_RADIUS se atraen y orbitan el punto (remolino interactivo).
    setMenuGather(x, y) {
        const orbitAngles = [];
        const orbitRadiuses = [];
        const orbitSpeeds = [];

        for (let i = 0; i < this.menuAnts.length; i++) {
            const a = this.menuAnts[i];
            const dx = a.x - x, dy = a.y - y;
            // Solo ~50% de las hormigas en rango se sienten atraídas para que no vayan todas
            if (dx * dx + dy * dy < this._GATHER_RADIUS * this._GATHER_RADIUS && Math.random() < 0.5) {
                orbitAngles[i] = Math.atan2(dy, dx);
                // Radio y velocidad aleatorios para simular el remolino de un nodo real
                orbitRadiuses[i] = Math.random() * this._GATHER_ORBIT;
                orbitSpeeds[i] = (0.8 + Math.random() * 2.0) * (Math.random() < 0.5 ? 1 : -1);
            } else {
                orbitAngles[i]   = null;
                orbitRadiuses[i] = null;
                orbitSpeeds[i]   = null;
            }
        }
        this.menuGatherPoint = { x, y, timer: this._GATHER_DURATION, orbitAngles, orbitRadiuses, orbitSpeeds };
    }

    clearLevel() {
        this.simTime = 0;
        if (this.navigation) this.navigation.clear();
        if (this.grid) this.grid.setSurfaceStore(null);

        // Destruir los PIXI.Graphics de las mareas antes de limpiar el array
        for (let sweep of this.waterSweeps) {
            if (sweep.destroy) sweep.destroy();
        }
        this.waterSweeps = [];

        // Destruir los PIXI.Graphics de los rayos de luz
        for (let sweep of this.lightSweeps) {
            if (sweep.destroy) sweep.destroy();
        }
        this.lightSweeps = [];

        // Barreras de bloqueo — los Graphics se limpian en layerNodes.removeChildren()
        this.barriers = [];

        for (let ib of this.intermittentBarriers) {
            if (ib.destroy) ib.destroy();
        }
        this.intermittentBarriers = [];

        this.allUnits.length     = 0;
        this.travelingIds.length = 0;
        this.nodes.length        = 0;
        this.zones.length        = 0;
        this.unitSequence        = 1;

        if (this.hazardGraphics) {
            this.hazardGraphics.clear();
        }
        this.hazards             = [];
        this.hazardTimer         = 0;
        this.grid.clear();

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

            this.zoneGraphics = new PIXI.Graphics();
            this.game.layerNodes.addChild(this.zoneGraphics);

            this.hazardGraphics = new PIXI.Graphics();
            this.game.layerNodes.addChild(this.hazardGraphics);

            this.tunnelGraphics = new PIXI.Graphics();
            this.game.layerNodes.addChild(this.tunnelGraphics);
        }

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
                z.x      * this.game.width,
                z.y      * this.game.height,
                z.width  * this.game.width,
                z.height * this.game.height
            );
            this.zoneGraphics.fill({ color: z.color, alpha: z.alpha || 0.3 });
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // DRAW SWEEP — solo dibuja el indicador de alerta HUD en el uiCanvas.
    // La barra de la ola se dibuja directamente en PIXI dentro de update().
    // ─────────────────────────────────────────────────────────────────
    drawSweep(ctx, gameState, isPaused) {
        if (gameState !== 'PLAYING' || isPaused) return;
        for (let sweep of this.waterSweeps) {
            sweep.draw(ctx, this.game);
        }
        for (let sweep of this.lightSweeps) {
            sweep.draw(ctx, this.game);
        }
    }

    update(dt, gameState, isPaused, SFX) {
        if (gameState === 'MENU') {
            this.updateMenuAnts(dt);
            return;
        }
        if (gameState !== 'PLAYING' || isPaused) return;

        this.simTime += dt;
        this.updateNodeCounts();
        PhysicsManager.updateGrid(this);
        PhysicsManager.updatePhysics(this, dt);
        this.processSimulation(dt, SFX);
        this.cleanupUnits();
    }

    updateMenuAnts(dt) {
        const w = window.innerWidth;
        const h = window.innerHeight;
        const gp = this.menuGatherPoint;

        // Tick del gather point
        if (gp) {
            gp.timer -= dt;
            if (gp.timer <= 0) this.menuGatherPoint = null;
        }

        for (let i = 0; i < this.menuAnts.length; i++) {
            const a = this.menuAnts[i];

            // ── MODO REUNIÓN ──────────────────────────────────────────
            if (gp && gp.orbitAngles[i] !== null) {
                // Hacer girar el ángulo de órbita personal con su velocidad única
                gp.orbitAngles[i] += gp.orbitSpeeds[i] * dt;

                // Posición objetivo en la órbita (repartidas como en un nodo)
                const targetX = gp.x + Math.cos(gp.orbitAngles[i]) * gp.orbitRadiuses[i];
                const targetY = gp.y + Math.sin(gp.orbitAngles[i]) * gp.orbitRadiuses[i];

                // Lerp suave hacia la órbita
                const lerpFactor = 1 - Math.exp(-4 * dt);
                a.x += (targetX - a.x) * lerpFactor;
                a.y += (targetY - a.y) * lerpFactor;
                
                // Orientar visualmente
                a.angle = gp.orbitAngles[i] + Math.PI / 2 * Math.sign(gp.orbitSpeeds[i]);

                if (a.sprite) {
                    a.sprite.x        = a.x;
                    a.sprite.y        = a.y;
                    a.sprite.rotation = a.angle;
                    // Brillo al reunirse
                    a.sprite.alpha = 0.95;
                }
                continue;
            }

            // ── MODO VAGABUNDEO (comportamiento original) ─────────────
            a.angle += a.wander + (Math.random() - 0.5) * 0.06;
            a.x += Math.cos(a.angle) * a.speed * dt;
            a.y += Math.sin(a.angle) * a.speed * dt;
            if (a.x < 0) { a.x = 0;  a.angle = Math.PI - a.angle; }
            if (a.x > w) { a.x = w;  a.angle = Math.PI - a.angle; }
            if (a.y < 0) { a.y = 0;  a.angle = -a.angle; }
            if (a.y > h) { a.y = h;  a.angle = -a.angle; }
            if (a.sprite) {
                a.sprite.x        = a.x;
                a.sprite.y        = a.y;
                a.sprite.rotation = a.angle;
                a.sprite.alpha    = 0.75;
            }
        }
    }

    updateNodeCounts() {
        for (let n of this.nodes) {
            if (!n.population) n.population = {};
            if (!n.power)      n.power      = {};
            const c = n.counts, pop = n.population, pw = n.power;
            for (const k in c)   c[k]   = 0;
            for (const k in pop) pop[k] = 0;
            for (const k in pw)  pw[k]  = 0;
        }

        const CAPTURE_DIST_MULT = 2.5;
        for (let u of this.allUnits) {
            if (u.pendingRemoval || !u.targetNode) continue;
            const node = u.targetNode;
            const p = u.power || 1;
            const f = u.faction;
            const dx = u.x - node.x, dy = u.y - node.y;
            const distSq = dx * dx + dy * dy;
            const capSq  = (node.radius * CAPTURE_DIST_MULT) ** 2;
            if (u.state === 'idle' || distSq < capSq) {
                if (node.counts[f] === undefined) {
                    node.counts[f] = 0; node.population[f] = 0; node.power[f] = 0;
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

        if (this.vfxGraphics)    this.vfxGraphics.clear();
        if (this.sparksGraphics) this.sparksGraphics.clear();
        this.drawHazards();

        // update() de cada marea: gestiona colisión Y actualiza su PIXI.Graphics
        for (let sweep of this.waterSweeps) {
            sweep.update(dt, this.allUnits, this.nodes, this.game);
        }

        // update() de cada rayo de luz: gestiona reset de nodos marcados
        for (let sweep of this.lightSweeps) {
            sweep.update(dt, this.allUnits, this.nodes, this.game);
        }

        // update() de barreras intermitentes
        for (let ib of this.intermittentBarriers) {
            ib.update(dt, this.game.width, this.game.height);
        }

        let hoveredNode = null;
        for (let i = 0; i < this.nodes.length; i++) {
            CombatManager.processCombat(this, i, dt, SFX);
            this.processRegen(i, dt);
            this.nodes[i].update(dt, this.grid, this.allUnits, this.vfxGraphics, this.sparksGraphics, SFX);
            if (this.nodes[i].hovered) hoveredNode = this.nodes[i];
        }

        if (hoveredNode) this.updateNodeTooltip(hoveredNode);
        else if (this.ui) this.ui.hideNodeTooltip();
    }

    updateNodeTooltip(node) {
        if (this.ui) this.ui.showNodeTooltip(node);
    }

    processRegen(nodeIdx, dt) {
        const node = this.nodes[nodeIdx];
        if (node.pendingEvolution) {
            node.pendingEvolutionEtaSec -= dt;
            if (node.pendingEvolutionEtaSec <= 0) {
                node.completeEvolution();
            }
        }

        if (node.owner === 'neutral' || node.type === 'tunel') return;
        const faction = node.owner;
        if (node.population[faction] >= node.maxUnits) return;
        if (this.allUnits.length >= 3000) return;

        node.regenTimer += dt;
        let interval = node.regenInterval;
        if (node.evolution === 'tanque') interval *= 1.5;
        let projectedPower = node.population[faction] || 0;

        while (node.regenTimer >= interval) {
            const spawnPower = node.evolution === 'tanque' ? 3 : 1;
            if (projectedPower >= node.maxUnits) break;
            if (this.allUnits.length >= 3000) break;

            node.regenTimer -= interval;
            const seed = this.nextUnitSeed(node, faction);
            const u = new Unit(node.x, node.y, faction, seed);
            this.positionUnitInNode(u, node, 0.7, projectedPower | 0);
            if (node.evolution === 'tanque') u.power = 3;

            if (node.tunnelTo && node.tunnelTo.owner === node.owner && node.type !== 'tunel') {
                u.targetNode = node.tunnelTo;
                u.homeNode   = node;
                u.state      = 'traveling';
                u.speedMult  = 2.0;
            } else {
                u.targetNode = node;
                u.homeNode   = node;
                u.state      = 'idle';
                u.speedMult  = 1.0;
            }
            this.attachSprite(u);
            this.allUnits.push(u);
            projectedPower += spawnPower;
        }
    }

    cleanupUnits() {
        let i = this.allUnits.length - 1;
        while (i >= 0) {
            if (this.allUnits[i].pendingRemoval) {
                this.allUnits[i].destroy();
                const last = this.allUnits.length - 1;
                if (i !== last) this.allUnits[i] = this.allUnits[last];
                this.allUnits.pop();
            }
            i--;
        }
    }

    countAt(node, faction) { return node.counts     ? (node.counts[faction]     || 0) : 0; }
    popAt  (node, faction) { return node.population ? (node.population[faction] || 0) : 0; }
    powerAt(node, faction) { return node.power      ? (node.power[faction]      || 0) : 0; }

    sendTroops(fromNode, toNode, percent, faction = 'player') {
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

    drawHazards() {
        if (!this.hazardGraphics) return;
        this.hazardGraphics.clear();

        if (!this.hazards || this.hazards.length === 0) return;
        const cx = this.game.width;
        const cy = this.game.height;
        const t = performance.now() * 0.001;

        for (let hz of this.hazards) {
            const hx = hz.x * cx;
            const hy = hz.y * cy;
            const hR = hz.radius * cx;

            if (hz.shape === 'puddle') {
                // Organic bubbling shape
                this.hazardGraphics.beginPath();
                const sy = hz.scaleY || 1.0;
                
                const segments = 32;
                for (let i = 0; i <= segments; i++) {
                    const angle = (i / segments) * Math.PI * 2;
                    let ripple = Math.sin(angle * 5 + t * 2 + hz.seed) * 10 + Math.cos(angle * 3 - t * 1.5) * 6;
                    
                    const r = hR + ripple;
                    const px = hx + Math.cos(angle) * r;
                    const py = hy + Math.sin(angle) * (r * sy);
                    
                    if (i === 0) this.hazardGraphics.moveTo(px, py);
                    else this.hazardGraphics.lineTo(px, py);
                }
                
                const alphaPulse = 0.25 + Math.sin(t * 3) * 0.05;
                this.hazardGraphics.fill({ color: hz.color || 0x8e44ad, alpha: alphaPulse });
                
                // Puddle edge
                this.hazardGraphics.stroke({ color: 0x27ae60, alpha: 0.6 + Math.sin(t*5)*0.2, width: 3 });
                
            } else if (hz.shape === "semicircle") {
                this.hazardGraphics.moveTo(hx, hy - hR);
                this.hazardGraphics.arc(hx, hy, hR, -Math.PI / 2, Math.PI / 2);
                this.hazardGraphics.closePath();
                const alphaPulse = 0.2 + Math.sin(t * 2) * 0.05;
                this.hazardGraphics.fill({ color: hz.color || 0xff0000, alpha: alphaPulse });
            } else {
                this.hazardGraphics.circle(hx, hy, hR);
                this.hazardGraphics.fill({ color: hz.color || 0xff0000, alpha: hz.alpha || 0.2 });
            }
        }
    }

    rebuildNavigation() {
        if (!this.navigation) return null;
        const store = this.navigation.bakeFromWorld(this);
        if (this.grid) {
            this.grid.setSurfaceStore(store);
        }
        return store;
    }
}
