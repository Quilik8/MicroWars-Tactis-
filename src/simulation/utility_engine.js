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
export const WEIGHT_VECTOR_SIZE = 26;

// ═══════════════════════════════════════════════════════════════════
//  ARCHETYPE WEIGHT MATRICES
//  Cada fila es un Float32Array de WEIGHT_VECTOR_SIZE floats.
//  Índice:  0:easy  1:normal  2:hard  3:brutal
// ═══════════════════════════════════════════════════════════════════
const ARCHETYPE_COUNT = 4;
const _archetypeStore = new Float32Array(WEIGHT_VECTOR_SIZE * ARCHETYPE_COUNT);

//                     AtkN  AtkP  EvoT  EvoTh EvoAr Reinf Tunnel Wait
//                     P4Urg SimTr Aggr  Econ  CtrEv MPrng Hzrd  MinEv
//                     SndR  DmpR  EvoC  AtkI  CullT BCap  Flank Timing
// ── EASY ──  (RearGuard=0, Doomsday=0 → desactivados)
_archetypeStore.set([
    1.0,  0.7,  0.5,  0.6,  0.4,  0.3,  0.5,  0.4,
    0.0,  0.0,  0.62, 0.6,  0.0,  1,    0.0,  65,
    0.55, 0.75, 0.55, 5.0,  12.0, 0.0,  0.0,  0.0,
    0.0,  0.0
], 0);

// ── NORMAL ──  (RearGuard=0, Doomsday=0 → desactivados)
_archetypeStore.set([
    1.0,  1.0,  0.8,  0.7,  0.7,  0.6,  0.7,  0.3,
    0.0,  0.7,  0.78, 0.8,  0.3,  1,    0.3,  40,
    0.65, 0.82, 0.75, 3.0,  10.0, 0.0,  0.0,  0.0,
    0.0,  0.0
], WEIGHT_VECTOR_SIZE);

// ── HARD ──  (RearGuard=0.7, Doomsday=0.8 → activos)
_archetypeStore.set([
    0.9,  1.2,  1.0,  0.9,  1.0,  0.8,  0.8,  0.2,
    0.3,  1.0,  0.85, 0.9,  0.7,  2,    0.7,  25,
    0.90, 0.88, 0.90, 0.5,  8.0,  0.5,  0.5,  0.5,
    0.7,  0.8
], WEIGHT_VECTOR_SIZE * 2);

// ── BRUTAL ──  (RearGuard=1.0, Doomsday=1.0 → máximos)
_archetypeStore.set([
    0.8,  1.5,  1.2,  1.0,  1.1,  1.0,  0.9,  0.1,
    0.5,  1.0,  0.90, 1.0,  1.0,  3,    1.0,  15,
    1.00, 0.95, 1.00, 0.2,  6.0,  1.0,  1.0,  1.0,
    1.0,  1.0
], WEIGHT_VECTOR_SIZE * 3);

const _difficultyToIndex = { easy: 0, normal: 1, hard: 2, brutal: 3 };

// ═══════════════════════════════════════════════════════════════════
//  COMMAND BUFFER LAYOUT
// ═══════════════════════════════════════════════════════════════════
const CMD_SOURCE   = 0;
const CMD_TARGET   = 1;
const CMD_ACTION   = 2;
const CMD_LIGHT    = 3;
const CMD_HEAVY    = 4;
const CMD_PRIORITY = 5;
const CMD_STRIDE   = 6;
const CMD_MAX      = 32;

