import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, finish } from './helpers/rts-world.js';
import { RTSAIRuntime, FactionAIState, OperationPlan } from '../src/simulation/rts_ai_runtime.js';
import { TacticalDecision, TacticalObservation, DIFFICULTY_PROFILES, planTactical, assessTransfer, projectNode, containsHazard, mayCounterattack } from '../src/simulation/rts_tactical.js';
import { resolveAIProfile, mergeAIStrategy } from '../src/simulation/ai_config.js';
import { WorldSnapshot } from '../src/simulation/rts_snapshot.js';
import { forecastOperation } from '../src/simulation/rts_forecast.js';
import { issueTroopOrder, updateNodeCounts } from '../src/simulation/rts_world_rules.js';
import { IntermittentBarrier } from '../src/systems/intermittent_barrier.js';

const runtime = (world, difficulty = 'normal') => new RTSAIRuntime({ worldRef: world, difficulty, budgetMs: 1000, planningBudgetMs: 0 });
function propose(world, difficulty = 'normal', reserved = new Set()) {
    const state = new FactionAIState('enemy', difficulty);
    return planTactical(new TacticalObservation(world), state, resolveAIProfile(world.aiStrategy, null, 'enemy', difficulty), reserved, 'player');
}

for (const difficulty of Object.keys(DIFFICULTY_PROFILES)) {
    test(`${difficulty}: accessible neutral produces an order without a worker`, () => {
        const w = makeWorld(), ai = runtime(w, difficulty);
        ai.updateAll(0, ['enemy']);
        assert.ok(ai.metrics.orders > 0);
        assert.equal(ai.metrics.forecasts, 0);
        assert.equal(ai.states.get('enemy').tacticalHistory[0].purpose, 'expansion');
        assert.ok(w.allUnits.some(u => u.state === 'traveling' && u.targetNode === w.nodes[1]));
    });
    test(`${difficulty}: event-to-order latency measured from an external change`, () => {
        const w = makeWorld({ nodes: [{ x: 100, y: 180, owner: 'enemy', count: 90 },
            { x: 310, y: 180, owner: 'player', count: 250 }] });
        w.allowEvolutions = false;
        const ai = runtime(w, difficulty); ai.updateAll(0, ['enemy']);
        assert.equal(ai.metrics.orders, 0);
        const eventTime = .071;
        w.allUnits.filter(u => u.faction === 'player').slice(2).forEach(u => { u.pendingRemoval = true; });
        updateNodeCounts(w);
        let orderTime;
        for (let i = 0; i < 40; i++) {
            w.simTime = eventTime + i * .01; ai.updateAll(.01, ['enemy']);
            if (ai.metrics.orders) { orderTime = w.simTime; break; }
        }
        assert.ok(orderTime !== undefined, 'must exploit exposed enemy instead of accumulating forever');
        assert.ok((orderTime - eventTime) * 1000 <= DIFFICULTY_PROFILES[difficulty].urgentMs);
        assert.equal(ai.states.get('enemy').tacticalHistory.at(-1).purpose, 'exploit');
    });
}

test('an unfinished strategic forecast cannot lock an independent tactical order', () => {
    const w = makeWorld(), ai = runtime(w);
    const state = new FactionAIState('enemy', 'normal'); ai.states.set('enemy', state);
    state.job = { started: 0, snapshot: { revision: 0 }, operation: { cancel() {} }, iterator: (function* () { while (true) yield 'waiting_worker'; })() };
    ai.updateAll(0, ['enemy']);
    assert.ok(ai.metrics.orders > 0); assert.ok(state.job);
});

test('a closed gate reserves a cohort, not the whole faction', () => {
    const gate = new IntermittentBarrier({ interval: 8, zones: [{ x: .24, y: 0, width: .03, height: .5 }, { x: .8, y: 0, width: .03, height: .5 }] });
    const w = makeWorld({ gates: [gate], nodes: [{ x: 100, y: 80, owner: 'enemy', count: 90 },
        { x: 310, y: 80, owner: 'neutral', count: 3 }, { x: 100, y: 400, owner: 'enemy', count: 90 },
        { x: 310, y: 400, owner: 'neutral', count: 3 }] });
    const ai = runtime(w, 'normal'); ai.updateAll(0, ['enemy']);
    const state = ai.states.get('enemy');
    assert.ok(state.tacticalOrders.some(d => d.state === 'waiting'));
    assert.ok(state.tacticalHistory.some(d => d.target === 3));
    const reserved = state.tacticalOrders.flatMap(d => d.orders.filter(o => !o.sent).flatMap(o => o.selected));
    assert.equal(new Set(reserved).size, reserved.length);
    assert.ok(reserved.every(u => u.state === 'idle'));
});

