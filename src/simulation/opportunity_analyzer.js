/**
 * OpportunityAnalyzer — Pilar 4: "El Cazador"
 *
 * Motor reactivo de detección de oportunidades. Monitorea deltas de estado
 * del tablero para detectar ventanas de vulnerabilidad efímeras del jugador
 * y emitir señales de urgencia con decaimiento temporal.
 *
 * DISEÑO: Structure of Arrays (SoA) puro con Typed Arrays pre-asignados.
 *         Cero allocations en el hot path. Time-slicing a 4 Hz.
 *
 * ACTIVACIÓN: Solo para dificultades hard / brutal (expert / master intel).
 */

import {
    getEvolutionCode,
    ESPINOSO_KILL_INTERVAL,
    UNIT_POWER_HEAVY,
} from './deterministic_rules.js';

// ── Opportunity Type Codes ──────────────────────────────────────────
export const OPP_NONE              = 0;
export const OPP_BASE_EMPTIED      = 1;  // Base del jugador vaciada por envío masivo
export const OPP_EVOLUTION_WINDOW  = 2;  // Nodo del jugador gastó tropas en evolución
export const OPP_NODE_LOST         = 3;  // Jugador perdió un nodo
export const OPP_HAZARD_ATTRITION  = 4;  // Tropas del jugador muriendo en hazard
export const OPP_SUICIDE_ATTACK    = 5;  // Atacando nodo defensivo con fuerza insuficiente
export const OPP_ORIGIN_EXPOSED    = 6;  // Origen del jugador vacío tras envío masivo
export const OPP_TRANSIT_INTERCEPT = 7;  // Tropas en tránsito cruzando zona lenta

// ── Node Dirty Flags (bitfield) ─────────────────────────────────────
export const FLAG_BASE_EMPTIED      = 0x01;
export const FLAG_EVOLUTION_STARTED = 0x02;
export const FLAG_OWNER_CHANGED     = 0x04;
export const FLAG_UNDER_MASS_ATTACK = 0x08;
export const FLAG_IN_HAZARD_ZONE    = 0x10;

// ── Decay Types ─────────────────────────────────────────────────────
const DECAY_EXPONENTIAL = 0;
const DECAY_LINEAR      = 1;

// ── Capacidades ─────────────────────────────────────────────────────
const MAX_NODES         = 32;
const MAX_OPPORTUNITIES = 32;
const MONITOR_INTERVAL  = 0.25;  // 4 Hz
const LN2               = Math.LN2;

// ── Owner markers para snapshot (evita comparación de strings) ──────
const OWNER_PLAYER  = 0;
const OWNER_OTHER   = 1;
const OWNER_NEUTRAL = 2;


export class OpportunityAnalyzer {
    static MAX_NODES         = MAX_NODES;
    static MAX_OPPORTUNITIES = MAX_OPPORTUNITIES;

    constructor() {
        // ── Módulo 1: State Delta Monitor (SoA) ─────────────────
        this._prevBodies    = new Int16Array(MAX_NODES);
        this._prevPower     = new Int16Array(MAX_NODES);
        this._prevOwner     = new Uint8Array(MAX_NODES);
        this._prevEvolution = new Uint8Array(MAX_NODES);
        this._deltaBodies   = new Int16Array(MAX_NODES);
        this._outflowRate   = new Float32Array(MAX_NODES);
        this._nodeFlags     = new Uint8Array(MAX_NODES);

        // ── Módulo 2: Opportunity Buffer (SoA, 32 slots) ────────
        this._oppNodeIndex   = new Uint8Array(MAX_OPPORTUNITIES);
        this._oppTypeCode    = new Uint8Array(MAX_OPPORTUNITIES);
        this._oppUrgency     = new Float32Array(MAX_OPPORTUNITIES);
        this._oppUrgencyBase = new Float32Array(MAX_OPPORTUNITIES);
        this._oppBirthTime   = new Float32Array(MAX_OPPORTUNITIES);
        this._oppExpireTime  = new Float32Array(MAX_OPPORTUNITIES);
        this._oppDecayType   = new Uint8Array(MAX_OPPORTUNITIES);
        this._oppDecayParam  = new Float32Array(MAX_OPPORTUNITIES);
        this._oppActive      = new Uint8Array(MAX_OPPORTUNITIES);

        this._oppCount     = 0;
        this._oppWriteHead = 0;

        // ── Timing ──────────────────────────────────────────────
        this._monitorTimer = 0;
        this._simTime      = 0;
        this._nodeCount    = 0;
        this._initialized  = false;

        // ── Scratch buffers para API (pre-asignados) ────────────
        this._topIndices  = new Uint8Array(MAX_OPPORTUNITIES);
        this._readScratch = new Float32Array(4);
    }

