/**
 * OptimalDeploymentSolver — Pilar 3: Asignador Óptimo de Tropas
 *
 * Calcula la cantidad mínima de unidades (ligeras y pesadas) requeridas
 * para lograr un estado objetivo en el MentalSandbox, respetando las
 * reservas de defensa locales.
 *
 * ZERO-ALLOCATION: No instancia objetos ni arrays en el hot path.
 *                   Usa Typed Arrays pre-asignados exclusivamente.
 *
 * COMPLEJIDAD: O(log N) llamadas al simulador (≤7 típico, ≤10 peor caso)
 *              mediante búsqueda binaria adaptativa con sondeo exponencial.
 *
 * DETERMINISMO: Mismo input → mismo output. Sin Math.random().
 */

import {
    RESULT_VICTORIA_PIRRICA,
    RESULT_VICTORIA_SEGURA,
    EVOLUTION_ESPINOSO,
    EVOLUTION_ARTILLERIA,
    UNIT_POWER_HEAVY,
    getEvolutionCode,
    CAPTURE_LOW_THRESHOLD,
} from './deterministic_rules.js';

import { PredictiveCombatSimulator } from './predictive_combat_simulator.js';

// ── Condiciones de éxito ────────────────────────────────────────────
export const SUCCESS_VICTORIA = 0;   // PIRRICA o SEGURA
export const SUCCESS_SEGURA   = 1;   // Solo VICTORIA_SEGURA

// ── Buffer de salida (DeploymentResultBuffer indices) ───────────────
export const OUT_RECOMMENDED_LIGHT      = 0;
export const OUT_RECOMMENDED_HEAVY      = 1;
export const OUT_TOTAL_POWER_COST       = 2;
export const OUT_EXPECTED_SURVIVORS_PWR = 3;
export const OUT_IS_VALID               = 4;
export const OUT_CRITICAL_MASS_BONUS    = 5;
export const OUT_SIMULATOR_CALLS        = 6;
export const OUT_A_MIN_BODIES           = 7;

// ── Índices internos del resultado del simulador ────────────────────
const SIM_RESULT_CODE      = 0;
const SIM_SURVIVOR_POWER   = 2;
const SIM_CRITICAL_MASS    = 5;

// ── Constantes de búsqueda ──────────────────────────────────────────
const BISECT_STEP           = 5;     // Granularidad mínima (cuerpos)
const INITIAL_PROBE         = 15;    // Primer sondeo exponencial
const CRITICAL_MASS_EXTRA   = 1.15;  // +15% para verificar overwhelm


export class OptimalDeploymentSolver {
    static RESULT_BUFFER_SIZE = 8;

    /**
     * @param {PredictiveCombatSimulator} simulator — instancia compartida del Pilar 2
     */
    constructor(simulator) {
        this._simulator = simulator;

        // Buffers pre-asignados (ZERO ALLOCATION)
        this._simResult          = new Float32Array(PredictiveCombatSimulator.RESULT_SIZE);
        this._compositionScratch = new Int32Array(4); // [light, heavy, totalBodies, totalPower]

        // Scratch para _findMinimumBodies (evita crear objetos)
        this._searchAMin  = 0;
        this._searchCalls = 0;
    }

    // ═══════════════════════════════════════════════════════════════
    //  API PÚBLICA
    // ═══════════════════════════════════════════════════════════════

