
const INF = 1e30;
const MAX_DELAY_ITERS = 12;
const MAX_WATER_EVENTS = 10;
const MAX_LIGHT_CYCLES = 3;
const SAFE_EPSILON = 0.05;
const NODE_FLAG_MARKED_FOR_LIGHT = 1;

export function clamp01(v) {
    if (v <= 0) return 0;
    if (v >= 1) return 1;
    return v;
}

export function pointInRect(x, y, left, top, right, bottom) {
    return x >= left && x <= right && y >= top && y <= bottom;
}

export function segmentRectInterval(x1, y1, x2, y2, left, top, right, bottom, out) {
    let tMin = 0;
    let tMax = 1;
    const dx = x2 - x1;
    const dy = y2 - y1;

    if (Math.abs(dx) < 1e-6) {
        if (x1 < left || x1 > right) return false;
    } else {
        const tx1 = (left - x1) / dx;
        const tx2 = (right - x1) / dx;
        const txMin = tx1 < tx2 ? tx1 : tx2;
        const txMax = tx1 > tx2 ? tx1 : tx2;
        if (txMin > tMin) tMin = txMin;
        if (txMax < tMax) tMax = txMax;
        if (tMax < tMin) return false;
    }

    if (Math.abs(dy) < 1e-6) {
        if (y1 < top || y1 > bottom) return false;
    } else {
        const ty1 = (top - y1) / dy;
        const ty2 = (bottom - y1) / dy;
        const tyMin = ty1 < ty2 ? ty1 : ty2;
        const tyMax = ty1 > ty2 ? ty1 : ty2;
        if (tyMin > tMin) tMin = tyMin;
        if (tyMax < tMax) tMax = tyMax;
        if (tMax < tMin) return false;
    }

    if (tMax < 0 || tMin > 1) return false;
    out.enter = tMin < 0 ? 0 : tMin;
    out.exit = tMax > 1 ? 1 : tMax;
    return out.exit >= out.enter;
}

export function segmentRectLength(x1, y1, x2, y2, left, top, right, bottom, intervalScratch) {
    if (!segmentRectInterval(x1, y1, x2, y2, left, top, right, bottom, intervalScratch)) {
        return 0;
    }
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    return (intervalScratch.exit - intervalScratch.enter) * length;
}

export function segmentEllipseInterval(x1, y1, x2, y2, cx, cy, rx, ry, out) {
    const invRx = 1 / Math.max(1e-6, rx);
    const invRy = 1 / Math.max(1e-6, ry);
    const ax = (x1 - cx) * invRx;
    const ay = (y1 - cy) * invRy;
    const bx = (x2 - x1) * invRx;
    const by = (y2 - y1) * invRy;

    const a = (bx * bx) + (by * by);
    const b = 2 * ((ax * bx) + (ay * by));
    const c = (ax * ax) + (ay * ay) - 1;

    if (Math.abs(a) < 1e-8) {
        if (c <= 0) {
            out.enter = 0;
            out.exit = 1;
            return true;
        }
        return false;
    }

    const disc = (b * b) - (4 * a * c);
    if (disc < 0) {
        if (c <= 0) {
            out.enter = 0;
            out.exit = 1;
            return true;
        }
        return false;
    }

    const root = Math.sqrt(disc);
    let t0 = (-b - root) / (2 * a);
    let t1 = (-b + root) / (2 * a);
    if (t0 > t1) {
        const tmp = t0;
        t0 = t1;
        t1 = tmp;
    }
    out.enter = clamp01(t0);
    out.exit = clamp01(t1);

    if (out.exit < 0 || out.enter > 1) return false;

    if (pointInRect(ax, ay, -1, -1, 1, 1) && out.enter > 0) {
        out.enter = 0;
    }
    return out.exit >= out.enter;
}

