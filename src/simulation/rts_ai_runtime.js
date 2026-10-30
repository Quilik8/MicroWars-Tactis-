import { setLogisticsLink, removeLogisticsLink, ferryWindows, activatePortal } from './rts_transport.js';
import { evolutionCandidates } from './rts_investment.js';
import { DIFFICULTY_PROFILES, TacticalDecision, TacticalObservation, planTactical, strategicRoute, unitPower, ForecastRequest, assessTransfer, projectNode, mayCounterattack, sourceRetention, routeFromOrigin } from './rts_tactical.js';
import { WorldSnapshot } from './rts_snapshot.js?v=rts-balance-thorns-20261029-1';
import { forecastOperation, departureWindow, crossesBarrier } from './rts_forecast.js?v=rts-balance-thorns-20261029-1';
import { resolveAIProfile } from './ai_config.js';
import { canTargetFaction } from './ai_diplomacy.js';
import { getDiplomacyScoreMult } from './ai_diplomacy.js';
import { issueTroopOrder } from './rts_world_rules.js?v=rts-balance-thorns-20261029-1';
import { EVO_COSTS } from './ai_constants.js';
import { CombatManager } from '../managers/combat_manager.js?v=rts-balance-thorns-20261029-1';
import { ForecastWorkerService } from './rts_worker_service.js?v=rts-balance-thorns-20261029-1';

export const AI_CADENCE = DIFFICULTY_PROFILES;
export const OPERATION_STATES = Object.freeze(['preparation', 'waiting', 'dispatch', 'dispute', 'consolidation', 'completed', 'cancelled']);
const now = () => performance.now();

export class OperationPlan {
    constructor(id, faction, target, kind, time) {
        Object.assign(this, { id, faction, target, kind, created: time, state: 'preparation', orders: [],
            reservations: new Set(), reason: '', sent: [], arrivals: new Set(), capturedAt: null, forecast: null });
    }
    cancel(reason) { this.state = 'cancelled'; this.reason = reason; this.reservations.clear(); }
}

export class FactionAIState {
    constructor(faction, difficulty) {
        this.faction = faction; this.difficulty = difficulty;
        this.nextStrategy = 0; this.urgentSince = null; this.cursor = 0;
        this.job = null; this.operation = null; this.history = [];
        this.operations = [];
        this.lastTarget = -1; this.lastProgress = 0; this.profile = null;
        this.visits = 0; this.decisions = 0; this.reactions = 0;
        this.forecastLead = 0;
        this.nextTactical = 0; this.tacticalOrders = []; this.idleReason = null;
        this.latencies = []; this.latencyViolations = 0; this.advice = null; this.route = [];
        this.tacticalHistory = []; this.opportunitySince = null;
    }
}

/** Bounded diagnostic history; detailed traces are opt-in, counters stay inexpensive. */
export class DecisionTrace {
    constructor(limit = 64) { this.limit = limit; this.entries = []; }
    record(entry) {
        if (!globalThis.__AI_TELEMETRY && !globalThis.__AI_DEBUG) return;
        this.entries.push(entry);
        if (this.entries.length > this.limit) this.entries.shift();
    }
}

function pool(snapshot, index, faction) { return snapshot.idle[index].get(faction) || []; }
function power(snapshot, ids) { let result = 0; for (const i of ids) result += snapshot.units[i].power || 1; return result; }
function hasMainThreat(snapshot, index, faction, horizon) {
    let incoming = 0;
    for (const a of snapshot.arrivals[index]) if (a.faction !== faction && a.eta <= horizon) incoming += a.power;
    for (const f in snapshot.nodes[index].counts) if (f !== faction) incoming += snapshot.nodes[index].power[f] || snapshot.nodes[index].counts[f];
    return incoming;
}

function environmentDanger(snapshot, index, horizon = 15) {
    const n = snapshot.nodes[index], game = snapshot.game;
    for (const water of snapshot.waterSweeps) {
        if (water.predictUnsafeUntil(n.x, n.y, n.x, n.y, snapshot.time, horizon, snapshot.time, game.width, game.height) >= snapshot.time) return true;
    }
    return false;
}

function defensesMatch(snapshot, world, elapsed, indices = snapshot.nodes.map((_, i) => i)) {
    if (snapshot.game.width !== world.game.width || snapshot.game.height !== world.game.height) return false;
    for (const i of indices) {
        const old = snapshot.nodes[i], live = world.nodes[i];
        const completed = old.pendingEvolution && elapsed >= old.pendingEvolutionEtaSec;
        if (!live || live.evolution !== (completed ? old.pendingEvolution : old.evolution)
            || live.pendingEvolution !== (completed ? null : old.pendingEvolution)) return false;
    }
    return true;
}

function militaryCompatible(snapshot,world,indices,elapsed) {
    for (const i of new Set(indices)) {
        const old = snapshot.nodes[i], live = world.nodes[i];
        if (!old || !live) return false;
        const factions = new Set([...Object.keys(old.counts),...Object.keys(live.counts)]);
        for (const f of factions) {
            const growth = f === old.owner && old.type !== 'tunel' ? Math.ceil(elapsed / Math.max(.1,old.regenInterval || 1)
                * (old.type === 'enjambre' ? snapshot.modifiers?.[f]?.generation || 1 : 1)) + 2 : 2;
            const expectedArrivals = (snapshot.arrivals[i] || []).filter(w=>w.faction===f).reduce((n,w)=>n+w.power,0);
            const spawnPower = old.evolution === 'tanque' || old.pendingEvolution === 'tanque' ? 3 : 1;
            if ((live.counts[f] || 0) > (old.counts[f] || 0) + growth + expectedArrivals
                || (live.power?.[f] ?? live.counts[f] ?? 0) > (old.power?.[f] ?? old.counts[f] ?? 0) + growth*spawnPower + expectedArrivals) return false;
        }
    }
    return true;
}