    // ═══════════════════════════════════════════════════════════════
    //  API PÚBLICA
    // ═══════════════════════════════════════════════════════════════

    /**
     * Resetea el analizador. Llamar al cargar un nuevo nivel.
     */
    reset(world) {
        this._nodeCount    = world && world.nodes
            ? Math.min(world.nodes.length, MAX_NODES) : 0;
        this._monitorTimer = 0;
        this._simTime      = 0;
        this._initialized  = false;
        this._oppCount     = 0;
        this._oppWriteHead = 0;

        this._prevBodies.fill(0);
        this._prevPower.fill(0);
        this._prevOwner.fill(OWNER_NEUTRAL);
        this._prevEvolution.fill(0);
        this._deltaBodies.fill(0);
        this._outflowRate.fill(0);
        this._nodeFlags.fill(0);
        this._oppActive.fill(0);
    }

    /**
     * Tick principal. Llamar desde AIManager.update() ANTES de _decideAttacks().
     * Aplica time-slicing interno (solo procesa si han pasado 0.25s).
     *
     * @param {number} dt
     * @param {object} world       — WorldManager
     * @param {string} playerFaction
     * @param {string} aiFaction
     */
    update(dt, world, playerFaction, aiFaction) {
        if (!world || !world.nodes) return;

        this._simTime += dt;
        this._monitorTimer += dt;

        // Decaimiento de oportunidades se evalúa cada llamada (ligero: O(32))
        this._updateOpportunityDecay();

        // Delta monitoring a 4 Hz
        if (this._monitorTimer < MONITOR_INTERVAL) return;
        this._monitorTimer -= MONITOR_INTERVAL;

        // Detectar cambio de nivel → reinicializar
        const currentNodeCount = Math.min(world.nodes.length, MAX_NODES);
        if (currentNodeCount !== this._nodeCount || !this._initialized) {
            this._nodeCount = currentNodeCount;
            this._initializeSnapshots(world, playerFaction);
            this._initialized = true;
            return;  // Primer tick: solo inicializar, no emitir
        }

        // ── Módulo 1: Detección de Deltas ─────────────────────────
        this._updateDeltas(world, playerFaction);

        // ── Módulo 3: Detección de Atrición ───────────────────────
        this._detectHazardAttrition(world, playerFaction);
        this._detectDefensiveAttrition(world, playerFaction, aiFaction);
    }

    /** Número de oportunidades activas */
    getActiveCount() { return this._oppCount; }

    /**
     * Retorna la urgencia máxima de cualquier oportunidad activa en un nodo.
     * O(32) — el Pilar 5 / _scoreTarget invocará esto por nodo candidato.
     *
     * @param {number} nodeIndex
     * @returns {number} urgencia máxima (0 si no hay oportunidad)
     */
    getNodeUrgency(nodeIndex) {
        let maxUrgency = 0;
        for (let i = 0; i < MAX_OPPORTUNITIES; i++) {
            if (this._oppActive[i] === 1
                && this._oppNodeIndex[i] === nodeIndex
                && this._oppUrgency[i] > maxUrgency) {
                maxUrgency = this._oppUrgency[i];
            }
        }
        return maxUrgency;
    }