test('departure uses planning time even when the opportunity was observed earlier', () => {
    const w = makeWorld(), ai = runtime(w), state = new FactionAIState('enemy', 'normal');
    const d = new TacticalDecision('enemy', 1, 'expansion', 5, 5.6);
    d.observedAt = 1; d.targetOwner = 'neutral';
    d.orders = [{ source: 0, selected: w.allUnits.filter(u => u.faction === 'enemy').slice(0, 40), delay: 2 }];
    w.simTime = 5; ai._dispatchTactical(new TacticalObservation(w), state, d);
    assert.equal(d.orders[0].departureAt, 7); assert.equal(d.sent.length, 0);
});

test('military evacuation retains forces from an untenable nest', () => {
    const w = makeWorld({ nodes: [{ x: 100, y: 100, owner: 'enemy', forces: { enemy: 20, player: 90 } },
        { x: 300, y: 100, owner: 'enemy', count: 10 }] });
    const r = propose(w); assert.equal(r.decision?.purpose, 'evacuation');
    assert.equal(r.decision.orders[0].selected.length, 20);
});

test('defense preempts unissued reservations and leaves traveling destinations intact', () => {
    const w = makeWorld({ nodes: [{ x: 100, y: 100, owner: 'enemy', count: 80 },
        { x: 300, y: 100, owner: 'enemy', count: 2 }, { x: 500, y: 100, owner: 'player', count: 70 },
        { x: 200, y: 300, owner: 'neutral', count: 4 }] });
    const ai = runtime(w), state = new FactionAIState('enemy', 'normal');
    const d = new TacticalDecision('enemy', 3, 'expansion', 0, 1); d.targetOwner = 'neutral'; d.state = 'waiting';
    d.orders = [{ source: 0, selected: w.allUnits.filter(u => u.faction === 'enemy' && u.targetNode === w.nodes[0]).slice(0, 60), delay: 8 }];
    state.tacticalOrders.push(d); ai.states.set('enemy', state);
    issueTroopOrder(w, w.nodes[2], w.nodes[1], 65, 'player');
    const sent = w.allUnits.filter(u => u.state === 'traveling');
    ai.updateAll(0, ['enemy']);
    assert.equal(d.reason, 'defense_preemption');
    assert.ok(state.tacticalHistory.some(h => h.purpose === 'defense'));
    assert.ok(sent.every(u => u.targetNode === w.nodes[1]));
});

test('difficulty coordination limits are actually used on the same defended objective', () => {
    const world = count => makeWorld({ nodes: [{ x: 100, y: 100, owner: 'enemy', count },
        { x: 100, y: 200, owner: 'enemy', count }, { x: 100, y: 300, owner: 'enemy', count },
        { x: 350, y: 200, owner: 'player', count: 80 }] });
    // Each source now retains its frontier garrison; the comparison still
    // differs only by coordination, with identical forces for both modes.
    assert.equal(propose(world(75), 'easy').decision, null);
    assert.equal(propose(world(75), 'normal').decision.orders.length, 2);
    assert.equal(propose(world(55), 'normal').decision, null);
    assert.equal(propose(world(55), 'hard').decision.orders.length, 3);
});

test('already committed conquest does not attract duplicate reinforcement waves', () => {
    const w = makeWorld({ nodes: [{ x: 100, y: 100, owner: 'enemy', count: 90 },
        { x: 100, y: 300, owner: 'enemy', count: 90 }, { x: 300, y: 200, owner: 'neutral', count: 3 }] });
    const ai = runtime(w, 'hard'); ai.updateAll(0, ['enemy']);
    assert.equal(ai.states.get('enemy').tacticalHistory.filter(h => h.target === 2).length, 1);
});

