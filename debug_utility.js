import { UtilityEngine, WEIGHT_VECTOR_SIZE } from './src/simulation/utility_engine.js';
import { PredictiveCombatSimulator } from './src/simulation/predictive_combat_simulator.js';
import { OptimalDeploymentSolver } from './src/simulation/optimal_deployment_solver.js';

const simulator = new PredictiveCombatSimulator(32, 128);
const solver = new OptimalDeploymentSolver(simulator);
const engine = new UtilityEngine(simulator, solver, null);

// Setup weights for HARD
engine._weights.set([
    0.8,  1.5,  1.2,  1.0,  1.1,  0.6,  0.9,  0.1,
    0.5,  1.0,  0.90, 1.0,  1.0,  3,    1.0,  20,
    0.75, 0.95, 1.00, 0.5,  6.0,  1.0,  1.0,  1.0,
    1.0,  1.0,  1.5
]);

const worldWidth = 1920;
const worldHeight = 1080;

const nodes = [
    { id: 'p1', x: 0.1 * worldWidth, y: 0.5 * worldHeight, owner: 'player', type: 'gigante', radius: 70 },
    { id: 'e1', x: 0.9 * worldWidth, y: 0.1 * worldHeight, owner: 'enemy', type: 'gigante', radius: 70 },
    { id: 'e2', x: 0.7 * worldWidth, y: 0.1 * worldHeight, owner: 'neutral', type: 'normal', radius: 45 },
    { id: 'f1', x: 0.9 * worldWidth, y: 0.9 * worldHeight, owner: 'fuego', type: 'gigante', radius: 70 },
    { id: 'center', x: 0.6 * worldWidth, y: 0.5 * worldHeight, owner: 'neutral', type: 'gigante', radius: 70 }
];

const allUnits = [];
for (let i = 0; i < 150; i++) allUnits.push({ faction: 'enemy', state: 'idle', targetNode: nodes[1], power: 1 });
for (let i = 0; i < 150; i++) allUnits.push({ faction: 'fuego', state: 'idle', targetNode: nodes[3], power: 1 });
for (let i = 0; i < 150; i++) allUnits.push({ faction: 'player', state: 'idle', targetNode: nodes[0], power: 1 });
// neutral defenders
for (let i = 0; i < 20; i++) allUnits.push({ faction: 'neutral', state: 'idle', targetNode: nodes[2], power: 1 });
for (let i = 0; i < 100; i++) allUnits.push({ faction: 'neutral', state: 'idle', targetNode: nodes[4], power: 1 });

const world = {
    nodes,
    allUnits,
    playerFaction: 'player',
    unitBaseSpeed: 75,
    allowEvolutions: true
};

engine._currentPhase = 0; // PHASE_EARLY
engine._avgNodeDistance = 400;

nodes[1].counts = { 'enemy': 150 };
nodes[1].power = { 'enemy': 150 };

engine._buildIdleIndex(allUnits, 'enemy');
engine._classifyNodes(nodes, 'enemy', 'player');

console.log("Evaluating from e1 (enemy):");
engine._candCount = 0;

for (let j = 0; j < engine._targetNodeCount; j++) {
    const targetIndex = engine._targetNodeIndices[j];
    const target = nodes[targetIndex];
    
    const dx = target.x - nodes[1].x;
    const dy = target.y - nodes[1].y;
    const distSq = dx * dx + dy * dy;
    
    let defenders = 0;
    for (let u of allUnits) {
        if (u.targetNode === target && u.faction !== 'enemy') defenders++;
    }

    const routeResult = {
        isViable: true,
        projectedTransitTime: Math.sqrt(distSq) / 75,
        projectedCasualties: 0,
        suggestedDelay: 0
    };

    const score = engine._computeAttackUtility(
        nodes[1], target, 1, targetIndex,
        150, defenders, distSq, routeResult,
        'enemy', 'player', nodes, allUnits, false, world
    );
    console.log(`Target: ${target.id}, Score: ${score}`);
}
