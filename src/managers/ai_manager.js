/**
 * AI Manager — MicroWars v4
 *
 * MEJORAS vs v3:
 *   1. targetingIntelligence reemplaza intentionalErrorRate — la IA no "falla"
 *      aleatoriamente, sino que tiene distinta profundidad de analisis.
 *   2. Fases de juego (early/mid/late) — la IA adapta su estrategia al momento de la partida.
 *   3. Scoring por capas — cada nivel de inteligencia desbloquea mas heuristicas.
 *   4. Coordinacion multi-faccion — solo activa en 'expert'+ (Hard/Brutal).
 *   5. Rush temprano — solo en normal+, con probabilidades distintas.
 *   6. Sin errores aleatorios — la dificultad escala por conciencia, no por azar.
 *   7. Capa 'master' (Brutal) — Back-capping, flanqueo, hazard awareness.
 */

// -- Perfiles de dificultad --
//
// targetingIntelligence controla QUE HEURISTICAS usa _scoreTarget():
//   'medium' -> tipos de nodo, evoluciones, ratio tropas (conciencia tactica)
//   'high'   -> + momentum, chokepoints, sobreextension (conciencia estrategica)
//   'expert' -> + coordinacion multi-faccion pinzas (inteligencia enjambre)
//   'master' -> + back-capping, flanqueo letal, hazard awareness (dominio absoluto)
//
import { NavigationGameStateView, PathEvaluationResult } from '../navigation/navigation_system.js';
import { CombatManager } from './combat_manager.js';
import { PredictiveCombatSimulator } from '../simulation/predictive_combat_simulator.js';
import { fractionFromSeed, hashStringSeed, mixSeeds } from '../simulation/deterministic_layout.js';

const DIFFICULTY_PROFILES = {
    easy: {
        attackInterval:        5.0,
        aggressionThreshold:   0.62,
        rushEnabled:           true,
        rushChance:            0.22,
        targetingIntelligence: 'medium',
        evolutionMinCount:     65,
        evolutionChance:       0.55,
        coordinationMode:      'basic',
        sendRatio:             0.55,
        tunnelEnabled:         true,
        dumpRatio:             0.75,
        visionRange:           Infinity,
    },
    normal: {
        attackInterval:        3.0,
        aggressionThreshold:   0.78,
        rushEnabled:           true,
        rushChance:            0.62,
        targetingIntelligence: 'high',
        evolutionMinCount:     40,
        evolutionChance:       0.75,
        coordinationMode:      'active',
        sendRatio:             0.65,
        tunnelEnabled:         true,
        dumpRatio:             0.82,
        visionRange:           Infinity,
    },
    hard: {
        attackInterval:        0.5,
        aggressionThreshold:   0.85,
        rushEnabled:           true,
        rushChance:            1.00,
        targetingIntelligence: 'expert',
        evolutionMinCount:     25,
        evolutionChance:       0.90,
        coordinationMode:      'active',
        sendRatio:             'dynamic',
        tunnelEnabled:         true,
        dumpRatio:             0.88,
        visionRange:           Infinity,
    },
    brutal: {
        attackInterval:        0.2,
        aggressionThreshold:   0.90,
        rushEnabled:           true,
        rushChance:            1.00,
        targetingIntelligence: 'master',
        evolutionMinCount:     15,
        evolutionChance:       1.00,
        coordinationMode:      'swarm',
        sendRatio:             'dynamic',
        tunnelEnabled:         true,
        dumpRatio:             0.95,
        visionRange:           Infinity,
    },
};

// -- Estado compartido entre todas las facciones IA (coordinacion) --
// factionId -> Set de nodos que tiene como objetivo en el ciclo actual.
const _factionTargets = new Map();

// ---------------------------------------------------------------------------

export class AIManager {
    /**
     * @param {object} config
     * @param {string} [config.difficulty='normal']  'easy'|'normal'|'hard'|'brutal'
     * @param {number} [config.attackInterval]       override manual (retro-compatibilidad)
     * @param {object} [config.worldRef]             referencia al worldManager
     */
    constructor(config = {}) {
        this.world = config.worldRef || null;
        this.difficulty = config.difficulty || 'normal';
        this._profile   = { ...DIFFICULTY_PROFILES[this.difficulty] };

        if (config.attackInterval != null) {
            this._profile.attackInterval = config.attackInterval;
        }

        this._timers           = {};
        this._rushDone         = {};
        this._rushScheduled    = {};
        this._elapsed          = {};

        this._aiNodes     = [];
        this._targetNodes = [];
        this._playerNodes = [];

        this.evoCosts = { espinoso: 30, artilleria: 40, tanque: 35 };
        this._navStateView = new NavigationGameStateView();
        this._navScoreResult = new PathEvaluationResult();
        this._navExecResult = new PathEvaluationResult();
        this._navHopScratch = { routeResult: null, hopTarget: null };
        this._mentalSandbox = new PredictiveCombatSimulator();
        this._mentalResult = new Float32Array(PredictiveCombatSimulator.RESULT_SIZE);

        // AI-8: Counterplay Adaptation — perfil del jugador durante la partida
        this._playerProfile = {
            totalAttacks: 0,          // Ataques totales del jugador
            attacksByFlank: {},        // { 'left': N, 'right': N, 'center': N }
            lastPlayerNodeCount: 0,    // Para detectar turtle
            turtleTimer: 0,            // Cuánto tiempo lleva sin expandirse
            aggressionLevel: 'normal'  // 'turtle' | 'aggressive' | 'normal'
        };
    }

    setDifficulty(difficulty) {
        if (!DIFFICULTY_PROFILES[difficulty]) return;
        this.difficulty = difficulty;
        this._profile   = { ...DIFFICULTY_PROFILES[difficulty] };
        this._timers = {};
    }

    _factionSeed(factionId, salt = 0) {
        return mixSeeds(hashStringSeed(`${this.difficulty}:${factionId}`), salt >>> 0);
    }

    _factionRoll(factionId, salt = 0) {
        return fractionFromSeed(this._factionSeed(factionId, salt));
    }

    _nodeRoll(node, factionId, salt = 0) {
        const nodeSeed = ((node.x | 0) ^ Math.imul(node.y | 0, 19349663) ^ Math.imul((node.radius | 0) + 1, 83492791)) >>> 0;
        return fractionFromSeed(mixSeeds(this._factionSeed(factionId, salt), nodeSeed));
    }

    _evaluateRoute(attacker, target, squadCount, outResult) {
        if (!this.world || !this.world.navigation || !this.world.navigation.store) return null;
        if (!attacker || !target) return null;
        if (attacker.navIndex == null || target.navIndex == null) return null;

        this.world.navigation.populateGameStateView(
            this.world,
            squadCount,
            this.world.unitBaseSpeed || 75,
            this._navStateView
        );

        return this.world.navigation.evaluatePath(
            attacker.navIndex,
            target.navIndex,
            this._navStateView,
            outResult
        );
    }

