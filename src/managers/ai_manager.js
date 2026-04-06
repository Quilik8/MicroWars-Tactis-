/**
 * AI Manager — MicroWars v4 (Pilar 5: Motor de Utilidad)
 *
 * Refactorizado para usar el UtilityEngine (Cerebro Central), que
 * parametriza toda la decisión táctica mediante arquetipos numéricos
 * y delega el esfuerzo pesado a los simuladores con time-slicing.
 *
 * ZERO-ALLOCATION pipeline en la evaluación.
 */

import { UtilityEngine } from '../simulation/utility_engine.js';
import { PredictiveCombatSimulator } from '../simulation/predictive_combat_simulator.js';
import { OptimalDeploymentSolver } from '../simulation/optimal_deployment_solver.js';
import { OpportunityAnalyzer } from '../simulation/opportunity_analyzer.js';
import { NavigationGameStateView, PathEvaluationResult } from '../navigation/navigation_system.js';

export class AIManager {
    /**
     * @param {object} config
     * @param {string} [config.difficulty='normal']  'easy'|'normal'|'hard'|'brutal'
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

        // Configurar arquetipo inicial
        this.setDifficulty(this.difficulty);

        if (config.attackInterval != null) {
            // Retro-compatibilidad si algún test fuerza el intervalo
            // (El motor internamente usa los pesos del arquetipo, pero dejamos sto stubbed)
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
    }

    // === MAIN LOOP ===
    update(dt, nodes, allUnits, aiFaction = 'enemy', playerFaction = 'player') {
        if (!this.world || nodes.length === 0) return;

        // 1. Pilar 2: Siempre requiere snapshot actualizado del tablero
        if (this._mentalSandbox) {
            this._mentalSandbox.rebuildFutureLedger(this.world);
        }

        // 2. Pilar 4: Analizador de Oportunidades
        // (el UtilityEngine lo consultará para el multiplicador de urgencia)
        if (this._opportunityAnalyzer) {
            this._opportunityAnalyzer.update(dt, this.world, playerFaction, aiFaction);
        }

        // 3. Pilar 5: Evaluar estado global y escribir decisiones en el Command Buffer
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
            this._navExecResult
        );

        // 4. Transformar Comandos en Acciones
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
