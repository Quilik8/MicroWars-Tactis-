/**
 * ai_doomsday.js — Módulos de Supervivencia y Conciencia de Riesgo
 *
 * Extraído de UtilityEngine (Módulos 1 y 3).
 * Gestiona la detección de amenazas ambientales (water sweeps, light sweeps),
 * vetos de ruta por colisión espacio-temporal, evacuación de pánico, y
 * análisis de vulnerabilidad de retaguardia.
 *
 * ZERO-ALLOCATION: Todas las funciones operan sobre los buffers pre-asignados
 *                   del UtilityEngine (engine._doomsdayTTI, etc.).
 */

import {
    W_DOOMSDAY_AWARENESS,
    DOOMSDAY_HORIZON,
    countAt,
} from './ai_constants.js';
import {
    RESULT_VICTORIA_PIRRICA,
} from './deterministic_rules.js';
import { writeAttackCmd } from './ai_command_buffer.js';

function estimateWaterThreatTTIForNode(ws, node, world) {
    if (!ws || !node || !world) return Infinity;
    const now = world.simTime || 0;
    const width = world.game ? world.game.width : 1920;
    const height = world.game ? world.game.height : 1080;

    if (typeof ws.predictUnsafeUntil === 'function') {
        const unsafeUntil = ws.predictUnsafeUntil(
            node.x,
            node.y,
            node.x + 1,
            node.y,
            now,
            0.1,
            now,
            width,
            height
        );
        if (Number.isFinite(unsafeUntil) && unsafeUntil >= now) {
            return Math.max(0, unsafeUntil - now);
        }
    }

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

    const isAlerting = ws.isAlerting || ws._isAlerting;
    if (isAlerting) {
        best = Math.min(best, Math.max(0, ws._alertTimer || 0));
    }

    return best;
}

/**
 * Módulo 3: Scans for sweeps and updates engine._doomsdayTTI and
 * engine._neutralizeTTI per node.
 * @param {UtilityEngine} engine
 * @param {object[]} nodes
 * @param {string} aiFaction
 * @param {object} world
 */
export function scanDoomsdayThreats(engine, nodes, aiFaction, world) {
    if (!world) return;
    const wDoom = engine._weights[W_DOOMSDAY_AWARENESS];
    if (wDoom < 0.01) {
        engine._doomsdayActive = false;
        return;
    }

    engine._doomsdayActive = false;
    const waterSweeps = world.waterSweeps || [];
    const lightSweeps = world.lightSweeps || [];

    for (let i = 0; i < nodes.length; i++) {
        engine._doomsdayTTI[i] = -1;
        engine._neutralizeTTI[i] = -1;
        const node = nodes[i];
        if (countAt(node, aiFaction) === 0) continue;

        let minDoom = Infinity;
        let minNeutral = Infinity;

        for (const ws of waterSweeps) {
            const tti = estimateWaterThreatTTIForNode(ws, node, world);
            if (tti > 0 && tti < minDoom) minDoom = tti;
            if (tti === 0) minDoom = 0;
        }

        for (const ls of lightSweeps) {
            if (!node.isMarkedForSweep) continue;
            // scale normalization
            const scaleX = (world.scale && world.scale.x) ? world.scale.x : 1;
            const spd = Math.max(1, ls.speed / scaleX);
            
            if (ls.state === 'sweeping') {
                for (const orb of ls.orbs) {
                    if (orb.worldX < node.x) {
                        const tti = (node.x - orb.worldX) / spd;
                        if (tti > 0 && tti < minNeutral) minNeutral = tti;
                    }
                }
            } else if (ls.state === 'alerting') {
                const tti = ls.timer + (node.x / spd);
                if (tti > 0 && tti < minNeutral) minNeutral = tti;
            }
        }

        if (minDoom < 9999) {
            engine._doomsdayTTI[i] = minDoom;
            engine._doomsdayActive = true;
        }
        if (minNeutral < 9999) {
            engine._neutralizeTTI[i] = minNeutral;
        }
    }
}

