import { packUnits } from './rts_unit_layout.js?v=rts-balance-thorns-20261029-1';

function plain(source) {
    const out = {};
    for (const [key, value] of Object.entries(source)) {
        if (value == null || ['number', 'boolean', 'string'].includes(typeof value)) out[key] = value;
    }
    return out;
}
function serialize(snapshot) {
    const indices = new Map(snapshot.nodes.map((n, i) => [n, i]));
    const nodes = snapshot.nodes.map(n => ({ ...plain(n), counts: n.counts, population: n.population, power: n.power,
        combatDamageCarry: n.combatDamageCarry, campaignLeech: n.campaignLeech, campaignBurn: n.campaignBurn,
        activeShots: n.activeShots, tunnelIndex: indices.get(n.tunnelTo) ?? -1 }));
    const system = s => ({ ...plain(s), _gfx: null, graphics: [], zones: s.zones, rails: s.rails,
        _patterns: s._patterns, orbs: s.orbs, _activeBars: s._activeBars,
        resetIndices: [...(s._resetThisCycle || [])].map(n => indices.get(n)) });
    return { time: snapshot.time, revision: snapshot.revision, environmentRevision: snapshot.environmentRevision,
        simulationStep: snapshot.simulationStep, game: snapshot.game, nodes, packedUnits: packUnits(snapshot.units), hazards: snapshot.hazards, zones: snapshot.zones,
        barriers: snapshot.barriers, intermittentBarriers: snapshot.intermittentBarriers.map(system),
        waterSweeps: snapshot.waterSweeps.map(system), lightSweeps: snapshot.lightSweeps.map(system),
        modifiers: snapshot.modifiers, combatInterval: snapshot.combatInterval, serial: snapshot.serial,
        surfaceStore: snapshot.surfaceStore };
}

/** A single optional worker, bounded queue. Main-thread fallback uses the same generator. */
export class ForecastWorkerService {
    constructor(factory) {
        this.factory = factory || (typeof Worker !== 'undefined' ? url => new Worker(url, { type: 'module' }) : null);
        this.pending = new Map(); this.snapshots = new WeakMap(); this.serial = 0; this.snapshotSerial = 0;
        this.remoteSnapshots = new Set();
        this.cpuMs = 0; this.completed = 0; this.error = null;
        if (this.factory) this._start();
    }
    _start() {
        try {
            this.worker = this.factory(new URL('./rts_forecast_worker.js?v=rts-balance-thorns-20261029-1', import.meta.url));
            const ownedWorker = this.worker;
            const receive = message => {
                if (this.worker !== ownedWorker) return;
                if (message.type === 'progress') { this.cpuMs = Math.max(this.cpuMs, message.totalCpuMs); return; }
                const record = this.pending.get(message.id);
                if (!record) return;
                Object.assign(record, message, { done: true });
                this.pending.delete(message.id);
                this.cpuMs = Math.max(this.cpuMs, message.totalCpuMs ?? this.cpuMs + (message.cpuMs || 0)); this.completed++;
            };
            const fail = error => {
                this.error = String(error.message || error);
                for (const record of this.pending.values()) Object.assign(record, { done: true, error: this.error });
                this.pending.clear(); this.worker?.terminate(); this.worker = null;
            };
            if (this.worker.on) { this.worker.on('message', receive); this.worker.on('error', fail); }
            else { this.worker.onmessage = e => receive(e.data); this.worker.onerror = fail; }
        } catch (error) { this.error = String(error); this.worker = null; }
    }
    request(snapshot, faction, target, orders, options) {
        if (!this.worker || this.pending.size >= 6) return null;
        let key = this.snapshots.get(snapshot);
        if (!key || !this.remoteSnapshots.has(key)) {
            key = ++this.snapshotSerial;
            this.snapshots.set(snapshot, key);
            const data = serialize(snapshot);
            this.worker.postMessage({ type: 'snapshot', key, snapshot: data }, [data.packedUnits.data.buffer]);
            this.remoteSnapshots.add(key);
            if (this.remoteSnapshots.size > 8) this.remoteSnapshots.delete(this.remoteSnapshots.values().next().value);
        }
        const record = { id: ++this.serial, done: false };
        this.pending.set(record.id, record);
        this.worker.postMessage({ type: 'forecast', id: record.id, key, faction, target, orders, options });
        return record;
    }
    cancel(record) {
        if (!record || record.done) return;
        this.pending.delete(record.id); this.worker?.postMessage({ type: 'cancel', id: record.id });
    }
    reset() {
        this.worker?.terminate(); this.worker = null; this.pending.clear(); this.snapshots = new WeakMap(); this.remoteSnapshots.clear();
        this.cpuMs = 0; this.completed = 0; this.error = null;
        if (this.factory) this._start();
    }
    dispose() { this.worker?.terminate(); this.worker = null; this.pending.clear(); }
}