test('permanent walls never become imaginary routes', () => {
    const w = makeWorld({ barriers: [{ x: .24, y: 0, width: .04, height: 1 }] });
    assert.equal(propose(w).decision, null);
    assert.equal(assessTransfer(new TacticalObservation(w), 0, 1, 'enemy', w.allUnits.filter(u => u.faction === 'enemy')).status, 'forbidden');
});

test('a thin poison strip is detected and losses use the shared kill budget', () => {
    const w = makeWorld({ hazards: [{ shape: 'rect_puddle', x: .251, y: 0, width: .0001, height: 1, dps: 40 }] });
    const view = new TacticalObservation(w), cohort = view.idle[0].get('enemy');
    const small = assessTransfer(view, 0, 1, 'enemy', cohort.slice(0, 10));
    const large = assessTransfer(view, 0, 1, 'enemy', cohort);
    assert.ok(large.lossUpper > 0);
    assert.ok(large.lossUpper <= small.lossUpper || small.lossUpper === 10);
});

test('flood islands, elliptical contours and ring holes retain their real meanings', () => {
    const game = { width: 800, height: 500 };
    const flood = { shape: 'flood', x: .5, y: .5, radius: .4, scaleY: .6, safeZones: [{ x: .5, y: .5, radius: .1 }] };
    assert.equal(containsHazard(flood, 400, 250, game), false);
    assert.equal(containsHazard(flood, 550, 250, game), true);
    assert.equal(containsHazard(flood, 400, 490, game), false);
    assert.equal(containsHazard({ ...flood, shape: 'ring', innerRadius: .15 }, 450, 250, game), false);
});

test('slow surfaces change arrival windows without changing the legal destination', () => {
    const w = makeWorld(), slow = makeWorld({ zones: [{ x: 0, y: 0, width: 1, height: 1, speedMult: .5 }] });
    const a = new TacticalObservation(w), b = new TacticalObservation(slow);
    assert.ok(assessTransfer(b, 0, 1, 'enemy', b.idle[0].get('enemy')).last > assessTransfer(a, 0, 1, 'enemy', a.idle[0].get('enemy')).last);
});

test('water, light and tunnel uncertainty are explicit, never invented as safe arrival', () => {
    const w = makeWorld({ water: [{ predictUnsafeUntil: () => 4 }] });
    let v = new TacticalObservation(w);
    assert.equal(assessTransfer(v, 0, 1, 'enemy', v.idle[0].get('enemy')).reason, 'water_window');
    w.waterSweeps = []; w.lightSweeps = [{ predictNodeNeutralization: () => 1 }]; v = new TacticalObservation(w);
    assert.equal(assessTransfer(v, 0, 1, 'enemy', v.idle[0].get('enemy')).reason, 'light_reset');
    w.lightSweeps = []; w.nodes[1].type = 'tunel'; w.nodes[1].owner = 'enemy'; w.nodes[1].tunnelTo = w.nodes[0]; v = new TacticalObservation(w);
    assert.equal(assessTransfer(v, 0, 1, 'enemy', v.idle[0].get('enemy')).reason, 'tunnel_exit');
});

test('three factions remain distinct in the tactical projection', () => {
    const w = makeWorld({ nodes: [{ x: 200, y: 180, owner: 'player', forces: { player: 40, enemy: 35, fuego: 30 } }] });
    const view = new TacticalObservation(w), result = projectNode(view, 0, 'enemy', [], { horizon: 2 });
    assert.deepEqual(Object.keys(result.groups).sort(), ['enemy', 'fuego', 'player']);
    assert.ok(result.groups.player < 40); assert.ok(result.groups.fuego < 30);
});

test('difficulty change releases unsent reservations and does not modify sent units', () => {
    const w = makeWorld(), ai = runtime(w); ai.updateAll(0, ['enemy']);
    const traveling = w.allUnits.filter(u => u.state === 'traveling');
    ai.setDifficulty('hard');
    assert.equal(ai.states.get('enemy').tacticalOrders.length, 0);
    assert.ok(traveling.every(u => u.targetNode === w.nodes[1]));
    assert.equal(ai.states.get('enemy').difficulty, 'hard');
});

