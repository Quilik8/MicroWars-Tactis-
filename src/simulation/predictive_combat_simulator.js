import { FACTIONS } from '../campaign/faction_data.js';
import {
    ARTILLERY_SPLASH_POWER_BUDGET,
    CAPTURE_CONTEST_THRESHOLD,
    CAPTURE_DECAY_RATE,
    COMBAT_INTERVAL_DEFAULT,
    ESPINOSO_KILL_INTERVAL,
    EVOLUTION_ARTILLERIA,
    EVOLUTION_ESPINOSO,
    RESULT_DERROTA,
    RESULT_EMPATE_ESTANCADO,
    RESULT_VICTORIA_PIRRICA,
    RESULT_VICTORIA_SEGURA,
    UNIT_POWER_HEAVY,
    applyBodyLosses,
    applyDamageToComposition,
    deriveHeavyBodies,
    deriveLightBodies,
    getCaptureSpeed,
    getArtilleryInterval,
    getCombatDamage,
    getEvolutionCode,
    getSpawnInterval,
    getSpawnPowerForEvolutionCode,
    getTotalBodies,
    getTotalPower
} from './deterministic_rules.js';

const ATT_FACTION_INDEX = 0;
const ATT_LIGHT_SENT = 1;
const ATT_HEAVY_SENT = 2;
const ATT_CONTACT_TIME = 3;
const ATT_IDLE_TIME = 4;
const ATT_DEFENSE_IN_TIME = 5;
const ATT_ART_RANGE_IN_TIME = 6;
const ATT_TOTAL_TRANSIT = 7;
const ATT_EFFECTIVE_SPEED = 8;
const ATT_ROUTE_KILLS = 9;

const DEF_NODE_INDEX = 0;
const DEF_OWNER_FACTION_INDEX = 1;
const DEF_OWNER_SIDE = 2;
const DEF_ATTACK_LIGHT = 3;
const DEF_ATTACK_HEAVY = 4;
const DEF_DEFENSE_LIGHT = 5;
const DEF_DEFENSE_HEAVY = 6;
const DEF_CONQUEST_PROGRESS = 7;
const DEF_CONQUERING_SIDE = 8;
const DEF_REGEN_TIMER = 9;
const DEF_COMBAT_TIMER = 10;
const DEF_EVOLUTION_CODE = 11;
const DEF_PENDING_EVOLUTION_CODE = 12;
const DEF_PENDING_EVOLUTION_ETA = 13;
const DEF_ESPINOSO_TIMER = 14;
const DEF_ARTILLERY_TIMER = 15;
const DEF_REGEN_INTERVAL_BASE = 16;
const DEF_MAX_POPULATION_POWER = 17;
const DEF_ARRIVAL_START = 18;
const DEF_ARRIVAL_END = 19;
const DEF_DEFENDER_TUNNEL_ACTIVE = 20;
const DEF_ATTACKER_TUNNEL_ACTIVE = 21;
const DEF_CURRENT_WORLD_UNITS = 22;
const DEF_ARTILLERY_INTERVAL = 23;
const DEF_ARTILLERY_RANGE = 24;
const DEF_RADIUS = 25;
const DEF_ATTACK_DAMAGE_CARRY = 26;
const DEF_DEFENSE_DAMAGE_CARRY = 27;
const DEF_COMBAT_INTERVAL = 28;

const TOA_CONTACT = 0;
const TOA_IDLE = 1;
const TOA_DEFENSE_IN = 2;
const TOA_ART_RANGE_IN = 3;
const TOA_TRANSIT = 4;
const TOA_EFFECTIVE_SPEED = 5;

const RESULT_CODE = 0;
const RESULT_SURVIVOR_BODIES = 1;
const RESULT_SURVIVOR_POWER = 2;
const RESULT_SURVIVOR_LIGHT = 3;
const RESULT_SURVIVOR_HEAVY = 4;
const RESULT_CRITICAL_MASS = 5;
const RESULT_CRITICAL_MASS_TIME = 6;
const RESULT_TIME_TO_DEFENDER_COLLAPSE = 7;
const RESULT_TIME_TO_CAPTURE_START = 8;
const RESULT_TIME_TO_FULL_CAPTURE = 9;
const RESULT_FINAL_OWNER_SIDE = 10;
const RESULT_CAPTURE_PROGRESS_AT_STOP = 11;
const RESULT_STOP_REASON = 12;

const STOP_HORIZON = 0;
const STOP_CAPTURED = 1;
const STOP_ATTACKER_DEAD = 2;
const STOP_DEFENDER_DEAD = 3;
const STOP_STALEMATE = 4;

const SIDE_ATTACK = 0;
const SIDE_DEFENSE = 1;
const SIDE_NONE = -1;

const SIM_EPSILON = 1e-4;
const MAX_SIM_EVENTS = 2048;
const POST_CAPTURE_SAFETY_SEC = 3.0;
const BASE_HORIZON_SEC = 30.0;

const _factionIds = ['player', 'enemy', 'neutral'];
const _factionIndexById = Object.create(null);
for (let i = 0; i < _factionIds.length; i++) {
    _factionIndexById[_factionIds[i]] = i;
}
for (const faction of FACTIONS) {
    if (_factionIndexById[faction.id] !== undefined) continue;
    _factionIndexById[faction.id] = _factionIds.length;
    _factionIds.push(faction.id);
}

function clamp01(value) {
    if (value <= 0) return 0;
    if (value >= 1) return 1;
    return value;
}

function getFactionIndex(factionId) {
    const known = _factionIndexById[factionId];
    if (known !== undefined) return known;
    const nextIndex = _factionIds.length;
    _factionIndexById[factionId] = nextIndex;
    _factionIds.push(factionId);
    return nextIndex;
}

function getNodeBodiesForFaction(node, factionId) {
    return node && node.counts ? (node.counts[factionId] || 0) : 0;
}

function getNodePowerForFaction(node, factionId, fallbackBodies = 0) {
    return node && node.power ? (node.power[factionId] || fallbackBodies) : fallbackBodies;
}