    _getFirstHopTarget(attacker, target, squadCount, outResult) {
        const routeResult = this._evaluateRoute(attacker, target, squadCount, outResult);
        const hopScratch = this._navHopScratch;
        hopScratch.routeResult = routeResult;
        hopScratch.hopTarget = target;

        if (!routeResult || !routeResult.isViable || !this.world || !this.world.navigation) {
            return hopScratch;
        }

        const hopIndex = this.world.navigation.peekFirstHop(routeResult.queryHandle);
        if (hopIndex >= 0 && hopIndex < this.world.nodes.length) {
            hopScratch.hopTarget = this.world.nodes[hopIndex];
        }

        return hopScratch;
    }

    // === UPDATE ===
    update(dt, nodes, allUnits, aiFaction = 'enemy', playerFaction = 'player') {
        const prof = this._profile;

        if (this._timers[aiFaction] === undefined) {
            this._timers[aiFaction]        = this._factionRoll(aiFaction, 1) * prof.attackInterval;
            this._elapsed[aiFaction]       = 0;
            this._rushDone[aiFaction]      = false;

            if (prof.rushEnabled && this._factionRoll(aiFaction, 2) < prof.rushChance) {
                this._rushScheduled[aiFaction] = 20 + (this._factionRoll(aiFaction, 3) * 20);
            } else {
                this._rushScheduled[aiFaction] = Infinity;
            }
        }

        this._elapsed[aiFaction] += dt;

        this._aiNodes.length     = 0;
        this._targetNodes.length = 0;
        this._playerNodes.length = 0;

        for (const n of nodes) {
            if (n.owner === aiFaction)     this._aiNodes.push(n);
            else                           this._targetNodes.push(n);
            if (n.owner === playerFaction) this._playerNodes.push(n);
        }

        if (this._aiNodes.length === 0) return;

        // AI-8: Actualizar perfil del jugador
        this._updatePlayerProfile(dt, allUnits, playerFaction);

        if (this._mentalSandbox && this.world) {
            this._mentalSandbox.rebuildFutureLedger(this.world);
        }

        const phase = this._detectPhase(nodes, aiFaction);

        // Rush temprano
        if (!this._rushDone[aiFaction]
            && this._elapsed[aiFaction] >= this._rushScheduled[aiFaction]
            && this._playerNodes.length > 0) {
            this._doRush(aiFaction, allUnits);
            this._rushDone[aiFaction] = true;
        }

        // Timer de ciclo de decision
        this._timers[aiFaction] += dt;
        if (this._timers[aiFaction] < prof.attackInterval) return;
        this._timers[aiFaction] = 0;

        if (!_factionTargets.has(aiFaction)) {
            _factionTargets.set(aiFaction, new Set());
        } else {
            _factionTargets.get(aiFaction).clear();
        }

        // 1. Gestion propia: evoluciones y tuneles
        this._manageSelf(phase, aiFaction, allUnits);

        // 1.5. Módulo B y D: Detección de Amenazas y Retiradas
        this._detectThreatsAndRetreats(aiFaction, playerFaction, allUnits);

        // 2. Ataques estrategicos
        this._decideAttacks(phase, aiFaction, playerFaction, allUnits);
    }

    // === FASE DEL JUEGO ===
    _detectPhase(nodes, aiFaction) {
        const total   = nodes.length || 1;
        const aiCount = this._aiNodes.length;
        const plCount = this._playerNodes.length;

        if (aiCount / total > 0.55) return 'late';
        if (plCount <= 1)           return 'late';
        if (aiCount <= 2)           return 'early';
        return 'mid';
    }

    // === GESTION PROPIA ===
    _manageSelf(phase, aiFaction, allUnits) {
        const prof = this._profile;

        for (const en of this._aiNodes) {
            const count = this._countAt(en, aiFaction);

            // A. Evoluciones
            if (!en.evolution && !en.pendingEvolution && en.type !== 'tunel' && count >= prof.evolutionMinCount) {
                if (this._nodeRoll(en, aiFaction, 10) < prof.evolutionChance) {
                    this._chooseEvolution(en, count, phase, aiFaction, allUnits);
                }
            }

            // ==========================================
            // B. AI-7: TÚNELES LOGÍSTICOS ESTRATÉGICOS
            // ==========================================
            if (!prof.tunnelEnabled || en.type === 'tunel') continue;

            if (en.tunnelTo) {
                // Romper el tunel si el destino está saturado o bajo amenaza de rayo
                if (this._countAt(en.tunnelTo, aiFaction) >= en.tunnelTo.maxUnits * 0.88) {
                    en.tunnelTo = null;
                } else if (en.tunnelTo.isMarkedForSweep && this.world && this.world.lightSweeps && this.world.lightSweeps.length > 0) {
                    const sweep = this.world.lightSweeps[0];
                    if (sweep.isAlerting) en.tunnelTo = null;
                }
            }

            if (count > en.maxUnits * 0.55 && !en.tunnelTo) {
                let bestTarget = null;
                let highestPriority = -Infinity;

                // En high/expert/master, evaluamos todos los nodos propios por prioridad logística
                if (prof.targetingIntelligence === 'high' || prof.targetingIntelligence === 'expert' || prof.targetingIntelligence === 'master') {
                    for (const fn of this._aiNodes) {
                        if (fn === en) continue;
                        if (prof.targetingIntelligence !== 'master' && this._countAt(fn, aiFaction) >= fn.maxUnits * 0.80) continue;
                        if (fn.isMarkedForSweep) continue; 

                        let priority = 0;
                        const distToPlayer = Math.min(...this._playerNodes.map(pn => Math.hypot(pn.x - fn.x, pn.y - fn.y)));
                        
                        // 1. Cercanía al frente
                        priority += 5000 / (distToPlayer + 1);

                        // 2. ¿Este nodo está bajo ataque inminente? (Reforzar)
                        if (this.world) {
                            let threats = 0;
                            for (let u of this.world.allUnits) {
                                if (!u.pendingRemoval && u.faction !== aiFaction && u.state === 'traveling' && u.targetNode === fn) threats++;
                            }
                            if (threats > 0) priority += threats * 10; // Alta prioridad a nodos que necesitan defenderse
                        }

                        // 3. ¿Este nodo va a atacar? (Pre-cargar tropas para multi-prong o gran asedio)
                        const myTargets = _factionTargets.get(aiFaction);
                        if (myTargets && myTargets.has(fn)) {
                            // Si fn no es nuestro, no le hacemos túnel
                            // Si el nodo fn está preparando un ataque (no cubierto de forma directa acá, pero asumimos que nodos frontline atacan)
                        }

                        if (priority > highestPriority) {
                            highestPriority = priority;
                            bestTarget = fn;
                        }
                    }
                } else {
                    // Logística básica (medium): nodo más cercano al jugador
                    let bestDist = Infinity;
                    for (const fn of this._aiNodes) {
                        if (fn === en || fn.isMarkedForSweep) continue;
                        if (this._countAt(fn, aiFaction) >= fn.maxUnits * 0.80) continue;

                        let distToPlayer = Infinity;
                        for (const pn of this._playerNodes) {
                            const d = Math.hypot(pn.x - fn.x, pn.y - fn.y);
                            if (d < distToPlayer) distToPlayer = d;
                        }

                        if (distToPlayer < bestDist) {
                            bestDist = distToPlayer;
                            bestTarget = fn;
                        }
                    }
                }

                if (bestTarget) en.tunnelTo = bestTarget;
            }
        }
    }

