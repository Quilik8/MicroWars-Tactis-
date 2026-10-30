import { activatePortal } from './rts_transport.js';
import { segmentRectInterval } from '../navigation/nav_hazard_evaluator.js';
import { createForecastWorld, stepForecastWorldWork } from './rts_snapshot.js?v=rts-balance-thorns-20261029-1';
import { settleForecast } from './rts_settled_forecast.js?v=rts-balance-thorns-20261029-1';

export const FORECAST_STATUS = Object.freeze({
    FORBIDDEN: 'forbidden', WAIT: 'available_later', VIABLE: 'viable',
    INSUFFICIENT: 'insufficient', PENDING: 'pending', UNCERTAIN: 'uncertain',
});
export const FORECAST_STEP = 1 / 30;
const scratch = { enter: 0, exit: 0 };

export function crossesBarrier(a, b, barriers, game) {
    if (a.isMobile || b.isMobile) return false;
    for (const r of barriers) {
        if (segmentRectInterval(a.x, a.y, b.x, b.y, r.x * game.width, r.y * game.height,
            (r.x + r.width) * game.width, (r.y + r.height) * game.height, scratch)) return true;
    }
    return false;
}

// Entire cohort must clear the gate, including departure spread and nest approach.
export function departureWindow(snapshot, source, target, speed = 75, horizon = 90) {
    const a = snapshot.nodes[source], b = snapshot.nodes[target];
    if (crossesBarrier(a, b, snapshot.barriers, snapshot.game)) return { status: 'forbidden', delay: Infinity };
    const duration = (Math.hypot(a.x - b.x, a.y - b.y) + a.radius + b.radius * 4) / Math.max(1, speed);
    if (!snapshot.intermittentBarriers.length) return { status: 'viable', delay: 0 };
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    const gates = snapshot.intermittentBarriers.map(gate => {
        const spans = gate.zones.map((_, index) => {
            const g = Object.create(Object.getPrototypeOf(gate));
            Object.assign(g, gate, { activeZoneIndex: index });
            let enter = Infinity, exit = -Infinity;
            for (const r of g.getActiveBounds()) {
                if (!segmentRectInterval(a.x, a.y, b.x, b.y, r.x * snapshot.game.width, r.y * snapshot.game.height,
                    (r.x + r.width) * snapshot.game.width, (r.y + r.height) * snapshot.game.height, scratch)) continue;
                enter = Math.min(enter, Math.max(0, (distance * scratch.enter - a.radius) / speed));
                exit = Math.max(exit, (distance * scratch.exit + a.radius + b.radius) / speed + 0.25);
            }
            return { enter, exit };
        });
        return { gate, spans };
    });
    for (let delay = 0, iteration = 0; delay + duration <= horizon && iteration < 1024; iteration++) {
        let nextDelay = delay;
        for (const { gate, spans } of gates) {
            if (!spans.length) continue;
            const interval = Math.max(0.01, gate.interval);
            const stateAt = t => (gate.activeZoneIndex + Math.max(0, Math.floor((gate.timer + t) / interval))) % spans.length;
            const nextChange = t => {
                const timer = gate.timer + t;
                return timer < 0 ? -gate.timer + interval : t + interval - timer % interval;
            };
            // A legal player order must also have an unobstructed direct segment at departure.
            if (Number.isFinite(spans[stateAt(delay)].enter)) nextDelay = Math.max(nextDelay, nextChange(delay) + 0.001);
            for (let t = delay; t <= delay + duration + 1e-6;) {
                const change = nextChange(t), span = spans[stateAt(t)];
                const enter = delay + span.enter, exit = delay + span.exit;
                if (Math.max(t, enter) <= Math.min(change - 1e-6, exit)) {
                    nextDelay = Math.max(nextDelay, change - span.enter + 0.001);
                }
                t = change + 1e-6;
            }
        }
        if (nextDelay <= delay + 1e-6) return { status: delay > 0 ? 'available_later' : 'viable', delay };
        delay = nextDelay;
    }
    return { status: 'uncertain', delay: Infinity };
}

export class TransferForecast {
    constructor(snapshot, orders) {
        this.revision = snapshot.revision;
        this.time = snapshot.time;
        this.orders = orders;
        this.status = FORECAST_STATUS.PENDING;
        this.firstArrival = Infinity;
        this.lastArrival = 0;
        this.arrived = 0;
        this.transitLosses = 0;
        this.survivors = 0;
        this.capturedAt = null;
        this.owner = null;
        this.held = false;
        this.factors = [];
    }
}

