import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld } from './helpers/rts-world.js';
import { RTSAIRuntime, FactionAIState, OperationPlan } from '../src/simulation/rts_ai_runtime.js';
import { TacticalObservation, TacticalDecision, sourceRetention, planTactical, unitPower } from '../src/simulation/rts_tactical.js';
import { WorldSnapshot } from '../src/simulation/rts_snapshot.js';
import { issueTroopOrder, updateNodeCounts } from '../src/simulation/rts_world_rules.js';
import { resolveAIProfile } from '../src/simulation/ai_config.js';

for (const difficulty of ['easy', 'normal', 'hard']) {
    test(`${difficulty}: a capture crew finishes its objective while another force acts`, () => {
        const w = makeWorld({ nodes: [{ x: 300, y: 100, owner: 'neutral', forces: { enemy: 50 } },
            { x: 100, y: 300, owner: 'enemy', count: 90 }, { x: 600, y: 100, owner: 'player', count: 3 }] });
        w.nodes[0].conqueringFaction = 'enemy'; w.nodes[0].conquestProgress = .8;
        const state = new FactionAIState('enemy', difficulty), profile = resolveAIProfile(null, null, 'enemy', difficulty);
        const r = planTactical(new TacticalObservation(w), state, profile, new Set(), 'player');
        assert.ok(r.decision, 'the free force must remain active');
        assert.ok(r.decision.orders.every(o => o.source !== 0), 'arrival is not release from capture duty');
        const before = sourceRetention(new TacticalObservation(w), state, profile, 0);
        assert.equal(before.locked.size, 50);
        w.nodes[0].owner = 'enemy'; w.nodes[0].conqueringFaction = null; w.nodes[0].conquestProgress = 0;
        const after = sourceRetention(new TacticalObservation(w), state, profile, 0);
        assert.equal(after.locked.size, 0, 'no arbitrary waiting timer after capture');
        assert.ok(after.minimumPower >= 10 && after.minimumPower < 50, 'a useful surplus is released');
    });
    test(`${difficulty}: attacking does not strip the frontier down to one ant`, () => {
        const w = makeWorld({ nodes: [{ x: 100, y: 100, owner: 'enemy', count: 90 }, { x: 400, y: 100, owner: 'player', count: 3 }] });
        const ai = new RTSAIRuntime({ worldRef: w, difficulty, budgetMs: 1000, planningBudgetMs: 0 });
        ai.updateAll(0, ['enemy']);
        assert.ok(ai.metrics.orders > 0, 'retaining control must not stop the offensive');
        const kept = w.allUnits.filter(u => u.faction === 'enemy' && u.state === 'idle');
        assert.ok(unitPower(kept) >= 10);
        assert.equal(ai.states.get('enemy').tacticalHistory[0].retentionReason, 'frontier_control');
    });
}

test('observed attackers beyond the old target-dependent window still require a garrison', () => {
    const w = makeWorld({ nodes: [{ x: 100, y: 100, owner: 'enemy', count: 120 },
        { x: 200, y: 350, owner: 'neutral', count: 0 }, { x: 650, y: 100, owner: 'player', count: 90 }] });
    issueTroopOrder(w, w.nodes[2], w.nodes[0], 80, 'player');
    const state = new FactionAIState('enemy', 'hard'), profile = resolveAIProfile(null, null, 'enemy', 'hard');
    const view = new TacticalObservation(w), r = planTactical(view, state, profile, new Set(), 'player');
    assert.ok(sourceRetention(view, state, profile, 0).minimumPower >= 80);
    if (r.decision) for (const o of r.decision.orders) if (o.source === 0 && r.decision.purpose !== 'evacuation') {
        assert.ok(120 - unitPower(o.selected) >= 80);
    }
});

