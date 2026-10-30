import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldSnapshot, createForecastWorld, stepForecastWorld } from '../src/simulation/rts_snapshot.js';
import { forecastOperation, departureWindow } from '../src/simulation/rts_forecast.js';
import { RTSAIRuntime, FactionAIState, OperationPlan } from '../src/simulation/rts_ai_runtime.js';
import { resolveAIProfile } from '../src/simulation/ai_config.js';
import { issueTroopOrder } from '../src/simulation/rts_world_rules.js';
import { IntermittentBarrier } from '../src/systems/intermittent_barrier.js';
import { LightSweep } from '../src/systems/light_sweep.js';
import { WaterSweep } from '../src/systems/water_sweep.js';
import { UtilityEngine } from '../src/simulation/utility_engine.js';
import { scanDoomsdayThreats } from '../src/simulation/ai_doomsday.js';
import { makeWorld, stepWorld, finish } from './helpers/rts-world.js';
import { settleForecast } from '../src/simulation/rts_settled_forecast.js';
import { ForecastWorkerService } from '../src/simulation/rts_worker_service.js';
import { Worker } from 'node:worker_threads';
import { packUnits, unpackUnits } from '../src/simulation/rts_unit_layout.js';

test('no phantom imminent hazard on construction, easy scan, or reset', () => {
    const engine = new UtilityEngine(null, null, null); engine.setArchetype('easy');
    assert.ok(engine._doomsdayTTI.every(t => t === -1));
    engine._doomsdayTTI[0] = 0;
    scanDoomsdayThreats(engine, [], 'enemy', {});
    assert.equal(engine._doomsdayTTI[0], -1);
    engine._neutralizeTTI[0] = 0; engine.reset();
    assert.equal(engine._neutralizeTTI[0], -1);
});

test('permanent wall is forbidden; temporary gate remains a physical graph edge', () => {
    const wall = { x: 0.25, y: 0, width: 0.025, height: 1 };
    const world = makeWorld({ barriers: [wall] });
    assert.equal(departureWindow(new WorldSnapshot(world), 0, 1).status, 'forbidden');
    assert.equal(issueTroopOrder(world, world.nodes[0], world.nodes[1], 10, 'enemy'), 0);
    const gate = new IntermittentBarrier({ interval: 12, zones: [wall, { ...wall, hidden: true }] });
    const gated = makeWorld({ gates: [gate] });
    assert.equal(gated.navigation.store.edgeCount, 2);
    const window = departureWindow(new WorldSnapshot(gated), 0, 1);
    assert.equal(window.status, 'available_later'); assert.ok(window.delay >= 11.9);
    assert.equal(gate.activeZoneIndex, 0); assert.equal(Math.abs(gate.timer), 0);
});

for (const scenario of ['plain', 'poison', 'zones', 'three_factions', 'thorn', 'artillery', 'water', 'light', 'gate', 'mobile', 'tunnel']) {
    test(`live/reference parity and isolation: ${scenario}`, () => {
        const options = { seed: 17 };
        if (scenario === 'poison') options.hazards = [{ shape: 'rect_puddle', x: -2, y: -2, width: 6, height: 6, dps: 4.5 }];
        if (scenario === 'zones') options.zones = [{ x: 0.17, y: 0, width: 0.15, height: 1, speedMult: 0.3 },
            { x: 0, y: 0, width: 1, height: 1, speedMult: 2 }];
        if (scenario === 'water') options.water = [new WaterSweep({ initialDelay: 0.5, speed: 100 })];
        if (scenario === 'light') options.light = [new LightSweep({ initialDelay: 0.2, rails: [0.36], seed: 3 })];
        if (scenario === 'gate') options.gates = [new IntermittentBarrier({ interval: 1.5,
            zones: [{ x: 0.25, y: 0, width: 0.02, height: 1 }, { hidden: true }] })];
        const world = makeWorld(options);
        if (scenario === 'three_factions') world.spawnUnitsAt(world.nodes[1], 'fuego', 22);
        if (scenario === 'thorn') world.nodes[1].evolution = 'espinoso';
        if (scenario === 'artillery') world.nodes[1].completeEvolution('artilleria');
        if (scenario === 'light') world.nodes[1].isMarkedForSweep = true;
        if (scenario === 'mobile') Object.assign(world.nodes[1], { isMobile: true, orbitAnchorX: 0.4,
            orbitAnchorY: 0.36, orbitRadiusX: 0.05, orbitRadiusY: 0.05, orbitSpeed: 0.5 });
        if (scenario === 'tunnel') { world.nodes[0].tunnelTo = world.nodes[1]; world.nodes[1].owner = 'enemy'; }
        const snapshot = new WorldSnapshot(world);
        const shadow = finish(createForecastWorld(snapshot));
        for (let tick = 0; tick < 240; tick++) { stepWorld(world); stepForecastWorld(shadow, 1 / 30); }
        assert.deepEqual(shadow.nodes.map(n => [n.owner, n.conquestProgress, n.evolution]),
            world.nodes.map(n => [n.owner, n.conquestProgress, n.evolution]));
        assert.equal(shadow.allUnits.length, world.allUnits.length);
        for (let i = 0; i < world.allUnits.length; i++) {
            assert.equal(shadow.allUnits[i].x, world.allUnits[i].x);
            assert.equal(shadow.allUnits[i].y, world.allUnits[i].y);
            assert.equal(shadow.allUnits[i].faction, world.allUnits[i].faction);
        }
        assert.equal(snapshot.time, 0);
        assert.equal(snapshot.nodes[0].regenTimer, 0);
    });
}

