import { positionalValue, productionValue } from './rts_regions.js';
import { ferryObjective } from './rts_transport.js';
import { departureWindow, crossesBarrier } from './rts_forecast.js?v=rts-balance-thorns-20261029-1';
import { segmentRectInterval } from '../navigation/nav_hazard_evaluator.js';
import { applyDamageToComposition, getCombatDamage, getCaptureSpeed } from './deterministic_rules.js';
import { canTargetFaction } from './ai_diplomacy.js';
import { resolveAIProfile } from './ai_config.js';

export const DIFFICULTY_PROFILES = Object.freeze({
    easy: Object.freeze({ strategy: 1.5, reaction: .20, sources: 1, responses: 1, fronts: 1, depth: 1, hypotheses: 0, urgentMs: 500, routineMs: 750 }),
    normal: Object.freeze({ strategy: 1, reaction: .12, sources: 2, responses: 2, fronts: 2, depth: 2, hypotheses: 1, urgentMs: 350, routineMs: 600 }),
    hard: Object.freeze({ strategy: .5, reaction: .08, sources: 3, responses: 3, fronts: 3, depth: 3, hypotheses: 2, urgentMs: 250, routineMs: 500 }),
});
const offensive = purpose => ['conquest', 'expansion', 'exploit', 'reinforce_dispute'].includes(purpose);

export class TacticalDecision {
    constructor(faction, target, purpose, observedAt, deadline) {
        Object.assign(this, { faction, target, purpose, observedAt, deadline, orders: [], state: 'prepared',
            plannedAt: observedAt, reason: '', expected: null, sent: [], arrived: new Set(), emittedAt: null });
    }
}
export class ForecastRequest {
    constructor(faction, target, time, purpose, dependencies) {
        Object.assign(this, { faction, target, purpose, dependencies, priority: purpose === 'defense' ? 2 : 1,
            requestedAt: time, expiresAt: time + 1, horizon: 30 });
    }
}

// Read-only, synchronous observation. Unit handles stay stable across swap-and-pop;
// pending orders own explicit references, never an index into a mutable live array.
export class TacticalObservation {
    constructor(world) {
        this.time = world.simTime || 0; this.simulationStep = world.lastSimulationStep || 1/30; this.game = world.game; this.nodes = world.nodes;
        this.units = world.allUnits; this.liveUnits = world.allUnits;
        this.hazards = world.hazards || []; this.zones = world.zones || [];
        this.barriers = world.barriers || []; this.intermittentBarriers = world.intermittentBarriers || [];
        this.waterSweeps = world.waterSweeps || []; this.lightSweeps = world.lightSweeps || [];
        this.modifiers = world.campaignModifiers || {}; this.combatInterval = world.combatInterval || .7;
        this.aiStrategy = world.aiStrategy;
        this.indices = new Map(this.nodes.map((n, i) => [n, i]));
        this.idle = this.nodes.map(() => new Map());
        this.presence = this.nodes.map(() => new Map());
        this.arrivals = this.nodes.map(() => []);
        const waves = this.nodes.map(() => new Map());
        for (const u of this.units) {
            if (u.pendingRemoval || !u.targetNode) continue;
            const i = this.indices.get(u.targetNode); if (i === undefined) continue;
            const n = this.nodes[i], distance = Math.hypot(u.x - n.x, u.y - n.y);
            if (u.state === 'idle') {
                if (!this.idle[i].has(u.faction)) this.idle[i].set(u.faction, []);
                this.idle[i].get(u.faction).push(u);
            }
            if (u.state === 'idle' || distance < n.radius * 1.5) {
                if (!this.presence[i].has(u.faction)) this.presence[i].set(u.faction, { light: 0, heavy: 0 });
                this.presence[i].get(u.faction)[(u.power || 1) > 1 ? 'heavy' : 'light']++;
            } else {
                const eta = Math.max(0, distance - n.radius * 1.5) / Math.max(1, u.speed * u.speedMult * (u.currentZoneMult || 1));
                const key = `${u.faction}:${Math.floor(eta * 4)}`;
                if (!waves[i].has(key)) waves[i].set(key, { faction: u.faction, light: 0, heavy: 0, eta });
                const wave = waves[i].get(key); wave[(u.power || 1) > 1 ? 'heavy' : 'light']++;
                wave.eta = Math.min(wave.eta, eta);
            }
        }
        for (let i = 0; i < waves.length; i++) this.arrivals[i] = [...waves[i].values()].sort((a, b) => a.eta - b.eta);
        this.routes = new Map();
        this.frontierCache = new Map();
        this.originRoutes = new Map();
    }
}

export function unitPower(units) { let p = 0; for (const u of units) p += u.power || 1; return p; }
export function mayCounterattack(view, owner, faction, difficulty, playerFaction = 'player') {
    return owner === playerFaction || canTargetFaction(resolveAIProfile(view.aiStrategy, null, owner, difficulty), owner, faction, playerFaction);
}

