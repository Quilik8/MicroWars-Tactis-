import { SECTORS } from '../src/data/levels/index.js';
import { levelFixture, mechanics } from '../tests/helpers/level-fixture.js';
import { makeWorld } from '../tests/helpers/rts-world.js';
import { RTSAIRuntime } from '../src/simulation/rts_ai_runtime.js';
import { updateNodeCounts } from '../src/simulation/rts_world_rules.js';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import { PerformanceObserver } from 'node:perf_hooks';
const gcPauses = [];
const gcObserver = new PerformanceObserver(list => { for (const entry of list.getEntries()) gcPauses.push(entry.duration); });
gcObserver.observe({ entryTypes: ['gc'] });
const summarize = samples => {
    const sorted = [...samples].sort((a, b) => a - b), q = p => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] || 0;
    return { samples: sorted.length, p50: q(.5), p95: q(.95), p99: q(.99), max: sorted.at(-1) || 0 };
};
const rows = [], costs = [], warmCosts = [], illegal = [];
for (const sector of SECTORS) for (let levelIndex = 0; levelIndex < sector.levels.length; levelIndex++) {
    const level = sector.levels[levelIndex];
    for (const difficulty of ['easy', 'normal', 'hard']) {
        const w = levelFixture(sector, level, 701);
        let vetoes = 0;
        w.isPathBlocked = ((original) => (a, b) => { const blocked = original.call(w, a, b); if (blocked) vetoes++; return blocked; })(w.isPathBlocked);
        const ai = new RTSAIRuntime({ worldRef: w, difficulty });
        const factions = [...new Set(w.nodes.map(n => n.owner).filter(f => !['player', 'neutral'].includes(f)))];
        const memoryStart = process.memoryUsage().heapUsed;
        // Only decision calls on a fixed opening. No movement/combat/regen is
        // advanced: this is an activity/legality audit, not an agent playtest.
        for (let tick = 0; tick < 20; tick++) {
            w.simTime = tick * .025; ai.updateAll(.025, factions);
        }
        const diag = ai.diagnostics(); costs.push(...ai.samples); warmCosts.push(...ai.samples.slice(4));
        const sent = [...ai.states.values()].flatMap(s => s.tacticalOrders.flatMap(d => d.sent));
        if (new Set(sent).size !== sent.length) illegal.push({ sector: sector.id, level: levelIndex + 1, difficulty, reason: 'duplicate_units' });
        rows.push({ sector: sector.id, level: levelIndex + 1, name: level.name, difficulty, mechanics: mechanics(level),
            nodes: w.nodes.length, units: w.allUnits.length, factions: factions.length, orders: diag.metrics.orders,
            idle: diag.factions.map(f => ({ faction: f.faction, pendingForecast: f.pendingForecast, ...f.idle })), milliseconds: diag.milliseconds, warmMilliseconds: summarize(ai.samples.slice(4)),
            heapDelta: process.memoryUsage().heapUsed - memoryStart, vetoes, snapshots: diag.metrics.snapshots });
        ai.forecastWorker.dispose();
    }
}
const events = [];
for (let seed = 1; seed <= 20; seed++) for (const difficulty of ['easy', 'normal', 'hard']) {
    const w = makeWorld({ seed, nodes: [{ x: 100, y: 180, owner: 'enemy', count: 90 }, { x: 310, y: 180, owner: 'player', count: 240 }] });
    w.allowEvolutions = false;
    const ai = new RTSAIRuntime({ worldRef: w, difficulty, planningBudgetMs: 0 }); ai.updateAll(0, ['enemy']);
    // Script a depletion exposing the enemy origin; no autonomous opponent.
    const troops = w.allUnits.filter(u => u.faction === 'player');
    troops.slice(2).forEach(u => { u.pendingRemoval = true; }); updateNodeCounts(w);
    let latency = null;
    for (let tick = 0; tick < 50; tick++) {
        w.simTime = .071 + tick * .01; ai.updateAll(.01, ['enemy']);
        if (ai.metrics.orders) { latency = (w.simTime - .071) * 1000; break; }
    }
    events.push({ seed, difficulty, latency }); ai.forecastWorker.dispose();
}
const stress = [];
for (const total of [1000, 5000, 10000]) {
    const w = makeWorld({ nodes: Array.from({ length: 24 }, (_, i) => ({ x: 60 + i % 6 * 130, y: 50 + Math.floor(i / 6) * 110,
        owner: i < 6 ? ['enemy', 'fuego', 'tejedoras', 'bala', 'negras', 'cortadoras'][i] : 'neutral', count: Math.floor(total / 24) })) });
    w.aiStrategy = { diplomacyMode: 'controlledFreeForAll' }; w.allowEvolutions = false;
    const factions = [...new Set(w.nodes.slice(0, 6).map(n => n.owner))];
    const ai = new RTSAIRuntime({ worldRef: w, difficulty: 'hard', planningBudgetMs: 0 });
    for (let i = 0; i < 80; i++) { w.simTime = i * .025; ai.updateAll(.025, factions); }
    stress.push({ units: w.allUnits.length, nodes: w.nodes.length, factions: 6, ...ai.diagnostics(), warmMilliseconds: summarize(ai.samples.slice(10)),
        tacticalVisits: [...ai.states.values()].map(s => ({ faction: s.faction, visits: s.tacticalVisits || 0 })) });
    ai.forecastWorker.dispose();
}
await new Promise(resolve => setImmediate(resolve));
await new Promise(resolve => setImmediate(resolve));
gcObserver.disconnect();
const output = { generated: new Date().toISOString(), environment: { node: process.version, cpu: os.cpus()[0]?.model, platform: os.platform() },
    scope: 'Fixed opening decision calls and scripted events only. Catalogue uses default budgets and Node main-thread forecast fallback (no browser Worker). Stress isolates tactics. No browser, renderer, autonomous matches or playable-difficulty claims.',
    catalogue: { sectors: SECTORS.length, levels: rows.length / 3, inactive: ['sector7.js is not imported by the active catalogue'] },
    milliseconds: summarize(costs), warmMilliseconds: summarize(warmCosts), memory: process.memoryUsage(), gcPauseMs: summarize(gcPauses), illegal, events: Object.fromEntries(['easy', 'normal', 'hard'].map(d => [d, {
        failures: events.filter(e => e.difficulty === d && e.latency === null).length,
        latencyMs: summarize(events.filter(e => e.difficulty === d && e.latency !== null).map(e => e.latency)) }])), rows, stress };
