/**
 * ai_scoring.js — Sistema de Puntuación Heurística y Toma de Decisiones
 *
 * Extraído de UtilityEngine.
 * Gestiona la evaluación de evoluciones, refuerzos y ataques, calculando
 * la función de utilidad U(a) para cada acción posible.
 *
 * ZERO-ALLOCATION: Todas las funciones operan sobre los buffers
 * pre-asignados del UtilityEngine pasados como referencia.
 */

import {
    W_MIN_EVOLUTION_COUNT, W_EVOLVE_TANK, W_EVOLVE_THORN, W_EVOLVE_ART,
    W_COUNTER_EVOLUTION, W_REINFORCE, W_SPATIAL_CULLING_MAX, W_SIMULATOR_TRUST,
    W_ATTACK_NEUTRAL, W_ATTACK_PLAYER, W_PILAR4_URGENCY, W_ECONOMY_PRIORITY,
    W_AGGRESSION, W_BACK_CAP_BONUS, W_FLANK_BONUS, W_HAZARD_AVOIDANCE,
    W_TIMING_AWARENESS, W_ATTACK_INTERVAL, W_REARGUARD_CHECK,
    PHASE_EARLY, STAGNATION_REF, EVO_COSTS, K_DIST, MIN_ATTACK_FORCE,
    HAZARD_FATALITY_RATIO, ACTION_ATTACK,
    SIM_RESULT_SURVIVOR_BODIES, ACTION_EVOLVE_TANK, ACTION_EVOLVE_THORN, ACTION_EVOLVE_ART, ACTION_REINFORCE,
    countAt, countNonFaction, phaseMultipliers
} from './ai_constants.js';
import { getDiplomacyScoreMult } from './ai_diplomacy.js';
import { AITelemetry, telemetry } from './ai_telemetry.js';

import {
    RESULT_EMPATE_ESTANCADO,
    RESULT_VICTORIA_PIRRICA
} from './deterministic_rules.js';

import { checkRearguardVulnerability, isRouteSwept } from './ai_doomsday.js';
import { 
    writeCommand, 
    writeAttackCmd, 
    writeAttackCmdResolved, 
    estimateAttackBodies,
    insertCandidate,
    getCandidateRoute
} from './ai_command_buffer.js';

// ═══════════════════════════════════════════════════════════════
//  EVOLUTION EVALUATION
// ═══════════════════════════════════════════════════════════════

