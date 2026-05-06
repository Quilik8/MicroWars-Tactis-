/**
 * ai_hazard_oracle.js — Oráculo Unificado de Riesgos Ambientales
 *
 * Fase 5 del Plan de Mejora AI.
 * API centralizada que unifica la evaluación de riesgo de ruta y
 * amenaza de nodo para todos los tipos de hazard:
 *   - Insecticida (attrition/lethal)
 *   - Water Sweeps (lethal temporal)
 *   - Light Sweeps (neutralize node)
 *   - Zones (speed modifier)
 *   - Intermittent Barriers (blocking temporal)
 *
 * ZERO-ALLOCATION: Usa objetos de resultado pre-asignados.
 *
 * Reemplaza la lógica dispersa en ai_scoring.js y ai_doomsday.js
 * con una fuente única y consistente.
 */

// ═══════════════════════════════════════════════════════════════════
//  RISK TYPES
// ═══════════════════════════════════════════════════════════════════

export const RISK_NONE        = 'none';
export const RISK_ATTRITION   = 'attrition';   // gradual damage (puddles, some hazards)
export const RISK_LETHAL      = 'lethal';       // instant kill (insecticide, water sweep)
export const RISK_NEUTRALIZE  = 'neutralize';   // resets node (light sweep)
export const RISK_BLOCKING    = 'blocking';     // path blocked (barrier)
export const RISK_SLOW        = 'slow';         // speed reduction (zones)

// ═══════════════════════════════════════════════════════════════════
//  RESULT OBJECTS (pre-allocated, reused)
// ═══════════════════════════════════════════════════════════════════

export class RouteRisk {
    constructor() { this.reset(); }
    reset() {
        this.isViable = true;
        this.projectedCasualties = 0;
        this.casualtyRatio = 0;
        this.suggestedDelay = 0;
        this.safeAfterSec = 0;
        this.requiresHop = false;
        this.riskType = RISK_NONE;
        this.vetoReason = '';
        this.transitTime = 0;
    }
}

export class NodeThreat {
    constructor() { this.reset(); }
    reset() {
        this.isThreatened = false;
        this.timeToImpact = Infinity;
        this.riskType = RISK_NONE;
        this.shouldEvacuate = false;
        this.shouldBrace = false;
    }
}

// ═══════════════════════════════════════════════════════════════════
//  HAZARD POLICY THRESHOLDS
// ═══════════════════════════════════════════════════════════════════

const POLICY_THRESHOLDS = {
    strict:   { maxCasualtyRatio: 0.12, vetoIfSafeAlt: true,  preferDelay: true  },
    cautious: { maxCasualtyRatio: 0.22, vetoIfSafeAlt: true,  preferDelay: true  },
    normal:   { maxCasualtyRatio: 0.35, vetoIfSafeAlt: false, preferDelay: false },
    reckless: { maxCasualtyRatio: 0.65, vetoIfSafeAlt: false, preferDelay: false },
    none:     { maxCasualtyRatio: 1.00, vetoIfSafeAlt: false, preferDelay: false },
};

function getPolicyThreshold(policyName) {
    return POLICY_THRESHOLDS[policyName] || POLICY_THRESHOLDS.normal;
}

// ═══════════════════════════════════════════════════════════════════
//  HAZARD ORACLE
// ═══════════════════════════════════════════════════════════════════

export class HazardOracle {
    constructor() {
        this._routeResult = new RouteRisk();
        this._nodeResult = new NodeThreat();
    }