    // ==========================================
    // AI-3: EVOLUCIONES CON ROI TEMPORAL
    // ==========================================
    _chooseEvolution(node, count, phase, aiFaction, allUnits) {
        if (node.isMarkedForSweep) return; // NUNCA evolucionar un nodo condenado al sol

        let minDistPlayer = Infinity;
        for (const pn of this._playerNodes) {
            const d = Math.hypot(pn.x - node.x, pn.y - node.y);
            if (d < minDistPlayer) minDistPlayer = d;
        }
        
        const isFrontline = minDistPlayer < 450;
        const prof = this._profile;
        const isMaster = prof.targetingIntelligence === 'master';
        const isAdvanced = prof.targetingIntelligence === 'high' || prof.targetingIntelligence === 'expert' || isMaster;

        // 1. Tesis de No Evolucionar: ¿Está en disputa activa?
        if (isAdvanced && this.world) {
            let incomingThreats = 0;
            for (let u of this.world.allUnits) {
                if (!u.pendingRemoval && u.faction !== aiFaction && u.targetNode === node) incomingThreats++;
            }
            // Si hay ataques masivos entrando, perder tropas en evolucion nos hace perder el nodo
            if (incomingThreats > count * 0.5) return; 
            
            // 2. Coste de oportunidad: ¿Es mejor gastar 40 tropas capturando neutrales baratos?
            if (phase === 'early') {
                for (const target of this._targetNodes) {
                    if (target.owner === 'neutral' && this._countAt(target, 'neutral') < 15) {
                        const distToNeut = Math.hypot(target.x - node.x, target.y - node.y);
                        if (distToNeut < 350) return; // Mejor uso el ejército temprano para expandir, no evolucionar
                    }
                }
            }
        }

        if (!isAdvanced) {
            // Lógica antigua / básica para niveles Easy / Normal
            if (phase === 'early') {
                if (count >= this.evoCosts.espinoso) this.buyEvolution(node, 'espinoso', this.evoCosts.espinoso, aiFaction, allUnits);
            } else if (isFrontline) {
                if (count >= this.evoCosts.artilleria && this._nodeRoll(node, aiFaction, 20) < 0.55) this.buyEvolution(node, 'artilleria', this.evoCosts.artilleria, aiFaction, allUnits);
                else if (count >= this.evoCosts.espinoso) this.buyEvolution(node, 'espinoso', this.evoCosts.espinoso, aiFaction, allUnits);
            } else {
                if (count >= this.evoCosts.tanque) this.buyEvolution(node, 'tanque', this.evoCosts.tanque, aiFaction, allUnits);
            }
            return;
        }

        // Lógica avanzada: ROI Temporal

        // 3. Control de Mapa (Permanencia)
        const totalNodes = (this._aiNodes.length + this._playerNodes.length + 1); // +1 safety
        const mapControl = this._aiNodes.length / totalNodes;
        const playerControl = this._playerNodes.length / totalNodes;

        // 4. Counter-pick con visión futura
        let playerArtilleria = 0, playerTanque = 0, playerEspinoso = 0;
        for (const pn of this._playerNodes) {
            if (pn.evolution === 'artilleria') playerArtilleria++;
            if (pn.evolution === 'tanque') playerTanque++;
            if (pn.evolution === 'espinoso') playerEspinoso++;
        }

        if (isFrontline) {
            // Predicción: ¿Seguirá siendo frontline?
            if (mapControl > 0.6) {
                // Estamos ganando rápido. El frontline de hoy será retaguardia mañana. Tanque es mejor ROI a largo plazo.
                if (count >= this.evoCosts.tanque) this.buyEvolution(node, 'tanque', this.evoCosts.tanque, aiFaction, allUnits);
            } else if (playerControl > 0.6) {
                // Estamos perdiendo. Necesitamos frenar la sangría agresivamente.
                if (count >= this.evoCosts.espinoso) this.buyEvolution(node, 'espinoso', this.evoCosts.espinoso, aiFaction, allUnits);
            } else {
                // Frontline estable. Counter-pick.
                if (playerEspinoso > 1 && count >= this.evoCosts.artilleria) {
                    // Si el jugador tiene mucho espinoso, abusar de rango (artilleria).
                    this.buyEvolution(node, 'artilleria', this.evoCosts.artilleria, aiFaction, allUnits);
                } else if (playerTanque > 1 && count >= this.evoCosts.espinoso) {
                    // Si el jugador abusa de tanques (que pegan duro melee), castigarlo con espinosos reflectando daño
                    this.buyEvolution(node, 'espinoso', this.evoCosts.espinoso, aiFaction, allUnits);
                } else {
                    // Mix estandar
                    if (count >= this.evoCosts.artilleria && this._nodeRoll(node, aiFaction, 21) < 0.4) this.buyEvolution(node, 'artilleria', this.evoCosts.artilleria, aiFaction, allUnits);
                    else if (count >= this.evoCosts.espinoso) this.buyEvolution(node, 'espinoso', this.evoCosts.espinoso, aiFaction, allUnits);
                }
            }
        } else {
            // Retaguardia
            if (count >= this.evoCosts.tanque) {
                this.buyEvolution(node, 'tanque', this.evoCosts.tanque, aiFaction, allUnits);
            }
        }
    }