// Capture crews are commitments even after arrival: "idle" is a movement state,
// not permission to abandon an unfinished operation. Frontier control is a
// local floor, augmented by observed pressure rather than a universal percentage.
export function sourceRetention(view, state, profile, source, playerFaction = 'player') {
    const faction = state.faction, node = view.nodes[source], locked = new Set();
    if (node.owner !== faction) {
        const idle = (view.idle[source].get(faction) || []).filter(u => !u.pendingRemoval && u.state === 'idle' && u.targetNode === node);
        const idleSet = new Set(idle);
        for (const d of state.tacticalOrders || []) if (d.target === source && !['completed', 'cancelled'].includes(d.state)) {
            for (const u of d.sent) if (idleSet.has(u)) locked.add(u);
        }
        // Also protect a capture that predates a planner reset or difficulty change.
        if (!locked.size && idle.length) for (const u of idle) locked.add(u);
    }
    const cache = view.frontierCache ??= new Map();
    const cacheKey = `${faction}:${state.difficulty}:${playerFaction}:${source}`;
    let frontier = cache.get(cacheKey) ?? false;
    if (!cache.has(cacheKey)) for (let i = 0; i < view.nodes.length; i++) {
        const rival = view.nodes[i];
        if (rival.owner === 'neutral' || rival.owner === faction || !mayCounterattack(view, rival.owner, faction, state.difficulty, playerFaction)
            || crossesBarrier(rival, node, view.barriers, view.game)) continue;
        const distance = Math.hypot(rival.x - node.x, rival.y - node.y);
        const nearerScreen = view.nodes.some((other, j) => j !== source && other.owner === faction
            && Math.hypot(rival.x - other.x, rival.y - other.y) + 150 < distance
            && !crossesBarrier(rival, other, view.barriers, view.game));
        if (!nearerScreen) { frontier = true; break; }
    }
    cache.set(cacheKey, frontier);
    const hostile = hostilePower(view, source, faction, 8);
    let reinforcements = 0;
    for (const w of view.arrivals[source]) if (w.faction === faction && w.eta <= 8) reinforcements += force(w);
    const controlFloor = node.owner === faction ? frontier ? Math.max(1, profile.minPostCaptureGarrison || 10) : 1 : 0;
    return { locked, minimumPower: Math.max(controlFloor, Math.ceil(hostile - reinforcements)), frontier,
        reason: locked.size ? 'finish_capture' : hostile > 0 ? 'defend_commitment' : frontier ? 'frontier_control' : 'interior_surplus' };
}
function bodies(g) { return (g?.light || 0) + (g?.heavy || 0); }
function force(g) { return (g?.light || 0) + (g?.heavy || 0) * 3; }
function hostilePower(view, i, faction, horizon = 6) {
    let value = 0;
    for (const [f, g] of view.presence[i]) if (f !== faction) value += force(g);
    for (const w of view.arrivals[i]) if (w.faction !== faction && w.eta <= horizon) value += force(w);
    return value;
}

// Shape semantics mirror PhysicsManager, including the outer contour of a flood
// and its islands. This estimates a bound; it is not an exact arrival claim.
export function containsHazard(h, x, y, game) {
    const dx = x - h.x * game.width, dy = (y - h.y * game.height) / (h.scaleY || 1);
    if (h.shape === 'rect_puddle') return x >= h.x * game.width && x <= (h.x + h.width) * game.width
        && y >= h.y * game.height && y <= (h.y + h.height) * game.height;
    if (dx * dx + dy * dy >= (h.radius * game.width) ** 2) return false;
    if (h.shape === 'semicircle' && dx < 0) return false;
    if (h.shape === 'ring' && dx * dx + dy * dy < (h.innerRadius * game.width) ** 2) return false;
    if (h.shape === 'flood' && h.safeZones?.some(s => (x - s.x * game.width) ** 2
        + (y - s.y * game.height) ** 2 < (s.radius * game.width) ** 2)) return false;
    return true;
}

// Split the segment at actual contours, including tiny puddles, islands and
// refuges. Uniform sampling can miss a narrow but lethal strip entirely.
function contourCuts(view, a, b) {
    const cuts = [0, 1], dx = b.x - a.x, dy = b.y - a.y, scratch = {};
    const add = t => { if (t > 0 && t < 1) cuts.push(t); };
    const rect = r => {
        if (segmentRectInterval(a.x, a.y, b.x, b.y, r.x * view.game.width, r.y * view.game.height,
            (r.x + r.width) * view.game.width, (r.y + r.height) * view.game.height, scratch)) {
            add(scratch.enter); add(scratch.exit);
        }
    };
    const ellipse = (x, y, radius, scaleY = 1) => {
        const px = a.x - x, py = (a.y - y) / scaleY, vy = dy / scaleY;
        const aa = dx * dx + vy * vy, bb = 2 * (px * dx + py * vy), cc = px * px + py * py - radius * radius;
        const disc = bb * bb - 4 * aa * cc;
        if (aa && disc >= 0) { add((-bb - Math.sqrt(disc)) / (2 * aa)); add((-bb + Math.sqrt(disc)) / (2 * aa)); }
    };
    for (const z of view.zones) rect(z);
    for (const h of view.hazards) {
        if (h.shape === 'rect_puddle') { rect(h); continue; }
        ellipse(h.x * view.game.width, h.y * view.game.height, h.radius * view.game.width, h.scaleY || 1);
        if (h.shape === 'ring') ellipse(h.x * view.game.width, h.y * view.game.height, h.innerRadius * view.game.width, h.scaleY || 1);
        if (h.shape === 'semicircle' && dx) add((h.x * view.game.width - a.x) / dx);
        for (const s of h.safeZones || []) ellipse(s.x * view.game.width, s.y * view.game.height, s.radius * view.game.width);
    }
    for (const n of view.nodes) if (n.type !== 'tunel') ellipse(n.x, n.y, n.radius);
    return cuts.sort((x, y) => x - y);
}

