import { Unit } from '../entities/unit.js?v=rts-balance-thorns-20261029-1';

export function issueTroopOrder(world, source, target, count, faction, selected = null) {
    if (!source || !target || source === target || !world.nodes.includes(source) || !world.nodes.includes(target)) return 0;
    if (world.isPathBlocked?.(source, target)) return 0;
    const eligible = selected || world.allUnits.filter(u => !u.pendingRemoval && u.faction === faction && u.state === 'idle' && u.targetNode === source);
    if (!Number.isInteger(count) || count < 1 || count > eligible.length) return 0;
    const registered = selected ? new Set(world.allUnits) : null;
    if (selected && (new Set(selected).size !== selected.length || selected.some(u => !registered.has(u) ||
        u.pendingRemoval || u.faction !== faction || u.state !== 'idle' || u.targetNode !== source))) return 0;
    for (let i = 0; i < count; i++) {
        eligible[i].targetNode = target; eligible[i].state = 'traveling'; eligible[i].speedMult = 1;
        if (world.aiTravelingUnits && eligible[i].aiTravelStamp !== (world.aiGridRevision || 0)) {
            world.aiTravelingUnits.push(eligible[i]); eligible[i].aiTravelStamp = world.aiGridRevision || 0;
        }
    }
    world.aiOrderRevision = (world.aiOrderRevision || 0) + 1;
    return count;
}

// Shared by the live RTS and the isolated forecasting world. No rendering here.
export function updateNodeCounts(world) {
    for (const _ of updateNodeCountsWork(world)) {}
}

export function* updateNodeCountsWork(world) {
    let work = 0;
    for (const n of world.nodes) {
        n.counts ??= {}; n.population ??= {}; n.power ??= {};
        for (const table of [n.counts, n.population, n.power]) for (const f in table) table[f] = 0;
    }
    for (const u of world.allUnits) {
        if (++work % 32 === 0) yield 'counts';
        if (u.pendingRemoval || !u.targetNode) continue;
        const n = u.targetNode;
        if (u.state !== 'idle' && (u.x - n.x) ** 2 + (u.y - n.y) ** 2 >= (n.radius * 1.5) ** 2) continue;
        n.counts[u.faction] = (n.counts[u.faction] || 0) + 1;
        n.population[u.faction] = (n.population[u.faction] || 0) + (u.power || 1);
        n.power[u.faction] = n.population[u.faction];
    }
}

export function processRegen(world, node, dt) {
    if (node.pendingEvolution) {
        node.pendingEvolutionEtaSec = Math.max(0, node.pendingEvolutionEtaSec - dt);
        if (node.pendingEvolutionEtaSec <= 0 && node.owner !== 'neutral') node.completeEvolution();
    }
    if (node.owner === 'neutral' || node.type === 'tunel') return;
    const faction = node.owner;
    if (node.population[faction] >= node.maxUnits || world.allUnits.length >= 3000) return;
    node.regenTimer += dt;
    let interval = node.regenInterval;
    if (node.type === 'enjambre') interval /= world.campaignModifiers?.[faction]?.generation || 1;
    if (node.evolution === 'tanque') interval *= 1.5;
    let projectedPower = node.population[faction] || 0;
    while (node.regenTimer >= interval && projectedPower < node.maxUnits && world.allUnits.length < 3000) {
        node.regenTimer -= interval;
        const seed = world.nextUnitSeed(node, faction);
        const u = new Unit(node.x, node.y, faction, seed);
        world.positionUnitInNode(u, node, 0.7, projectedPower | 0);
        if (node.evolution === 'tanque') u.power = 3;
        if (node.tunnelTo && node.tunnelTo.owner === faction && node.type !== 'tunel') {
            u.targetNode = node.tunnelTo; u.homeNode = node; u.state = 'traveling'; u.speedMult = 2;
        } else {
            u.targetNode = node; u.homeNode = node; u.state = 'idle'; u.speedMult = 1;
        }
        world.attachSprite(u);
        world.allUnits.push(u);
        if (u.state === 'traveling' && world.aiTravelingUnits) {
            world.aiTravelingUnits.push(u); u.aiTravelStamp = world.aiGridRevision;
        }
        projectedPower += u.power;
    }
}