    // === ATAQUES ESTRATEGICOS ===
    _decideAttacks(phase, aiFaction, playerFaction, allUnits) {
        const prof       = this._profile;
        const myTargets  = _factionTargets.get(aiFaction) || new Set();

        // Opt 3: Pre-index idle units by node to avoid O(n^2) scaling
        const idleUnitsMap = new Map();
        for (const u of allUnits) {
            if (!u.pendingRemoval && u.faction === aiFaction && u.state === 'idle' && u.targetNode) {
                let list = idleUnitsMap.get(u.targetNode);
                if (!list) {
                    list = [];
                    idleUnitsMap.set(u.targetNode, list);
                }
                list.push(u);
            }
        }

        // ==========================================
        //  AI-1: MULTI-PRONG ATTACKS (PINZAS)
        // ==========================================
        // 1. Agrupar puntajes y ataques viables por Target
        const possibleAttacks = new Map(); // target -> [ {attacker, score, count, needsDump} ]

        for (const attacker of this._aiNodes) {
            const count     = this._countAt(attacker, aiFaction);
            const needsDump = count >= attacker.maxUnits - 10;

            if (count < 15 && !needsDump) continue;

            for (const target of this._targetNodes) {
                const score = this._scoreTarget(
                    target, attacker, count, aiFaction, playerFaction, phase, needsDump, allUnits
                );
                
                if (score > -Infinity) {
                    if (!possibleAttacks.has(target)) possibleAttacks.set(target, []);
                    possibleAttacks.get(target).push({ attacker, score, count, needsDump });
                }
            }
        }

        // 2. Ordenar Targets por el MEJOR puntaje individual que recibieron
        const sortedTargets = Array.from(possibleAttacks.keys()).sort((a, b) => {
            const maxScoreA = Math.max(...possibleAttacks.get(a).map(atk => atk.score));
            const maxScoreB = Math.max(...possibleAttacks.get(b).map(atk => atk.score));
            return maxScoreB - maxScoreA;
        });

        const attackersUsed = new Set();

        for (const target of sortedTargets) {
            let atks = possibleAttacks.get(target);
            // Filtrar los que ya atacaron a otro lado
            atks = atks.filter(a => !attackersUsed.has(a.attacker));
            if (atks.length === 0) continue;

            // Ordenar atacantes para ESTE target de mejor a peor
            atks.sort((a, b) => b.score - a.score);

            // Decidir cuántas puntas (prongs) usar
            let maxProngs = 1;
            if (prof.targetingIntelligence === 'expert') maxProngs = 2;
            if (prof.targetingIntelligence === 'master') maxProngs = 3;

            // Solo usamos multi-prong si el target es del jugador y tiene defensas reales
            const targetDefenders = this._countAt(target, playerFaction);
            if (target.owner !== playerFaction && target.owner !== 'neutral') maxProngs = 1;

            let prongsUsed = 0;
            let totalSent = 0;

            for (const atk of atks) {
                if (prongsUsed >= maxProngs) break;
                // Si ya enviamos suficientes tropas solas en el primer prong, no necesitamos más
                if (prongsUsed > 0 && totalSent > (targetDefenders + 10) * 1.5) break; 

                // Ejecutar el ataque desde este nodo
                this._executeAttack(atk.attacker, target, atk.count, aiFaction, prof, atk.needsDump, idleUnitsMap, myTargets);
                
                attackersUsed.add(atk.attacker);
                prongsUsed++;
                
                // Estimate sent troops
                const ratio = atk.needsDump ? prof.dumpRatio : prof.sendRatio;
                let activeRatio = ratio === 'dynamic' ? 0.5 : ratio; // Rough estimate for tracking
                totalSent += Math.max(1, Math.floor(atk.count * activeRatio));
            }
        }
        
        _factionTargets.set(aiFaction, myTargets);
    }

    _executeAttack(attacker, target, count, aiFaction, prof, needsDump, idleUnitsMap, myTargets) {
        myTargets.add(target);

        let ratio = prof.sendRatio;
        if (ratio === 'dynamic') {
            let targetDefenders = 0;
            for (const f in target.counts) {
                if (f !== aiFaction) targetDefenders += (target.counts[f] || 0);
            }

            let actualThreshold = prof.aggressionThreshold;
            if (target.owner === 'neutral' && targetDefenders < 15 && this.difficulty !== 'easy') {
                actualThreshold = 1.1;
            }

            const needed = Math.floor((targetDefenders + 1) * actualThreshold * 1.3);
            ratio = Math.min(0.85, Math.max(0.15, needed / count));
        }

        const activeRatio = needsDump ? prof.dumpRatio : ratio;
        const toSend = Math.max(1, Math.floor(count * activeRatio));
        const routedAttack = this._getFirstHopTarget(attacker, target, toSend, this._navExecResult);
        if (routedAttack.routeResult && !routedAttack.routeResult.isViable) return;
        if (routedAttack.routeResult && routedAttack.routeResult.suggestedDelay > 0.35) return;

        const hopTarget = routedAttack.hopTarget || target;
        let sent = 0;

        const idleUnitsForNode = idleUnitsMap.get(attacker) || [];
        while (sent < toSend && idleUnitsForNode.length > 0) {
            const u = idleUnitsForNode.pop();
            u.targetNode = hopTarget;
            u.state      = 'traveling';
            sent++;
        }
    }