export function assessTransfer(view, source, target, faction, units, departure = 0) {
    const a = view.nodes[source], b = view.nodes[target];
    const key = `${source}:${target}:${faction}:${units.length}:${unitPower(units)}:${Math.min(...units.map(u => u.speed || 75))}:${departure}`;
    if (view.routes.has(key)) return view.routes.get(key);
    const out = { status: 'known', delay: departure, first: 0, last: 0, lossUpper: 0, lossLower: 0, lossExpected: 0, confidence: 'bounded', reason: '', units };
    const save = () => { view.routes.set(key, out); return out; };
    if (!units.length) { out.status = 'forbidden'; out.reason = 'empty_cohort'; return save(); }
    if (a.type === 'tunel' && a.owner === faction && a.tunnelTo === b) {
        out.orderKind = 'portal'; out.effectiveTarget = target;
        const armed = view.nodes.some(n => n.owner !== faction && n.evolution && Math.hypot(n.x-b.x,n.y-b.y) <= (n.artilleryRange || 320));
        if (b.owner !== faction || hostilePower(view,target,faction,8) || armed || view.waterSweeps.length || view.lightSweeps.length) {
            out.status = 'uncertain'; out.reason = 'portal_activation';
        }
        return save();
    }
    if (crossesBarrier(a, b, view.barriers, view.game)) { out.status = 'forbidden'; out.reason = 'permanent_wall'; return save(); }
    const speed = Math.min(...units.map(u => u.speed || 75));
    if (!units.length) { out.status = 'forbidden'; out.reason = 'empty_cohort'; return save(); }
    if (b.type === 'tunel' && b.owner === faction && b.tunnelTo) {
        out.status = 'uncertain'; out.reason = 'tunnel_exit'; return save();
    }
    if (a.isMobile || b.isMobile) { out.status = 'uncertain'; out.reason = 'mobile_operation'; return save(); }
    const window = departureWindow(view, source, target, speed);
    if (!Number.isFinite(window.delay)) { out.status = 'uncertain'; out.reason = 'no_gate_window'; return save(); }
    out.delay = Math.max(departure, window.delay);
    let x2 = b.x, y2 = b.y;
    if (b.isMobile) {
        const targetSpeed = Math.abs(b.orbitSpeed) * Math.max(b.orbitRadiusX, b.orbitRadiusY) * Math.max(view.game.width, view.game.height);
        if (targetSpeed >= speed * .75) { out.status = 'uncertain'; out.reason = 'mobile_interception'; return save(); }
        for (let i = 0; i < 2; i++) {
            const t = Math.hypot(x2 - a.x, y2 - a.y) / speed + out.delay;
            const angle = b.orbitAngle + b.orbitSpeed * t;
            x2 = (b.orbitAnchorX + Math.cos(angle) * b.orbitRadiusX) * view.game.width;
            y2 = (b.orbitAnchorY + Math.sin(angle) * b.orbitRadiusY) * view.game.height;
        }
    }
    if (a.isMobile || b.isMobile) {
        const segment = { enter: 0, exit: 0 };
        if (view.barriers.some(r => segmentRectInterval(a.x, a.y, x2, y2, r.x * view.game.width, r.y * view.game.height,
            (r.x + r.width) * view.game.width, (r.y + r.height) * view.game.height, segment))) {
            out.status = 'uncertain'; out.reason = 'ferry_crossing'; return save();
        }
    }
    const distance = Math.hypot(x2 - a.x, y2 - a.y);
    const spread = (a.radius * 2 + b.radius * 3) / speed + .25;
    const exposure = view.hazards.map(() => 0);
    let time = .15;
    const cuts = contourCuts(view, a, { x: x2, y: y2 });
    for (let i = 1; i < cuts.length; i++) {
        const stepLength = distance * (cuts[i] - cuts[i - 1]);
        const fraction = (cuts[i] + cuts[i - 1]) / 2, x = a.x + (x2 - a.x) * fraction, y = a.y + (y2 - a.y) * fraction;
        const zone = view.zones.find(z => x >= z.x * view.game.width && x <= (z.x + z.width) * view.game.width
            && y >= z.y * view.game.height && y <= (z.y + z.height) * view.game.height);
        let mult = zone?.speedMult ?? 1;
        if (mult < 1 && view.modifiers[faction]?.marsh) mult = 1 - (1 - mult) / 2;
        if (mult <= 0) { out.status = 'forbidden'; out.reason = 'zero_speed_surface'; return save(); }
        const dt = stepLength / (speed * mult); time += dt;
        if (view.nodes.some(n => n.type !== 'tunel' && (x - n.x) ** 2 + (y - n.y) ** 2 <= n.radius ** 2)) continue;
        for (let h = 0; h < view.hazards.length; h++) if (containsHazard(view.hazards[h], x, y, view.game)) exposure[h] += dt;
    }
    out.first = out.delay + Math.max(0, time - (a.radius + b.radius * 2.5) / speed);
    out.last = out.delay + time + spread;
    if (out.delay > 0) {
        if (hostilePower(view, source, faction, out.delay) > unitPower(units)
            || view.waterSweeps.some(s => s.predictUnsafeUntil(a.x, a.y, a.x, a.y, view.time, out.delay, view.time,
                view.game.width, view.game.height) >= view.time)) {
            out.status = 'uncertain'; out.reason = 'unsafe_wait'; return save();
        }
    }
    for (let h = 0; h < exposure.length; h++) {
        const hazard = view.hazards[h];
        if (exposure[h] > 0) {
            // Fixed shared kill budget: never multiply DPS by the number of ants.
            out.lossUpper += Math.ceil((exposure[h] + spread + (view.simulationStep || 1/30)) * Math.max(0, hazard.dps || 0));
        } else if (hazard.dps > 0) {
            const r = hazard.radius * view.game.width, margin = Math.max(a.radius, b.radius * 2.5), scratch = {};
            const left = hazard.shape === 'rect_puddle' ? hazard.x * view.game.width : hazard.x * view.game.width - r;
            const top = hazard.shape === 'rect_puddle' ? hazard.y * view.game.height : hazard.y * view.game.height - r * (hazard.scaleY || 1);
            const right = hazard.shape === 'rect_puddle' ? (hazard.x + hazard.width) * view.game.width : hazard.x * view.game.width + r;
            const bottom = hazard.shape === 'rect_puddle' ? (hazard.y + hazard.height) * view.game.height : hazard.y * view.game.height + r * (hazard.scaleY || 1);
            if (segmentRectInterval(a.x, a.y, x2, y2, left - margin, top - margin, right + margin, bottom + margin, scratch)) {
                out.status = 'uncertain'; out.reason = 'hazard_spread';
            }
        }
    }
    for (const n of view.nodes) {
        if (n.owner === faction || !n.evolution) continue;
        const dx = x2 - a.x, dy = y2 - a.y, length2 = dx * dx + dy * dy;
        const t = length2 ? Math.max(0, Math.min(1, ((n.x - a.x) * dx + (n.y - a.y) * dy) / length2)) : 0;
        const d = Math.hypot(n.x - a.x - dx * t, n.y - a.y - dy * t);
        if (n.evolution === 'espinoso' && d <= n.radius + 45) {
            out.status = 'uncertain'; out.reason = 'thorn_density';
        }
        if (n.evolution === 'artilleria' && d <= (n.artilleryRange || 320)) {
            const seconds = Math.min(time + spread, 2 * (n.artilleryRange || 320) / speed);
            out.lossUpper += 5 * (1 + Math.ceil(seconds / Math.max(.1, n.artilleryInterval || 1)));
        }
    }
    for (const sweep of view.waterSweeps) {
        const unsafe = sweep.predictUnsafeUntil(a.x, a.y, x2, y2, view.time + out.delay,
            out.last - out.delay, view.time, view.game.width, view.game.height);
        if (unsafe >= view.time + out.delay) {
            out.status = 'uncertain'; out.reason = 'water_window';
            out.nextReview = Math.max(.05, unsafe - view.time);
        }
    }
    if (view.lightSweeps.some(s => s.predictNodeNeutralization?.(b, view.game, view.time, Math.min(60, out.last + 24)) < view.time + Math.min(60, out.last + 24))) {
        out.status = 'uncertain'; out.reason = 'light_reset';
    }
    out.lossUpper = Math.min(units.length, out.lossUpper);
    // The physical oracle owns the shared hazard budget. These are bounds, not
    // several independent promises that every cohort absorbs the entire DPS.
    out.lossExpected = (out.lossLower + out.lossUpper) / 2;
    return save();
}

