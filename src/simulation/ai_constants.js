/**
 * ai_constants.js — Constantes Compartidas del Motor de IA
 *
 * Centraliza todas las constantes de índice, enumeradores, pesos
 * y tablas de arquetipos que antes estaban dispersas en utility_engine.js,
 * predictive_combat_simulator.js y optimal_deployment_solver.js.
 *
 * IMPORTAR AQUÍ: Cualquier sub-módulo de IA (ai_scoring, ai_doomsday,
 * ai_command_buffer) importa sus constantes desde este archivo.
 *
 * ZERO-ALLOCATION: Solo contiene constantes estáticas y TypedArrays
 *                  pre-asignados (nunca mutan en runtime).
 */

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
export const W_ATTACK_NEUTRAL       = 0;
export const W_ATTACK_PLAYER        = 1;
export const W_EVOLVE_TANK          = 2;
export const W_EVOLVE_THORN         = 3;
export const W_EVOLVE_ART           = 4;
export const W_REINFORCE            = 5;
export const W_TUNNEL               = 6;
export const W_WAIT                 = 7;
export const W_PILAR4_URGENCY       = 8;
export const W_SIMULATOR_TRUST      = 9;
export const W_AGGRESSION           = 10;
export const W_ECONOMY_PRIORITY     = 11;
export const W_COUNTER_EVOLUTION    = 12;
export const W_MULTI_PRONG          = 13;
export const W_HAZARD_AVOIDANCE     = 14;
export const W_MIN_EVOLUTION_COUNT  = 15;
export const W_SEND_RATIO           = 16;
export const W_DUMP_RATIO           = 17;
export const W_EVOLUTION_CHANCE     = 18;
export const W_ATTACK_INTERVAL      = 19;
export const W_SPATIAL_CULLING_MAX  = 20;
export const W_BACK_CAP_BONUS       = 21;
export const W_FLANK_BONUS          = 22;
export const W_TIMING_AWARENESS     = 23;
export const W_REARGUARD_CHECK      = 24;
export const W_DOOMSDAY_AWARENESS   = 25;
export const W_EVOLUTION_INTERVAL   = 26;  // Capa 1.2: intervalo independiente para evoluciones
export const WEIGHT_VECTOR_SIZE     = 27;

// ═══════════════════════════════════════════════════════════════════
//  ARCHETYPE WEIGHT MATRICES
//  Cada fila es un Float32Array de WEIGHT_VECTOR_SIZE floats.
//  Índice:  0:easy  1:normal  2:hard
// ═══════════════════════════════════════════════════════════════════
export const ARCHETYPE_COUNT = 3;
export const archetypeStore = new Float32Array(WEIGHT_VECTOR_SIZE * ARCHETYPE_COUNT);

//                     AtkN  AtkP  EvoT  EvoTh EvoAr Reinf Tunnel Wait
//                     P4Urg SimTr Aggr  Econ  CtrEv MPrng Hzrd  MinEv
//                     SndR  DmpR  EvoC  AtkI  CullT BCap  Flank Timing
//                     RGrd  Doom  EvoI
// ── EASY ──  (Doctrina: acumula, refuerza, ataca poco, evoluciona lento)
archetypeStore.set([
    1.0,  1.0,  0.8,  0.7,  0.7,  1.2,  0.7,  0.8,
    0.0,  0.7,  0.40, 0.8,  0.3,  1,    0.3,  60,
    0.45, 0.82, 0.75, 5.0,  10.0, 0.0,  0.0,  0.0,
    0.0,  0.0,  6.0
], 0);

// ── NORMAL ──  (Doctrina: equilibrado, refuerzo suave, oportunismo parcial)
archetypeStore.set([
    0.9,  1.2,  1.0,  0.9,  1.0,  0.9,  0.8,  0.3,
    0.3,  1.0,  0.65, 0.9,  0.7,  2,    0.7,  30,
    0.70, 0.88, 0.90, 2.0,  8.0,  0.3,  0.5,  0.5,
    0.7,  0.8,  3.0
], WEIGHT_VECTOR_SIZE);

// ── HARD ──  (Doctrina: inteligente y agresivo, doctrina completa)
archetypeStore.set([
    0.8,  1.5,  1.2,  1.0,  1.1,  0.6,  0.9,  0.1,
    0.5,  1.0,  1.00, 1.0,  1.0,  3,    1.0,  20,
    0.85, 0.95, 1.00, 0.5,  6.0,  1.0,  1.0,  1.0,
    1.0,  1.0,  1.5
], WEIGHT_VECTOR_SIZE * 2);

