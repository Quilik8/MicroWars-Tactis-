import { crossesBarrier } from './rts_forecast.js?v=rts-balance-thorns-20261029-1';
import { canTargetFaction } from './ai_diplomacy.js';
import { EVO_COSTS } from './ai_constants.js';

// Cheap shortlist only. Runtime still proves affordability and source defense
// before paying for any candidate. Preference cannot force an invalid purchase.
export function evolutionCandidates(view, faction, source, profile, playerFaction = 'player') {
    const node = view.nodes[source];
    if (!node || node.owner !== faction || node.type === 'tunel' || node.evolution || node.pendingEvolution) return [];
    let artilleryTargets = 0, corridorTraffic = 0, pressure = 0;
    for (let i = 0; i < view.nodes.length; i++) {
        const rival = view.nodes[i];
        if (rival.owner === faction || rival.owner === 'neutral' || !canTargetFaction(profile, faction, rival.owner, playerFaction)) continue;
        if (Math.hypot(rival.x - node.x, rival.y - node.y) <= (node.artilleryRange || 320)) artilleryTargets++;
        for (const target of view.nodes) {
            if (target === node || target.owner !== faction || crossesBarrier(rival, target, view.barriers, view.game)) continue;
            const dx = target.x - rival.x, dy = target.y - rival.y, l2 = dx * dx + dy * dy;
            const t = l2 ? ((node.x - rival.x) * dx + (node.y - rival.y) * dy) / l2 : -1;
            if (t > 0 && t < 1 && Math.hypot(node.x - rival.x - dx * t, node.y - rival.y - dy * t) < node.radius + 45) corridorTraffic++;
        }
    }
    for (const [f, g] of view.presence[source]) if (f !== faction) pressure += g.light + 3 * g.heavy;
    for (const wave of view.arrivals[source]) if (wave.faction !== faction && wave.eta <= 8) pressure += wave.light + 3 * wave.heavy;
    const production = 1 / Math.max(.1, node.regenInterval || 1);
    const scores = { espinoso: corridorTraffic * 5 + Math.min(12, pressure / 5),
        artilleria: artilleryTargets * 6, tanque: pressure ? 0 : production * 3 };
    return Object.entries(scores).filter(([, score]) => score > 0).map(([type, value]) => ({ type,
        score: value + (profile.preferredEvolution === type ? 2 : 0),
        cost: Math.ceil(EVO_COSTS[type] * (view.modifiers[faction]?.evolutionDiscount || 1)),
        reason: type === 'espinoso' ? 'traffic_and_pressure' : type === 'artilleria' ? 'targets_in_range' : 'production_investment',
    })).sort((a, b) => b.score - a.score || a.cost - b.cost);
}