    /**
     * Calcula el despliegue óptimo de tropas.
     *
     * @param {object}       world
     * @param {object}       originNode
     * @param {object}       targetNode
     * @param {number}       maxLightToSend   — ligeras idle disponibles
     * @param {number}       maxHeavyToSend   — pesadas idle disponibles
     * @param {string}       attackerFaction
     * @param {number}       successCondition — SUCCESS_VICTORIA | SUCCESS_SEGURA
     * @param {number}       securityMargin   — multiplicador (ej: 1.25)
     * @param {object|null}  routeResult      — de NavigationSystem
     * @param {Float32Array} outBuffer        — pre-asignado, RESULT_BUFFER_SIZE
     * @returns {boolean}    true si se encontró un despliegue válido
     */
    calculateOptimalDeployment(
        world, originNode, targetNode,
        maxLightToSend, maxHeavyToSend,
        attackerFaction, successCondition, securityMargin,
        routeResult, outBuffer
    ) {
        // Limpiar buffer de salida
        outBuffer[OUT_RECOMMENDED_LIGHT]      = 0;
        outBuffer[OUT_RECOMMENDED_HEAVY]      = 0;
        outBuffer[OUT_TOTAL_POWER_COST]       = 0;
        outBuffer[OUT_EXPECTED_SURVIVORS_PWR]  = 0;
        outBuffer[OUT_IS_VALID]               = 0;
        outBuffer[OUT_CRITICAL_MASS_BONUS]    = 0;
        outBuffer[OUT_SIMULATOR_CALLS]        = 0;
        outBuffer[OUT_A_MIN_BODIES]           = 0;

        const maxBudgetBodies = maxLightToSend + maxHeavyToSend;
        if (maxBudgetBodies < 1) return false;

        // ── Fase 1: Threshold Search ──────────────────────────────
        const successThreshold = this._mapSuccessCondition(successCondition);

        this._findMinimumBodies(
            world, originNode, targetNode,
            maxBudgetBodies, attackerFaction,
            routeResult, successThreshold
        );

        const aMin     = this._searchAMin;
        let simCalls   = this._searchCalls;

        if (aMin < 0) {
            // Infeasible: ni con todo el presupuesto se gana
            outBuffer[OUT_SIMULATOR_CALLS] = simCalls;
            return false;
        }

        // ── Fase 2: Security Margin ───────────────────────────────
        const adjustedAMin = Math.min(
            maxBudgetBodies,
            Math.ceil(aMin * securityMargin)
        );

        // ── Fase 3: Critical Mass Bonus ───────────────────────────
        let finalBodies      = adjustedAMin;
        let criticalMassBonus = 0;

        const aCheck = Math.min(
            maxBudgetBodies,
            Math.ceil(adjustedAMin * CRITICAL_MASS_EXTRA)
        );

        if (aCheck > adjustedAMin + BISECT_STEP) {
            this._simulateWithBodies(
                world, originNode, targetNode,
                aCheck, attackerFaction, routeResult
            );
            simCalls++;

            if (this._simResult[SIM_CRITICAL_MASS] > 0
                && this._simResult[SIM_SURVIVOR_POWER] > adjustedAMin * 0.4) {
                criticalMassBonus = 1;
                finalBodies = aCheck;
            }
        }

        // ── Fase 4: Composición Óptima ────────────────────────────
        this._optimizeComposition(
            targetNode, finalBodies,
            maxLightToSend, maxHeavyToSend, attackerFaction
        );

        const recLight  = this._compositionScratch[0];
        const recHeavy  = this._compositionScratch[1];
        const totalPower = recLight + (recHeavy * UNIT_POWER_HEAVY);

        // ── Escribir resultado ────────────────────────────────────
        outBuffer[OUT_RECOMMENDED_LIGHT]      = recLight;
        outBuffer[OUT_RECOMMENDED_HEAVY]      = recHeavy;
        outBuffer[OUT_TOTAL_POWER_COST]       = totalPower;
        outBuffer[OUT_EXPECTED_SURVIVORS_PWR]  = this._simResult[SIM_SURVIVOR_POWER];
        outBuffer[OUT_IS_VALID]               = 1;
        outBuffer[OUT_CRITICAL_MASS_BONUS]    = criticalMassBonus;
        outBuffer[OUT_SIMULATOR_CALLS]        = simCalls;
        outBuffer[OUT_A_MIN_BODIES]           = aMin;

        return true;
    }