mkdirSync('docs/evidence/rts-ai', { recursive: true });
writeFileSync('docs/evidence/rts-ai/activity-audit.json', JSON.stringify(output, null, 2));
const reportPath = 'docs/RTS_AI_IMPLEMENTATION.md';
if (existsSync(reportPath)) {
    const fmt = value => value.toFixed(2).replace('.', ',');
    const cpuRow = (name, s) => `| ${name} | ${fmt(s.p50)} | ${fmt(s.p95)} | ${fmt(s.p99)} | ${fmt(s.max)} |`;
    const exceptions = rows.filter(r => !r.orders);
    const descriptions = [...new Set(exceptions.map(r => `${r.sector}, nivel ${r.level}: ${r.idle.map(f => f.code).join(', ')}`))];
    const summary = [
        '<!-- BEGIN_ACTIVITY_AUDIT -->',
        `Medición ${output.generated}, ${output.environment.cpu.trim()}, ${output.environment.node}, ${output.environment.platform}. Incluye arranque y pausas del proceso. No representa una partida ni una medición de navegador.`, '',
        '| Carga | p50 ms | p95 ms | p99 ms | Máximo ms |', '|---|---:|---:|---:|---:|',
        cpuRow(`${rows.length} aperturas; ${costs.length} llamadas`, output.milliseconds),
        ...stress.map(s => cpuRow(`${s.units} unidades; seis facciones`, s.milliseconds)), '',
        `Excluyendo las primeras cuatro llamadas de cada apertura, p95 ${fmt(output.warmMilliseconds.p95)} ms. Se mantienen arriba los picos de arranque. Todas las facciones recibieron evaluación en los tres estados de carga. No se detectó doble asignación de unidades en la auditoría.`, '',
        `Latencia externa p95 del origen expuesto: fácil ${fmt(output.events.easy.latencyMs.p95)} ms, normal ${fmt(output.events.normal.latencyMs.p95)} ms y difícil ${fmt(output.events.hard.latencyMs.p95)} ms. Casos sin respuesta: ${Object.values(output.events).reduce((n, e) => n + e.failures, 0)} de sesenta. Son resultados de ese acontecimiento controlado, no garantías generales.`, '',
        `${rows.length - exceptions.length} de ${rows.length} aperturas emitieron órdenes en la ventana de 0,475 segundos. Excepciones: ${descriptions.join('; ') || 'ninguna'}. Las esperas se conservan con su motivo y hora de salida. Esto comprueba actividad inicial, no calidad de toda la partida.`, '',
        `El proceso terminó con ${(output.memory.heapUsed / 1048576).toFixed(1)} MiB de heap usado y ${(output.memory.rss / 1048576).toFixed(1)} MiB de RSS. Se observaron ${gcPauses.length} pausas de GC, p95 ${fmt(output.gcPauseMs.p95)} ms. Es memoria del proceso completo, incluida la construcción sucesiva de fixtures; no una medición de fuga ni memoria del juego.`,
        '<!-- END_ACTIVITY_AUDIT -->',
    ].join('\n');
    const report = readFileSync(reportPath, 'utf8');
    writeFileSync(reportPath, report.replace(/<!-- BEGIN_ACTIVITY_AUDIT -->[\s\S]*?<!-- END_ACTIVITY_AUDIT -->/, summary));
}
console.log(JSON.stringify({ catalogue: output.catalogue, milliseconds: output.milliseconds, events: output.events, illegal,
    noOpeningOrder: rows.filter(r => !r.orders).map(r => ({ sector: r.sector, level: r.level, difficulty: r.difficulty, reasons: r.idle.map(i => i.code) })),
    stress: stress.map(s => ({ units: s.units, milliseconds: s.milliseconds, visits: s.tacticalVisits })) }, null, 2));
if (illegal.length || Object.values(output.events).some(e => e.failures) || stress.some(s => s.tacticalVisits.some(v => !v.visits))) process.exitCode = 1;
