import { RTSAIRuntime } from '../simulation/rts_ai_runtime.js?v=rts-balance-thorns-20261029-1';
/**
 * AI Manager — MicroWars v4 (Pilar 5: Motor de Utilidad)
 *
 * Refactorizado para usar el UtilityEngine (Cerebro Central), que
 * parametriza toda la decisión táctica mediante arquetipos numéricos
 * y delega el esfuerzo pesado a los simuladores con time-slicing.
 *
 * ZERO-ALLOCATION pipeline en la evaluación.
 *
 * Capa 1.1: Timers per-facción aislados — cada facción enemiga tiene
 *           su propio evalTimer/evoTimer/simTime para evitar la
 *           acumulación ×N que aceleraba artificialmente la IA.
 */

import { UtilityEngine } from '../simulation/utility_engine.js?v=rts-balance-thorns-20261029-1';
import { PredictiveCombatSimulator } from '../simulation/predictive_combat_simulator.js';
import { OptimalDeploymentSolver } from '../simulation/optimal_deployment_solver.js';
import { OpportunityAnalyzer } from '../simulation/opportunity_analyzer.js';
import { NavigationGameStateView, PathEvaluationResult } from '../navigation/navigation_system.js';

export class LegacyAIManager {
    /**
     * @param {object} config
     * @param {string} [config.difficulty='normal']  'easy'|'normal'|'hard'
     * @param {number} [config.attackInterval]       override manual (retro-compatibilidad)
     * @param {object} [config.worldRef]             referencia al worldManager
     */
    constructor(config = {}) {
        this.world = config.worldRef || null;
        this.difficulty = config.difficulty || 'normal';

        // Inicializar Pilares 2, 3 y 4
        this._mentalSandbox = new PredictiveCombatSimulator();
        this._deploymentSolver = new OptimalDeploymentSolver(this._mentalSandbox);
        this._opportunityAnalyzer = new OpportunityAnalyzer();

        // Pilar 5: Motor de Utilidad
        this._engine = new UtilityEngine(
            this._mentalSandbox,
            this._deploymentSolver,
            this._opportunityAnalyzer
        );

        // Pre-asignaciones para el Pilar 1 (Navegación)
        this._navStateView = new NavigationGameStateView();
        this._navScoreResult = new PathEvaluationResult();
        this._navExecResult = new PathEvaluationResult();

        // ── Capa 1.1: Timers per-facción ────────────────────────────
        // Cada facción enemiga tiene sus propios timers para que la
        // cadencia real no se multiplique al evaluar N facciones/frame.
        this._factionTimers = Object.create(null);

        // Configurar arquetipo inicial
        this.setDifficulty(this.difficulty);

        if (config.attackInterval != null) {
            // Retro-compatibilidad si algún test fuerza el intervalo
        }
    }

    setDifficulty(difficulty) {
        this.difficulty = difficulty;
        this._engine.setArchetype(difficulty);
    }

    // === MÉTODOS DE LA API VIEJA ===
    // Compatibilidad en caso de que otros módulos intenten resetear el estado
    reset() {
        this._engine.reset();
        if (this._opportunityAnalyzer && this.world) {
            this._opportunityAnalyzer.reset(this.world);
        }
        // Limpiar timers de todas las facciones
        for (const key in this._factionTimers) {
            delete this._factionTimers[key];
        }
    }

    /**
     * Capa 1.1: Obtiene o crea el bloque de timers para una facción.
     * @private
     */
    _getTimers(faction) {
        let t = this._factionTimers[faction];
        if (!t) {
            t = { evalTimer: 0, evoTimer: 0, simTime: 0, lastCaptureTime: 0 };
            this._factionTimers[faction] = t;
        }
        return t;
    }