    /**
     * Calcula el poder máximo extraíble del nodo de origen sin dejarlo
     * vulnerable ante amenazas en tránsito.
     *
     * Capa 5.3: Ahora acepta `nearbyEnemyPressure` (poder total de nodos
     *           enemigos cercanos) para una reserva defensiva multi-frente.
     *
     * @param {object} originNode
     * @param {string} aiFaction
     * @param {object} world
     * @param {number} [nearbyEnemyPressure=0] — poder total de nodos enemigos a ≤1.5× distancia media
     * @returns {number} poder máximo que se puede enviar
     */
    computeMaxAllocatable(originNode, aiFaction, world, nearbyEnemyPressure = 0) {
        const bodies = originNode.counts ? (originNode.counts[aiFaction] || 0) : 0;
        const power  = originNode.power  ? (originNode.power[aiFaction]  || bodies) : bodies;
        if (bodies <= 0) return 0;

        // 1. Contabilizar amenazas en tránsito hacia el origen
        let incomingThreatPower = 0;
        if (world && world.allUnits) {
            for (let i = 0; i < world.allUnits.length; i++) {
                const u = world.allUnits[i];
                if (!u || u.pendingRemoval) continue;
                if (u.faction === aiFaction || u.state !== 'traveling') continue;
                if (u.targetNode !== originNode) continue;
                incomingThreatPower += (u.power || 1);
            }
        }

        // 2. Producción propia durante ~5s de margen de reacción
        let reactionProduction = 0;
        if (originNode.regenInterval > 0 && originNode.regenInterval < 9999) {
            reactionProduction = Math.floor(5.0 / originNode.regenInterval);
            if (originNode.evolution === 'tanque') {
                reactionProduction *= UNIT_POWER_HEAVY;
            }
        }

        // 3. Cálculo de reserva
        let maxAllocatable;

        if (incomingThreatPower > 0) {
            // Amenaza activa: retener suficiente para ganar el 1v1
            const requiredDefense = Math.ceil(incomingThreatPower * 1.3);
            maxAllocatable = Math.max(0, power - requiredDefense + reactionProduction);
        } else {
            // Sin amenaza en tránsito: guarnición mínima + presión latente
            // Capa 5.3: Considerar presión de nodos enemigos cercanos
            let minReserve = Math.max(5, Math.floor(power * 0.10));

            // Presión latente: retener 15% del poder enemigo cercano
            if (nearbyEnemyPressure > 0) {
                minReserve = Math.max(minReserve, Math.floor(nearbyEnemyPressure * 0.15));
            }

            // Nodos con evoluciones defensivas valen más, retener un poco más
            if (originNode.evolution === 'espinoso' || originNode.evolution === 'artilleria') {
                minReserve = Math.max(minReserve, Math.floor(power * 0.15));
            }

            maxAllocatable = power - minReserve;
        }

        return Math.max(0, maxAllocatable);
    }

    // ═══════════════════════════════════════════════════════════════
    //  MÓDULO 1: THRESHOLD SOLVER — Búsqueda Binaria Adaptativa
    // ═══════════════════════════════════════════════════════════════

    /**
     * Encuentra el número mínimo de cuerpos (A_min) necesarios para
     * transformar un resultado = Derrota en resultado >= threshold.
     *
     * Usa sondeo exponencial + bisección.
     * Escribe resultado en this._searchAMin / this._searchCalls.
     *
     * Complejidad: ≤7 llamadas al simulador (típico), ≤10 (peor caso).
     */
    _findMinimumBodies(world, origin, target, maxBudget, faction, route, threshold) {
        let lo    = 0;
        let hi    = maxBudget;
        let calls = 0;
        let probe = Math.min(INITIAL_PROBE, maxBudget);

        // ── Sondeo exponencial para acotar el rango [lo, hi] ──
        let probeResult = this._simulateWithBodies(world, origin, target, probe, faction, route);
        calls++;

        if (probeResult >= threshold) {
            // Victoria con pocos → buscar hacia abajo
            hi = probe;
        } else {
            // Escalar: 15 → 30 → 60 → 120 → 240 → ...
            lo = probe;
            while (lo < maxBudget) {
                probe = Math.min(probe * 2, maxBudget);
                probeResult = this._simulateWithBodies(world, origin, target, probe, faction, route);
                calls++;

                if (probeResult >= threshold) {
                    hi = probe;
                    break;
                }

                lo = probe;
                if (probe >= maxBudget) break;
            }

            // Infeasible: ni con todo el presupuesto se alcanza el umbral
            if (probeResult < threshold) {
                this._searchAMin  = -1;
                this._searchCalls = calls;
                return;
            }
        }

        // ── Bisección clásica en [lo, hi] con step = BISECT_STEP ──
        while (hi - lo > BISECT_STEP) {
            const mid = (lo + hi) >>> 1;
            const midResult = this._simulateWithBodies(world, origin, target, mid, faction, route);
            calls++;

            if (midResult >= threshold) {
                hi = mid;
            } else {
                lo = mid;
            }
        }

        this._searchAMin  = hi;
        this._searchCalls = calls;
    }

    // ═══════════════════════════════════════════════════════════════
    //  MÓDULO 2: COMPOSITION OPTIMIZER (Ligeras vs. Pesadas)
    // ═══════════════════════════════════════════════════════════════

