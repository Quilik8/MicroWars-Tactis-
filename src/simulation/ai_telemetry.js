/**
 * ai_telemetry.js — Sistema de Telemetría de Decisiones de IA
 *
 * Fase 1 del Plan de Mejora AI.
 * Registra cada decisión, veto y desglose de score para permitir
 * diagnóstico en tiempo real del comportamiento de la IA.
 *
 * ACTIVACIÓN: window.__AI_TELEMETRY = true
 * ZERO-COST: Cuando está desactivado, todas las llamadas son no-ops.
 *
 * Uso en consola del navegador:
 *   window.__AI_TELEMETRY = true;
 *   window.__aiTelemetry.getTopDecisions('enemy', 10);
 *   window.__aiTelemetry.getVetos('enemy', 10);
 *   window.__aiTelemetry.dump('enemy');
 */

const MAX_ENTRIES = 64;

// ═══════════════════════════════════════════════════════════════════
//  DECISION ENTRY (pooled, reused to avoid allocation)
// ═══════════════════════════════════════════════════════════════════

function createEntry() {
    return {
        time: 0,
        faction: '',
        sourceIndex: -1,
        targetIndex: -1,
        action: '',
        scoreTotal: 0,
        // Score breakdown
        scoreBase: 0,
        scoreDistance: 0,
        scorePhase: 0,
        scoreOpportunity: 0,
        scoreHazard: 0,
        scoreMemory: 0,
        scoreDiplomacy: 0,
        scoreDefenders: 0,
        scoreEvolution: 0,
        // Troop info
        troopsEstimated: 0,
        casualtiesProjected: 0,
        garrisonRemaining: 0,
        // Veto
        isVeto: false,
        vetoReason: '',
        // Extra context
        targetOwner: '',
        targetEvolution: '',
        phase: '',
        routeViable: true,
        suggestedDelay: 0,
    };
}

function resetEntry(e) {
    e.time = 0;
    e.faction = '';
    e.sourceIndex = -1;
    e.targetIndex = -1;
    e.action = '';
    e.scoreTotal = 0;
    e.scoreBase = 0;
    e.scoreDistance = 0;
    e.scorePhase = 0;
    e.scoreOpportunity = 0;
    e.scoreHazard = 0;
    e.scoreMemory = 0;
    e.scoreDiplomacy = 0;
    e.scoreDefenders = 0;
    e.scoreEvolution = 0;
    e.troopsEstimated = 0;
    e.casualtiesProjected = 0;
    e.garrisonRemaining = 0;
    e.isVeto = false;
    e.vetoReason = '';
    e.targetOwner = '';
    e.targetEvolution = '';
    e.phase = '';
    e.routeViable = true;
    e.suggestedDelay = 0;
}

// ═══════════════════════════════════════════════════════════════════
//  FACTION RING BUFFER
// ═══════════════════════════════════════════════════════════════════

class FactionLog {
    constructor() {
        this._entries = [];
        for (let i = 0; i < MAX_ENTRIES; i++) {
            this._entries.push(createEntry());
        }
        this._head = 0;
        this._count = 0;
    }

    push() {
        const entry = this._entries[this._head];
        resetEntry(entry);
        this._head = (this._head + 1) % MAX_ENTRIES;
        if (this._count < MAX_ENTRIES) this._count++;
        return entry;
    }

    getRecent(n) {
        const result = [];
        const count = Math.min(n, this._count);
        for (let i = 0; i < count; i++) {
            const idx = (this._head - 1 - i + MAX_ENTRIES) % MAX_ENTRIES;
            result.push(this._entries[idx]);
        }
        return result;
    }

    getDecisions(n) {
        const result = [];
        let checked = 0;
        for (let i = 0; i < this._count && result.length < n; i++) {
            const idx = (this._head - 1 - i + MAX_ENTRIES) % MAX_ENTRIES;
            const e = this._entries[idx];
            if (!e.isVeto) result.push(e);
            checked++;
        }
        return result;
    }

    getVetos(n) {
        const result = [];
        for (let i = 0; i < this._count && result.length < n; i++) {
            const idx = (this._head - 1 - i + MAX_ENTRIES) % MAX_ENTRIES;
            const e = this._entries[idx];
            if (e.isVeto) result.push(e);
        }
        return result;
    }

    reset() {
        this._head = 0;
        this._count = 0;
    }
}

// ═══════════════════════════════════════════════════════════════════
//  AI TELEMETRY SINGLETON
// ═══════════════════════════════════════════════════════════════════

const PHASE_NAMES = ['early', 'mid', 'late'];
const ACTION_NAMES = ['attack', 'reinforce', 'evolve_tank', 'evolve_thorn', 'evolve_art', 'tunnel', 'retreat', 'wait'];

export class AITelemetry {
    constructor() {
        this._logs = Object.create(null);
    }

