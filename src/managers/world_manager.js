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
            if (node.pendingEvolutionEtaSec < 0) node.pendingEvolutionEtaSec = 0;
            if (node.pendingEvolutionEtaSec <= 0 && node.owner !== 'neutral') {
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

            // Initialize a stable per-hazard seed for animation variation
            if (hz.seed === undefined) hz.seed = (hz.x * 1000 + hz.y * 777) | 0;

            if (hz.shape === 'flood') {
                // ── FLOOD: entire map is toxic, with organic safe-zone holes ──
                const alphaPulse = 0.20 + Math.sin(t * 2.0 + hz.seed) * 0.05;
                const margin = 40;

                // 1) CONSTRUIR EL LAGO COLOSAL DE VENENO Y PERFORAR LOS HUECOS
                this.hazardGraphics.beginPath();
                const outerSegs = 64;
                const fSy = hz.scaleY || 1.0;
                for (let i = 0; i <= outerSegs; i++) {
                    const angle = (i / outerSegs) * Math.PI * 2;
                    const ripple = Math.sin(angle * 6 + t * 1.5 + hz.seed) * 12
                                 + Math.cos(angle * 4 - t * 1.2 + hz.seed * 0.8) * 8
                                 + Math.sin(angle * 9 + t * 2.0) * 5;
                    const r = hR + ripple;
                    const px = hx + Math.cos(angle) * r;
                    const py = hy + Math.sin(angle) * (r * fSy);
                    if (i === 0) this.hazardGraphics.moveTo(px, py);
                    else this.hazardGraphics.lineTo(px, py);
                }
                this.hazardGraphics.closePath();

                if (hz.safeZones) {
                    const holeSegs = 36;
                    for (let s = 0; s < hz.safeZones.length; s++) {
                        const sz = hz.safeZones[s];
                        const sx = sz.x * cx;
                        const sy = sz.y * cy;
                        const sR = sz.radius * cx;
                        const holeSeed = (s * 137 + hz.seed) | 0;

                        for (let i = holeSegs; i >= 0; i--) {
                            const angle = (i / holeSegs) * Math.PI * 2;
                            const ripple = Math.sin(angle * 4 + holeSeed) * 6
                                         + Math.cos(angle * 6 + holeSeed * 0.3) * 4;
                            const r = sR + ripple;
                            const px = sx + Math.cos(angle) * r;
                            const py = sy + Math.sin(angle) * r;
                            if (i === holeSegs) this.hazardGraphics.moveTo(px, py);
                            else this.hazardGraphics.lineTo(px, py);
                        }
                        this.hazardGraphics.closePath();
                    }
                }

                this.hazardGraphics.fill({ color: hz.color || 0x2ecc71, alpha: alphaPulse });

                // 2) DIBUJAR TODAS LAS SUPERFICIES DE TIERRA MARRÓN ENCIMA (para tapar fugas del charco)
                if (hz.safeZones) {
                    const holeSegs = 36;
                    for (let s = 0; s < hz.safeZones.length; s++) {
                        const sz = hz.safeZones[s];
                        const sx = sz.x * cx;
                        const sy = sz.y * cy;
                        const sR = sz.radius * cx;
                        const holeSeed = (s * 137 + hz.seed) | 0;

                        this.hazardGraphics.beginPath();
                        for (let i = 0; i <= holeSegs; i++) {
                            const angle = (i / holeSegs) * Math.PI * 2;
                            const ripple = Math.sin(angle * 4 + holeSeed) * 6
                                         + Math.cos(angle * 6 + holeSeed * 0.3) * 4;
                            const r = sR + ripple;
                            const px = sx + Math.cos(angle) * r;
                            const py = sy + Math.sin(angle) * r;
                            if (i === 0) this.hazardGraphics.moveTo(px, py);
                            else this.hazardGraphics.lineTo(px, py);
                        }
                        this.hazardGraphics.closePath();
                        this.hazardGraphics.fill({ color: 0x2e1a10, alpha: 1.0 });
                    }
                }

            } else if (hz.shape === 'rect_puddle') {
                // ── RECT PUDDLE: rectangular hazard with organic wobbling edges ──
                const rLeft   = hz.x * cx;
                const rTop    = hz.y * cy;
                const rWidth  = hz.width * cx;
                const rHeight = hz.height * cy;
                const segsH   = 24; // segments per horizontal edge
                const segsV   = Math.max(8, Math.round(segsH * (rHeight / rWidth)));
                const alphaPulse = 0.22 + Math.sin(t * 2.5 + hz.seed) * 0.05;

                this.hazardGraphics.beginPath();

                // Top edge (left to right)
                for (let i = 0; i <= segsH; i++) {
                    const frac = i / segsH;
                    const baseX = rLeft + frac * rWidth;
                    const ripple = Math.sin(frac * 8 + t * 2.0 + hz.seed) * 7
                                 + Math.cos(frac * 5 - t * 1.4 + hz.seed * 0.6) * 4;
                    const py = rTop + ripple;
                    if (i === 0) this.hazardGraphics.moveTo(baseX, py);
                    else this.hazardGraphics.lineTo(baseX, py);
                }
                // Right edge (top to bottom)
                for (let i = 1; i <= segsV; i++) {
                    const frac = i / segsV;
                    const baseY = rTop + frac * rHeight;
                    const ripple = Math.sin(frac * 7 + t * 1.8 + hz.seed * 1.3) * 7
                                 + Math.cos(frac * 4 - t * 1.6 + hz.seed * 0.9) * 4;
                    const px = rLeft + rWidth + ripple;
                    this.hazardGraphics.lineTo(px, baseY);
                }
                // Bottom edge (right to left)
                for (let i = segsH - 1; i >= 0; i--) {
                    const frac = i / segsH;
                    const baseX = rLeft + frac * rWidth;
                    const ripple = Math.sin(frac * 6 - t * 2.2 + hz.seed * 0.8) * 7
                                 + Math.cos(frac * 9 + t * 1.3 + hz.seed * 1.5) * 4;
                    const py = rTop + rHeight + ripple;
                    this.hazardGraphics.lineTo(baseX, py);
                }
                // Left edge (bottom to top)
                for (let i = segsV - 1; i >= 1; i--) {
                    const frac = i / segsV;
                    const baseY = rTop + frac * rHeight;
                    const ripple = Math.sin(frac * 5 + t * 1.9 + hz.seed * 1.7) * 7
                                 + Math.cos(frac * 8 - t * 1.1 + hz.seed * 0.4) * 4;
                    const px = rLeft + ripple;
                    this.hazardGraphics.lineTo(px, baseY);
                }
                this.hazardGraphics.closePath();
                this.hazardGraphics.fill({ color: hz.color || 0x2ecc71, alpha: alphaPulse });
                this.hazardGraphics.stroke({ color: 0x27ae60, alpha: 0.55 + Math.sin(t * 4 + hz.seed) * 0.15, width: 3 });

                // 2) DIBUJAR TODAS LAS SUPERFICIES DE TIERRA MARRÓN ENCIMA
                this.nodes.forEach(n => {
                    if (n.type === 'tunel' || n.isMobile) return;
                    
                    // Comprobar intersección simple del centro del nodo con el rectángulo del charco
                    if (n.x >= rLeft && n.x <= rLeft + rWidth && n.y >= rTop && n.y <= rTop + rHeight) {
                        const holeSegs = 36;
                        // Radio dinámico! Extraído de las propiedades reales del nodo colisionado
                        const sR = n.radius * 1.5; 
                        const holeSeed = (n.x * 137 + hz.seed) | 0;

                        this.hazardGraphics.beginPath();
                        for (let i = 0; i <= holeSegs; i++) {
                            const angle = (i / holeSegs) * Math.PI * 2;
                            const ripple = Math.sin(angle * 4 + holeSeed) * 6
                                         + Math.cos(angle * 6 + holeSeed * 0.3) * 4;
                            const r = sR + ripple;
                            const px = n.x + Math.cos(angle) * r;
                            const py = n.y + Math.sin(angle) * r;
                            if (i === 0) this.hazardGraphics.moveTo(px, py);
                            else this.hazardGraphics.lineTo(px, py);
                        }
                        this.hazardGraphics.closePath();
                        this.hazardGraphics.fill({ color: 0x2e1a10, alpha: 1.0 });
                    }
                });

            } else if (hz.shape === 'ring') {
                // ── RING: annular hazard with organic wobbling borders ──
                const sy = hz.scaleY || 1.0;
                const iR = (hz.innerRadius || hz.radius * 0.5) * cx;
                const segments = 48;
                const alphaPulse = 0.22 + Math.sin(t * 2.5 + hz.seed) * 0.06;

                // 1) CONSTRUIR EL ANILLO DE VENENO Y PERFORAR EL HUECO
                
                // Outer contour (organic wobble)
                this.hazardGraphics.beginPath();
                for (let i = 0; i <= segments; i++) {
                    const angle = (i / segments) * Math.PI * 2;
                    const ripple = Math.sin(angle * 6 + t * 1.8 + hz.seed) * 8
                                 + Math.cos(angle * 4 - t * 1.3 + hz.seed * 0.7) * 5
                                 + Math.sin(angle * 9 + t * 2.6) * 3;
                    const r = hR + ripple;
                    const px = hx + Math.cos(angle) * r;
                    const py = hy + Math.sin(angle) * (r * sy);
                    if (i === 0) this.hazardGraphics.moveTo(px, py);
                    else this.hazardGraphics.lineTo(px, py);
                }
                this.hazardGraphics.closePath();

                // Inner contour (the hole)
                for (let i = segments; i >= 0; i--) {
                    const angle = (i / segments) * Math.PI * 2;
                    const ripple = Math.sin(angle * 5 + hz.seed * 1.3) * 6
                                 + Math.cos(angle * 7 + hz.seed * 0.5) * 4
                                 + Math.sin(angle * 3 + hz.seed * 0.9) * 3;
                    const r = iR + ripple;
                    const px = hx + Math.cos(angle) * r;
                    const py = hy + Math.sin(angle) * (r * sy);
                    if (i === segments) this.hazardGraphics.moveTo(px, py);
                    else this.hazardGraphics.lineTo(px, py);
                }
                this.hazardGraphics.closePath();

                // Fill with evenodd to create the donut hole
                this.hazardGraphics.fill({ color: hz.color || 0x2ecc71, alpha: alphaPulse });

                // 2) DIBUJAR LA ISLA DE TIERRA MARRÓN ENCIMA (tapa fugas)
                this.hazardGraphics.beginPath();
                for (let i = 0; i <= segments; i++) {
                    const angle = (i / segments) * Math.PI * 2;
                    const ripple = Math.sin(angle * 5 + hz.seed * 1.3) * 6
                                 + Math.cos(angle * 7 + hz.seed * 0.5) * 4
                                 + Math.sin(angle * 3 + hz.seed * 0.9) * 3;
                    const r = iR + ripple;
                    const px = hx + Math.cos(angle) * r;
                    const py = hy + Math.sin(angle) * (r * sy);
                    if (i === 0) this.hazardGraphics.moveTo(px, py);
                    else this.hazardGraphics.lineTo(px, py);
                }
                this.hazardGraphics.closePath();
                this.hazardGraphics.fill({ color: 0x2e1a10, alpha: 1.0 });

                // Outer edge glow
                this.hazardGraphics.beginPath();
                for (let i = 0; i <= segments; i++) {
                    const angle = (i / segments) * Math.PI * 2;
                    const ripple = Math.sin(angle * 6 + t * 1.8 + hz.seed) * 8
                                 + Math.cos(angle * 4 - t * 1.3 + hz.seed * 0.7) * 5
                                 + Math.sin(angle * 9 + t * 2.6) * 3;
                    const r = hR + ripple;
                    const px = hx + Math.cos(angle) * r;
                    const py = hy + Math.sin(angle) * (r * sy);
                    if (i === 0) this.hazardGraphics.moveTo(px, py);
                    else this.hazardGraphics.lineTo(px, py);
                }
                this.hazardGraphics.closePath();
                this.hazardGraphics.stroke({ color: 0x27ae60, alpha: 0.55 + Math.sin(t * 4) * 0.15, width: 3 });

            } else if (hz.shape === 'puddle') {
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

    isPathBlocked(fromNode, toNode) {
        if (fromNode.isMobile || toNode.isMobile) return false;

        let allBarriers = this.barriers ? [...this.barriers] : [];
        if (this.intermittentBarriers && this.intermittentBarriers.length > 0) {
            for (let ib of this.intermittentBarriers) {
                const activeBounds = ib.getActiveBounds();
                if (activeBounds && activeBounds.length > 0) {
                    allBarriers = allBarriers.concat(activeBounds);
                }
            }
        }

        if (allBarriers.length === 0) return false;

        const cx = this.game ? this.game.width : (window.innerWidth || 1920);
        const cy = this.game ? this.game.height : (window.innerHeight || 1080);

        for (let b of allBarriers) {
            const left = b.x * cx;
            const top = b.y * cy;
            const right = left + (b.width * cx);
            const bottom = top + (b.height * cy);

            if (this._segmentRectIntersect(fromNode.x, fromNode.y, toNode.x, toNode.y, left, top, right, bottom)) {
                return true;
            }
        }
        return false;
    }

    _segmentRectIntersect(x1, y1, x2, y2, left, top, right, bottom) {
        let tMin = 0;
        let tMax = 1;
        const dx = x2 - x1;
        const dy = y2 - y1;

        if (Math.abs(dx) < 1e-6) {
            if (x1 < left || x1 > right) return false;
        } else {
            const tx1 = (left - x1) / dx;
            const tx2 = (right - x1) / dx;
            const txMin = tx1 < tx2 ? tx1 : tx2;
            const txMax = tx1 > tx2 ? tx1 : tx2;
            if (txMin > tMin) tMin = txMin;
            if (txMax < tMax) tMax = txMax;
            if (tMax < tMin) return false;
        }

        if (Math.abs(dy) < 1e-6) {
            if (y1 < top || y1 > bottom) return false;
        } else {
            const ty1 = (top - y1) / dy;
            const ty2 = (bottom - y1) / dy;
            const tyMin = ty1 < ty2 ? ty1 : ty2;
            const tyMax = ty1 > ty2 ? ty1 : ty2;
            if (tyMin > tMin) tMin = tyMin;
            if (tyMax < tMax) tMax = tyMax;
            if (tMax < tMin) return false;
        }

        if (tMax < 0 || tMin > 1) return false;
        return tMax >= tMin;
    }
}