/**
 * Módulo 1 (Water Sweep Refined): Spacetime Veto Check.
 * Evaluates whether a moving sweep bar will intercept the route.
 * @param {object} src — source node
 * @param {object} tgt — target node
 * @param {number} t_travel — estimated travel time
 * @param {object} world
 * @returns {boolean} true if route will be swept (veto)
 */
export function isRouteSwept(src, tgt, t_travel, world) {
    if (!world || !world.waterSweeps || world.waterSweeps.length === 0) return false;

    const now = world.simTime || 0;
    const width = world.game ? world.game.width : 1920;
    const height = world.game ? world.game.height : 1080;
    
    for (const ws of world.waterSweeps) {
        if (typeof ws.predictUnsafeUntil === 'function') {
            const unsafeUntil = ws.predictUnsafeUntil(
                src.x,
                src.y,
                tgt.x,
                tgt.y,
                now,
                t_travel,
                now,
                width,
                height
            );
            if (Number.isFinite(unsafeUntil) && unsafeUntil >= now && unsafeUntil <= now + t_travel + 1.0) {
                return true;
            }
            continue;
        }

        const dx = ws.dirX !== undefined ? ws.dirX : 1;
        const dy = ws.dirY !== undefined ? ws.dirY : 0;
        const Vw = Math.max(1, ws.speed);
        
        const S_proj = src.x * dx + src.y * dy;
        const T_proj = tgt.x * dx + tgt.y * dy;
        const Va_proj = Math.abs(t_travel) > 0.001 ? (T_proj - S_proj) / t_travel : 0;

        for (const bar of (ws._activeBars || [])) {
            const W0 = bar.worldX ?? bar.scalar; // Fallback assumes scalar correlates to sweep projection
            if (W0 == null) continue;
            if (Math.abs(Vw - Va_proj) < 0.1) continue;
            const t_intersect = (S_proj - W0) / (Vw - Va_proj);
            if (t_intersect > 0 && t_intersect < t_travel + 1.0) return true;
        }
        
        if (ws.isAlerting || ws._isAlerting) {
            const W0 = -100; // Heuristic safe boundary spawn prep
            if (Math.abs(Vw - Va_proj) < 0.1) continue;
            const t_intersect = (S_proj - W0) / (Vw - Va_proj);
            if (t_intersect > 0 && t_intersect < t_travel) return true;
        }
    }
    return false;
}

/**
 * Módulo 3: Kamikaze Protocol — evacuate towards impact safely.
 * @param {UtilityEngine} engine
 * @param {object} sourceNode
 * @param {number} sourceWorldIdx
 * @param {number} ownCount
 * @param {string} aiFaction
 * @param {object[]} nodes
 * @param {object} world
 */