export function segmentHazardLength(x1, y1, x2, y2, hazard, worldWidth, worldHeight, ellipseScratch) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);

    // ── Flood: full segment minus safe zone exclusions ──
    if (hazard.shape === 'flood') {
        let safeLength = 0;
        if (hazard.safeZones) {
            for (let s = 0; s < hazard.safeZones.length; s++) {
                const sz = hazard.safeZones[s];
                const scx = sz.x * worldWidth;
                const scy = sz.y * worldHeight;
                const srx = sz.radius * worldWidth;
                const sry = srx;
                if (segmentEllipseInterval(x1, y1, x2, y2, scx, scy, srx, sry, ellipseScratch)) {
                    safeLength += (ellipseScratch.exit - ellipseScratch.enter) * length;
                }
            }
        }
        return Math.max(0, length - safeLength);
    }

    // ── Rect puddle: rectangle intersection ──
    if (hazard.shape === 'rect_puddle') {
        const left   = hazard.x * worldWidth;
        const top    = hazard.y * worldHeight;
        const right  = left + (hazard.width * worldWidth);
        const bottom = top  + (hazard.height * worldHeight);
        const rectScratch = { enter: 0, exit: 0 };
        if (!segmentRectInterval(x1, y1, x2, y2, left, top, right, bottom, rectScratch)) {
            return 0;
        }
        return (rectScratch.exit - rectScratch.enter) * length;
    }

    // ── Circular / elliptical shapes (puddle, ring, semicircle) ──
    const cx = hazard.x * worldWidth;
    const cy = hazard.y * worldHeight;
    const rx = hazard.radius * worldWidth;
    const ry = rx * (hazard.scaleY || 1.0);

    if (!segmentEllipseInterval(x1, y1, x2, y2, cx, cy, rx, ry, ellipseScratch)) {
        return 0;
    }

    if (hazard.shape === 'semicircle') {
        const mid = (ellipseScratch.enter + ellipseScratch.exit) * 0.5;
        const midX = x1 + ((x2 - x1) * mid);
        if (midX < cx) return 0;
    }

    let outerLength = (ellipseScratch.exit - ellipseScratch.enter) * length;

    // Ring shape: subtract the portion that crosses through the safe inner hole
    if (hazard.shape === 'ring' && hazard.innerRadius) {
        const irx = hazard.innerRadius * worldWidth;
        const iry = irx * (hazard.scaleY || 1.0);
        const innerScratch = { enter: 0, exit: 0 };
        if (segmentEllipseInterval(x1, y1, x2, y2, cx, cy, irx, iry, innerScratch)) {
            const innerLength = (innerScratch.exit - innerScratch.enter) * length;
            outerLength -= innerLength;
        }
    }

    return Math.max(0, outerLength);
}

export function computeZoneWeightedLength(x1, y1, x2, y2, zones, worldWidth, worldHeight, intervalScratch) {
    if (!zones || zones.length === 0) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        return Math.sqrt(dx * dx + dy * dy);
    }

    const breakpoints = [0, 1];
    for (let i = 0; i < zones.length; i++) {
        const zone = zones[i];
        const left = zone.x * worldWidth;
        const top = zone.y * worldHeight;
        const right = left + (zone.width * worldWidth);
        const bottom = top + (zone.height * worldHeight);
        if (segmentRectInterval(x1, y1, x2, y2, left, top, right, bottom, intervalScratch)) {
            breakpoints.push(intervalScratch.enter);
            breakpoints.push(intervalScratch.exit);
        }
    }

    breakpoints.sort((a, b) => a - b);

    const dx = x2 - x1;
    const dy = y2 - y1;
    const totalLength = Math.sqrt(dx * dx + dy * dy);
    let weightedLength = 0;

    for (let i = 0; i < breakpoints.length - 1; i++) {
        const t0 = breakpoints[i];
        const t1 = breakpoints[i + 1];
        if (t1 - t0 < 1e-5) continue;

        const mid = (t0 + t1) * 0.5;
        const px = x1 + (dx * mid);
        const py = y1 + (dy * mid);
        let speedMult = 1;

        for (let z = 0; z < zones.length; z++) {
            const zone = zones[z];
            const left = zone.x * worldWidth;
            const top = zone.y * worldHeight;
            const right = left + (zone.width * worldWidth);
            const bottom = top + (zone.height * worldHeight);
            if (pointInRect(px, py, left, top, right, bottom)) {
                speedMult = zone.speedMult || 1;
                break;
            }
        }

        weightedLength += ((t1 - t0) * totalLength) / Math.max(0.05, speedMult);
    }

    return weightedLength;
}