test('all three modes can defend in time instead of waiting for strategic cadence', () => {
    for (const difficulty of ['easy', 'normal', 'hard']) {
        const w = makeWorld({ nodes: [{ x: 100, y: 100, owner: 'enemy', count: 90 },
            { x: 300, y: 100, owner: 'enemy', count: 2 }, { x: 700, y: 100, owner: 'player', count: 80 }] });
        w.allowEvolutions = false;
        const ai = runtime(w, difficulty);
        const state = new FactionAIState('enemy', difficulty); state.nextStrategy = 100;
        ai.states.set('enemy', state);
        issueTroopOrder(w, w.nodes[2], w.nodes[1], 70, 'player');
        w.simTime = .071;
        ai.updateAll(.01, ['enemy']);
        assert.ok(state.tacticalHistory.some(h => h.purpose === 'defense' && h.target === 1), difficulty);
    }
});

test('a late insufficient wave is rejected instead of feeding a lost defense', () => {
    const w = makeWorld({ width: 2000, nodes: [{ x: 100, y: 100, owner: 'enemy', count: 8 },
        { x: 1500, y: 100, owner: 'enemy', count: 2 }, { x: 1600, y: 100, owner: 'player', count: 100 }] });
    issueTroopOrder(w, w.nodes[2], w.nodes[1], 95, 'player');
    const result = propose(w);
    assert.ok(!result.decision || result.decision.purpose !== 'defense');
});

test('offensive front limits differ while every mode retains a useful action', () => {
    for (const [difficulty, limit] of [['easy', 1], ['normal', 2], ['hard', 3]]) {
        const w = makeWorld({ nodes: [{ x: 100, y: 50, owner: 'enemy', count: 90 },
            { x: 100, y: 220, owner: 'enemy', count: 90 }, { x: 100, y: 400, owner: 'enemy', count: 90 },
            { x: 400, y: 50, owner: 'neutral', count: 2 }, { x: 400, y: 220, owner: 'neutral', count: 2 },
            { x: 400, y: 400, owner: 'neutral', count: 2 }] });
        const ai = runtime(w, difficulty); ai.updateAll(0, ['enemy']);
        const decisions = ai.states.get('enemy').tacticalOrders.filter(d => ['expansion', 'conquest', 'exploit'].includes(d.purpose));
        assert.equal(new Set(decisions.map(d => d.target)).size, limit, difficulty);
    }
});

test('forecast validation accepts ordinary production and ignores unrelated evolution', () => {
    const w = makeWorld({ nodes: [{ x: 100, y: 100, owner: 'enemy', count: 90 },
        { x: 300, y: 100, owner: 'player', count: 4 }, { x: 600, y: 400, owner: 'neutral', count: 2 }] });
    const snapshot = new WorldSnapshot(w), ai = runtime(w), state = new FactionAIState('enemy', 'normal');
    const op = new OperationPlan(1, 'enemy', 1, 'conquest', 0);
    op.orders = [{ source: 0, target: 1, units: snapshot.idle[0].get('enemy').slice(0, 80), delay: .35 }];
    op.forecast = { arrived: 80, owner: 'enemy' };
    w.nodes[1].counts.player++; w.nodes[2].evolution = 'artilleria';
    w.simTime = .1; ai.time = .1; ai._acceptForecast({ state, operation: op, snapshot });
    assert.equal(state.tacticalOrders.length, 1);
    assert.equal(state.tacticalOrders[0].state, 'waiting');
    w.simTime = .35; ai._trackTactics(new TacticalObservation(w), state);
    assert.equal(state.tacticalOrders[0].sent.length, 80);
});

test('nested scenario overrides preserve faction difficulty instead of overwriting it', () => {
    const sector = { factions: { enemy: { difficultyOverrides: { easy: { aggressionMult: .3 }, hard: { aggressionMult: 1.2 } } } } };
    const level = { factions: { enemy: { difficultyOverrides: { hard: { preferredEvolution: 'tanque' } } } } };
    const merged = mergeAIStrategy(sector, level);
    assert.equal(resolveAIProfile(merged, null, 'enemy', 'hard').aggressionMult, 1.2);
    assert.equal(resolveAIProfile(merged, null, 'enemy', 'hard').preferredEvolution, 'tanque');
    assert.equal(resolveAIProfile(merged, null, 'enemy', 'easy').aggressionMult, .3);
});

