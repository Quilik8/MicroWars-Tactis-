
import { NavStaticStore, NavigationStaticBake, TimeDependentRoutePlanner, PathEvaluationResult } from './nav_graph_store.js';
import { LocalAvoidanceSolver } from './nav_hazard_evaluator.js';

export { PathEvaluationResult };

const DEFAULT_BASE_SPEED = 75;
const DEFAULT_CAPTURE_WINDOW = 1.25;
const DEFAULT_ROUTE_HOPS = 16;

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

