
import {
    segmentRectInterval,
    segmentRectLength,
    segmentHazardLength,
    computeZoneWeightedLength,
    calcProductionRateForType,
    TemporalHazardEvaluator
} from './nav_hazard_evaluator.js';

const INF = 1e30;
const DEFAULT_BASE_SPEED = 75;
const DEFAULT_ROUTE_HOPS = 16;
const CASUALTY_ROUTE_WEIGHT = 0.9;
const DIRECT_ABORT_RATIO = 0.12;
const NODE_FLAG_MARKED_FOR_LIGHT = 1;

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

