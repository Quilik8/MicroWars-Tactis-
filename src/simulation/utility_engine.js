/**
 * UtilityEngine — Pilar 5: Motor de Utilidad Dinámico y Orquestador de Decisiones
 *
 * ARQUITECTURA:
 *   1. Espacio de acciones estático (enums enteros, cero objetos).
 *   2. Function U(a) = Base × M_opp × M_dist × M_phase × M_type - C_route - C_def
 *   3. Filtro de 3 etapas: Spatial Culling → Viabilidad → Economía.
 *   4. Doble fase: Heurística barata (Top-3) → Simulación pesada (Top-1).
 *   5. Time-slicing: 3 nodos AI por tick (Round-Robin con boost de prioridad).
 *   6. Command Buffer plano (Float32Array, 0 allocations).
 *   7. Archetype Weight Vectors: toda la personalidad de la IA en un Float32Array.
 *
 * ZERO-ALLOCATION: No instancia objetos, Maps, Sets ni Arrays en el hot path.
 *                   Usa Typed Arrays pre-asignados exclusivamente.
 *
 * INTEGRACIÓN:
 *   - Pilar 1 (NavigationSystem): evaluatePath() para costos de ruta.
 *   - Pilar 2 (PredictiveCombatSimulator): evaluateAttack() para validación.
 *   - Pilar 3 (OptimalDeploymentSolver): calculateOptimalDeployment() para tropas.
 *   - Pilar 4 (OpportunityAnalyzer): getNodeUrgency() para oportunidades.
 */

import { PredictiveCombatSimulator } from './predictive_combat_simulator.js';
import {
    OptimalDeploymentSolver,
    SUCCESS_VICTORIA,
    SUCCESS_SEGURA,
    OUT_RECOMMENDED_LIGHT,
    OUT_RECOMMENDED_HEAVY,
    OUT_IS_VALID,
} from './optimal_deployment_solver.js';
import {
    RESULT_DERROTA,
    RESULT_EMPATE_ESTANCADO,
    RESULT_VICTORIA_PIRRICA,
    RESULT_VICTORIA_SEGURA,
    UNIT_POWER_HEAVY,
    getEvolutionCode,
    EVOLUTION_NONE,
    EVOLUTION_ESPINOSO,
    EVOLUTION_ARTILLERIA,
    EVOLUTION_TANQUE,
} from './deterministic_rules.js';

// ═══════════════════════════════════════════════════════════════════
//  ACTION SPACE (enumeradores enteros)
// ═══════════════════════════════════════════════════════════════════
export const ACTION_ATTACK       = 0;
export const ACTION_REINFORCE    = 1;
export const ACTION_EVOLVE_TANK  = 2;
export const ACTION_EVOLVE_THORN = 3;
export const ACTION_EVOLVE_ART   = 4;
export const ACTION_TUNNEL       = 5;
export const ACTION_RETREAT      = 6;
export const ACTION_WAIT         = 7;

// ═══════════════════════════════════════════════════════════════════
//  WEIGHT VECTOR INDICES
// ═══════════════════════════════════════════════════════════════════
const W_ATTACK_NEUTRAL       = 0;
const W_ATTACK_PLAYER        = 1;
const W_EVOLVE_TANK          = 2;
const W_EVOLVE_THORN         = 3;
const W_EVOLVE_ART           = 4;
const W_REINFORCE            = 5;
const W_TUNNEL               = 6;
const W_WAIT                 = 7;
const W_PILAR4_URGENCY       = 8;
const W_SIMULATOR_TRUST      = 9;
const W_AGGRESSION           = 10;
const W_ECONOMY_PRIORITY     = 11;
const W_COUNTER_EVOLUTION    = 12;
const W_MULTI_PRONG          = 13;
const W_HAZARD_AVOIDANCE     = 14;
const W_MIN_EVOLUTION_COUNT  = 15;
const W_SEND_RATIO           = 16;
const W_DUMP_RATIO           = 17;
const W_EVOLUTION_CHANCE     = 18;
const W_ATTACK_INTERVAL      = 19;
const W_SPATIAL_CULLING_MAX  = 20;
const W_BACK_CAP_BONUS       = 21;
const W_FLANK_BONUS          = 22;
const W_TIMING_AWARENESS     = 23;
const W_REARGUARD_CHECK      = 24;
const W_DOOMSDAY_AWARENESS   = 25;
const W_EVOLUTION_INTERVAL   = 26;  // Capa 1.2: intervalo independiente para evoluciones
export const WEIGHT_VECTOR_SIZE = 27;

// ═══════════════════════════════════════════════════════════════════
//  ARCHETYPE WEIGHT MATRICES
//  Cada fila es un Float32Array de WEIGHT_VECTOR_SIZE floats.
//  Índice:  0:easy  1:normal  2:hard
// ═══════════════════════════════════════════════════════════════════
const ARCHETYPE_COUNT = 3;
const _archetypeStore = new Float32Array(WEIGHT_VECTOR_SIZE * ARCHETYPE_COUNT);

//                     AtkN  AtkP  EvoT  EvoTh EvoAr Reinf Tunnel Wait
//                     P4Urg SimTr Aggr  Econ  CtrEv MPrng Hzrd  MinEv
//                     SndR  DmpR  EvoC  AtkI  CullT BCap  Flank Timing
//                     RGrd  Doom  EvoI
// ── EASY ──  (Doctrina: acumula, refuerza, ataca poco, evoluciona lento)
_archetypeStore.set([
    1.0,  1.0,  0.8,  0.7,  0.7,  1.2,  0.7,  0.8,
    0.0,  0.7,  0.50, 0.8,  0.3,  1,    0.3,  60,
    0.45, 0.82, 0.75, 5.0,  10.0, 0.0,  0.0,  0.0,
    0.0,  0.0,  6.0
], 0);

// ── NORMAL ──  (Doctrina: equilibrado, refuerzo suave, oportunismo parcial)
_archetypeStore.set([
    0.9,  1.2,  1.0,  0.9,  1.0,  0.9,  0.8,  0.3,
    0.3,  1.0,  0.75, 0.9,  0.7,  2,    0.7,  30,
    0.90, 0.88, 0.90, 1.5,  8.0,  0.3,  0.5,  0.5,
    0.7,  0.8,  3.0
], WEIGHT_VECTOR_SIZE);

// ── HARD ──  (Doctrina: inteligente y agresivo, doctrina completa)
_archetypeStore.set([
    0.8,  1.5,  1.2,  1.0,  1.1,  0.6,  0.9,  0.1,
    0.5,  1.0,  0.90, 1.0,  1.0,  3,    1.0,  20,
    0.75, 0.95, 1.00, 0.5,  6.0,  1.0,  1.0,  1.0,
    1.0,  1.0,  1.5
], WEIGHT_VECTOR_SIZE * 2);

const _difficultyToIndex = { easy: 0, normal: 1, hard: 2 };

// ═══════════════════════════════════════════════════════════════════
//  COMMAND BUFFER LAYOUT
// ═══════════════════════════════════════════════════════════════════
const CMD_SOURCE   = 0;
const CMD_TARGET   = 1;
const CMD_ACTION   = 2;
const CMD_LIGHT    = 3;
const CMD_HEAVY    = 4;
const CMD_PRIORITY = 5;
const CMD_FIRST_HOP = 6;
const CMD_STRIDE   = 7;
const CMD_MAX      = 32;

// ═══════════════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════════════
const K_DIST               = 8.0;   // half-life distance (seconds)
const NODES_PER_TICK       = 3;     // time-slice budget
const MAX_NODES            = 32;
const TOP_K                = 3;     // candidates to keep per source
const STAGNATION_REF       = 15.0;  // seconds before stagnation bonus kicks
const EVO_COSTS            = { espinoso: 30, artilleria: 40, tanque: 50 };
const MIN_ATTACK_FORCE     = 15;
const BASE_CAPTURE_GARRISON = 20;
const HAZARD_GARRISON_BONUS = 8;
const HAZARD_FATALITY_RATIO = 0.35;

// ── Módulo 1: Rearguard Reverse Sandbox ─────────────────────────
const REARGUARD_PENALTY    = 0.01;  // Utility multiplier when rearguard is vulnerable

// ── Módulo 3: Doomsday Panic ────────────────────────────────────
const DOOMSDAY_HORIZON     = 15.0;  // seconds — if TTI < this, panic mode activates