export class RTSAIRuntime {
    constructor(config = {}) {
        this.world = config.worldRef;
        this.difficulty = config.difficulty || 'normal';
        this.budgetMs = config.budgetMs ?? 4;
        this.tacticalBudgetMs = config.tacticalBudgetMs ?? (this.budgetMs > 4 ? this.budgetMs : 1.2);
        this.planningBudgetMs = config.planningBudgetMs ?? 0.65;
        this.quota = config.workQuota ?? 256;
        this.states = new Map(); this.trace = new DecisionTrace();
        this.revision = 0; this.time = 0; this.nextObserve = 0; this.turn = 0; this.serial = 0;
        this.observed = new Map(); this.events = []; this.pending = [];
        this.samples = []; this.timings = { observation: 0, planning: 0, execution: 0 };
        this.workCosts = {};
        this.forecastWorker = new ForecastWorkerService(config.workerFactory);
        this.tacticalCursor = 0;
        this.metrics = { frames: 0, forecasts: 0, orders: 0, vetoes: 0, stale: 0, overruns: 0,
            snapshots: 0, reactions: 0, jobsCompleted: 0, forecastSteps: 0, cacheHits: 0 };
        this.cache = new Map(); this.lastWorldTime = -1;
    }
    setDifficulty(d) {
        this.tacticalView = null;
        this.difficulty = AI_CADENCE[d] ? d : 'normal';
        for (const state of this.states.values()) {
            this._release(state, 'difficulty_changed'); state.difficulty = this.difficulty;
            state.profile = null; state.nextStrategy = 0;
        }
    }
    reset() {
        this.forecastWorker.reset();
        this.states.clear(); this.observed.clear(); this.events.length = 0; this.pending.length = 0;
        this.cache.clear(); this.samples.length = 0; this.trace.entries.length = 0;
        this.time = 0; this.nextObserve = 0; this.lastWorldTime = -1; this.turn = 0; this.snapshot = null;
        this.tacticalView = null;
        this.tacticalCursor = 0; this.serial = 0;
        this.revision++; this.environmentRevision = undefined; this.workCosts = {};
        for (const key in this.metrics) this.metrics[key] = 0;
        for (const key in this.timings) this.timings[key] = 0;
    }
    _release(state, reason) {
        state.job?.iterator.return?.();
        if (state.job?.operation) state.job.operation.cancel(reason);
        state.job = null;
        if (state.operation && !['completed', 'cancelled'].includes(state.operation.state)) state.operation.cancel(reason);
        for (const op of state.operations) if (!['completed', 'cancelled'].includes(op.state)) op.cancel(reason);
        for (const decision of state.tacticalOrders) { decision.state = 'cancelled'; decision.reason = reason; }
        state.tacticalOrders.length = 0; state.nextTactical = 0;
    }
    _observe(factions) {
        const world = this.world;
        const newEvents = [];
        const counts = new Map(world.nodes.map(n => [n, new Map()]));
        for (const u of world.aiTravelingUnits || world.allUnits) {
            if (u.pendingRemoval || u.state !== 'traveling') continue;
            const table = counts.get(u.targetNode);
            if (table) table.set(u.faction, (table.get(u.faction) || 0) + 1);
        }
        let changed = false;
        for (let i = 0; i < world.nodes.length; i++) {
            const n = world.nodes[i], table = counts.get(n);
            const previous = this.observed.get(i);
            const signature = [...table].sort().toString();
            let incoming = 0; for (const count of table.values()) incoming += count;
            if (previous && (previous.owner !== n.owner || previous.evolution !== n.pendingEvolution || previous.signature !== signature)) {
                const type = previous.owner !== n.owner ? 'capture' : previous.signature !== signature ? 'movement' : 'investment';
                const event = { time: this.time, node: i, type, owner: n.owner, previousOwner: previous.owner,
                    increasing: incoming > previous.incoming, factions: [...table.keys()] };
                this.events.push(event); newEvents.push(event); changed = true;
            }
            this.observed.set(i, { owner: n.owner, evolution: n.pendingEvolution, signature, incoming });
        }
        const env = world.aiEnvironmentRevision || 0;
        const environmentChanged = this.environmentRevision !== undefined && env !== this.environmentRevision;
        if (environmentChanged) changed = true;
        this.environmentRevision = env;
        if (this.events.length > 64) this.events.splice(0, this.events.length - 64);
        if (changed) {
            this.revision++;
            for (const f of factions) {
                const state = this.states.get(f);
                if (!state) continue;
                const relevant = environmentChanged || newEvents.some(event => {
                    const candidateNodes = state.job?.operation.candidates?.some(c => c.source === event.node || c.target === event.node);
                    if (event.type === 'capture') return !state.job || event.owner === f || event.previousOwner === f || candidateNodes;
                    if (event.type === 'movement') return event.increasing && event.factions.some(other => other !== f)
                        && (!state.job || event.owner === f || candidateNodes);
                    return candidateNodes;
                });
                if (relevant) {
                    if (state.urgentSince === null) state.urgentSince = this.time;
                    // Gate phase changes are already in the recorded calendar.
                    // They refresh observation but do not invalidate its forecast.
                    const affected = newEvents.some(event => {
                        if (!state.job?.operation.candidates?.some(c => c.source === event.node || c.target === event.node)) return false;
                        const old = state.job.snapshot.nodes[event.node];
                        return !(event.type === 'investment' && old.pendingEvolution
                            && this.time - state.job.snapshot.time >= old.pendingEvolutionEtaSec);
                    });
                    if (affected) state.invalidateRevision = this.revision;
                }
            }
        }
    }
    updateAll(dt, factions, playerFaction = 'player') {
        if (!this.world || !this.world.nodes.length) return;
        this.playerFaction = playerFaction;
        const started = now();
        this.time = this.world.simTime ?? this.time + dt;
        for (const f of factions) if (!this.states.has(f)) this.states.set(f, new FactionAIState(f, this.difficulty));
        const observationStart = now();
        if (this.time >= this.nextObserve) { this._observe(factions); this.nextObserve = this.time + 0.1; }
        this.timings.observation = now() - observationStart;
        const tacticalStarted = now();
        this._runTactics(factions, playerFaction, started + this.tacticalBudgetMs);
        this.timings.tactical = now() - tacticalStarted;
        const deadline = Math.min(started + this.budgetMs, now() + this.planningBudgetMs);
        const active = [...factions].sort();
        let snapshot = null;
        for (const f of active) {
            const state = this.states.get(f);
            const latest = state.operation;
            for (const op of state.operations) { state.operation = op; this._trackOperation(state); }
            state.operations = state.operations.filter(op => !['completed', 'cancelled'].includes(op.state));
            state.operation = latest;
            const cadence = AI_CADENCE[state.difficulty];
            const reactive = state.urgentSince !== null && this.time - state.urgentSince >= cadence.reaction;
            if (reactive && state.job && state.invalidateRevision > state.job.snapshot.revision) {
                state.job.iterator.return?.(); state.job.operation.cancel('new_observed_event'); state.job = null;
            }
            if (reactive) {
                for (const op of state.operations) if (op.orders.some(o => !o.sent)) {
                    op.cancel('reactive_replan'); this._archive(state, op);
                }
                state.operations = state.operations.filter(op => op.state !== 'cancelled');
            }
            if (state.job && this.time > (state.job.operation.analysisDeadline ?? state.job.started + 1)) {
                state.job.iterator.return?.(); state.job.operation.cancel('analysis_deadline'); state.job = null;
                this.metrics.analysisExpired = (this.metrics.analysisExpired || 0) + 1;
            }
            if (state.job || state.idleReason?.code !== 'analysis_pending') continue;
            if (this.time < state.nextStrategy && !reactive) continue;
            if (now() >= deadline) break;
            if (!snapshot) {
                if (!this.snapshot || this.snapshot.revision !== this.revision || this.time - this.snapshot.time > 0.5 || (this.world.lastSimulationStep && Math.abs(this.snapshot.simulationStep-this.world.lastSimulationStep) > this.snapshot.simulationStep*.25)) {
                    this.snapshot = new WorldSnapshot(this.world, this.revision);
                }
                snapshot = this.snapshot;
            }
            if (!state.profile) state.profile = resolveAIProfile(this.world.aiStrategy, null, f, this.difficulty);
            const operation = new OperationPlan(++this.serial, f, state.ambiguous?.[0]?.target, state.ambiguous?.[0]?.purpose, this.time);
            operation.candidates = (state.ambiguous || []).slice(0, 3).map(c => ({ ...c, kind: c.purpose }));
            state.nextStrategy = this.time + cadence.strategy;
            if (reactive) { state.reactions++; this.metrics.reactions++; }
            state.urgentSince = null;
            if (!operation.candidates.length || state.idleReason?.code !== 'analysis_pending') continue;
            state.job = { snapshot, operation, iterator: this._plan(snapshot, state, operation, playerFaction), started: this.time,
                request: new ForecastRequest(f, operation.target, this.time, operation.kind, operation.candidates?.map(c => c.source) || []) };
            this.metrics.snapshots++;
        }
        const planningStart = now();
        this.timings.preparation = planningStart - observationStart - this.timings.observation;
        let work = 0, idle = 0;
        const blocked = new Set();
        while (active.length && work < this.quota && now() < deadline && idle < active.length) {
            const state = this.states.get(active[this.turn++ % active.length]);
            if (!state.job || blocked.has(state)) { idle++; continue; }
            idle = 0; state.visits++; work++; this.metrics.forecastSteps++;
            const stepStarted = now();
            const result = state.job.iterator.next();
            const stepMs = now() - stepStarted;
            const phase = result.value && typeof result.value === 'string' ? result.value : 'transition';
            const cost = this.workCosts[phase] ??= { count: 0, total: 0, max: 0 };
            cost.count++; cost.total += stepMs; cost.max = Math.max(cost.max, stepMs);
            if (result.value === 'waiting_worker') blocked.add(state);
            if (result.done) {
                if (result.value) {
                    state.advice = { target: result.value.target, forecast: result.value.forecast,
                        completedAt: this.time, snapshotTime: state.job.snapshot.time, expiresAt: this.time + 1,
                        purpose: result.value.kind };
                    if (result.value.forecast && result.value.orders.length) this.pending.push({ state, operation: result.value, snapshot: state.job.snapshot });
                    else result.value.cancel('advisory_only');
                }
                else state.job.operation.cancel('no_viable_operation');
                state.job = null; this.metrics.jobsCompleted++;
            }
        }
        this.timings.planning = now() - planningStart;
        const executionStart = now();
        // All proposals completed this cycle are committed after observation and planning.
        for (const proposal of this.pending) this._acceptForecast(proposal);
        this.pending.length = 0;
        this.timings.execution = now() - executionStart;
        const ms = now() - started;
        this.metrics.frames++;
        if (ms > this.budgetMs) this.metrics.overruns++;
        this.samples.push(ms); if (this.samples.length > 600) this.samples.shift();
    }
    _latencySummary(values) {
        const sorted = [...values].sort((a, b) => a - b);
        const at = p => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] || 0;
        return { samples: values.length, p50: at(.5), p95: at(.95), p99: at(.99) };
    }
    _idle(state, code, extra = {}) {
        if (state.idleReason?.code === code) Object.assign(state.idleReason, extra);
        else state.idleReason = { code, since: this.time, ...extra };
    }
    _runTactics(factions, playerFaction, deadline) {
        const active = [...factions].sort();
        if (!active.length) return;
        let view = null;
        const first = this.tacticalCursor++ % active.length;
        for (let i = 0; i < active.length; i++) {
            const state = this.states.get(active[(first + i) % active.length]);
            if (now() >= deadline) {
                this._idle(state, 'budget_exhausted');
                state.opportunitySince ??= this.time;
                continue;
            }
            if (this.time < state.nextTactical && !state.tacticalOrders.some(d => d.state === 'waiting')) continue;
            if (!view) {
                if (!this.tacticalView || this.tacticalView.revision !== this.revision || this.time - this.tacticalView.time >= .1) {
                    this.tacticalView = new TacticalObservation(this.world); this.tacticalView.revision = this.revision;
                }
                view = Object.assign(Object.create(TacticalObservation.prototype), this.tacticalView, { time: this.time, routes: new Map() });
            }
            state.tacticalVisits = (state.tacticalVisits || 0) + 1;
            state.profile ??= resolveAIProfile(this.world.aiStrategy, null, state.faction, state.difficulty);
            this._trackTactics(view, state);
            const limits = AI_CADENCE[state.difficulty];
            if (!state.nextRoute || this.time >= state.nextRoute) {
                state.route = strategicRoute(view, state.faction, state.profile, limits.depth, this.world.aiObjectives?.[state.faction], playerFaction);
                state.nextRoute = this.time + limits.strategy;
            }
            state.nextTactical = this.time + .05;
            let emitted = 0;
            const reserved = new Set();
            for (const d of state.tacticalOrders) if (d.state === 'waiting') for (const o of d.orders) {
                if (!o.sent) for (const u of o.selected) reserved.add(u);
            }
            if (this.time >= (state.nextLogistics || 0) && now() < deadline) {
                this._manageLogistics(view,state,reserved);
                state.nextLogistics = this.time + limits.strategy;
            }
            let planned;
            for (let attempt = 0; attempt < limits.responses && now() < deadline; attempt++) {
                planned = planTactical(view, state, state.profile, reserved, playerFaction, this.world.aiObjectives?.[state.faction], { deadline });
                state.ambiguous = planned.uncertain;
                if (!planned.decision) break;
                const d = planned.decision;
                // A resource-scoped defense can take back an unissued offensive order.
                if (d.urgent) state.reactions++;
                const event = this.events.findLast(e => d.dependencies?.includes(e.node) && e.time > (state.handledEventTime ?? -1));
                d.observedAt = state.opportunitySince ?? event?.time ?? this.time;
                d.deadline = d.observedAt + (d.urgent ? limits.urgentMs : limits.routineMs) / 1000;
                state.tacticalOrders.push(d);
                for (const o of d.orders) for (const u of o.selected) reserved.add(u);
                this._dispatchTactical(view, state, d);
                if (d.emittedAt !== null) emitted++;
                state.lastTarget = d.target; state.lastProgress = this.time;
            }
            if (emitted) {
                state.handledEventTime = this.time;
                state.urgentSince = null; state.opportunitySince = null;
                this._idle(state, 'forces_committed', { emitted });
                state.nextTactical = this.time + limits.reaction;
                this.metrics.reactions = [...this.states.values()].reduce((sum, s) => sum + s.reactions, 0);
            } else if (state.tacticalOrders.some(d => d.state === 'waiting')) {
                this._idle(state, 'terrain_window', { until: Math.min(...state.tacticalOrders.filter(d => d.state === 'waiting')
                    .flatMap(d => d.orders.filter(o => !o.sent).map(o => o.departureAt))) });
            } else {
                if (now() < deadline && planned && ['accumulating', 'no_useful_legal_action', 'maintaining_control'].includes(planned.reason) && (this._manageLogistics(view, state, reserved) || this._tacticalInvestment(view, state, reserved))) {
                    this._idle(state, state.lastEconomicAction === 'logistics' ? 'deliberate_logistics' : 'deliberate_investment');
                } else this._idle(state, planned?.reason || 'budget_exhausted', { target: planned?.target, requiredPower: planned?.requiredPower });
                if (state.idleReason.code === 'budget_exhausted') state.opportunitySince ??= this.time;
                else state.opportunitySince = null;
            }
            for (const d of state.tacticalOrders) if (['completed', 'cancelled'].includes(d.state)) {
                state.tacticalHistory.push({ time: this.time, purpose: d.purpose, target: d.target,
                    outcome: d.state, reason: d.reason || 'resolved', survivors: d.sent.filter(u => !u.pendingRemoval).length,
                    actualArrivals: d.arrived.size, lossesBeforeObservedArrival: d.sent.filter(u => u.pendingRemoval && !d.arrived.has(u)).length, externalChanges: this.events.filter(e => e.time > d.observedAt && d.dependencies?.includes(e.node)).map(e => ({ time: e.time, type: e.type })), transport: d.transport, actualOwner: this.world.nodes[d.target]?.owner, predictedOwner: d.expected?.owner });
                if (state.tacticalHistory.length > 64) state.tacticalHistory.shift();
            }
            state.tacticalOrders = state.tacticalOrders.filter(d => !['completed', 'cancelled'].includes(d.state));
        }
    }
    _dispatchTactical(view, state, d) {
        const world = this.world, target = world.nodes[d.target];
        if (!target || (target.owner !== d.targetOwner && target.owner !== state.faction)) {
            d.state = 'cancelled'; d.reason = 'target_changed'; return;
        }
        for (const order of d.orders) {
            if (order.sent) continue;
            order.departureAt ??= d.plannedAt + order.delay;
            if (view.time + 1e-6 < order.departureAt) { d.state = 'waiting'; continue; }
            const source = world.nodes[order.source];
            if (!source || order.selected.some(u => u.pendingRemoval || u.state !== 'idle' || u.targetNode !== source)) {
                d.state = 'cancelled'; d.reason = 'reserved_units_changed'; break;
            }
            if (d.purpose !== 'evacuation') {
                const policy = sourceRetention(view, state, state.profile || resolveAIProfile(world.aiStrategy, null, state.faction, state.difficulty), order.source, this.playerFaction || 'player');
                const current = (view.idle[order.source].get(state.faction) || []).filter(u => !u.pendingRemoval && u.state === 'idle' && u.targetNode === source);
                if (order.selected.some(u => policy.locked.has(u)) || unitPower(current) - unitPower(order.selected) < policy.minimumPower) {
                    d.state = 'cancelled'; d.reason = 'source_commitment_changed'; break;
                }
            }
            if (order.delay > 0 && d.deepValidated) {
                if (view.time > order.departureAt + .12 || !defensesMatch(d.snapshot, world, view.time - d.snapshot.time, d.dependencies)
                    || !d.dependencies.every(i => d.snapshot.nodes[i].owner === world.nodes[i]?.owner)) {
                    d.state = 'cancelled'; d.reason = 'forecast_expired'; break;
                }
                const liveWindow = order.kind === 'portal' ? { delay: 0 } : departureWindow(view,order.source,order.target ?? d.target);
                if (liveWindow.delay > .02) { d.state = 'cancelled'; d.reason = 'window_changed'; break; }
                if (!militaryCompatible(d.snapshot,world,[d.target,order.target ?? d.target],view.time-d.snapshot.time)) {
                    d.state = 'cancelled'; d.reason = 'new_military_evidence'; break;
                }
            } else if (order.delay > 0) {
                // Re-evaluate only this cohort and its destination at the actual window.
                const fresh = assessTransfer(view, order.source, d.target, state.faction, order.selected);
                if (fresh.status !== 'known' || fresh.delay > .02 || fresh.lossUpper >= order.selected.length) {
                    d.state = 'cancelled'; d.reason = 'window_changed'; break;
                }
                const surviving = [...order.selected].sort((a, b) => (b.power || 1) - (a.power || 1)).slice(fresh.lossUpper);
                const heavy = surviving.filter(u => (u.power || 1) > 1).length;
                const updated = projectNode(view, d.target, state.faction, [{ light: surviving.length - heavy, heavy, eta: fresh.last }],
                    { horizon: Math.min(60, fresh.last + 40) });
                if (updated.owner !== state.faction && !updated.captured && d.purpose !== 'defense') {
                    d.state = 'cancelled'; d.reason = 'purpose_no_longer_useful'; break;
                }
            }
            const count = order.kind === 'portal' ? activatePortal(world,source,state.faction,order.selected)
                : issueTroopOrder(world, source, world.nodes[order.target ?? d.target], order.selected.length, state.faction, order.selected);
            if (!count) { d.state = 'cancelled'; d.reason = 'illegal_order'; this.metrics.vetoes++; break; }
            state.relocations ??= new WeakMap();
            const signature = view.nodes.map(n => n.owner).join('|');
            for (const u of order.selected) {
                state.relocations.set(u, { source: order.source, target: order.target ?? d.target, signature, goal: d.followUp });
                if (d.transport?.goal !== undefined) u._aiTransportGoal = d.transport.goal;
            }
            order.sent = true; d.sent.push(...order.selected); d.state = 'dispatch'; this.metrics.orders++;
            if (d.emittedAt === null) {
                d.emittedAt = view.time;
                const intentionalWait = Math.max(0, order.delay);
                const latency = Math.max(0, view.time - d.observedAt - intentionalWait) * 1000;
                state.latencies.push(latency); if (state.latencies.length > 128) state.latencies.shift();
                if (view.time - intentionalWait > d.deadline + 1e-6) state.latencyViolations++;
                state.decisions++;
            }
            state.tacticalHistory.push({ time: view.time, observedAt: d.observedAt, purpose: d.purpose, source: order.source,
                target: d.target, units: count, intentionalWaitMs: Math.max(0, order.delay) * 1000,
                latencyMs: Math.max(0, view.time - d.observedAt - (order.delay || 0)) * 1000,
                expectedOwner: d.expected?.owner, predictedPower: d.expected?.ownPower });
            Object.assign(state.tacticalHistory.at(-1), { retainedPower: order.retainedPower, retentionReason: order.retentionReason, predictedArrivals: order.transfer ? { lower: count-order.transfer.lossUpper, estimate: count-order.transfer.lossExpected, upper: count-order.transfer.lossLower } : d.expected?.arrived, revision: this.revision });
            if (state.tacticalHistory.length > 64) state.tacticalHistory.shift();
            this.trace.record(state.tacticalHistory.at(-1));
        }
        if (d.state !== 'cancelled' && d.orders.some(o => !o.sent)) d.state = 'waiting';
    }
    _trackTactics(view, state) {
        const relief = [];
        for (let i = 0; i < view.nodes.length; i++) {
            if (view.nodes[i].owner !== state.faction) continue;
            let hostile = 0;
            for (const [f, g] of view.presence[i]) if (f !== state.faction) hostile += g.light + 3 * g.heavy;
            for (const w of view.arrivals[i]) if (w.faction !== state.faction && w.eta <= 5) hostile += w.light + 3 * w.heavy;
            if (hostile > unitPower(view.idle[i].get(state.faction) || [])) relief.push(i);
        }
        for (const d of state.tacticalOrders) if (d.state === 'waiting' && d.purpose !== 'defense' && d.purpose !== 'evacuation') {
            if (d.orders.some(o => !o.sent && relief.some(i => i === o.source || !this.world.isPathBlocked?.(view.nodes[o.source], view.nodes[i])))) {
                d.orders = d.orders.filter(o => o.sent);
                d.state = d.sent.length ? 'dispatch' : 'cancelled'; d.reason = 'defense_preemption';
            }
        }
        for (const d of state.tacticalOrders) {
            if (d.state === 'waiting') { this._dispatchTactical(view, state, d); continue; }
            if (!['dispatch', 'dispute', 'consolidation'].includes(d.state)) continue;
            const target = view.nodes[d.target];
            if (!target) { d.state = 'cancelled'; continue; }
            const surviving = d.sent.filter(u => !u.pendingRemoval);
            for (const u of surviving) if (u.state === 'idle' && u.targetNode === target) d.arrived.add(u);
            if (d.transport && surviving.some(u => u.state === 'idle' && u.targetNode === target)) d.transport.phase = target.isMobile ? 'riding' : target.owner === state.faction ? 'completed' : 'landing_dispute';
            if (!surviving.length || surviving.every(u => u.targetNode !== target)) { d.state = 'completed'; continue; }
            if (surviving.every(u => u.state === 'idle')) {
                if (target.owner !== state.faction) d.state = 'dispute';
                else {
                    const contested = [...view.presence[d.target]].some(([f, g]) => f !== state.faction && g.light + g.heavy > 0)
                        || view.arrivals[d.target].some(w => w.faction !== state.faction && w.eta <= 8);
                    d.state = contested ? 'consolidation' : 'completed';
                }
            }
            if (view.time - d.observedAt > 60) { d.state = 'completed'; d.reason = 'reassessed'; }
        }
    }
    _manageLogistics(view, state, reserved) {
        for (let source = 0; source < view.nodes.length; source++) {
            const node = view.nodes[source];
            if (node.owner !== state.faction || node.type === 'tunel' || node.isMobile) continue;
            const route = routeFromOrigin(view, state.faction, state.profile, source, this.playerFaction || 'player');
            const target = route && view.nodes[route.stages[0]];
            if (node.tunnelTo && (!target || node.tunnelTo !== target || target.owner !== state.faction)) {
                removeLogisticsLink(node, state.faction);
                state.tacticalHistory.push({ time: this.time, purpose: 'logistics_removed', source, reason: 'route_changed' });
                if (state.tacticalHistory.length > 64) state.tacticalHistory.shift();
            }
            if (!target || target.owner !== state.faction || node.tunnelTo === target || Math.hypot(target.x-node.x,target.y-node.y) < 175
                || [...reserved].some(u => u.targetNode === node)) continue;
            const policy = sourceRetention(view,state,state.profile,source,this.playerFaction || 'player');
            if (policy.locked.size) continue;
            // Do not buy a permanent production route for a temporary ferry or
            // for a contested destination that currently needs the payment army.
            if (target.isMobile || [...view.presence[route.stages[0]]].some(([f,g]) => f !== state.faction && g.light+g.heavy > 0)
                || view.arrivals[route.stages[0]].some(w => w.faction !== state.faction && w.eta <= 8)
                || view.arrivals[source].some(w => w.faction !== state.faction && w.eta <= 8)) continue;
            if (setLogisticsLink(this.world,node,target,state.faction,policy.minimumPower)) {
                state.lastEconomicAction = 'logistics';
                state.tacticalHistory.push({ time: this.time, purpose: 'logistics_created', source, target: route.stages[0], followUp: route.goal });
                if (state.tacticalHistory.length > 64) state.tacticalHistory.shift();
                return true;
            }
        }
        return false;
    }
    _tacticalInvestment(view, state, reserved) {
        if (this.world.allowEvolutions === false || this.time < (state.nextInvestment || 0)) return false;
        for (let source = 0; source < view.nodes.length; source++) {
            const node = view.nodes[source];
            if (node.owner !== state.faction || node.type === 'tunel' || node.evolution || node.pendingEvolution) continue;
            if ([...reserved].some(u => u.targetNode === node)) continue;
            const available = (view.idle[source].get(state.faction) || []).filter(u => !reserved.has(u) && u.state === 'idle');
            const retention = sourceRetention(view, state, state.profile, source, this.playerFaction || 'player');
            const floor = Math.max(retention.minimumPower, state.profile.minEvolutionGarrison ?? 0);
            const candidates = evolutionCandidates(view, state.faction, source, state.profile, this.playerFaction || 'player');
            for (const candidate of candidates) {
            const { type, cost } = candidate;
            if (unitPower(available) - cost < floor) continue;
            const paid = []; let paidPower = 0;
            for (const u of [...available].sort((a, b) => (a.power || 1) - (b.power || 1))) {
                if (paidPower >= cost) break; paid.push(u); paidPower += u.power || 1;
            }
            if (unitPower(available) - paidPower < floor) continue;
            const hypotheses = [];
            for (let i = 0; i < view.nodes.length; i++) {
                const rival = view.nodes[i];
                if (rival.owner === state.faction || rival.owner === 'neutral' || state.profile.diplomacy?.[state.faction]?.allyTo?.includes(rival.owner)) continue;
                if (!mayCounterattack(view, rival.owner, state.faction, state.difficulty, this.playerFaction || 'player')) continue;
                const eta = Math.hypot(rival.x - node.x, rival.y - node.y) / 75;
                if (eta > 8 || this.world.isPathBlocked?.(rival, node)) continue;
                const units = view.idle[i].get(rival.owner) || [], heavy = units.filter(u => (u.power || 1) > 1).length;
                hypotheses.push({ faction: rival.owner, light: units.length - heavy, heavy, eta });
            }
            // Each possible rival response is evaluated separately, not as a coalition.
            if (hypotheses.some(w => projectNode(view, source, state.faction, [], { withdrawals: paid, hypotheses: [w], horizon: 12 }).owner !== state.faction)) continue;
            if (projectNode(view, source, state.faction, [], { withdrawals: paid, horizon: 12 }).owner !== state.faction) continue;
            if (!node.startEvolution?.(type)) continue;
            CombatManager.killNPower(this.world, node, state.faction, cost);
            state.lastEconomicAction = 'evolution';
            state.nextInvestment = this.time + AI_CADENCE[state.difficulty].strategy;
            state.tacticalHistory.push({ time: this.time, purpose: 'investment', source, target: source, evolution: type, cost,
                reason: candidate.reason, reserveFloor: floor, alternatives: candidates.map(c => ({ type: c.type, score: c.score })) });
            if (state.tacticalHistory.length > 64) state.tacticalHistory.shift();
            this.metrics.investments = (this.metrics.investments || 0) + 1;
            return true;
            }
        }
        return false;
    }
    _acceptForecast({ state, operation: op, snapshot }) {
        if (!op.forecast || !op.orders.length) return;
        const target = this.world.nodes[op.target];
        const departure = Math.min(...op.orders.map(o => o.delay));
        if (!target || target.owner !== snapshot.nodes[op.target].owner || this.time > snapshot.time + departure + .12) {
            op.cancel('forecast_expired'); this.metrics.stale++; return;
        }
        const elapsed = Math.max(0,this.time-snapshot.time);
        if (!militaryCompatible(snapshot,this.world,[op.target,...op.orders.map(o=>o.target ?? op.target)],elapsed)) {
            op.cancel('new_military_evidence'); this.metrics.stale++; return;
        }
        const reserved = new Set(state.tacticalOrders.filter(d => d.state === 'waiting').flatMap(d => d.orders.filter(o => !o.sent).flatMap(o => o.selected)));
        const d = new TacticalDecision(state.faction, op.target, op.kind, snapshot.time, snapshot.time + AI_CADENCE[state.difficulty].routineMs / 1000);
        d.transport = op.transport;
        d.deepValidated = true; d.snapshot = snapshot; d.targetOwner = target.owner; d.expected = op.forecast;
        d.dependencies = [...new Set([op.target, ...op.orders.flatMap(o => [o.source, o.target ?? op.target])])];
        for (const order of op.orders) {
            const selected = order.units.map(i => snapshot.liveUnits[i]), source = this.world.nodes[order.source];
            if (selected.some(u => !u || reserved.has(u) || u.pendingRemoval || u.state !== 'idle' || u.targetNode !== source)) {
                op.cancel('resources_changed'); this.metrics.stale++; return;
            }
            d.orders.push({ source: order.source, target: order.target ?? op.target, kind: order.kind, selected, delay: order.delay });
        }
        state.tacticalOrders.push(d);
        this._dispatchTactical(new TacticalObservation(this.world), state, d);
    }
    _chooseOperation(snapshot, state, playerFaction) {
        const sources = [];
        for (let i = 0; i < snapshot.nodes.length; i++) if (pool(snapshot, i, state.faction).length) sources.push(i);
        if (!sources.length) return null;
        const source = sources[state.cursor++ % sources.length];
        const candidates = [];
        const evacuate = environmentDanger(snapshot, source);
        const sourceFront = Math.min(Infinity, ...snapshot.nodes.filter(n => n.owner !== state.faction
            && canTargetFaction(state.profile, state.faction, n.owner, playerFaction))
            .map(n => Math.hypot(n.x - snapshot.nodes[source].x, n.y - snapshot.nodes[source].y)));
        for (let t = 0; t < snapshot.nodes.length; t++) {
            if (source === t) continue;
            const a = snapshot.nodes[source], b = snapshot.nodes[t];
            if (crossesBarrier(a, b, snapshot.barriers, snapshot.game)) continue;
            const friendly = b.owner === state.faction;
            if (!friendly && !canTargetFaction(state.profile, state.faction, b.owner, playerFaction)) continue;
            const distance = Math.hypot(a.x - b.x, a.y - b.y);
            const threat = hasMainThreat(snapshot, t, state.faction, 15);
            const forward = friendly && pool(snapshot, source, state.faction).length > 20
                && snapshot.nodes.some(n => canTargetFaction(state.profile, state.faction, n.owner, playerFaction)
                    && Math.hypot(n.x - b.x, n.y - b.y) + 150 < sourceFront);
            if (friendly && !threat && !evacuate && !forward) continue;
            const otherFactions = Object.keys(b.counts).filter(f => f !== state.faction && b.counts[f] > 0);
            let score = (friendly ? 500 + threat * 2 : 160 + (b.productionRate || 1) * 30)
                / (1 + distance / 450);
            if (!friendly) score -= Math.sqrt(threat) * 8;
            if (!friendly) score *= getDiplomacyScoreMult(state.profile, b.owner, state.faction, playerFaction);
            if (otherFactions.length > 1) score += 60; // A real contested opportunity, not allied defenders.
            if (evacuate && !environmentDanger(snapshot, t)) score += 1000;
            if (snapshot.lightSweeps.some(s => s.predictNodeNeutralization?.(b, snapshot.game, snapshot.time, 15) < snapshot.time + 15)) score *= 0.3;
            if (t === state.lastTarget && this.time - state.lastProgress < 12) score *= 1.15;
            const doctrine = state.profile.focus || state.profile.doctrine;
            if (doctrine === 'expansion' && b.owner === 'neutral') score *= 1.3;
            if ((doctrine === 'turtle' || doctrine === 'fortress') && friendly) score *= 1.4;
            if (!friendly && b.owner !== 'neutral') score *= state.profile.aggressionMult || 1;
            const objective = this.world.aiObjectives?.[state.faction];
            if (objective?.targetNode === t) score += objective.priority ?? 300;
            candidates.push({ target: t, source, kind: evacuate ? 'evacuation' : friendly ? threat ? 'defense' : 'reinforcement'
                : b.owner === 'neutral' ? 'expansion' : 'conquest', score });
        }
        candidates.sort((a, b) => b.score - a.score || a.target - b.target);
        if (!candidates.length) return this._investment(snapshot, state, source);
        const op = new OperationPlan(++this.serial, state.faction, candidates[0].target, candidates[0].kind, this.time);
        op.candidates = candidates.slice(0, 3);
        return op;
    }
    _reserve(snapshot, source, faction, horizon) {
        const incoming = hasMainThreat(snapshot, source, faction, horizon);
        const incomingOwn = snapshot.arrivals[source].filter(a => a.faction === faction && a.eta <= horizon).reduce((v, a) => v + a.power, 0);
        return Math.max(snapshot.nodes[source].owner === faction ? 1 : 0, Math.ceil(incoming * 1.2 - incomingOwn));
    }
    _orders(snapshot, state, candidate) {
        const retentionView = new TacticalObservation(this.world);
        const sources = [candidate.source];
        for (let i = 0; i < snapshot.nodes.length; i++) {
            if ((candidate.kind !== 'portal' && candidate.transportKind !== 'portal') && candidate.transportDelay === undefined && i !== candidate.source && i !== candidate.target && pool(snapshot, i, state.faction).length) sources.push(i);
        }
        const target = snapshot.nodes[candidate.target];
        sources.sort((a, b) => Math.hypot(snapshot.nodes[a].x - target.x, snapshot.nodes[a].y - target.y)
            - Math.hypot(snapshot.nodes[b].x - target.x, snapshot.nodes[b].y - target.y));
        const orders = [];
        for (const source of sources) {
            const reserved = new Set(state.tacticalOrders.filter(d => d.state === 'waiting').flatMap(d => d.orders.filter(o => !o.sent).flatMap(o => o.selected)));
            const policy = sourceRetention(retentionView, state, state.profile, source, this.playerFaction || 'player');
            const ownership = snapshot.nodes.map(n => n.owner).join('|');
            const ids = pool(snapshot, source, state.faction).filter(id => !reserved.has(snapshot.liveUnits[id]) && snapshot.liveUnits[id]?.state === 'idle'
                && (candidate.kind === 'evacuation' || !policy.locked.has(snapshot.liveUnits[id]))
                && (candidate.kind !== 'regroup' || !(() => {
                    const previous = state.relocations?.get(snapshot.liveUnits[id]);
                    return previous && previous.source === candidate.target && previous.target === source && previous.signature === ownership;
                })()));
            const reservedPower = candidate.kind === 'evacuation' ? 0 : Math.max(policy.minimumPower, this._reserve(snapshot, source, state.faction, 15));
            let leftPower = power(snapshot, ids), take = 0;
            while (take < ids.length && leftPower - (snapshot.units[ids[take]].power || 1) >= reservedPower) {
                leftPower -= snapshot.units[ids[take]].power || 1; take++;
            }
            if (!take) continue;
            const speed = Math.min(...ids.slice(0, take).map(i => snapshot.units[i].speed || 75));
            // Fixed forecast preparation window. Never grows with worker latency.
            const lead = candidate.transportDelay ?? .35;
            const departureSnapshot = { ...snapshot, intermittentBarriers: snapshot.intermittentBarriers.map(g => {
                const out = Object.create(Object.getPrototypeOf(g)); Object.assign(out, g);
                const timer = g.timer + lead, steps = Math.max(0, Math.floor(timer / g.interval));
                out.activeZoneIndex = (g.activeZoneIndex + steps) % Math.max(1, g.zones.length);
                out.timer = timer - steps * g.interval; return out;
            }) };
            const window = (candidate.kind === 'portal' || candidate.transportKind === 'portal') ? {delay:0} : departureWindow(departureSnapshot, source, candidate.target, speed);
            if (!Number.isFinite(window.delay)) continue;
            window.delay += lead;
            const a = snapshot.nodes[source];
            const transit = (Math.hypot(a.x - target.x, a.y - target.y) + a.radius + target.radius * 4) / speed;
            // Wait at a real nest; physical replay below validates survival during the wait.
            for (const water of snapshot.waterSweeps) {
                const unsafe = water.predictUnsafeUntil(a.x, a.y, target.x, target.y, snapshot.time + window.delay,
                    transit, snapshot.time, snapshot.game.width, snapshot.game.height);
                if (unsafe >= snapshot.time + window.delay) window.delay = unsafe - snapshot.time + 0.1;
            }
            orders.push({ source, target: candidate.target, kind: (candidate.kind === 'portal' || candidate.transportKind === 'portal') ? 'portal' : undefined, units: ids.slice(0, take), delay: window.delay, speed });
            if ((candidate.kind === 'portal' || candidate.transportKind === 'portal') || orders.length >= AI_CADENCE[state.difficulty].sources || snapshot.nodes[candidate.target].isMobile || snapshot.nodes[source].isMobile) break;
        }
        let commonArrival = 0;
        for (const order of orders) {
            const a = snapshot.nodes[order.source];
            order.transit = Math.hypot(a.x - target.x, a.y - target.y) / order.speed;
            commonArrival = Math.max(commonArrival, order.delay + order.transit);
        }
        for (const order of orders) {
            const offset = commonArrival - order.transit;
            if (offset <= order.delay + 0.1) continue;
            // Validate the shifted window instead of delaying into a closing gate.
            const shifted = { ...snapshot, intermittentBarriers: snapshot.intermittentBarriers.map(g => {
                const out = Object.create(Object.getPrototypeOf(g)); Object.assign(out, g);
                out.timer += offset; const steps = Math.max(0, Math.floor(out.timer / out.interval));
                out.timer -= steps * out.interval; out.activeZoneIndex = (out.activeZoneIndex + steps) % out.zones.length;
                return out;
            }) };
            if (departureWindow(shifted, order.source, candidate.target, order.speed).delay === 0) order.delay = offset;
        }
        return orders;
    }
    _responses(snapshot, state, targetIndex, orders, playerFaction) {
        const candidates = [], target = snapshot.nodes[targetIndex];
        for (let i = 0; i < snapshot.nodes.length; i++) {
            const n = snapshot.nodes[i];
            if (i === targetIndex || n.owner === 'neutral' || n.owner === state.faction) continue;
            if (state.profile.diplomacy?.[state.faction]?.allyTo?.includes(n.owner)) continue;
            const responder = resolveAIProfile(this.world.aiStrategy, null, n.owner, this.difficulty);
            if (n.owner !== playerFaction && !canTargetFaction(responder, n.owner, state.faction, playerFaction)) continue;
            const ids = pool(snapshot, i, n.owner);
            if (ids.length < 2) continue;
            const window = departureWindow(snapshot, i, targetIndex);
            if (!Number.isFinite(window.delay)) continue;
            candidates.push({ source: i, target: targetIndex, units: ids.slice(0, -1),
                delay: Math.max(window.delay, AI_CADENCE.normal.reaction), response: true,
                distance: Math.hypot(n.x - target.x, n.y - target.y) });
        }
        candidates.sort((a, b) => a.distance - b.distance || a.source - b.source);
        const responses = candidates.slice(0, 2).map(r => [r]);
        const r = candidates[0], origin = orders[0];
        if (r && origin && Number.isFinite(departureWindow(snapshot, r.source, origin.source).delay)) {
            responses.push([{ ...r, target: origin.source, delay: Math.max(0.35, departureWindow(snapshot, r.source, origin.source).delay) }]);
        }
        return responses.slice(0, 3);
    }
    *_plan(snapshot, state, op, playerFaction) {
        if (op.kind === 'investment') return op;
        let best = null, bestUtility = -Infinity;
        const candidates = op.candidates.flatMap(candidate => {
            if (!snapshot.nodes[candidate.source].isMobile && !snapshot.nodes[candidate.target].isMobile) return [candidate];
            const speed = Math.min(...pool(snapshot,candidate.source,state.faction).map(i => snapshot.units[i].speed || 75));
            return ferryWindows(snapshot,candidate.source,candidate.target,speed).map(window => ({ ...candidate, transportDelay: window.delay + .35 }));
        }).slice(0,3);
        op.analysisDeadline = Math.max(this.time + 1, snapshot.time + Math.max(0, ...candidates.map(c => c.transportDelay || 0)) + .12);
        if (state.job?.request) state.job.request.expiresAt = op.analysisDeadline;
        for (const candidate of candidates) {
            const orders = this._orders(snapshot, state, candidate);
            if (!orders.length) continue;
            // Admissible upper bound: even zero losses cannot beat the current plan.
            if (best && candidate.score + orders.reduce((sum, o) => sum + o.units.length, 0) <= bestUtility) continue;
            for (const o of orders) for (const id of o.units) op.reservations.add(id);
            this.metrics.forecasts++;
            const portal = snapshot.nodes[candidate.target];
            const effectiveTarget = (candidate.kind !== 'portal' && candidate.transportKind !== 'portal') && portal.owner === state.faction && portal.type === 'tunel' && portal.tunnelTo ? snapshot.nodes.indexOf(portal.tunnelTo) : candidate.target;
            const forecast = yield* this._forecast(snapshot, state.faction, effectiveTarget, orders, { holdSeconds: 0, horizon: effectiveTarget !== candidate.target || portal.isMobile || snapshot.nodes[candidate.source].isMobile ? 90 : 30 });
            if (this.time > snapshot.time + Math.min(...orders.map(o => o.delay)) + .12) { this.metrics.stale++; continue; }
            if ((!forecast.capturedAt && forecast.owner !== state.faction) || !forecast.arrived) { op.reservations.clear(); continue; }
            if (candidate.kind === 'regroup' && forecast.arrived < orders.reduce((n,o)=>n+o.units.length,0)/2) {
                op.reservations.clear(); continue;
            }
            let utility = candidate.score + forecast.survivors - forecast.transitLosses;
            const responseResults = [];
            // Rival alternatives are already ranked by the tactical lane. A
            // terrain fallback must not wait for serial hypothetical replays.
            const responseBudget = 0;
            for (const responses of this._responses(snapshot, state, candidate.target, orders, playerFaction).slice(0, responseBudget)) {
                this.metrics.forecasts++;
                const response = yield* this._forecast(snapshot, state.faction, candidate.target, orders, { responses, holdSeconds: 0, horizon: 30 });
                responseResults.push(response);
                if (!response.held) utility -= candidate.score * 0.25;
                if (response.sourceOwners?.some(s => snapshot.nodes[s.source].owner === state.faction && s.owner !== state.faction)) utility -= candidate.score * 0.5;
            }
            if (utility > bestUtility) { bestUtility = utility; best = { candidate, orders, forecast, responseResults, effectiveTarget }; }
            op.reservations.clear();
            if (best) break;
        }
        if (!best) {
            const investment = this._investment(snapshot, state, op.candidates[0]?.source);
            if (investment) return investment;
            op.kind = 'accumulation'; op.reason = 'insufficient_force'; op.state = 'waiting';
            op.retryAt = this.time + AI_CADENCE[state.difficulty].strategy;
            return op;
        }
        op.transport = best.candidate.mission;
        op.target = best.effectiveTarget; op.kind = best.candidate.kind; op.orders = best.orders;
        op.forecast = best.forecast; op.responses = best.responseResults;
        for (const order of op.orders) for (const id of order.units) op.reservations.add(id);
        op.state = op.orders.some(o => o.delay > 0) ? 'waiting' : 'preparation';
        return op;
    }
    *_forecast(snapshot, faction, target, orders, options = {}) {
        // Identity includes every selected unit and the exact frozen observation/calendar.
        const serialize = list => list.map(o => `${o.kind || 'travel'}:${o.source}>${o.target ?? target}@${o.delay}:${o.units.join(',')}`).join(';');
        const key = `${snapshot.time}|${snapshot.revision}|${faction}|${target}|${serialize(orders)}|${serialize(options.responses || [])}|${options.holdSeconds ?? 10}|${options.horizon ?? 90}|${options.step ?? snapshot.simulationStep}`;
        if (this.cache.has(key)) { this.metrics.cacheHits++; return this.cache.get(key); }
        let result;
        const request = this.forecastWorker.request(snapshot, faction, target, orders, options);
        if (request) {
            try {
                while (!request.done) yield 'waiting_worker';
                result = request.result;
            } finally { this.forecastWorker.cancel(request); }
        }
        if (!result) result = yield* forecastOperation(snapshot, faction, target, orders, options);
        if (this.cache.size >= 16) this.cache.delete(this.cache.keys().next().value);
        this.cache.set(key, result);
        return result;
    }
    _investment(snapshot, state, source) {
        if (source == null || this.world.allowEvolutions === false) return null;
        const n = snapshot.nodes[source];
        if (n.owner !== state.faction || n.evolution || n.pendingEvolution || hasMainThreat(snapshot, source, state.faction, 10)) return null;
        const ids = pool(snapshot, source, state.faction);
        const evolution = state.profile.preferredEvolution || 'tanque';
        const cost = Math.ceil(EVO_COSTS[evolution] * (this.world.campaignModifiers?.[state.faction]?.evolutionDiscount || 1));
        if (!cost || power(snapshot, ids) < cost + this._reserve(snapshot, source, state.faction, 15) + 10) return null;
        const op = new OperationPlan(++this.serial, state.faction, source, 'investment', this.time);
        op.evolution = evolution; op.cost = cost; return op;
    }
    _accept({ state, operation: op, snapshot }) {
        const target = this.world.nodes[op.target];
        const elapsed = this.time - snapshot.time;
        if (!defensesMatch(snapshot, this.world, elapsed)) {
            op.cancel('defense_changed'); this.metrics.stale++; state.nextStrategy = this.time; return;
        }
        const temporal = snapshot.hazards.length || snapshot.waterSweeps.length || snapshot.lightSweeps.length
            || snapshot.intermittentBarriers.length || snapshot.nodes.some(n => n.isMobile || n.tunnelTo);
        const departure = op.orders.length ? Math.min(...op.orders.map(o => o.delay)) : Infinity;
        if (temporal && elapsed > departure + 0.12) {
            state.forecastLead = 0;
            op.cancel('forecast_expired'); this.metrics.stale++; state.nextStrategy = this.time; return;
        }
        if (!target || target.owner !== snapshot.nodes[op.target].owner) {
            op.cancel('observation_changed'); this.metrics.stale++; state.nextStrategy = this.time; return;
        }
        // Proposals may finish on different frames. Do not consume changed sources or target armies.
        const factions = new Set([...Object.keys(snapshot.nodes[op.target].counts), ...Object.keys(target.counts)]);
        for (const f of factions) {
            const count = snapshot.nodes[op.target].counts[f] || 0;
            if (Math.abs((target.counts[f] || 0) - count) > Math.max(2, count * 0.1)) {
                op.cancel('target_force_changed'); this.metrics.stale++; state.nextStrategy = this.time; return;
            }
        }
        op.accepted = this.time; op.snapshot = snapshot;
        state.operation = op; state.decisions++;
        state.operations.push(op);
        state.lastTarget = op.target; state.lastProgress = this.time;
        this.trace.record({ time: this.time, faction: state.faction, operation: op.id, kind: op.kind,
            target: op.target, status: op.forecast?.status, arrived: op.forecast?.arrived,
            losses: op.forecast?.transitLosses, hypotheses: op.responses?.map(r => ({ held: r.held, survivors: r.survivors })) });
        this._trackOperation(state);
    }
    _trackOperation(state) {
        const op = state.operation;
        if (!op || ['completed', 'cancelled'].includes(op.state)) return;
        const world = this.world, target = world.nodes[op.target];
        if (!target) { op.cancel('target_removed'); return; }
        if (op.kind === 'accumulation') {
            if (this.time >= op.retryAt || state.urgentSince !== null) {
                op.cancel('reassess_accumulation'); this._archive(state, op); state.nextStrategy = this.time;
            }
            return;
        }
        if (op.kind === 'investment') {
            if (target.owner !== state.faction || target.evolution || target.pendingEvolution) { op.cancel('investment_invalid'); return; }
            const ids = world.allUnits.filter(u => !u.pendingRemoval && u.faction === state.faction && u.state === 'idle' && u.targetNode === target);
            if (ids.reduce((v, u) => v + u.power, 0) < op.cost + 1) { op.cancel('budget_changed'); return; }
            if (!target.startEvolution?.(op.evolution)) { op.cancel('evolution_rejected'); return; }
            CombatManager.killNPower(world, target, state.faction, op.cost);
            op.state = 'completed'; this._archive(state, op); return;
        }
        for (const order of op.orders) {
            if (order.sent || this.time < op.snapshot.time + order.delay) continue;
            const source = world.nodes[order.source];
            if (!source || (source.owner !== op.snapshot.nodes[order.source].owner && source.owner !== state.faction)) { op.cancel('source_lost'); break; }
            if (!defensesMatch(op.snapshot, world, this.time - op.snapshot.time)) { op.cancel('defense_changed'); break; }
            if (target.owner !== state.faction && !canTargetFaction(state.profile, state.faction, target.owner, this.playerFaction || 'player')) {
                op.cancel('target_relationship_changed'); break;
            }
            const eligible = order.units.map(id => op.snapshot.liveUnits[id]);
            const expectedPower = power(op.snapshot, order.units);
            const actualPower = eligible.slice(0, order.units.length).reduce((v, u) => v + (u.power || 1), 0);
            if (actualPower !== expectedPower || eligible.some(u => !u || u.pendingRemoval || u.state !== 'idle' || u.targetNode !== source)) {
                op.cancel('reserved_force_changed'); break;
            }
            if (world.isPathBlocked?.(source, target)) { op.cancel('passage_changed'); break; }
            // Recheck the whole future gate window at the actual dispatch time.
            const shift = this.time - op.snapshot.time;
            const freshGates = (world.intermittentBarriers || []);
            const window = departureWindow({ ...op.snapshot, nodes: world.nodes, intermittentBarriers: freshGates }, order.source, op.target, order.speed);
            if (window.delay > 0) { op.cancel('window_missed'); break; }
            const temporal = op.snapshot.hazards.length || op.snapshot.waterSweeps.length || op.snapshot.lightSweeps.length
                || op.snapshot.intermittentBarriers.length || op.snapshot.nodes.some(n => n.isMobile || n.tunnelTo);
            if (temporal && shift > order.delay + 0.12) {
                state.forecastLead = 0;
                op.cancel('forecast_expired'); break;
            }
            const departing = eligible.slice(0, order.units.length);
            const sent = issueTroopOrder(world, source, target, order.units.length, state.faction, eligible);
            if (!sent) { op.cancel('order_rejected'); this.metrics.vetoes++; break; }
            order.sent = true; op.sent.push(...departing); this.metrics.orders++;
            op.state = 'dispatch'; op.reservations.clear();
        }
        if (op.state === 'cancelled') { this._archive(state, op); state.nextStrategy = this.time; return; }
        const arrived = op.sent.filter(u => !u.pendingRemoval && u.state === 'idle' && u.targetNode === target).length;
        for (const u of op.sent) if (!u.pendingRemoval && u.state === 'idle' && u.targetNode === target) op.arrivals.add(u);
        if (arrived) op.state = target.owner === state.faction ? 'consolidation' : 'dispute';
        if (target.owner === state.faction && op.orders.every(o => o.sent)) {
            op.capturedAt ??= this.time;
            if (this.time - op.capturedAt >= 0) { op.state = 'completed'; this._archive(state, op); }
        } else op.capturedAt = null;
        if (op.orders.every(o => o.sent) && op.sent.length && op.sent.every(u => u.pendingRemoval)) {
            op.cancel('force_destroyed'); this._archive(state, op);
        }
        if (this.time - op.created > 90) { op.cancel('operation_timeout'); this._archive(state, op); }
    }
    _archive(state, op) {
        op.reservations.clear();
        const actualArrivals = op.sent.filter(u => !u.pendingRemoval && u.state === 'idle').length;
        state.history.push({ id: op.id, kind: op.kind, target: op.target, state: op.state, reason: op.reason,
            predictedArrivals: op.forecast?.arrived, actualArrivals: op.arrivals.size, actualSurvivors: actualArrivals,
            transitLosses: op.sent.filter(u => u.pendingRemoval && !op.arrivals.has(u)).length });
        if (state.history.length > 32) state.history.shift();
        op.snapshot = null; op.sent.length = 0; op.arrivals.clear();
    }
    diagnostics() {
        const sorted = [...this.samples].sort((a, b) => a - b);
        const percentile = p => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] || 0;
        return { metrics: { ...this.metrics }, timings: { ...this.timings },
            workCosts: this.workCosts,
            worker: { enabled: !!this.forecastWorker.worker, completed: this.forecastWorker.completed,
                cpuMs: this.forecastWorker.cpuMs, pending: this.forecastWorker.pending.size, error: this.forecastWorker.error },
            milliseconds: { p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99), max: sorted.at(-1) || 0 },
            factions: [...this.states.values()].map(s => ({ faction: s.faction, visits: s.visits, decisions: s.decisions,
                activeProfile: s.profile && Object.fromEntries(['aggressionMult','allowedTargets','diplomacy','preferredEvolution','minEvolutionGarrison','minPostCaptureGarrison'].map(k=>[k,s.profile[k]])),
                legacyOnlySettings: ['focus','antiPendulum','hazardPolicy','hazards','maxRouteCasualtyRatio','hazardGarrisonBonus'],
                pendingForecast: s.job ? { target: s.job.operation.target, started: s.job.started, deadline: s.job.operation.analysisDeadline, visits: s.visits } : null,
                reactions: s.reactions, preparationLeadSeconds: 0, operation: s.operation?.state, history: s.history,
                difficulty: s.difficulty, limits: AI_CADENCE[s.difficulty], tacticalVisits: s.tacticalVisits || 0,
                evaluation: s.lastEvaluation, tacticalHistory: s.tacticalHistory, idle: s.idleReason, route: s.route, latencyViolations: s.latencyViolations,
                latencyMs: this._latencySummary(s.latencies) })) };
    }
}