    /**
     * Evalúa el riesgo de una ruta entre dos nodos.
     *
     * @param {object}  fromNode     — Nodo origen
     * @param {object}  toNode       — Nodo destino
     * @param {number}  squadSize    — Tamaño estimado del escuadrón
     * @param {object}  navRouteResult — Resultado de NavigationSystem.evaluatePath() (puede ser null)
     * @param {object}  world        — WorldManager
     * @param {object}  profile      — Perfil resuelto de AI (de ai_config)
     * @returns {RouteRisk}
     */
    evaluateRoute(fromNode, toNode, squadSize, navRouteResult, world, profile) {
        const out = this._routeResult;
        out.reset();

        if (!fromNode || !toNode || !world) return out;

        const dx = toNode.x - fromNode.x;
        const dy = toNode.y - fromNode.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const baseSpeed = world.unitBaseSpeed || 75;
        out.transitTime = dist / Math.max(1, baseSpeed);

        // ── 1. Static hazard assessment (from nav route) ──
        if (navRouteResult) {
            out.projectedCasualties = navRouteResult.projectedCasualties || 0;
            out.suggestedDelay = navRouteResult.suggestedDelay || 0;
            out.transitTime = navRouteResult.projectedTransitTime || out.transitTime;

            if (!navRouteResult.isViable) {
                out.isViable = false;
                out.vetoReason = 'route_not_viable';
                return out;
            }
        }

        // ── 2. Determine risk type from hazards ──
        const hazards = world.hazards || [];
        let hasLethalHazard = false;
        for (let i = 0; i < hazards.length; i++) {
            const h = hazards[i];
            if (!h) continue;
            // Check if hazards in sector are marked as lethal
            if (h.shape === 'puddle' || h.shape === 'rect_puddle' || h.shape === 'ring' ||
                h.shape === 'flood' || h.shape === 'semicircle') {
                hasLethalHazard = true;
                break;
            }
        }

        if (out.projectedCasualties > 0) {
            out.riskType = hasLethalHazard ? RISK_LETHAL : RISK_ATTRITION;
        }

        // ── 3. Check hazard-specific policy ──
        const hazardPolicyName = profile ? (profile.hazardPolicy || 'normal') : 'normal';
        const policyThresholds = getPolicyThreshold(hazardPolicyName);

        // Override with profile's explicit maxRouteCasualtyRatio if set
        const maxRatio = profile && profile.maxRouteCasualtyRatio !== undefined && profile.maxRouteCasualtyRatio !== null
            ? profile.maxRouteCasualtyRatio
            : policyThresholds.maxCasualtyRatio;

        out.casualtyRatio = squadSize > 0 ? out.projectedCasualties / squadSize : 0;

        // ── 4. Veto check ──
        if (out.projectedCasualties > 0 && squadSize > 0) {
            if (out.casualtyRatio >= maxRatio) {
                out.isViable = false;
                out.vetoReason = `casualty_ratio_${(out.casualtyRatio * 100).toFixed(0)}pct_exceeds_${(maxRatio * 100).toFixed(0)}pct_max`;
                return out;
            }
        }

        // ── 5. Water sweep temporal check ──
        if (world.waterSweeps && world.waterSweeps.length > 0) {
            for (const ws of world.waterSweeps) {
                if (typeof ws.predictUnsafeUntil !== 'function') continue;
                const now = world.simTime || 0;
                const w = world.game ? world.game.width : 1920;
                const h = world.game ? world.game.height : 1080;

                const unsafeUntil = ws.predictUnsafeUntil(
                    fromNode.x, fromNode.y,
                    toNode.x, toNode.y,
                    now, out.transitTime, now, w, h
                );

                if (Number.isFinite(unsafeUntil) && unsafeUntil >= now && unsafeUntil <= now + out.transitTime + 1.0) {
                    // Route is swept — suggest delay or veto
                    out.riskType = RISK_LETHAL;

                    if (policyThresholds.preferDelay) {
                        out.suggestedDelay = Math.max(out.suggestedDelay, unsafeUntil - now + 0.5);
                        out.safeAfterSec = unsafeUntil - now + 0.5;
                    } else {
                        out.isViable = false;
                        out.vetoReason = 'water_sweep_intercept';
                        return out;
                    }
                }
            }
        }

        // ── 6. Light sweep check on target ──
        if (toNode.isMarkedForSweep && world.lightSweeps && world.lightSweeps.length > 0) {
            out.riskType = out.riskType === RISK_NONE ? RISK_NEUTRALIZE : out.riskType;
            // Don't veto, but flag — ai_scoring should deprioritize
        }

        return out;
    }