export function evaluateEvolution(engine, sourceNode, sourceIndex, ownCount, aiFaction, playerFaction, nodes, allUnits, world) {
    const w = engine._weights;

    // Already evolved or evolving?
    if (sourceNode.evolution || sourceNode.pendingEvolution) return false;
    if (sourceNode.type === 'tunel') return false;
    if (ownCount < w[W_MIN_EVOLUTION_COUNT]) return false;

    // Safety check: is this node under attack?
    let incomingThreat = 0;
    for (let i = 0; i < allUnits.length; i++) {
        const u = allUnits[i];
        if (!u.pendingRemoval && u.faction !== aiFaction
            && u.state === 'traveling' && u.targetNode === sourceNode) {
            incomingThreat += (u.power || 1);
        }
    }

    const safetyMult = incomingThreat > ownCount * 0.5 ? 0.0
        : (incomingThreat > 0 ? 0.5 : 1.0);
    if (safetyMult < 0.01) return false;

    // Stagnation multiplier
    const timeSinceCapture = engine._simTime - engine._lastCaptureTime;
    // Fix: Bug 4 - Cap stagnation bonus in early game to prevent compulsive evolution
    const stagnationMult = engine._currentPhase === PHASE_EARLY
        ? 1.0
        : 1.0 + Math.min(1.5, timeSinceCapture / STAGNATION_REF);

    // ── Capa 4.1: Frontline via distancia normalizada ────────
    const avgD = engine._avgNodeDistance;
    let minDistPlayer = Infinity;
    for (let i = 0; i < engine._playerNodeCount; i++) {
        const pn = nodes[engine._playerNodeIndices[i]];
        const dx = pn.x - sourceNode.x;
        const dy = pn.y - sourceNode.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < minDistPlayer) minDistPlayer = d;
    }
    const isFrontline = minDistPlayer < avgD * 1.2;

    // ── Capa 3.3: Doctrina — soporte (línea de fuego) ────────
    let nearbyEnemyNodes = 0;
    for (let i = 0; i < engine._targetNodeCount; i++) {
        const tn = nodes[engine._targetNodeIndices[i]];
        if (tn.owner === 'neutral') continue;
        const dx = tn.x - sourceNode.x;
        const dy = tn.y - sourceNode.y;
        if (dx * dx + dy * dy < (avgD * 1.5) * (avgD * 1.5)) nearbyEnemyNodes++;
    }
    const isSupportNode = nearbyEnemyNodes >= 2;

    // Player evolution census
    let playerEspinoso = 0, playerTanque = 0, playerArt = 0;
    for (let i = 0; i < engine._playerNodeCount; i++) {
        const pn = nodes[engine._playerNodeIndices[i]];
        if (pn.evolution === 'espinoso') playerEspinoso++;
        if (pn.evolution === 'tanque') playerTanque++;
        if (pn.evolution === 'artilleria') playerArt++;
    }

    // Map control
    const totalCtrl = engine._aiNodeCount + engine._playerNodeCount + 1;
    const mapControl = engine._aiNodeCount / totalCtrl;

    // ── Capa Estratégica Inyectada (AI Directives) ──
    const directiveFocus = engine._strategyFocus;
    const directivePrefEvo = engine._strategyPrefEvo;
    const directiveMinGarrison = engine._strategyMinEvolutionGarrison;
    
    // Score each evolution type
    const counterW = w[W_COUNTER_EVOLUTION];

    // Tank — Capa 3.3: retaguardia bonus (no frontline)
    let scoreTank = 800 * w[W_EVOLVE_TANK] * stagnationMult * safetyMult;
    if (!isFrontline) scoreTank *= 1.5;
    if (mapControl > 0.6) scoreTank *= 1.2;
    if (playerEspinoso > 1 && counterW > 0) scoreTank *= (1.0 + 0.6 * counterW);
    if (ownCount < EVO_COSTS.tanque) scoreTank = -Infinity;

    // Thorn (Espinoso) — Capa 3.3: frontline/cuello de botella
    let scoreThorn = 700 * w[W_EVOLVE_THORN] * stagnationMult * safetyMult;
    if (isFrontline) scoreThorn *= 1.5;
    if (engine._playerNodeCount > engine._aiNodeCount) scoreThorn *= 1.2;
    if (playerTanque > 1 && counterW > 0) scoreThorn *= (1.0 + 0.5 * counterW);
    if (ownCount < EVO_COSTS.espinoso) scoreThorn = -Infinity;

    // Artillery — Capa 3.3: soporte (cobertura + línea de fuego)
    let scoreArt = 750 * w[W_EVOLVE_ART] * stagnationMult * safetyMult;
    if (isSupportNode) scoreArt *= 1.6;
    else if (isFrontline) scoreArt *= 1.1;
    if (playerEspinoso > 1 && counterW > 0) scoreArt *= (1.0 + 0.5 * counterW);
    if (ownCount < EVO_COSTS.artilleria) scoreArt = -Infinity;

    const earlyExpansionTax = engine._currentPhase === PHASE_EARLY
        ? (mapControl < 0.45 ? 0.45 : 0.65)
        : 1.0;
    scoreTank *= earlyExpansionTax;
    scoreThorn *= earlyExpansionTax;
    scoreArt *= earlyExpansionTax;

    // Apply Focus overrides
    if (directiveFocus === 'turtle') {
        scoreThorn *= 2.0;
        scoreArt *= 1.5;
        scoreTank *= 0.5;
    } else if (directiveFocus === 'rush') {
        scoreThorn *= 0.1;
        scoreTank *= 0.1;
        scoreArt *= 0.1;
    } else if (directiveFocus === 'expansion') {
        scoreTank *= 0.45;
        scoreThorn *= 0.35;
        scoreArt *= 0.35;
    }
    
    if (directivePrefEvo === 'espinoso') scoreThorn *= 3.0;
    if (directivePrefEvo === 'tanque') scoreTank *= 3.0;
    if (directivePrefEvo === 'artilleria') scoreArt *= 3.0;

    // Opportunity cost: best nearby neutral attack
    let bestNeutralScore = 0;
    if (engine._currentPhase === PHASE_EARLY) {
        for (let t = 0; t < engine._targetNodeCount; t++) {
            const tn = nodes[engine._targetNodeIndices[t]];
            if (tn.owner !== 'neutral') continue;
            const defs = countNonFaction(tn, aiFaction);
            if (defs > 15) continue;
            const dx = tn.x - sourceNode.x;
            const dy = tn.y - sourceNode.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < avgD * 0.9) {
                const ns = (1000 + (tn.productionRate || 1) * 200) * (K_DIST / (K_DIST + dist / 75));
                if (ns > bestNeutralScore) bestNeutralScore = ns;
            }
        }
    }
    const oppCost = bestNeutralScore * (engine._currentPhase === PHASE_EARLY ? 1.1 : 0.6);

    scoreTank  -= oppCost;
    scoreThorn -= oppCost;
    scoreArt   -= oppCost;

    // Find best evolution
    let bestEvoAction = -1;
    let bestEvoScore  = 0;
    let bestEvoCost   = 0;

    if (scoreTank > bestEvoScore)  { bestEvoScore = scoreTank;  bestEvoAction = ACTION_EVOLVE_TANK;  bestEvoCost = EVO_COSTS.tanque; }
    if (scoreThorn > bestEvoScore) { bestEvoScore = scoreThorn; bestEvoAction = ACTION_EVOLVE_THORN; bestEvoCost = EVO_COSTS.espinoso; }
    if (scoreArt > bestEvoScore)   { bestEvoScore = scoreArt;   bestEvoAction = ACTION_EVOLVE_ART;   bestEvoCost = EVO_COSTS.artilleria; }

    if (bestEvoAction >= 0) {
        if (directiveFocus === 'expansion'
            && bestNeutralScore > 0
            && bestNeutralScore >= bestEvoScore * 0.85) {
            return false;
        }
        // ── Capa 2.2: Prueba de supervivencia Dinámica (Pilar 2) ──────────
        const remainingAfterEvo = ownCount - bestEvoCost;
        
        // Lógica Central Orgánica (Si no hay directiva forzada)
        let safeGarrisonThreshold = directiveMinGarrison;
        if (safeGarrisonThreshold === null || safeGarrisonThreshold === undefined) {
            // Cálculo adaptativo: en early game requerimos mucho más remanente para no estancar la expansión
            if (engine._currentPhase === PHASE_EARLY) {
                safeGarrisonThreshold = isFrontline ? 40 : 25;
            } else {
                safeGarrisonThreshold = isFrontline ? 25 : 15;
            }
        }
        
        if (remainingAfterEvo < safeGarrisonThreshold) return false;

        // Análisis de Amenaza: Calcular la suma TOTAL de fuerzas enemigas en radio de despliegue
        let nearestThreatNode = null;
        let nearestThreatDistSq = Infinity;
        let totalNearbyThreatForce = 0;
        
        for (let i = 0; i < engine._targetNodeCount; i++) {
            const tn = nodes[engine._targetNodeIndices[i]];
            if (tn.owner === 'neutral') continue;
            const tForce = countNonFaction(tn, aiFaction);
            if (tForce < 10) continue;
            const dx = tn.x - sourceNode.x;
            const dy = tn.y - sourceNode.y;
            const dSq = dx * dx + dy * dy;
            // Consideramos un perímetro amplio para amasar la amenaza conjunta
            if (dSq < (avgD * 2.5) * (avgD * 2.5)) {
                totalNearbyThreatForce += tForce;
                if (dSq < nearestThreatDistSq) {
                    nearestThreatDistSq = dSq;
                    nearestThreatNode = tn;
                }
            }
        }

        // Validar garantías matemáticas de supervivencia
        if (totalNearbyThreatForce > 0) {
            // A) Si la amenaza acumulada supera brutalmente el remanente, prohibir de cuajo.
            if (totalNearbyThreatForce > remainingAfterEvo * 1.5) return false;

            // B) Si la amenaza está muy cerca, simular si aguantaríamos toda su furia concentrada.
            if (nearestThreatNode && nearestThreatDistSq < (avgD * 1.8) * (avgD * 1.8)) {
                // Temporalmente reducir las tropas del nodo para la simulación
                const origCount = sourceNode.counts ? (sourceNode.counts[aiFaction] || 0) : 0;
                if (sourceNode.counts) sourceNode.counts[aiFaction] = remainingAfterEvo;

                const simCode = engine._simulator.evaluateAttack(
                    world, nearestThreatNode, sourceNode, totalNearbyThreatForce,
                    nearestThreatNode.owner, null, engine._rearguardSimResult
                );

                if (sourceNode.counts) sourceNode.counts[aiFaction] = origCount;

                // Si con el remanente no sacamos una Victoria Segura (o al menos logramos resistir contundentemente), vetar.
                // Para defensas estáticas, un EMPATE_ESTANCADO significa que nos destrozan o capturan a la larga.
                if (simCode >= RESULT_EMPATE_ESTANCADO) return false;
            }
        }

        writeCommand(engine, sourceIndex, sourceIndex, bestEvoAction, 0, 0, bestEvoScore);
        // Capa 2.1: Marcar nodo como evolucionando → no atacar este ciclo
        engine._evolversUsed |= (1 << sourceIndex);
        
        return true;
    }
    
    return false;
}

