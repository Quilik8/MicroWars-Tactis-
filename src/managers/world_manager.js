import { Unit } from '../entities/unit.js';
import { Node } from '../entities/node.js';
import { SpatialHashGrid } from '../core/logic_grid.js';
import { PIXI } from '../core/engine.js';
import { FACTIONS } from '../campaign/faction_data.js';

export class WorldManager {
    constructor(game, ui, config) {
        this.game = game;
        this.ui = ui;
        this.gridSize = config.gridCellSize || 30;
        this.grid = new SpatialHashGrid(1920, 1080, this.gridSize, 10000);

        this.allUnits = [];
        this.nodes = [];
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

        this.tunnelGraphics = new PIXI.Graphics();
        this.game.layerNodes.addChild(this.tunnelGraphics);
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
        this.grid.clear();

        // Clear Pixi layers safely
        if (this.game.layerUnits) {
            const children = this.game.layerUnits.removeChildren();
            for (let c of children) c.destroy({ children: true });
        }

        if (this.game.layerNodes) {
            const children = this.game.layerNodes.removeChildren();
            for (let c of children) c.destroy({ children: true });

            // Re-create/Re-add tunnel graphics since it was a child of layerNodes
            this.tunnelGraphics = new PIXI.Graphics();
            this.game.layerNodes.addChild(this.tunnelGraphics);
        }

        if (this.ui) this.ui.hideNodeTooltip();
        Node.clearPool();
    }

    update(dt, gameState, isPaused, SFX) {
        if (gameState === 'MENU') {
            this.updateMenuAnts(dt);
            return;
        }

        if (gameState !== 'PLAYING' || isPaused) return;

        this.updateNodeCounts();
        this.updateGrid();
        this.updatePhysics(dt);
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
        for (let n of this.nodes) {
            n.counts = { neutral: 0 };
            n.population = { neutral: 0 };
            n.power = { neutral: 0 };
            for (let fId in Node.COLORS) {
                n.counts[fId] = 0;
                n.population[fId] = 0;
                n.power[fId] = 0;
            }
        }

        const CAPTURE_DIST_MULT = 2.5;

        for (let u of this.allUnits) {
            if (u.pendingRemoval || !u.targetNode) continue;

            const node = u.targetNode;
            const p = u.power || 1;
            const f = u.faction;

            const dx = u.x - node.x;
            const dy = u.y - node.y;
            const distSq = dx * dx + dy * dy;
            const captureRangeSq = (node.radius * CAPTURE_DIST_MULT) * (node.radius * CAPTURE_DIST_MULT);

            if (u.state === 'idle' || distSq < captureRangeSq) {
                node.counts[f] = (node.counts[f] || 0) + 1;
                node.population[f] = (node.population[f] || 0) + p;
                node.power[f] = (node.power[f] || 0) + p;
            }
        }
    }

    updateGrid() {
        if (this.grid.boundsWidth !== this.game.width || this.grid.boundsHeight !== this.game.height) {
            this.grid = new SpatialHashGrid(this.game.width, this.game.height, this.gridSize, 10000);
        }
        this.grid.clear();
        this.travelingIds.length = 0;

        // Optimization: Only insert units that are traveling or near defensive nodes
        // For simplicity and to avoid missing interactions, we insert all for now but 
        // we can pre-filter if performance drops. 
        // Let's refine travelingIds to be more accurate.
        for (let i = 0; i < this.allUnits.length; i++) {
            let u = this.allUnits[i];
            if (u.pendingRemoval) continue;
            this.grid.insert(i, u.x | 0, u.y | 0);
            if (u.state === 'traveling') {
                this.travelingIds.push(i);
            }
        }
    }

    updatePhysics(dt) {
        // Traveling units
        for (let i = 0; i < this.travelingIds.length; i++) {
            let u = this.allUnits[this.travelingIds[i]];
            if (!u.targetNode) continue;
            let targetR = u.targetNode.radius;
            let dx = u.targetNode.x - u.x;
            let dy = u.targetNode.y - u.y;
            if (dx * dx + dy * dy < (targetR * 4) * (targetR * 4)) {
                this.grid.findNear(u.x, u.y, 30, this.neighbors);
            } else {
                this.neighbors.length = 0;
            }
            u.updateForces(dt, u.targetNode.x, u.targetNode.y, targetR, this.neighbors, this.allUnits);
        }

        // Idle units (orbit)
        for (let u of this.allUnits) {
            if (u.state !== 'idle' || !u.targetNode) continue;
            let tn = u.targetNode;
            u.personalTheta += dt * (0.3 + u.personalR * 0.5) * (u.faction === 'player' ? 1 : -1);
            let px = tn.x + Math.cos(u.personalTheta) * u.personalR * tn.radius;
            let py = tn.y + Math.sin(u.personalTheta) * u.personalR * tn.radius;
            let hDx = px - u.x, hDy = py - u.y;
            let distH = Math.sqrt(hDx * hDx + hDy * hDy);
            if (distH > 0.5) {
                let factor = Math.min(distH / 15, 1.0) * 0.6;
                u.vx = u.vx * 0.82 + (hDx / distH) * u.speed * factor * 0.15;
                u.vy = u.vy * 0.82 + (hDy / distH) * u.speed * factor * 0.15;
            } else {
                u.vx *= 0.5; u.vy *= 0.5;
            }
            if (u.vx !== 0 || u.vy !== 0) u.angle = Math.atan2(u.vy, u.vx);
        }

        for (let u of this.allUnits) u.updatePosition(dt);
    }

