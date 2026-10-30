import { makeWorld } from './rts-world.js';
import { Node } from '../../src/entities/node.js';
import { IntermittentBarrier } from '../../src/systems/intermittent_barrier.js';
import { WaterSweep } from '../../src/systems/water_sweep.js';
import { LightSweep } from '../../src/systems/light_sweep.js';
import { mergeAIStrategy } from '../../src/simulation/ai_config.js';
import { updateNodeCounts } from '../../src/simulation/rts_world_rules.js';

// Data-only fixture: no renderer, browser, input automation or autonomous match.
// Uses the loader's node sizes, overlap separation and initial-force rules.
export function levelFixture(sector, level, seed = 1) {
    const width = 1280, height = 720;
    const nodes = level.nodes.map((spec, i) => {
        const base = new Node(0, 0, spec.owner, spec.type);
        let count = spec.startUnits ?? Math.floor(base.maxUnits * .4);
        if (spec.owner === 'neutral' && spec.type !== 'tunel' && count !== 0) count = spec.type === 'enjambre' ? 20 : spec.type === 'normal' ? 15 : 30;
        return { ...spec, x: spec.x * width, y: spec.y * height, count, radius: base.radius, navIndex: i, orbitAngle: spec.orbitAngle || 0 };
    });
    for (let iteration = 0; iteration < 50; iteration++) {
        let overlap = false;
        for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i], b = nodes[j], dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy);
            if (distance >= a.radius + b.radius + 20 || distance <= .1) continue;
            overlap = true; const push = (a.radius + b.radius + 20 - distance) / 2 + .1;
            if (!a.isMobile) { a.x -= dx / distance * push; a.y -= dy / distance * push; }
            if (!b.isMobile) { b.x += dx / distance * push; b.y += dy / distance * push; }
        }
        if (!overlap) break;
    }
    const world = makeWorld({ width, height, nodes, seed,
        hazards: level.hazards || [], zones: level.zones || [], barriers: level.barriers || [],
        gates: (level.intermittentBarriers || []).map(c => new IntermittentBarrier(c)),
        water: (level.waterSweeps || []).map(c => new WaterSweep(c)), light: (level.lightSweeps || []).map(c => new LightSweep(c)),
        strategy: mergeAIStrategy(sector.ai || sector.aiStrategy, level.ai || level.aiStrategy) });
    world.allowEvolutions = sector.config?.allowEvolutions !== false;
    for (let i = 0; i < nodes.length; i++) {
        const spec = level.nodes[i];
        if (spec.tunnelTo) world.nodes[i].tunnelTo = world.nodes.find(n => n.id === spec.tunnelTo);
        if (spec.evolution) world.nodes[i].completeEvolution(spec.evolution);
        if (spec.evolution === 'tanque') for (const u of world.allUnits) if (u.targetNode === world.nodes[i]) u.power = 3;
    }
    updateNodeCounts(world);
    return world;
}

export function mechanics(level) {
    const names = [];
    if (level.hazards?.length) names.push('veneno');
    if (level.zones?.length) names.push('velocidad');
    if (level.barriers?.length) names.push('paredes');
    if (level.intermittentBarriers?.length) names.push('compuertas');
    if (level.waterSweeps?.length) names.push('agua');
    if (level.lightSweeps?.length) names.push('luz');
    if (level.nodes.some(n => n.isMobile)) names.push('moviles');
    if (level.nodes.some(n => n.tunnelTo || n.type === 'tunel')) names.push('tuneles');
    if (level.nodes.some(n => n.evolution)) names.push('defensas');
    return names;
}