// Phase multiplier tables (indexed: 0=ATTACK_NEUTRAL, 1=ATTACK_PLAYER, 2=EVOLVE, 3=REINFORCE)
// Phases: 0=early, 1=mid, 2=late
const _phaseMultipliers = new Float32Array([
    // early
    1.5, 0.3, 0.6, 1.0,
    // mid
    0.8, 1.0, 1.2, 1.0,
    // late
    0.4, 1.8, 0.9, 1.3,
]);
const PHASE_EARLY = 0;
const PHASE_MID   = 1;
const PHASE_LATE  = 2;


// ═══════════════════════════════════════════════════════════════════
//  UTILITY ENGINE CLASS
// ═══════════════════════════════════════════════════════════════════
export class UtilityEngine {
    /**
     * @param {PredictiveCombatSimulator} simulator — Pilar 2 (shared)
     * @param {OptimalDeploymentSolver}   solver    — Pilar 3 (shared)
     * @param {object|null}               opportunityAnalyzer — Pilar 4
     */
    constructor(simulator, solver, opportunityAnalyzer) {
        this._simulator = simulator;
        this._solver    = solver;
        this._oppAnalyzer = opportunityAnalyzer;

        // ── Archetype weights (active) ──────────────────────────
        this._weights = new Float32Array(WEIGHT_VECTOR_SIZE);

        // ── Time-slicing queue ──────────────────────────────────
        this._evalQueue   = new Uint8Array(MAX_NODES);
        this._evalHead    = 0;
        this._evalCount   = 0;
        // Capa 1.1: _evalTimer y _simTime ya NO viven aquí.
        //           Se pasan externamente por AIManager per-facción.

        // ── Command buffer ──────────────────────────────────────
        this._cmdBuffer   = new Float32Array(CMD_MAX * CMD_STRIDE);
        this._cmdCount    = 0;

        // ── Top-K candidate scratch ─────────────────────────────
        this._candIndices = new Uint8Array(TOP_K);
        this._candScores  = new Float32Array(TOP_K);
        this._candCount   = 0;
        this._candHasRoute = new Uint8Array(TOP_K);
        this._candTransitTimes = new Float32Array(TOP_K);
        this._candCasualties = new Float32Array(TOP_K);
        this._candDelays = new Float32Array(TOP_K);
        this._candFirstHop = new Int16Array(TOP_K);
        this._candRouteResult = {
            isViable: true,
            projectedTransitTime: 0,
            projectedCasualties: 0,
            suggestedDelay: 0,
            queryHandle: -1,
        };

        // ── Evolution scoring scratch ───────────────────────────
        this._evoScores   = new Float32Array(4); // none, thorn, art, tank

        // ── Per-node idle unit index (pre-built once per cycle) ─
        this._idleCountByNode = new Uint16Array(MAX_NODES);
        this._idleLightByNode = new Uint16Array(MAX_NODES);
        this._idleHeavyByNode = new Uint16Array(MAX_NODES);

        // ── Simulation scratch (shared with solver) ─────────────
        this._simResult       = new Float32Array(PredictiveCombatSimulator.RESULT_SIZE);
        this._deployResult    = new Float32Array(OptimalDeploymentSolver.RESULT_BUFFER_SIZE);

        // ── Stagnation tracking ─────────────────────────────────
        // Capa 1.1: estos se reciben externamente per-facción
        this._lastCaptureTime = 0;
        this._simTime         = 0;

        // ── Node classification scratch ─────────────────────────
        this._aiNodeIndices     = new Uint8Array(MAX_NODES);
        this._targetNodeIndices = new Uint8Array(MAX_NODES);
        this._playerNodeIndices = new Uint8Array(MAX_NODES);
        this._aiNodeCount       = 0;
        this._targetNodeCount   = 0;
        this._playerNodeCount   = 0;

        // ── Attackers-used bitfield (max 32 nodes) ──────────────
        this._attackersUsed = 0;

        // ── Capa 2.1: Evolvers-used bitfield (mutex evolve/attack) ──
        this._evolversUsed = 0;

        // ── Phase cache ─────────────────────────────────────────
        this._currentPhase = PHASE_MID;

        // ── Capa 4.1: Average node distance (resolution-independent thresholds) ──
        this._avgNodeDistance = 300; // default, recalculated each cycle

        // ── Rearguard Reverse Sandbox scratch (Módulo 1) ────────
        // Reuses this._simResult for the reverse sim output.
        // These track nearest player threat per AI node.
        this._rearguardSimResult = new Float32Array(PredictiveCombatSimulator.RESULT_SIZE);

        // ── Doomsday Panic state (Módulo 3) ─────────────────────
        // Per-node TTI (Time-To-Intercept) from environmental threats.
        // -1 = no threat. Pre-allocated, written each eval cycle.
        this._doomsdayTTI = new Float32Array(MAX_NODES);
        this._neutralizeTTI = new Float32Array(MAX_NODES);
        this._doomsdayActive = false;

        this._strategyFocus = null;
        this._strategyPrefEvo = null;
        this._strategyMinEvolutionGarrison = null;
        this._strategyAggressionMult = null;
        this._strategyMinPostCaptureGarrison = null;
        this._strategyHazardGarrisonBonus = null;
        this._strategyHazardFatalityRatio = null;
    }

    // ═══════════════════════════════════════════════════════════════
    //  PUBLIC API
    // ═══════════════════════════════════════════════════════════════

    /**
     * Set the active archetype from difficulty string.
     * @param {string} difficulty — 'easy'|'normal'|'hard'
     */
    setArchetype(difficulty) {
        this.difficulty = difficulty || 'normal';
        const idx = _difficultyToIndex[this.difficulty] || 0;
        const offset = idx * WEIGHT_VECTOR_SIZE;
        this._weights.set(
            _archetypeStore.subarray(offset, offset + WEIGHT_VECTOR_SIZE)
        );
    }

    /** Read a weight value by index. */
    getWeight(index) {
        return this._weights[index];
    }

    /** Reset for new level. */
    reset() {
        this._evalHead    = 0;
        this._evalCount   = 0;
        this._cmdCount    = 0;
        this._lastCaptureTime = 0;
        this._simTime     = 0;
        this._attackersUsed = 0;
        this._evolversUsed  = 0;
        this._avgNodeDistance = 300;
    }