    /**
     * Escribe los Top-K slots activos ordenados por urgencia descendente.
     * @param {number}     maxCount    — máximo a devolver
     * @param {Uint8Array} outIndices  — buffer pre-asignado de salida
     * @returns {number} cantidad escrita
     */
    getTopOpportunities(maxCount, outIndices) {
        let count = 0;

        // Collect active
        for (let i = 0; i < MAX_OPPORTUNITIES; i++) {
            if (this._oppActive[i] === 1) {
                outIndices[count++] = i;
                if (count >= maxCount) break;
            }
        }

        // Insertion sort by urgency desc (N ≤ 32, trivial)
        for (let i = 1; i < count; i++) {
            const key    = outIndices[i];
            const keyUrg = this._oppUrgency[key];
            let j = i - 1;
            while (j >= 0 && this._oppUrgency[outIndices[j]] < keyUrg) {
                outIndices[j + 1] = outIndices[j];
                j--;
            }
            outIndices[j + 1] = key;
        }

        return count;
    }

    /**
     * Lee datos de una oportunidad por slot index.
     * @param {number}       slotIndex
     * @param {Float32Array} outData — [nodeIndex, typeCode, urgency, timeRemaining]
     */
    readOpportunity(slotIndex, outData) {
        outData[0] = this._oppNodeIndex[slotIndex];
        outData[1] = this._oppTypeCode[slotIndex];
        outData[2] = this._oppUrgency[slotIndex];
        outData[3] = Math.max(0, this._oppExpireTime[slotIndex] - this._simTime);
    }

    /** Bitfield de dirty flags para un nodo */
    getNodeFlags(nodeIndex) {
        return nodeIndex < MAX_NODES ? this._nodeFlags[nodeIndex] : 0;
    }

    /** Outflow rate EMA para un nodo del jugador (cuerpos/s saliendo) */
    getOutflowRate(nodeIndex) {
        return nodeIndex < MAX_NODES ? this._outflowRate[nodeIndex] : 0;
    }

    // ═══════════════════════════════════════════════════════════════
    //  MÓDULO 1: STATE DELTA MONITOR
    // ═══════════════════════════════════════════════════════════════

    /** Inicializa snapshots del estado actual (primera muestra, sin emitir) */
    _initializeSnapshots(world, playerFaction) {
        for (let i = 0; i < this._nodeCount; i++) {
            const node = world.nodes[i];
            const bodies = node.counts ? (node.counts[playerFaction] || 0) : 0;
            this._prevBodies[i]    = bodies;
            this._prevPower[i]     = node.power ? (node.power[playerFaction] || bodies) : bodies;
            this._prevOwner[i]     = this._ownerMarker(node.owner, playerFaction);
            this._prevEvolution[i] = getEvolutionCode(node.evolution);
            this._outflowRate[i]   = 0;
        }
    }