export class PredictiveCombatSimulator {
    static RESULT_SIZE = 13;
    static RESULT_DERROTA = RESULT_DERROTA;
    static RESULT_EMPATE_ESTANCADO = RESULT_EMPATE_ESTANCADO;
    static RESULT_VICTORIA_PIRRICA = RESULT_VICTORIA_PIRRICA;
    static RESULT_VICTORIA_SEGURA = RESULT_VICTORIA_SEGURA;

    constructor(config = {}) {
        this.maxNodes = config.maxNodes || 96;
        this.maxEvents = config.maxEvents || 4096;

        this.arrivalCountByNode = new Int32Array(this.maxNodes);
        this.arrivalStartByNode = new Int32Array(this.maxNodes + 1);
        this.arrivalWriteByNode = new Int32Array(this.maxNodes);

        this.arrivalTimes = new Float32Array(this.maxEvents);
        this.arrivalFaction = new Uint8Array(this.maxEvents);
        this.arrivalLight = new Uint16Array(this.maxEvents);
        this.arrivalHeavy = new Uint16Array(this.maxEvents);

        this.attackerDataBuffer = new Float32Array(10);
        this.defenderStateBuffer = new Float32Array(29);
        this.toaBuffer = new Float32Array(6);

        this._damageScratch = {
            lightBodies: 0,
            heavyBodies: 0,
            damageCarry: 0,
            killedLight: 0,
            killedHeavy: 0,
            killedBodies: 0,
            killedPower: 0
        };
        this._bodyScratch = {
            lightBodies: 0,
            heavyBodies: 0,
            remainingLosses: 0,
            killedLight: 0,
            killedHeavy: 0,
            killedBodies: 0,
            killedPower: 0
        };
    }

    ensureCapacity(nodeCount, eventCount) {
        if (nodeCount > this.maxNodes) {
            let nextNodes = this.maxNodes;
            while (nextNodes < nodeCount) nextNodes <<= 1;
            this.maxNodes = nextNodes;
            this.arrivalCountByNode = new Int32Array(this.maxNodes);
            this.arrivalStartByNode = new Int32Array(this.maxNodes + 1);
            this.arrivalWriteByNode = new Int32Array(this.maxNodes);
        }

        if (eventCount > this.maxEvents) {
            let nextEvents = this.maxEvents;
            while (nextEvents < eventCount) nextEvents <<= 1;
            this.maxEvents = nextEvents;
            this.arrivalTimes = new Float32Array(this.maxEvents);
            this.arrivalFaction = new Uint8Array(this.maxEvents);
            this.arrivalLight = new Uint16Array(this.maxEvents);
            this.arrivalHeavy = new Uint16Array(this.maxEvents);
        }
    }

    rebuildFutureLedger(world) {
        if (!world || !world.nodes) return;

        const nodes = world.nodes;
        const allUnits = world.allUnits || [];
        const nodeCount = nodes.length;
        let eventCount = 0;

        this.ensureCapacity(nodeCount, Math.max(8, allUnits.length));
        this.arrivalCountByNode.fill(0, 0, nodeCount);

        for (let i = 0; i < nodeCount; i++) {
            nodes[i]._predictiveIndex = i;
        }

        for (let i = 0; i < allUnits.length; i++) {
            const u = allUnits[i];
            if (!u || u.pendingRemoval || u.state !== 'traveling' || !u.targetNode) continue;
            const node = u.targetNode;
            const nodeIndex = node._predictiveIndex;
            if (nodeIndex == null || nodeIndex < 0) continue;

            const dx = u.x - node.x;
            const dy = u.y - node.y;
            const distance = Math.sqrt((dx * dx) + (dy * dy));
            const contactDistance = distance - (node.radius * 2.5);
            if (contactDistance <= 0) continue;

            this.arrivalCountByNode[nodeIndex]++;
            eventCount++;
        }

        this.ensureCapacity(nodeCount, Math.max(8, eventCount));

        let cursor = 0;
        for (let i = 0; i < nodeCount; i++) {
            this.arrivalStartByNode[i] = cursor;
            cursor += this.arrivalCountByNode[i];
            this.arrivalWriteByNode[i] = this.arrivalStartByNode[i];
        }
        this.arrivalStartByNode[nodeCount] = cursor;

        for (let i = 0; i < allUnits.length; i++) {
            const u = allUnits[i];
            if (!u || u.pendingRemoval || u.state !== 'traveling' || !u.targetNode) continue;
            const node = u.targetNode;
            const nodeIndex = node._predictiveIndex;
            if (nodeIndex == null || nodeIndex < 0) continue;

            const dx = u.x - node.x;
            const dy = u.y - node.y;
            const distance = Math.sqrt((dx * dx) + (dy * dy));
            const contactDistance = distance - (node.radius * 2.5);
            if (contactDistance <= 0) continue;

            const speed = Math.max(1, (u.speed || world.unitBaseSpeed || 75) * (u.speedMult || 1) * (u.currentZoneMult || 1));
            const eta = contactDistance / speed;
            const writeAt = this.arrivalWriteByNode[nodeIndex]++;

            this.arrivalTimes[writeAt] = eta;
            this.arrivalFaction[writeAt] = getFactionIndex(u.faction);
            if ((u.power || 1) > 1) {
                this.arrivalLight[writeAt] = 0;
                this.arrivalHeavy[writeAt] = 1;
            } else {
                this.arrivalLight[writeAt] = 1;
                this.arrivalHeavy[writeAt] = 0;
            }
        }

        for (let nodeIndex = 0; nodeIndex < nodeCount; nodeIndex++) {
            const start = this.arrivalStartByNode[nodeIndex];
            const end = this.arrivalStartByNode[nodeIndex + 1];
            for (let i = start + 1; i < end; i++) {
                const time = this.arrivalTimes[i];
                const faction = this.arrivalFaction[i];
                const light = this.arrivalLight[i];
                const heavy = this.arrivalHeavy[i];
                let j = i - 1;

                while (j >= start && this.arrivalTimes[j] > time) {
                    this.arrivalTimes[j + 1] = this.arrivalTimes[j];
                    this.arrivalFaction[j + 1] = this.arrivalFaction[j];
                    this.arrivalLight[j + 1] = this.arrivalLight[j];
                    this.arrivalHeavy[j + 1] = this.arrivalHeavy[j];
                    j--;
                }

                this.arrivalTimes[j + 1] = time;
                this.arrivalFaction[j + 1] = faction;
                this.arrivalLight[j + 1] = light;
                this.arrivalHeavy[j + 1] = heavy;
            }
        }
    }