    /**
     * Main evaluation tick. Called from AIManager.update() after
     * Pilar 4 has been updated and the FutureLedger rebuilt.
     *
     * Capa 1.1: evalTimer, evoTimer y simTime se reciben/retornan externamente
     * para evitar acumulación al llamar N facciones por frame.
     *
     * @param {number}  dt
     * @param {object}  world        — WorldManager
     * @param {object[]} nodes       — world.nodes
     * @param {object[]} allUnits    — world.allUnits
     * @param {string}  aiFaction
     * @param {string}  playerFaction
     * @param {object}  navSystem    — world.navigation
     * @param {object}  navStateView — pre-allocated NavigationGameStateView
     * @param {object}  navScoreResult — pre-allocated PathEvaluationResult
     * @param {object}  navExecResult  — pre-allocated PathEvaluationResult
     * @param {object}  timers       — { evalTimer, evoTimer, simTime, lastCaptureTime } per-faction
     * @returns {number} number of commands written
     */
    evaluate(dt, world, nodes, allUnits, aiFaction, playerFaction,
             navSystem, navStateView, navScoreResult, navExecResult, timers) {

        // ── Capa 1.1: Timers per-facción (no se acumulan entre facciones) ──
        if (timers) {
            this._simTime         = timers.simTime + dt;
            this._lastCaptureTime = timers.lastCaptureTime;
            timers.simTime        = this._simTime;
            timers.evalTimer     += dt;
            timers.evoTimer      += dt;
        }

        const evalTimer = timers ? timers.evalTimer : dt;
        const interval  = this._weights[W_ATTACK_INTERVAL];
        if (evalTimer < interval) return 0;
        if (timers) timers.evalTimer -= interval;

        // ── 1. Classify nodes ────────────────────────────────────
        this._classifyNodes(nodes, aiFaction, playerFaction);
        if (this._aiNodeCount === 0) return 0;

        // ── 2. Detect game phase ─────────────────────────────────
        this._currentPhase = this._detectPhase(nodes);

        // ── 3. Track stagnation (via Pilar 4 flags) ──────────────
        this._updateStagnation(world, timers);
        this._resolveAIStrategy(world);

        // ── 4. Build idle unit index ─────────────────────────────
        this._buildIdleIndex(allUnits, aiFaction);

        // ── 5. Rebuild eval queue ────────────────────────────────
        this._rebuildEvalQueue(world);

        // ── 6. Clear command buffer ──────────────────────────────
        this._cmdCount = 0;
        this._attackersUsed = 0;
        this._evolversUsed  = 0;  // Capa 2.1: reset mutex

        // ── Capa 1.2: Determinar si evolución está habilitada este tick ──
        const evoInterval = this._weights[W_EVOLUTION_INTERVAL];
        const evoTimer    = timers ? timers.evoTimer : 0;
        const evoAllowed  = evoTimer >= evoInterval;
        if (evoAllowed && timers) timers.evoTimer -= evoInterval;

        // ── 6.5. Doomsday Scan (Módulo 3) ────────────────────────
        this._scanDoomsdayThreats(nodes, aiFaction, world);

        // ── 7. Time-sliced evaluation ────────────────────────────
        const budget = Math.min(NODES_PER_TICK, this._evalCount);

        for (let b = 0; b < budget; b++) {
            if (this._evalHead >= this._evalCount) {
                this._evalHead = 0;
            }
            const sourceWorldIdx = this._evalQueue[this._evalHead++];
            if (sourceWorldIdx >= nodes.length) continue;

            const sourceNode = nodes[sourceWorldIdx];
            const ownCount = _countAt(sourceNode, aiFaction);
            if (ownCount < 1) continue;

            // ── Módulo 3.a: Lethal Doomsday Panic Override (Water Sweep) ─
            const dTTI = this._doomsdayTTI[sourceWorldIdx];
            if (dTTI >= 0 && dTTI < DOOMSDAY_HORIZON) {
                this._executePanicEvacuation(
                    sourceNode, sourceWorldIdx, ownCount,
                    aiFaction, nodes, world
                );
                continue;
            }

            // ── Módulo 3.b: Brace for Impact (Light Sweep) ────────────────
            const nTTI = this._neutralizeTTI[sourceWorldIdx];
            if (nTTI >= 0 && nTTI < DOOMSDAY_HORIZON) {
                continue;
            }

            // A. Self-management: evolutions (Capa 1.2: gated por evoTimer)
            if (evoAllowed && (!world || world.allowEvolutions !== false)) {
                this._evaluateEvolution(
                    sourceNode, sourceWorldIdx, ownCount,
                    aiFaction, playerFaction, nodes, allUnits, world
                );
            }

            // Capa 2.1: Si este nodo decidió evolucionar, NO atacar
            if ((this._evolversUsed >> sourceWorldIdx) & 1) continue;

            // B. Attack scoring (dual-phase)
            this._evaluateAttacks(
                sourceNode, sourceWorldIdx, ownCount,
                aiFaction, playerFaction, nodes, allUnits, world,
                navSystem, navStateView, navScoreResult, navExecResult
            );

            // C. Capa 3.1: Refuerzo (solo si no atacó ni evolucionó)
            if (!((this._attackersUsed >> sourceWorldIdx) & 1)) {
                this._evaluateReinforcement(
                    sourceNode, sourceWorldIdx, ownCount,
                    aiFaction, nodes, world
                );
            }
        }

        return this._cmdCount;
    }

    /**
     * Execute all pending commands. Call AFTER evaluate().
     * Dispatches units from origin to target using pre-built idle index.
     *
     * @param {object[]} allUnits
     * @param {object[]} nodes
     * @param {string}   aiFaction
     * @param {object}   world
     * @param {object}   navExecResult
     */
    executeCommands(allUnits, nodes, aiFaction, world, navExecResult) {
        for (let c = 0; c < this._cmdCount; c++) {
            const base   = c * CMD_STRIDE;
            const srcIdx = this._cmdBuffer[base + CMD_SOURCE] | 0;
            const tgtIdx = this._cmdBuffer[base + CMD_TARGET] | 0;
            const action = this._cmdBuffer[base + CMD_ACTION] | 0;
            const light  = this._cmdBuffer[base + CMD_LIGHT]  | 0;
            const heavy  = this._cmdBuffer[base + CMD_HEAVY]  | 0;
            const firstHopIdx = this._cmdBuffer[base + CMD_FIRST_HOP] | 0;

            if (srcIdx >= nodes.length || tgtIdx >= nodes.length) continue;
            const srcNode = nodes[srcIdx];
            const tgtNode = nodes[tgtIdx];

            if (action === ACTION_ATTACK || action === ACTION_REINFORCE) {
                // Capa 3.1: REINFORCE usa el mismo dispatch que ATTACK (hacia nodo aliado)
                this._dispatchUnitsResolved(srcNode, tgtNode, light, heavy,
                                            allUnits, aiFaction, world, firstHopIdx);
            } else if (action === ACTION_EVOLVE_TANK) {
                this._buyEvolution(srcNode, 'tanque', EVO_COSTS.tanque, aiFaction, allUnits, world);
            } else if (action === ACTION_EVOLVE_THORN) {
                this._buyEvolution(srcNode, 'espinoso', EVO_COSTS.espinoso, aiFaction, allUnits, world);
            } else if (action === ACTION_EVOLVE_ART) {
                this._buyEvolution(srcNode, 'artilleria', EVO_COSTS.artilleria, aiFaction, allUnits, world);
            } else if (action === ACTION_TUNNEL) {
                srcNode.tunnelTo = tgtNode;
            }
            // ACTION_WAIT: no-op (no command emitted, handled implicitly)
        }
    }

    /** Number of pending commands. */
    getCommandCount() { return this._cmdCount; }

    /** Read a command from the buffer. */
    readCommand(index, out) {
        const base = index * CMD_STRIDE;
        out[0] = this._cmdBuffer[base + CMD_SOURCE];
        out[1] = this._cmdBuffer[base + CMD_TARGET];
        out[2] = this._cmdBuffer[base + CMD_ACTION];
        out[3] = this._cmdBuffer[base + CMD_LIGHT];
        out[4] = this._cmdBuffer[base + CMD_HEAVY];
        out[5] = this._cmdBuffer[base + CMD_PRIORITY];
        out[6] = this._cmdBuffer[base + CMD_FIRST_HOP];
    }

    // ═══════════════════════════════════════════════════════════════
    //  NODE CLASSIFICATION
    // ═══════════════════════════════════════════════════════════════

    _classifyNodes(nodes, aiFaction, playerFaction) {
        this._aiNodeCount     = 0;
        this._targetNodeCount = 0;
        this._playerNodeCount = 0;

        for (let i = 0; i < nodes.length && i < MAX_NODES; i++) {
            const n = nodes[i];
            if (n.owner === aiFaction) {
                this._aiNodeIndices[this._aiNodeCount++] = i;
            } else {
                this._targetNodeIndices[this._targetNodeCount++] = i;
            }
            if (n.owner === playerFaction) {
                this._playerNodeIndices[this._playerNodeCount++] = i;
            }
        }

        // ── Capa 4.1: Calcular distancia media entre nodos ────────
        if (nodes.length > 1) {
            let totalDist = 0;
            let pairCount = 0;
            const sampleLimit = Math.min(nodes.length, 16); // cap para performance
            for (let i = 0; i < sampleLimit; i++) {
                for (let j = i + 1; j < sampleLimit; j++) {
                    const dx = nodes[i].x - nodes[j].x;
                    const dy = nodes[i].y - nodes[j].y;
                    totalDist += Math.sqrt(dx * dx + dy * dy);
                    pairCount++;
                }
            }
            this._avgNodeDistance = pairCount > 0 ? (totalDist / pairCount) : 300;
        }
    }

    _detectPhase(nodes) {
        const total = nodes.length || 1;
        const aiRatio = this._aiNodeCount / total;
        const plRatio = this._playerNodeCount / total;
        if (aiRatio > 0.55) return PHASE_LATE;
        if (this._playerNodeCount <= 1) return PHASE_LATE;
        if (this._aiNodeCount <= 2) return PHASE_EARLY;
        return PHASE_MID;
    }

    // ═══════════════════════════════════════════════════════════════
    //  IDLE UNIT INDEX (built once per eval cycle)
    // ═══════════════════════════════════════════════════════════════

