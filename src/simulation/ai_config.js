/**
 * ai_config.js — Sistema de Configuración Modular de IA
 *
 * Fase 2 del Plan de Mejora AI.
 * Centraliza defaults, merge profundo, validación y resolución de
 * perfiles de IA por facción/sector/nivel/dificultad.
 *
 * FLUJO DE MERGE:
 *   defaults globales → sector.ai → level.ai → faction override → difficulty override
 *
 * COMPATIBILIDAD:
 *   Acepta tanto el formato legacy `aiStrategy` como el nuevo `ai`.
 *   Las keys legacy se traducen automáticamente.
 */

import { DEFAULT_ANTI_PENDULUM } from './ai_memory.js';

// ═══════════════════════════════════════════════════════════════════
//  DEFAULTS GLOBALES
// ═══════════════════════════════════════════════════════════════════

export const AI_DEFAULTS = Object.freeze({
    // Doctrine: balanced | expansion | turtle | raider | fortress | rush | timing | cautiousExpansion
    doctrine: 'balanced',

    // Diplomacy mode: antiPlayerWithNeutralExpansion | controlledFreeForAll | custom
    diplomacyMode: 'antiPlayerWithNeutralExpansion',

    // Targets this faction can attack
    // Values: 'player', 'neutral', 'ai', 'all', or specific faction names
    allowedTargets: null, // null = use diplomacyMode default

    // Aggression multiplier applied to attack scores
    aggressionMult: 1.0,

    // Focus: expansion | turtle | rush | null (legacy compat)
    focus: null,

    // Evolution preferences
    preferredEvolution: null,  // 'espinoso' | 'tanque' | 'artilleria' | null
    minEvolutionGarrison: null, // null = use adaptive calculation

    // Post-capture garrison requirements
    minPostCaptureGarrison: 10,

    // Hazard policy: strict | cautious | normal | reckless | none
    hazardPolicy: 'normal',

    // Maximum casualty ratio before vetoing a route
    maxRouteCasualtyRatio: 0.35,

    // Extra garrison added when route has hazards
    hazardGarrisonBonus: 5,

    // Hazard-specific policies
    hazards: null,

    // Anti-pendulum configuration (null = use DEFAULT_ANTI_PENDULUM)
    antiPendulum: null,

    // Diplomacy relations (for custom diplomacyMode)
    diplomacy: null,

    // Faction-specific overrides
    factions: null,

    // Difficulty-specific overrides
    difficultyOverrides: null,
});

// Keys conocidas para validación
const KNOWN_KEYS = new Set(Object.keys(AI_DEFAULTS).concat([
    // Legacy aliases
    'hazardFatalityRatio',
    'focus',
    // Extra valid keys
    'hostileTo', 'neutralTo', 'allyTo',
]));

// ═══════════════════════════════════════════════════════════════════
//  LEGACY ADAPTER
// ═══════════════════════════════════════════════════════════════════

/**
 * Traduce keys legacy de aiStrategy al formato moderno.
 * No muta el objeto original.
 */
function adaptLegacy(raw) {
    if (!raw) return null;
    const adapted = { ...raw };

    // hazardFatalityRatio → maxRouteCasualtyRatio
    if ('hazardFatalityRatio' in adapted && !('maxRouteCasualtyRatio' in adapted)) {
        adapted.maxRouteCasualtyRatio = adapted.hazardFatalityRatio;
    }

    return adapted;
}

// ═══════════════════════════════════════════════════════════════════
//  DEEP MERGE
// ═══════════════════════════════════════════════════════════════════

/**
 * Merge profundo de dos objetos planos o con un nivel de anidamiento.
 * No muta ninguno de los dos; devuelve un objeto nuevo.
 * antiPendulum y hazards se mergen a un nivel.
 * factions y difficultyOverrides se mergen por key.
 */