    /**
     * Evalúa la amenaza ambiental sobre un nodo en un horizonte de tiempo.
     *
     * @param {object}  node       — Nodo a evaluar
     * @param {number}  horizonSec — Horizonte de predicción en segundos
     * @param {object}  world      — WorldManager
     * @param {object}  profile    — Perfil resuelto de AI
     * @returns {NodeThreat}
     */
    evaluateNodeThreat(node, horizonSec, world, profile) {
        const out = this._nodeResult;
        out.reset();

        if (!node || !world) return out;

        // ── Water Sweep threat ──
        const waterSweeps = world.waterSweeps || [];
        for (const ws of waterSweeps) {
            const tti = this._estimateWaterTTI(ws, node, world);
            if (tti >= 0 && tti < horizonSec && tti < out.timeToImpact) {
                out.isThreatened = true;
                out.timeToImpact = tti;
                out.riskType = RISK_LETHAL;
                out.shouldEvacuate = true;
            }
        }

        // ── Light Sweep threat ──
        if (node.isMarkedForSweep) {
            const lightSweeps = world.lightSweeps || [];
            for (const ls of lightSweeps) {
                const tti = this._estimateLightTTI(ls, node, world);
                if (tti >= 0 && tti < horizonSec && tti < out.timeToImpact) {
                    out.isThreatened = true;
                    out.timeToImpact = tti;
                    out.riskType = RISK_NEUTRALIZE;
                    out.shouldBrace = true;
                }
            }
        }

        return out;
    }

    /**
     * Estima el Time-To-Impact de un water sweep sobre un nodo.
     * Usa predictUnsafeUntil si está disponible, o fallback manual.
     * @private
     */
    _estimateWaterTTI(ws, node, world) {
        if (!ws || !node) return Infinity;
        const now = world.simTime || 0;
        const width = world.game ? world.game.width : 1920;
        const height = world.game ? world.game.height : 1080;

        if (typeof ws.predictUnsafeUntil === 'function') {
            const unsafeUntil = ws.predictUnsafeUntil(
                node.x, node.y,
                node.x + 1, node.y,
                now, 0.1, now, width, height
            );
            if (Number.isFinite(unsafeUntil) && unsafeUntil >= now) {
                return Math.max(0, unsafeUntil - now);
            }
        }

        // Fallback: scan active bars
        let best = Infinity;
        const bars = ws._activeBars || [];
        for (const bar of bars) {
            if (!bar) continue;
            if (bar.kind === 'radial') {
                const distance = Math.hypot(node.x - bar.centerX, node.y - bar.centerY);
                const outer = (bar.radius || 0) + (bar.width || 0);
                if (distance >= (bar.radius || 0) && distance <= outer) return 0;
                const tti = (distance - outer) / Math.max(1, bar.speed || ws.speed || 1);
                if (tti > 0 && tti < best) best = tti;
                continue;
            }

            const nx = bar.nx ?? 1;
            const ny = bar.ny ?? 0;
            const scalar = bar.scalar ?? bar.worldX;
            if (scalar == null) continue;
            const projection = (node.x * nx) + (node.y * ny);
            const leading = scalar + (bar.width || 0);
            if (projection >= scalar && projection <= leading) return 0;
            const tti = (projection - leading) / Math.max(1, bar.speed || ws.speed || 1);
            if (tti > 0 && tti < best) best = tti;
        }

        // Check alerting state
        if (ws.isAlerting || ws._isAlerting) {
            best = Math.min(best, Math.max(0, ws._alertTimer || 0));
        }

        return best;
    }

    /**
     * Estima el Time-To-Impact de un light sweep sobre un nodo.
     * @private
     */
    _estimateLightTTI(ls, node, world) {
        if (!ls || !node) return Infinity;
        const scaleX = (world.scale && world.scale.x) ? world.scale.x : 1;
        const spd = Math.max(1, (ls.speed || 0) / scaleX);

        if (ls.state === 'sweeping' && ls.orbs) {
            let best = Infinity;
            for (const orb of ls.orbs) {
                if (orb.worldX < node.x) {
                    const tti = (node.x - orb.worldX) / spd;
                    if (tti > 0 && tti < best) best = tti;
                }
            }
            if (best < Infinity) return best;
        }

        if (ls.state === 'alerting') {
            const tti = (ls.timer || 0) + (node.x / spd);
            if (tti > 0) return tti;
        }

        return Infinity;
    }
}