test('whole poisonous map: large cohort reaches and captures; tiny cohort cannot', () => {
    const world = makeWorld({ hazards: [{ shape: 'rect_puddle', x: -2, y: -2, width: 6, height: 6, dps: 4.5 }] });
    const snap = new WorldSnapshot(world);
    const ids = snap.idle[0].get('enemy');
    const result = finish(forecastOperation(snap, 'enemy', 1, [{ source: 0, units: ids, delay: 0 }]));
    assert.equal(result.status, 'viable'); assert.ok(result.arrived > 0); assert.ok(result.transitLosses > 0);
    const tiny = finish(forecastOperation(snap, 'enemy', 1, [{ source: 0, units: ids.slice(0, 2), delay: 0 }]));
    assert.notEqual(tiny.status, 'viable');
    assert.equal(world.allUnits.length, snap.units.length);
    assert.ok(world.allUnits.every(u => u.state === 'idle'));
});

test('forecast arrivals match actual scripted dispatch with same physical steps', () => {
    for (let seed = 1; seed <= 20; seed++) {
        const world = makeWorld({ seed, hazards: [{ shape: 'rect_puddle', x: -2, y: -2, width: 6, height: 6, dps: 4.5 }] });
        const snap = new WorldSnapshot(world);
        const ids = snap.idle[0].get('enemy');
        const forecast = finish(forecastOperation(snap, 'enemy', 1, [{ source: 0, units: ids, delay: 0 }]));
        const cohort = [...world.allUnits.filter(u => u.faction === 'enemy')];
        issueTroopOrder(world, world.nodes[0], world.nodes[1], ids.length, 'enemy');
        const arrived = new Set();
        for (let tick = 0; tick < 450; tick++) {
            stepWorld(world);
            for (const u of cohort) if (!u.pendingRemoval && u.state === 'idle' && u.targetNode === world.nodes[1]) arrived.add(u);
        }
        assert.equal(forecast.arrived, arrived.size, `seed ${seed}`);
    }
});

test('faction without a nest is retained; >32 nests and independent fair scheduling', () => {
    const nodes = Array.from({ length: 42 }, (_, i) => ({ x: 60 + i % 7 * 100, y: 45 + Math.floor(i / 7) * 70,
        owner: i === 40 ? 'enemy' : i === 41 ? 'fuego' : 'neutral', count: i >= 40 ? 60 : 0 }));
    const world = makeWorld({ nodes, strategy: { diplomacyMode: 'controlledFreeForAll' } });
    const ai = new RTSAIRuntime({ worldRef: world, workQuota: 8, budgetMs: 1000, planningBudgetMs: 1000 });
    for (let tick = 0; tick < 80; tick++) { world.simTime += 1 / 30; ai.updateAll(1 / 30, ['enemy', 'fuego']); }
    const a = ai.states.get('enemy'), b = ai.states.get('fuego');
    assert.ok(a.tacticalVisits > 0 && b.tacticalVisits > 0);
    assert.ok(Math.abs(a.tacticalVisits - b.tacticalVisits) <= 2);
    assert.ok(a.cursor > 0 && b.cursor > 0);
    world.nodes[40].owner = 'neutral'; a.job = null; a.nextStrategy = 0;
    ai.updateAll(1 / 30, ['enemy', 'fuego']);
    assert.ok(a.tacticalOrders.length || a.idleReason);
});