export function getRequiredPostCaptureGarrison(engine, routeResult, targetNode, needsDump) {
    if (needsDump && (!routeResult || routeResult.projectedCasualties <= 0)) return 0;

    let garrison = engine._strategyMinPostCaptureGarrison ?? 10; // BASE_CAPTURE_GARRISON fallback
    if (engine._currentPhase === PHASE_EARLY) garrison += 4;
    if (targetNode && targetNode.type === 'gigante') garrison += 4;

    if (routeResult && routeResult.projectedCasualties > 0) {
        const hazardBonus = engine._strategyHazardGarrisonBonus ?? 5; // HAZARD_GARRISON_BONUS fallback
        garrison += Math.min(12, Math.ceil(routeResult.projectedCasualties * 0.5));
        garrison += hazardBonus;
    }

    return garrison;
}

// ═══════════════════════════════════════════════════════════════
//  REINFORCEMENT EVALUATION (Capa 3.1)
// ═══════════════════════════════════════════════════════════════

export function evaluateReinforcement(engine, sourceNode, sourceIndex, ownCount, aiFaction, nodes, world) {
    const w = engine._weights;
    if (w[W_REINFORCE] < 0.01) return;
    
    // Fix: Bug 5 - Dynamic reinforcement threshold based on maxUnits
    const reinforceThreshold = Math.max(20, Math.floor((sourceNode.maxUnits || 200) * 0.20));
    if (ownCount < reinforceThreshold) return;

    const avgD = engine._avgNodeDistance;
    let bestIdx = -1;
    let bestScore = 0;

    for (let i = 0; i < engine._aiNodeCount; i++) {
        const allyWorldIdx = engine._aiNodeIndices[i];
        if (allyWorldIdx === sourceIndex) continue;

        const allyNode = nodes[allyWorldIdx];
        const allyCount = countAt(allyNode, aiFaction);

        // ── Validación de Bloqueo Absoluta (Alineado con el jugador) ──
        if (world && world.isPathBlocked && world.isPathBlocked(sourceNode, allyNode)) {
            continue;
        }

        // Solo reforzar aliados en necesidad
        if (allyCount > 25) continue;

        const dx = allyNode.x - sourceNode.x;
        const dy = allyNode.y - sourceNode.y;
        const distSq = dx * dx + dy * dy;
        if (distSq > (avgD * 1.5) * (avgD * 1.5)) continue; // muy lejos

        const dist = Math.sqrt(distSq);
        const deficit = 30 - allyCount; // cuánto le falta
        const excess  = ownCount - reinforceThreshold;   // cuánto nos sobra

        // ¿Aliado tiene nodo enemigo/player cerca? (bajo presión)
        let underPressure = 0;
        for (let t = 0; t < engine._targetNodeCount; t++) {
            const tn = nodes[engine._targetNodeIndices[t]];
            if (tn.owner === 'neutral') continue;
            const tdx = tn.x - allyNode.x;
            const tdy = tn.y - allyNode.y;
            if (tdx * tdx + tdy * tdy < avgD * avgD) {
                underPressure += countNonFaction(tn, aiFaction);
            }
        }

        const distMult = K_DIST / (K_DIST + dist / 75);
        let score = deficit * 20 * distMult * w[W_REINFORCE];
        if (underPressure > 10) score *= 1.5;
        if (allyNode.evolution) score *= 1.3; // proteger nodos evolucionados

        if (score > bestScore) {
            bestScore = score;
            bestIdx = allyWorldIdx;
        }
    }

    if (bestIdx >= 0 && bestScore > 200) {
        // Enviar ~30% del excedente
        const excess = Math.max(0, ownCount - reinforceThreshold);
        const toSend = Math.max(5, Math.floor(excess * 0.3));
        const light = Math.min(engine._idleLightByNode[sourceIndex] || 0, toSend);
        const heavy = Math.min(engine._idleHeavyByNode[sourceIndex] || 0, Math.max(0, toSend - light));
        if (light + heavy > 0) {
            writeCommand(engine, sourceIndex, bestIdx, ACTION_REINFORCE, light, heavy, bestScore);
        }
    }
}

