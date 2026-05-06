/**
 * ai_diplomacy.js — Sistema de Diplomacia y Filtros de Objetivo
 *
 * Fase 3 del Plan de Mejora AI.
 * Controla qué facciones puede atacar cada IA, diferencia
 * objetivos neutrales de presión al jugador, y permite
 * configurar relaciones entre IAs para evitar free-for-all
 * indeseados o para habilitarlos con control.
 *
 * MODOS DE DIPLOMACIA:
 *   - antiPlayerWithNeutralExpansion (default): solo atacar player y neutrales
 *   - controlledFreeForAll: todos son hostiles, pero con penalización anti-péndulo fuerte
 *   - custom: usar hostileTo/neutralTo/allyTo del perfil de diplomacia
 */

// ═══════════════════════════════════════════════════════════════════
//  TARGET CATEGORIES
// ═══════════════════════════════════════════════════════════════════

export const TARGET_NEUTRAL_ECONOMY = 'neutral_economy';
export const TARGET_PLAYER_PRESSURE = 'player_pressure';
export const TARGET_HOSTILE_AI      = 'hostile_ai';
export const TARGET_ALLIED_IGNORED  = 'allied_ignored';

// ═══════════════════════════════════════════════════════════════════
//  CORE DIPLOMACY CHECK
// ═══════════════════════════════════════════════════════════════════

/**
 * Determina si una facción AI puede atacar a un dueño de nodo dado.
 *
 * @param {object}  profile       — Perfil resuelto de AI (de ai_config.resolveAIProfile)
 * @param {string}  sourceFaction — Facción atacante (e.g. 'enemy')
 * @param {string}  targetOwner   — Dueño del nodo objetivo (e.g. 'player', 'neutral', 'fuego')
 * @param {string}  playerFaction — ID de la facción del jugador
 * @returns {boolean}
 */
export function canTargetFaction(profile, sourceFaction, targetOwner, playerFaction) {
    // Never attack yourself
    if (targetOwner === sourceFaction) return false;

    // Check custom diplomacy relations first
    if (profile.diplomacy && profile.diplomacy[sourceFaction]) {
        const relations = profile.diplomacy[sourceFaction];

        // Explicit ally — never attack
        if (relations.allyTo && relations.allyTo.includes(targetOwner)) return false;

        // Explicit neutral — don't attack unless provoked (handled elsewhere)
        if (relations.neutralTo && relations.neutralTo.includes(targetOwner)) return false;

        // Explicit hostile — always allowed
        if (relations.hostileTo && relations.hostileTo.includes(targetOwner)) return true;
    }

    // Check allowedTargets from resolved profile
    const allowed = profile.allowedTargets;
    if (!allowed || allowed.length === 0) {
        // Default: expand through neutrals and pressure the player
        return targetOwner === 'neutral' || targetOwner === playerFaction;
    }

    for (let i = 0; i < allowed.length; i++) {
        const rule = allowed[i];
        if (rule === 'all') return true;
        if (rule === 'neutral' && targetOwner === 'neutral') return true;
        if (rule === 'player' && targetOwner === playerFaction) return true;
        if (rule === 'ai' && targetOwner !== 'neutral' && targetOwner !== playerFaction && targetOwner !== sourceFaction) return true;
        if (rule === targetOwner || rule === `faction:${targetOwner}`) return true;
    }

    return false;
}

/**
 * Clasifica el tipo de objetivo para aplicar pesos diferenciados.
 *
 * @param {string} targetOwner   — Dueño del nodo objetivo
 * @param {string} sourceFaction — Facción atacante
 * @param {string} playerFaction — ID de la facción del jugador
 * @returns {string} Una de las constantes TARGET_*
 */
export function classifyTarget(targetOwner, sourceFaction, playerFaction) {
    if (targetOwner === 'neutral') return TARGET_NEUTRAL_ECONOMY;
    if (targetOwner === playerFaction) return TARGET_PLAYER_PRESSURE;
    if (targetOwner === sourceFaction) return TARGET_ALLIED_IGNORED;
    return TARGET_HOSTILE_AI;
}

/**
 * Score modifier de diplomacia para un objetivo.
 * Retorna un multiplicador (0.0 a 2.0) que ajusta el score de ataque.
 *
 * @param {object}  profile       — Perfil resuelto de AI
 * @param {string}  targetOwner   — Dueño del nodo
 * @param {string}  sourceFaction — Facción atacante
 * @param {string}  playerFaction — ID del jugador
 * @returns {number} Multiplicador (1.0 = normal)
 */
export function getDiplomacyScoreMult(profile, targetOwner, sourceFaction, playerFaction) {
    const category = classifyTarget(targetOwner, sourceFaction, playerFaction);

    switch (category) {
        case TARGET_NEUTRAL_ECONOMY:
            // Expansion focus boosts neutral attacks
            if (profile.doctrine === 'expansion' || profile.doctrine === 'cautiousExpansion') return 1.3;
            if (profile.doctrine === 'turtle' || profile.doctrine === 'fortress') return 0.6;
            return 1.0;

        case TARGET_PLAYER_PRESSURE:
            // Rush and aggressive doctrines boost player attacks
            if (profile.doctrine === 'rush' || profile.doctrine === 'raider') return 1.5;
            if (profile.doctrine === 'turtle') return 0.7;
            if (profile.doctrine === 'expansion' || profile.doctrine === 'cautiousExpansion') return 0.8;
            return 1.0;

        case TARGET_HOSTILE_AI:
            // AI-vs-AI attacks are always deprioritized unless in free-for-all
            if (profile.diplomacyMode === 'controlledFreeForAll') return 0.7;
            return 0.4;

        case TARGET_ALLIED_IGNORED:
            return 0.0;

        default:
            return 1.0;
    }
}