test('exact order counts, no double spend, no future order mutation', () => {
    const world = makeWorld();
    assert.equal(issueTroopOrder(world, world.nodes[0], world.nodes[1], 89, 'enemy'), 89);
    assert.equal(issueTroopOrder(world, world.nodes[0], world.nodes[1], 89, 'enemy'), 0);
    assert.equal(world.allUnits.filter(u => u.faction === 'enemy' && u.state === 'idle').length, 1);
});

test('observation records movements from player and another AI without a global reaction lock', () => {
    const world = makeWorld({ nodes: [{ x: 90, y: 100, owner: 'enemy', count: 70 },
        { x: 300, y: 100, owner: 'player', count: 50 }, { x: 500, y: 100, owner: 'fuego', count: 40 }] });
    const ai = new RTSAIRuntime({ worldRef: world, difficulty: 'easy', budgetMs: 1000 });
    ai.updateAll(0, ['enemy', 'fuego']);
    issueTroopOrder(world, world.nodes[1], world.nodes[0], 25, 'player');
    issueTroopOrder(world, world.nodes[2], world.nodes[0], 10, 'fuego');
    world.simTime = .1; ai.updateAll(.1, ['enemy', 'fuego']);
    assert.ok(ai.events.some(e => e.type === 'movement' && e.factions.includes('player')));
    assert.ok(ai.events.some(e => e.factions.includes('fuego')));
    assert.ok(ai.events.length <= 64);
});

test('stationary reduction preserves separate three-way combat, training and capture', () => {
    for (let seed = 1; seed <= 20; seed++) {
        const world = makeWorld({ seed, nodes: [{ x: 200, y: 180, owner: 'enemy', forces: { enemy: 40, player: 35, fuego: 20 } }] });
        const snapshot = new WorldSnapshot(world), shadow = finish(createForecastWorld(snapshot));
        const result = { orders: [], capturedAt: null, held: false };
        const reduced = finish(settleForecast(shadow, 'absent', 0, 0, 20, 0, result, 1 / 30));
        for (let t = 0; t < 20; t += 1 / 30) stepWorld(world);
        assert.equal(reduced.owner, world.nodes[0].owner);
        assert.equal(shadow.nodes[0].conquestProgress, world.nodes[0].conquestProgress);
        for (const [f, count] of Object.entries(reduced.finalForces)) {
            assert.equal(count, world.allUnits.filter(u => u.faction === f).length);
        }
    }
});

test('runtime records expansion and explicit resource handles without playing a match', () => {
    const world = makeWorld();
    const ai = new RTSAIRuntime({ worldRef: world, difficulty: 'normal', budgetMs: 1000 });
    ai.updateAll(0, ['enemy']);
    const state = ai.states.get('enemy');
    assert.ok(ai.metrics.orders > 0);
    assert.ok(state.tacticalHistory.some(op => op.purpose === 'expansion'));
    const sent = state.tacticalOrders.flatMap(d => d.sent);
    assert.equal(new Set(sent).size, sent.length);
    ai._release(state, 'test_cancel');
    assert.equal(state.tacticalOrders.length, 0);
    assert.ok(sent.every(u => u.targetNode === world.nodes[1]));
});

test('allied target exclusions and names of other factions are respected', () => {
    const world = makeWorld({ nodes: [{ x: 100, y: 180, owner: 'enemy', count: 80 },
        { x: 300, y: 180, owner: 'fuego', count: 3 }, { x: 500, y: 180, owner: 'neutral', count: 0 }],
        strategy: { diplomacyMode: 'custom', diplomacy: { enemy: { allyTo: ['fuego'], hostileTo: ['neutral'] } } } });
    const ai = new RTSAIRuntime({ worldRef: world, workQuota: 0, budgetMs: 1000, planningBudgetMs: 1000 });
    ai.updateAll(1 / 30, ['enemy']);
    const state = ai.states.get('enemy');
    assert.ok(state.tacticalHistory.length > 0);
    assert.ok(state.tacticalHistory.every(c => c.target !== 1));
});

