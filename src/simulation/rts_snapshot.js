import { Unit } from '../entities/unit.js?v=rts-balance-thorns-20261029-1';
import { SpatialHashGrid } from '../core/logic_grid.js';
import { LocalAvoidanceSolver } from '../navigation/nav_hazard_evaluator.js';
import { PhysicsManager } from '../managers/physics_manager.js?v=rts-balance-thorns-20261029-1';
import { CombatManager } from '../managers/combat_manager.js?v=rts-balance-thorns-20261029-1';
import { updateNodeCountsWork, processRegen } from './rts_world_rules.js?v=rts-balance-thorns-20261029-1';
import { getNodeSeed, hashStringSeed, mixSeeds, placeUnitInCircle } from './deterministic_layout.js';

const noop = () => {};
const graphics = new Proxy({}, { get: () => () => graphics });
const nodeObjects = ['counts', 'power', 'population', 'combatDamageCarry', 'campaignLeech', 'campaignBurn'];
function scalarCopy(source, prototype = Object.getPrototypeOf(source)) {
    const out = Object.create(prototype);
    for (const k of Object.keys(source)) {
        const v = source[k];
        if (v == null || ['string', 'number', 'boolean'].includes(typeof v)) out[k] = v;
    }
    return out;
}
function copyNode(n) {
    const out = scalarCopy(n);
    for (const k of nodeObjects) out[k] = n[k] ? { ...n[k] } : null;
    out.counts ??= {}; out.population ??= {}; out.power ??= {};
    out.activeShots = (n.activeShots || []).map(s => ({ ...s, particles: [] }));
    out.redraw = noop;
    out._createAcidParticles = () => [];
    out._drawProjectileInFlight = noop; out._drawExplosion = noop;
    out._updateBattleSparks = noop;
    out.tunnelTo = null;
    return out;
}
function copySystem(system, nodeMap) {
    const out = scalarCopy(system);
    out._gfx = null; out.graphics = [];
    for (const key of ['zones', 'rails', '_patterns']) if (system[key]) out[key] = system[key];
    for (const key of ['orbs', '_activeBars']) if (system[key]) out[key] = system[key].map(x => ({ ...x }));
    if (system._resetThisCycle) out._resetThisCycle = new Set([...system._resetThisCycle].map(n => nodeMap.get(n)));
    return out;
}

/** Immutable-by-ownership observation: none of these records point to mutable live units. */
export class WorldSnapshot {
    constructor(world, revision = 0) {
        this.time = world.simTime || 0;
        this.simulationStep = world.lastSimulationStep || 1 / 30;
        this.revision = revision;
        this.environmentRevision = world.aiEnvironmentRevision || 0;
        this.game = { width: world.game.width, height: world.game.height };
        this.nodes = world.nodes.map(copyNode);
        const nodeMap = new Map(world.nodes.map((n, i) => [n, this.nodes[i]]));
        this.nodeIndices = new Map(world.nodes.map((n, i) => [n, i]));
        this.nodes.forEach((n, i) => { n.tunnelTo = nodeMap.get(world.nodes[i].tunnelTo) || null; });
        // Identity handles are for commit validation only, never read by predictors.
        this.liveUnits = world.allUnits.filter(u => !u.pendingRemoval);
        this.units = this.liveUnits.map((u, index) => {
            return { x: u.x, y: u.y, vx: u.vx, vy: u.vy, speed: u.speed, speedMult: u.speedMult,
                thornDamageTaken: u.thornDamageTaken, currentZoneMult: u.currentZoneMult, power: u.power, faction: u.faction, state: u.state,
                pendingRemoval: false, angle: u.angle, personalR: u.personalR, personalTheta: u.personalTheta,
                deterministicSeed: u.deterministicSeed, _lastTargetX: u._lastTargetX, _lastTargetY: u._lastTargetY,
                targetIndex: this.nodeIndices.get(u.targetNode) ?? -1, homeIndex: this.nodeIndices.get(u.homeNode) ?? -1,
                lastTargetIndex: this.nodeIndices.get(u._lastTargetNode) ?? -1, observationIndex: index };
        });
        this.hazards = (world.hazards || []).map(h => ({ ...h, _acidCounters: { ...h._acidCounters } }));
        this.zones = (world.zones || []).map(z => ({ ...z }));
        this.barriers = (world.barriers || []).map(b => ({ ...b }));
        this.intermittentBarriers = (world.intermittentBarriers || []).map(s => copySystem(s, nodeMap));
        this.waterSweeps = (world.waterSweeps || []).map(s => copySystem(s, nodeMap));
        this.lightSweeps = (world.lightSweeps || []).map(s => copySystem(s, nodeMap));
        this.modifiers = structuredClone(world.campaignModifiers || {});
        this.combatInterval = world.combatInterval || 0.7;
        this.serial = world.unitSequence ?? 0;
        this.surfaceStore = world.navigation?.store || null;
        this.idle = this.nodes.map(() => new Map());
        this.arrivals = this.nodes.map(() => []);
        for (const u of this.units) {
            if (u.targetIndex < 0) continue;
            if (u.state === 'idle') {
                const table = this.idle[u.targetIndex];
                if (!table.has(u.faction)) table.set(u.faction, []);
                table.get(u.faction).push(u.observationIndex);
            } else {
                const n = this.nodes[u.targetIndex];
                this.arrivals[u.targetIndex].push({ faction: u.faction, power: u.power || 1,
                    eta: Math.max(0, Math.hypot(n.x - u.x, n.y - u.y) - n.radius * 1.5)
                        / Math.max(1, u.speed * u.speedMult * (u.currentZoneMult || 1)) });
            }
        }
    }
}