// Small multifaction forward model: committed waves stay separate; friendly
// deployment is placed at its late bound, hostile waves at their early bound.
export function projectNode(view, target, faction, deployments = [], options = {}) {
    const node = view.nodes[target], groups = new Map();
    for (const [f, g] of view.presence[target]) groups.set(f, { ...g, carry: node.combatDamageCarry?.[f] || 0 });
    if (options.withdrawals && groups.has(faction)) {
        const g = groups.get(faction);
        for (const u of options.withdrawals) g[(u.power || 1) > 1 ? 'heavy' : 'light'] = Math.max(0, g[(u.power || 1) > 1 ? 'heavy' : 'light'] - 1);
    }
    const waves = view.arrivals[target].map(w => ({ ...w }));
    for (const d of deployments) waves.push({ faction, light: d.light, heavy: d.heavy, eta: d.eta });
    for (const w of options.hypotheses || []) waves.push({ ...w });
    waves.sort((a, b) => a.eta - b.eta);
    let owner = node.owner, progress = node.conquestProgress || 0, conquering = node.conqueringFaction;
    let combatTimer = node.combatTimer || 0, regenTimer = node.regenTimer || 0, capturedAt = null;
    let wave = 0, minimumOwnPower = Infinity, initialOwner = owner;
    const horizon = Math.min(60, options.horizon ?? Math.max(6, ...waves.map(w => w.eta + 40)));
    const scratch = {}, dt = .25, powers = Object.create(null), counts = Object.create(null), active = [];
    for (let elapsed = 0; elapsed <= horizon; elapsed += dt) {
        while (wave < waves.length && waves[wave].eta <= elapsed + 1e-6) {
            const w = waves[wave++];
            if (!groups.has(w.faction)) groups.set(w.faction, { light: 0, heavy: 0, carry: 0 });
            const g = groups.get(w.faction); g.light += w.light; g.heavy += w.heavy;
        }
        active.length = 0;
        for (const [f, g] of groups) { powers[f] = force(g); counts[f] = bodies(g); if (counts[f] > 0) active.push(f); }
        if (active.length > 1) {
            combatTimer += dt;
            while (combatTimer >= view.combatInterval) {
                combatTimer -= view.combatInterval;
                for (const f of active) {
                    let damage = 0; for (const other of active) if (other !== f) damage += getCombatDamage(powers[other], powers[f]);
                    const g = groups.get(f);
                    applyDamageToComposition(g.light, g.heavy, g.carry, damage * (view.modifiers[f]?.fragility || 1), scratch);
                    g.light = scratch.lightBodies; g.heavy = scratch.heavyBodies; g.carry = scratch.damageCarry;
                }
            }
        } else combatTimer = 0;
        let main = null, count = 0;
        for (const f of active) if (f !== owner && counts[f] > count) { main = f; count = counts[f]; }
        if (main && conquering && conquering !== main) {
            progress = Math.max(0, progress - .5 * dt); if (!progress) conquering = null;
        } else if (main) {
            let enemies = 0; for (const f of active) if (f !== main) enemies += counts[f];
            if (enemies <= 3) {
                conquering = main; progress += getCaptureSpeed(count) * dt;
                if (progress >= 1) { owner = main; progress = 0; conquering = null; if (owner === faction) capturedAt ??= elapsed; }
            }
        } else { progress = Math.max(0, progress - .5 * dt); if (!progress) conquering = null; }
        const own = groups.get(faction); minimumOwnPower = Math.min(minimumOwnPower, force(own));
        if (owner !== 'neutral' && node.type !== 'tunel') {
            if (!groups.has(owner)) groups.set(owner, { light: 0, heavy: 0, carry: 0 });
            const g = groups.get(owner);
            const evolution = node.pendingEvolution && elapsed >= node.pendingEvolutionEtaSec ? node.pendingEvolution : node.evolution;
            let interval = node.regenInterval || 1;
            if (node.type === 'enjambre') interval /= view.modifiers[owner]?.generation || 1;
            if (evolution === 'tanque') interval *= 1.5;
            if (force(g) < node.maxUnits) {
                regenTimer += dt;
                while (regenTimer >= interval && force(g) < node.maxUnits) { regenTimer -= interval; g[evolution === 'tanque' ? 'heavy' : 'light']++; }
            }
        }
        if (capturedAt !== null && elapsed >= capturedAt + (options.holdSeconds || 0) && wave >= waves.length) break;
        if (wave >= waves.length && active.length <= 1 && ((owner === faction && (!active.length || active[0] === faction))
            || (owner !== faction && !force(groups.get(faction))))) break;
    }
    const own = groups.get(faction);
    return { owner, captured: capturedAt !== null, capturedAt, ownPower: force(own), ownBodies: bodies(own),
        initialOwner, minimumOwnPower, groups: Object.fromEntries([...groups].map(([f, g]) => [f, force(g)])), horizon };
}