    /** @returns {boolean} Whether telemetry is active */
    static get active() {
        return typeof window !== 'undefined' && !!window.__AI_TELEMETRY;
    }

    _getFactionLog(faction) {
        let log = this._logs[faction];
        if (!log) {
            log = new FactionLog();
            this._logs[faction] = log;
        }
        return log;
    }

    /**
     * Record a decision (attack, reinforce, evolve, etc.)
     */
    recordDecision(faction, sourceIndex, targetIndex, actionCode, scoreTotal, breakdown, troops, phase) {
        if (!AITelemetry.active) return;

        const log = this._getFactionLog(faction);
        const e = log.push();
        e.time = performance.now();
        e.faction = faction;
        e.sourceIndex = sourceIndex;
        e.targetIndex = targetIndex;
        e.action = ACTION_NAMES[actionCode] || `action_${actionCode}`;
        e.scoreTotal = scoreTotal;
        e.phase = PHASE_NAMES[phase] || 'unknown';

        if (breakdown) {
            e.scoreBase = breakdown.base || 0;
            e.scoreDistance = breakdown.distance || 0;
            e.scorePhase = breakdown.phase || 0;
            e.scoreOpportunity = breakdown.opportunity || 0;
            e.scoreHazard = breakdown.hazard || 0;
            e.scoreMemory = breakdown.memory || 0;
            e.scoreDiplomacy = breakdown.diplomacy || 0;
            e.scoreDefenders = breakdown.defenders || 0;
            e.scoreEvolution = breakdown.evolution || 0;
        }

        if (troops) {
            e.troopsEstimated = troops.estimated || 0;
            e.casualtiesProjected = troops.casualties || 0;
            e.garrisonRemaining = troops.garrison || 0;
            e.targetOwner = troops.targetOwner || '';
            e.targetEvolution = troops.targetEvolution || '';
            e.routeViable = troops.routeViable !== false;
            e.suggestedDelay = troops.suggestedDelay || 0;
        }
    }

    /**
     * Record a veto (action rejected by the scoring pipeline).
     */
    recordVeto(faction, sourceIndex, targetIndex, actionCode, reason, phase) {
        if (!AITelemetry.active) return;

        const log = this._getFactionLog(faction);
        const e = log.push();
        e.time = performance.now();
        e.faction = faction;
        e.sourceIndex = sourceIndex;
        e.targetIndex = targetIndex;
        e.action = ACTION_NAMES[actionCode] || `action_${actionCode}`;
        e.isVeto = true;
        e.vetoReason = reason;
        e.phase = PHASE_NAMES[phase] || 'unknown';
    }

    /**
     * Get top N recent decisions for a faction.
     */
    getTopDecisions(faction, n = 10) {
        const log = this._logs[faction];
        if (!log) return [];
        return log.getDecisions(n);
    }

    /**
     * Get top N recent vetos for a faction.
     */
    getVetos(faction, n = 10) {
        const log = this._logs[faction];
        if (!log) return [];
        return log.getVetos(n);
    }

    /**
     * Dump all recent entries for a faction to console.
     */
    dump(faction) {
        const log = this._logs[faction];
        if (!log) {
            console.log(`[AI Telemetry] No data for faction '${faction}'`);
            return;
        }
        const entries = log.getRecent(MAX_ENTRIES);
        console.group(`[AI Telemetry] ${faction} — ${entries.length} entries`);
        for (const e of entries) {
            if (e.isVeto) {
                console.log(
                    `%cVETO %c${e.action} src:${e.sourceIndex} tgt:${e.targetIndex} — ${e.vetoReason}`,
                    'color: #ff5252; font-weight: bold',
                    'color: #ccc'
                );
            } else {
                console.log(
                    `%c${e.action} %csrc:${e.sourceIndex} → tgt:${e.targetIndex} score:${e.scoreTotal.toFixed(0)} troops:${e.troopsEstimated} casualties:${e.casualtiesProjected} phase:${e.phase}`,
                    'color: #69f0ae; font-weight: bold',
                    'color: #ccc'
                );
                console.log(
                    `  base:${e.scoreBase.toFixed(0)} dist:${e.scoreDistance.toFixed(0)} phase:${e.scorePhase.toFixed(0)} opp:${e.scoreOpportunity.toFixed(0)} hazard:${e.scoreHazard.toFixed(0)} mem:${e.scoreMemory.toFixed(0)} def:${e.scoreDefenders.toFixed(0)}`
                );
            }
        }
        console.groupEnd();
    }

    /** Reset all logs (on level change). */
    reset() {
        for (const faction in this._logs) {
            this._logs[faction].reset();
        }
    }
}

// Singleton global para acceso desde consola
export const telemetry = new AITelemetry();
if (typeof window !== 'undefined') {
    window.__aiTelemetry = telemetry;
}