    // === SCORING DE OBJETIVOS (capas por inteligencia) ===
    //
    //   'medium' -> CAPA 1: tipos de nodo, evoluciones, ratio tropas
    //   'high'   -> CAPA 1-2: momentum, chokepoints, sobreextension, fases
    //   'expert' -> CAPA 1-3: coordinacion multi-faccion (pinzas)
    //   'master' -> CAPA 1-4: back-capping, flanqueo, hazard awareness
    //
    _scoreTarget(target, attacker, ownCount, aiFaction, playerFaction, phase, needsDump, allUnits) {
        const prof  = this._profile;
        const intel = prof.targetingIntelligence;

        // --- CAPA 0: INSTINTO (todos los niveles) ---
        const dist = Math.hypot(target.x - attacker.x, target.y - attacker.y);

        if (prof.visionRange && dist > prof.visionRange) return -Infinity;

        let score = 8000 / (dist + 1);
        let routeTransitTime = dist / Math.max(1, this.world ? (this.world.unitBaseSpeed || 75) : 75);
        let routeResult = null;

        if (this.world && this.world.navigation) {
            routeResult = this._evaluateRoute(attacker, target, Math.max(1, ownCount), this._navScoreResult);
            if (routeResult && !routeResult.isViable) return -Infinity;
            if (routeResult) {
                routeTransitTime = routeResult.projectedTransitTime;
            }
        }

        // ==========================================
        // === AI-2 & AI-6: ECONOMÍA Y DENEGACIÓN ===
        // ==========================================
        if (target.owner === 'neutral') {
            score += 650;
            let defs = 0;
            for (const f in target.counts) {
                if (f !== aiFaction) defs += (target.counts[f] || 0);
            }
            if (defs < 8) score += 1000;

            // Early game: ROI scoring (Producción / Coste)
            if (phase === 'early' && this.difficulty !== 'easy') {
                const travelTimeCost = routeTransitTime;
                const cost = defs + travelTimeCost * 0.5;
                const roi = (target.productionRate * 100) / Math.max(1, cost);
                score += roi * 50; // Gran peso al ROI
            }

            // Resource Denial: ¿Está el neutral más cerca del jugador que de mí?
            if (this.difficulty === 'master' || this.difficulty === 'high' || this.difficulty === 'hard' || this.difficulty === 'brutal') {
                let closestPlayerDist = Infinity;
                if (this._playerNodes) {
                    for (const pNode of this._playerNodes) {
                        const d = Math.hypot(target.x - pNode.x, target.y - pNode.y);
                        if (d < closestPlayerDist) closestPlayerDist = d;
                    }
                }
                
                if (dist > closestPlayerDist) {
                    // Está más cerca del jugador, capturarlo es denegación de recursos
                    score += 900; 
                }
            }
        }

        // --- CAPA 1: CONCIENCIA TACTICA (medium+) ---
        let defenders = 0;
        for (const f in target.counts) {
            if (f !== aiFaction) defenders += (target.counts[f] || 0);
        }

        // ==========================================
        //  AI-5: RESERVA DEFENSIVA CONTEXTUAL
        // ==========================================
        let reserveRatio = 0.0;
        
        // Determinar amenaza activa real sobre el atacante
        let activeThreatCount = 0;
        if (this.world && attacker) {
            for (let u of this.world.allUnits) {
                if (!u.pendingRemoval && u.faction !== aiFaction && u.state === 'traveling' && u.targetNode === attacker) {
                    activeThreatCount++;
                }
            }
        }

        if (activeThreatCount > 0) {
            // Hay amenaza real viajando hacia nosotros. Retener suficiente para defender.
            const neededToDefende = activeThreatCount * 1.2; 
            reserveRatio = Math.min(0.8, neededToDefende / Math.max(1, ownCount));
        } else {
            // NO hay amenaza activa. Principio: Tropas paradas = tropas desperdiciadas.
            // Si hay oportunidad de expandir, retenemos muy poco.
            let hasOpportunity = false;
            if (target.owner === 'neutral' && defenders < 20) hasOpportunity = true;

            // Retenemos guarnición mínima solo por valor estratégico
            if (attacker.evolution === 'espinoso' || attacker.evolution === 'artilleria') {
                reserveRatio = hasOpportunity ? 0.05 : 0.15;
            } else {
                reserveRatio = hasOpportunity ? 0.0 : 0.05;
            }
            
            // Si estamos perdiendo el mapa, no nos vaciamos por completo
            if (this._playerNodes.length > this._aiNodes.length * 1.5) {
                reserveRatio = Math.max(reserveRatio, 0.15);
            }
        }

        const availableAttackers = Math.max(1, Math.floor(ownCount * (1.0 - reserveRatio)));

        if (this.world && this.world.navigation) {
            routeResult = this._evaluateRoute(attacker, target, availableAttackers, this._navScoreResult);
            if (routeResult && !routeResult.isViable) return -Infinity;
            if (routeResult) {
                routeTransitTime = routeResult.projectedTransitTime;
                score -= routeResult.projectedCasualties * 16;
                score -= routeResult.suggestedDelay * 110;
                score -= Math.max(0, routeTransitTime - (dist / 75)) * 22;
            }
        }

        if (!needsDump) {
            // Módulo A, E y H: Simulador Predictivo con Atrición (ahora incluye Neutrales)
            const projectedResult = this._simulateBattle(attacker, target, availableAttackers, defenders, aiFaction, playerFaction);
            if (projectedResult === PredictiveCombatSimulator.RESULT_DERROTA) return -Infinity;
            if (projectedResult === PredictiveCombatSimulator.RESULT_EMPATE_ESTANCADO) score -= 240;
            if (projectedResult === PredictiveCombatSimulator.RESULT_VICTORIA_PIRRICA) score += 90;
            if (projectedResult === PredictiveCombatSimulator.RESULT_VICTORIA_SEGURA) score += 340;
        }

        score -= defenders * 2.8;

        if (target.type === 'enjambre') score += 220;
        if (target.type === 'gigante')  score += 130;

        if (target.owner !== aiFaction) {
            if (target.evolution === 'artilleria') score += 380;
            if (target.evolution === 'espinoso')   score -= (ownCount > defenders * 2 ? 60 : 180);
            if (target.evolution === 'tanque')     score += 90;
        }

        if (intel === 'medium') return score;

        // --- CAPA 2: CONCIENCIA ESTRATEGICA (high+) ---
        if (phase === 'early') {
            if (target.owner === 'neutral')     score += 600;
            if (target.owner === playerFaction) score -= 500;
        } else if (phase === 'late') {
            if (target.owner === playerFaction)        score += 900;
            if (this._playerNodes.length <= 2)         score += 1400;
        }

        const ownInTarget = target.counts ? (target.counts[aiFaction] || 0) : 0;
        if (ownInTarget > 5) score += ownInTarget * 3.5;

        if (dist > 600 && this._aiNodes.length <= 2) score -= 350;

        if (this._playerNodes.length > 0 && target.owner !== playerFaction) {
            let minPlayerDist = Infinity;
            for (const pn of this._playerNodes) {
                const d = Math.hypot(pn.x - target.x, pn.y - target.y);
                if (d < minPlayerDist) minPlayerDist = d;
            }
            const myDistToPlayer = Math.min(...this._playerNodes.map(pn =>
                Math.hypot(pn.x - attacker.x, pn.y - attacker.y)
            ));
            if (minPlayerDist < myDistToPlayer * 0.80) score += 180;
        }

        if (intel === 'high') return score;

        // --- CAPA 3: INTELIGENCIA ENJAMBRE (expert+) ---
        for (const [otherFaction, otherTargets] of _factionTargets) {
            if (otherFaction === aiFaction) continue;
            if (!otherTargets.has(target))  continue;

            if (target.owner === playerFaction) {
                score += 500;
            } else {
                score -= 600;
            }
        }

        // Sniping Oportunista: nodo del jugador casi vacio
        if (target.owner === playerFaction && defenders < 10) {
            score += 3000;
        }

        if (intel === 'expert') return score;

        // --- CAPA 4: DOMINIO ABSOLUTO (master) ---

        // 1. Peligros de Nivel (Level Hazards)
        let hazardPenalty = routeResult ? 0 : this._evaluateHazards(target, attacker);
        score -= hazardPenalty;

        // Evitar nodos marcados por el rayo de luz
        if (target.isMarkedForSweep) {
            score -= 200;
            if (this.world && this.world.lightSweeps) {
                for (const sweep of this.world.lightSweeps) {
                    if (sweep.isAlerting) {
                        score -= 20000; // abort mission!
                    }
                }
            }
        }

        // 2. Anti-Momentum (Back-capping)
        if (target.owner === playerFaction) {
            let playerEmigrants = 0;
            for (const u of allUnits) {
                if (u.faction === playerFaction && u.state === 'traveling' && u.homeNode === target) {
                    playerEmigrants++;
                }
            }
            if (playerEmigrants > 30) score += 6000;
            else if (playerEmigrants > 15) score += 2000;
        }

        // 3. Flanqueo Total (Surrounding)
        if (target.owner === playerFaction) {
            let adjacentAINodes = 0;
            for (const n of this._aiNodes) {
                const d = Math.hypot(n.x - target.x, n.y - target.y);
                if (d < 400) adjacentAINodes++;
            }
            if (adjacentAINodes >= 2) score += 1500 * adjacentAINodes;
        }

        // ==========================================
        // AI-4: TIMING AWARENESS
        // ==========================================
        if (this.world) {
            // Post-sweep rush: si una ola ACABA de pasar, ventana de oportunidad
            if (this.world.waterSweeps) {
                for (const sweep of this.world.waterSweeps) {
                    // Si la ola acaba de pasar (no está alertando y el cooldown > 80% restante)
                    if (!sweep.isAlerting && sweep.timeToNext > (sweep.cooldown || 0) * 0.75) {
                        score += 1200; // Bonus por ventana segura post-ola
                    }
                }
            }

            // Barrier sync: en niveles con barreras intermitentes, atacar en la ventana de apertura
            if (this.world.intermittentBarriers) {
                for (const ib of this.world.intermittentBarriers) {
                    // Si la barrera activa actual BLOQUEA nuestra ruta, penalizar
                    const activeBounds = ib.getActiveBounds();
                    if (activeBounds.length > 0) {
                        const gw = this.world.game ? this.world.game.width : 1920;
                        const gh = this.world.game ? this.world.game.height : 1080;
                        for (const b of activeBounds) {
                            if (this._lineIntersectsRect(
                                attacker.x, attacker.y, target.x, target.y,
                                b.x * gw, b.y * gh, b.width * gw, b.height * gh
                            )) {
                                // Barrera bloqueando. ¿Cuánto falta para que cambie?
                                const timeToSwitch = ib.interval - ib.timer;
                                if (timeToSwitch < 3) {
                                    score -= 500; // Esperar un poco, va a cambiar pronto
                                } else {
                                    score -= 8000; // Barrera bloqueará por mucho tiempo
                                }
                            }
                        }
                    }
                }
            }

            // Light sweep timing: evolucionar justo DESPUÉS (ya manejado en _chooseEvolution)
        }

        // ==========================================
        // AI-8: COUNTERPLAY ADAPTATION
        // ==========================================
        const pp = this._playerProfile;
        if (pp) {
            // Si el jugador hace turtle, la AI escala economía y aplasta tarde
            if (pp.aggressionLevel === 'turtle' && phase !== 'early') {
                if (target.owner === 'neutral') score += 800; // Priorizar economía
                if (target.owner === playerFaction) score -= 400; // No apresurarnos, escalamos
            }

            // Si el jugador es hiper-agresivo, la AI espera y contraataca
            if (pp.aggressionLevel === 'aggressive') {
                if (target.owner === playerFaction && defenders < 15) score += 2500; // Contraataque
            }

            // Si el jugador ataca siempre un flanco, reforzar ese lado
            // (esto se usa internamente en la reserva defensiva ya)
        }

        return score;
    }