// Routes use actual legal legs, not distance to an enemy through a wall.
export class StrategicRoute {
    constructor(view,goal,path,cost,faction) {
        this.goal = goal; this.stages = path.slice(1); this.cost = cost;
        this.legs = path.slice(1).map((to,i) => {
            const from = path[i], a = view.nodes[from], b = view.nodes[to];
            const portal = a.type === 'tunel' && a.owner === faction && a.tunnelTo === b;
            return { from, to, kind: portal ? 'portal' : a.isMobile ? 'ferry_landing' : b.isMobile ? 'ferry_boarding' : 'land',
                estimatedSeconds: portal ? 0 : Math.hypot(a.x-b.x,a.y-b.y)/75,
                effectiveTarget: b.type === 'tunel' && b.owner === faction && b.tunnelTo ? view.nodes.indexOf(b.tunnelTo) : to,
                needsCalendar: !portal && view.intermittentBarriers.length > 0,
                requiresOwner: portal ? faction : null };
        });
    }
}
export function routeFromOrigin(view, faction, profile, source, playerFaction = 'player') {
    const cache = view.originRoutes ??= new Map(), key = `${faction}:${source}:${playerFaction}`;
    if (cache.has(key)) return cache.get(key);
    const distances = view.nodes.map(() => Infinity), paths = view.nodes.map(() => null), visited = new Set();
    distances[source] = 0; paths[source] = [source];
    for (let step = 0; step < view.nodes.length; step++) {
        let from = -1;
        for (let i = 0; i < distances.length; i++) if (!visited.has(i) && (from < 0 || distances[i] < distances[from])) from = i;
        if (from < 0 || !Number.isFinite(distances[from])) break;
        visited.add(from);
        const a = view.nodes[from];
        if (from !== source && a.owner !== faction && canTargetFaction(profile, faction, a.owner, playerFaction)) {
            const route = new StrategicRoute(view,from,paths[from],distances[from],faction);
            cache.set(key,route); return route;
        }
        for (let to = 0; to < view.nodes.length; to++) {
            if (to === from || visited.has(to)) continue;
            const b = view.nodes[to];
            if (b.owner !== faction && !canTargetFaction(profile, faction, b.owner, playerFaction)) continue;
            const portal = a.type === 'tunel' && a.owner === faction && a.tunnelTo === b;
            if (!portal && crossesBarrier(a, b, view.barriers, view.game)) continue;
            const cost = distances[from] + (portal ? .01 : Math.hypot(b.x-a.x,b.y-a.y)/75);
            if (cost < distances[to]) { distances[to] = cost; paths[to] = [...paths[from], to]; }
        }
    }
    cache.set(key,null); return null;
}

export function strategicRoute(view, faction, profile, depth, objective, playerFaction = 'player') {
    const owned = view.nodes.map((n, i) => n.owner === faction ? i : -1).filter(i => i >= 0);
    if (!owned.length) return [];
    const goal = objective?.targetNode ?? view.nodes.map((n, i) => ({ i, score: canTargetFaction(profile, faction, n.owner, playerFaction)
        ? (n.owner === 'neutral' ? 50 : 100) + productionValue(view,n,faction) * 20 : -Infinity }))
        .sort((a, b) => b.score - a.score || a.i - b.i)[0]?.i;
    if (goal == null || owned.includes(goal)) return [];
    const queue = owned.map(i => [i]), visited = new Set(owned);
    while (queue.length) {
        const path = queue.shift(), from = path.at(-1);
        for (let i = 0; i < view.nodes.length; i++) {
            const portal = view.nodes[from].type === 'tunel' && view.nodes[from].owner === faction && view.nodes[from].tunnelTo === view.nodes[i];
            if (visited.has(i) || !portal && crossesBarrier(view.nodes[from], view.nodes[i], view.barriers, view.game)) continue;
            if (view.nodes[i].owner !== faction && !canTargetFaction(profile, faction, view.nodes[i].owner, playerFaction)) continue;
            const next = [...path, i]; if (i === goal) return next.slice(1, depth + 1);
            visited.add(i); queue.push(next);
        }
    }
    return [];
}