test('numerical pressure alone does not trigger evacuation from a sustainable position', () => {
    const w = makeWorld({ nodes: [{ x: 100, y: 100, owner: 'enemy', count: 60 },
        { x: 100, y: 300, owner: 'enemy', count: 5 }, { x: 500, y: 100, owner: 'player', count: 80 }] });
    issueTroopOrder(w, w.nodes[2], w.nodes[0], 70, 'player');
    const state = new FactionAIState('enemy', 'hard'), profile = resolveAIProfile(null, null, 'enemy', 'hard');
    const r = planTactical(new TacticalObservation(w), state, profile, new Set(), 'player');
    assert.ok(!r.decision || r.decision.purpose !== 'evacuation');
});

test('a genuinely doomed position may evacuate its committed capture crew', () => {
    const w = makeWorld({ nodes: [{ x: 100, y: 100, owner: 'neutral', forces: { enemy: 20, player: 100 } },
        { x: 300, y: 100, owner: 'enemy', count: 10 }] });
    w.nodes[0].conqueringFaction = 'enemy'; w.nodes[0].conquestProgress = .3;
    const state = new FactionAIState('enemy', 'hard'), profile = resolveAIProfile(null, null, 'enemy', 'hard');
    const r = planTactical(new TacticalObservation(w), state, profile, new Set(), 'player');
    assert.equal(r.decision?.purpose, 'evacuation');
    assert.equal(r.decision.orders[0].selected.length, 20);
});

test('physical fallback cannot bypass capture commitments at dispatch', () => {
    const w = makeWorld({ nodes: [{ x: 100, y: 100, owner: 'neutral', forces: { enemy: 40 } },
        { x: 300, y: 100, owner: 'player', count: 3 }] });
    const snapshot = new WorldSnapshot(w), state = new FactionAIState('enemy', 'hard');
    const op = new OperationPlan(1, 'enemy', 1, 'conquest', 0);
    op.orders = [{ source: 0, target: 1, units: snapshot.idle[0].get('enemy').slice(0, 35), delay: 0 }];
    op.forecast = { arrived: 35, owner: 'enemy' };
    const ai = new RTSAIRuntime({ worldRef: w, difficulty: 'hard' });
    ai._acceptForecast({ state, operation: op, snapshot });
    assert.equal(ai.metrics.orders, 0);
    assert.equal(state.tacticalOrders[0].reason, 'source_commitment_changed');
});

test('captured nodes under observed pressure enter consolidation instead of ending the operation', () => {
    const w = makeWorld({ nodes: [{ x: 100, y: 100, owner: 'enemy', count: 70 },
        { x: 600, y: 100, owner: 'player', count: 30 }] });
    const state = new FactionAIState('enemy', 'hard'), d = new TacticalDecision('enemy', 0, 'conquest', 0, .5);
    d.state = 'dispatch'; d.sent = w.allUnits.filter(u => u.faction === 'enemy'); state.tacticalOrders.push(d);
    issueTroopOrder(w, w.nodes[1], w.nodes[0], 25, 'player');
    const ai = new RTSAIRuntime({ worldRef: w, difficulty: 'hard' });
    ai._trackTactics(new TacticalObservation(w), state);
    assert.equal(d.state, 'consolidation');
    w.allUnits.filter(u => u.faction === 'player').forEach(u => { u.pendingRemoval = true; }); updateNodeCounts(w);
    ai._trackTactics(new TacticalObservation(w), state);
    assert.equal(d.state, 'completed');
});


test('sector 2 level 7 stages through auxiliary and core instead of geometric proximity', async () => {
    const { sector2 } = await import('../src/data/levels/sector2.js');
    const { levelFixture } = await import('./helpers/level-fixture.js');
    const { routeFromOrigin } = await import('../src/simulation/rts_tactical.js');
    const w = levelFixture(sector2, sector2.levels[1]);
    for (const n of w.nodes) if (n.owner === 'neutral') n.owner = 'enemy';
    const i = w.nodes.findIndex(n => n.id === 'enemy_front_top');
    const route = routeFromOrigin(new TacticalObservation(w), 'enemy', resolveAIProfile(w.aiStrategy, null, 'enemy', 'hard'), i);
    assert.ok(route);
    assert.deepEqual(route.stages.slice(0, 2).map(j => w.nodes[j].id), ['neutral_aux_top', 'enemy_core']);
});