    /**
     * Determina la mezcla óptima de ligeras/pesadas para el conteo
     * total de cuerpos dado.
     *
     * Escribe resultado en this._compositionScratch[0..3].
     *
     * Lógica:
     *  - Objetivo blando (<20 defensores): maximizar cuerpos → priorizar ligeras
     *  - Objetivo con espinoso: maximizar pesadas (espinoso mata 1 cuerpo/tick)
     *  - Objetivo duro estándar: 70% pesadas (combate) + 30% ligeras (captura)
     *  - Objetivo con artillería: +15% pesadas (absorben splash mejor)
     */
    _optimizeComposition(target, totalBodies, maxLight, maxHeavy, attackerFaction) {
        const targetDefenders = this._getTargetDefenders(target, attackerFaction);
        const isSoftTarget    = targetDefenders < 20;
        const targetEvolution = getEvolutionCode(target.evolution);

        let recLight = 0;
        let recHeavy = 0;

        if (isSoftTarget) {
            // ── Objetivo blando: maximizar cuerpos para captura rápida ──
            recLight = Math.min(totalBodies, maxLight);
            const remainingBodies = totalBodies - recLight;
            recHeavy = Math.min(remainingBodies, maxHeavy);

        } else if (targetEvolution === EVOLUTION_ESPINOSO) {
            // ── Contra espinoso: maximizar pesadas ──
            // Espinoso mata 1 cuerpo/tick independiente del poder.
            // Pesadas: mismas bajas temporales, pero cada body vale 3x en combate.
            recHeavy = Math.min(totalBodies, maxHeavy);
            const remainingBodies = totalBodies - recHeavy;
            recLight = Math.min(remainingBodies, maxLight);

        } else {
            // ── Objetivo duro: balancear combate + captura ──
            // 70% cuerpos como pesadas para resistencia de combate
            const heavyBudget = Math.floor(totalBodies * 0.7);
            recHeavy = Math.min(heavyBudget, maxHeavy);
            const remainingBodies = totalBodies - recHeavy;
            recLight = Math.min(remainingBodies, maxLight);

            // Ajuste artillería: splash mata por poder fijo → pesadas absorben mejor
            if (targetEvolution === EVOLUTION_ARTILLERIA && maxHeavy > recHeavy) {
                const extraHeavy = Math.min(
                    Math.floor(totalBodies * 0.15),
                    maxHeavy - recHeavy,
                    recLight           // no reducir ligeras por debajo de 0
                );
                recHeavy += extraHeavy;
                recLight -= extraHeavy;
            }
        }

        // ── Ajuste final: asegurar cuerpos suficientes para captura media ──
        const finalBodies = recLight + recHeavy;
        if (finalBodies < CAPTURE_LOW_THRESHOLD && totalBodies >= CAPTURE_LOW_THRESHOLD) {
            const bonusLight = Math.min(
                CAPTURE_LOW_THRESHOLD - finalBodies,
                maxLight - recLight
            );
            if (bonusLight > 0) recLight += bonusLight;
        }

        // ── Si por límites de disponibilidad no cubrimos totalBodies, ──
        // ── rellenar con el tipo disponible restante                  ──
        const currentTotal = recLight + recHeavy;
        if (currentTotal < totalBodies) {
            const deficit = totalBodies - currentTotal;
            const extraLight = Math.min(deficit, maxLight - recLight);
            recLight += extraLight;
            const remainingDeficit = deficit - extraLight;
            if (remainingDeficit > 0) {
                recHeavy += Math.min(remainingDeficit, maxHeavy - recHeavy);
            }
        }

        // Clamp
        recLight = Math.max(0, recLight);
        recHeavy = Math.max(0, recHeavy);

        this._compositionScratch[0] = recLight;
        this._compositionScratch[1] = recHeavy;
        this._compositionScratch[2] = recLight + recHeavy;
        this._compositionScratch[3] = recLight + (recHeavy * UNIT_POWER_HEAVY);
    }

    // ═══════════════════════════════════════════════════════════════
    //  HELPERS INTERNOS
    // ═══════════════════════════════════════════════════════════════

    /** Invoca el simulador con un conteo de cuerpos dado. */
    _simulateWithBodies(world, origin, target, bodies, faction, routeResult) {
        return this._simulator.evaluateAttack(
            world, origin, target, bodies, faction, routeResult, this._simResult
        );
    }

    /** Convierte SUCCESS_* a umbral numérico del simulador. */
    _mapSuccessCondition(condition) {
        if (condition === SUCCESS_SEGURA) return RESULT_VICTORIA_SEGURA;
        return RESULT_VICTORIA_PIRRICA;
    }

    /** Cuenta cuerpos defensores totales (no aliados) en el nodo objetivo. */
    _getTargetDefenders(target, attackerFaction) {
        let defenders = 0;
        if (target.counts) {
            for (const f in target.counts) {
                if (f !== attackerFaction) defenders += (target.counts[f] || 0);
            }
        }
        return defenders;
    }
}