export function calcProductionRateForType(type) {
    if (type === 'enjambre') return 2.5;
    if (type === 'gigante') return 1.8;
    if (type === 'tunel') return 0;
    return 1.0;
}

export function getWaterNextSpawnDelay(sweep) {
    if (!sweep) return INF;
    if (sweep._isAlerting) return Math.max(0, sweep._alertTimer || 0);
    return Math.max(0, (sweep._spawnTimer || 0) + (sweep.alertDuration || 0));
}

export function getBarOverlapExit(unitX, unitVx, duration, barX, barWidth, barSpeed) {
    const relV = unitVx - barSpeed;

    if (Math.abs(relV) < 1e-5) {
        if (unitX >= barX && unitX <= barX + barWidth) {
            return duration;
        }
        return -1;
    }

    const t1 = (barX - unitX) / relV;
    const t2 = ((barX + barWidth) - unitX) / relV;
    const enter = t1 < t2 ? t1 : t2;
    const exit = t1 > t2 ? t1 : t2;

    if (exit < 0 || enter > duration) return -1;
    return exit > duration ? duration : exit;
}

export function distancePointToSegment(px, py, x1, y1, x2, y2, outClosest) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = (dx * dx) + (dy * dy);
    let t = 0;
    if (lenSq > 1e-6) {
        t = (((px - x1) * dx) + ((py - y1) * dy)) / lenSq;
        t = clamp01(t);
    }
    const cx = x1 + (dx * t);
    const cy = y1 + (dy * t);
    if (outClosest) {
        outClosest.x = cx;
        outClosest.y = cy;
    }
    const ox = px - cx;
    const oy = py - cy;
    return Math.sqrt((ox * ox) + (oy * oy));
}


export class TemporalHazardEvaluator {
    constructor() {
        this._rectScratch = { enter: 0, exit: 0 };
    }

    evaluateEdge(store, edgeIndex, departureTime, state, out) {
        out.reset();

        const edgeLength = store.edgeLength[edgeIndex];
        if (edgeLength <= 0.01) {
            out.isViable = false;
            return out;
        }

        const speedScale = store.baseSpeedPxSec / Math.max(1, state.baseSpeedPxSec || store.baseSpeedPxSec);
        const staticTransit = store.edgeStaticTime[edgeIndex] * speedScale;
        const effectiveSpeed = edgeLength / Math.max(0.01, staticTransit);

        let projectedCasualties = 0;
        const hazardStart = store.edgeHazardStart[edgeIndex];
        const hazardEnd = hazardStart + store.edgeHazardCount[edgeIndex];
        const hazards = state.hazards || [];
        for (let i = hazardStart; i < hazardEnd; i++) {
            const hazard = hazards[store.hazardRefIndex[i]];
            if (!hazard) continue;
            const timeInside = store.hazardRefLength[i] / Math.max(1, effectiveSpeed);
            projectedCasualties += Math.ceil((hazard.dps || 0) * timeInside);
            if (projectedCasualties >= state.squadCount) {
                out.isViable = false;
                out.projectedCasualties = state.squadCount;
                return out;
            }
        }

        const suggestedDelay = this._findEarliestSafeDelay(store, edgeIndex, departureTime, staticTransit, state);
        if (!Number.isFinite(suggestedDelay)) {
            out.isViable = false;
            out.projectedCasualties = projectedCasualties;
            return out;
        }

        out.isViable = true;
        out.projectedCasualties = projectedCasualties;
        out.suggestedDelay = suggestedDelay;
        out.projectedTransitTime = staticTransit + suggestedDelay;
        out.arrivalTime = departureTime + out.projectedTransitTime;
        return out;
    }

