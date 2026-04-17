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

import { UtilityEngine } from '../simulation/utility_engine.js';
import { PredictiveCombatSimulator } from '../simulation/predictive_combat_simulator.js';
import { OptimalDeploymentSolver } from '../simulation/optimal_deployment_solver.js';
import { OpportunityAnalyzer } from '../simulation/opportunity_analyzer.js';
import { NavigationGameStateView, PathEvaluationResult } from '../navigation/navigation_system.js';

export class AIManager {
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