    evaluateAttack(world, attackerNode, targetNode, sentBodies, attackerFactionId, routeResult, outResult) {
        if (!world || !attackerNode || !targetNode || !outResult) return RESULT_DERROTA;

        if (targetNode._predictiveIndex == null) {
            this.rebuildFutureLedger(world);
        }

        const attackerFactionIndex = getFactionIndex(attackerFactionId);
        const sourceBodies = getNodeBodiesForFaction(attackerNode, attackerFactionId);
        const sourcePower = getNodePowerForFaction(attackerNode, attackerFactionId, sourceBodies);
        const sourceHeavy = deriveHeavyBodies(sourceBodies, sourcePower);

        let sentHeavy = 0;
        if (sourceBodies > 0 && sentBodies > 0 && sourceHeavy > 0) {
            sentHeavy = Math.min(sourceHeavy, Math.round(sentBodies * (sourceHeavy / sourceBodies)));
        }
        let sentLight = sentBodies - sentHeavy;
        if (sentLight < 0) sentLight = 0;

        const routeKills = routeResult ? Math.max(0, Math.ceil(routeResult.projectedCasualties || 0)) : 0;
        if (routeKills > 0) {
            applyBodyLosses(sentLight, sentHeavy, routeKills, this._bodyScratch);
            sentLight = this._bodyScratch.lightBodies;
            sentHeavy = this._bodyScratch.heavyBodies;
        }

        this.attackerDataBuffer[ATT_FACTION_INDEX] = attackerFactionIndex;
        this.attackerDataBuffer[ATT_LIGHT_SENT] = sentLight;
        this.attackerDataBuffer[ATT_HEAVY_SENT] = sentHeavy;
        this.attackerDataBuffer[ATT_ROUTE_KILLS] = routeKills;

        const dx = targetNode.x - attackerNode.x;
        const dy = targetNode.y - attackerNode.y;
        const centerDistance = Math.sqrt((dx * dx) + (dy * dy));
        const transitTime = routeResult ? (routeResult.projectedTransitTime || 0) : (centerDistance / Math.max(1, world.unitBaseSpeed || 75));
        const effectiveSpeed = transitTime > SIM_EPSILON ? (centerDistance / transitTime) : Math.max(1, world.unitBaseSpeed || 75);

        const contactTime = Math.max(0, transitTime - ((targetNode.radius * 2.5) / Math.max(1, effectiveSpeed)));
        const idleTime = Math.max(contactTime, transitTime - ((targetNode.radius * 1.5) / Math.max(1, effectiveSpeed)));
        const defenseRadius = targetNode.radius + 45; // ESPINOSO_AURA_EXTRA (fixed, no longer tied to artilleryRange)
        const defenseInTime = Math.max(0, transitTime - (defenseRadius / Math.max(1, effectiveSpeed)));
        const artilleryInTime = Math.max(0, transitTime - ((targetNode.artilleryRange || 320) / Math.max(1, effectiveSpeed)));

        this.attackerDataBuffer[ATT_CONTACT_TIME] = contactTime;
        this.attackerDataBuffer[ATT_IDLE_TIME] = idleTime;
        this.attackerDataBuffer[ATT_DEFENSE_IN_TIME] = defenseInTime;
        this.attackerDataBuffer[ATT_ART_RANGE_IN_TIME] = artilleryInTime;
        this.attackerDataBuffer[ATT_TOTAL_TRANSIT] = transitTime;
        this.attackerDataBuffer[ATT_EFFECTIVE_SPEED] = effectiveSpeed;

        this.toaBuffer[TOA_CONTACT] = contactTime;
        this.toaBuffer[TOA_IDLE] = idleTime;
        this.toaBuffer[TOA_DEFENSE_IN] = defenseInTime;
        this.toaBuffer[TOA_ART_RANGE_IN] = artilleryInTime;
        this.toaBuffer[TOA_TRANSIT] = transitTime;
        this.toaBuffer[TOA_EFFECTIVE_SPEED] = effectiveSpeed;

        const targetIndex = targetNode._predictiveIndex;
        const targetOwnerFactionIndex = getFactionIndex(targetNode.owner);
        const targetOwnerSide = targetOwnerFactionIndex === attackerFactionIndex ? SIDE_ATTACK : SIDE_DEFENSE;

        const existingAttackBodies = getNodeBodiesForFaction(targetNode, attackerFactionId);
        const existingAttackPower = getNodePowerForFaction(targetNode, attackerFactionId, existingAttackBodies);

        let defenseBodies = 0;
        let defensePower = 0;
        let defenseDamageCarry = 0;
        const combatDamageCarry = targetNode.combatDamageCarry || null;
        for (const factionId in targetNode.counts) {
            if (factionId === attackerFactionId) continue;
            const bodies = targetNode.counts[factionId] || 0;
            if (bodies <= 0) continue;
            defenseBodies += bodies;
            defensePower += targetNode.power ? (targetNode.power[factionId] || bodies) : bodies;
            if (combatDamageCarry) defenseDamageCarry += combatDamageCarry[factionId] || 0;
        }
        const attackDamageCarry = combatDamageCarry ? (combatDamageCarry[attackerFactionId] || 0) : 0;

        this.defenderStateBuffer[DEF_NODE_INDEX] = targetIndex;
        this.defenderStateBuffer[DEF_OWNER_FACTION_INDEX] = targetOwnerFactionIndex;
        this.defenderStateBuffer[DEF_OWNER_SIDE] = targetOwnerSide;
        this.defenderStateBuffer[DEF_ATTACK_LIGHT] = deriveLightBodies(existingAttackBodies, existingAttackPower);
        this.defenderStateBuffer[DEF_ATTACK_HEAVY] = deriveHeavyBodies(existingAttackBodies, existingAttackPower);
        this.defenderStateBuffer[DEF_DEFENSE_LIGHT] = deriveLightBodies(defenseBodies, defensePower);
        this.defenderStateBuffer[DEF_DEFENSE_HEAVY] = deriveHeavyBodies(defenseBodies, defensePower);
        this.defenderStateBuffer[DEF_CONQUEST_PROGRESS] = targetNode.conquestProgress || 0;
        this.defenderStateBuffer[DEF_CONQUERING_SIDE] = targetNode.conqueringFaction
            ? (getFactionIndex(targetNode.conqueringFaction) === attackerFactionIndex ? SIDE_ATTACK : SIDE_DEFENSE)
            : SIDE_NONE;
        this.defenderStateBuffer[DEF_REGEN_TIMER] = targetNode.regenTimer || 0;
        this.defenderStateBuffer[DEF_COMBAT_TIMER] = targetNode.combatTimer || 0;
        this.defenderStateBuffer[DEF_EVOLUTION_CODE] = getEvolutionCode(targetNode.evolution);
        this.defenderStateBuffer[DEF_PENDING_EVOLUTION_CODE] = getEvolutionCode(targetNode.pendingEvolution || null);
        this.defenderStateBuffer[DEF_PENDING_EVOLUTION_ETA] = targetNode.pendingEvolutionEtaSec || 0;
        this.defenderStateBuffer[DEF_ESPINOSO_TIMER] = targetNode.espinosoTimer || 0;
        this.defenderStateBuffer[DEF_ARTILLERY_TIMER] = targetNode.artilleryTimer || 0;
        this.defenderStateBuffer[DEF_REGEN_INTERVAL_BASE] = targetNode.regenInterval || 1;
        this.defenderStateBuffer[DEF_MAX_POPULATION_POWER] = targetNode.maxUnits || 0;
        this.defenderStateBuffer[DEF_ARRIVAL_START] = this.arrivalStartByNode[targetIndex];
        this.defenderStateBuffer[DEF_ARRIVAL_END] = this.arrivalStartByNode[targetIndex + 1];
        this.defenderStateBuffer[DEF_DEFENDER_TUNNEL_ACTIVE] = (targetNode.tunnelTo && targetNode.tunnelTo.owner === targetNode.owner && targetNode.type !== 'tunel') ? 1 : 0;
        this.defenderStateBuffer[DEF_ATTACKER_TUNNEL_ACTIVE] = (targetNode.tunnelTo && targetNode.tunnelTo.owner === attackerFactionId && targetNode.type !== 'tunel') ? 1 : 0;
        this.defenderStateBuffer[DEF_CURRENT_WORLD_UNITS] = world.allUnits ? world.allUnits.length : 0;
        this.defenderStateBuffer[DEF_ARTILLERY_INTERVAL] = targetNode.artilleryInterval || 1.8;
        this.defenderStateBuffer[DEF_ARTILLERY_RANGE] = targetNode.artilleryRange || 320;
        this.defenderStateBuffer[DEF_RADIUS] = targetNode.radius || 25;
        this.defenderStateBuffer[DEF_ATTACK_DAMAGE_CARRY] = attackDamageCarry;
        this.defenderStateBuffer[DEF_DEFENSE_DAMAGE_CARRY] = defenseDamageCarry;
        this.defenderStateBuffer[DEF_COMBAT_INTERVAL] = world.combatInterval || COMBAT_INTERVAL_DEFAULT;

        PredictiveCombatSimulator.simulateEngagement(
            this.attackerDataBuffer,
            this.defenderStateBuffer,
            this.toaBuffer,
            outResult,
            this
        );

        return outResult[RESULT_CODE] | 0;
    }