function deepMerge(base, override) {
    if (!override) return base ? { ...base } : {};
    if (!base) return { ...override };

    const result = { ...base };

    for (const key in override) {
        if (override[key] === undefined) continue;

        const val = override[key];

        if (key === 'antiPendulum') {
            if (val === false) {
                result[key] = false;
            } else if (val && typeof val === 'object') {
                result[key] = { ...(base[key] && typeof base[key] === 'object' ? base[key] : {}), ...val };
            } else {
                result[key] = val;
            }
        } else if (key === 'hazards' && val && typeof val === 'object') {
            const baseHazards = base[key] && typeof base[key] === 'object' ? base[key] : {};
            result[key] = {};
            for (const hk in baseHazards) {
                result[key][hk] = { ...baseHazards[hk] };
            }
            for (const hk in val) {
                result[key][hk] = { ...(result[key][hk] || {}), ...val[hk] };
            }
        } else if ((key === 'factions' || key === 'difficultyOverrides' || key === 'diplomacy') && val && typeof val === 'object') {
            const baseObj = base[key] && typeof base[key] === 'object' ? base[key] : {};
            result[key] = {};
            for (const fk in baseObj) {
                result[key][fk] = typeof baseObj[fk] === 'object' ? { ...baseObj[fk] } : baseObj[fk];
            }
            for (const fk in val) {
                if (typeof val[fk] === 'object' && val[fk] !== null) {
                    result[key][fk] = { ...(result[key][fk] || {}), ...val[fk] };
                } else {
                    result[key][fk] = val[fk];
                }
            }
        } else if (key === 'allowedTargets' && Array.isArray(val)) {
            result[key] = [...val];
        } else {
            result[key] = val;
        }
    }

    return result;
}

// ═══════════════════════════════════════════════════════════════════
//  PROFILE RESOLUTION
// ═══════════════════════════════════════════════════════════════════

/**
 * Resuelve el perfil completo de IA para una facción dada.
 *
 * @param {object|null} sectorAI — sector.ai o sector.aiStrategy
 * @param {object|null} levelAI  — level.ai o level.aiStrategy
 * @param {string}      faction  — 'enemy', 'fuego', etc.
 * @param {string}      difficulty — 'easy', 'normal', 'hard'
 * @returns {object} Perfil resuelto (no congelado, para permitir lectura rápida)
 */
export function resolveAIProfile(sectorAI, levelAI, faction, difficulty) {
    // 1. Start with global defaults
    let profile = { ...AI_DEFAULTS, antiPendulum: { ...DEFAULT_ANTI_PENDULUM } };

    // 2. Merge sector config
    const adaptedSector = adaptLegacy(sectorAI);
    if (adaptedSector) {
        profile = deepMerge(profile, adaptedSector);
    }

    // 3. Merge level config
    const adaptedLevel = adaptLegacy(levelAI);
    if (adaptedLevel) {
        profile = deepMerge(profile, adaptedLevel);
    }

    // 4. Apply faction override
    if (profile.factions && profile.factions[faction]) {
        const factionOverride = adaptLegacy(profile.factions[faction]);
        const factionDiffOverrides = factionOverride.difficultyOverrides;
        // Merge faction fields into profile (excluding nested factions)
        const { factions: _, difficultyOverrides: fdo, ...factionFlat } = factionOverride;
        profile = deepMerge(profile, factionFlat);

        // Faction-level difficulty overrides
        if (factionDiffOverrides && factionDiffOverrides[difficulty]) {
            const fdoResolved = adaptLegacy(factionDiffOverrides[difficulty]);
            profile = deepMerge(profile, fdoResolved);
        }
    }

    // 5. Apply global difficulty override
    if (profile.difficultyOverrides && profile.difficultyOverrides[difficulty]) {
        const diffOverride = adaptLegacy(profile.difficultyOverrides[difficulty]);
        profile = deepMerge(profile, diffOverride);
    }

    // 6. Resolve antiPendulum
    if (profile.antiPendulum === false) {
        profile.antiPendulum = {
            ...DEFAULT_ANTI_PENDULUM,
            targetCooldownSec: 0,
            sourceCooldownSec: 0,
            recaptureCooldownSec: 0,
            maxFlipsBeforePenalty: 255,
            recentAttackPenalty: 0,
            flipPenalty: 0,
            sourceRepeatPenalty: 0,
        };
    } else if (!profile.antiPendulum) {
        profile.antiPendulum = { ...DEFAULT_ANTI_PENDULUM };
    }

    // 7. Derive allowedTargets from diplomacyMode if not explicitly set
    if (!profile.allowedTargets) {
        switch (profile.diplomacyMode) {
            case 'controlledFreeForAll':
                profile.allowedTargets = ['all'];
                break;
            case 'antiPlayerWithNeutralExpansion':
            default:
                profile.allowedTargets = ['player', 'neutral'];
                break;
        }
    }

    return profile;
}

/**
 * Validate an AI config object and warn about unknown keys.
 * Only runs in development (when window.__AI_DEBUG is set).
 */
export function validateAIConfig(config, context) {
    if (typeof window === 'undefined' || !window.__AI_DEBUG) return;
    if (!config || typeof config !== 'object') return;

    for (const key in config) {
        if (!KNOWN_KEYS.has(key) && key !== 'factions' && key !== 'difficultyOverrides'
            && key !== 'hazards' && key !== 'diplomacy') {
            console.warn(`[AIConfig] Unknown key '${key}' in ${context || 'ai config'}`);
        }
    }
}