export function executePanicEvacuation(engine, sourceNode, sourceWorldIdx, ownCount, aiFaction, nodes, world) {
    let bestTarget = -1;
    let maxKamikazeValue = -Infinity;

    let dx = 1, dy = 0, W0 = -9999, Vw = 20;
    if (world && world.waterSweeps && world.waterSweeps.length > 0) {
        const ws = world.waterSweeps[0];
        dx = ws.dirX !== undefined ? ws.dirX : 1;
        dy = ws.dirY !== undefined ? ws.dirY : 0;
        Vw = Math.max(1, ws.speed);
        if (ws._activeBars && ws._activeBars.length > 0) {
            W0 = ws._activeBars[0].worldX ?? ws._activeBars[0].scalar ?? W0;
        }
    }
    const S_proj = sourceNode.x * dx + sourceNode.y * dy;

    for (let i = 0; i < nodes.length; i++) {
        if (i === sourceWorldIdx) continue;
        const target = nodes[i];
        if (target.type === 'tunel' && !target.tunnelTo) continue;

        // ── Validación de Bloqueo ──
        if (world && world.isPathBlocked && world.isPathBlocked(sourceNode, target)) {
            continue;
        }

        const distSq = (target.x - sourceNode.x)**2 + (target.y - sourceNode.y)**2;
        const dist = Math.sqrt(distSq);
        if (dist < 1) continue;
        
        const baseSpeed = world.unitBaseSpeed || 75;
        const t_travel = dist / baseSpeed;

        const T_proj = target.x * dx + target.y * dy;
        const Va_proj = (T_proj - S_proj) / t_travel;
        
        // Does wave catch us on the way?
        const V_rel = Vw - Va_proj;
        let reachable = true;
        if (Math.abs(V_rel) > 0.1) {
            const t_intersect = (S_proj - W0) / V_rel;
            if (t_intersect > 0 && t_intersect < t_travel + 1.0) reachable = false;
        }

        if (!reachable) continue;

        // Target Priority: Enemy/Player > Neutral > Ally
        let value = 0;
        if (target.owner !== aiFaction && target.owner !== 'neutral') {
            value += 5000 + countAt(target, target.owner) * 2;
        } else if (target.owner === 'neutral') {
            value += 1000;
        } else {
            value += 100;
        }
        value -= dist;

        if (value > maxKamikazeValue) {
            maxKamikazeValue = value;
            bestTarget = i;
        }
    }

    // Fallback: nearest node if we literally can't run anywhere
    if (bestTarget === -1) {
        let minDistSq = Infinity;
        for (let i = 0; i < nodes.length; i++) {
            if (i === sourceWorldIdx) continue;
            const target = nodes[i];
            if (world && world.isPathBlocked && world.isPathBlocked(sourceNode, target)) continue;
            const d = (target.x - sourceNode.x)**2 + (target.y - sourceNode.y)**2;
            if (d < minDistSq) { minDistSq = d; bestTarget = i; }
        }
    }

    if (bestTarget >= 0) {
        writeAttackCmd(engine, sourceNode, sourceWorldIdx, bestTarget, ownCount,
                                 aiFaction, true, world, null);
        engine._attackersUsed |= (1 << sourceWorldIdx);
    }
}

/**
 * Módulo 1: Reverse Sandbox — check if node will fall if forces are sent.
 * @param {UtilityEngine} engine
 * @param {object} sourceNode
 * @param {string} aiFaction
 * @param {string} playerFaction
 * @param {object} world
 * @param {object[]} nodes
 * @param {number} simBodies — bodies being sent away
 * @param {object} navSystem
 * @param {object} navStateView
 * @param {object} navScoreResult
 * @returns {boolean} true if rearguard is vulnerable (should veto attack)
 */
export function checkRearguardVulnerability(engine, sourceNode, aiFaction, playerFaction, world, nodes, simBodies = 0, navSystem = null, navStateView = null, navScoreResult = null) {
    let nearestPlayerDistSq = Infinity;
    let nearestPlayerNode = null;
    for (let i = 0; i < engine._playerNodeCount; i++) {
        const pNode = nodes[engine._playerNodeIndices[i]];
        const dx = pNode.x - sourceNode.x;
        const dy = pNode.y - sourceNode.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < nearestPlayerDistSq) {
            nearestPlayerDistSq = distSq;
            nearestPlayerNode = pNode;
        }
    }

    if (!nearestPlayerNode) return false;
    
    const playerForce = countAt(nearestPlayerNode, playerFaction);
    if (playerForce < 5) return false;
    
    let routeResult = null;
    if (navSystem && navStateView && navScoreResult) {
        routeResult = navSystem.evaluatePath(
            nearestPlayerNode.navIndex, sourceNode.navIndex, navStateView, navScoreResult
        );
        if (!routeResult.isViable) return false; // El jugador no puede alcanzarnos
    }

    const origLight = sourceNode.counts ? (sourceNode.counts[aiFaction] || 0) : 0;
    let remLight = Math.max(1, origLight - simBodies); // calcular la guarnición real que quedará

    if (sourceNode.counts) sourceNode.counts[aiFaction] = remLight;
    
    // Sim: Player attacks our remnant
    const simCode = engine._simulator.evaluateAttack(
        world, nearestPlayerNode, sourceNode, playerForce,
        playerFaction, routeResult, engine._rearguardSimResult
    );

    if (sourceNode.counts) sourceNode.counts[aiFaction] = origLight;

    return (simCode >= RESULT_VICTORIA_PIRRICA);
}