    static simulateEngagement(attackerDataBuffer, defenderStateBuffer, toaBuffer, resultBuffer, simulator) {
        resultBuffer[RESULT_CODE] = RESULT_DERROTA;
        resultBuffer[RESULT_SURVIVOR_BODIES] = 0;
        resultBuffer[RESULT_SURVIVOR_POWER] = 0;
        resultBuffer[RESULT_SURVIVOR_LIGHT] = 0;
        resultBuffer[RESULT_SURVIVOR_HEAVY] = 0;
        resultBuffer[RESULT_CRITICAL_MASS] = 0;
        resultBuffer[RESULT_CRITICAL_MASS_TIME] = -1;
        resultBuffer[RESULT_TIME_TO_DEFENDER_COLLAPSE] = -1;
        resultBuffer[RESULT_TIME_TO_CAPTURE_START] = -1;
        resultBuffer[RESULT_TIME_TO_FULL_CAPTURE] = -1;
        resultBuffer[RESULT_FINAL_OWNER_SIDE] = defenderStateBuffer[DEF_OWNER_FACTION_INDEX] | 0;
        resultBuffer[RESULT_CAPTURE_PROGRESS_AT_STOP] = defenderStateBuffer[DEF_CONQUEST_PROGRESS];
        resultBuffer[RESULT_STOP_REASON] = STOP_HORIZON;

        let attackerLight = defenderStateBuffer[DEF_ATTACK_LIGHT] | 0;
        let attackerHeavy = defenderStateBuffer[DEF_ATTACK_HEAVY] | 0;
        let defenderLight = defenderStateBuffer[DEF_DEFENSE_LIGHT] | 0;
        let defenderHeavy = defenderStateBuffer[DEF_DEFENSE_HEAVY] | 0;

        let attackerTravelLight = 0;
        let attackerTravelHeavy = 0;

        const sentLight = attackerDataBuffer[ATT_LIGHT_SENT] | 0;
        const sentHeavy = attackerDataBuffer[ATT_HEAVY_SENT] | 0;
        const attackerFactionIndex = attackerDataBuffer[ATT_FACTION_INDEX] | 0;

        let ownerSide = defenderStateBuffer[DEF_OWNER_SIDE] | 0;
        const ownerFactionIndex = defenderStateBuffer[DEF_OWNER_FACTION_INDEX] | 0;
        let conqueringSide = defenderStateBuffer[DEF_CONQUERING_SIDE] | 0;
        let conquestProgress = defenderStateBuffer[DEF_CONQUEST_PROGRESS] || 0;

        let currentEvolutionCode = defenderStateBuffer[DEF_EVOLUTION_CODE] | 0;
        let pendingEvolutionCode = defenderStateBuffer[DEF_PENDING_EVOLUTION_CODE] | 0;
        let pendingEvolutionEta = defenderStateBuffer[DEF_PENDING_EVOLUTION_ETA] || 0;
        let attackerDamageCarry = defenderStateBuffer[DEF_ATTACK_DAMAGE_CARRY] || 0;
        let defenderDamageCarry = defenderStateBuffer[DEF_DEFENSE_DAMAGE_CARRY] || 0;

        let regenTimer = defenderStateBuffer[DEF_REGEN_TIMER] || 0;
        let combatTimer = defenderStateBuffer[DEF_COMBAT_TIMER] || 0;
        let espinosoTimer = defenderStateBuffer[DEF_ESPINOSO_TIMER] || 0;
        let artilleryTimer = defenderStateBuffer[DEF_ARTILLERY_TIMER] || 0;

        const regenIntervalBase = defenderStateBuffer[DEF_REGEN_INTERVAL_BASE] || 1;
        const maxPopulationPower = defenderStateBuffer[DEF_MAX_POPULATION_POWER] || 0;
        const defenderTunnelActive = (defenderStateBuffer[DEF_DEFENDER_TUNNEL_ACTIVE] | 0) === 1;
        const attackerTunnelActive = (defenderStateBuffer[DEF_ATTACKER_TUNNEL_ACTIVE] | 0) === 1;
        const currentWorldUnits = defenderStateBuffer[DEF_CURRENT_WORLD_UNITS] | 0;
        const artilleryIntervalBase = defenderStateBuffer[DEF_ARTILLERY_INTERVAL] || 1.8;
        const artilleryRange = defenderStateBuffer[DEF_ARTILLERY_RANGE] || 320;
        const nodeRadius = defenderStateBuffer[DEF_RADIUS] || 25;
        const combatInterval = defenderStateBuffer[DEF_COMBAT_INTERVAL] || COMBAT_INTERVAL_DEFAULT;
        let currentOwnerFactionIndex = ownerSide === SIDE_ATTACK ? attackerFactionIndex : ownerFactionIndex;

        const contactTime = toaBuffer[TOA_CONTACT] || 0;
        const idleTime = toaBuffer[TOA_IDLE] || 0;
        const defenseInTime = toaBuffer[TOA_DEFENSE_IN] || 0;
        const artRangeInTime = toaBuffer[TOA_ART_RANGE_IN] || 0;
        const totalTransit = toaBuffer[TOA_TRANSIT] || 0;
        const effectiveSpeed = Math.max(1, toaBuffer[TOA_EFFECTIVE_SPEED] || 1);

        const horizon = Math.max(idleTime + BASE_HORIZON_SEC, totalTransit + POST_CAPTURE_SAFETY_SEC);

        let currentTime = 0;
        let iterations = 0;
        let localSpawnedUnits = 0;
        let contactInjected = false;
        let travelingWindowOpen = false;
        let criticalMassAchieved = false;
        let criticalMassTime = -1;
        let defenderCollapseTime = -1;
        let captureStartTime = -1;
        let captureCompleteTime = -1;

        let combatActive = false;
        let nextCombatTime = Number.POSITIVE_INFINITY;
        if (getTotalBodies(attackerLight, attackerHeavy) > 0 && getTotalBodies(defenderLight, defenderHeavy) > 0) {
            combatActive = true;
            nextCombatTime = combatInterval - combatTimer;
            if (nextCombatTime < SIM_EPSILON) nextCombatTime = combatInterval;
        }

        let nextRegenTime = Number.POSITIVE_INFINITY;
        let currentRegenInterval = getSpawnInterval(regenIntervalBase, currentEvolutionCode);

        const arrivalStart = defenderStateBuffer[DEF_ARRIVAL_START] | 0;
        const arrivalEnd = defenderStateBuffer[DEF_ARRIVAL_END] | 0;
        let arrivalPtr = arrivalStart;

        let nextArtilleryImpact = Number.POSITIVE_INFINITY;
        let nextArtilleryFire = Number.POSITIVE_INFINITY;
        let currentArtilleryInterval = getArtilleryInterval(currentEvolutionCode, artilleryIntervalBase);

        const damageScratch = simulator._damageScratch;
        const bodyScratch = simulator._bodyScratch;

        const refreshRegenTime = () => {
            if (ownerSide === SIDE_NONE || currentOwnerFactionIndex === getFactionIndex('neutral')) {
                nextRegenTime = Number.POSITIVE_INFINITY;
                return;
            }

            const ownerLight = ownerSide === SIDE_ATTACK ? attackerLight : defenderLight;
            const ownerHeavy = ownerSide === SIDE_ATTACK ? attackerHeavy : defenderHeavy;
            const ownerPower = getTotalPower(ownerLight, ownerHeavy);
            const tunnelActive = ownerSide === SIDE_ATTACK ? attackerTunnelActive : defenderTunnelActive;

            currentRegenInterval = getSpawnInterval(regenIntervalBase, currentEvolutionCode);
            if (tunnelActive || ownerPower >= maxPopulationPower || currentWorldUnits + localSpawnedUnits >= 3000) {
                nextRegenTime = Number.POSITIVE_INFINITY;
                return;
            }

            let wait = currentRegenInterval - regenTimer;
            if (wait < SIM_EPSILON) wait = currentRegenInterval;
            nextRegenTime = currentTime + wait;
        };

        const refreshCombatTime = () => {
            const attackerBodies = getTotalBodies(attackerLight, attackerHeavy);
            const defenderBodies = getTotalBodies(defenderLight, defenderHeavy);
            const shouldBeActive = attackerBodies > 0 && defenderBodies > 0;
            if (!shouldBeActive) {
                if (attackerBodies <= 0) attackerDamageCarry = 0;
                if (defenderBodies <= 0) defenderDamageCarry = 0;
                combatActive = false;
                combatTimer = 0;
                nextCombatTime = Number.POSITIVE_INFINITY;
                return;
            }
            if (!combatActive) {
                combatActive = true;
                combatTimer = 0;
                nextCombatTime = currentTime + combatInterval;
            }
        };

        const refreshArtilleryFire = () => {
            nextArtilleryFire = Number.POSITIVE_INFINITY;
            if (currentEvolutionCode !== EVOLUTION_ARTILLERIA) return;
            if (!travelingWindowOpen || getTotalBodies(attackerTravelLight, attackerTravelHeavy) <= 0) return;

            const rangeEntry = artRangeInTime;
            currentArtilleryInterval = getArtilleryInterval(currentEvolutionCode, artilleryIntervalBase);
            const shotReadyAbs = currentTime + Math.max(0, currentArtilleryInterval - artilleryTimer);
            const fireTime = shotReadyAbs < rangeEntry ? rangeEntry : shotReadyAbs;
            if (fireTime > idleTime + SIM_EPSILON) return;
            nextArtilleryFire = fireTime;
        };

        const checkCriticalMass = () => {
            if (criticalMassAchieved) return;
            const attackPower = getTotalPower(attackerLight, attackerHeavy);
            const defensePower = getTotalPower(defenderLight, defenderHeavy);
            if (attackPower > 0 && defensePower > 0 && (attackPower > (defensePower * 2) || defensePower > (attackPower * 2))) {
                criticalMassAchieved = true;
                criticalMassTime = currentTime;
            }
        };

        const applyAttackerCompositionLoss = (killedLight, killedHeavy) => {
            if (killedLight > 0 && attackerTravelLight > 0) {
                const removed = Math.min(attackerTravelLight, killedLight);
                attackerTravelLight -= removed;
                killedLight -= removed;
            }
            if (killedHeavy > 0 && attackerTravelHeavy > 0) {
                const removed = Math.min(attackerTravelHeavy, killedHeavy);
                attackerTravelHeavy -= removed;
            }
        };

        refreshRegenTime();
        refreshCombatTime();
        refreshArtilleryFire();
        checkCriticalMass();

        while (currentTime < horizon && iterations < MAX_SIM_EVENTS) {
            iterations++;

            const nextArrivalTime = arrivalPtr < arrivalEnd ? simulator.arrivalTimes[arrivalPtr] : Number.POSITIVE_INFINITY;
            const nextContactTime = !contactInjected ? contactTime : Number.POSITIVE_INFINITY;
            const nextIdleTime = travelingWindowOpen ? idleTime : Number.POSITIVE_INFINITY;
            const nextEspinosoTime = (travelingWindowOpen && currentEvolutionCode === EVOLUTION_ESPINOSO && currentTime < idleTime)
                ? (currentTime + Math.max(SIM_EPSILON, ESPINOSO_KILL_INTERVAL - espinosoTimer))
                : Number.POSITIVE_INFINITY;

            if (nextArtilleryFire < Number.POSITIVE_INFINITY && currentTime + SIM_EPSILON >= nextArtilleryFire) {
                const timeSinceRangeEntry = Math.max(0, nextArtilleryFire - artRangeInTime);
                const distanceAtFire = Math.max(nodeRadius, artilleryRange - (timeSinceRangeEntry * effectiveSpeed));
                const flightDuration = Math.max(0.25, Math.min(0.55, distanceAtFire / 360));
                nextArtilleryImpact = nextArtilleryFire + flightDuration;
                artilleryTimer = 0;
                nextArtilleryFire = Number.POSITIVE_INFINITY;
            }

            let nextEventTime = horizon;
            if (nextArrivalTime < nextEventTime) nextEventTime = nextArrivalTime;
            if (nextContactTime < nextEventTime) nextEventTime = nextContactTime;
            if (nextIdleTime < nextEventTime) nextEventTime = nextIdleTime;
            if (nextRegenTime < nextEventTime) nextEventTime = nextRegenTime;
            if (nextCombatTime < nextEventTime) nextEventTime = nextCombatTime;
            if (nextEspinosoTime < nextEventTime) nextEventTime = nextEspinosoTime;
            if (nextArtilleryImpact < nextEventTime) nextEventTime = nextArtilleryImpact;
            if (pendingEvolutionCode !== 0 && pendingEvolutionEta > currentTime + SIM_EPSILON && pendingEvolutionEta < nextEventTime) nextEventTime = pendingEvolutionEta;

            const attackerBodiesNow = getTotalBodies(attackerLight, attackerHeavy);
            const defenderBodiesNow = getTotalBodies(defenderLight, defenderHeavy);

            let captureSlope = 0;
            let captureMainSide = SIDE_NONE;
            if (ownerSide === SIDE_ATTACK) {
                if (defenderBodiesNow > 0) captureMainSide = SIDE_DEFENSE;
            } else if (attackerBodiesNow > 0) {
                captureMainSide = SIDE_ATTACK;
            }

            if (captureMainSide !== SIDE_NONE) {
                const enemiesBodies = captureMainSide === SIDE_ATTACK ? defenderBodiesNow : attackerBodiesNow;
                const attackerBodiesForRing = captureMainSide === SIDE_ATTACK ? attackerBodiesNow : defenderBodiesNow;

                if (conqueringSide !== SIDE_NONE && conqueringSide !== captureMainSide) {
                    captureSlope = -CAPTURE_DECAY_RATE;
                } else if (enemiesBodies > CAPTURE_CONTEST_THRESHOLD) {
                    captureSlope = 0;
                } else {
                    captureSlope = getCaptureSpeed(attackerBodiesForRing);
                    if (captureMainSide === SIDE_ATTACK && captureStartTime < 0) captureStartTime = currentTime;
                }
            } else if (conquestProgress > 0) {
                captureSlope = -CAPTURE_DECAY_RATE;
            }

            if (captureSlope > 0 && conquestProgress < 1) {
                const timeToCapture = (1 - conquestProgress) / captureSlope;
                if (currentTime + timeToCapture < nextEventTime - SIM_EPSILON) {
                    nextEventTime = currentTime + timeToCapture;
                }
            } else if (captureSlope < 0 && conquestProgress > 0) {
                const timeToReset = conquestProgress / (-captureSlope);
                if (currentTime + timeToReset < nextEventTime - SIM_EPSILON) {
                    nextEventTime = currentTime + timeToReset;
                }
            }

            const delta = nextEventTime - currentTime;
            if (delta > SIM_EPSILON) {
                if (captureSlope !== 0) {
                    conquestProgress = clamp01(conquestProgress + (captureSlope * delta));
                    if (captureSlope > 0 && captureMainSide !== SIDE_NONE) {
                        conqueringSide = captureMainSide;
                    } else if (captureSlope < 0 && conquestProgress <= SIM_EPSILON) {
                        conquestProgress = 0;
                        conqueringSide = SIDE_NONE;
                    }
                }

                if (nextRegenTime < Number.POSITIVE_INFINITY) {
                    regenTimer += delta;
                    if (regenTimer > currentRegenInterval) regenTimer = currentRegenInterval;
                }
                if (combatActive) {
                    combatTimer += delta;
                    if (combatTimer > combatInterval) combatTimer = combatInterval;
                }
                if (travelingWindowOpen && currentEvolutionCode === EVOLUTION_ESPINOSO) {
                    espinosoTimer += delta;
                    if (espinosoTimer > ESPINOSO_KILL_INTERVAL) espinosoTimer = ESPINOSO_KILL_INTERVAL;
                }
                if (currentEvolutionCode === EVOLUTION_ARTILLERIA) {
                    artilleryTimer += delta;
                    if (artilleryTimer > currentArtilleryInterval) artilleryTimer = currentArtilleryInterval;
                }
            }
            currentTime = nextEventTime;

            if (captureSlope > 0 && conquestProgress >= 1 - SIM_EPSILON && captureMainSide !== SIDE_NONE) {
                ownerSide = captureMainSide;
                currentOwnerFactionIndex = ownerSide === SIDE_ATTACK ? attackerFactionIndex : ownerFactionIndex;
                conquestProgress = 0;
                conqueringSide = SIDE_NONE;
                if (captureCompleteTime < 0) captureCompleteTime = currentTime;
                resultBuffer[RESULT_TIME_TO_FULL_CAPTURE] = currentTime;
                refreshRegenTime();
                refreshCombatTime();
            } else if (captureSlope < 0 && conquestProgress <= SIM_EPSILON) {
                conquestProgress = 0;
                conqueringSide = SIDE_NONE;
            }

            if (!contactInjected && currentTime + SIM_EPSILON >= contactTime) {
                contactInjected = true;
                travelingWindowOpen = idleTime > currentTime + SIM_EPSILON;

                attackerLight += sentLight;
                attackerHeavy += sentHeavy;
                attackerTravelLight += sentLight;
                attackerTravelHeavy += sentHeavy;

                refreshCombatTime();
                refreshArtilleryFire();
                checkCriticalMass();
            }

            if (travelingWindowOpen && currentTime + SIM_EPSILON >= idleTime) {
                travelingWindowOpen = false;
                attackerTravelLight = 0;
                attackerTravelHeavy = 0;
                nextArtilleryFire = Number.POSITIVE_INFINITY;
                nextArtilleryImpact = Number.POSITIVE_INFINITY;
            }

            if (pendingEvolutionCode !== 0 && currentTime + SIM_EPSILON >= pendingEvolutionEta) {
                currentEvolutionCode = pendingEvolutionCode;
                pendingEvolutionCode = 0;
                pendingEvolutionEta = 0;
                currentArtilleryInterval = getArtilleryInterval(currentEvolutionCode, artilleryIntervalBase);
                if (currentEvolutionCode === EVOLUTION_ARTILLERIA) artilleryTimer = currentArtilleryInterval;
                refreshRegenTime();
                refreshArtilleryFire();
            }

            while (arrivalPtr < arrivalEnd && simulator.arrivalTimes[arrivalPtr] <= currentTime + SIM_EPSILON) {
                const eventFaction = simulator.arrivalFaction[arrivalPtr] | 0;
                const light = simulator.arrivalLight[arrivalPtr] | 0;
                const heavy = simulator.arrivalHeavy[arrivalPtr] | 0;

                if (eventFaction === attackerFactionIndex) {
                    attackerLight += light;
                    attackerHeavy += heavy;
                } else {
                    defenderLight += light;
                    defenderHeavy += heavy;
                }

                arrivalPtr++;
                refreshCombatTime();
                refreshRegenTime();
                checkCriticalMass();
            }

            if (nextRegenTime < Number.POSITIVE_INFINITY && currentTime + SIM_EPSILON >= nextRegenTime) {
                const spawnPower = getSpawnPowerForEvolutionCode(currentEvolutionCode);
                if (ownerSide === SIDE_ATTACK) {
                    if (spawnPower >= UNIT_POWER_HEAVY) attackerHeavy++;
                    else attackerLight++;
                } else if (ownerSide === SIDE_DEFENSE) {
                    if (spawnPower >= UNIT_POWER_HEAVY) defenderHeavy++;
                    else defenderLight++;
                }
                localSpawnedUnits++;
                regenTimer = 0;
                refreshRegenTime();
                refreshCombatTime();
                checkCriticalMass();
            }

            if (travelingWindowOpen && currentEvolutionCode === EVOLUTION_ESPINOSO && currentTime + SIM_EPSILON >= nextEspinosoTime) {
                // Daño proporcional a la densidad: 1 base + 5% de atacantes en tránsito
                const travelingBodies = getTotalBodies(attackerTravelLight, attackerTravelHeavy);
                const killCount = Math.min(travelingBodies, 1 + Math.floor(travelingBodies * 0.05));
                applyBodyLosses(attackerTravelLight, attackerTravelHeavy, killCount, bodyScratch);
                const killedLight = bodyScratch.killedLight | 0;
                const killedHeavy = bodyScratch.killedHeavy | 0;

                attackerTravelLight = bodyScratch.lightBodies;
                attackerTravelHeavy = bodyScratch.heavyBodies;
                attackerLight -= killedLight;
                attackerHeavy -= killedHeavy;
                espinosoTimer = 0;

                refreshCombatTime();
                refreshRegenTime();
                checkCriticalMass();
            }

            if (nextArtilleryImpact < Number.POSITIVE_INFINITY && currentTime + SIM_EPSILON >= nextArtilleryImpact) {
                applyDamageToComposition(attackerLight, attackerHeavy, 0, ARTILLERY_SPLASH_POWER_BUDGET, damageScratch);
                attackerLight = damageScratch.lightBodies;
                attackerHeavy = damageScratch.heavyBodies;
                applyAttackerCompositionLoss(damageScratch.killedLight | 0, damageScratch.killedHeavy | 0);
                nextArtilleryImpact = Number.POSITIVE_INFINITY;
                refreshCombatTime();
                refreshRegenTime();
                checkCriticalMass();
            }

            if (combatActive && currentTime + SIM_EPSILON >= nextCombatTime) {
                const attackerPowerBefore = getTotalPower(attackerLight, attackerHeavy);
                const defenderPowerBefore = getTotalPower(defenderLight, defenderHeavy);

                const damageToAttacker = getCombatDamage(defenderPowerBefore, attackerPowerBefore);
                const damageToDefender = getCombatDamage(attackerPowerBefore, defenderPowerBefore);

                applyDamageToComposition(attackerLight, attackerHeavy, attackerDamageCarry, damageToAttacker, damageScratch);
                attackerLight = damageScratch.lightBodies;
                attackerHeavy = damageScratch.heavyBodies;
                attackerDamageCarry = damageScratch.damageCarry;
                applyAttackerCompositionLoss(damageScratch.killedLight | 0, damageScratch.killedHeavy | 0);

                applyDamageToComposition(defenderLight, defenderHeavy, defenderDamageCarry, damageToDefender, damageScratch);
                defenderLight = damageScratch.lightBodies;
                defenderHeavy = damageScratch.heavyBodies;
                defenderDamageCarry = damageScratch.damageCarry;

                if (defenderCollapseTime < 0 && getTotalBodies(defenderLight, defenderHeavy) <= 0) {
                    defenderCollapseTime = currentTime;
                }

                combatTimer = 0;
                if (getTotalBodies(attackerLight, attackerHeavy) <= 0) attackerDamageCarry = 0;
                if (getTotalBodies(defenderLight, defenderHeavy) <= 0) defenderDamageCarry = 0;
                nextCombatTime = currentTime + combatInterval;
                refreshCombatTime();
                refreshRegenTime();
                refreshArtilleryFire();
                checkCriticalMass();
            }

            if (getTotalBodies(attackerLight, attackerHeavy) <= 0) {
                resultBuffer[RESULT_STOP_REASON] = STOP_ATTACKER_DEAD;
                break;
            }

            if (getTotalBodies(defenderLight, defenderHeavy) <= 0 && defenderCollapseTime < 0) {
                defenderCollapseTime = currentTime;
                resultBuffer[RESULT_STOP_REASON] = STOP_DEFENDER_DEAD;
            }

            if (captureCompleteTime >= 0 && currentTime >= captureCompleteTime + POST_CAPTURE_SAFETY_SEC) {
                resultBuffer[RESULT_STOP_REASON] = STOP_CAPTURED;
                break;
            }
        }

        const finalAttackerBodies = getTotalBodies(attackerLight, attackerHeavy);
        const finalAttackerPower = getTotalPower(attackerLight, attackerHeavy);
        const finalDefenderPower = getTotalPower(defenderLight, defenderHeavy);

        let resultCode = RESULT_DERROTA;
        if (ownerSide === SIDE_ATTACK && finalAttackerBodies > 0) {
            resultCode = finalAttackerPower >= (finalDefenderPower * 1.25)
                ? RESULT_VICTORIA_SEGURA
                : RESULT_VICTORIA_PIRRICA;
        } else if (finalAttackerBodies > 0 && conquestProgress > 0) {
            resultCode = RESULT_EMPATE_ESTANCADO;
        } else if (finalAttackerBodies > 0 && finalDefenderPower > 0) {
            resultCode = RESULT_EMPATE_ESTANCADO;
        }

        if (resultBuffer[RESULT_STOP_REASON] === STOP_HORIZON && resultCode === RESULT_EMPATE_ESTANCADO) {
            resultBuffer[RESULT_STOP_REASON] = STOP_STALEMATE;
        }

        resultBuffer[RESULT_CODE] = resultCode;
        resultBuffer[RESULT_SURVIVOR_BODIES] = finalAttackerBodies;
        resultBuffer[RESULT_SURVIVOR_POWER] = finalAttackerPower;
        resultBuffer[RESULT_SURVIVOR_LIGHT] = attackerLight;
        resultBuffer[RESULT_SURVIVOR_HEAVY] = attackerHeavy;
        resultBuffer[RESULT_CRITICAL_MASS] = criticalMassAchieved ? 1 : 0;
        resultBuffer[RESULT_CRITICAL_MASS_TIME] = criticalMassTime;
        resultBuffer[RESULT_TIME_TO_DEFENDER_COLLAPSE] = defenderCollapseTime;
        resultBuffer[RESULT_TIME_TO_CAPTURE_START] = captureStartTime;
        if (captureCompleteTime >= 0) resultBuffer[RESULT_TIME_TO_FULL_CAPTURE] = captureCompleteTime;
        resultBuffer[RESULT_FINAL_OWNER_SIDE] = currentOwnerFactionIndex;
        resultBuffer[RESULT_CAPTURE_PROGRESS_AT_STOP] = conquestProgress;
    }
}