export const difficultyToIndex = { easy: 0, normal: 1, hard: 2 };

// ═══════════════════════════════════════════════════════════════════
//  COMMAND BUFFER LAYOUT
// ═══════════════════════════════════════════════════════════════════
export const CMD_SOURCE   = 0;
export const CMD_TARGET   = 1;
export const CMD_ACTION   = 2;
export const CMD_LIGHT    = 3;
export const CMD_HEAVY    = 4;
export const CMD_PRIORITY = 5;
export const CMD_FIRST_HOP = 6;
export const CMD_STRIDE   = 7;
export const CMD_MAX      = 32;

// ═══════════════════════════════════════════════════════════════════
//  GAME CONSTANTS
// ═══════════════════════════════════════════════════════════════════
export const K_DIST               = 8.0;   // half-life distance (seconds)
export const NODES_PER_TICK       = 3;     // time-slice budget
export const MAX_NODES            = 32;
export const TOP_K                = 3;     // candidates to keep per source
export const STAGNATION_REF       = 15.0;  // seconds before stagnation bonus kicks
export const EVO_COSTS            = { espinoso: 30, artilleria: 40, tanque: 50 };
export const MIN_ATTACK_FORCE     = 15;
export const BASE_CAPTURE_GARRISON = 20;
export const HAZARD_GARRISON_BONUS = 8;
export const HAZARD_FATALITY_RATIO = 0.35;

// ── Módulo 1: Rearguard Reverse Sandbox ─────────────────────────
export const REARGUARD_PENALTY    = 0.01;  // Utility multiplier when rearguard is vulnerable

// ── Módulo 3: Doomsday Panic ────────────────────────────────────
export const DOOMSDAY_HORIZON     = 15.0;  // seconds — if TTI < this, panic mode activates

// ═══════════════════════════════════════════════════════════════════
//  PHASE CONSTANTS AND MULTIPLIERS
// ═══════════════════════════════════════════════════════════════════
export const PHASE_EARLY = 0;
export const PHASE_MID   = 1;
export const PHASE_LATE  = 2;

// Phase multiplier tables (indexed: 0=ATTACK_NEUTRAL, 1=ATTACK_PLAYER, 2=EVOLVE, 3=REINFORCE)
// Phases: 0=early, 1=mid, 2=late
export const phaseMultipliers = new Float32Array([
    // early
    1.5, 0.3, 0.6, 1.0,
    // mid
    0.8, 1.0, 1.2, 1.0,
    // late
    0.4, 1.8, 0.9, 1.3,
]);

// ═══════════════════════════════════════════════════════════════════
//  PCS RESULT BUFFER INDICES (Predictive Combat Simulator)
//  Usados por UtilityEngine y OptimalDeploymentSolver para leer
//  los resultados de simulación por nombre en vez de índice numérico.
// ═══════════════════════════════════════════════════════════════════
export const SIM_RESULT_CODE                   = 0;
export const SIM_RESULT_SURVIVOR_BODIES        = 1;
export const SIM_RESULT_SURVIVOR_POWER         = 2;
export const SIM_RESULT_SURVIVOR_LIGHT         = 3;
export const SIM_RESULT_SURVIVOR_HEAVY         = 4;
export const SIM_RESULT_CRITICAL_MASS          = 5;
export const SIM_RESULT_CRITICAL_MASS_TIME     = 6;
export const SIM_RESULT_TIME_TO_DEF_COLLAPSE   = 7;
export const SIM_RESULT_TIME_TO_CAPTURE_START  = 8;
export const SIM_RESULT_TIME_TO_FULL_CAPTURE   = 9;
export const SIM_RESULT_FINAL_OWNER_SIDE       = 10;
export const SIM_RESULT_CAPTURE_PROGRESS       = 11;
export const SIM_RESULT_STOP_REASON            = 12;
export const SIM_RESULT_SIZE                   = 13;

// ═══════════════════════════════════════════════════════════════════
//  HELPERS (module-level, zero-allocation)
// ═══════════════════════════════════════════════════════════════════

export function countAt(node, faction) {
    return node.counts ? (node.counts[faction] || 0) : 0;
}

export function countNonFaction(node, faction) {
    let total = 0;
    if (node.counts) {
        for (const f in node.counts) {
            if (f !== faction) total += (node.counts[f] || 0);
        }
    }
    return total;
}