    _buildIdleIndex(allUnits, aiFaction) {
        this._idleCountByNode.fill(0, 0, MAX_NODES);
        this._idleLightByNode.fill(0, 0, MAX_NODES);
        this._idleHeavyByNode.fill(0, 0, MAX_NODES);

        for (let i = 0; i < allUnits.length; i++) {
            const u = allUnits[i];
            if (u.pendingRemoval || u.faction !== aiFaction || u.state !== 'idle' || !u.targetNode) continue;
            const idx = u.targetNode._predictiveIndex;
            if (idx == null || idx < 0 || idx >= MAX_NODES) continue;
            this._idleCountByNode[idx]++;
            if ((u.power || 1) > 1) this._idleHeavyByNode[idx]++;
            else this._idleLightByNode[idx]++;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  EVAL QUEUE: Round-Robin with Pilar 4 priority boost
    // ═══════════════════════════════════════════════════════════════

    _rebuildEvalQueue(world) {
        // Fill queue with AI node world indices
        this._evalCount = 0;
        for (let i = 0; i < this._aiNodeCount && this._evalCount < MAX_NODES; i++) {
            this._evalQueue[this._evalCount++] = this._aiNodeIndices[i];
        }

        // Priority boost: if Pilar 4 detects urgent opportunity on a node
        // adjacent to an AI node, move that AI node to front
        if (this._oppAnalyzer && this._evalCount > 1) {
            let bestBoostIdx = -1;
            let bestUrgency  = 0;
            for (let i = 0; i < this._evalCount; i++) {
                const nodeIdx = this._evalQueue[i];
                // Check urgency of nearby targets, not the AI node itself
                const urgency = this._oppAnalyzer.getNodeUrgency(nodeIdx);
                if (urgency > bestUrgency) {
                    bestUrgency = urgency;
                    bestBoostIdx = i;
                }
            }
            if (bestBoostIdx > 0) {
                // Swap to front
                const tmp = this._evalQueue[0];
                this._evalQueue[0] = this._evalQueue[bestBoostIdx];
                this._evalQueue[bestBoostIdx] = tmp;
            }
        }

        // Wrap head if we exceeded count on previous cycle
        if (this._evalHead >= this._evalCount) {
            this._evalHead = 0;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  STAGNATION TRACKING
    // ═══════════════════════════════════════════════════════════════

    _updateStagnation(world, timers) {
        if (!this._oppAnalyzer) return;
        // Check if any node changed owner recently (FLAG_OWNER_CHANGED = 0x04)
        for (let i = 0; i < Math.min(world.nodes.length, MAX_NODES); i++) {
            if (this._oppAnalyzer.getNodeFlags(i) & 0x04) {
                this._lastCaptureTime = this._simTime;
                if (timers) timers.lastCaptureTime = this._simTime;
                return;
            }
        }
    }

    _resolveAIStrategy(world) {
        this._strategyFocus = null;
        this._strategyPrefEvo = null;
        this._strategyMinEvolutionGarrison = null;
        this._strategyAggressionMult = null;
        this._strategyMinPostCaptureGarrison = null;
        this._strategyHazardGarrisonBonus = null;
        this._strategyHazardFatalityRatio = null;

        if (!world || !world.aiStrategy) return;

        const strategy = world.aiStrategy;
        this._strategyFocus = strategy.focus ?? null;
        this._strategyPrefEvo = strategy.preferredEvolution ?? null;
        this._strategyMinEvolutionGarrison = strategy.minEvolutionGarrison ?? null;
        this._strategyAggressionMult = strategy.aggressionMult ?? null;
        this._strategyMinPostCaptureGarrison = strategy.minPostCaptureGarrison ?? null;
        this._strategyHazardGarrisonBonus = strategy.hazardGarrisonBonus ?? null;
        this._strategyHazardFatalityRatio = strategy.hazardFatalityRatio ?? null;

        if (!strategy.difficultyOverrides || !strategy.difficultyOverrides[this.difficulty]) {
            return;
        }

        const diffOvr = strategy.difficultyOverrides[this.difficulty];
        if (diffOvr.focus !== undefined) this._strategyFocus = diffOvr.focus;
        if (diffOvr.preferredEvolution !== undefined) this._strategyPrefEvo = diffOvr.preferredEvolution;
        if (diffOvr.minEvolutionGarrison !== undefined) this._strategyMinEvolutionGarrison = diffOvr.minEvolutionGarrison;
        if (diffOvr.aggressionMult !== undefined) this._strategyAggressionMult = diffOvr.aggressionMult;
        if (diffOvr.minPostCaptureGarrison !== undefined) this._strategyMinPostCaptureGarrison = diffOvr.minPostCaptureGarrison;
        if (diffOvr.hazardGarrisonBonus !== undefined) this._strategyHazardGarrisonBonus = diffOvr.hazardGarrisonBonus;
        if (diffOvr.hazardFatalityRatio !== undefined) this._strategyHazardFatalityRatio = diffOvr.hazardFatalityRatio;
    }

    // ═══════════════════════════════════════════════════════════════
    //  EVOLUTION EVALUATION
    // ═══════════════════════════════════════════════════════════════

    _evaluateEvolution(sourceNode, sourceIndex, ownCount,
                       aiFaction, playerFaction, nodes, allUnits, world) {
        const w = this._weights;

        // Already evolved or evolving?
        if (sourceNode.evolution || sourceNode.pendingEvolution) return;
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
        const timeSinceCapture = this._simTime - this._lastCaptureTime;
        const stagnationMult = 1.0 + Math.min(2.0, timeSinceCapture / STAGNATION_REF);

        // ── Capa 4.1: Frontline via distancia normalizada ────────
        const avgD = this._avgNodeDistance;
        let minDistPlayer = Infinity;
        for (let i = 0; i < this._playerNodeCount; i++) {
            const pn = nodes[this._playerNodeIndices[i]];
            const dx = pn.x - sourceNode.x;
            const dy = pn.y - sourceNode.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < minDistPlayer) minDistPlayer = d;
        }
        const isFrontline = minDistPlayer < avgD * 1.2;

        // ── Capa 3.3: Doctrina — soporte (línea de fuego) ────────
        let nearbyEnemyNodes = 0;
        for (let i = 0; i < this._targetNodeCount; i++) {
            const tn = nodes[this._targetNodeIndices[i]];
            if (tn.owner === 'neutral') continue;
            const dx = tn.x - sourceNode.x;
            const dy = tn.y - sourceNode.y;
            if (dx * dx + dy * dy < (avgD * 1.5) * (avgD * 1.5)) nearbyEnemyNodes++;
        }
        const isSupportNode = nearbyEnemyNodes >= 2;

        // Player evolution census
        let playerEspinoso = 0, playerTanque = 0, playerArt = 0;
        for (let i = 0; i < this._playerNodeCount; i++) {
            const pn = nodes[this._playerNodeIndices[i]];
            if (pn.evolution === 'espinoso') playerEspinoso++;
            if (pn.evolution === 'tanque') playerTanque++;
            if (pn.evolution === 'artilleria') playerArt++;
        }

        // Map control
        const totalCtrl = this._aiNodeCount + this._playerNodeCount + 1;
        const mapControl = this._aiNodeCount / totalCtrl;

        // ── Capa Estratégica Inyectada (AI Directives) ──
        const directiveFocus = this._strategyFocus;
        const directivePrefEvo = this._strategyPrefEvo;
        const directiveMinGarrison = this._strategyMinEvolutionGarrison;
        
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
        if (this._playerNodeCount > this._aiNodeCount) scoreThorn *= 1.2;
        if (playerTanque > 1 && counterW > 0) scoreThorn *= (1.0 + 0.5 * counterW);
        if (ownCount < EVO_COSTS.espinoso) scoreThorn = -Infinity;

        // Artillery — Capa 3.3: soporte (cobertura + línea de fuego)
        let scoreArt = 750 * w[W_EVOLVE_ART] * stagnationMult * safetyMult;
        if (isSupportNode) scoreArt *= 1.6;
        else if (isFrontline) scoreArt *= 1.1;
        if (playerEspinoso > 1 && counterW > 0) scoreArt *= (1.0 + 0.5 * counterW);
        if (ownCount < EVO_COSTS.artilleria) scoreArt = -Infinity;

        const earlyExpansionTax = this._currentPhase === PHASE_EARLY
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
        if (this._currentPhase === PHASE_EARLY) {
            for (let t = 0; t < this._targetNodeCount; t++) {
                const tn = nodes[this._targetNodeIndices[t]];
                if (tn.owner !== 'neutral') continue;
                const defs = _countNonFaction(tn, aiFaction);
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
        const oppCost = bestNeutralScore * (this._currentPhase === PHASE_EARLY ? 1.1 : 0.6);

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
                if (this._currentPhase === PHASE_EARLY) {
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
            
            for (let i = 0; i < this._targetNodeCount; i++) {
                const tn = nodes[this._targetNodeIndices[i]];
                if (tn.owner === 'neutral') continue;
                const tForce = _countNonFaction(tn, aiFaction);
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

                    const simCode = this._simulator.evaluateAttack(
                        world, nearestThreatNode, sourceNode, totalNearbyThreatForce,
                        nearestThreatNode.owner, null, this._rearguardSimResult
                    );

                    if (sourceNode.counts) sourceNode.counts[aiFaction] = origCount;

                    // Si con el remanente no sacamos una Victoria Segura (o al menos logramos resistir contundentemente), vetar.
                    // Para defensas estáticas, un EMPATE_ESTANCADO significa que nos destrozan o capturan a la larga.
                    if (simCode >= RESULT_EMPATE_ESTANCADO) return false;
                }
            }

            this._writeCommand(sourceIndex, sourceIndex, bestEvoAction, 0, 0, bestEvoScore);
            // Capa 2.1: Marcar nodo como evolucionando → no atacar este ciclo
            this._evolversUsed |= (1 << sourceIndex);
            
            return true;
        }
        
        return false;
    }

    // ═══════════════════════════════════════════════════════════════
    //  REINFORCEMENT EVALUATION (Capa 3.1)
    // ═══════════════════════════════════════════════════════════════

    /**
     * Capa 3.1: Evalúa si este nodo debería enviar tropas a un aliado cercano
     * que esté débil o bajo presión. Solo se ejecuta si el nodo no atacó ni
     * evolucionó este ciclo (tercer escalón de prioridad).
     */
    _evaluateReinforcement(sourceNode, sourceIndex, ownCount, aiFaction, nodes, world) {
        const w = this._weights;
        if (w[W_REINFORCE] < 0.01) return;
        if (ownCount < 40) return; // necesita excedente para reforzar

        const avgD = this._avgNodeDistance;
        let bestIdx = -1;
        let bestScore = 0;

        for (let i = 0; i < this._aiNodeCount; i++) {
            const allyWorldIdx = this._aiNodeIndices[i];
            if (allyWorldIdx === sourceIndex) continue;

            const allyNode = nodes[allyWorldIdx];
            const allyCount = _countAt(allyNode, aiFaction);

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
            const excess  = ownCount - 40;   // cuánto nos sobra

            // ¿Aliado tiene nodo enemigo/player cerca? (bajo presión)
            let underPressure = 0;
            for (let t = 0; t < this._targetNodeCount; t++) {
                const tn = nodes[this._targetNodeIndices[t]];
                if (tn.owner === 'neutral') continue;
                const tdx = tn.x - allyNode.x;
                const tdy = tn.y - allyNode.y;
                if (tdx * tdx + tdy * tdy < avgD * avgD) {
                    underPressure += _countNonFaction(tn, aiFaction);
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
            const toSend = Math.max(5, Math.floor((ownCount - 40) * 0.3));
            const light = Math.min(this._idleLightByNode[sourceIndex] || 0, toSend);
            const heavy = Math.min(this._idleHeavyByNode[sourceIndex] || 0, Math.max(0, toSend - light));
            if (light + heavy > 0) {
                this._writeCommand(sourceIndex, bestIdx, ACTION_REINFORCE, light, heavy, bestScore);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  ATTACK EVALUATION (Dual-Phase Pipeline)
    // ═══════════════════════════════════════════════════════════════

    _evaluateAttacks(sourceNode, sourceIndex, ownCount,
                     aiFaction, playerFaction, nodes, allUnits, world,
                     navSystem, navStateView, navScoreResult, navExecResult) {

        const w = this._weights;
        const needsDump = ownCount >= (sourceNode.maxUnits || 200) - 10;

        if (ownCount < MIN_ATTACK_FORCE && !needsDump) return;
        if ((this._attackersUsed >> sourceIndex) & 1) return;

        // ── PHASE 1: Filter + Heuristic Scoring ──────────────────
        this._candCount = 0;
        this._candScores[0] = -Infinity;
        this._candScores[1] = -Infinity;
        this._candScores[2] = -Infinity;

        const baseSpeed   = world.unitBaseSpeed || 75;
        // Garantizar que la IA siempre vea al menos hasta 3 veces la distancia promedio, vital para mapas dispersos
        const maxReach    = Math.max(baseSpeed * w[W_SPATIAL_CULLING_MAX], this._avgNodeDistance * 3.0);
        const maxReachSq  = maxReach * maxReach;

        for (let t = 0; t < this._targetNodeCount; t++) {
            const targetIdx = this._targetNodeIndices[t];
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
            const defenders = _countNonFaction(target, aiFaction);
            if (!needsDump && ownCount < defenders * 0.5 && target.owner !== 'neutral') continue;

            // ── Etapa 3.5: Spacetime Veto (Evitar choque con olas) ──
            const dist = Math.sqrt(distSq);
            const t_travel = dist / baseSpeed;
            if (this._isRouteSwept(sourceNode, target, t_travel, world)) {
                continue; // Veto Absoluto: Morirían chocando con la ola
            }

            // ── Heuristic Utility Score U(a) ──
            const score = this._computeAttackUtility(
                sourceNode, target, sourceIndex, targetIdx,
                ownCount, defenders, distSq, routeResult,
                aiFaction, playerFaction, nodes, allUnits, needsDump, world
            );

            if (score <= -Infinity) continue;

            // Insert into Top-K (K=3, insertion inline)
            this._insertCandidate(targetIdx, score, routeResult, firstHopIdx);
        }

        if (this._candCount === 0) return;

        // ── PHASE 2: Simulator Validation (Top-1 → Top-3) ───────
        const trustSim = w[W_SIMULATOR_TRUST];

        for (let k = 0; k < this._candCount; k++) {
            const candIdx    = this._candIndices[k];
            const candTarget = nodes[candIdx];
            const candRoute = this._getCandidateRoute(k);
            const firstHopIdx = this._candFirstHop[k] >= 0 ? this._candFirstHop[k] : candIdx;
            const defenders = _countNonFaction(candTarget, aiFaction);
            const minGarrison = this._getRequiredPostCaptureGarrison(candRoute, candTarget, needsDump);
            const simBodies = this._estimateAttackBodies(
                sourceNode, sourceIndex, ownCount, aiFaction, needsDump, world
            );

            if (!needsDump
                && simBodies < defenders + (candRoute ? candRoute.projectedCasualties : 0) + minGarrison) {
                continue;
            }

            // Low-trust archetype: skip simulation, attack blindly
            if (trustSim < 0.01) {
                if (this._writeAttackCmd(
                    sourceNode, sourceIndex, candIdx, ownCount,
                    aiFaction, needsDump, world, candRoute, firstHopIdx
                )) {
                    this._attackersUsed |= (1 << sourceIndex);
                    return;
                }
                continue;
            }

            // Invoke Pilar 2
            const simCode = this._simulator.evaluateAttack(
                world, sourceNode, candTarget, simBodies,
                aiFaction, candRoute, this._simResult
            );

            if (simCode >= RESULT_VICTORIA_PIRRICA) {
                // ── Módulo 0: Garrison de Retención ────────────────────
                // El índice 1 de _simResult tiene la cantidad de supervivientes (RESULT_SURVIVORS_BODIES)
                const survivors = this._simResult[1] || 0;
                if (survivors < minGarrison && !needsDump) {
                    continue; // Vetar asalto: Ganamos pero no quedan tropas para retener el nodo.
                }

                // ── Módulo 1: Rearguard Reverse Sandbox ─────────────────
                const wRG = w[W_REARGUARD_CHECK];
                if (wRG > 0.01 && !needsDump) {
                    const isVulnerable = this._checkRearguardVulnerability(
                        sourceNode, aiFaction, playerFaction, world, nodes
                    );
                    if (isVulnerable) {
                        // Veto this attack to preserve base defense
                        continue; 
                    }
                }

                // Victory confirmed, issue attack via Pilar 3
                if (this._writeAttackCmdResolved(
                    sourceNode, candTarget, sourceIndex, candIdx,
                    ownCount, aiFaction, needsDump, world, candRoute,
                    firstHopIdx, minGarrison
                )) {
                    this._attackersUsed |= (1 << sourceIndex);
                    return;
                }
            }
            // Defeat → try next candidate
        }

        // All candidates rejected
        if (needsDump && this._candCount > 0) {
            // Forced dump to best heuristic candidate
            const dumpIdx = this._candIndices[0];
            const dumpRoute = this._getCandidateRoute(0);
            const dumpFirstHop = this._candFirstHop[0] >= 0 ? this._candFirstHop[0] : dumpIdx;
            if (this._writeAttackCmd(
                sourceNode, sourceIndex, dumpIdx, ownCount,
                aiFaction, true, world, dumpRoute, dumpFirstHop
            )) {
                this._attackersUsed |= (1 << sourceIndex);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  UTILITY FUNCTION U(a)
    // ═══════════════════════════════════════════════════════════════

    _computeAttackUtility(sourceNode, target, sourceIndex, targetIndex,
                          ownCount, defenders, distSq, routeResult,
                          aiFaction, playerFaction, nodes, allUnits, needsDump, world) {
        const w = this._weights;
        const phase = this._currentPhase;
        const estimatedSend = this._estimateAttackBodies(
            sourceNode, sourceIndex, ownCount, aiFaction, needsDump, world
        );
        const requiredGarrison = this._getRequiredPostCaptureGarrison(routeResult, target, needsDump);

        // ── HAZARD HARD-VETO (Módulo 2) ──────────────────────────
        // Prevent suicide through terrain hazards. If projected route 
        // casualties exceed the estimated sending forces, veto immediately.
        if (routeResult && routeResult.projectedCasualties > 0 && w[W_HAZARD_AVOIDANCE] > 0.01) {
            const fatalityRatio = this._strategyHazardFatalityRatio ?? HAZARD_FATALITY_RATIO;
            if (routeResult.projectedCasualties >= estimatedSend * fatalityRatio) {
                return -Infinity;
            }
            if (!needsDump
                && estimatedSend < defenders + routeResult.projectedCasualties + requiredGarrison) {
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
            // Map projection range heuristic (max ~2000px).
            // Targets closer to the start of the sweep (lower D) are much more valuable.
            geoBonusMultiplier = Math.max(0, (2000 - D_node) / 2000) * 0.70; 
        }

        if (target.owner === 'neutral') {
            base = (1000 + (target.productionRate || 1) * 200) * w[W_ATTACK_NEUTRAL];
            phaseCol = 0;
        } else if (target.owner === playerFaction) {
            base = 1500 * w[W_ATTACK_PLAYER];
            if (this._playerNodeCount <= 1) base += 3000;
            if (this._playerNodeCount <= 2) base += 1400;
            phaseCol = 1;
        } else {
            // Other AI faction
            base = 800 * w[W_ATTACK_NEUTRAL];
            phaseCol = 0;
        }

        base += base * geoBonusMultiplier;

        // ── Multiplier: Opportunity (Pilar 4) ────────────────────
        let oppMult = 1.0;
        if (this._oppAnalyzer && w[W_PILAR4_URGENCY] > 0.001) {
            const urgency = this._oppAnalyzer.getNodeUrgency(targetIndex);
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
        const phaseMult = _phaseMultipliers[phase * 4 + phaseCol];

        // ── Multiplier: Node Type ────────────────────────────────
        let typeMult = 1.0;
        if (target.type === 'enjambre')  typeMult = 1.3;
        else if (target.type === 'gigante') typeMult = 1.15;
        else if (target.type === 'tunel')   return -Infinity;

        // ── Cumulative Score ─────────────────────────────────────
        let score = base * oppMult * distMult * phaseMult * typeMult;

        // ── Capa Estratégica Inyectada (AI Directives) ──
        const directiveFocus = this._strategyFocus;
        const directiveAggroMult = this._strategyAggressionMult;

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
                for (let p = 0; p < this._playerNodeCount; p++) {
                    const pn = nodes[this._playerNodeIndices[p]];
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
            const flankRangeSq = (this._avgNodeDistance * 1.0) * (this._avgNodeDistance * 1.0);
            for (let a = 0; a < this._aiNodeCount; a++) {
                const an = nodes[this._aiNodeIndices[a]];
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

            // Verificar si hay una barra activa que ya pasó el target
            let sweepJustPassed = false;
            let sweepIncoming = false;
            for (const bar of (ws._activeBars || [])) {
                const barProj = bar.worldX;
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

    // ═══════════════════════════════════════════════════════════════
    //  TOP-K CANDIDATE MANAGEMENT (inline insertion sort, K=3)
    // ═══════════════════════════════════════════════════════════════

    _insertCandidate(targetIndex, score, routeResult, firstHopIndex) {
        if (this._candCount < TOP_K) {
            // Fill slot
            const pos = this._candCount;
            this._setCandidateSlot(pos, targetIndex, score, routeResult, firstHopIndex);
            this._candCount++;
            // Bubble up
            for (let i = pos; i > 0; i--) {
                if (this._candScores[i] > this._candScores[i - 1]) {
                    this._swapCandidates(i, i - 1);
                } else break;
            }
        } else if (score > this._candScores[TOP_K - 1]) {
            // Replace worst
            this._setCandidateSlot(TOP_K - 1, targetIndex, score, routeResult, firstHopIndex);
            // Bubble up
            for (let i = TOP_K - 1; i > 0; i--) {
                if (this._candScores[i] > this._candScores[i - 1]) {
                    this._swapCandidates(i, i - 1);
                } else break;
            }
        }
    }

    _setCandidateSlot(slot, targetIndex, score, routeResult, firstHopIndex) {
        this._candIndices[slot] = targetIndex;
        this._candScores[slot] = score;
        this._candHasRoute[slot] = routeResult ? 1 : 0;
        this._candTransitTimes[slot] = routeResult ? (routeResult.projectedTransitTime || 0) : 0;
        this._candCasualties[slot] = routeResult ? (routeResult.projectedCasualties || 0) : 0;
        this._candDelays[slot] = routeResult ? (routeResult.suggestedDelay || 0) : 0;
        this._candFirstHop[slot] = firstHopIndex == null ? -1 : firstHopIndex;
    }

    _swapCandidates(a, b) {
        let tmpIndex = this._candIndices[a];
        this._candIndices[a] = this._candIndices[b];
        this._candIndices[b] = tmpIndex;

        let tmpScore = this._candScores[a];
        this._candScores[a] = this._candScores[b];
        this._candScores[b] = tmpScore;

        let tmpFlag = this._candHasRoute[a];
        this._candHasRoute[a] = this._candHasRoute[b];
        this._candHasRoute[b] = tmpFlag;

        tmpScore = this._candTransitTimes[a];
        this._candTransitTimes[a] = this._candTransitTimes[b];
        this._candTransitTimes[b] = tmpScore;

        tmpScore = this._candCasualties[a];
        this._candCasualties[a] = this._candCasualties[b];
        this._candCasualties[b] = tmpScore;

        tmpScore = this._candDelays[a];
        this._candDelays[a] = this._candDelays[b];
        this._candDelays[b] = tmpScore;

        tmpIndex = this._candFirstHop[a];
        this._candFirstHop[a] = this._candFirstHop[b];
        this._candFirstHop[b] = tmpIndex;
    }

    _getCandidateRoute(slot) {
        if (!this._candHasRoute[slot]) return null;
        const route = this._candRouteResult;
        route.isViable = true;
        route.projectedTransitTime = this._candTransitTimes[slot];
        route.projectedCasualties = this._candCasualties[slot];
        route.suggestedDelay = this._candDelays[slot];
        route.queryHandle = -1;
        return route;
    }

    // ═══════════════════════════════════════════════════════════════
    //  COMMAND BUFFER WRITES
    // ═══════════════════════════════════════════════════════════════

    _writeCommand(srcIdx, tgtIdx, action, light, heavy, priority, firstHop = -1) {
        if (this._cmdCount >= CMD_MAX) return;
        const base = this._cmdCount * CMD_STRIDE;
        this._cmdBuffer[base + CMD_SOURCE]   = srcIdx;
        this._cmdBuffer[base + CMD_TARGET]   = tgtIdx;
        this._cmdBuffer[base + CMD_ACTION]   = action;
        this._cmdBuffer[base + CMD_LIGHT]    = light;
        this._cmdBuffer[base + CMD_HEAVY]    = heavy;
        this._cmdBuffer[base + CMD_PRIORITY] = priority;
        this._cmdBuffer[base + CMD_FIRST_HOP] = firstHop;
        this._cmdCount++;
    }

    _writeAttackCmd(sourceNode, sourceIndex, targetIndex, ownCount,
                    aiFaction, isDump, world, routeResult, firstHopIndex) {
        const w = this._weights;
        let ratio = isDump ? w[W_DUMP_RATIO] : w[W_SEND_RATIO];

        // Módulo 3 (AI Modifier): Water Sweep Aggression Override
        if (world && world.waterSweeps && world.waterSweeps.length > 0) {
            ratio = 1.0; 
        }

        const toSend = Math.max(1, Math.floor(ownCount * ratio));
        // Split into light/heavy based on node composition
        const light = this._idleLightByNode[sourceIndex] || 0;
        const heavy = this._idleHeavyByNode[sourceIndex] || 0;
        const total = light + heavy;
        if (total < 1) return false;
        const sendLight = Math.min(light, Math.ceil(toSend * (light / Math.max(1, total))));
        const sendHeavy = Math.min(heavy, toSend - sendLight);
        if (sendLight + sendHeavy < 1) return false;
        this._writeCommand(sourceIndex, targetIndex, ACTION_ATTACK, sendLight, sendHeavy, 0, firstHopIndex);
        return true;
    }

    _writeAttackCmdOptimal(sourceNode, targetNode, sourceIndex, targetIndex,
                           ownCount, aiFaction, isDump, world, routeResult,
                           firstHopIndex, minSurvivors) {
        if (!this._solver) {
            return this._writeAttackCmd(
                sourceNode, sourceIndex, targetIndex, ownCount,
                aiFaction, isDump, world, routeResult, firstHopIndex
            );
        }

        const isWaterSweep = (world && world.waterSweeps && world.waterSweeps.length > 0);

        const maxAllocatable = isDump || isWaterSweep
            ? ownCount
            : this._solver.computeMaxAllocatable(sourceNode, aiFaction, world);

        if (maxAllocatable < 5 && !isDump && !isWaterSweep) return false;

        const maxLight = Math.min(this._idleLightByNode[sourceIndex] || 0, maxAllocatable);
        const maxHeavy = Math.min(this._idleHeavyByNode[sourceIndex] || 0, maxAllocatable);

        // Módulo 3 (AI Modifier): Water Sweep Override (All-in dump)
        if (isWaterSweep) {
            if (maxLight + maxHeavy < 1) return false;
            this._writeCommand(sourceIndex, targetIndex, ACTION_ATTACK, maxLight, maxHeavy, 0, firstHopIndex);
            return true;
        }

        const w = this._weights;
        const successCond = isDump ? SUCCESS_VICTORIA : SUCCESS_SEGURA;
        const margin = isDump ? 1.0 : (w[W_SIMULATOR_TRUST] >= 1.0 ? 1.15 : 1.25);

        const valid = this._solver.calculateOptimalDeployment(
            world, sourceNode, targetNode,
            maxLight, maxHeavy,
            aiFaction, successCond, margin,
            null, // routeResult — let solver handle
            this._deployResult
        );

        let sendLight, sendHeavy;
        if (valid) {
            sendLight = this._deployResult[OUT_RECOMMENDED_LIGHT] | 0;
            sendHeavy = this._deployResult[OUT_RECOMMENDED_HEAVY] | 0;
        } else if (isDump) {
            sendLight = maxLight;
            sendHeavy = maxHeavy;
        } else {
            return; // infeasible
        }

        if (sendLight + sendHeavy < 1) return;
        this._writeCommand(sourceIndex, targetIndex, ACTION_ATTACK, sendLight, sendHeavy, 0);
    }

    // ═══════════════════════════════════════════════════════════════
    //  COMMAND EXECUTION
    // ═══════════════════════════════════════════════════════════════

    _writeAttackCmdResolved(sourceNode, targetNode, sourceIndex, targetIndex,
                            ownCount, aiFaction, isDump, world, routeResult,
                            firstHopIndex, minSurvivors) {
        if (!this._solver) {
            return this._writeAttackCmd(
                sourceNode, sourceIndex, targetIndex, ownCount,
                aiFaction, isDump, world, routeResult, firstHopIndex
            );
        }

        const isWaterSweep = (world && world.waterSweeps && world.waterSweeps.length > 0);
        const maxAllocatable = isDump || isWaterSweep
            ? ownCount
            : this._solver.computeMaxAllocatable(sourceNode, aiFaction, world);

        if (maxAllocatable < 5 && !isDump && !isWaterSweep) return false;

        const maxLight = Math.min(this._idleLightByNode[sourceIndex] || 0, maxAllocatable);
        const maxHeavy = Math.min(this._idleHeavyByNode[sourceIndex] || 0, maxAllocatable);

        if (isWaterSweep) {
            if (maxLight + maxHeavy < 1) return false;
            this._writeCommand(sourceIndex, targetIndex, ACTION_ATTACK, maxLight, maxHeavy, 0, firstHopIndex);
            return true;
        }

        const w = this._weights;
        const successCond = isDump ? SUCCESS_VICTORIA : SUCCESS_SEGURA;
        const margin = isDump ? 1.0 : (w[W_SIMULATOR_TRUST] >= 1.0 ? 1.15 : 1.25);
        const valid = this._solver.calculateOptimalDeployment(
            world, sourceNode, targetNode,
            maxLight, maxHeavy,
            aiFaction, successCond, margin,
            routeResult,
            this._deployResult
        );

        let sendLight, sendHeavy;
        if (valid) {
            const expectedSurvivors = this._deployResult[3] || 0;
            if (!isDump && expectedSurvivors < minSurvivors) {
                return false;
            }
            sendLight = this._deployResult[OUT_RECOMMENDED_LIGHT] | 0;
            sendHeavy = this._deployResult[OUT_RECOMMENDED_HEAVY] | 0;
        } else if (isDump) {
            sendLight = maxLight;
            sendHeavy = maxHeavy;
        } else {
            return false;
        }

        if (sendLight + sendHeavy < 1) return false;
        this._writeCommand(sourceIndex, targetIndex, ACTION_ATTACK, sendLight, sendHeavy, 0, firstHopIndex);
        return true;
    }

    _dispatchUnitsResolved(srcNode, tgtNode, lightToSend, heavyToSend,
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

        for (let i = allUnits.length - 1; i >= 0 && sentHeavy < heavyToSend; i--) {
            const u = allUnits[i];
            if (u.pendingRemoval || u.faction !== aiFaction || u.state !== 'idle') continue;
            if (u.targetNode !== srcNode) continue;
            if ((u.power || 1) <= 1) continue;
            u.targetNode = hopTarget;
            u.state = 'traveling';
            sentHeavy++;
        }

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

    _estimateAttackBodies(sourceNode, sourceIndex, ownCount, aiFaction, needsDump, world) {
        if (needsDump) return ownCount;

        const idleBodies =
            (this._idleLightByNode[sourceIndex] || 0) +
            (this._idleHeavyByNode[sourceIndex] || 0);

        if (idleBodies < 1) return 0;

        if (!this._solver) {
            return Math.max(
                MIN_ATTACK_FORCE,
                Math.min(idleBodies, Math.floor(ownCount * this._weights[W_SEND_RATIO]))
            );
        }

        const allocatable = this._solver.computeMaxAllocatable(sourceNode, aiFaction, world);
        const budget = Math.max(MIN_ATTACK_FORCE, Math.floor(allocatable));
        return Math.min(ownCount, idleBodies, budget);
    }

    _getRequiredPostCaptureGarrison(routeResult, targetNode, needsDump) {
        if (needsDump) return 0;

        let garrison = this._strategyMinPostCaptureGarrison ?? BASE_CAPTURE_GARRISON;
        if (this._currentPhase === PHASE_EARLY) garrison += 4;
        if (targetNode && targetNode.type === 'gigante') garrison += 4;

        if (routeResult && routeResult.projectedCasualties > 0) {
            const hazardBonus = this._strategyHazardGarrisonBonus ?? HAZARD_GARRISON_BONUS;
            garrison += Math.min(12, Math.ceil(routeResult.projectedCasualties * 0.5));
            garrison += hazardBonus;
        }

        return garrison;
    }

    _dispatchUnits(srcNode, tgtNode, lightToSend, heavyToSend,
                   allUnits, aiFaction, world, navExecResult) {
        // ── Capa 4.2: Multi-hop routing real ─────────────────────
        let hopTarget = tgtNode;
        if (world && world.navigation && navExecResult && navExecResult.queryHandle >= 0) {
            const hopIdx = world.navigation.peekFirstHop(navExecResult.queryHandle);
            if (hopIdx >= 0 && hopIdx < world.nodes.length) {
                hopTarget = world.nodes[hopIdx];
            }
        }

        // ── Validación de Bloqueo Absoluta ──
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

    _buyEvolution(node, type, cost, faction, allUnits, world) {
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

    // ═══════════════════════════════════════════════════════════════
    //  SURVIVAL & RISK AWARENESS PATCH (Módulos 1 & 3)
    // ═══════════════════════════════════════════════════════════════

    /**
     * Módulo 3: Scans for sweeps and updates this._doomsdayTTI and this._neutralizeTTI per node.
     */
    _scanDoomsdayThreats(nodes, aiFaction, world) {
        if (!world) return;
        const wDoom = this._weights[W_DOOMSDAY_AWARENESS];
        if (wDoom < 0.01) {
            this._doomsdayActive = false;
            return;
        }

        this._doomsdayActive = false;
        const waterSweeps = world.waterSweeps || [];
        const lightSweeps = world.lightSweeps || [];

        for (let i = 0; i < nodes.length; i++) {
            this._doomsdayTTI[i] = -1;
            this._neutralizeTTI[i] = -1;
            const node = nodes[i];
            if (_countAt(node, aiFaction) === 0) continue;

            let minDoom = Infinity;
            let minNeutral = Infinity;

            for (const ws of waterSweeps) {
                for (const bar of ws._activeBars) {
                    if (bar.worldX < node.x) {
                        const tti = (node.x - bar.worldX) / Math.max(1, ws.speed);
                        if (tti > 0 && tti < minDoom) minDoom = tti;
                    }
                }
                // Alerting (pre-spawn)
                if (ws.isAlerting && minDoom === Infinity) {
                    // Approximation based on delay + flight
                    const tti = ws._alertTimer + (node.x / Math.max(1, ws.speed));
                    if (tti > 0 && tti < minDoom) minDoom = tti;
                }
            }

            for (const ls of lightSweeps) {
                if (!node.isMarkedForSweep) continue;
                // scale normalization
                const scaleX = (world.scale && world.scale.x) ? world.scale.x : 1;
                const spd = Math.max(1, ls.speed / scaleX);
                
                if (ls.state === 'sweeping') {
                    for (const orb of ls.orbs) {
                        if (orb.worldX < node.x) {
                            const tti = (node.x - orb.worldX) / spd;
                            if (tti > 0 && tti < minNeutral) minNeutral = tti;
                        }
                    }
                } else if (ls.state === 'alerting') {
                    const tti = ls.timer + (node.x / spd);
                    if (tti > 0 && tti < minNeutral) minNeutral = tti;
                }
            }

            if (minDoom < 9999) {
                this._doomsdayTTI[i] = minDoom;
                this._doomsdayActive = true;
            }
            if (minNeutral < 9999) {
                this._neutralizeTTI[i] = minNeutral;
            }
        }
    }

    /**
     * Módulo 1 (Water Sweep Refined): Spacetime Veto Check
     * Evaluates moving intersection over 360-degree vectors.
     */
    _isRouteSwept(src, tgt, t_travel, world) {
        if (!world || !world.waterSweeps || world.waterSweeps.length === 0) return false;
        
        for (const ws of world.waterSweeps) {
            const dx = ws.dirX !== undefined ? ws.dirX : 1;
            const dy = ws.dirY !== undefined ? ws.dirY : 0;
            const Vw = Math.max(1, ws.speed);
            
            const S_proj = src.x * dx + src.y * dy;
            const T_proj = tgt.x * dx + tgt.y * dy;
            const Va_proj = Math.abs(t_travel) > 0.001 ? (T_proj - S_proj) / t_travel : 0;

            for (const bar of ws._activeBars) {
                const W0 = bar.worldX; // Fallback assumes worldX correlates to sweep projection
                if (Math.abs(Vw - Va_proj) < 0.1) continue;
                const t_intersect = (S_proj - W0) / (Vw - Va_proj);
                if (t_intersect > 0 && t_intersect < t_travel + 1.0) return true;
            }
            
            if (ws.isAlerting) {
                const W0 = -100; // Heuristic safe boundary spawn prep
                if (Math.abs(Vw - Va_proj) < 0.1) continue;
                const t_intersect = (S_proj - W0) / (Vw - Va_proj);
                if (t_intersect > 0 && t_intersect < t_travel) return true;
            }
        }
        return false;
    }

    /**
     * Módulo 3: Kamikaze Protocol (Evacuate towards impact safely)
     */
    _executePanicEvacuation(sourceNode, sourceWorldIdx, ownCount, aiFaction, nodes, world) {
        let bestTarget = -1;
        let maxKamikazeValue = -Infinity;

        let dx = 1, dy = 0, W0 = -9999, Vw = 20;
        if (world && world.waterSweeps && world.waterSweeps.length > 0) {
            const ws = world.waterSweeps[0];
            dx = ws.dirX !== undefined ? ws.dirX : 1;
            dy = ws.dirY !== undefined ? ws.dirY : 0;
            Vw = Math.max(1, ws.speed);
            if (ws._activeBars && ws._activeBars.length > 0) W0 = ws._activeBars[0].worldX;
        }
        const S_proj = sourceNode.x * dx + sourceNode.y * dy;

        for (let i = 0; i < nodes.length; i++) {
            if (i === sourceWorldIdx) continue;
            const target = nodes[i];
            if (target.type === 'tunel' && !target.tunnelTo) continue;

            // ── Validación de Bloqueo ──
            if (world && world.isPathBlocked && world.isPathBlocked(sourceNode, target)) {
                continue;
            }

            const distSq = (target.x - sourceNode.x)**2 + (target.y - sourceNode.y)**2;
            const dist = Math.sqrt(distSq);
            if (dist < 1) continue;
            
            const baseSpeed = world.unitBaseSpeed || 75;
            const t_travel = dist / baseSpeed;

            const T_proj = target.x * dx + target.y * dy;
            const Va_proj = (T_proj - S_proj) / t_travel;
            
            // Does wave catch us on the way?
            const V_rel = Vw - Va_proj;
            let reachable = true;
            if (Math.abs(V_rel) > 0.1) {
                const t_intersect = (S_proj - W0) / V_rel;
                if (t_intersect > 0 && t_intersect < t_travel + 1.0) reachable = false;
            }

            if (!reachable) continue;

            // Target Priority: Enemy/Player > Neutral > Ally
            let value = 0;
            if (target.owner !== aiFaction && target.owner !== 'neutral') {
                value += 5000 + _countAt(target, target.owner) * 2;
            } else if (target.owner === 'neutral') {
                value += 1000;
            } else {
                value += 100;
            }
            value -= dist;

            if (value > maxKamikazeValue) {
                maxKamikazeValue = value;
                bestTarget = i;
            }
        }

        // Fallback: nearest node if we literally can't run anywhere
        if (bestTarget === -1) {
            let minDistSq = Infinity;
            for (let i = 0; i < nodes.length; i++) {
                if (i === sourceWorldIdx) continue;
                const target = nodes[i];
                if (world && world.isPathBlocked && world.isPathBlocked(sourceNode, target)) continue;
                const d = (target.x - sourceNode.x)**2 + (target.y - sourceNode.y)**2;
                if (d < minDistSq) { minDistSq = d; bestTarget = i; }
            }
        }

        if (bestTarget >= 0) {
            this._writeAttackCmd(sourceNode, sourceWorldIdx, bestTarget, ownCount,
                                 aiFaction, true, world, null);
            this._attackersUsed |= (1 << sourceWorldIdx);
        }
    }

    /**
     * Módulo 1: Re-use simulator backward to check if node will fall if forces are sent.
     */
    _checkRearguardVulnerability(sourceNode, aiFaction, playerFaction, world, nodes) {
        let nearestPlayerDistSq = Infinity;
        let nearestPlayerNode = null;
        for (let i = 0; i < this._playerNodeCount; i++) {
            const pNode = nodes[this._playerNodeIndices[i]];
            const dx = pNode.x - sourceNode.x;
            const dy = pNode.y - sourceNode.y;
            const distSq = dx * dx + dy * dy;
            if (distSq < nearestPlayerDistSq) {
                nearestPlayerDistSq = distSq;
                nearestPlayerNode = pNode;
            }
        }

        if (!nearestPlayerNode) return false;
        
        const playerForce = _countAt(nearestPlayerNode, playerFaction);
        if (playerForce < 5) return false;
        
        const origLight = sourceNode.counts ? (sourceNode.counts[aiFaction] || 0) : 0;
        let remLight = Math.floor(origLight * 0.2); // assume we leave 20% behind
        if (remLight < 1) remLight = 1;

        if (sourceNode.counts) sourceNode.counts[aiFaction] = remLight;
        
        // Sim: Player attacks our remnant
        const simCode = this._simulator.evaluateAttack(
            world, nearestPlayerNode, sourceNode, playerForce,
            playerFaction, null, this._rearguardSimResult
        );

        if (sourceNode.counts) sourceNode.counts[aiFaction] = origLight;

        return (simCode >= RESULT_VICTORIA_PIRRICA);
    }
}

// ═══════════════════════════════════════════════════════════════════
//  HELPERS (module-level, zero-allocation)
// ═══════════════════════════════════════════════════════════════════

function _countAt(node, faction) {
    return node.counts ? (node.counts[faction] || 0) : 0;
}

function _countNonFaction(node, faction) {
    let total = 0;
    if (node.counts) {
        for (const f in node.counts) {
            if (f !== faction) total += (node.counts[f] || 0);
        }
    }
    return total;
}