    _findEarliestSafeDelay(store, edgeIndex, departureTime, transitTime, state) {
        let delay = 0;
        for (let iter = 0; iter < MAX_DELAY_ITERS; iter++) {
            const departureAbs = departureTime + delay;
            let unsafeUntil = -1;

            const waterUntil = this._getWaterUnsafeUntil(store, edgeIndex, departureAbs, transitTime, state);
            if (waterUntil > unsafeUntil) unsafeUntil = waterUntil;

            const lightUntil = this._getLightUnsafeUntil(store, edgeIndex, departureAbs, transitTime, state);
            if (lightUntil > unsafeUntil) unsafeUntil = lightUntil;

            const barrierUntil = this._getIntermittentUnsafeUntil(store, edgeIndex, departureAbs, transitTime, state);
            if (barrierUntil > unsafeUntil) unsafeUntil = barrierUntil;

            if (unsafeUntil < 0) return delay;

            const nextDelay = (unsafeUntil - departureTime) + SAFE_EPSILON;
            if (nextDelay <= delay + 1e-4) {
                delay += SAFE_EPSILON;
            } else {
                delay = nextDelay;
            }

            if (delay > 120) return Number.POSITIVE_INFINITY;
        }

        return Number.POSITIVE_INFINITY;
    }

    _getWaterUnsafeUntil(store, edgeIndex, departureAbs, transitTime, state) {
        const sweeps = state.waterSweeps || [];
        if (sweeps.length === 0) return -1;

        const now = state.gameTimeSec;
        const fromIndex = store.edgeFrom[edgeIndex];
        const toIndex = store.edgeTo[edgeIndex];
        const x1 = store.nodeX[fromIndex];
        const y1 = store.nodeY[fromIndex];
        const x2 = store.nodeX[toIndex];
        const y2 = store.nodeY[toIndex];
        const unitVx = (x2 - x1) / Math.max(0.01, transitTime);
        let unsafeUntil = -1;

        for (let i = 0; i < sweeps.length; i++) {
            const sweep = sweeps[i];
            if (!sweep) continue;

            if (typeof sweep.predictUnsafeUntil === 'function') {
                const predicted = sweep.predictUnsafeUntil(
                    x1,
                    y1,
                    x2,
                    y2,
                    departureAbs,
                    transitTime,
                    now,
                    state.worldWidth,
                    state.worldHeight
                );
                if (predicted > unsafeUntil) unsafeUntil = predicted;
                continue;
            }

            const barWidth = sweep._barWorldWidth || ((sweep.widthFrac || 0) * state.worldWidth);
            for (let b = 0; b < sweep._activeBars.length; b++) {
                const bar = sweep._activeBars[b];
                const barX = bar.worldX + (sweep.speed * (departureAbs - now));
                const exit = getBarOverlapExit(x1, unitVx, transitTime, barX, barWidth, sweep.speed);
                if (exit >= 0) {
                    const unsafeAbs = departureAbs + exit;
                    if (unsafeAbs > unsafeUntil) unsafeUntil = unsafeAbs;
                }
            }

            let spawnAbs = now + getWaterNextSpawnDelay(sweep);
            const spawnStartX = -barWidth - (sweep.speed * 4);
            let events = 0;

            while (spawnAbs <= departureAbs + transitTime && events < MAX_WATER_EVENTS) {
                if (spawnAbs <= departureAbs) {
                    const barX = spawnStartX + (sweep.speed * (departureAbs - spawnAbs));
                    const exit = getBarOverlapExit(x1, unitVx, transitTime, barX, barWidth, sweep.speed);
                    if (exit >= 0) {
                        const unsafeAbs = departureAbs + exit;
                        if (unsafeAbs > unsafeUntil) unsafeUntil = unsafeAbs;
                    }
                } else {
                    const spawnLocal = spawnAbs - departureAbs;
                    if (spawnLocal < transitTime) {
                        const unitXAtSpawn = x1 + (unitVx * spawnLocal);
                        const exit = getBarOverlapExit(unitXAtSpawn, unitVx, transitTime - spawnLocal, spawnStartX, barWidth, sweep.speed);
                        if (exit >= 0) {
                            const unsafeAbs = spawnAbs + exit;
                            if (unsafeAbs > unsafeUntil) unsafeUntil = unsafeAbs;
                        }
                    }
                }

                spawnAbs += (sweep.cooldown || INF);
                events++;
            }
        }

        return unsafeUntil;
    }

