/**
 * ai_command_buffer.js — Buffer de Comandos, Despacho y Top-K Candidatos
 *
 * Extraído de UtilityEngine.
 * Gestiona la escritura al buffer plano de comandos (Float32Array),
 * el sistema de candidatos Top-K, la ejecución de comandos (dispatch
 * de unidades), y la compra de evoluciones.
 *
 * ZERO-ALLOCATION: Todas las funciones operan sobre los buffers
 *                   pre-asignados del UtilityEngine.
 */

import {
    ACTION_ATTACK, ACTION_REINFORCE, ACTION_EVOLVE_TANK,
    ACTION_EVOLVE_THORN, ACTION_EVOLVE_ART, ACTION_TUNNEL,
    CMD_SOURCE, CMD_TARGET, CMD_ACTION, CMD_LIGHT, CMD_HEAVY,
    CMD_PRIORITY, CMD_FIRST_HOP, CMD_STRIDE, CMD_MAX,
    W_SEND_RATIO, W_DUMP_RATIO, W_SIMULATOR_TRUST,
    EVO_COSTS, TOP_K, MIN_ATTACK_FORCE, PHASE_EARLY,
} from './ai_constants.js';
import {
    SUCCESS_VICTORIA,
    SUCCESS_SEGURA,
    OUT_RECOMMENDED_LIGHT,
    OUT_RECOMMENDED_HEAVY,
} from './optimal_deployment_solver.js';

// ═══════════════════════════════════════════════════════════════════
//  TOP-K CANDIDATE MANAGEMENT (inline insertion sort, K=3)
// ═══════════════════════════════════════════════════════════════════

/**
 * Insert a candidate into the engine's Top-K sorted list.
 * @param {UtilityEngine} engine
 */
export function insertCandidate(engine, targetIndex, score, routeResult, firstHopIndex) {
    if (engine._candCount < TOP_K) {
        const pos = engine._candCount;
        setCandidateSlot(engine, pos, targetIndex, score, routeResult, firstHopIndex);
        engine._candCount++;
        for (let i = pos; i > 0; i--) {
            if (engine._candScores[i] > engine._candScores[i - 1]) {
                swapCandidates(engine, i, i - 1);
            } else break;
        }
    } else if (score > engine._candScores[TOP_K - 1]) {
        setCandidateSlot(engine, TOP_K - 1, targetIndex, score, routeResult, firstHopIndex);
        for (let i = TOP_K - 1; i > 0; i--) {
            if (engine._candScores[i] > engine._candScores[i - 1]) {
                swapCandidates(engine, i, i - 1);
            } else break;
        }
    }
}

/** @param {UtilityEngine} engine */
export function setCandidateSlot(engine, slot, targetIndex, score, routeResult, firstHopIndex) {
    engine._candIndices[slot] = targetIndex;
    engine._candScores[slot] = score;
    engine._candHasRoute[slot] = routeResult ? 1 : 0;
    engine._candTransitTimes[slot] = routeResult ? (routeResult.projectedTransitTime || 0) : 0;
    engine._candCasualties[slot] = routeResult ? (routeResult.projectedCasualties || 0) : 0;
    engine._candDelays[slot] = routeResult ? (routeResult.suggestedDelay || 0) : 0;
    engine._candFirstHop[slot] = firstHopIndex == null ? -1 : firstHopIndex;
}

/** @param {UtilityEngine} engine */
export function swapCandidates(engine, a, b) {
    let tmpIndex = engine._candIndices[a];
    engine._candIndices[a] = engine._candIndices[b];
    engine._candIndices[b] = tmpIndex;

    let tmpScore = engine._candScores[a];
    engine._candScores[a] = engine._candScores[b];
    engine._candScores[b] = tmpScore;

    let tmpFlag = engine._candHasRoute[a];
    engine._candHasRoute[a] = engine._candHasRoute[b];
    engine._candHasRoute[b] = tmpFlag;

    tmpScore = engine._candTransitTimes[a];
    engine._candTransitTimes[a] = engine._candTransitTimes[b];
    engine._candTransitTimes[b] = tmpScore;

    tmpScore = engine._candCasualties[a];
    engine._candCasualties[a] = engine._candCasualties[b];
    engine._candCasualties[b] = tmpScore;

    tmpScore = engine._candDelays[a];
    engine._candDelays[a] = engine._candDelays[b];
    engine._candDelays[b] = tmpScore;

    tmpIndex = engine._candFirstHop[a];
    engine._candFirstHop[a] = engine._candFirstHop[b];
    engine._candFirstHop[b] = tmpIndex;
}

/** @param {UtilityEngine} engine */
export function getCandidateRoute(engine, slot) {
    if (!engine._candHasRoute[slot]) return null;
    const route = engine._candRouteResult;
    route.isViable = true;
    route.projectedTransitTime = engine._candTransitTimes[slot];
    route.projectedCasualties = engine._candCasualties[slot];
    route.suggestedDelay = engine._candDelays[slot];
    route.queryHandle = -1;
    return route;
}

// ═══════════════════════════════════════════════════════════════════
//  COMMAND BUFFER WRITES
// ═══════════════════════════════════════════════════════════════════