    // === MAIN LOOP ===
    update(dt, nodes, allUnits, aiFaction = 'enemy', playerFaction = 'player') {
        if (!this.world || nodes.length === 0) return;

        // Capa 1.1: Filtrar facciones que no tienen nodos (ahorra CPU)
        let hasNodesForFaction = false;
        for (let i = 0; i < nodes.length; i++) {
            if (nodes[i].owner === aiFaction) { hasNodesForFaction = true; break; }
        }
        if (!hasNodesForFaction) return;

        // 1. Pilar 2: Siempre requiere snapshot actualizado del tablero
        if (this._mentalSandbox) {
            this._mentalSandbox.rebuildFutureLedger(this.world);
        }

        // 2. Pilar 4: Analizador de Oportunidades
        if (this._opportunityAnalyzer) {
            this._opportunityAnalyzer.update(dt, this.world, playerFaction, aiFaction);
        }

        // 3. Capa 1.1: Obtener timers aislados para esta facción
        const timers = this._getTimers(aiFaction);

        // 4. Pilar 5: Evaluar estado global con timers per-facción
        const cmdsWritten = this._engine.evaluate(
            dt,
            this.world,
            nodes,
            allUnits,
            aiFaction,
            playerFaction,
            this.world.navigation,
            this._navStateView,
            this._navScoreResult,
            this._navExecResult,
            timers     // ← Capa 1.1: timers per-facción
        );

        // 5. Transformar Comandos en Acciones
        if (cmdsWritten > 0) {
            this._engine.executeCommands(
                allUnits,
                nodes,
                aiFaction,
                this.world,
                this._navExecResult
            );
        }
    }

    // Helper que el mundo o debug tools podrían necesitar
    getOpportunityAnalyzer() {
        return this._opportunityAnalyzer;
    }
}


/** Public coordinator. Reference engine is only instantiated for developer comparisons. */
export class AIManager {
    constructor(config = {}) {
        this.config = config;
        this.world = config.worldRef;
        this.difficulty = config.difficulty || 'normal';
        this.mode = config.mode === 'reference' ? 'reference' : 'progressive';
        this.runtime = new RTSAIRuntime(config);
        this.debug = typeof location !== 'undefined' && new URLSearchParams(location.search).has('ai-debug');
        this._nextDebug = 0;
        this.reference = null;
        if (typeof window !== 'undefined') window.__rtsAI = this;
    }
    setMode(mode) {
        if (!['reference', 'progressive'].includes(mode)) throw new Error('Unknown RTS AI mode');
        this.reset(); this.mode = mode;
        if (mode === 'reference') this.reference ??= new LegacyAIManager({ ...this.config, difficulty: this.difficulty, worldRef: this.world });
    }
    setDifficulty(d) {
        this.difficulty = d; this.runtime.setDifficulty(d); this.reference?.setDifficulty(d);
    }
    reset() { this.runtime.reset(); this.reference?.reset(); this._nextDebug = 0; this._compatTime = undefined; }
    updateAll(dt, factions, playerFaction = 'player') {
        if (!this.world) return;
        this.runtime.world = this.world;
        if (this.mode === 'reference') {
            this.reference ??= new LegacyAIManager({ ...this.config, difficulty: this.difficulty });
            for (const f of factions) this.reference.update(dt, this.world.nodes, this.world.allUnits, f, playerFaction);
        } else this.runtime.updateAll(dt, factions, playerFaction);
        if (this.debug && this.world.simTime >= this._nextDebug) {
            this._nextDebug = this.world.simTime + 2;
            document.documentElement.dataset.rtsAiDiagnostics = JSON.stringify(this.diagnostics());
        }
    }
    // Compatibility for integrations outside main.js; one observation per world instant.
    update(dt, nodes, units, aiFaction = 'enemy', playerFaction = 'player') {
        if (!this.world) return;
        if (this._compatTime === this.world.simTime) return;
        this._compatTime = this.world.simTime;
        const factions = new Set();
        for (const n of nodes) if (n.owner !== playerFaction && n.owner !== 'neutral') factions.add(n.owner);
        for (const u of units) if (!u.pendingRemoval && u.faction !== playerFaction && u.faction !== 'neutral') factions.add(u.faction);
        this.updateAll(dt, [...factions], playerFaction);
    }
    diagnostics() { return this.runtime.diagnostics(); }
    // Explicit local export only. Never uploads or sends telemetry.
    exportDiagnostics() {
        return JSON.stringify({ schema: 'microwars-rts-ai-activity-1', createdAt: new Date().toISOString(),
            difficulty: this.difficulty, ...this.diagnostics() }, null, 2);
    }
    getOpportunityAnalyzer() { return this.reference?.getOpportunityAnalyzer() || null; }
}