    // ==========================================
    // AI-8: PLAYER PROFILE TRACKING
    // ==========================================
    _updatePlayerProfile(dt, allUnits, playerFaction) {
        const pp = this._playerProfile;
        if (!pp) return;

        // Detectar turtle: ¿El jugador no expande?
        const currentPlayerNodes = this._playerNodes.length;
        if (currentPlayerNodes <= pp.lastPlayerNodeCount) {
            pp.turtleTimer += dt;
        } else {
            pp.turtleTimer = Math.max(0, pp.turtleTimer - dt * 2); // Decay rápido si expande
        }
        pp.lastPlayerNodeCount = currentPlayerNodes;

        // Clasificar agresividad
        let playerTraveling = 0;
        for (const u of allUnits) {
            if (u.faction === playerFaction && u.state === 'traveling') playerTraveling++;
        }

        if (pp.turtleTimer > 30 && playerTraveling < 10) {
            pp.aggressionLevel = 'turtle';
        } else if (playerTraveling > 50) {
            pp.aggressionLevel = 'aggressive';
        } else {
            pp.aggressionLevel = 'normal';
        }
    }

    // Utilidad: ¿Una línea intersecta un rectángulo?
    _lineIntersectsRect(x1, y1, x2, y2, rx, ry, rw, rh) {
        // Cohen-Sutherland simplificado
        const left = rx, right = rx + rw, top = ry, bottom = ry + rh;
        
        // Si ambos puntos están del mismo lado, no hay intersección
        if ((x1 < left && x2 < left) || (x1 > right && x2 > right)) return false;
        if ((y1 < top && y2 < top) || (y1 > bottom && y2 > bottom)) return false;

        // Si alguno está dentro del rect, intersecta
        if (x1 >= left && x1 <= right && y1 >= top && y1 <= bottom) return true;
        if (x2 >= left && x2 <= right && y2 >= top && y2 <= bottom) return true;

        // Verificar intersección de la línea con los 4 bordes
        const dx = x2 - x1, dy = y2 - y1;
        if (dx === 0 && dy === 0) return false;

        const tLeft   = (left   - x1) / (dx || 1e-10);
        const tRight  = (right  - x1) / (dx || 1e-10);
        const tTop    = (top    - y1) / (dy || 1e-10);
        const tBottom = (bottom - y1) / (dy || 1e-10);

        const tMin = Math.max(Math.min(tLeft, tRight), Math.min(tTop, tBottom));
        const tMax = Math.min(Math.max(tLeft, tRight), Math.max(tTop, tBottom));

        return tMax >= 0 && tMin <= 1 && tMin <= tMax;
    }