/** @param {UtilityEngine} engine */
export function writeCommand(engine, srcIdx, tgtIdx, action, light, heavy, priority, firstHop = -1) {
    if (engine._cmdCount >= CMD_MAX) return;
    const base = engine._cmdCount * CMD_STRIDE;
    engine._cmdBuffer[base + CMD_SOURCE]   = srcIdx;
    engine._cmdBuffer[base + CMD_TARGET]   = tgtIdx;
    engine._cmdBuffer[base + CMD_ACTION]   = action;
    engine._cmdBuffer[base + CMD_LIGHT]    = light;
    engine._cmdBuffer[base + CMD_HEAVY]    = heavy;
    engine._cmdBuffer[base + CMD_PRIORITY] = priority;
    engine._cmdBuffer[base + CMD_FIRST_HOP] = firstHop;
    engine._cmdCount++;
}

/** @param {UtilityEngine} engine */
export function writeAttackCmd(engine, sourceNode, sourceIndex, targetIndex, ownCount,
                    aiFaction, isDump, world, routeResult, firstHopIndex) {
    const w = engine._weights;
    let ratio = isDump ? w[W_DUMP_RATIO] : w[W_SEND_RATIO];

    const toSend = Math.max(1, Math.floor(ownCount * ratio));
    const light = engine._idleLightByNode[sourceIndex] || 0;
    const heavy = engine._idleHeavyByNode[sourceIndex] || 0;
    const total = light + heavy;
    if (total < 1) return false;
    const sendLight = Math.min(light, Math.ceil(toSend * (light / Math.max(1, total))));
    const sendHeavy = Math.min(heavy, toSend - sendLight);
    if (sendLight + sendHeavy < 1) return false;
    writeCommand(engine, sourceIndex, targetIndex, ACTION_ATTACK, sendLight, sendHeavy, 0, firstHopIndex);
    if (engine._activeMemory) {
        engine._activeMemory.recordAttack(sourceIndex, targetIndex, engine._simTime);
    }
    return true;
}

/**
 * Resolved attack command: uses OptimalDeploymentSolver when available.
 * Unified version (replaces both _writeAttackCmdOptimal and _writeAttackCmdResolved).
 * @param {UtilityEngine} engine
 */
export function writeAttackCmdResolved(engine, sourceNode, targetNode, sourceIndex, targetIndex,
                            ownCount, aiFaction, isDump, world, routeResult,
                            firstHopIndex, minSurvivors) {
    if (!engine._solver) {
        return writeAttackCmd(engine, sourceNode, sourceIndex, targetIndex, ownCount,
            aiFaction, isDump, world, routeResult, firstHopIndex);
    }

    const maxAllocatable = isDump
        ? ownCount
        : engine._solver.computeMaxAllocatable(sourceNode, aiFaction, world);

    if (maxAllocatable < 5 && !isDump) return false;

    const maxLight = Math.min(engine._idleLightByNode[sourceIndex] || 0, maxAllocatable);
    const maxHeavy = Math.min(engine._idleHeavyByNode[sourceIndex] || 0, maxAllocatable);

    const w = engine._weights;
    const successCond = isDump ? SUCCESS_VICTORIA : SUCCESS_SEGURA;
    let margin = isDump ? 1.0 : (w[W_SIMULATOR_TRUST] >= 1.0 ? 1.15 : 1.25);
    
    // Capa de agresión temprana: Enviar un contingente mucho mayor para aniquilar
    // las defensas neutrales rápidamente, pero respetando las reservas defensivas.
    if (engine._currentPhase === PHASE_EARLY && targetNode.owner === 'neutral') {
        margin = 3.0; 
    }

    const valid = engine._solver.calculateOptimalDeployment(
        world, sourceNode, targetNode,
        maxLight, maxHeavy,
        aiFaction, successCond, margin,
        routeResult,
        engine._deployResult
    );

    let sendLight, sendHeavy;
    if (valid) {
        const expectedSurvivors = engine._deployResult[3] || 0;
        if (!isDump && minSurvivors > 0 && expectedSurvivors < minSurvivors) {
            return false;
        }
        sendLight = engine._deployResult[OUT_RECOMMENDED_LIGHT] | 0;
        sendHeavy = engine._deployResult[OUT_RECOMMENDED_HEAVY] | 0;
    } else if (isDump) {
        sendLight = maxLight;
        sendHeavy = maxHeavy;
    } else {
        return false;
    }

    if (sendLight + sendHeavy < 1) return false;
    writeCommand(engine, sourceIndex, targetIndex, ACTION_ATTACK, sendLight, sendHeavy, 0, firstHopIndex);
    if (engine._activeMemory) {
        engine._activeMemory.recordAttack(sourceIndex, targetIndex, engine._simTime);
    }
    return true;
}

// ═══════════════════════════════════════════════════════════════════
//  COMMAND EXECUTION
// ═══════════════════════════════════════════════════════════════════