    /** Compara estado actual vs snapshot anterior, emite oportunidades */
    _updateDeltas(world, playerFaction) {
        for (let i = 0; i < this._nodeCount; i++) {
            const node = world.nodes[i];

            // Leer estado actual
            const currBodies = node.counts ? (node.counts[playerFaction] || 0) : 0;
            const currPower  = node.power  ? (node.power[playerFaction]  || currBodies) : currBodies;
            const currOwner  = this._ownerMarker(node.owner, playerFaction);
            const currEvo    = getEvolutionCode(node.evolution);

            // Delta de cuerpos
            const delta = currBodies - this._prevBodies[i];
            this._deltaBodies[i] = delta;

            // EMA del outflow rate (α = 0.4 → respuesta rápida con suavizado)
            const instantRate = -delta / MONITOR_INTERVAL;  // positivo = pérdida
            this._outflowRate[i] = 0.4 * instantRate + 0.6 * this._outflowRate[i];

            // ── Detección de eventos via bitfield ──────────────────
            let flags = 0;

            // Bit 0: Base vaciada (caída brusca)
            if (delta < -40 || (this._prevBodies[i] > 50 && currBodies < 15)) {
                flags |= FLAG_BASE_EMPTIED;

                if (this._prevOwner[i] === OWNER_PLAYER || currOwner === OWNER_PLAYER) {
                    const urgency  = Math.min(10, (this._prevBodies[i] - currBodies) / 20);
                    const halfLife = (node.regenInterval || 1) * 15;
                    const lambda   = LN2 / halfLife;
                    this._emitOpportunity(
                        i, OPP_BASE_EMPTIED, urgency,
                        this._simTime + halfLife * 3,
                        DECAY_EXPONENTIAL, lambda
                    );
                }
            }

            // Bit 1: Evolución iniciada
            if (this._prevEvolution[i] === 0 && node.pendingEvolution !== null) {
                flags |= FLAG_EVOLUTION_STARTED;

                if (currOwner === OWNER_PLAYER) {
                    const evoCost = node.pendingEvolution === 'artilleria' ? 40
                        : (node.pendingEvolution === 'tanque' ? 35 : 30);
                    const urgency     = evoCost / 20;
                    const evoDuration = node.pendingEvolutionDurationSec || 3.5;
                    this._emitOpportunity(
                        i, OPP_EVOLUTION_WINDOW, urgency,
                        this._simTime + evoDuration,
                        DECAY_LINEAR, evoDuration
                    );
                }
            }

            // Bit 2: Owner cambió
            if (currOwner !== this._prevOwner[i]) {
                flags |= FLAG_OWNER_CHANGED;

                // Jugador perdió un nodo → oportunidad de contraataque
                if (this._prevOwner[i] === OWNER_PLAYER && currOwner !== OWNER_PLAYER) {
                    let urgency = 3.0;
                    if (node.type === 'enjambre') urgency += 1.5;
                    if (node.type === 'gigante')  urgency += 2.0;
                    if (node.evolution)            urgency += 1.0;

                    const halfLife = 8.0;
                    this._emitOpportunity(
                        i, OPP_NODE_LOST, urgency,
                        this._simTime + halfLife * 3,
                        DECAY_EXPONENTIAL, LN2 / halfLife
                    );
                }
            }

            // Bit 3: Vacío defensivo (momentum de salida sostenido)
            if (currOwner === OWNER_PLAYER
                && this._outflowRate[i] > 15
                && currBodies < 30) {
                flags |= FLAG_UNDER_MASS_ATTACK;

                const urgency  = Math.min(8, this._outflowRate[i] / 10 * 3);
                const halfLife = (node.regenInterval || 1) * 10;
                this._emitOpportunity(
                    i, OPP_ORIGIN_EXPOSED, urgency,
                    this._simTime + halfLife * 2,
                    DECAY_EXPONENTIAL, LN2 / halfLife
                );
            }

            this._nodeFlags[i] = flags;

            // Actualizar snapshot
            this._prevBodies[i]    = currBodies;
            this._prevPower[i]     = currPower;
            this._prevOwner[i]     = currOwner;
            this._prevEvolution[i] = currEvo;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  MÓDULO 3: DETECTOR DE ATRICIÓN
    // ═══════════════════════════════════════════════════════════════

    /**
     * Detecta tropas del jugador muriendo en charcos de insecticida (hazards).
     * Calcula T_depletion y emite OPP_HAZARD_ATTRITION.
     */
    _detectHazardAttrition(world, playerFaction) {
        if (!world.hazards || world.hazards.length === 0) return;

        const gw = world.game ? world.game.width  : 1920;
        const gh = world.game ? world.game.height : 1080;
        const units = world.allUnits;

        for (let h = 0; h < world.hazards.length; h++) {
            const hz   = world.hazards[h];
            const hx   = hz.x * gw;
            const hy   = hz.y * gh;
            const hR   = hz.radius * gw;
            const hRSq = hR * hR;
            const sy   = hz.scaleY || 1.0;

            let bodiesInHazard  = 0;
            let firstTargetNode = null;

            for (let j = 0; j < units.length; j++) {
                const u = units[j];
                if (!u || u.pendingRemoval) continue;
                if (u.faction !== playerFaction || u.state !== 'traveling') continue;

                const dx = u.x - hx;
                const dy = (u.y - hy) / sy;
                if (dx * dx + dy * dy >= hRSq) continue;

                // Semicircle shape check
                if (hz.shape === 'semicircle' && dx < 0) continue;

                bodiesInHazard++;
                if (!firstTargetNode && u.targetNode) firstTargetNode = u.targetNode;
            }

            if (bodiesInHazard < 5) continue;

            // Encontrar el nodeIndex del target
            let targetIdx = -1;
            if (firstTargetNode) {
                for (let n = 0; n < this._nodeCount; n++) {
                    if (world.nodes[n] === firstTargetNode) { targetIdx = n; break; }
                }
            }
            if (targetIdx < 0) continue;

            const dps         = Math.max(1, hz.dps || 1);
            const T_depletion = bodiesInHazard / dps;
            const urgency     = Math.min(8, (bodiesInHazard / 50) * (dps / 3));

            this._emitOpportunity(
                targetIdx,
                OPP_HAZARD_ATTRITION,
                urgency,
                this._simTime + T_depletion,
                DECAY_LINEAR,
                T_depletion
            );
        }
    }

    /**
     * Detecta ataques suicidas del jugador contra nodos con espinoso/artillería.
     * Emite OPP_SUICIDE_ATTACK en el nodo defensivo y OPP_ORIGIN_EXPOSED
     * en el nodo de origen del jugador.
     */
    _detectDefensiveAttrition(world, playerFaction, aiFaction) {
        const units = world.allUnits;

        for (let i = 0; i < this._nodeCount; i++) {
            const node = world.nodes[i];

            // Solo interesa nodos no-del-jugador con evoluciones defensivas
            if (node.owner === playerFaction) continue;
            if (!node.evolution) continue;
            if (node.evolution !== 'espinoso' && node.evolution !== 'artilleria') continue;

            // Contar tropas del jugador dirigiéndose a este nodo
            let incomingBodies = 0;
            let incomingPower  = 0;
            let originNode     = null;

            for (let j = 0; j < units.length; j++) {
                const u = units[j];
                if (!u || u.pendingRemoval) continue;
                if (u.faction !== playerFaction || u.state !== 'traveling') continue;
                if (u.targetNode !== node) continue;

                incomingBodies++;
                incomingPower += (u.power || 1);
                if (!originNode && u.homeNode && u.homeNode.owner === playerFaction) {
                    originNode = u.homeNode;
                }
            }

            if (incomingBodies < 10) continue;

            const defenderPower = node.power
                ? (node.power[node.owner] || 0) : 0;

            // ¿Ataque suicida? (fuerza insuficiente contra espinoso)
            if (node.evolution === 'espinoso' && incomingPower < defenderPower * 2.0) {
                const killRate    = 1.0 / ESPINOSO_KILL_INTERVAL;  // ~6.67 kills/s
                const T_depletion = incomingBodies / killRate;
                const urgency     = Math.min(6, incomingBodies / 30 * 3);

                // Nodo defensivo sobrevivirá → no es target directo,
                // pero el ORIGEN del jugador queda expuesto
                this._emitOpportunity(
                    i, OPP_SUICIDE_ATTACK, urgency,
                    this._simTime + T_depletion,
                    DECAY_LINEAR, T_depletion
                );

                // Origen expuesto
                if (originNode) {
                    let originIdx = -1;
                    for (let n = 0; n < this._nodeCount; n++) {
                        if (world.nodes[n] === originNode) { originIdx = n; break; }
                    }
                    if (originIdx >= 0) {
                        this._emitOpportunity(
                            originIdx,
                            OPP_ORIGIN_EXPOSED,
                            urgency * 0.8,
                            this._simTime + T_depletion * 1.5,
                            DECAY_EXPONENTIAL,
                            LN2 / (T_depletion * 1.2)
                        );
                    }
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  MÓDULO 2: DECAIMIENTO TEMPORAL DE OPORTUNIDADES
    // ═══════════════════════════════════════════════════════════════

    /** Actualiza urgencia de todas las oportunidades activas (O(32)) */
    _updateOpportunityDecay() {
        for (let i = 0; i < MAX_OPPORTUNITIES; i++) {
            if (this._oppActive[i] === 0) continue;

            // Expiración
            if (this._simTime >= this._oppExpireTime[i]) {
                this._oppActive[i] = 0;
                this._oppCount--;
                continue;
            }

            const elapsed = this._simTime - this._oppBirthTime[i];

            // Calcular urgencia decayada
            if (this._oppDecayType[i] === DECAY_EXPONENTIAL) {
                const lambda = this._oppDecayParam[i];
                this._oppUrgency[i] = this._oppUrgencyBase[i] * Math.exp(-lambda * elapsed);
            } else {
                // DECAY_LINEAR: cae linealmente a 0 en T_window
                const T_window = this._oppDecayParam[i];
                this._oppUrgency[i] = this._oppUrgencyBase[i] * Math.max(0, 1 - elapsed / T_window);
            }

            // Matar si negligible
            if (this._oppUrgency[i] < 0.05) {
                this._oppActive[i] = 0;
                this._oppCount--;
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  EMISIÓN Y GESTIÓN DE SLOTS
    // ═══════════════════════════════════════════════════════════════

    /**
     * Emite una nueva oportunidad o actualiza una existente (same node+type).
     * Zero-allocation: escribe directamente en los typed arrays.
     */
    _emitOpportunity(nodeIndex, typeCode, urgency, expireTime, decayType, decayParam) {
        if (urgency < 0.1) return;

        // Deduplicación: buscar slot existente con mismo nodo + tipo
        for (let i = 0; i < MAX_OPPORTUNITIES; i++) {
            if (this._oppActive[i] === 1
                && this._oppNodeIndex[i] === nodeIndex
                && this._oppTypeCode[i] === typeCode) {
                // Actualizar solo si la nueva urgencia es mayor
                if (urgency > this._oppUrgency[i]) {
                    this._oppUrgencyBase[i] = urgency;
                    this._oppUrgency[i]     = urgency;
                    this._oppBirthTime[i]   = this._simTime;
                    this._oppExpireTime[i]  = expireTime;
                    this._oppDecayType[i]   = decayType;
                    this._oppDecayParam[i]  = decayParam;
                }
                return;
            }
        }

        // Nuevo slot
        const slot = this._findFreeSlot();

        this._oppNodeIndex[slot]   = nodeIndex;
        this._oppTypeCode[slot]    = typeCode;
        this._oppUrgency[slot]     = urgency;
        this._oppUrgencyBase[slot] = urgency;
        this._oppBirthTime[slot]   = this._simTime;
        this._oppExpireTime[slot]  = expireTime;
        this._oppDecayType[slot]   = decayType;
        this._oppDecayParam[slot]  = decayParam;
        this._oppActive[slot]      = 1;
        this._oppCount++;
    }

    /** Busca slot libre o recicla el de menor urgencia (ring buffer) */
    _findFreeSlot() {
        // Búsqueda circular desde el write head
        for (let i = 0; i < MAX_OPPORTUNITIES; i++) {
            const idx = (this._oppWriteHead + i) % MAX_OPPORTUNITIES;
            if (this._oppActive[idx] === 0) {
                this._oppWriteHead = (idx + 1) % MAX_OPPORTUNITIES;
                return idx;
            }
        }

        // Buffer lleno: reciclar slot con menor urgencia
        let minUrgency = Infinity;
        let minIdx     = 0;
        for (let i = 0; i < MAX_OPPORTUNITIES; i++) {
            if (this._oppUrgency[i] < minUrgency) {
                minUrgency = this._oppUrgency[i];
                minIdx     = i;
            }
        }
        this._oppCount--;  // será re-incrementado por _emitOpportunity
        return minIdx;
    }

    // ═══════════════════════════════════════════════════════════════
    //  HELPERS
    // ═══════════════════════════════════════════════════════════════

    /** Convierte faction string a marker numérico sin allocations */
    _ownerMarker(ownerStr, playerFaction) {
        if (ownerStr === playerFaction) return OWNER_PLAYER;
        if (ownerStr === 'neutral')     return OWNER_NEUTRAL;
        return OWNER_OTHER;
    }
}
