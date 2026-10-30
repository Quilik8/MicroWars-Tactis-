import { Node } from '../../src/entities/node.js';
import { Unit } from '../../src/entities/unit.js';
import { PhysicsManager } from '../../src/managers/physics_manager.js';
import { CombatManager } from '../../src/managers/combat_manager.js';
import { NavigationSystem } from '../../src/navigation/navigation_system.js';
import { SpatialHashGrid } from '../../src/core/logic_grid.js';
import { updateNodeCounts, processRegen, issueTroopOrder } from '../../src/simulation/rts_world_rules.js';
import { getNodeSeed, hashStringSeed, mixSeeds, placeUnitInCircle } from '../../src/simulation/deterministic_layout.js';

const emptyGraphics = new Proxy({}, { get: () => () => emptyGraphics });
export function makeWorld({ nodes = [{ x: 100, y: 180, owner: 'enemy', count: 90 },
    { x: 310, y: 180, owner: 'neutral', count: 8 }], seed = 1, width = 800, height = 500,
    hazards = [], zones = [], barriers = [], gates = [], water = [], light = [], strategy = null } = {}) {
    const world = { game: { width, height }, simTime: 0, nodes: [], allUnits: [], travelingIds: [], aiTravelingUnits: [], neighbors: [],
        gridSize: 30, grid: new SpatialHashGrid(width, height, 30, 10000), unitSequence: seed,
        navigation: new NavigationSystem(), hazards, zones, barriers, intermittentBarriers: gates,
        waterSweeps: water, lightSweeps: light, combatInterval: 0.7, campaignModifiers: {},
        aiStrategy: strategy, allowEvolutions: true, attachSprite() {},
        nextUnitSeed(node, faction) {
            this.unitSequence = (this.unitSequence + 1) >>> 0;
            return mixSeeds(this.unitSequence, getNodeSeed(node) ^ hashStringSeed(faction));
        },
        positionUnitInNode(unit, node, scale = 0.7, salt = 0) {
            placeUnitInCircle(unit, node.x, node.y, node.radius, mixSeeds(unit.deterministicSeed, salt >>> 0), scale);
        },
        isPathBlocked(source, target) {
            if (source.isMobile || target.isMobile) return false;
            const all = [...this.barriers, ...this.intermittentBarriers.flatMap(g => g.getActiveBounds())];
            // Same segment intersection used by the live WorldManager.
            return all.some(b => this.navigation.localAvoidanceSolver && segmentBlocked(source, target, b, this.game));
        },
        spawnUnitsAt(node, faction, count) {
            for (let i = 0; i < count; i++) {
                const u = new Unit(node.x, node.y, faction, this.nextUnitSeed(node, faction));
                this.positionUnitInNode(u, node, 1, i + 1); u.targetNode = node; u.homeNode = node; this.allUnits.push(u);
            }
        },
        sendTroops(a, b, percent, faction = 'player') {
            const n = this.allUnits.filter(u => !u.pendingRemoval && u.state === 'idle' && u.targetNode === a && u.faction === faction).length;
            return issueTroopOrder(this, a, b, percent >= 0.99 ? n : Math.floor(n * percent), faction);
        },
    };
    for (let i = 0; i < nodes.length; i++) {
        const spec = nodes[i], node = new Node(spec.x, spec.y, spec.owner, spec.type || 'normal');
        Object.assign(node, spec); node.navIndex = i;
        node._updateBattleSparks = () => {}; node._createAcidParticles = () => [];
        node._drawProjectileInFlight = () => {}; node._drawExplosion = () => {};
        world.nodes.push(node);
        for (const [f, count] of Object.entries(spec.forces || { [spec.owner]: spec.count || 0 })) world.spawnUnitsAt(node, f, count);
    }
    world.navigation.bakeFromWorld(world);
    updateNodeCounts(world);
    return world;
}
import { segmentRectInterval } from '../../src/navigation/nav_hazard_evaluator.js';
function segmentBlocked(a, b, r, game) {
    return segmentRectInterval(a.x, a.y, b.x, b.y, r.x * game.width, r.y * game.height,
        (r.x + r.width) * game.width, (r.y + r.height) * game.height, { enter: 0, exit: 0 });
}

// Independent orchestration of actual managers, not a call to the forecast runner.
export function stepWorld(world, dt = 1 / 30) {
    world.simTime += dt;
    for (const gate of world.intermittentBarriers) if (gate.update(dt, world.game.width, world.game.height)) {
        world.aiEnvironmentRevision = (world.aiEnvironmentRevision || 0) + 1;
    }
    updateNodeCounts(world);
    PhysicsManager.updateGrid(world);
    PhysicsManager.updatePhysics(world, dt);
    PhysicsManager.processArrivals(world);
    for (const sweep of world.waterSweeps) sweep.update(dt, world.allUnits, world.nodes, world.game);
    for (const sweep of world.lightSweeps) sweep.update(dt, world.allUnits, world.nodes, world.game);
    for (let i = 0; i < world.nodes.length; i++) {
        CombatManager.processCombat(world, i, dt, null);
        processRegen(world, world.nodes[i], dt);
        world.nodes[i].update(dt, world.grid, world.allUnits, emptyGraphics, null, null);
    }
    for (let i = world.allUnits.length - 1; i >= 0; i--) if (world.allUnits[i].pendingRemoval) {
        const last = world.allUnits.length - 1;
        if (last !== i) world.allUnits[i] = world.allUnits[last];
        world.allUnits.pop();
    }
}
export function finish(iterator, limit = 50000) {
    for (let i = 0; i < limit; i++) { const r = iterator.next(); if (r.done) return r.value; }
    throw new Error('Work did not finish within deterministic quota');
}