    _getLightUnsafeUntil(store, edgeIndex, departureAbs, transitTime, state) {
        const toIndex = store.edgeTo[edgeIndex];
        if ((store.nodeFlags[toIndex] & NODE_FLAG_MARKED_FOR_LIGHT) === 0) {
            return -1;
        }

        const sweeps = state.lightSweeps || [];
        if (sweeps.length === 0) return -1;

        const arrivalAbs = departureAbs + transitTime;
        let unsafeUntil = -1;
        const nodeX = store.nodeX[toIndex];
        const nodeY = store.nodeY[toIndex];

        for (let i = 0; i < sweeps.length; i++) {
            const hitAbs = this._predictNextLightHitAbsoluteTime(sweeps[i], nodeX, nodeY, state, departureAbs);
            if (hitAbs >= departureAbs && hitAbs <= arrivalAbs + state.captureWindowSec) {
                const candidate = hitAbs + SAFE_EPSILON;
                if (candidate > unsafeUntil) unsafeUntil = candidate;
            }
        }

        return unsafeUntil;
    }

    _predictNextLightHitAbsoluteTime(sweep, nodeX, nodeY, state, minTime) {
        if (!sweep) return INF;

        const scaleX = Math.max(0.0001, state.worldScaleX || 1);
        const offsetX = state.worldOffsetX || 0;
        const worldSpeed = (sweep.speed || 0) / scaleX;
        if (worldSpeed <= 0) return INF;

        let aligned = false;
        const rails = sweep.rails || [0.5];
        for (let i = 0; i < rails.length; i++) {
            const railY = rails[i] * state.worldHeight;
            if (Math.abs(nodeY - railY) <= (sweep.orbRadius || 0) + 80) {
                aligned = true;
                break;
            }
        }
        if (!aligned) return INF;

        let best = INF;
        const now = state.gameTimeSec;

        if (sweep.state === 'sweeping' && sweep.orbs && sweep.orbs.length > 0) {
            for (let i = 0; i < sweep.orbs.length; i++) {
                const orb = sweep.orbs[i];
                if (Math.abs(orb.worldY - nodeY) > (sweep.orbRadius || 0) + 80) continue;
                const dt = (nodeX - orb.worldX) / worldSpeed;
                if (dt >= 0) {
                    const hitAbs = now + dt;
                    if (hitAbs >= minTime && hitAbs < best) best = hitAbs;
                }
            }
        }

        let cycleSpawnAbs = INF;
        if (sweep.state === 'waiting') {
            cycleSpawnAbs = now + (sweep.timer || 0) + (sweep.alertDuration || 0);
        } else if (sweep.state === 'alerting') {
            cycleSpawnAbs = now + (sweep.timer || 0);
        } else if (sweep.state === 'sweeping') {
            let latestFinish = 0;
            for (let i = 0; i < sweep.orbs.length; i++) {
                const orb = sweep.orbs[i];
                const screenX = (orb.worldX * scaleX) + offsetX;
                const remain = ((state.worldWidth + (sweep.orbRadius || 0) + 60) - screenX) / Math.max(1e-4, sweep.speed || 1);
                if (remain > latestFinish) latestFinish = remain;
            }
            cycleSpawnAbs = now + latestFinish + (sweep.cooldown || 0) + (sweep.alertDuration || 0);
        }

        const startX = ((0 - offsetX) / scaleX) - ((sweep.orbRadius || 0) * 2);
        for (let cycle = 0; cycle < MAX_LIGHT_CYCLES && Number.isFinite(cycleSpawnAbs); cycle++) {
            if (cycleSpawnAbs >= minTime) {
                const hitAbs = cycleSpawnAbs + Math.max(0, (nodeX - startX) / worldSpeed);
                if (hitAbs < best) best = hitAbs;
            }
            cycleSpawnAbs += (sweep.cooldown || INF) + (sweep.alertDuration || 0);
        }

        return best;
    }

