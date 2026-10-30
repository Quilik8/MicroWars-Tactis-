import fs from 'node:fs';
import { Worker } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
import { makeWorld, stepWorld } from '../tests/helpers/rts-world.js';
import { RTSAIRuntime } from '../src/simulation/rts_ai_runtime.js';

const summarize = values => {
    values.sort((a, b) => a - b);
    const at = p => values[Math.min(values.length - 1, Math.floor(values.length * p))] || 0;
    return { p50: at(.5), p95: at(.95), p99: at(.99), max: values.at(-1) || 0 };
};
const report = { method: 'One real module worker; main-thread scheduling measured separately from worker CPU. Stress uses six factions and 42 nests. Main-thread fallback is evaluated by rts-ai-evaluate.mjs.', stress: [] };
for (const count of [1000, 5000, 10000]) {
    const factions = ['enemy', 'fuego', 'negras', 'tejedoras', 'bala', 'carpinteras'];
    const nodes = Array.from({ length: 42 }, (_, i) => ({ x: 60 + i % 7 * 100, y: 45 + Math.floor(i / 7) * 70,
        owner: i < 6 ? factions[i] : 'neutral', count: 0 }));
    const world = makeWorld({ nodes, strategy: { diplomacyMode: 'controlledFreeForAll' } });
    for (let i = 0; i < count; i++) world.spawnUnitsAt(world.nodes[i % 6], factions[i % 6], 1);
    const ai = new RTSAIRuntime({ worldRef: world, workerFactory: url => new Worker(url, { type: 'module' }) });
    const samples = [];
    try {
        for (let frame = 0; frame < 240; frame++) {
            world.simTime += 1 / 60;
            const start = performance.now(); ai.updateAll(1 / 60, factions); samples.push(performance.now() - start);
            await new Promise(resolve => setTimeout(resolve, 16));
        }
        report.stress.push({ units: count, mainThreadMs: summarize(samples), worker: ai.diagnostics().worker,
            visits: ai.diagnostics().factions.map(f => f.visits) });
        console.log(`${count} units main p95: ${report.stress.at(-1).mainThreadMs.p95.toFixed(3)} ms`);
    } finally { ai.forecastWorker.dispose(); }
}
// Actual asynchronous scheduling: allow the worker to finish each bounded wave of
// computation before advancing the accelerated simulation. This is not a FPS test.
const world = makeWorld();
const ai = new RTSAIRuntime({ worldRef: world, difficulty: 'easy', workerFactory: url => new Worker(url, { type: 'module' }) });
try {
    for (let frame = 0; frame < 650; frame++) {
        stepWorld(world); ai.updateAll(1 / 30, ['enemy']);
        if (ai.forecastWorker.pending.size) await new Promise(resolve => setTimeout(resolve, 2));
    }
    report.playableCycle = { owners: world.nodes.map(n => n.owner), diagnostics: ai.diagnostics() };
} finally { ai.forecastWorker.dispose(); }
report.mainThreadBudgetPassed = report.stress.every(s => s.mainThreadMs.p95 <= 2);
report.playableCyclePassed = report.playableCycle.diagnostics.metrics.orders > 0;
const contested = makeWorld({ nodes: [{ x: 100, y: 180, owner: 'enemy', count: 95 },
    { x: 310, y: 180, owner: 'neutral', count: 8 }, { x: 610, y: 180, owner: 'player', count: 50 }] });
const reactive = new RTSAIRuntime({ worldRef: contested, workerFactory: url => new Worker(url, { type: 'module' }) });
try {
    for (let frame = 0; frame < 900; frame++) {
        stepWorld(contested, 1 / 60);
        if (frame === 300) contested.sendTroops(contested.nodes[2], contested.nodes[1], .6, 'player');
        if (frame === 600) contested.sendTroops(contested.nodes[2], contested.nodes[0], .7, 'player');
        reactive.updateAll(1 / 60, ['enemy']);
        await new Promise(resolve => setTimeout(resolve, 16));
    }
    report.reactiveCycle = { method: '60 Hz paced live managers, real worker, player attacks at seconds 5 and 10; no future script passed to AI',
        owners: contested.nodes.map(n => n.owner), diagnostics: reactive.diagnostics() };
} finally { reactive.forecastWorker.dispose(); }
report.reactiveCyclePassed = report.reactiveCycle.diagnostics.metrics.orders > 0 && report.reactiveCycle.diagnostics.metrics.reactions > 0
    && report.reactiveCycle.diagnostics.worker.error === null;
fs.mkdirSync('docs/evidence/rts-ai', { recursive: true });
fs.writeFileSync('docs/evidence/rts-ai/worker-evaluation.json', JSON.stringify(report, null, 2));