export function* createForecastWorld(snapshot) {
    const nodes = snapshot.nodes.map(copyNode);
    const map = new Map(snapshot.nodes.map((n, i) => [n, nodes[i]]));
    nodes.forEach((n, i) => { n.tunnelTo = map.get(snapshot.nodes[i].tunnelTo) || null; });
    const allUnits = [];
    for (let i = 0; i < snapshot.units.length; i++) {
        const u = snapshot.units[i];
        const out = Object.assign(Object.create(Unit.prototype), u);
        out.sprite = null; out.targetNode = nodes[u.targetIndex] || null;
        out.homeNode = nodes[u.homeIndex] || null; out._lastTargetNode = nodes[u.lastTargetIndex] || null;
        allUnits.push(out);
        if (i % 8 === 7) yield 'clone';
    }
    const solver = new LocalAvoidanceSolver({});
    if (snapshot.surfaceStore) solver.setStaticStore(snapshot.surfaceStore);
    const world = {
        simTime: snapshot.time, game: snapshot.game, nodes, allUnits, gridSize: 30,
        grid: new SpatialHashGrid(snapshot.game.width, snapshot.game.height, 30, allUnits.length + 64),
        travelingIds: [], neighbors: [], navigation: { store: null, localAvoidanceSolver: solver },
        hazards: snapshot.hazards.map(h => ({ ...h, _acidCounters: { ...h._acidCounters } })),
        zones: snapshot.zones, barriers: snapshot.barriers,
        intermittentBarriers: snapshot.intermittentBarriers.map(s => copySystem(s, map)),
        waterSweeps: snapshot.waterSweeps.map(s => copySystem(s, map)),
        lightSweeps: snapshot.lightSweeps.map(s => copySystem(s, map)),
        campaignModifiers: snapshot.modifiers, combatInterval: snapshot.combatInterval,
        unitSequence: snapshot.serial,
        attachSprite: noop,
        nextUnitSeed(node, faction) {
            this.unitSequence = (this.unitSequence + 1) >>> 0;
            return mixSeeds(this.unitSequence, getNodeSeed(node) ^ hashStringSeed(faction));
        },
        positionUnitInNode(unit, node, radiusScale = 0.7, salt = 0) {
            placeUnitInCircle(unit, node.x, node.y, node.radius, mixSeeds(unit.deterministicSeed, salt), radiusScale);
        },
        spawnUnitsAt(node, faction, count) {
            for (let i = 0; i < count; i++) {
                const u = new Unit(node.x, node.y, faction, this.nextUnitSeed(node, faction));
                this.positionUnitInNode(u, node); u.targetNode = node; u.homeNode = node; this.allUnits.push(u);
            }
        },
    };
    if (snapshot.surfaceStore) world.grid.setSurfaceStore(snapshot.surfaceStore);
    return world;
}

/** Matches live update order, including stale counts during the current physical step. */
export function stepForecastWorld(world, dt, settled = false) {
    for (const _ of stepForecastWorldWork(world, dt, settled)) {}
}

export function* stepForecastWorldWork(world, dt, settled = false) {
    world.simTime += dt;
    for (const g of world.intermittentBarriers) g.update(dt, world.game.width, world.game.height);
    yield* updateNodeCountsWork(world);
    if (!settled) {
        yield* PhysicsManager.updateGridWork(world);
        yield* PhysicsManager.updatePhysicsWork(world, dt);
        PhysicsManager.processArrivals(world);
    }
    for (const sweep of world.waterSweeps) sweep.update(dt, world.allUnits, world.nodes, world.game);
    for (const sweep of world.lightSweeps) sweep.update(dt, world.allUnits, world.nodes, world.game);
    for (let i = 0; i < world.nodes.length; i++) {
        CombatManager.processCombat(world, i, dt, null);
        processRegen(world, world.nodes[i], dt);
        world.nodes[i].update?.(dt, world.grid, world.allUnits, graphics, null, null);
        yield 'node';
    }
    for (let i = world.allUnits.length - 1; i >= 0; i--) {
        if (world.allUnits[i].pendingRemoval) {
            const last = world.allUnits.length - 1;
            if (i !== last) world.allUnits[i] = world.allUnits[last];
            world.allUnits.pop();
        }
    }
}