    _getIntermittentUnsafeUntil(store, edgeIndex, departureAbs, transitTime, state) {
        const barriers = state.intermittentBarriers || [];
        if (barriers.length === 0) return -1;

        const fromIndex = store.edgeFrom[edgeIndex];
        const toIndex = store.edgeTo[edgeIndex];
        const x1 = store.nodeX[fromIndex];
        const y1 = store.nodeY[fromIndex];
        const x2 = store.nodeX[toIndex];
        const y2 = store.nodeY[toIndex];

        let unsafeUntil = -1;
        for (let i = 0; i < barriers.length; i++) {
            const barrier = barriers[i];
            if (!barrier || !barrier.zones || barrier.zones.length === 0) continue;

            const delta = departureAbs - state.gameTimeSec;
            const barrierState = this._resolveIntermittentState(barrier, delta);
            const zone = barrier.zones[barrierState.zoneIndex];
            if (!zone || zone.hidden) continue;

            if (zone.isHollow) {
                if (this._intersectsActiveBarrierRect(x1, y1, x2, y2, zone.x, zone.y, zone.width, zone.thickness || 0.012, barrierState, transitTime, state)) {
                    if (state.gameTimeSec + barrierState.unsafeUntil > unsafeUntil) unsafeUntil = state.gameTimeSec + barrierState.unsafeUntil;
                }
                if (this._intersectsActiveBarrierRect(x1, y1, x2, y2, zone.x, zone.y + zone.height - (zone.thickness || 0.012), zone.width, zone.thickness || 0.012, barrierState, transitTime, state)) {
                    if (state.gameTimeSec + barrierState.unsafeUntil > unsafeUntil) unsafeUntil = state.gameTimeSec + barrierState.unsafeUntil;
                }
                if (this._intersectsActiveBarrierRect(x1, y1, x2, y2, zone.x, zone.y, zone.thickness || 0.012, zone.height, barrierState, transitTime, state)) {
                    if (state.gameTimeSec + barrierState.unsafeUntil > unsafeUntil) unsafeUntil = state.gameTimeSec + barrierState.unsafeUntil;
                }
                if (this._intersectsActiveBarrierRect(x1, y1, x2, y2, zone.x + zone.width - (zone.thickness || 0.012), zone.y, zone.thickness || 0.012, zone.height, barrierState, transitTime, state)) {
                    if (state.gameTimeSec + barrierState.unsafeUntil > unsafeUntil) unsafeUntil = state.gameTimeSec + barrierState.unsafeUntil;
                }
            } else if (this._intersectsActiveBarrierRect(x1, y1, x2, y2, zone.x, zone.y, zone.width, zone.height, barrierState, transitTime, state)) {
                if (state.gameTimeSec + barrierState.unsafeUntil > unsafeUntil) unsafeUntil = state.gameTimeSec + barrierState.unsafeUntil;
            }
        }

        return unsafeUntil;
    }