    processSimulation(dt, SFX) {
        this.processArrivals();
        this.drawTunnels();

        let hoveredNode = null;
        for (let i = 0; i < this.nodes.length; i++) {
            this.processCombat(i, dt, SFX);
            this.processRegen(i, dt);
            this.nodes[i].update(dt, this.grid, this.allUnits, this.game.layerUnits, SFX);

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

    drawTunnels() {
        if (!this.tunnelGraphics) return;

        this.tunnelGraphics.clear();

        const time = performance.now();
        for (let n of this.nodes) {
            if (n.tunnelTo && n.tunnelTo.owner === n.owner && n.type !== 'tunel') {
                const c = Node.COLORS[n.owner] || Node.COLORS.neutral;
                const x1 = n.x, y1 = n.y;
                const x2 = n.tunnelTo.x, y2 = n.tunnelTo.y;

                // 1. EL TÚNEL (Línea base sutil)
                this.tunnelGraphics.moveTo(x1, y1).lineTo(x2, y2);
                this.tunnelGraphics.stroke({ color: c.fill, alpha: 0.15, width: 12 });

                // 2. RECTÁNGULOS MÓVILES (Dashed line animado)
                const scrollSpeed = 0.1;
                const offset = (time * scrollSpeed) % 30;

                this.tunnelGraphics.moveTo(x1, y1).lineTo(x2, y2);
                this.tunnelGraphics.stroke({
                    color: c.stroke,
                    alpha: 0.8,
                    width: 6,
                    dashArray: [10, 20],
                    dashOffset: -offset
                });
            }
        }
    }

    processArrivals() {
        for (let u of this.allUnits) {
            if (u.state !== 'traveling') continue;
            let tn = u.targetNode;
            if (!tn) {
                if (u.homeNode) { u.targetNode = u.homeNode; }
                continue;
            }
            let dx = u.x - tn.x, dy = u.y - tn.y;
            let arrivalR = tn.radius * 1.5;
            if (dx * dx + dy * dy <= arrivalR * arrivalR) {
                if (tn.type === 'tunel' && tn.tunnelTo && tn.owner === u.faction) {
                    u.x = tn.tunnelTo.x + (Math.random() - 0.5) * tn.tunnelTo.radius;
                    u.y = tn.tunnelTo.y + (Math.random() - 0.5) * tn.tunnelTo.radius;
                    u.targetNode = tn.tunnelTo;
                    u.homeNode = tn.tunnelTo;
                    u.state = 'idle';
                } else {
                    u.state = 'idle';
                    u.homeNode = tn;
                    u.speedMult = 1.0;
                }
            }
        }
    }

    processCombat(nodeIdx, dt, SFX) {
        let node = this.nodes[nodeIdx];
        let prevOwner = node.owner;
        let p = node.power;

        const factionIds = Object.keys(node.counts).filter(f => node.counts[f] > 0);

        if (factionIds.length > 1) {
            node.combatTimer += dt;
            if (node.combatTimer >= this.combatInterval) {
                node.combatTimer = 0;

                // Daño recíproco y Trade 1v1
                for (let f of factionIds) {
                    let totalDamage = 0;
                    for (let otherF of factionIds) {
                        if (f === otherF) continue;
                        
                        let nAttacker = p[otherF] || 0;
                        let nDefender = p[f] || 0;
                        
                        // Sistema 1vs1: Cada par de unidades lucha causando daño equitativo
                        let pairings = Math.min(nAttacker, nDefender);
                        
                        // Ventaja abrumadora: Solo se activa cuando se tiene más del doble de tropas
                        let overwhelm = Math.max(0, nAttacker - 2 * nDefender);
                        
                        let baseRate = 0.12; 
                        let bonusRate = 0.08;
                        
                        totalDamage += (pairings * baseRate) + (overwhelm * bonusRate);
                    }
                    this.killNPower(node, f, totalDamage);
                }
            }
        } else {
            node.combatTimer = 0;
        }

        // Control de Conquista por tiempos (El Anillo)
        let mainAttacker = null;
        let attackerCount = 0;
        
        if (factionIds.length === 1 && factionIds[0] !== node.owner) {
            mainAttacker = factionIds[0];
            attackerCount = node.counts[mainAttacker];
        } else if (factionIds.length > 1) {
            // Find strongest attacker that isn't the owner
            for (let f of factionIds) {
                if (f !== node.owner && node.counts[f] > attackerCount) {
                    mainAttacker = f;
                    attackerCount = node.counts[f];
                }
            }
        }

        if (mainAttacker) {
            // Check if another faction already started a conquest
            if (node.conqueringFaction && node.conqueringFaction !== mainAttacker) {
                // Decay previous conqueror's progress before starting our own
                node.conquestProgress -= 0.5 * dt;
                if (node.conquestProgress <= 0) {
                    node.conquestProgress = 0;
                    node.conqueringFaction = null; // Next frame, mainAttacker will start theirs
                }
            } else {
                // Determinar la cantidad de tropas enemigas en el nodo
                let enemiesCount = 0;
                for (let f in node.counts) {
                    if (f !== mainAttacker) {
                        enemiesCount += node.counts[f];
                    }
                }

                if (enemiesCount > 3) {
                    // Si quedan más de 3 hormigas enemigas, el progreso de conquista se pausa
                    if (node.conquestProgress > 0) {
                        node.conqueringFaction = mainAttacker;
                    }
                } else {
                    // Determinar velocidad de conquista (3 niveles según número de tropas)
                    let conquestSpeed = 0.15; // Tropas normales (100-)
                    if (attackerCount < 50) conquestSpeed = 0.05; // Pocas tropas
                    if (attackerCount > 250) conquestSpeed = 0.35; // Muchas tropas

                    node.conqueringFaction = mainAttacker;
                    node.conquestProgress += conquestSpeed * dt;
                    
                    // Si supera 1.0, el nodo cambia de dueño
                    if (node.conquestProgress >= 1.0) {
                        node.owner = mainAttacker;
                        node.conquestProgress = 0;
                        node.conqueringFaction = null;
                        node.evolution = null; // Pierde evoluciones al ser conquistado
                    }
                }
            }
        } else {
            // Decaer progreso de conquista si pierdes las tropas / no hay atacantes dominantes
            if (node.conquestProgress > 0) {
                node.conquestProgress -= 0.5 * dt;
                if (node.conquestProgress <= 0) {
                    node.conquestProgress = 0;
                    node.conqueringFaction = null;
                }
            }
        }

        // Redraw to ensure ring/color updates reflect
        const currentFactionData = FACTIONS.find(f => f.id === node.owner);
        node.redraw(currentFactionData);

        if (node.owner !== prevOwner) {
            if (SFX) {
                if (node.owner === 'player' || node.owner === 'carpinteras') SFX.capture();
                else if (prevOwner === 'player' || prevOwner === 'carpinteras') SFX.lost();
            }
            for (let n of this.nodes) {
                if (n.tunnelTo === node || n === node) {
                    if (n.type !== 'tunel') n.tunnelTo = null; // Only break logistical tunnels
                }
            }
        }
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

    killNPower(node, faction, damage) {
        if (damage <= 0) return;
        // Matamos unidades que tengan este nodo como objetivo Y estén cerca o idle
        for (let i = this.allUnits.length - 1; i >= 0 && damage > 0; i--) {
            let u = this.allUnits[i];
            if (u.faction === faction && u.targetNode === node && !u.pendingRemoval) {
                const dx = u.x - node.x;
                const dy = u.y - node.y;
                if (u.state === 'idle' || (dx * dx + dy * dy < node.radius * node.radius * 6.25)) {
                    let hp = u.power || 1;
                    if (damage >= hp) {
                        damage -= hp; u.pendingRemoval = true;
                    } else {
                        if (Math.random() < damage / hp) u.pendingRemoval = true;
                        damage = 0;
                    }
                }
            }
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
        let eligible = this.allUnits.filter(u => {
            if (u.faction !== faction || u.pendingRemoval) return false;
            // Bugfix: Solo enviar tropas que ya estén fìsicamente estacionadas en el nodo de origen.
            if (u.targetNode === fromNode && u.state === 'idle') return true;
            return false;
        });

        let count = (percent >= 0.99) ? eligible.length : Math.floor(eligible.length * percent);
        if (count < 1 && eligible.length > 0 && percent > 0) count = 1;

        for (let i = 0; i < count; i++) {
            eligible[i].targetNode = toNode;
            eligible[i].state = 'traveling';
            eligible[i].speedMult = 1.0;
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
