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
import {
    // Action space
    ACTION_ATTACK, ACTION_REINFORCE, ACTION_EVOLVE_TANK,
    ACTION_EVOLVE_THORN, ACTION_EVOLVE_ART, ACTION_TUNNEL,
    ACTION_RETREAT, ACTION_WAIT,
    // Weight vector
    W_ATTACK_NEUTRAL, W_ATTACK_PLAYER, W_EVOLVE_TANK, W_EVOLVE_THORN,
    W_EVOLVE_ART, W_REINFORCE, W_TUNNEL, W_WAIT, W_PILAR4_URGENCY,
    W_SIMULATOR_TRUST, W_AGGRESSION, W_ECONOMY_PRIORITY,
    W_COUNTER_EVOLUTION, W_MULTI_PRONG, W_HAZARD_AVOIDANCE,
    W_MIN_EVOLUTION_COUNT, W_SEND_RATIO, W_DUMP_RATIO,
    W_EVOLUTION_CHANCE, W_ATTACK_INTERVAL, W_SPATIAL_CULLING_MAX,
    W_BACK_CAP_BONUS, W_FLANK_BONUS, W_TIMING_AWARENESS,
    W_REARGUARD_CHECK, W_DOOMSDAY_AWARENESS, W_EVOLUTION_INTERVAL,
    WEIGHT_VECTOR_SIZE,
    // Archetypes
    archetypeStore, difficultyToIndex,
    // Command buffer
    CMD_SOURCE, CMD_TARGET, CMD_ACTION, CMD_LIGHT, CMD_HEAVY,
    CMD_PRIORITY, CMD_FIRST_HOP, CMD_STRIDE, CMD_MAX,
    // Game constants
    K_DIST, NODES_PER_TICK, MAX_NODES, TOP_K, STAGNATION_REF,
    EVO_COSTS, MIN_ATTACK_FORCE, BASE_CAPTURE_GARRISON,
    HAZARD_GARRISON_BONUS, HAZARD_FATALITY_RATIO,
    REARGUARD_PENALTY, DOOMSDAY_HORIZON,
    // Phase
    PHASE_EARLY, PHASE_MID, PHASE_LATE, phaseMultipliers,
    // PCS result indices
    SIM_RESULT_SURVIVOR_BODIES, SIM_RESULT_SIZE,
    // Helpers
    countAt, countNonFaction,
} from './ai_constants.js';

import { scanDoomsdayThreats, executePanicEvacuation } from './ai_doomsday.js';
import { evaluateEvolution, evaluateReinforcement, evaluateAttacks } from './ai_scoring.js';
import { executeCommands as execCmds, dispatchUnitsResolved, buyEvolution } from './ai_command_buffer.js';
import { AIMemory, DEFAULT_ANTI_PENDULUM } from './ai_memory.js';
import { resolveAIProfile } from './ai_config.js';
import { canTargetFaction } from './ai_diplomacy.js';
import { HazardOracle } from './ai_hazard_oracle.js';
import { telemetry } from './ai_telemetry.js';

// Re-export para backward compatibility (ai_manager.js, debug_utility.js)
export {
    ACTION_ATTACK, ACTION_REINFORCE, ACTION_EVOLVE_TANK,
    ACTION_EVOLVE_THORN, ACTION_EVOLVE_ART, ACTION_TUNNEL,
    ACTION_RETREAT, ACTION_WAIT, WEIGHT_VECTOR_SIZE,
} from './ai_constants.js';