test('worker uses the same exact forecast, bounded requests, cancellation and reset', async () => {
    const world = makeWorld({ hazards: [{ shape: 'rect_puddle', x: -2, y: -2, width: 6, height: 6, dps: 4.5 }] });
    const snapshot = new WorldSnapshot(world);
    const orders = [{ source: 0, target: 1, units: snapshot.idle[0].get('enemy'), delay: 0 }];
    const reference = finish(forecastOperation(snapshot, 'enemy', 1, orders));
    const service = new ForecastWorkerService(url => new Worker(url, { type: 'module' }));
    try {
        const record = service.request(snapshot, 'enemy', 1, orders, {});
        const deadline = Date.now() + 20000;
        while (!record.done && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
        assert.equal(record.error, undefined); assert.ok(record.done);
        assert.equal(record.result.arrived, reference.arrived);
        assert.equal(record.result.survivors, reference.survivors);
        assert.equal(record.result.status, reference.status);
        const pending = Array.from({ length: 6 }, () => service.request(snapshot, 'enemy', 1, orders, {}));
        assert.equal(service.request(snapshot, 'enemy', 1, orders, {}), null);
        for (const request of pending) service.cancel(request);
        assert.equal(service.pending.size, 0);
        service.reset(); assert.equal(service.pending.size, 0);
    } finally { service.dispose(); }
});

test('faction iteration order cannot leak another faction future commands', () => {
    const run = factions => {
        const world = makeWorld({ nodes: [{ x: 100, y: 100, owner: 'enemy', count: 35 },
            { x: 500, y: 100, owner: 'fuego', count: 35 }, { x: 300, y: 300, owner: 'neutral', count: 2 }],
            strategy: { diplomacyMode: 'controlledFreeForAll' } });
        const ai = new RTSAIRuntime({ worldRef: world, workQuota: 32, budgetMs: 1000, planningBudgetMs: 1000 });
        for (let i = 0; i < 40; i++) { world.simTime += 1 / 30; ai.updateAll(1 / 30, factions); }
        return [...ai.states].sort(([a], [b]) => a.localeCompare(b)).map(([f, s]) => ({ faction: f, visits: s.visits,
            cursor: s.cursor, target: s.job?.operation.target, revision: s.job?.snapshot.revision }));
    };
    assert.deepEqual(run(['enemy', 'fuego']), run(['fuego', 'enemy']));
});

test('binary worker transport preserves exact unit state and composition', () => {
    const world = makeWorld();
    world.allUnits[0].power = 3; world.allUnits[1].speedMult = 2;
    const snapshot = new WorldSnapshot(world);
    assert.deepEqual(unpackUnits(packUnits(snapshot.units)), snapshot.units);
});

test('waiting dispatch uses the absolute forecast clock, not the completion time of the worker', () => {
    const world = makeWorld({ hazards: [{ shape: 'rect_puddle', x: 2, y: 2, width: .1, height: .1, dps: 1 }] });
    const snapshot = new WorldSnapshot(world);
    const ai = new RTSAIRuntime({ worldRef: world });
    const state = new FactionAIState('enemy', 'normal'); state.profile = resolveAIProfile(null, null, 'enemy', 'normal');
    const op = new OperationPlan(1, 'enemy', 1, 'expansion', 0);
    op.orders = [{ source: 0, target: 1, units: snapshot.idle[0].get('enemy').slice(0, 20), delay: 1, speed: 75 }];
    ai.time = .5; ai._accept({ state, operation: op, snapshot });
    ai.time = .9; ai._trackOperation(state);
    assert.equal(op.sent.length, 0);
    ai.time = 1; ai._trackOperation(state);
    assert.equal(op.sent.length, 20);
});

test('expired environmental forecast cannot dispatch or grow a thinking delay', () => {
    const world = makeWorld({ hazards: [{ shape: 'rect_puddle', x: 2, y: 2, width: .1, height: .1, dps: 1 }] });
    const snapshot = new WorldSnapshot(world);
    const ai = new RTSAIRuntime({ worldRef: world });
    const state = new FactionAIState('enemy', 'normal');
    const op = new OperationPlan(1, 'enemy', 1, 'expansion', 0);
    op.orders = [{ source: 0, target: 1, units: snapshot.idle[0].get('enemy').slice(0, 20), delay: .5, speed: 75 }];
    ai.time = 2; ai._accept({ state, operation: op, snapshot });
    assert.equal(op.state, 'cancelled'); assert.equal(op.reason, 'forecast_expired');
    assert.equal(state.forecastLead, 0); assert.equal(op.sent.length, 0);
});