    // === CONCIENCIA DE ENTORNO Y MECANICAS (Level Hooks) ===
    _evaluateHazards(target, attacker) {
        const routeResult = this._evaluateRoute(
            attacker,
            target,
            Math.max(1, this._countAt(attacker, attacker.owner || 'enemy')),
            this._navScoreResult
        );
        if (routeResult) {
            if (!routeResult.isViable) return Infinity;
            return (routeResult.projectedCasualties * 12) + (routeResult.suggestedDelay * 120);
        }

        let penalty = 0;

        // Marea Barriente: si detectamos Water Sweeps activos
        if (this.world && this.world.waterSweeps && this.world.waterSweeps.length > 0) {
            const dist = Math.hypot(target.x - attacker.x, target.y - attacker.y);
            const vx = dist > 0 ? ((target.x - attacker.x) / dist) * 60.0 : 0;
            const travelTimeSecs = dist / 60.0;
            const gw = this.world.game ? this.world.game.width : 1920;

            for (const sweep of this.world.waterSweeps) {
                if (sweep.isAlerting || sweep.timeToNext < 3.5) {
                    // Solo penalizar si la trayectoria se interceptará con la franja de agua
                    let willIntersect = false;
                    for (let bar of sweep._activeBars) {
                        if (this._checkSweepCollision(attacker.x, vx, travelTimeSecs, bar.worldX, sweep.speed)) {
                            willIntersect = true;
                            break;
                        }
                    }
                    if (!willIntersect && (sweep._isAlerting || sweep._spawnTimer + sweep.alertDuration < travelTimeSecs)) {
                        let spawnT = sweep._isAlerting ? sweep._alertTimer : sweep._spawnTimer + sweep.alertDuration;
                        if (spawnT < travelTimeSecs) {
                            const barStartX = -(sweep.widthFrac * gw) - (sweep.speed * 4);
                            const antXAtSpawnT = attacker.x + vx * spawnT; 
                            if (this._checkSweepCollision(antXAtSpawnT, vx, travelTimeSecs - spawnT, barStartX, sweep.speed)) {
                                willIntersect = true;
                            }
                        }
                    }
                    
                    if (willIntersect) {
                        penalty += 50000;
                    }
                }
            }
        }

        // Conciencia de Barreras (Nivel 9 y Nivel 11)
        if (this.world) {
            let activeBarriers = [];
            if (this.world.barriers) activeBarriers.push(...this.world.barriers);
            if (this.world.intermittentBarriers) {
                for (let ib of this.world.intermittentBarriers) {
                    const act = ib.getActiveBounds();
                    if (act) activeBarriers.push(...act);
                }
            }

            if (activeBarriers.length > 0) {
                const gw = this.world.game ? this.world.game.width  : 1920;
                const gh = this.world.game ? this.world.game.height : 1080;

                for (const b of activeBarriers) {
                    if (attacker.isMobile) continue;

                const bx = b.x * gw;
                const by = b.y * gh;
                const bw = b.width * gw;
                const bh = b.height * gh;

                const ax = attacker.x, ay = attacker.y;
                const tx = target.x, ty = target.y;

                const interLeft = this._linesIntersect(ax,ay,tx,ty, bx,by, bx,by+bh);
                const interRight = this._linesIntersect(ax,ay,tx,ty, bx+bw,by, bx+bw,by+bh);
                const interTop = this._linesIntersect(ax,ay,tx,ty, bx,by, bx+bw,by);
                const interBot = this._linesIntersect(ax,ay,tx,ty, bx,by+bh, bx+bw,by+bh);

                if (interLeft || interRight || interTop || interBot) {
                        return Infinity; // Bloqueo total
                    }
                }
            }
        }

        return penalty;
    }