    _resolveIntermittentState(barrier, delta) {
        const raw = (barrier.timer || 0) + delta;
        let steps = 0;
        let timeToSwitch = barrier.interval || 0;

        if (raw < 0) {
            timeToSwitch = (barrier.interval || 0) - raw;
        } else if (raw < (barrier.interval || 0)) {
            timeToSwitch = (barrier.interval || 0) - raw;
        } else {
            steps = 1 + Math.floor((raw - barrier.interval) / barrier.interval);
            const sinceLast = raw - (steps * barrier.interval);
            timeToSwitch = barrier.interval - sinceLast;
        }

        return {
            zoneIndex: (barrier.activeZoneIndex + steps) % barrier.zones.length,
            unsafeUntil: delta + timeToSwitch
        };
    }

    _intersectsActiveBarrierRect(x1, y1, x2, y2, rx, ry, rw, rh, barrierState, transitTime, state) {
        const left = rx * state.worldWidth;
        const top = ry * state.worldHeight;
        const right = left + (rw * state.worldWidth);
        const bottom = top + (rh * state.worldHeight);
        if (!segmentRectInterval(x1, y1, x2, y2, left, top, right, bottom, this._rectScratch)) {
            return false;
        }

        const hitTime = this._rectScratch.enter * transitTime;
        if (hitTime < barrierState.unsafeUntil + SAFE_EPSILON) return true;
        return false;
    }
}


export class LocalAvoidanceSolver {
    constructor(config = {}) {
        this.wallQueryRadius = config.wallQueryRadius || 8;
        this.wallRepulsion = config.wallRepulsion || 60;
        this.separationWeight = config.separationWeight || 1;
        this.wallWeight = config.wallWeight || 1;
        this.store = null;
        this._surfaceIds = [];
        this._closest = { x: 0, y: 0 };
        this._out = new Float32Array(2);
    }

    setStaticStore(store) {
        this.store = store;
    }

    solve(unit, desiredVx, desiredVy, sepVx, sepVy, actualSpeed, grid) {
        let totalVx = desiredVx + (sepVx * this.separationWeight);
        let totalVy = desiredVy + (sepVy * this.separationWeight);

        if (!grid || !this.store || this.store.surfaceCount === 0) {
            this._out[0] = totalVx;
            this._out[1] = totalVy;
            return this._out;
        }

        grid.findNearbySurfaces(unit.x, unit.y, this.wallQueryRadius, this._surfaceIds);
        let repVx = 0;
        let repVy = 0;
        let slideVx = totalVx;
        let slideVy = totalVy;

        for (let i = 0; i < this._surfaceIds.length; i++) {
            const surfaceIndex = this._surfaceIds[i];
            const x1 = this.store.surfaceX1[surfaceIndex];
            const y1 = this.store.surfaceY1[surfaceIndex];
            const x2 = this.store.surfaceX2[surfaceIndex];
            const y2 = this.store.surfaceY2[surfaceIndex];
            const nx = this.store.surfaceNx[surfaceIndex];
            const ny = this.store.surfaceNy[surfaceIndex];

            const dist = distancePointToSegment(unit.x, unit.y, x1, y1, x2, y2, this._closest);
            if (dist >= this.wallQueryRadius) continue;

            const proximity = 1 - (dist / this.wallQueryRadius);
            const strength = this.wallRepulsion * proximity * proximity;
            repVx += nx * strength;
            repVy += ny * strength;

            const inward = (slideVx * nx) + (slideVy * ny);
            if (inward < 0) {
                slideVx -= inward * nx;
                slideVy -= inward * ny;
            }
        }

        totalVx = slideVx + (repVx * this.wallWeight);
        totalVy = slideVy + (repVy * this.wallWeight);

        const magSq = (totalVx * totalVx) + (totalVy * totalVy);
        const maxSpeedSq = actualSpeed * actualSpeed;
        if (magSq > maxSpeedSq && magSq > 1e-6) {
            const scale = actualSpeed / Math.sqrt(magSq);
            totalVx *= scale;
            totalVy *= scale;
        }

        this._out[0] = totalVx;
        this._out[1] = totalVy;
        return this._out;
    }
}