// ═══════════════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════════════
const K_DIST               = 8.0;   // half-life distance (seconds)
const NODES_PER_TICK       = 3;     // time-slice budget
const MAX_NODES            = 32;
const TOP_K                = 3;     // candidates to keep per source
const STAGNATION_REF       = 15.0;  // seconds before stagnation bonus kicks
const EVO_COSTS            = { espinoso: 30, artilleria: 40, tanque: 35 };
const MIN_ATTACK_FORCE     = 15;

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
        this._evalTimer   = 0;

        // ── Command buffer ──────────────────────────────────────
        this._cmdBuffer   = new Float32Array(CMD_MAX * CMD_STRIDE);
        this._cmdCount    = 0;

        // ── Top-K candidate scratch ─────────────────────────────
        this._candIndices = new Uint8Array(TOP_K);
        this._candScores  = new Float32Array(TOP_K);
        this._candCount   = 0;

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

        // ── Phase cache ─────────────────────────────────────────
        this._currentPhase = PHASE_MID;

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
    }

    // ═══════════════════════════════════════════════════════════════
    //  PUBLIC API
    // ═══════════════════════════════════════════════════════════════

    /**
     * Set the active archetype from difficulty string.
     * @param {string} difficulty — 'easy'|'normal'|'hard'|'brutal'
     */
    setArchetype(difficulty) {
        const idx = _difficultyToIndex[difficulty] || 0;
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
        this._evalTimer   = 0;
        this._cmdCount    = 0;
        this._lastCaptureTime = 0;
        this._simTime     = 0;
        this._attackersUsed = 0;
    }

    /**
     * Main evaluation tick. Called from AIManager.update() after
     * Pilar 4 has been updated and the FutureLedger rebuilt.
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
     * @returns {number} number of commands written
     */
    evaluate(dt, world, nodes, allUnits, aiFaction, playerFaction,
             navSystem, navStateView, navScoreResult, navExecResult) {

        this._simTime += dt;
        this._evalTimer += dt;

        const interval = this._weights[W_ATTACK_INTERVAL];
        if (this._evalTimer < interval) return 0;
        this._evalTimer -= interval;

        // ── 1. Classify nodes ────────────────────────────────────
        this._classifyNodes(nodes, aiFaction, playerFaction);
        if (this._aiNodeCount === 0) return 0;

        // ── 2. Detect game phase ─────────────────────────────────
        this._currentPhase = this._detectPhase(nodes);

        // ── 3. Track stagnation (via Pilar 4 flags) ──────────────
        this._updateStagnation(world);

        // ── 4. Build idle unit index ─────────────────────────────
        this._buildIdleIndex(allUnits, aiFaction);

        // ── 5. Rebuild eval queue ────────────────────────────────
        this._rebuildEvalQueue(world);

        // ── 6. Clear command buffer ──────────────────────────────
        this._cmdCount = 0;
        this._attackersUsed = 0;

        // ── 6.5. Doomsday Scan (Módulo 3) ────────────────────────
        // Compute per-node Time-To-Intercept from environmental threats.
        // Only runs if the archetype has W_DOOMSDAY_AWARENESS > 0.
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
            // If this node is about to be destroyed by an environmental
            // event, skip all normal logic and force panic evacuation.
            const dTTI = this._doomsdayTTI[sourceWorldIdx];
            if (dTTI >= 0 && dTTI < DOOMSDAY_HORIZON) {
                this._executePanicEvacuation(
                    sourceNode, sourceWorldIdx, ownCount,
                    aiFaction, nodes, world
                );
                continue; // Skip evolutions and normal attacks
            }

            // ── Módulo 3.b: Brace for Impact (Light Sweep) ────────────────
            const nTTI = this._neutralizeTTI[sourceWorldIdx];
            if (nTTI >= 0 && nTTI < DOOMSDAY_HORIZON) {
                // The node is about to turn neutral but troops will survive. 
                // Do NOT send troops out to attack, because we need them here
                // to instantly re-capture the node after the sweep passes!
                continue; // Skip evolutions and attacks (effectively ACTION_WAIT)
            }

            // A. Self-management: evolutions
            this._evaluateEvolution(
                sourceNode, sourceWorldIdx, ownCount,
                aiFaction, playerFaction, nodes, allUnits
            );

            // B. Attack scoring (dual-phase)
            this._evaluateAttacks(
                sourceNode, sourceWorldIdx, ownCount,
                aiFaction, playerFaction, nodes, allUnits, world,
                navSystem, navStateView, navScoreResult, navExecResult
            );
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

            if (srcIdx >= nodes.length || tgtIdx >= nodes.length) continue;
            const srcNode = nodes[srcIdx];
            const tgtNode = nodes[tgtIdx];

            if (action === ACTION_ATTACK) {
                this._dispatchUnits(srcNode, tgtNode, light, heavy,
                                    allUnits, aiFaction, world, navExecResult);
            } else if (action === ACTION_EVOLVE_TANK) {
                this._buyEvolution(srcNode, 'tanque', EVO_COSTS.tanque, aiFaction, allUnits, world);
            } else if (action === ACTION_EVOLVE_THORN) {
                this._buyEvolution(srcNode, 'espinoso', EVO_COSTS.espinoso, aiFaction, allUnits, world);
            } else if (action === ACTION_EVOLVE_ART) {
                this._buyEvolution(srcNode, 'artilleria', EVO_COSTS.artilleria, aiFaction, allUnits, world);
            } else if (action === ACTION_TUNNEL) {
                srcNode.tunnelTo = tgtNode;
            }
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

    _updateStagnation(world) {
        if (!this._oppAnalyzer) return;
        // Check if any node changed owner recently (FLAG_OWNER_CHANGED = 0x04)
        for (let i = 0; i < Math.min(world.nodes.length, MAX_NODES); i++) {
            if (this._oppAnalyzer.getNodeFlags(i) & 0x04) {
                this._lastCaptureTime = this._simTime;
                return;
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  EVOLUTION EVALUATION
    // ═══════════════════════════════════════════════════════════════

    _evaluateEvolution(sourceNode, sourceIndex, ownCount,
                       aiFaction, playerFaction, nodes, allUnits) {
        const w = this._weights;

        // Already evolved or evolving?
        if (sourceNode.evolution || sourceNode.pendingEvolution) return;
        if (sourceNode.type === 'tunel') return;
        if (ownCount < w[W_MIN_EVOLUTION_COUNT]) return;

        // Evolution chance gate (deterministic via node position hash)
        // We skip this for now — the utility score handles priority

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
        if (safetyMult < 0.01) return;

        // Stagnation multiplier
        const timeSinceCapture = this._simTime - this._lastCaptureTime;
        const stagnationMult = 1.0 + Math.min(2.0, timeSinceCapture / STAGNATION_REF);

        // Is this node frontline?
        let minDistPlayer = Infinity;
        for (let i = 0; i < this._playerNodeCount; i++) {
            const pn = nodes[this._playerNodeIndices[i]];
            const dx = pn.x - sourceNode.x;
            const dy = pn.y - sourceNode.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < minDistPlayer) minDistPlayer = d;
        }
        const isFrontline = minDistPlayer < 450;

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

        // Score each evolution type
        const counterW = w[W_COUNTER_EVOLUTION];

        // Tank
        let scoreTank = 800 * w[W_EVOLVE_TANK] * stagnationMult * safetyMult;
        if (!isFrontline) scoreTank *= 1.3; // retaguardia bonus
        if (mapControl > 0.6) scoreTank *= 1.2;
        if (playerEspinoso > 1 && counterW > 0) scoreTank *= (1.0 + 0.6 * counterW);
        if (ownCount < EVO_COSTS.tanque) scoreTank = -Infinity;

        // Thorn (Espinoso)
        let scoreThorn = 700 * w[W_EVOLVE_THORN] * stagnationMult * safetyMult;
        if (isFrontline) scoreThorn *= 1.3;
        if (this._playerNodeCount > this._aiNodeCount) scoreThorn *= 1.2;
        if (playerTanque > 1 && counterW > 0) scoreThorn *= (1.0 + 0.5 * counterW);
        if (ownCount < EVO_COSTS.espinoso) scoreThorn = -Infinity;

        // Artillery
        let scoreArt = 750 * w[W_EVOLVE_ART] * stagnationMult * safetyMult;
        if (isFrontline) scoreArt *= 1.2;
        if (playerEspinoso > 1 && counterW > 0) scoreArt *= (1.0 + 0.5 * counterW);
        if (ownCount < EVO_COSTS.artilleria) scoreArt = -Infinity;

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
                if (dist < 350) {
                    const ns = (1000 + (tn.productionRate || 1) * 200) * (K_DIST / (K_DIST + dist / 75));
                    if (ns > bestNeutralScore) bestNeutralScore = ns;
                }
            }
        }
        const oppCost = bestNeutralScore * 0.6;

        scoreTank  -= oppCost;
        scoreThorn -= oppCost;
        scoreArt   -= oppCost;

        // Find best evolution
        let bestEvoAction = -1;
        let bestEvoScore  = 0; // threshold: must be positive

        if (scoreTank > bestEvoScore)  { bestEvoScore = scoreTank;  bestEvoAction = ACTION_EVOLVE_TANK; }
        if (scoreThorn > bestEvoScore) { bestEvoScore = scoreThorn; bestEvoAction = ACTION_EVOLVE_THORN; }
        if (scoreArt > bestEvoScore)   { bestEvoScore = scoreArt;   bestEvoAction = ACTION_EVOLVE_ART; }

        if (bestEvoAction >= 0) {
            this._writeCommand(sourceIndex, sourceIndex, bestEvoAction, 0, 0, bestEvoScore);
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
        const maxReachSq  = (baseSpeed * w[W_SPATIAL_CULLING_MAX]) * (baseSpeed * w[W_SPATIAL_CULLING_MAX]);

        for (let t = 0; t < this._targetNodeCount; t++) {
            const targetIdx = this._targetNodeIndices[t];
            const target    = nodes[targetIdx];

            // ── Etapa 1: Spatial Culling ──
            const dx = target.x - sourceNode.x;
            const dy = target.y - sourceNode.y;
            const distSq = dx * dx + dy * dy;
            if (distSq > maxReachSq) continue;

            // ── Etapa 2: Topological viability ──
            let routeResult = null;
            if (navSystem && navSystem.store) {
                navSystem.populateGameStateView(world, ownCount, baseSpeed, navStateView);
                routeResult = navSystem.evaluatePath(
                    sourceNode.navIndex, target.navIndex, navStateView, navScoreResult
                );
                if (routeResult && !routeResult.isViable) continue;
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
            this._insertCandidate(targetIdx, score);
        }

        if (this._candCount === 0) return;

        // ── PHASE 2: Simulator Validation (Top-1 → Top-3) ───────
        const trustSim = w[W_SIMULATOR_TRUST];

        for (let k = 0; k < this._candCount; k++) {
            const candIdx    = this._candIndices[k];
            const candTarget = nodes[candIdx];

            // Low-trust archetype: skip simulation, attack blindly
            if (trustSim < 0.01) {
                this._writeAttackCmd(sourceNode, sourceIndex, candIdx, ownCount,
                                     aiFaction, needsDump, world, navExecResult);
                this._attackersUsed |= (1 << sourceIndex);
                return;
            }

            // Invoke Pilar 2
            const simCode = this._simulator.evaluateAttack(
                world, sourceNode, candTarget, ownCount,
                aiFaction, null, this._simResult
            );

            if (simCode >= RESULT_VICTORIA_PIRRICA) {
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
                this._writeAttackCmdOptimal(
                    sourceNode, candTarget, sourceIndex, candIdx,
                    ownCount, aiFaction, needsDump, world, navExecResult
                );
                this._attackersUsed |= (1 << sourceIndex);
                return;
            }
            // Defeat → try next candidate
        }

        // All candidates rejected
        if (needsDump && this._candCount > 0) {
            // Forced dump to best heuristic candidate
            const dumpIdx = this._candIndices[0];
            this._writeAttackCmd(sourceNode, sourceIndex, dumpIdx, ownCount,
                                 aiFaction, true, world, navExecResult);
            this._attackersUsed |= (1 << sourceIndex);
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

        // ── HAZARD HARD-VETO (Módulo 2) ──────────────────────────
        // Prevent suicide through terrain hazards. If projected route 
        // casualties exceed the estimated sending forces, veto immediately.
        if (routeResult && routeResult.projectedCasualties > 0 && w[W_HAZARD_AVOIDANCE] > 0.01) {
            const sendPowerEstimate = needsDump ? ownCount : Math.max(MIN_ATTACK_FORCE, ownCount * w[W_SEND_RATIO]);
            if (routeResult.projectedCasualties >= sendPowerEstimate * 0.8) {
                return -Infinity;
            }
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

        // ── Flanking bonus ───────────────────────────────────────
        if (w[W_FLANK_BONUS] > 0.01 && target.owner === playerFaction) {
            let adjacentAI = 0;
            for (let a = 0; a < this._aiNodeCount; a++) {
                const an = nodes[this._aiNodeIndices[a]];
                const adx = an.x - target.x;
                const ady = an.y - target.y;
                if (adx * adx + ady * ady < 400 * 400) adjacentAI++;
            }
            if (adjacentAI >= 2) score += 1500 * adjacentAI * w[W_FLANK_BONUS];
        }

        // ── Hazard awareness ─────────────────────────────────────
        if (w[W_HAZARD_AVOIDANCE] > 0.01 && target.isMarkedForSweep) {
            score -= 2000 * w[W_HAZARD_AVOIDANCE];
        }

        // ── Timing awareness (water sweep post-pass) ─────────────
        if (w[W_TIMING_AWARENESS] > 0.01 && nodes.length > 0) {
            // Bonus if water sweep just passed (safe window)
            // Penalty if barrier blocks route
            // (Simplified — full version reads sweep/barrier state)
        }

        return score;
    }

    // ═══════════════════════════════════════════════════════════════
    //  TOP-K CANDIDATE MANAGEMENT (inline insertion sort, K=3)
    // ═══════════════════════════════════════════════════════════════

    _insertCandidate(targetIndex, score) {
        if (this._candCount < TOP_K) {
            // Fill slot
            const pos = this._candCount;
            this._candIndices[pos] = targetIndex;
            this._candScores[pos]  = score;
            this._candCount++;
            // Bubble up
            for (let i = pos; i > 0; i--) {
                if (this._candScores[i] > this._candScores[i - 1]) {
                    // swap
                    const tmpI = this._candIndices[i];
                    const tmpS = this._candScores[i];
                    this._candIndices[i] = this._candIndices[i - 1];
                    this._candScores[i]  = this._candScores[i - 1];
                    this._candIndices[i - 1] = tmpI;
                    this._candScores[i - 1]  = tmpS;
                } else break;
            }
        } else if (score > this._candScores[TOP_K - 1]) {
            // Replace worst
            this._candIndices[TOP_K - 1] = targetIndex;
            this._candScores[TOP_K - 1]  = score;
            // Bubble up
            for (let i = TOP_K - 1; i > 0; i--) {
                if (this._candScores[i] > this._candScores[i - 1]) {
                    const tmpI = this._candIndices[i];
                    const tmpS = this._candScores[i];
                    this._candIndices[i] = this._candIndices[i - 1];
                    this._candScores[i]  = this._candScores[i - 1];
                    this._candIndices[i - 1] = tmpI;
                    this._candScores[i - 1]  = tmpS;
                } else break;
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  COMMAND BUFFER WRITES
    // ═══════════════════════════════════════════════════════════════

    _writeCommand(srcIdx, tgtIdx, action, light, heavy, priority) {
        if (this._cmdCount >= CMD_MAX) return;
        const base = this._cmdCount * CMD_STRIDE;
        this._cmdBuffer[base + CMD_SOURCE]   = srcIdx;
        this._cmdBuffer[base + CMD_TARGET]   = tgtIdx;
        this._cmdBuffer[base + CMD_ACTION]   = action;
        this._cmdBuffer[base + CMD_LIGHT]    = light;
        this._cmdBuffer[base + CMD_HEAVY]    = heavy;
        this._cmdBuffer[base + CMD_PRIORITY] = priority;
        this._cmdCount++;
    }

    _writeAttackCmd(sourceNode, sourceIndex, targetIndex, ownCount,
                    aiFaction, isDump, world, navExecResult) {
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
        if (total < 1) return;
        const sendLight = Math.min(light, Math.ceil(toSend * (light / Math.max(1, total))));
        const sendHeavy = Math.min(heavy, toSend - sendLight);
        this._writeCommand(sourceIndex, targetIndex, ACTION_ATTACK, sendLight, sendHeavy, 0);
    }

    _writeAttackCmdOptimal(sourceNode, targetNode, sourceIndex, targetIndex,
                           ownCount, aiFaction, isDump, world, navExecResult) {
        if (!this._solver) {
            this._writeAttackCmd(sourceNode, sourceIndex, targetIndex, ownCount,
                                 aiFaction, isDump, world, navExecResult);
            return;
        }

        const isWaterSweep = (world && world.waterSweeps && world.waterSweeps.length > 0);

        const maxAllocatable = isDump || isWaterSweep
            ? ownCount
            : this._solver.computeMaxAllocatable(sourceNode, aiFaction, world);

        if (maxAllocatable < 5 && !isDump && !isWaterSweep) return;

        const maxLight = Math.min(this._idleLightByNode[sourceIndex] || 0, maxAllocatable);
        const maxHeavy = Math.min(this._idleHeavyByNode[sourceIndex] || 0, maxAllocatable);

        // Módulo 3 (AI Modifier): Water Sweep Override (All-in dump)
        if (isWaterSweep) {
            if (maxLight + maxHeavy < 1) return;
            this._writeCommand(sourceIndex, targetIndex, ACTION_ATTACK, maxLight, maxHeavy, 0);
            return;
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

    _dispatchUnits(srcNode, tgtNode, lightToSend, heavyToSend,
                   allUnits, aiFaction, world, navExecResult) {
        // Get first-hop for multi-hop routing
        let hopTarget = tgtNode;
        if (world && world.navigation) {
            const hopIdx = world.navigation.peekFirstHop
                ? world.navigation.peekFirstHop(-1) : -1;
            // Simplified: route directly (full hop resolution in AIManager wrapper)
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
                const d = (nodes[i].x - sourceNode.x)**2 + (nodes[i].y - sourceNode.y)**2;
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