// ═══════════════════════════════════════════════════════════════
//  ATTACK EVALUATION (Dual-Phase Pipeline)
// ═══════════════════════════════════════════════════════════════

export function evaluateAttacks(engine, sourceNode, sourceIndex, ownCount,
                 aiFaction, playerFaction, nodes, allUnits, world,
                 navSystem, navStateView, navScoreResult, navExecResult) {

    const w = engine._weights;
    const needsDump = ownCount >= (sourceNode.maxUnits || 200) - 10;

    if (ownCount < MIN_ATTACK_FORCE && !needsDump) return;
    if ((engine._attackersUsed >> sourceIndex) & 1) return;

    // ── PHASE 1: Filter + Heuristic Scoring ──────────────────
    engine._candCount = 0;
    engine._candScores[0] = -Infinity;
    engine._candScores[1] = -Infinity;
    engine._candScores[2] = -Infinity;

    const baseSpeed   = world.unitBaseSpeed || 75;
    
    // Fix: Bug 3 - Respect Easy mode culling limits (don't override if difficulty is easy)
    const isEasy = engine.difficulty === 'easy' || (w[W_ATTACK_INTERVAL] > 3.0); // Simple heuristic if difficulty string missing
    const maxReach = isEasy
        ? baseSpeed * w[W_SPATIAL_CULLING_MAX]
        : Math.max(baseSpeed * w[W_SPATIAL_CULLING_MAX], engine._avgNodeDistance * 3.0);
    const maxReachSq  = maxReach * maxReach;

    for (let t = 0; t < engine._targetNodeCount; t++) {
        const targetIdx = engine._targetNodeIndices[t];
        const target    = nodes[targetIdx];

        // ── Etapa 1: Spatial Culling ──
        const dx = target.x - sourceNode.x;
        const dy = target.y - sourceNode.y;
        const distSq = dx * dx + dy * dy;
        if (distSq > maxReachSq) continue;

        // ── Validación de Bloqueo Absoluta (Alineado con el jugador) ──
        if (world && world.isPathBlocked && world.isPathBlocked(sourceNode, target)) {
            continue;
        }

        // ── Etapa 2: Topological viability ──
        let routeResult = null;
        let firstHopIdx = targetIdx;
        if (navSystem && navSystem.store) {
            navSystem.populateGameStateView(world, ownCount, baseSpeed, navStateView);
            routeResult = navSystem.evaluatePath(
                sourceNode.navIndex, target.navIndex, navStateView, navScoreResult
            );
            if (routeResult && !routeResult.isViable) continue;
            if (routeResult && routeResult.queryHandle >= 0) {
                const hopIdx = navSystem.peekFirstHop(routeResult.queryHandle);
                if (hopIdx >= 0 && hopIdx < nodes.length) {
                    firstHopIdx = hopIdx;
                }
            }
        }

        // ── Etapa 3: Economy threshold ──
        const defenders = countNonFaction(target, aiFaction);
        if (!needsDump && ownCount < defenders * 0.5 && target.owner !== 'neutral') continue;

        // ── Etapa 3.5: Spacetime Veto (Evitar choque con olas) ──
        const dist = Math.sqrt(distSq);
        const t_travel = dist / baseSpeed;
        if (isRouteSwept(sourceNode, target, t_travel, world)) {
            continue; // Veto Absoluto: Morirían chocando con la ola
        }

        // ── Heuristic Utility Score U(a) ──
        const score = computeAttackUtility(
            engine, sourceNode, target, sourceIndex, targetIdx,
            ownCount, defenders, distSq, routeResult,
            aiFaction, playerFaction, nodes, allUnits, needsDump, world
        );

        if (score <= -Infinity) continue;

        // Insert into Top-K (K=3, insertion inline)
        insertCandidate(engine, targetIdx, score, routeResult, firstHopIdx);
    }

    if (engine._candCount === 0) return;

    // ── PHASE 2: Simulator Validation (Top-1 → Top-3) ───────
    const trustSim = w[W_SIMULATOR_TRUST];

    for (let k = 0; k < engine._candCount; k++) {
        const candIdx    = engine._candIndices[k];
        const candTarget = nodes[candIdx];
        const candRoute = getCandidateRoute(engine, k);
        const firstHopIdx = engine._candFirstHop[k] >= 0 ? engine._candFirstHop[k] : candIdx;
        const defenders = countNonFaction(candTarget, aiFaction);
        const minGarrison = getRequiredPostCaptureGarrison(engine, candRoute, candTarget, needsDump);
        const simBodies = estimateAttackBodies(
            engine, sourceNode, sourceIndex, ownCount, aiFaction, needsDump, world
        );

        if (!needsDump
            && simBodies < defenders + (candRoute ? candRoute.projectedCasualties : 0) + minGarrison) {
            continue;
        }

        // Low-trust archetype: skip simulation, attack blindly
        if (trustSim < 0.01) {
            if (writeAttackCmd(
                engine, sourceNode, sourceIndex, candIdx, ownCount,
                aiFaction, needsDump, world, candRoute, firstHopIdx
            )) {
                engine._attackersUsed |= (1 << sourceIndex);
                return;
            }
            continue;
        }

        // Invoke Pilar 2
        const simCode = engine._simulator.evaluateAttack(
            world, sourceNode, candTarget, simBodies,
            aiFaction, candRoute, engine._simResult
        );

        if (simCode >= RESULT_VICTORIA_PIRRICA) {
            // ── Módulo 0: Garrison de Retención ────────────────────
            const survivors = engine._simResult[SIM_RESULT_SURVIVOR_BODIES] || 0;
            if (survivors < minGarrison && !needsDump) {
                if (AITelemetry.active) {
                    telemetry.recordVeto(aiFaction, sourceIndex, candIdx, ACTION_ATTACK,
                        `garrison_too_low: survivors=${survivors} < min=${minGarrison}`, engine._currentPhase);
                }
                continue; // Vetar asalto: Ganamos pero no quedan tropas para retener el nodo.
            }

            // ── Módulo 1: Rearguard Reverse Sandbox ─────────────────
            const wRG = w[W_REARGUARD_CHECK];
            // Ignorar paranoia defensiva si estamos capturando un nodo neutral, ¡la expansión es prioritaria!
            if (wRG > 0.01 && !needsDump && candTarget.owner !== 'neutral') {
                const isVulnerable = checkRearguardVulnerability(
                    engine, sourceNode, aiFaction, playerFaction, world, nodes,
                    simBodies, navSystem, navStateView, navScoreResult
                );
                if (isVulnerable) {
                    if (AITelemetry.active) {
                        telemetry.recordVeto(aiFaction, sourceIndex, candIdx, ACTION_ATTACK,
                            'rearguard_vulnerable', engine._currentPhase);
                    }
                    continue; 
                }
            }

            // Victory confirmed, issue attack via Pilar 3
            if (writeAttackCmdResolved(
                engine, sourceNode, candTarget, sourceIndex, candIdx,
                ownCount, aiFaction, needsDump, world, candRoute,
                firstHopIdx, minGarrison
            )) {
                engine._attackersUsed |= (1 << sourceIndex);
                if (AITelemetry.active) {
                    telemetry.recordDecision(aiFaction, sourceIndex, candIdx, ACTION_ATTACK,
                        engine._candScores[k],
                        { base: 0, distance: 0, phase: 0, opportunity: 0, hazard: 0, memory: 0, defenders: 0 },
                        { estimated: simBodies, casualties: candRoute ? candRoute.projectedCasualties : 0, garrison: survivors, targetOwner: candTarget.owner, targetEvolution: candTarget.evolution || '' },
                        engine._currentPhase
                    );
                }
                return;
            }
        }
        // Defeat → try next candidate
    }

    // All candidates rejected
    if (needsDump && engine._candCount > 0) {
        // Forced dump to best heuristic candidate
        const dumpIdx = engine._candIndices[0];
        const dumpRoute = getCandidateRoute(engine, 0);
        const dumpFirstHop = engine._candFirstHop[0] >= 0 ? engine._candFirstHop[0] : dumpIdx;
        if (writeAttackCmd(
            engine, sourceNode, sourceIndex, dumpIdx, ownCount,
            aiFaction, true, world, dumpRoute, dumpFirstHop
        )) {
            engine._attackersUsed |= (1 << sourceIndex);
        }
    }
}