    _linesIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
        const den = ((y4-y3)*(x2-x1) - (x4-x3)*(y2-y1));
        if (den === 0) return false;
        const uA = ((x4-x3)*(y1-y3) - (y4-y3)*(x1-x3)) / den;
        const uB = ((x2-x1)*(y1-y3) - (y2-y1)*(x1-x3)) / den;
        return (uA >= 0 && uA <= 1 && uB >= 0 && uB <= 1);
    }

    // === RUSH TEMPRANO ===
    _doRush(aiFaction, allUnits) {
        if (this._playerNodes.length === 0) return;

        let bestTarget = null;
        let bestDist   = Infinity;

        for (const pn of this._playerNodes) {
            for (const an of this._aiNodes) {
                const d = Math.hypot(pn.x - an.x, pn.y - an.y);
                if (d < bestDist) { bestDist = d; bestTarget = pn; }
            }
        }
        if (!bestTarget) return;

        for (const u of allUnits) {
            if (!u.pendingRemoval && u.faction === aiFaction && u.state === 'idle') {
                u.targetNode = bestTarget;
                u.state      = 'traveling';
            }
        }
    }

    // === HELPERS ===
    _countAt(node, faction) {
        return node.counts ? (node.counts[faction] || 0) : 0;
    }

    buyEvolution(node, type, cost, faction, allUnits) {
        if (!node.startEvolution(type)) return;

        if (this.world) {
            CombatManager.killNPower(this.world, node, faction, cost);
            return;
        }

        let remainingCost = cost;
        for (const u of allUnits) {
            if (remainingCost <= 0) break;
            if (!u.pendingRemoval && u.faction === faction
                && u.targetNode === node && u.state === 'idle') {
                u.pendingRemoval = true;
                remainingCost -= (u.power || 1);
            }
        }
    }

    // === MÓDULO A, E & H: SIMULADOR PREDICTIVO ===
    _simulateBattle(attacker, target, sentCount, currentDefenders, aiFaction, playerFaction) {
        const routeResult = this._evaluateRoute(attacker, target, sentCount, this._navExecResult);
        if (routeResult && !routeResult.isViable) return PredictiveCombatSimulator.RESULT_DERROTA;
        if (this.world && this._mentalSandbox && sentCount > 0) {
            return this._mentalSandbox.evaluateAttack(
                this.world,
                attacker,
                target,
                sentCount,
                aiFaction,
                routeResult,
                this._mentalResult
            );
        }

        // 1. Tiempo de viaje (velocidad base ~60px/s)
        const dist = Math.hypot(target.x - attacker.x, target.y - attacker.y);
        const travelTimeSecs = routeResult ? routeResult.projectedTransitTime : (dist / 60.0);

        // 2. Producción Futura del Defensor (Los Neutrales NO producen)
        let futureDefenders = currentDefenders;
        if (target.owner !== 'neutral') {
            let productionRate = 1.0; 
            if (target.type === 'enjambre') productionRate = 2.5;
            if (target.type === 'gigante')  productionRate = 1.8;
            futureDefenders += Math.floor(travelTimeSecs * productionRate);
            futureDefenders = Math.min(target.maxUnits || 100, futureDefenders);
        }

        // 3. Atrición en Ruta por Charcos Estáticos (Módulo E)
        let hazardKills = routeResult ? routeResult.projectedCasualties : 0;
        if (!routeResult && this.world && this.world.hazards) {
            const gw = this.world.game ? this.world.game.width : 1920;
            const gh = this.world.game ? this.world.game.height : 1080;
            for (let hz of this.world.hazards) {
                const hx = hz.x * gw;
                const hy = hz.y * gh;
                const hRadius = hz.radius * gw;

                const lineDist = this._pointLineDist(hx, hy, attacker.x, attacker.y, target.x, target.y);
                if (lineDist < hRadius) {
                    // El enjambre cruza el charco. Tiempo cruzando = diámetro / vel
                    const crossingTime = (2 * hRadius) / 60.0;
                    hazardKills += crossingTime * (hz.dps || 0);
                }
            }
        }

        // 3.5. Módulo H: Intercepción Precisa de Olas Limpiadoras (Water Sweeps)
        if (!routeResult && this.world && this.world.waterSweeps) {
            // Vector de velocidad de la tropa en el eje X
            const vx = ((target.x - attacker.x) / dist) * 60.0;
            const gw = this.world.game ? this.world.game.width : 1920;

            for (let sweep of this.world.waterSweeps) {
                // Predecir colisión con barras *ya* en la pantalla
                for (let bar of sweep._activeBars) {
                    if (this._checkSweepCollision(attacker.x, vx, travelTimeSecs, bar.worldX, sweep.speed)) {
                        return false; // Intercepción mortal inminente (100% kills)
                    }
                }

                // Predecir colisión con barras *próximas a nacer* en el futuro(t < travelTime)
                let spawnT = -1;
                if (sweep._isAlerting) {
                    spawnT = sweep._alertTimer;
                } else if (sweep._spawnTimer + sweep.alertDuration < travelTimeSecs) {
                    spawnT = sweep._spawnTimer + sweep.alertDuration;
                }

                if (spawnT !== -1 && spawnT < travelTimeSecs) {
                    const barStartX = -(sweep.widthFrac * gw) - (sweep.speed * 4); // El offset inicial de water_sweep
                    const antXAtSpawnT = attacker.x + vx * spawnT; // Donde estarán las hormigas cuando nazca la ola
                    if (this._checkSweepCollision(antXAtSpawnT, vx, travelTimeSecs - spawnT, barStartX, sweep.speed)) {
                        return false; 
                    }
                }
            }
        }

        let arrivingAtk = sentCount - hazardKills;
        if (arrivingAtk <= 0) return false;

        // 4. Resolución matemática (Ley de Lanchester simplificada)
        let requiredAdvantage = this._profile.aggressionThreshold || 1.1;
        
        // Si es neutral, podemos ser un poco más eficientes (1.05x)
        if (target.owner === 'neutral') requiredAdvantage = 1.05;

        return arrivingAtk > (futureDefenders * requiredAdvantage);
    }

    _checkSweepCollision(antX, antVx, durationSecs, barX, barSpeed) {
        // ¿Intersectan en el Eje X en algún t dentro de [0, durationSecs]?
        // antX(t) = antX + antVx * t
        // barX(t) = barX + barSpeed * t
        // Math: antX + antVx * t = barX + barSpeed * t  =>  t * (antVx - barSpeed) = barX - antX
        const relV = antVx - barSpeed;
        const relP = barX - antX;
        
        if (Math.abs(relV) < 0.1) return Math.abs(relP) < 50; // Viajan idénticos y superpuestos
        
        const tIntersect = relP / relV;
        return tIntersect >= 0 && tIntersect <= durationSecs;
    }

    _pointLineDist(px, py, x1, y1, x2, y2) {
        const A = px - x1;
        const B = py - y1;
        const C = x2 - x1;
        const D = y2 - y1;
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;
        if (lenSq !== 0) param = dot / lenSq;
        let xx, yy;
        if (param < 0) { xx = x1; yy = y1; }
        else if (param > 1) { xx = x2; yy = y2; }
        else { xx = x1 + param * C; yy = y1 + param * D; }
        const dx = px - xx;
        const dy = py - yy;
        return Math.sqrt(dx * dx + dy * dy);
    }

    // === MÓDULO B & D: AMENAZAS Y RETIRADAS ===
    _detectThreatsAndRetreats(aiFaction, playerFaction, allUnits) {
        // Solo activo para IA superior (High, Expert, Master)
        if (this._profile.targetingIntelligence === 'medium') return;

        // 1. Contabilizar hordas entrantes
        const threats = new Map();
        const playerBases = new Set(); // Bases desde donde el jugador acaba de lanzar su ataque

        for (const u of allUnits) {
            if (u.faction === playerFaction && u.state === 'traveling' && u.targetNode && u.targetNode.owner === aiFaction) {
                const current = threats.get(u.targetNode) || 0;
                threats.set(u.targetNode, current + 1);
                if (u.homeNode) playerBases.add(u.homeNode);
            }
        }

        // 2. Evaluar cada nodo amenazado
        for (const [node, incoming] of threats) {
            const defenders = this._countAt(node, aiFaction);
            const enemiesPresent = (node.counts && node.counts[playerFaction]) ? node.counts[playerFaction] : 0;
            const totalThreat = enemiesPresent + incoming;

            // Retirada Táctica (Módulo B) - Nodo condenado
            if (totalThreat > defenders * 2.5 && defenders < 30) {
                // Evacuar al nodo aliado más cercano
                let bestRefuge = null;
                let minDist = Infinity;
                for (const safe of this._aiNodes) {
                    if (safe === node) continue;
                    const d = Math.hypot(safe.x - node.x, safe.y - node.y);
                    if (d < minDist && !threats.has(safe)) {
                        minDist = d;
                        bestRefuge = safe;
                    }
                }

                if (bestRefuge) {
                    for (const u of allUnits) {
                        if (u.faction === aiFaction && u.targetNode === node && u.state === 'idle') {
                            u.targetNode = bestRefuge;
                            u.state = 'traveling';
                        }
                    }
                }
            } 
            // Llamar Refuerzos (Módulo D)
            else if (incoming > 20) {
                for (const helper of this._aiNodes) {
                    if (helper === node || threats.has(helper)) continue;
                    const helperCount = this._countAt(helper, aiFaction);
                    if (helperCount > helper.maxUnits * 0.45) {
                        // Enviar 35% de sus tropas de reserva
                        const toSend = Math.floor(helperCount * 0.35);
                        let sent = 0;
                        for (const u of allUnits) {
                            if (sent >= toSend) break;
                            if (u.faction === aiFaction && u.targetNode === helper && u.state === 'idle') {
                                u.targetNode = node;
                                u.state = 'traveling';
                                sent++;
                            }
                        }
                    }
                }
            }
        }

        // 3. Contraataque Oportunista / Bait (Solo Master/Brutal)
        if (this._profile.targetingIntelligence === 'master') {
            for (const pb of playerBases) {
                const pbDefenders = (pb.counts && pb.counts[playerFaction]) ? pb.counts[playerFaction] : 0;
                // Si el jugador vació su base para atacar, se la robamos
                if (pbDefenders < 20) {
                    for (const attacker of this._aiNodes) {
                        if (threats.has(attacker)) continue;
                        const available = this._countAt(attacker, aiFaction) * 0.8;
                        if (available > 25) {
                            const projectedResult = this._simulateBattle(attacker, pb, Math.floor(available), pbDefenders, aiFaction, playerFaction);
                            if (projectedResult !== PredictiveCombatSimulator.RESULT_DERROTA
                                && projectedResult !== PredictiveCombatSimulator.RESULT_EMPATE_ESTANCADO) {
                                let sent = 0;
                                const toSend = Math.floor(available);
                                for (const u of allUnits) {
                                    if (sent >= toSend) break;
                                    if (u.faction === aiFaction && u.targetNode === attacker && u.state === 'idle') {
                                        u.targetNode = pb;
                                        u.state = 'traveling';
                                        sent++;
                                    }
                                }
                                break; // Solo enviamos una base a hacer el snipe
                            }
                        }
                    }
                }
            }
        }
    }
}