export function planTactical(view, state, profile, reserved, playerFaction, objective, options = {}) {
    const limits = DIFFICULTY_PROFILES[state.difficulty];
    const faction = state.faction;
    // Same-cycle own orders are commitments, while another AI still sees the
    // shared observation from before commands. No iteration-order information.
    const original = view;
    view = Object.assign(Object.create(Object.getPrototypeOf(original)), original, {
        presence: original.presence.map(table => new Map([...table].map(([f, g]) => [f, { ...g }]))),
        arrivals: original.arrivals.map(waves => [...waves]),
    });
    const ownWaves = new Map();
    for (let source = 0; source < original.idle.length; source++) for (const u of original.idle[source].get(faction) || []) {
        if (u.state === 'idle' || u.pendingRemoval) continue;
        const g = view.presence[source].get(faction), kind = (u.power || 1) > 1 ? 'heavy' : 'light';
        if (g) g[kind] = Math.max(0, g[kind] - 1);
        const target = view.indices.get(u.targetNode);
        if (target !== undefined) {
            const eta = Math.hypot(u.x - u.targetNode.x, u.y - u.targetNode.y) / Math.max(1, u.speed * (u.speedMult || 1));
            const key = `${target}:${Math.ceil(eta * 4)}`;
            if (!ownWaves.has(key)) ownWaves.set(key, { target, faction, light: 0, heavy: 0, eta });
            const wave = ownWaves.get(key); wave[kind]++; wave.eta = Math.max(wave.eta, eta);
        }
    }
    for (const wave of ownWaves.values()) view.arrivals[wave.target].push(wave);
    const pools = view.idle.map((table, i) => (table.get(faction) || []).filter(u => !reserved.has(u) && u.state === 'idle' && !u.pendingRemoval && u.targetNode === view.nodes[i]));
    const pairs = [], uncertain = [];
    const transportGoals = new Map();
    const retention = new Map();
    const retain = source => {
        if (!retention.has(source)) retention.set(source, sourceRetention(view, state, profile, source, playerFaction));
        return retention.get(source);
    };
    const activeFronts = new Set((state.tacticalOrders || []).filter(d => ['waiting', 'dispatch', 'dispute'].includes(d.state)
        && offensive(d.purpose)).map(d => d.target));
    for (let source = 0; source < view.nodes.length; source++) {
        if (!pools[source].length) continue;
        const origin = view.nodes[source], ownPower = unitPower(pools[source]);
        const pressure = hostilePower(view, source, faction, 5);
        let reinforcements = 0; for (const a of view.arrivals[source]) if (a.faction === faction && a.eta <= 5) reinforcements += force(a);
        let losing = pressure > ownPower + reinforcements + 5;
        if (losing) {
            const firstThreat = [...view.presence[source]].some(([f, g]) => f !== faction && bodies(g) > 0) ? 0
                : Math.min(Infinity, ...view.arrivals[source].filter(w => w.faction !== faction).map(w => w.eta));
            let relief = reinforcements;
            for (let i = 0; i < pools.length; i++) if (i !== source && pools[i].length
                && Math.hypot(view.nodes[i].x - origin.x, view.nodes[i].y - origin.y) / 75 <= firstThreat + 3
                && !crossesBarrier(view.nodes[i], origin, view.barriers, view.game)) relief += Math.max(0, unitPower(pools[i]) - 1);
            if (ownPower + relief > pressure * 1.1) losing = false;
            else {
                const outcome = projectNode(view, source, faction, [], { horizon: 20 });
                losing = outcome.ownPower === 0;
            }
        }
        const waterDanger = view.waterSweeps.some(s => s.predictUnsafeUntil(origin.x, origin.y, origin.x, origin.y,
            view.time, 5, view.time, view.game.width, view.game.height) >= view.time);
        let onboard = null;
        const abandonedTransportGoals = new Set();
        if (origin.isMobile) for (const u of pools[source]) {
            const goal = u._aiTransportGoal;
            if (!Number.isInteger(goal)) continue;
            const insufficient = view.nodes[goal] && hostilePower(view,goal,faction,8) > ownPower*2
                && view.nodes.some((n,i) => i !== goal && !n.isMobile && n.owner !== faction && canTargetFaction(profile,faction,n.owner,playerFaction)
                    && hostilePower(view,i,faction,8) < ownPower/2);
            if (!view.nodes[goal] || view.nodes[goal].owner === faction || !canTargetFaction(profile,faction,view.nodes[goal].owner,playerFaction) || insufficient) {
                if (insufficient) abandonedTransportGoals.add(goal);
                delete u._aiTransportGoal; continue;
            }
            onboard ??= goal;
        }
        for (const goal of abandonedTransportGoals) {
            state.tacticalHistory ??= [];
            state.tacticalHistory.push({time:view.time,purpose:'transport_replan',source,goal,reason:'insufficient_force_with_available_alternative'});
            if (state.tacticalHistory.length > 64) state.tacticalHistory.shift();
        }
        for (let target = 0; target < view.nodes.length; target++) {
            if (source === target) continue;
            const node = view.nodes[target], friendly = node.owner === faction;
            let mission = null;
            if (Number.isInteger(onboard) && target !== onboard) continue;
            if (Number.isInteger(onboard)) mission = { goal: onboard, phase: 'disembarking' };
            if (!friendly && !canTargetFaction(profile, faction, node.owner, playerFaction)) continue;
            if (origin.isMobile && !friendly && !mission) mission = {goal:target,phase:'disembarking'};
            const portalActivation = origin.type === 'tunel' && origin.owner === faction && origin.tunnelTo === node;
            if (portalActivation && !(losing && friendly)) {
                const continuation = routeFromOrigin(view,faction,profile,source,playerFaction);
                if (!continuation || continuation.stages[0] !== target) continue;
            }
            if (!portalActivation && crossesBarrier(origin, node, view.barriers, view.game)) continue;
            const distance = Math.hypot(node.x - origin.x, node.y - origin.y), eta = distance / 75;
            const targetPressure = hostilePower(view, target, faction, eta + 5);
            const friendlyForce = force(view.presence[target].get(faction));
            let purpose, urgent = false, score;
            if (portalActivation) { purpose = losing && friendly ? 'evacuation' : 'portal'; urgent = losing; score = losing ? 1000 + pressure : 300; }
            else if ((losing || waterDanger) && friendly && targetPressure < ownPower + friendlyForce) {
                purpose = 'evacuation'; urgent = true; score = 1000 + pressure;
            } else if (friendly && targetPressure > 0) {
                purpose = 'defense'; urgent = true; score = 800 + targetPressure;
            } else if (friendly) {
                const route = routeFromOrigin(view, faction, profile, source, playerFaction);
                if (!route || route.stages[0] !== target || ownPower < 5) continue;
                if ((node.population?.[faction] || 0) > node.maxUnits * 1.2) continue;
                purpose = 'regroup'; score = 90;
            } else {
                if ((state.tacticalOrders || []).some(d => d.target === target && d.state === 'waiting')) continue;
                if (activeFronts.size >= limits.fronts && !activeFronts.has(target)) continue;
                const contested = [...view.presence[target]].filter(([f, g]) => f !== faction && bodies(g) > 0).length > 1
                    || view.arrivals[target].some(w => w.faction !== faction);
                purpose = node.owner === 'neutral' ? 'expansion' : targetPressure < ownPower * .3 ? 'exploit' : 'conquest';
                if (contested && (friendlyForce > 0 || view.arrivals[target].some(w => w.faction === faction))) purpose = 'reinforce_dispute';
                urgent = purpose === 'exploit' || contested;
                score = (purpose === 'exploit' ? 330 : 180) + productionValue(view,node,faction) * 35 + (contested ? 80 : 0);
                if (objective?.targetNode === target) score += objective.priority ?? 300;
                if (state.route?.[0] === target) score += 60;
                if (node.owner !== 'neutral') score *= Math.max(.25, profile.aggressionMult || 1);
                if (state.lastTarget === target && view.time - state.lastProgress < 2) score -= 20;
            }
            if (!friendly) score += positionalValue(view,source,target,faction);
            score /= 1 + eta / 12;
            pairs.push({ source, target, purpose, urgent, score, eta, losing, mission, transportKind: portalActivation ? 'portal' : null });
        }
    }
    pairs.sort((a, b) => b.score - a.score || a.target - b.target || a.source - b.source);
    const shortlist = pairs.slice(0, 3);
    // Rotate exploration through lower-ranked alternatives instead of repeatedly
    // spending the entire budget on the same three impossible captures.
    if (pairs.length > 3) shortlist[2] = pairs[2 + (state.cursor++ % (pairs.length - 2))];
    const tested = new Set();
    let best = null, bestScore = -Infinity;
    const evaluation = state.lastEvaluation = { time: view.time, alternatives: [], selected: null };
    let exhausted = false;
    const start = (state.candidateCursor || 0) % Math.max(1, shortlist.length);
    for (let c = 0; c < shortlist.length; c++) {
        if (performance.now() >= (options.deadline ?? Infinity)) { exhausted = true; break; }
        const candidate = shortlist[(start + c) % shortlist.length];
        if (view.nodes[candidate.target].isMobile && !view.nodes[candidate.source].isMobile) {
            const key = `${candidate.source}:${candidate.target}`;
            if (!transportGoals.has(key)) transportGoals.set(key,ferryObjective(view,candidate.source,candidate.target,faction,profile,playerFaction));
            candidate.mission = transportGoals.get(key);
            if (!candidate.mission) continue;
        }
        state.candidateCursor = (start + c + 1) % shortlist.length;
        const key = `${candidate.target}:${candidate.purpose}`; if (tested.has(key)) continue; tested.add(key);
        const trace = { source: candidate.source, target: candidate.target, purpose: candidate.purpose, reason: 'insufficient_force' };
        evaluation.alternatives.push(trace);
        const sources = [candidate.source, ...pools.map((p, i) => p.length && i !== candidate.source && i !== candidate.target ? i : -1)
            .filter(i => i >= 0).sort((a, b) => Math.hypot(view.nodes[a].x - view.nodes[candidate.target].x, view.nodes[a].y - view.nodes[candidate.target].y)
                - Math.hypot(view.nodes[b].x - view.nodes[candidate.target].x, view.nodes[b].y - view.nodes[candidate.target].y))];
        const baseline = projectNode(view, candidate.target, faction, []);
        if (offensive(candidate.purpose) && baseline.captured && baseline.owner === faction) { trace.reason = 'already_committed'; continue; }
        if (candidate.purpose === 'defense' && baseline.owner === faction && baseline.ownPower > 0) { trace.reason = 'defense_already_sufficient'; continue; }
        const orders = [], deployments = [];
        let result;
        for (const source of sources) {
            let available = [...pools[source]];
            if (source !== candidate.source && candidate.purpose === 'evacuation') continue;
            if (candidate.purpose === 'regroup') {
                const signature = view.nodes.map(n => n.owner).join('|');
                available = available.filter(u => {
                    const previous = state.relocations?.get(u);
                    return !previous || previous.source !== candidate.target || previous.target !== source || previous.signature !== signature;
                });
            }
            const policy = retain(source);
            if (candidate.purpose !== 'evacuation') available = available.filter(u => !policy.locked.has(u));
            const reserve = candidate.purpose === 'evacuation' ? 0 : policy.minimumPower;
            let left = candidate.purpose === 'evacuation' ? 0 : unitPower([...policy.locked]);
            while (available.length && left < reserve) left += available.pop().power || 1;
            if (!available.length) { trace.reason = policy.reason; continue; }
            const transfer = assessTransfer(view, source, candidate.target, faction, available);
            if (transfer.status !== 'known') { trace.reason = transfer.reason; uncertain.push({ ...candidate, reason: transfer.reason }); continue; }
            if (transfer.lossUpper >= available.length) { uncertain.push({ ...candidate, reason: 'risk_decision_boundary' }); continue; }
            // Remove strongest possible casualties for the conservative force bound.
            const bound = transfer.lossUpper ? [...available].sort((a, b) => (b.power || 1) - (a.power || 1)).slice(transfer.lossUpper) : available;
            const heavy = bound.filter(u => (u.power || 1) > 1).length;
            deployments.push({ light: bound.length - heavy, heavy, eta: transfer.last });
            orders.push({ source, target: candidate.target, kind: transfer.orderKind, selected: available, delay: transfer.delay, transfer,
                retainedPower: unitPower(pools[source]) - unitPower(available), retentionReason: policy.reason });
            result = projectNode(view, candidate.target, faction, deployments);
            if (result.owner === faction && result.ownPower > 0) break;
            if (orders.length >= limits.sources) break;
        }
        if (!orders.length) continue;
        const latest = Math.max(...orders.map(o => o.transfer.last));
        let useful = result.owner === faction || (result.captured && result.ownPower > 0);
        if (candidate.purpose === 'defense') {
            useful = useful || (result.ownPower > baseline.ownPower + 1 && baseline.owner !== faction);
            const firstEnemy = view.arrivals[candidate.target].filter(w => w.faction !== faction).at(0)?.eta;
            // No "reinforcement" after a known loss unless it is a justified recapture.
            if (firstEnemy !== undefined && latest > firstEnemy + 8 && !result.captured) useful = false;
        }
        if (candidate.purpose === 'regroup') useful = result.owner === faction && result.ownPower > baseline.ownPower + 1
            && orders.every(o => o.transfer.lossUpper < o.selected.length / 2);
        if (useful && candidate.purpose === 'regroup') {
            const continuation = routeFromOrigin(view,faction,profile,orders[0].source,playerFaction);
            const destinationPool = pools[candidate.target] || [];
            const floor = retain(candidate.target).minimumPower;
            let kept = 0;
            const ready = [...destinationPool];
            while (ready.length && kept < floor) kept += ready.pop().power || 1;
            if (continuation && ready.length && !crossesBarrier(view.nodes[candidate.target],view.nodes[continuation.goal],view.barriers,view.game)) {
                const route = assessTransfer(view,candidate.target,continuation.goal,faction,ready);
                if (route.status === 'known' && route.lossUpper < ready.length) {
                    const survivors = [...ready].sort((a,b)=>(b.power||1)-(a.power||1)).slice(route.lossUpper);
                    const heavy = survivors.filter(u=>(u.power||1)>1).length;
                    const withoutTransfer = projectNode(view,continuation.goal,faction,[{light:survivors.length-heavy,heavy,eta:route.last}]);
                    if (withoutTransfer.owner === faction && withoutTransfer.ownPower > 0) {
                        useful = false; trace.reason = 'follow_up_already_funded';
                    }
                }
            }
        }
        if (candidate.purpose === 'evacuation') useful = result.ownPower > 0 && result.owner === faction;
        if (!useful) {
            if (trace.reason !== 'follow_up_already_funded' && orders.some(o => o.transfer.lossUpper > o.transfer.lossLower)) {
                const optimistic = orders.map(o => {
                    const heavy = o.selected.filter(u => (u.power || 1) > 1).length;
                    return { light: o.selected.length-heavy, heavy, eta: o.transfer.last };
                });
                const upperOutcome = projectNode(view,candidate.target,faction,optimistic);
                if (upperOutcome.owner === faction) uncertain.push({ ...candidate, reason: 'risk_decision_boundary' });
            }
            continue;
        }
        trace.reason = 'useful';
        const decision = new TacticalDecision(faction, candidate.target, candidate.purpose, view.time,
            view.time + (candidate.urgent ? limits.urgentMs : limits.routineMs) / 1000);
        decision.transport = candidate.mission;
        decision.urgent = candidate.urgent; decision.orders = orders; decision.expected = result;
        decision.targetOwner = view.nodes[candidate.target].owner;
        decision.dependencies = orders.map(o => o.source).concat(candidate.target);
        decision.followUp = candidate.purpose === 'regroup' ? routeFromOrigin(view, faction, profile, orders[0].source, playerFaction)?.goal ?? null : null;
        decision.hypotheses = [];
        let utility = candidate.score;
        const enemies = view.nodes.map((n, i) => ({ n, i })).filter(({ n, i }) => n.owner !== faction && n.owner !== 'neutral'
            && i !== candidate.target && (view.idle[i].get(n.owner) || []).length > 1
            && mayCounterattack(view, n.owner, faction, state.difficulty, playerFaction));
        enemies.sort((a, b) => Math.hypot(a.n.x - view.nodes[candidate.target].x, a.n.y - view.nodes[candidate.target].y)
            - Math.hypot(b.n.x - view.nodes[candidate.target].x, b.n.y - view.nodes[candidate.target].y));
        if (limits.hypotheses && enemies.length) {
            const { n, i } = enemies[0], forceUnits = (view.idle[i].get(n.owner) || []).slice(1);
            const transfer = assessTransfer(view, i, candidate.target, n.owner, forceUnits);
            if (transfer.status === 'known' && transfer.lossUpper < forceUnits.length) {
                const heavy = forceUnits.filter(u => (u.power || 1) > 1).length;
                const response = projectNode(view, candidate.target, faction, deployments, { hypotheses: [{ faction: n.owner,
                    light: Math.max(0, forceUnits.length - heavy - transfer.lossUpper), heavy, eta: transfer.first }] });
                decision.hypotheses.push({ kind: 'reinforce', owner: response.owner, source: i });
                if (response.owner !== faction) utility *= .7;
            }
        }
        if (limits.hypotheses > 1 && !['evacuation', 'defense'].includes(candidate.purpose)) {
            const source = orders[0].source;
            const rivalIndex = view.nodes[candidate.target].owner !== 'neutral' ? candidate.target : enemies[0]?.i;
            if (rivalIndex !== undefined) {
                const rival = view.nodes[rivalIndex], units = view.idle[rivalIndex].get(rival.owner) || [];
                if (units.length > 1 && mayCounterattack(view, rival.owner, faction, state.difficulty, playerFaction)) {
                    const transfer = assessTransfer(view, rivalIndex, source, rival.owner, units.slice(1));
                    if (transfer.status === 'known') {
                        const heavy = units.slice(1).filter(u => (u.power || 1) > 1).length;
                        const response = projectNode(view, source, faction, [], { withdrawals: orders[0].selected,
                            hypotheses: [{ faction: rival.owner, light: Math.max(0, units.length - 1 - heavy - transfer.lossUpper), heavy, eta: transfer.first }] });
                        decision.hypotheses.push({ kind: 'counterattack', owner: response.owner, source: rivalIndex, alternativeOnly: true });
                        if (response.owner !== faction) utility *= .45;
                    }
                }
            }
        }
        if (state.advice && state.advice.expiresAt >= view.time && state.advice.target === candidate.target) utility *= 1.05;
        if (utility > bestScore) { bestScore = utility; best = decision; }
    }
    if (best) { evaluation.selected = { target: best.target, purpose: best.purpose, sources: best.orders.length, hypotheses: best.hypotheses };
        return { decision: best, uncertain, reason: '' }; }
    const retainingCapture = evaluation.alternatives.some(a => a.reason === 'finish_capture');
    const retainingControl = evaluation.alternatives.some(a => ['defend_commitment', 'frontier_control'].includes(a.reason));
    return { decision: null, uncertain, reason: !pools.some(p => p.length) ? 'no_available_troops'
        : uncertain.length ? 'analysis_pending' : exhausted ? 'budget_exhausted' : retainingCapture ? 'finishing_capture'
            : retainingControl ? 'maintaining_control' : pairs.length ? 'accumulating' : 'no_useful_legal_action',
        target: pairs[0]?.target, requiredPower: pairs.length ? hostilePower(view, pairs[0].target, faction, 10) : 0 };
}