/**
 * Execute all pending commands in the buffer.
 * @param {UtilityEngine} engine
 * @param {object[]} allUnits
 * @param {object[]} nodes
 * @param {string} aiFaction
 * @param {object} world
 * @param {object} navExecResult
 */
export function executeCommands(engine, allUnits, nodes, aiFaction, world, navExecResult) {
    for (let c = 0; c < engine._cmdCount; c++) {
        const base   = c * CMD_STRIDE;
        const srcIdx = engine._cmdBuffer[base + CMD_SOURCE] | 0;
        const tgtIdx = engine._cmdBuffer[base + CMD_TARGET] | 0;
        const action = engine._cmdBuffer[base + CMD_ACTION] | 0;
        const light  = engine._cmdBuffer[base + CMD_LIGHT]  | 0;
        const heavy  = engine._cmdBuffer[base + CMD_HEAVY]  | 0;
        const firstHopIdx = engine._cmdBuffer[base + CMD_FIRST_HOP] | 0;

        if (srcIdx >= nodes.length || tgtIdx >= nodes.length) continue;
        const srcNode = nodes[srcIdx];
        const tgtNode = nodes[tgtIdx];

        if (action === ACTION_ATTACK || action === ACTION_REINFORCE) {
            dispatchUnitsResolved(srcNode, tgtNode, light, heavy,
                                            allUnits, aiFaction, world, firstHopIdx);
        } else if (action === ACTION_EVOLVE_TANK) {
            buyEvolution(srcNode, 'tanque', EVO_COSTS.tanque, aiFaction, allUnits, world);
        } else if (action === ACTION_EVOLVE_THORN) {
            buyEvolution(srcNode, 'espinoso', EVO_COSTS.espinoso, aiFaction, allUnits, world);
        } else if (action === ACTION_EVOLVE_ART) {
            buyEvolution(srcNode, 'artilleria', EVO_COSTS.artilleria, aiFaction, allUnits, world);
        } else if (action === ACTION_TUNNEL) {
            srcNode.tunnelTo = tgtNode;
        }
        // ACTION_WAIT: no-op
    }
}

/**
 * Dispatch units from source to target using firstHop routing.
 */
export function dispatchUnitsResolved(srcNode, tgtNode, lightToSend, heavyToSend,
                           allUnits, aiFaction, world, firstHopIndex) {
    let hopTarget = tgtNode;
    if (firstHopIndex >= 0 && firstHopIndex < world.nodes.length) {
        hopTarget = world.nodes[firstHopIndex];
    }

    if (world && world.isPathBlocked && world.isPathBlocked(srcNode, hopTarget)) {
        return;
    }

    let sentHeavy = 0;
    let sentLight = 0;

    // Send heavy units first (swap-and-iterate, no splice)
    for (let i = allUnits.length - 1; i >= 0 && sentHeavy < heavyToSend; i--) {
        const u = allUnits[i];
        if (u.pendingRemoval || u.faction !== aiFaction || u.state !== 'idle') continue;
        if (u.targetNode !== srcNode) continue;
        if ((u.power || 1) <= 1) continue;
        u.targetNode = hopTarget;
        u.state = 'traveling';
        sentHeavy++;
    }

    // Send light units
    for (let i = allUnits.length - 1; i >= 0 && sentLight < lightToSend; i--) {
        const u = allUnits[i];
        if (u.pendingRemoval || u.faction !== aiFaction || u.state !== 'idle') continue;
        if (u.targetNode !== srcNode) continue;
        if ((u.power || 1) > 1) continue;
        u.targetNode = hopTarget;
        u.state = 'traveling';
        sentLight++;
    }
}

/**
 * Buy an evolution for a node by consuming idle units.
 */
export function buyEvolution(node, type, cost, faction, allUnits, world) {
    if (!node.startEvolution(type)) return;

    // Kill N power worth of units to pay the cost
    let remaining = cost;
    for (let i = 0; i < allUnits.length && remaining > 0; i++) {
        const u = allUnits[i];
        if (!u.pendingRemoval && u.faction === faction
            && u.targetNode === node && u.state === 'idle') {
            u.pendingRemoval = true;
            remaining -= (u.power || 1);
        }
    }
}

// ═══════════════════════════════════════════════════════════════════
//  ESTIMATION HELPERS
// ═══════════════════════════════════════════════════════════════════

/** Estimate how many bodies this node would send in an attack. */
export function estimateAttackBodies(engine, sourceNode, sourceIndex, ownCount, aiFaction, needsDump, world) {
    if (needsDump) return ownCount;

    const idleBodies =
        (engine._idleLightByNode[sourceIndex] || 0) +
        (engine._idleHeavyByNode[sourceIndex] || 0);

    if (idleBodies < 1) return 0;

    if (!engine._solver) {
        return Math.max(
            MIN_ATTACK_FORCE,
            Math.min(idleBodies, Math.floor(ownCount * engine._weights[W_SEND_RATIO]))
        );
    }

    const allocatable = engine._solver.computeMaxAllocatable(sourceNode, aiFaction, world);
    const budget = Math.max(MIN_ATTACK_FORCE, Math.floor(allocatable));
    return Math.min(ownCount, idleBodies, budget);
}
