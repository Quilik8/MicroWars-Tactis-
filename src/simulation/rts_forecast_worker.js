import { Node } from '../entities/node.js?v=rts-balance-thorns-20261029-1';
import { IntermittentBarrier } from '../systems/intermittent_barrier.js';
import { WaterSweep } from '../systems/water_sweep.js';
import { LightSweep } from '../systems/light_sweep.js?v=rts-balance-thorns-20261029-1';
import { forecastOperation } from './rts_forecast.js?v=rts-balance-thorns-20261029-1';
import { unpackUnits } from './rts_unit_layout.js?v=rts-balance-thorns-20261029-1';

const nodePort = typeof globalThis.postMessage === 'function' ? null : (await import('node:worker_threads')).parentPort;
const send = message => nodePort ? nodePort.postMessage(message) : globalThis.postMessage(message);
const snapshots = new Map(), jobs = [];
let running = false;
let totalCpuMs = 0, lastProgress = 0;
function restore(data) {
    const nodes = data.nodes.map(n => Object.assign(Object.create(Node.prototype), n));
    for (let i = 0; i < nodes.length; i++) nodes[i].tunnelTo = nodes[data.nodes[i].tunnelIndex] || null;
    const restoreSystem = (s, cls) => Object.assign(Object.create(cls.prototype), s);
    const snapshot = { ...data, nodes, units: unpackUnits(data.packedUnits) };
    snapshot.intermittentBarriers = data.intermittentBarriers.map(s => restoreSystem(s, IntermittentBarrier));
    snapshot.waterSweeps = data.waterSweeps.map(s => restoreSystem(s, WaterSweep));
    snapshot.lightSweeps = data.lightSweeps.map(s => {
        const out = restoreSystem(s, LightSweep);
        out._resetThisCycle = new Set(s.resetIndices.map(i => nodes[i])); return out;
    });
    return snapshot;
}
function tick() {
    const deadline = performance.now() + 2;
    while (jobs.length && performance.now() < deadline) {
        const job = jobs.shift(), started = performance.now();
        try {
            let result;
            for (let i = 0; i < 16; i++) { result = job.iterator.next(); if (result.done) break; }
            const elapsed = performance.now() - started;
            job.cpuMs += elapsed; totalCpuMs += elapsed;
            if (result.done) send({ id: job.id, result: result.value, cpuMs: job.cpuMs, totalCpuMs });
            else jobs.push(job);
        } catch (error) { send({ id: job.id, error: String(error.stack || error) }); }
    }
    running = jobs.length > 0;
    if (performance.now() - lastProgress >= 250) {
        lastProgress = performance.now();
        send({ type: 'progress', totalCpuMs, queued: jobs.length, observations: snapshots.size });
    }
    if (running) setTimeout(tick, 4);
}
function receive(message) {
    if (message.type === 'snapshot') {
        snapshots.set(message.key, restore(message.snapshot));
        if (snapshots.size > 8) snapshots.delete(snapshots.keys().next().value);
    } else if (message.type === 'cancel') {
        const index = jobs.findIndex(j => j.id === message.id);
        if (index >= 0) jobs.splice(index, 1);
    } else if (message.type === 'forecast') {
        const snapshot = snapshots.get(message.key);
        if (!snapshot) { send({ id: message.id, error: 'Observation expired' }); return; }
        jobs.push({ id: message.id, cpuMs: 0, iterator: forecastOperation(snapshot, message.faction, message.target, message.orders, message.options) });
        if (!running) { running = true; setTimeout(tick, 0); }
    }
}
if (nodePort) nodePort.on('message', receive);
else globalThis.onmessage = event => receive(event.data);