/** A resumable isolated run of the actual physical/combat rules, never live unit mutation. */
export function* forecastOperation(snapshot, faction, targetIndex, orders, options = {}) {
    const step = options.step ?? snapshot.simulationStep ?? FORECAST_STEP;
    if (!Number.isFinite(step) || step <= 0) throw new Error('Invalid simulation step');
    const result = new TransferForecast(snapshot, orders);
    result.effectiveTarget = targetIndex;
    result.confidence = 'conditional_physics';
    result.assumptions = { simulationStep: step, futureOrdersKnown: false, calendarRecorded: true };
    const world = yield* createForecastWorld(snapshot);
    const target = world.nodes[targetIndex];
    const byIndex = new Map(world.allUnits.map(u => [u.observationIndex, u]));
    const selected = new Map();
    const schedules = [...orders, ...(options.responses || [])].map(order => ({ ...order, launched: false }));
    let latestLaunch = 0;
    for (const order of schedules) latestLaunch = Math.max(latestLaunch, order.delay || 0);
    const distance = Math.max(...orders.map(o => Math.hypot(world.nodes[o.source].x - target.x, world.nodes[o.source].y - target.y)));
    const horizon = Math.min(options.horizon ?? 90, latestLaunch + distance / 40 + 50);
    const holdSeconds = options.holdSeconds ?? 10;
    let captureAge = 0;
    for (let elapsed = 0; elapsed < horizon; elapsed += step) {
        for (const order of schedules) {
            if (order.launched || elapsed + 1e-6 < (order.delay || 0)) continue;
            order.launched = true;
            if (order.kind === 'portal') {
                const source = world.nodes[order.source];
                const batch = order.units.map(index => [index,byIndex.get(index)]).filter(([,u]) => u && !u.pendingRemoval
                    && u.state === 'idle' && u.targetNode === source && u.faction === source.owner);
                if (activatePortal(world,source,source.owner,batch.map(([,u]) => u))) {
                    if (!order.response) for (const [index,u] of batch) selected.set(index,{unit:u,arrived:false,lost:false});
                }
                continue;
            }
            for (const index of order.units) {
                const u = byIndex.get(index);
                if (!u || u.pendingRemoval || u.state !== 'idle' || u.targetNode !== world.nodes[order.source]) continue;
                u.targetNode = world.nodes[order.target ?? targetIndex]; u.state = 'traveling'; u.speedMult = 1;
                if (!order.response) selected.set(index, { unit: u, arrived: false, lost: false });
            }
        }
        const settled = schedules.every(o => o.launched) && !world.waterSweeps.length && !world.lightSweeps.length
            && !world.nodes.some(n => n.isMobile || n.tunnelTo || n.activeShots?.length)
            && !world.allUnits.some(u => !u.pendingRemoval && u.state === 'traveling');
        if (settled) {
            yield* settleForecast(world, faction, targetIndex, elapsed, horizon, captureAge, result, step, holdSeconds);
            result.status = result.held ? FORECAST_STATUS.VIABLE
                : result.capturedAt !== null ? FORECAST_STATUS.UNCERTAIN : FORECAST_STATUS.INSUFFICIENT;
            result.factors.push({ type: 'stationary_count_reduction', step });
            return result;
        }
        yield* stepForecastWorldWork(world, step, settled);
        for (const entry of selected.values()) {
            const u = entry.unit;
            if (!entry.arrived && !u.pendingRemoval && u.state === 'idle') {
                entry.arrived = true; result.arrived++;
                result.firstArrival = Math.min(result.firstArrival, elapsed + step);
                result.lastArrival = elapsed + step;
            }
            if (!entry.arrived && !entry.lost && u.pendingRemoval) { entry.lost = true; result.transitLosses++; }
        }
        if (target.owner === faction) {
            if (result.capturedAt === null) result.capturedAt = elapsed + step;
            captureAge += step;
        } else captureAge = 0;
        let allLost = selected.size > 0;
        let allArrived = selected.size > 0;
        for (const e of selected.values()) { if (!e.unit.pendingRemoval) allLost = false; if (!e.arrived && !e.lost) allArrived = false; }
        if (captureAge >= holdSeconds && target.owner === faction && allArrived && schedules.every(o => o.launched)) { result.held = true; break; }
        if (schedules.every(o => o.launched) && allLost) break;
        yield;
    }
    result.owner = target.owner;
    result.survivors = world.allUnits.filter(u => !u.pendingRemoval && u.faction === faction && u.targetNode === target).length;
    result.status = result.held ? FORECAST_STATUS.VIABLE
        : result.capturedAt !== null ? FORECAST_STATUS.UNCERTAIN : FORECAST_STATUS.INSUFFICIENT;
    result.factors.push({ type: 'actual_physics', step },
        { type: 'participants', factions: Object.keys(target.counts).filter(f => target.counts[f] > 0) },
        { type: 'hypothetical_responses', count: options.responses?.length || 0 });
    return result;
}
