const INF = 1e30;
const DEFAULT_BASE_SPEED = 75;
const DEFAULT_CAPTURE_WINDOW = 1.25;
const DEFAULT_ROUTE_HOPS = 16;
const MAX_DELAY_ITERS = 12;
const MAX_WATER_EVENTS = 10;
const MAX_LIGHT_CYCLES = 3;
const SAFE_EPSILON = 0.05;
const DIRECT_ABORT_RATIO = 0.12;
const CASUALTY_ROUTE_WEIGHT = 0.9;

const NODE_FLAG_MARKED_FOR_LIGHT = 1;

function clamp01(v) {
    if (v <= 0) return 0;
    if (v >= 1) return 1;
    return v;
}

function pointInRect(x, y, left, top, right, bottom) {
    return x >= left && x <= right && y >= top && y <= bottom;
}

function segmentRectInterval(x1, y1, x2, y2, left, top, right, bottom, out) {
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

function segmentRectLength(x1, y1, x2, y2, left, top, right, bottom, intervalScratch) {
    if (!segmentRectInterval(x1, y1, x2, y2, left, top, right, bottom, intervalScratch)) {
        return 0;
    }
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    return (intervalScratch.exit - intervalScratch.enter) * length;
}

function segmentEllipseInterval(x1, y1, x2, y2, cx, cy, rx, ry, out) {
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

function segmentHazardLength(x1, y1, x2, y2, hazard, worldWidth, worldHeight, ellipseScratch) {
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

function computeZoneWeightedLength(x1, y1, x2, y2, zones, worldWidth, worldHeight, intervalScratch) {
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

function calcProductionRateForType(type) {
    if (type === 'enjambre') return 2.5;
    if (type === 'gigante') return 1.8;
    if (type === 'tunel') return 0;
    return 1.0;
}

function getWaterNextSpawnDelay(sweep) {
    if (!sweep) return INF;
    if (sweep._isAlerting) return Math.max(0, sweep._alertTimer || 0);
    return Math.max(0, (sweep._spawnTimer || 0) + (sweep.alertDuration || 0));
}

function getBarOverlapExit(unitX, unitVx, duration, barX, barWidth, barSpeed) {
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

function distancePointToSegment(px, py, x1, y1, x2, y2, outClosest) {
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

export class PathEvaluationResult {
    constructor() {
        this.isViable = false;
        this.projectedTransitTime = 0;
        this.projectedCasualties = 0;
        this.suggestedDelay = 0;
        this.queryHandle = -1;
    }

    reset() {
        this.isViable = false;
        this.projectedTransitTime = 0;
        this.projectedCasualties = 0;
        this.suggestedDelay = 0;
        this.queryHandle = -1;
    }
}

export class NavigationGameStateView {
    constructor() {
        this.gameTimeSec = 0;
        this.squadCount = 0;
        this.baseSpeedPxSec = DEFAULT_BASE_SPEED;
        this.captureWindowSec = DEFAULT_CAPTURE_WINDOW;
        this.worldWidth = 1920;
        this.worldHeight = 1080;
        this.worldScaleX = 1;
        this.worldOffsetX = 0;
        this.hazards = null;
        this.waterSweeps = null;
        this.lightSweeps = null;
        this.intermittentBarriers = null;
    }
}

export class NavStaticStore {
    constructor(config) {
        this.baseSpeedPxSec = config.baseSpeedPxSec;
        this.worldWidth = config.worldWidth;
        this.worldHeight = config.worldHeight;
        this.cellSize = config.cellSize;
        this.cols = config.cols;
        this.rows = config.rows;
        this.nodeCount = config.nodeCount;
        this.edgeCount = config.edgeCount;
        this.surfaceCount = config.surfaceCount;

        this.nodeX = config.nodeX;
        this.nodeY = config.nodeY;
        this.nodeFlags = config.nodeFlags;
        this.nodeProductionRate = config.nodeProductionRate;

        this.edgeStart = config.edgeStart;
        this.edgeFrom = config.edgeFrom;
        this.edgeTo = config.edgeTo;
        this.edgeLength = config.edgeLength;
        this.edgeStaticTime = config.edgeStaticTime;
        this.edgeFlags = config.edgeFlags;

        this.edgeZoneStart = config.edgeZoneStart;
        this.edgeZoneCount = config.edgeZoneCount;
        this.zoneRefIndex = config.zoneRefIndex;
        this.zoneRefLength = config.zoneRefLength;

        this.edgeHazardStart = config.edgeHazardStart;
        this.edgeHazardCount = config.edgeHazardCount;
        this.hazardRefIndex = config.hazardRefIndex;
        this.hazardRefLength = config.hazardRefLength;

        this.surfaceX1 = config.surfaceX1;
        this.surfaceY1 = config.surfaceY1;
        this.surfaceX2 = config.surfaceX2;
        this.surfaceY2 = config.surfaceY2;
        this.surfaceNx = config.surfaceNx;
        this.surfaceNy = config.surfaceNy;
        this.surfaceLen = config.surfaceLen;
        this.surfaceCellHead = config.surfaceCellHead;
        this.surfaceCellNext = config.surfaceCellNext;
        this.surfaceCellSurface = config.surfaceCellSurface;
    }
}

export class NavigationStaticBake {
    static buildFromWorld(world, options = {}) {
        const nodes = world.nodes || [];
        let barriers = world.barriers ? [...world.barriers] : [];
        if (world.intermittentBarriers && world.intermittentBarriers.length > 0) {
            for (let ib of world.intermittentBarriers) {
                const activeBounds = ib.getActiveBounds();
                if (activeBounds && activeBounds.length > 0) {
                    barriers = barriers.concat(activeBounds);
                }
            }
        }
        const zones = world.zones || [];
        const hazards = world.hazards || [];
        const worldWidth = world.game ? world.game.width : 1920;
        const worldHeight = world.game ? world.game.height : 1080;
        const baseSpeedPxSec = options.baseSpeedPxSec || world.unitBaseSpeed || DEFAULT_BASE_SPEED;
        const cellSize = options.cellSize || world.gridSize || 30;
        const cols = Math.ceil(worldWidth / cellSize) + 1;
        const rows = Math.ceil(worldHeight / cellSize) + 1;

        const nodeCount = nodes.length;
        const nodeX = new Float32Array(nodeCount);
        const nodeY = new Float32Array(nodeCount);
        const nodeFlags = new Uint8Array(nodeCount);
        const nodeProductionRate = new Float32Array(nodeCount);

        const barrierScratch = { enter: 0, exit: 0 };
        const hazardScratch = { enter: 0, exit: 0 };
        const edgeStart = new Int32Array(nodeCount + 1);

        let edgeCount = 0;
        let zoneRefCount = 0;
        let hazardRefCount = 0;

        for (let i = 0; i < nodeCount; i++) {
            const node = nodes[i];
            nodeX[i] = node.x;
            nodeY[i] = node.y;
            nodeProductionRate[i] = node.productionRate || calcProductionRateForType(node.type);
            if (node.isMarkedForSweep) {
                nodeFlags[i] |= NODE_FLAG_MARKED_FOR_LIGHT;
            }
        }

        for (let from = 0; from < nodeCount; from++) {
            const fromNode = nodes[from];
            edgeStart[from] = edgeCount;
            for (let to = 0; to < nodeCount; to++) {
                if (from === to) continue;
                const toNode = nodes[to];
                if (!fromNode.isMobile && !toNode.isMobile) {
                    let blocked = false;
                    for (let b = 0; b < barriers.length; b++) {
                        const barrier = barriers[b];
                        const left = barrier.x * worldWidth;
                        const top = barrier.y * worldHeight;
                        const right = left + (barrier.width * worldWidth);
                        const bottom = top + (barrier.height * worldHeight);
                        if (segmentRectInterval(fromNode.x, fromNode.y, toNode.x, toNode.y, left, top, right, bottom, barrierScratch)) {
                            blocked = true;
                            break;
                        }
                    }
                    if (blocked) continue;
                }

                edgeCount++;
                for (let z = 0; z < zones.length; z++) {
                    const zone = zones[z];
                    const left = zone.x * worldWidth;
                    const top = zone.y * worldHeight;
                    const right = left + (zone.width * worldWidth);
                    const bottom = top + (zone.height * worldHeight);
                    if (segmentRectLength(fromNode.x, fromNode.y, toNode.x, toNode.y, left, top, right, bottom, barrierScratch) > 0.01) {
                        zoneRefCount++;
                    }
                }
                for (let h = 0; h < hazards.length; h++) {
                    if (segmentHazardLength(fromNode.x, fromNode.y, toNode.x, toNode.y, hazards[h], worldWidth, worldHeight, hazardScratch) > 0.01) {
                        hazardRefCount++;
                    }
                }
            }
        }
        edgeStart[nodeCount] = edgeCount;

        const edgeFrom = new Int16Array(edgeCount);
        const edgeTo = new Int16Array(edgeCount);
        const edgeLength = new Float32Array(edgeCount);
        const edgeStaticTime = new Float32Array(edgeCount);
        const edgeFlags = new Uint16Array(edgeCount);
        const edgeZoneStart = new Int32Array(edgeCount);
        const edgeZoneCount = new Uint16Array(edgeCount);
        const zoneRefIndex = new Int16Array(zoneRefCount);
        const zoneRefLength = new Float32Array(zoneRefCount);
        const edgeHazardStart = new Int32Array(edgeCount);
        const edgeHazardCount = new Uint16Array(edgeCount);
        const hazardRefIndex = new Int16Array(hazardRefCount);
        const hazardRefLength = new Float32Array(hazardRefCount);

        let edgeCursor = 0;
        let zoneCursor = 0;
        let hazardCursor = 0;

        for (let from = 0; from < nodeCount; from++) {
            const fromNode = nodes[from];
            for (let to = 0; to < nodeCount; to++) {
                if (from === to) continue;
                const toNode = nodes[to];
                if (!fromNode.isMobile && !toNode.isMobile) {
                    let blocked = false;
                    for (let b = 0; b < barriers.length; b++) {
                        const barrier = barriers[b];
                        const left = barrier.x * worldWidth;
                        const top = barrier.y * worldHeight;
                        const right = left + (barrier.width * worldWidth);
                        const bottom = top + (barrier.height * worldHeight);
                        if (segmentRectInterval(fromNode.x, fromNode.y, toNode.x, toNode.y, left, top, right, bottom, barrierScratch)) {
                            blocked = true;
                            break;
                        }
                    }
                    if (blocked) continue;
                }

                edgeFrom[edgeCursor] = from;
                edgeTo[edgeCursor] = to;

                const dx = toNode.x - fromNode.x;
                const dy = toNode.y - fromNode.y;
                const length = Math.sqrt((dx * dx) + (dy * dy));
                edgeLength[edgeCursor] = length;
                edgeStaticTime[edgeCursor] = computeZoneWeightedLength(
                    fromNode.x,
                    fromNode.y,
                    toNode.x,
                    toNode.y,
                    zones,
                    worldWidth,
                    worldHeight,
                    barrierScratch
                ) / Math.max(0.01, baseSpeedPxSec);

                edgeZoneStart[edgeCursor] = zoneCursor;
                for (let z = 0; z < zones.length; z++) {
                    const zone = zones[z];
                    const left = zone.x * worldWidth;
                    const top = zone.y * worldHeight;
                    const right = left + (zone.width * worldWidth);
                    const bottom = top + (zone.height * worldHeight);
                    const zoneLength = segmentRectLength(fromNode.x, fromNode.y, toNode.x, toNode.y, left, top, right, bottom, barrierScratch);
                    if (zoneLength > 0.01) {
                        zoneRefIndex[zoneCursor] = z;
                        zoneRefLength[zoneCursor] = zoneLength;
                        zoneCursor++;
                    }
                }
                edgeZoneCount[edgeCursor] = zoneCursor - edgeZoneStart[edgeCursor];

                edgeHazardStart[edgeCursor] = hazardCursor;
                for (let h = 0; h < hazards.length; h++) {
                    const hazardLength = segmentHazardLength(
                        fromNode.x,
                        fromNode.y,
                        toNode.x,
                        toNode.y,
                        hazards[h],
                        worldWidth,
                        worldHeight,
                        hazardScratch
                    );
                    if (hazardLength > 0.01) {
                        hazardRefIndex[hazardCursor] = h;
                        hazardRefLength[hazardCursor] = hazardLength;
                        hazardCursor++;
                    }
                }
                edgeHazardCount[edgeCursor] = hazardCursor - edgeHazardStart[edgeCursor];
                edgeCursor++;
            }
        }

        const surfaceDefs = [];
        for (let i = 0; i < barriers.length; i++) {
            const barrier = barriers[i];
            const bx = barrier.x * worldWidth;
            const by = barrier.y * worldHeight;
            const bw = barrier.width * worldWidth;
            const bh = barrier.height * worldHeight;

            surfaceDefs.push({ x1: bx, y1: by, x2: bx + bw, y2: by, nx: 0, ny: -1, len: bw });
            surfaceDefs.push({ x1: bx, y1: by + bh, x2: bx + bw, y2: by + bh, nx: 0, ny: 1, len: bw });
            surfaceDefs.push({ x1: bx, y1: by, x2: bx, y2: by + bh, nx: -1, ny: 0, len: bh });
            surfaceDefs.push({ x1: bx + bw, y1: by, x2: bx + bw, y2: by + bh, nx: 1, ny: 0, len: bh });
        }

        const surfaceCount = surfaceDefs.length;
        const surfaceX1 = new Float32Array(surfaceCount);
        const surfaceY1 = new Float32Array(surfaceCount);
        const surfaceX2 = new Float32Array(surfaceCount);
        const surfaceY2 = new Float32Array(surfaceCount);
        const surfaceNx = new Float32Array(surfaceCount);
        const surfaceNy = new Float32Array(surfaceCount);
        const surfaceLen = new Float32Array(surfaceCount);

        let linkCount = 0;
        for (let i = 0; i < surfaceCount; i++) {
            const surface = surfaceDefs[i];
            surfaceX1[i] = surface.x1;
            surfaceY1[i] = surface.y1;
            surfaceX2[i] = surface.x2;
            surfaceY2[i] = surface.y2;
            surfaceNx[i] = surface.nx;
            surfaceNy[i] = surface.ny;
            surfaceLen[i] = surface.len;

            const minX = surface.x1 < surface.x2 ? surface.x1 : surface.x2;
            const maxX = surface.x1 > surface.x2 ? surface.x1 : surface.x2;
            const minY = surface.y1 < surface.y2 ? surface.y1 : surface.y2;
            const maxY = surface.y1 > surface.y2 ? surface.y1 : surface.y2;
            const col0 = Math.max(0, Math.floor(minX / cellSize));
            const col1 = Math.min(cols - 1, Math.floor(maxX / cellSize));
            const row0 = Math.max(0, Math.floor(minY / cellSize));
            const row1 = Math.min(rows - 1, Math.floor(maxY / cellSize));
            linkCount += ((col1 - col0) + 1) * ((row1 - row0) + 1);
        }

        const surfaceCellHead = new Int32Array(cols * rows);
        const surfaceCellNext = new Int32Array(linkCount);
        const surfaceCellSurface = new Int16Array(linkCount);
        surfaceCellHead.fill(-1);
        surfaceCellNext.fill(-1);

        let linkCursor = 0;
        for (let i = 0; i < surfaceCount; i++) {
            const minX = surfaceX1[i] < surfaceX2[i] ? surfaceX1[i] : surfaceX2[i];
            const maxX = surfaceX1[i] > surfaceX2[i] ? surfaceX1[i] : surfaceX2[i];
            const minY = surfaceY1[i] < surfaceY2[i] ? surfaceY1[i] : surfaceY2[i];
            const maxY = surfaceY1[i] > surfaceY2[i] ? surfaceY1[i] : surfaceY2[i];
            const col0 = Math.max(0, Math.floor(minX / cellSize));
            const col1 = Math.min(cols - 1, Math.floor(maxX / cellSize));
            const row0 = Math.max(0, Math.floor(minY / cellSize));
            const row1 = Math.min(rows - 1, Math.floor(maxY / cellSize));

            for (let row = row0; row <= row1; row++) {
                for (let col = col0; col <= col1; col++) {
                    const cellIndex = col + (row * cols);
                    surfaceCellSurface[linkCursor] = i;
                    surfaceCellNext[linkCursor] = surfaceCellHead[cellIndex];
                    surfaceCellHead[cellIndex] = linkCursor;
                    linkCursor++;
                }
            }
        }

        return new NavStaticStore({
            baseSpeedPxSec,
            worldWidth,
            worldHeight,
            cellSize,
            cols,
            rows,
            nodeCount,
            edgeCount,
            surfaceCount,
            nodeX,
            nodeY,
            nodeFlags,
            nodeProductionRate,
            edgeStart,
            edgeFrom,
            edgeTo,
            edgeLength,
            edgeStaticTime,
            edgeFlags,
            edgeZoneStart,
            edgeZoneCount,
            zoneRefIndex,
            zoneRefLength,
            edgeHazardStart,
            edgeHazardCount,
            hazardRefIndex,
            hazardRefLength,
            surfaceX1,
            surfaceY1,
            surfaceX2,
            surfaceY2,
            surfaceNx,
            surfaceNy,
            surfaceLen,
            surfaceCellHead,
            surfaceCellNext,
            surfaceCellSurface
        });
    }
}

class EdgeEvalScratch extends PathEvaluationResult {
    constructor() {
        super();
        this.arrivalTime = 0;
    }

    reset() {
        super.reset();
        this.arrivalTime = 0;
    }
}

class PlannerScratch {
    constructor(maxNodes, maxHops) {
        this.dist = new Float32Array(maxNodes);
        this.arrival = new Float32Array(maxNodes);
        this.prev = new Int16Array(maxNodes);
        this.prevEdge = new Int16Array(maxNodes);
        this.visited = new Uint8Array(maxNodes);
        this.routeReverse = new Int16Array(maxHops);
    }

    reset(nodeCount) {
        for (let i = 0; i < nodeCount; i++) {
            this.dist[i] = INF;
            this.arrival[i] = 0;
            this.prev[i] = -1;
            this.prevEdge[i] = -1;
            this.visited[i] = 0;
        }
    }
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

export class TimeDependentRoutePlanner {
    constructor(config = {}) {
        this.maxRouteHops = config.maxRouteHops || DEFAULT_ROUTE_HOPS;
        this.temporalEvaluator = new TemporalHazardEvaluator();
        this.store = null;
        this.scratch = null;
        this._directResult = new EdgeEvalScratch();
        this._aggregateEdge = new EdgeEvalScratch();
        this._routeBuffer = new Int16Array(this.maxRouteHops);
        this._routeHopCount = 0;
        this._querySerial = 0;
        this._lastQueryHandle = -1;
    }

    setStaticStore(store) {
        this.store = store;
        if (!store) {
            this.scratch = null;
            return;
        }
        this.scratch = new PlannerScratch(store.nodeCount, this.maxRouteHops);
    }

    evaluatePath(originNodeIndex, targetNodeIndex, currentGameStateView, outResult) {
        outResult.reset();
        const store = this.store;
        if (!store || !this.scratch) return outResult;
        if (originNodeIndex < 0 || targetNodeIndex < 0) return outResult;
        if (originNodeIndex >= store.nodeCount || targetNodeIndex >= store.nodeCount) return outResult;

        const directEdge = this._findEdge(originNodeIndex, targetNodeIndex);
        if (directEdge !== -1) {
            this.temporalEvaluator.evaluateEdge(store, directEdge, currentGameStateView.gameTimeSec, currentGameStateView, this._directResult);
            const directAbort = Math.floor(currentGameStateView.squadCount * DIRECT_ABORT_RATIO);
            if (this._directResult.isViable &&
                this._directResult.projectedCasualties <= directAbort &&
                this._directResult.suggestedDelay <= 0.25) {
                this._querySerial++;
                this._lastQueryHandle = this._querySerial;
                this._routeHopCount = 1;
                this._routeBuffer[0] = targetNodeIndex;

                outResult.isViable = true;
                outResult.projectedTransitTime = this._directResult.projectedTransitTime;
                outResult.projectedCasualties = this._directResult.projectedCasualties;
                outResult.suggestedDelay = this._directResult.suggestedDelay;
                outResult.queryHandle = this._lastQueryHandle;
                return outResult;
            }
        }

        this.scratch.reset(store.nodeCount);
        this.scratch.dist[originNodeIndex] = 0;
        this.scratch.arrival[originNodeIndex] = currentGameStateView.gameTimeSec;

        for (let step = 0; step < store.nodeCount; step++) {
            let bestNode = -1;
            let bestDist = INF;
            for (let node = 0; node < store.nodeCount; node++) {
                if (this.scratch.visited[node]) continue;
                const dist = this.scratch.dist[node];
                if (dist < bestDist || (dist === bestDist && node < bestNode)) {
                    bestDist = dist;
                    bestNode = node;
                }
            }

            if (bestNode === -1 || bestDist >= INF) break;
            if (bestNode === targetNodeIndex) break;

            this.scratch.visited[bestNode] = 1;

            const edgeStart = store.edgeStart[bestNode];
            const edgeEnd = store.edgeStart[bestNode + 1];
            for (let edgeIndex = edgeStart; edgeIndex < edgeEnd; edgeIndex++) {
                const toNode = store.edgeTo[edgeIndex];
                if (this.scratch.visited[toNode]) continue;

                this.temporalEvaluator.evaluateEdge(
                    store,
                    edgeIndex,
                    this.scratch.arrival[bestNode],
                    currentGameStateView,
                    this._aggregateEdge
                );
                if (!this._aggregateEdge.isViable) continue;

                const nextDist = this.scratch.dist[bestNode] +
                    this._aggregateEdge.projectedTransitTime +
                    (this._aggregateEdge.projectedCasualties * CASUALTY_ROUTE_WEIGHT);
                const currentDist = this.scratch.dist[toNode];
                if (nextDist < currentDist - 1e-4 ||
                    (Math.abs(nextDist - currentDist) <= 1e-4 && bestNode < this.scratch.prev[toNode])) {
                    this.scratch.dist[toNode] = nextDist;
                    this.scratch.arrival[toNode] = this.scratch.arrival[bestNode] + this._aggregateEdge.projectedTransitTime;
                    this.scratch.prev[toNode] = bestNode;
                    this.scratch.prevEdge[toNode] = edgeIndex;
                }
            }
        }

        if (this.scratch.prev[targetNodeIndex] === -1 && targetNodeIndex !== originNodeIndex) {
            outResult.isViable = false;
            if (directEdge !== -1) {
                outResult.suggestedDelay = this._directResult.suggestedDelay;
                outResult.projectedCasualties = this._directResult.projectedCasualties;
            }
            return outResult;
        }

        let hopCount = 0;
        let current = targetNodeIndex;
        while (current !== originNodeIndex && hopCount < this.maxRouteHops) {
            this.scratch.routeReverse[hopCount] = current;
            hopCount++;
            current = this.scratch.prev[current];
            if (current < 0) break;
        }

        if (current !== originNodeIndex || hopCount === 0) {
            outResult.isViable = false;
            return outResult;
        }

        this._routeHopCount = hopCount;
        for (let i = 0; i < hopCount; i++) {
            this._routeBuffer[i] = this.scratch.routeReverse[(hopCount - 1) - i];
        }

        let totalTransit = 0;
        let totalCasualties = 0;
        let totalDelay = 0;
        let departureAbs = currentGameStateView.gameTimeSec;
        let fromNode = originNodeIndex;

        for (let i = 0; i < hopCount; i++) {
            const toNode = this._routeBuffer[i];
            const edgeIndex = this._findEdge(fromNode, toNode);
            if (edgeIndex === -1) {
                outResult.isViable = false;
                return outResult;
            }

            this.temporalEvaluator.evaluateEdge(store, edgeIndex, departureAbs, currentGameStateView, this._aggregateEdge);
            if (!this._aggregateEdge.isViable) {
                outResult.isViable = false;
                return outResult;
            }

            totalTransit += this._aggregateEdge.projectedTransitTime;
            totalCasualties += this._aggregateEdge.projectedCasualties;
            totalDelay += this._aggregateEdge.suggestedDelay;
            departureAbs += this._aggregateEdge.projectedTransitTime;
            fromNode = toNode;
        }

        this._querySerial++;
        this._lastQueryHandle = this._querySerial;

        outResult.isViable = true;
        outResult.projectedTransitTime = totalTransit;
        outResult.projectedCasualties = totalCasualties;
        outResult.suggestedDelay = totalDelay;
        outResult.queryHandle = this._lastQueryHandle;
        return outResult;
    }

    peekFirstHop(queryHandle) {
        if (queryHandle !== this._lastQueryHandle || this._routeHopCount <= 0) return -1;
        return this._routeBuffer[0];
    }

    peekRouteHopCount(queryHandle) {
        if (queryHandle !== this._lastQueryHandle) return 0;
        return this._routeHopCount;
    }

    _findEdge(fromNodeIndex, toNodeIndex) {
        const store = this.store;
        if (!store) return -1;
        const edgeStart = store.edgeStart[fromNodeIndex];
        const edgeEnd = store.edgeStart[fromNodeIndex + 1];
        for (let edgeIndex = edgeStart; edgeIndex < edgeEnd; edgeIndex++) {
            if (store.edgeTo[edgeIndex] === toNodeIndex) return edgeIndex;
        }
        return -1;
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

export class NavigationSystem {
    constructor(config = {}) {
        this.baseSpeedPxSec = config.baseSpeedPxSec || DEFAULT_BASE_SPEED;
        this.pathPlanner = new TimeDependentRoutePlanner({ maxRouteHops: config.maxRouteHops || DEFAULT_ROUTE_HOPS });
        this.localAvoidanceSolver = new LocalAvoidanceSolver(config.localAvoidance || {});
        this.store = null;
    }

    clear() {
        this.store = null;
        this.pathPlanner.setStaticStore(null);
        this.localAvoidanceSolver.setStaticStore(null);
    }

    bakeFromWorld(world) {
        this.store = NavigationStaticBake.buildFromWorld(world, {
            baseSpeedPxSec: this.baseSpeedPxSec,
            cellSize: world.gridSize
        });
        this.pathPlanner.setStaticStore(this.store);
        this.localAvoidanceSolver.setStaticStore(this.store);
        return this.store;
    }

    populateGameStateView(world, squadCount, baseSpeedPxSec, outView) {
        outView.gameTimeSec = world.simTime || 0;
        outView.squadCount = squadCount || 0;
        outView.baseSpeedPxSec = baseSpeedPxSec || this.baseSpeedPxSec;
        outView.captureWindowSec = DEFAULT_CAPTURE_WINDOW;
        outView.worldWidth = world.game ? world.game.width : 1920;
        outView.worldHeight = world.game ? world.game.height : 1080;
        outView.worldScaleX = world.game && world.game.world ? world.game.world.scale.x : 1;
        outView.worldOffsetX = world.game && world.game.world ? world.game.world.position.x : 0;
        outView.hazards = world.hazards;
        outView.waterSweeps = world.waterSweeps;
        outView.lightSweeps = world.lightSweeps;
        outView.intermittentBarriers = world.intermittentBarriers;
        return outView;
    }

    evaluatePath(originNodeIndex, targetNodeIndex, currentGameStateView, outResult) {
        return this.pathPlanner.evaluatePath(originNodeIndex, targetNodeIndex, currentGameStateView, outResult);
    }

    peekFirstHop(queryHandle) {
        return this.pathPlanner.peekFirstHop(queryHandle);
    }

    peekRouteHopCount(queryHandle) {
        return this.pathPlanner.peekRouteHopCount(queryHandle);
    }
}
