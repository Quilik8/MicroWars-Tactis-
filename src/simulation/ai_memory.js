/**
 * Per-faction AI memory.
 *
 * Tracks recent target pressure and ownership churn so the utility scorer can
 * avoid pendulum loops without hard-banning valid tactical recaptures.
 */

import { MAX_NODES } from './ai_constants.js';

export const DEFAULT_ANTI_PENDULUM = Object.freeze({
    targetCooldownSec: 5.0,
    sourceCooldownSec: 2.0,
    recaptureCooldownSec: 10.0,
    flipWindowSec: 28.0,
    maxFlipsBeforePenalty: 2,
    recentAttackPenalty: 420,
    flipPenalty: 700,
    sourceRepeatPenalty: 220,
});

export class AIMemory {
    constructor() {
        this._lastOwner = new Array(MAX_NODES);
        this._lastOwnerChangeTime = new Float32Array(MAX_NODES);
        this._flipWindowStart = new Float32Array(MAX_NODES);
        this._flipCount = new Uint8Array(MAX_NODES);
        this._lastAttackTargetTime = new Float32Array(MAX_NODES);
        this._lastAttackSourceTime = new Float32Array(MAX_NODES);
        this.reset();
    }

    reset() {
        for (let i = 0; i < MAX_NODES; i++) {
            this._lastOwner[i] = null;
        }
        this._lastOwnerChangeTime.fill(-9999);
        this._flipWindowStart.fill(-9999);
        this._flipCount.fill(0);
        this._lastAttackTargetTime.fill(-9999);
        this._lastAttackSourceTime.fill(-9999);
    }

    observeNodes(nodes, now, policy) {
        const flipWindow = policy && policy.flipWindowSec !== undefined
            ? policy.flipWindowSec
            : DEFAULT_ANTI_PENDULUM.flipWindowSec;
        const limit = Math.min(nodes.length, MAX_NODES);
        for (let i = 0; i < limit; i++) {
            const node = nodes[i];
            const owner = node ? node.owner : null;
            if (this._lastOwner[i] === null) {
                this._lastOwner[i] = owner;
                continue;
            }
            if (this._lastOwner[i] === owner) continue;

            const windowAge = now - this._flipWindowStart[i];
            if (windowAge < 0 || windowAge > flipWindow) {
                this._flipWindowStart[i] = now;
                this._flipCount[i] = 1;
            } else if (this._flipCount[i] < 255) {
                this._flipCount[i]++;
            }

            this._lastOwner[i] = owner;
            this._lastOwnerChangeTime[i] = now;
        }
    }

    recordAttack(sourceIndex, targetIndex, now) {
        if (sourceIndex >= 0 && sourceIndex < MAX_NODES) {
            this._lastAttackSourceTime[sourceIndex] = now;
        }
        if (targetIndex >= 0 && targetIndex < MAX_NODES) {
            this._lastAttackTargetTime[targetIndex] = now;
        }
    }

    scoreTarget(sourceIndex, targetIndex, now, policy) {
        if (targetIndex < 0 || targetIndex >= MAX_NODES) return 0;

        const cfg = policy || DEFAULT_ANTI_PENDULUM;
        let penalty = 0;

        const targetCooldown = cfg.targetCooldownSec ?? DEFAULT_ANTI_PENDULUM.targetCooldownSec;
        const sinceTargetAttack = now - this._lastAttackTargetTime[targetIndex];
        if (sinceTargetAttack >= 0 && sinceTargetAttack < targetCooldown) {
            const t = 1.0 - (sinceTargetAttack / Math.max(0.001, targetCooldown));
            penalty += (cfg.recentAttackPenalty ?? DEFAULT_ANTI_PENDULUM.recentAttackPenalty) * t;
        }

        const sourceCooldown = cfg.sourceCooldownSec ?? DEFAULT_ANTI_PENDULUM.sourceCooldownSec;
        const sinceSourceAttack = sourceIndex >= 0 && sourceIndex < MAX_NODES
            ? now - this._lastAttackSourceTime[sourceIndex]
            : Infinity;
        if (sinceSourceAttack >= 0 && sinceSourceAttack < sourceCooldown) {
            const t = 1.0 - (sinceSourceAttack / Math.max(0.001, sourceCooldown));
            penalty += (cfg.sourceRepeatPenalty ?? DEFAULT_ANTI_PENDULUM.sourceRepeatPenalty) * t;
        }

        const recaptureCooldown = cfg.recaptureCooldownSec ?? DEFAULT_ANTI_PENDULUM.recaptureCooldownSec;
        const sinceOwnerChange = now - this._lastOwnerChangeTime[targetIndex];
        if (sinceOwnerChange >= 0 && sinceOwnerChange < recaptureCooldown) {
            const t = 1.0 - (sinceOwnerChange / Math.max(0.001, recaptureCooldown));
            penalty += (cfg.recentAttackPenalty ?? DEFAULT_ANTI_PENDULUM.recentAttackPenalty) * 0.65 * t;
        }

        const flipWindow = cfg.flipWindowSec ?? DEFAULT_ANTI_PENDULUM.flipWindowSec;
        const maxFlips = cfg.maxFlipsBeforePenalty ?? DEFAULT_ANTI_PENDULUM.maxFlipsBeforePenalty;
        const windowAge = now - this._flipWindowStart[targetIndex];
        if (windowAge >= 0 && windowAge <= flipWindow && this._flipCount[targetIndex] > maxFlips) {
            const excess = this._flipCount[targetIndex] - maxFlips;
            penalty += (cfg.flipPenalty ?? DEFAULT_ANTI_PENDULUM.flipPenalty) * excess;
        }

        return penalty;
    }
}