test('fast conquest verdict agrees with the physical reference on twenty controlled openings', () => {
    for (let seed = 1; seed <= 20; seed++) {
        const w = makeWorld({ seed }), decision = propose(w).decision;
        assert.ok(decision);
        const snapshot = new WorldSnapshot(w);
        const ids = new Map(snapshot.liveUnits.map((u, i) => [u, i]));
        const orders = decision.orders.map(o => ({ source: o.source, target: o.target, delay: o.delay, units: o.selected.map(u => ids.get(u)) }));
        const exact = finish(forecastOperation(snapshot, 'enemy', decision.target, orders, { holdSeconds: 0, horizon: 40 }));
        assert.equal(exact.owner, decision.expected.owner, `seed ${seed}`);
        assert.ok(exact.arrived > 0, `seed ${seed}`);
    }
});

test('new hostile arrivals invalidate only the affected physical forecast', () => {
    const w = makeWorld(), snapshot = new WorldSnapshot(w), ai = runtime(w), state = new FactionAIState('enemy', 'normal');
    const op = new OperationPlan(1, 'enemy', 1, 'expansion', 0);
    op.orders = [{ source: 0, target: 1, units: snapshot.idle[0].get('enemy').slice(0, 40), delay: .35 }];
    op.forecast = { arrived: 40, owner: 'enemy' };
    w.nodes[1].counts.player = 60;
    ai.time = .1; ai._acceptForecast({ state, operation: op, snapshot });
    assert.equal(op.reason, 'new_military_evidence');
    assert.equal(state.tacticalOrders.length, 0);
    assert.equal(state.forecastLead, 0);
});

test('hypothetical rival orders respect scenario relations and difficulty depth', () => {
    const w = makeWorld({ nodes: [{ x: 100, y: 100, owner: 'enemy', count: 120 },
        { x: 300, y: 100, owner: 'neutral', count: 4 }, { x: 500, y: 100, owner: 'player', count: 20 },
        { x: 500, y: 300, owner: 'fuego', count: 20 }] });
    const view = new TacticalObservation(w);
    assert.equal(mayCounterattack(view, 'fuego', 'enemy', 'hard'), false);
    assert.equal(mayCounterattack(view, 'player', 'enemy', 'hard'), true);
    for (const [difficulty, expected] of [['easy', 0], ['normal', 1], ['hard', 2]]) {
        const state = new FactionAIState('enemy', difficulty);
        const r = planTactical(new TacticalObservation(w), state, resolveAIProfile(null, null, 'enemy', difficulty), new Set(), 'player', { targetNode: 1, priority: 2000 });
        assert.equal(r.decision.target, 1);
        assert.equal(r.decision.hypotheses.length, expected);
        assert.ok(r.decision.hypotheses.every(h => h.source === 2));
    }
});

test('mixed immediate and delayed sources retain reservations after the first launch', () => {
    const w = makeWorld({ nodes: [{ x: 100, y: 100, owner: 'enemy', count: 40 },
        { x: 100, y: 300, owner: 'enemy', count: 40 }, { x: 300, y: 200, owner: 'neutral', count: 3 }] });
    const state = new FactionAIState('enemy', 'normal'), ai = runtime(w);
    const d = new TacticalDecision('enemy', 2, 'expansion', 0, .6); d.targetOwner = 'neutral';
    d.orders = [0, 1].map(source => ({ source, selected: w.allUnits.filter(u => u.faction === 'enemy' && u.targetNode === w.nodes[source]).slice(0, 30), delay: source === 0 ? 2 : 0 }));
    ai._dispatchTactical(new TacticalObservation(w), state, d);
    assert.equal(d.state, 'waiting');
    assert.equal(d.sent.length, 30);
    assert.ok(d.orders[0].selected.every(u => u.state === 'idle'));
    assert.ok(d.orders[1].selected.every(u => u.targetNode === w.nodes[2] && u.state === 'traveling'));
});