// ═══════════════════════════════════════════════════════════════
//  UTILITY FUNCTION U(a)
// ═══════════════════════════════════════════════════════════════

export function computeAttackUtility(engine, sourceNode, target, sourceIndex, targetIndex,
                      ownCount, defenders, distSq, routeResult,
                      aiFaction, playerFaction, nodes, allUnits, needsDump, world) {
    const w = engine._weights;
    const phase = engine._currentPhase;
    const estimatedSend = estimateAttackBodies(
        engine, sourceNode, sourceIndex, ownCount, aiFaction, needsDump, world
    );
    const requiredGarrison = getRequiredPostCaptureGarrison(engine, routeResult, target, needsDump);

    // ── HAZARD HARD-VETO (Módulo 2) ──────────────────────────
    if (routeResult && routeResult.projectedCasualties > 0 && w[W_HAZARD_AVOIDANCE] > 0.01) {
        const fatalityRatio = engine._strategyHazardFatalityRatio ?? HAZARD_FATALITY_RATIO;
        if (routeResult.projectedCasualties >= estimatedSend * fatalityRatio) {
            if (AITelemetry.active) {
                telemetry.recordVeto(aiFaction, sourceIndex, targetIndex, ACTION_ATTACK,
                    `hazard_casualty_veto: ${routeResult.projectedCasualties}/${estimatedSend} >= ${(fatalityRatio*100).toFixed(0)}%`, engine._currentPhase);
            }
            return -Infinity;
        }
        if (estimatedSend < defenders + routeResult.projectedCasualties + requiredGarrison) {
            if (AITelemetry.active) {
                telemetry.recordVeto(aiFaction, sourceIndex, targetIndex, ACTION_ATTACK,
                    `hazard_economy_veto: send=${estimatedSend} < def=${defenders}+cas=${routeResult.projectedCasualties}+gar=${requiredGarrison}`, engine._currentPhase);
            }
            return -Infinity;
        }
    }

    if (!needsDump && estimatedSend < defenders + requiredGarrison) {
        return -Infinity;
    }

    // ── Base Value ───────────────────────────────────────────
    let base;
    let phaseCol; // column for phase table

    // Módulo 2: Sesgo Geográfico Seguro (Water Sweep Wake Bias)
    let geoBonusMultiplier = 0;
    if (world && world.waterSweeps && world.waterSweeps.length > 0) {
        const ws = world.waterSweeps[0];
        const dx = ws.dirX !== undefined ? ws.dirX : 1;
        const dy = ws.dirY !== undefined ? ws.dirY : 0;
        const D_node = target.x * dx + target.y * dy;
        geoBonusMultiplier = Math.max(0, (2000 - D_node) / 2000) * 0.70; 
    }

    if (target.owner === 'neutral') {
        base = (1000 + (target.productionRate || 1) * 200) * w[W_ATTACK_NEUTRAL];
        phaseCol = 0;
    } else if (target.owner === playerFaction) {
        base = 1500 * w[W_ATTACK_PLAYER];
        // Evitar el bonus de "remate" al inicio del juego.
        // Solo aplica si la IA tiene una ventaja clara en cantidad de bases.
        if (engine._aiNodeCount > 2) {
            if (engine._playerNodeCount <= 1) base += 3000;
            if (engine._playerNodeCount <= 2) base += 1400;
        }
        phaseCol = 1;
    } else {
        base = 800 * w[W_ATTACK_NEUTRAL];
        phaseCol = 0;
    }

    base += base * geoBonusMultiplier;

    // ── Multiplier: Opportunity (Pilar 4) ────────────────────
    let oppMult = 1.0;
    if (engine._oppAnalyzer && w[W_PILAR4_URGENCY] > 0.001) {
        const urgency = engine._oppAnalyzer.getNodeUrgency(targetIndex);
        if (urgency > 0) {
            oppMult = 1.0 + urgency * w[W_PILAR4_URGENCY];
        }
    }

    // ── Multiplier: Distance (hyperbolic decay) ──────────────
    let transitTime;
    if (routeResult) {
        transitTime = routeResult.projectedTransitTime;
    } else {
        transitTime = Math.sqrt(distSq) / Math.max(1, 75);
    }
    const distMult = K_DIST / (K_DIST + transitTime);

    // ── Multiplier: Phase ────────────────────────────────────
    const phaseMult = phaseMultipliers[phase * 4 + phaseCol];

    // ── Multiplier: Node Type ────────────────────────────────
    let typeMult = 1.0;
    if (target.type === 'enjambre')  typeMult = 1.3;
    else if (target.type === 'gigante') typeMult = 1.15;
    else if (target.type === 'tunel')   return -Infinity;

    // ── Multiplier: Diplomacy (Fase 3) ────────────────────────
    let diplomacyMult = 1.0;
    if (engine._resolvedProfile) {
        diplomacyMult = getDiplomacyScoreMult(engine._resolvedProfile, target.owner, aiFaction, playerFaction);
    }

    // ── Cumulative Score ─────────────────────────────────────
    let score = base * oppMult * distMult * phaseMult * typeMult * diplomacyMult;

    // ── Capa Estratégica Inyectada (AI Directives) ──
    const directiveFocus = engine._strategyFocus;
    const directiveAggroMult = engine._strategyAggressionMult;

    if (directiveFocus === 'turtle') {
        if (target.owner === 'neutral') score *= 0.4;
        if (target.owner === playerFaction) score *= 0.6;
    } else if (directiveFocus === 'rush') {
        if (target.owner === playerFaction) score *= 2.0;
        if (target.owner === 'neutral') score *= 0.5;
    } else if (directiveFocus === 'expansion') {
        if (target.owner === 'neutral') score *= 2.5;
        if (target.owner === playerFaction) score *= 0.5;
    }

    if (directiveAggroMult !== null && directiveAggroMult !== undefined) {
         score *= directiveAggroMult;
    }

    if (engine._activeMemory) {
        score -= engine._activeMemory.scoreTarget(
            sourceIndex,
            targetIndex,
            engine._simTime,
            engine._strategyAntiPendulum
        );
    }

    // ── Cost: Route (Pilar 1) ────────────────────────────────
    if (routeResult) {
        score -= routeResult.projectedCasualties * 16;
        score -= routeResult.suggestedDelay * 110;
        const directTime = Math.sqrt(distSq) / 75;
        score -= Math.max(0, transitTime - directTime) * 22;
    }

    // ── Cost: Defenders ──────────────────────────────────────
    score -= defenders * 2.8;

    // ── Evolution bonuses/penalties on target ─────────────────
    if (target.owner !== aiFaction && target.evolution) {
        if (target.evolution === 'artilleria') score += 380;
        else if (target.evolution === 'espinoso') {
            score -= (ownCount > defenders * 2) ? 60 : 180;
        }
        else if (target.evolution === 'tanque') score += 90;
    }

    // ── Neutral economy: low-defender bonus, ROI, denial ─────
    if (target.owner === 'neutral') {
        if (defenders < 8) score += 1000;
        if (phase === PHASE_EARLY) {
            const cost = defenders + transitTime * 0.5;
            const roi = ((target.productionRate || 1) * 100) / Math.max(1, cost);
            score += roi * 50 * w[W_ECONOMY_PRIORITY];
        }
        // Resource denial
        if (w[W_ECONOMY_PRIORITY] > 0.5) {
            let closestPlayerDist = Infinity;
            for (let p = 0; p < engine._playerNodeCount; p++) {
                const pn = nodes[engine._playerNodeIndices[p]];
                const pdx = target.x - pn.x;
                const pdy = target.y - pn.y;
                const pd = Math.sqrt(pdx * pdx + pdy * pdy);
                if (pd < closestPlayerDist) closestPlayerDist = pd;
            }
            const myDist = Math.sqrt(distSq);
            if (myDist > closestPlayerDist) score += 900;
        }
    }

    // ── Sniping: weak player node ────────────────────────────
    if (target.owner === playerFaction && defenders < 10) {
        score += 3000 * w[W_AGGRESSION];
    }

    // ── Back-capping bonus (master-tier) ─────────────────────
    if (w[W_BACK_CAP_BONUS] > 0.01 && target.owner === playerFaction) {
        let emigrants = 0;
        for (let i = 0; i < allUnits.length; i++) {
            const u = allUnits[i];
            if (u.faction === playerFaction && u.state === 'traveling' && u.homeNode === target) {
                emigrants++;
            }
        }
        if (emigrants > 30) score += 6000 * w[W_BACK_CAP_BONUS];
        else if (emigrants > 15) score += 2000 * w[W_BACK_CAP_BONUS];
    }

    // ── Flanking bonus (Capa 4.1: normalizado a distancia media) ──
    if (w[W_FLANK_BONUS] > 0.01 && target.owner === playerFaction) {
        let adjacentAI = 0;
        const flankRangeSq = (engine._avgNodeDistance * 1.0) * (engine._avgNodeDistance * 1.0);
        for (let a = 0; a < engine._aiNodeCount; a++) {
            const an = nodes[engine._aiNodeIndices[a]];
            const adx = an.x - target.x;
            const ady = an.y - target.y;
            if (adx * adx + ady * ady < flankRangeSq) adjacentAI++;
        }
        if (adjacentAI >= 2) score += 1500 * adjacentAI * w[W_FLANK_BONUS];
    }

    // ── Hazard awareness ─────────────────────────────────────
    if (w[W_HAZARD_AVOIDANCE] > 0.01 && target.isMarkedForSweep) {
        score -= 2000 * w[W_HAZARD_AVOIDANCE];
    }

    // ── Capa 5.2: Timing awareness real (water sweep post-pass) ──
    if (w[W_TIMING_AWARENESS] > 0.01 && world && world.waterSweeps && world.waterSweeps.length > 0) {
        const ws = world.waterSweeps[0];
        const dx_sw = ws.dirX !== undefined ? ws.dirX : 1;
        const dy_sw = ws.dirY !== undefined ? ws.dirY : 0;
        const targetProj = target.x * dx_sw + target.y * dy_sw;

        let sweepJustPassed = false;
        let sweepIncoming = false;
        for (const bar of (ws._activeBars || [])) {
            const barProj = bar.worldX ?? bar.scalar;
            if (barProj == null) continue;
            if (barProj > targetProj && barProj < targetProj + 250) {
                sweepJustPassed = true; // barra acaba de pasar el nodo
            }
            if (barProj < targetProj && targetProj - barProj < 400) {
                sweepIncoming = true; // barra viene hacia el nodo
            }
        }
        if (sweepJustPassed) score += 800 * w[W_TIMING_AWARENESS];
        if (sweepIncoming)   score -= 500 * w[W_TIMING_AWARENESS];
    }

    return score;
}
