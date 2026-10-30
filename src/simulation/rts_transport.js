import { crossesBarrier } from './rts_forecast.js';
import { canTargetFaction } from './ai_diplomacy.js';
import { CombatManager } from '../managers/combat_manager.js';
import { segmentRectInterval } from '../navigation/nav_hazard_evaluator.js';

export const LOGISTICS_COST = 15;
export function activatePortal(world, source, faction, selected = null) {
    if (!source || source.type !== 'tunel' || source.owner !== faction || !source.tunnelTo) return 0;
    const target = source.tunnelTo;
    const units = selected || world.allUnits.filter(u => !u.pendingRemoval && u.faction === faction && u.targetNode === source && u.state === 'idle');
    const registered = selected ? new Set(world.allUnits) : null;
    if (new Set(units).size !== units.length || units.some(u => registered && !registered.has(u) || u.pendingRemoval || u.faction !== faction || u.targetNode !== source || u.state !== 'idle')) return 0;
    for (const u of units) {
        world.positionUnitInNode?.(u,target,.5,((u.deterministicSeed ?? 1) ^ (target.radius | 0)) >>> 0);
        if (!world.positionUnitInNode) { u.x = target.x; u.y = target.y; }
        u.targetNode = target; u.homeNode = target; u.state = 'idle';
    }
    world.aiOrderRevision = (world.aiOrderRevision || 0) + 1;
    return units.length;
}
export function orbitalPosition(node, game, after = 0) {
    const angle = (node.orbitAngle || 0) + node.orbitSpeed * after;
    return { x: (node.orbitAnchorX + Math.cos(angle) * node.orbitRadiusX) * game.width,
        y: (node.orbitAnchorY + Math.sin(angle) * node.orbitRadiusY) * game.height };
}

// A geometric shortlist, not permission to launch. The physical predictor must
// validate boarding, exposure and the cohort before a timed order is accepted.
export function ferryWindows(view, source, target, speed = 75) {
    const boarding = view.nodes[target].isMobile;
    const ferry = boarding ? view.nodes[target] : view.nodes[source], origin = boarding ? view.nodes[source] : view.nodes[target];
    if (!ferry.isMobile || !ferry.orbitSpeed || speed <= 0) return [];
    if (view.nodes[source].isMobile && view.nodes[target].isMobile) return [];
    const cycle = Math.PI * 2 / Math.abs(ferry.orbitSpeed), candidates = [];
    const samples = 96;
    for (let i = 0; i < samples; i++) {
        const delay = cycle * i / samples;
        let transit = Math.hypot(ferry.x - origin.x, ferry.y - origin.y) / speed;
        for (let j = 0; j < 8; j++) {
            const point = orbitalPosition(ferry, view.game, boarding ? delay + transit : delay);
            transit = Math.hypot(point.x - origin.x, point.y - origin.y) / speed;
        }
        const point = orbitalPosition(ferry, view.game, boarding ? delay + transit : delay);
        const residual = Math.abs(Math.hypot(point.x - origin.x, point.y - origin.y) / speed - transit);
        // Both departure and interception geometry must be physically reachable.
        if (residual > .15 || crossesBarrier(origin, point, view.barriers, view.game)) continue;
        candidates.push({ delay, transit, arrival: delay + transit, point });
    }
    const selected = [];
    for (const candidate of candidates.sort((a,b) => a.arrival - b.arrival)) {
        if (selected.every(other => {
            const gap = Math.abs(other.delay-candidate.delay);
            return Math.min(gap,cycle-gap) >= cycle/6;
        })) selected.push(candidate);
        if (selected.length === 3) break;
    }
    return selected;
}

export function ferryObjective(view, source, target, faction, profile, playerFaction = 'player') {
    const origin = view.nodes[source], ferry = view.nodes[target];
    if (!ferry.isMobile || !ferry.orbitSpeed) return null;
    const cycle = Math.PI * 2 / Math.abs(ferry.orbitSpeed);
    let best = null;
    for (let i = 0; i < view.nodes.length; i++) {
        const destination = view.nodes[i];
        if (i === source || destination.isMobile || destination.owner === faction || !canTargetFaction(profile,faction,destination.owner,playerFaction)) continue;
        const direct = crossesBarrier(origin,destination,view.barriers,view.game) ? Infinity : Math.hypot(origin.x-destination.x,origin.y-destination.y)/75;
        const hazardousDirect = view.hazards.some(h => {
            const r = h.radius * view.game.width;
            const left = h.shape === 'rect_puddle' ? h.x*view.game.width : h.x*view.game.width-r;
            const top = h.shape === 'rect_puddle' ? h.y*view.game.height : h.y*view.game.height-r*(h.scaleY||1);
            const right = h.shape === 'rect_puddle' ? (h.x+h.width)*view.game.width : h.x*view.game.width+r;
            const bottom = h.shape === 'rect_puddle' ? (h.y+h.height)*view.game.height : h.y*view.game.height+r*(h.scaleY||1);
            return h.dps > 0 && segmentRectInterval(origin.x,origin.y,destination.x,destination.y,left,top,right,bottom,{});
        });
        for (let phase = 0; phase < 24; phase++) {
            const after = cycle * phase / 24, point = orbitalPosition(ferry,view.game,after);
            if (crossesBarrier(point,destination,view.barriers,view.game)) continue;
            const walking = (Math.hypot(origin.x-ferry.x,origin.y-ferry.y) + Math.hypot(point.x-destination.x,point.y-destination.y))/75;
            const cost = walking + after;
            const sheltersTravel = hazardousDirect && walking + .5 < direct;
            const rank = sheltersTravel ? walking + after*.1 : cost;
            if (cost >= direct && !sheltersTravel || best && rank >= best.rank) continue;
            best = { goal: i, cost, rank, shelterCandidate: sheltersTravel, phase: 'boarding', exitAfter: after };
        }
    }
    return best;
}

export function logisticsCost(world, faction) {
    return Math.ceil(LOGISTICS_COST * (world.campaignModifiers?.[faction]?.logisticsDiscount || 1));
}
export function logisticsEligibility(world, source, target, faction, reserve = 0) {
    if (!source || !target || source === target || source.type === 'tunel' || source.isMobile || target.isMobile
        || source.owner !== faction || target.owner !== faction || world.isPathBlocked?.(source,target)) return null;
    const units = world.allUnits.filter(u => !u.pendingRemoval && u.state === 'idle' && u.faction === faction && u.targetNode === source);
    const cost = logisticsCost(world,faction);
    let power = 0; const paid = [];
    for (const u of [...units].sort((a,b)=>(a.power||1)-(b.power||1))) {
        if (power >= cost) break;
        paid.push(u); power += u.power || 1;
    }
    const total = units.reduce((n,u)=>n+(u.power||1),0);
    return power >= cost && total - power >= reserve ? { cost, paid, paidPower: power } : null;
}
export function setLogisticsLink(world, source, target, faction, reserve = 0) {
    if (source?.tunnelTo === target) return false;
    const payment = logisticsEligibility(world,source,target,faction,reserve);
    if (!payment) return false;
    CombatManager.killNPower(world,source,faction,payment.cost);
    source.tunnelTo = target; source.redraw?.();
    return true;
}
export function removeLogisticsLink(source, faction) {
    if (!source || source.owner !== faction || source.type === 'tunel' || !source.tunnelTo) return false;
    source.tunnelTo = null; source.redraw?.(); return true;
}
