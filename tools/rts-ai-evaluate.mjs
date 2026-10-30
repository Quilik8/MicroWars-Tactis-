import fs from 'node:fs';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { makeWorld, stepWorld, finish } from '../tests/helpers/rts-world.js';
import { RTSAIRuntime } from '../src/simulation/rts_ai_runtime.js';
import { LegacyAIManager } from '../src/managers/ai_manager.js';
import { WorldSnapshot } from '../src/simulation/rts_snapshot.js';
import { forecastOperation } from '../src/simulation/rts_forecast.js';
import { issueTroopOrder } from '../src/simulation/rts_world_rules.js';

const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))] || 0;
const summary = values => ({ p50: percentile(values, .5), p95: percentile(values, .95), p99: percentile(values, .99), max: Math.max(0, ...values) });
const report = { method: 'Headless actual Unit, Node, PhysicsManager, CombatManager; scripted orders, seeded formations. Not human playtesting or GPU/render profiling.',
    hardware: { cpu: os.cpus()[0].model, platform: os.platform(), node: process.version },
    precision: [], matches: [], stress: [], acceptance: {} };
const seeds = Number(process.env.RTS_SEEDS || 20);
const section = process.env.RTS_SECTION || 'all';
for (const kind of (['all', 'precision'].includes(section) ? ['plain', 'poison', 'overlap', 'three_factions'] : [])) {
    let passed = 0, worstError = 0, zeroArrivalViable = 0;
    const times = [];
    for (let seed = 1; seed <= seeds; seed++) {
        const hazards = kind === 'plain' || kind === 'three_factions' ? []
            : [{ shape: 'rect_puddle', x: -2, y: -2, width: 6, height: 6, dps: 4.5 }];
        if (kind === 'overlap') hazards.push({ shape: 'puddle', x: .25, y: .36, radius: .08, dps: 2 });
        const world = makeWorld({ seed, hazards });
        if (kind === 'three_factions') world.spawnUnitsAt(world.nodes[1], 'fuego', 14);
        const snapshot = new WorldSnapshot(world);
        const ids = snapshot.idle[0].get('enemy');
        const start = performance.now();
        const prediction = finish(forecastOperation(snapshot, 'enemy', 1, [{ source: 0, units: ids, delay: 0 }]));
        times.push(performance.now() - start);
        const cohort = [...world.allUnits.filter(u => u.faction === 'enemy')], arrived = new Set();
        issueTroopOrder(world, world.nodes[0], world.nodes[1], ids.length, 'enemy');
        for (let tick = 0; tick < 600; tick++) {
            stepWorld(world);
            for (const u of cohort) if (!u.pendingRemoval && u.state === 'idle' && u.targetNode === world.nodes[1]) arrived.add(u);
        }
        const error = Math.abs(prediction.arrived - arrived.size);
        worstError = Math.max(worstError, error);
        if (error <= Math.max(2, arrived.size * .05)) passed++;
        if (prediction.held && !arrived.size) zeroArrivalViable++;
    }
    report.precision.push({ kind, seeds, passed, worstError, zeroArrivalViable, fullForecastMs: summary(times) });
    console.log(`Precision ${kind}: ${passed}/${seeds}, worst arrival error ${worstError}`);
}
for (const mode of (['all', 'matches'].includes(section) ? ['reference', 'progressive'] : [])) for (const difficulty of ['easy', 'normal', 'hard']) {
    const world = makeWorld({ nodes: [{ x: 100, y: 180, owner: 'enemy', count: 95 },
        { x: 310, y: 180, owner: 'neutral', count: 8 }, { x: 610, y: 180, owner: 'player', count: 50 }] });
    const ai = mode === 'reference' ? new LegacyAIManager({ worldRef: world, difficulty }) : new RTSAIRuntime({ worldRef: world, difficulty });
    const frames = [], simulation = [];
    for (let tick = 0; tick < 1200; tick++) {
        if (tick === 300) issueTroopOrder(world, world.nodes[2], world.nodes[1], 35, 'player');
        let start = performance.now(); stepWorld(world); simulation.push(performance.now() - start);
        start = performance.now();
        if (mode === 'reference') ai.update(1 / 30, world.nodes, world.allUnits, 'enemy', 'player');
        else ai.updateAll(1 / 30, ['enemy']);
        frames.push(performance.now() - start);
    }
    report.matches.push({ mode, difficulty, duration: world.simTime, owners: world.nodes.map(n => n.owner),
        aiMs: summary(frames), simulationMs: summary(simulation), diagnostics: ai.diagnostics?.() });
    console.log(`Match ${mode}/${difficulty}: owners ${world.nodes.map(n => n.owner).join(',')}`);
}
for (const count of (['all', 'stress'].includes(section) ? [1000, 5000, 10000] : [])) {
    const factions = ['enemy', 'fuego', 'negras', 'tejedoras', 'bala', 'carpinteras'];
    const nodes = Array.from({ length: 42 }, (_, i) => ({ x: 60 + i % 7 * 100, y: 45 + Math.floor(i / 7) * 70,
        owner: i < 6 ? factions[i] : 'neutral', count: 0 }));
    const world = makeWorld({ nodes, strategy: { diplomacyMode: 'controlledFreeForAll' } });
    for (let i = 0; i < count; i++) world.spawnUnitsAt(world.nodes[i % 6], factions[i % 6], 1);
    // Keep observations/current population consistent without charging the renderer to AI.
    const { updateNodeCounts } = await import('../src/simulation/rts_world_rules.js'); updateNodeCounts(world);
    const ai = new RTSAIRuntime({ worldRef: world });
    const frames = [];
    const phases = { observation: [], preparation: [], planning: [], execution: [] };
    for (let tick = 0; tick < 240; tick++) {
        world.simTime += 1 / 30;
        const start = performance.now(); ai.updateAll(1 / 30, factions); frames.push(performance.now() - start);
        for (const key in phases) phases[key].push(ai.timings[key]);
    }
    report.stress.push({ count, factions: 6, nests: 42, aiMs: summary(frames), phases: Object.fromEntries(Object.entries(phases).map(([k, v]) => [k, summary(v)])), heapBytes: process.memoryUsage().heapUsed,
        diagnostics: ai.diagnostics() });
    console.log(`Stress ${count}: p95 ${percentile(frames, .95).toFixed(2)} ms`);
}
report.acceptance.arrivalPrecision = report.precision.every(r => r.passed / r.seeds >= .95 && r.zeroArrivalViable === 0);
report.acceptance.headlessBudget = report.stress.every(r => r.aiMs.p95 <= 2);
report.acceptance.graphicalAndHuman = 'pending';
const path = process.argv[2] || 'docs/evidence/rts-ai/evaluation.json';
fs.mkdirSync(new URL('../docs/evidence/rts-ai/', import.meta.url), { recursive: true });
fs.writeFileSync(path, JSON.stringify(report, null, 2));
console.log(`Report ${path}`);