// Alias locales para compatibilidad con el código interno que usa _underscore
const _countAt = countAt;
const _countNonFaction = countNonFaction;
const _phaseMultipliers = phaseMultipliers;
const _archetypeStore = archetypeStore;
const _difficultyToIndex = difficultyToIndex;


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
        this._simResult       = new Float32Array(SIM_RESULT_SIZE);
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
        this._rearguardSimResult = new Float32Array(SIM_RESULT_SIZE);

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
        this._strategyAllowedTargets = null;
        this._strategyAntiPendulum = DEFAULT_ANTI_PENDULUM;
        this._memoryByFaction = Object.create(null);
        this._activeMemory = null;

        // ── Fase 2: Perfil resuelto de AI ────────────────────────
        this._resolvedProfile = null;

        // ── Fase 5: Hazard Oracle ────────────────────────────────
        this._hazardOracle = new HazardOracle();

        // ── Fase 1: Telemetry ref ────────────────────────────────
        this._telemetry = telemetry;
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
        this._activeMemory = null;
        this._resolvedProfile = null;
        for (const faction in this._memoryByFaction) {
            this._memoryByFaction[faction].reset();
        }
        if (this._telemetry) this._telemetry.reset();
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

        // ── 1. Resolve strategy and classify nodes ───────────────
        this._resolveAIStrategy(world, aiFaction);
        this._classifyNodes(nodes, aiFaction, playerFaction);
        if (this._aiNodeCount === 0) return 0;
        this._activeMemory = this._getFactionMemory(aiFaction);
        this._activeMemory.observeNodes(nodes, this._simTime, this._strategyAntiPendulum);

        // ── 2. Detect game phase ─────────────────────────────────
        this._currentPhase = this._detectPhase(nodes);

        // ── 3. Track stagnation (via Pilar 4 flags) ──────────────
        this._updateStagnation(world, timers);

        // ── 4. Build idle unit index ─────────────────────────────
        this._buildIdleIndex(allUnits, aiFaction, nodes);

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
        scanDoomsdayThreats(this, nodes, aiFaction, world);

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
                executePanicEvacuation(
                    this, sourceNode, sourceWorldIdx, ownCount,
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
                evaluateEvolution(
                    this, sourceNode, sourceWorldIdx, ownCount,
                    aiFaction, playerFaction, nodes, allUnits, world
                );
            }

            // Capa 2.1: Si este nodo decidió evolucionar, NO atacar
            if ((this._evolversUsed >> sourceWorldIdx) & 1) continue;

            // B. Attack scoring (dual-phase)
            evaluateAttacks(
                this, sourceNode, sourceWorldIdx, ownCount,
                aiFaction, playerFaction, nodes, allUnits, world,
                navSystem, navStateView, navScoreResult, navExecResult
            );

            // C. Capa 3.1: Refuerzo (solo si no atacó ni evolucionó)
            if (!((this._attackersUsed >> sourceWorldIdx) & 1)) {
                evaluateReinforcement(
                    this, sourceNode, sourceWorldIdx, ownCount,
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
        execCmds(this, allUnits, nodes, aiFaction, world, navExecResult);
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
            } else if (this._isTargetAllowed(n.owner, aiFaction, playerFaction)) {
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

    _isTargetAllowed(owner, aiFaction, playerFaction) {
        if (owner === aiFaction) return false;

        // Fase 3: Delegar a ai_diplomacy si hay perfil resuelto
        if (this._resolvedProfile) {
            return canTargetFaction(this._resolvedProfile, aiFaction, owner, playerFaction);
        }

        // Fallback legacy
        const allowed = this._strategyAllowedTargets;
        if (!allowed || allowed.length === 0) {
            return owner === 'neutral' || owner === playerFaction;
        }

        for (let i = 0; i < allowed.length; i++) {
            const rule = allowed[i];
            if (rule === 'all') return true;
            if (rule === 'neutral' && owner === 'neutral') return true;
            if (rule === 'player' && owner === playerFaction) return true;
            if (rule === 'ai' && owner !== 'neutral' && owner !== playerFaction && owner !== aiFaction) return true;
            if (rule === owner || rule === `faction:${owner}`) return true;
        }
        return false;
    }

    _detectPhase(nodes) {
        const total = nodes.length || 1;
        const aiRatio = this._aiNodeCount / total;
        
        if (this._aiNodeCount <= 2) return PHASE_EARLY;
        if (aiRatio > 0.55) return PHASE_LATE;
        if (this._playerNodeCount <= 1) return PHASE_LATE;
        
        return PHASE_MID;
    }

    // ═══════════════════════════════════════════════════════════════
    //  IDLE UNIT INDEX (built once per eval cycle)
    // ═══════════════════════════════════════════════════════════════

    _buildIdleIndex(allUnits, aiFaction, nodes) {
        this._idleCountByNode.fill(0, 0, MAX_NODES);
        this._idleLightByNode.fill(0, 0, MAX_NODES);
        this._idleHeavyByNode.fill(0, 0, MAX_NODES);

        for (let i = 0; i < allUnits.length; i++) {
            const u = allUnits[i];
            if (u.pendingRemoval || u.faction !== aiFaction || u.state !== 'idle' || !u.targetNode) continue;
            const idx = u.targetNode._predictiveIndex;
            if (idx == null || idx < 0 || idx >= MAX_NODES) {
                let found = -1;
                for (let n = 0; n < nodes.length && n < MAX_NODES; n++) {
                    if (nodes[n] === u.targetNode) { found = n; break; }
                }
                if (found < 0) continue;
                this._idleCountByNode[found]++;
                if ((u.power || 1) > 1) this._idleHeavyByNode[found]++;
                else this._idleLightByNode[found]++;
                continue;
            }
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

    _resolveAIStrategy(world, aiFaction = null) {
        this._strategyFocus = null;
        this._strategyPrefEvo = null;
        this._strategyMinEvolutionGarrison = null;
        this._strategyAggressionMult = null;
        this._strategyMinPostCaptureGarrison = null;
        this._strategyHazardGarrisonBonus = null;
        this._strategyHazardFatalityRatio = null;
        this._strategyAllowedTargets = null;

        if (!world || !world.aiStrategy) {
            // Fase 2: Resolver perfil con defaults globales
            this._resolvedProfile = resolveAIProfile(null, null, aiFaction || 'enemy', this.difficulty || 'normal');
            this._strategyAntiPendulum = this._resolvedProfile.antiPendulum || DEFAULT_ANTI_PENDULUM;
            this._strategyAllowedTargets = this._resolvedProfile.allowedTargets || null;
            return;
        }

        const strategy = world.aiStrategy;

        // Fase 2: Resolver perfil completo via ai_config
        // aiStrategy ya es el merge de sector + level hecho por LevelManager,
        // así que lo pasamos como "sector" y null como "level".
        this._resolvedProfile = resolveAIProfile(strategy, null, aiFaction || 'enemy', this.difficulty || 'normal');

        // Extraer campos para backward compatibility con ai_scoring/ai_command_buffer
        const p = this._resolvedProfile;
        this._strategyFocus = p.focus ?? p.doctrine ?? null;
        this._strategyPrefEvo = p.preferredEvolution ?? null;
        this._strategyMinEvolutionGarrison = p.minEvolutionGarrison ?? null;
        this._strategyAggressionMult = p.aggressionMult ?? null;
        this._strategyMinPostCaptureGarrison = p.minPostCaptureGarrison ?? null;
        this._strategyHazardGarrisonBonus = p.hazardGarrisonBonus ?? null;
        this._strategyHazardFatalityRatio = p.maxRouteCasualtyRatio ?? null;
        this._strategyAllowedTargets = p.allowedTargets ?? null;
        this._strategyAntiPendulum = p.antiPendulum || DEFAULT_ANTI_PENDULUM;
    }

    _resolveAntiPendulumPolicy(policy) {
        if (policy === false) {
            return {
                ...DEFAULT_ANTI_PENDULUM,
                targetCooldownSec: 0,
                sourceCooldownSec: 0,
                recaptureCooldownSec: 0,
                maxFlipsBeforePenalty: 255,
                recentAttackPenalty: 0,
                flipPenalty: 0,
                sourceRepeatPenalty: 0,
            };
        }
        if (!policy) return DEFAULT_ANTI_PENDULUM;
        return { ...DEFAULT_ANTI_PENDULUM, ...policy };
    }

    _getFactionMemory(aiFaction) {
        const key = aiFaction || 'enemy';
        let memory = this._memoryByFaction[key];
        if (!memory) {
            memory = new AIMemory();
            this._memoryByFaction[key] = memory;
        }
        return memory;
    }

}
