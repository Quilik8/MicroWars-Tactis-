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
     */
    constructor(config = {}) {
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
    }

    setDifficulty(difficulty) {
        if (!DIFFICULTY_PROFILES[difficulty]) return;
        this.difficulty = difficulty;
        this._profile   = { ...DIFFICULTY_PROFILES[difficulty] };
        this._timers = {};
    }

    // === UPDATE ===
    update(dt, nodes, allUnits, aiFaction = 'enemy', playerFaction = 'player') {
        const prof = this._profile;

        if (this._timers[aiFaction] === undefined) {
            this._timers[aiFaction]        = Math.random() * prof.attackInterval;
            this._elapsed[aiFaction]       = 0;
            this._rushDone[aiFaction]      = false;

            if (prof.rushEnabled && Math.random() < prof.rushChance) {
                this._rushScheduled[aiFaction] = 20 + Math.random() * 20;
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

        const phase = this._detectPhase(nodes, aiFaction);

        // Rush temprano
        if (!this._rushDone[aiFaction]
            && this._elapsed[aiFaction] >= this._rushScheduled[aiFaction]
            && this._playerNodes.length > 0) {
            this._doRush(aiFaction, allUnits);
            this._rushDone[aiFaction] = true;
            return;
        }

        // Timer de ciclo de decision
        this._timers[aiFaction] += dt;
        if (this._timers[aiFaction] < prof.attackInterval) return;
        this._timers[aiFaction] = 0;

        _factionTargets.set(aiFaction, new Set());

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
            if (!en.evolution && en.type !== 'tunel' && count >= prof.evolutionMinCount) {
                if (Math.random() < prof.evolutionChance) {
                    this._chooseEvolution(en, count, phase, aiFaction, allUnits);
                }
            }

            // B. Tuneles logisticos
            if (!prof.tunnelEnabled || en.type === 'tunel') continue;

            if (en.tunnelTo && this._countAt(en.tunnelTo, aiFaction) >= en.tunnelTo.maxUnits * 0.88) {
                en.tunnelTo = null;
            }
            if (en.tunnelTo && en.tunnelTo.isMarkedForSweep && typeof window !== 'undefined' && window.world && window.world.lightSweeps && window.world.lightSweeps.length > 0) {
                const sweep = window.world.lightSweeps[0];
                if (sweep.isAlerting) {
                    en.tunnelTo = null;
                }
            }

            if (count > en.maxUnits * 0.55 && !en.tunnelTo) {
                let bestFront = null;
                let bestDist  = Infinity;

                for (const fn of this._aiNodes) {
                    if (fn === en) continue;
                    // En 'master', permite sobre-saturar tuneles para empujar mas rapido
                    if (prof.targetingIntelligence !== 'master' && this._countAt(fn, aiFaction) >= fn.maxUnits * 0.80) continue;
                    if (fn.isMarkedForSweep) continue; // Evitar tuneles hacia nodos marcados por el sol

                    let minDistPlayer = Infinity;
                    for (const pn of this._playerNodes) {
                        const d = Math.hypot(pn.x - fn.x, pn.y - fn.y);
                        if (d < minDistPlayer) minDistPlayer = d;
                    }
                    if (minDistPlayer < bestDist) {
                        bestDist  = minDistPlayer;
                        bestFront = fn;
                    }
                }
                if (bestFront) en.tunnelTo = bestFront;
            }
        }
    }

    // -- Seleccion de evolucion segun fase y posicion --
    _chooseEvolution(node, count, phase, aiFaction, allUnits) {
        if (node.isMarkedForSweep) return; // NUNCA evolucionar un nodo condenado al sol

        let minDistPlayer = Infinity;
        for (const pn of this._playerNodes) {
            const d = Math.hypot(pn.x - node.x, pn.y - node.y);
            if (d < minDistPlayer) minDistPlayer = d;
        }
        const isFrontline = minDistPlayer < 450;

        if (phase === 'early') {
            if (count >= this.evoCosts.espinoso) {
                this.buyEvolution(node, 'espinoso', this.evoCosts.espinoso, aiFaction, allUnits);
            }
        } else if (isFrontline) {
            if (count >= this.evoCosts.artilleria && Math.random() < 0.55) {
                this.buyEvolution(node, 'artilleria', this.evoCosts.artilleria, aiFaction, allUnits);
            } else if (count >= this.evoCosts.espinoso) {
                this.buyEvolution(node, 'espinoso', this.evoCosts.espinoso, aiFaction, allUnits);
            }
        } else {
            if (count >= this.evoCosts.tanque) {
                this.buyEvolution(node, 'tanque', this.evoCosts.tanque, aiFaction, allUnits);
            }
        }
    }

    // === ATAQUES ESTRATEGICOS ===
    _decideAttacks(phase, aiFaction, playerFaction, allUnits) {
        const prof       = this._profile;
        const myTargets  = _factionTargets.get(aiFaction) || new Set();

        for (const attacker of this._aiNodes) {
            const count     = this._countAt(attacker, aiFaction);
            const needsDump = count >= attacker.maxUnits - 10;

            if (count < 15 && !needsDump) continue;

            let bestTarget  = null;
            let bestScore   = -Infinity;

            for (const target of this._targetNodes) {
                const score = this._scoreTarget(
                    target, attacker, count, aiFaction, playerFaction, phase, needsDump, allUnits
                );
                if (score > bestScore) {
                    bestScore  = score;
                    bestTarget = target;
                }
            }

            if (!bestTarget || bestScore === -Infinity) continue;

            myTargets.add(bestTarget);
            _factionTargets.set(aiFaction, myTargets);

            // Enviar tropas
            let ratio = prof.sendRatio;

            // Ataques de precision (Hard/Brutal):
            if (ratio === 'dynamic') {
                let targetDefenders = 0;
                for (const f in bestTarget.counts) {
                    if (f !== aiFaction) targetDefenders += (bestTarget.counts[f] || 0);
                }
                const needed = Math.floor((targetDefenders + 1) * prof.aggressionThreshold * 1.3);
                ratio = Math.min(0.85, Math.max(0.15, needed / count));
            }

            const activeRatio = needsDump ? prof.dumpRatio : ratio;
            const toSend = Math.max(1, Math.floor(count * activeRatio));
            let sent = 0;

            for (const u of allUnits) {
                if (sent >= toSend) break;
                if (!u.pendingRemoval
                    && u.faction === aiFaction
                    && u.targetNode === attacker
                    && u.state === 'idle') {
                    u.targetNode = bestTarget;
                    u.state      = 'traveling';
                    sent++;
                }
            }
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

        if (target.owner === 'neutral') {
            score += 650;
            let defs = 0;
            for (const f in target.counts) {
                if (f !== aiFaction) defs += (target.counts[f] || 0);
            }
            if (defs < 8) score += 1000;
        }

        // --- CAPA 1: CONCIENCIA TACTICA (medium+) ---
        let defenders = 0;
        for (const f in target.counts) {
            if (f !== aiFaction) defenders += (target.counts[f] || 0);
        }

        // Módulo C: Reserva Defensiva
        let reserveRatio = 0.0;
        if (phase === 'early') reserveRatio = 0.25;
        else if (phase === 'mid') reserveRatio = 0.15;
        else if (phase === 'late' && this._playerNodes.length * 2 < this._aiNodes.length) reserveRatio = 0.05;
        const availableAttackers = Math.max(1, Math.floor(ownCount * (1.0 - reserveRatio)));

        if (!needsDump) {
            // Módulo A, E y H: Simulador Predictivo con Atrición (ahora incluye Neutrales)
            const isViable = this._simulateBattle(attacker, target, availableAttackers, defenders, aiFaction, playerFaction);
            if (!isViable) return -Infinity; // Abortar ataque suicida
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
        let hazardPenalty = this._evaluateHazards(target, attacker);
        score -= hazardPenalty;

        // Evitar nodos marcados por el rayo de luz
        if (target.isMarkedForSweep) {
            score -= 200; // Penalidad ligera táctica para preferir nodos seguros
            if (typeof window !== 'undefined' && window.world && window.world.lightSweeps) {
                for (const sweep of window.world.lightSweeps) {
                    if (sweep.isAlerting) {
                        score -= 20000; // abort mission!
                    }
                }
            }
        }

        // 2. Anti-Momentum (Back-capping): castigar nodos vaciados por el jugador
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

        // 3. Flanqueo Total (Surrounding): multiples bases AI adyacentes al target
        if (target.owner === playerFaction) {
            let adjacentAINodes = 0;
            for (const n of this._aiNodes) {
                const d = Math.hypot(n.x - target.x, n.y - target.y);
                if (d < 400) adjacentAINodes++;
            }
            if (adjacentAINodes >= 2) score += 1500 * adjacentAINodes;
        }

        return score;
    }

    // === CONCIENCIA DE ENTORNO Y MECANICAS (Level Hooks) ===
    _evaluateHazards(target, attacker) {
        let penalty = 0;

        // Marea Barriente: si detectamos Water Sweeps activos
        if (typeof window !== 'undefined' && window.world
            && window.world.waterSweeps && window.world.waterSweeps.length > 0) {
            for (const sweep of window.world.waterSweeps) {
                if (sweep.isAlerting || sweep.timeToNext < 3.5) {
                    penalty += 50000;
                }
            }
        }

        // Conciencia de Barreras (Nivel 9 y Nivel 11)
        if (typeof window !== 'undefined' && window.world) {
            let activeBarriers = [];
            if (window.world.barriers) activeBarriers.push(...window.world.barriers);
            if (window.world.intermittentBarriers) {
                for (let ib of window.world.intermittentBarriers) {
                    const act = ib.getActiveBounds();
                    if (act) activeBarriers.push(...act);
                }
            }

            if (activeBarriers.length > 0) {
                const gw = window.world.game ? window.world.game.width  : window.innerWidth;
                const gh = window.world.game ? window.world.game.height : window.innerHeight;

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
        node.evolution = type;
        if (type === 'artilleria') node.artilleryInterval = 1.0;
        node.redraw();

        let killed = 0;
        for (const u of allUnits) {
            if (killed >= cost) break;
            if (!u.pendingRemoval && u.faction === faction
                && u.targetNode === node && u.state === 'idle') {
                u.pendingRemoval = true;
                killed++;
            }
        }
    }

    // === MÓDULO A, E & H: SIMULADOR PREDICTIVO ===
    _simulateBattle(attacker, target, sentCount, currentDefenders, aiFaction, playerFaction) {
        // 1. Tiempo de viaje (velocidad base ~60px/s)
        const dist = Math.hypot(target.x - attacker.x, target.y - attacker.y);
        const travelTimeSecs = dist / 60.0; // FIX: antes era dist * 32.0 lo cual generaba horas de viaje simulado

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
        let hazardKills = 0;
        if (typeof window !== 'undefined' && window.world && window.world.hazards) {
            const gw = window.world.game ? window.world.game.width : window.innerWidth;
            const gh = window.world.game ? window.world.game.height : window.innerHeight;
            for (let hz of window.world.hazards) {
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
        if (typeof window !== 'undefined' && window.world && window.world.waterSweeps) {
            // Vector de velocidad de la tropa en el eje X
            const vx = ((target.x - attacker.x) / dist) * 60.0;
            const gw = window.world.game ? window.world.game.width : 1920;

            for (let sweep of window.world.waterSweeps) {
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
                            const isViable = this._simulateBattle(attacker, pb, Math.floor(available), pbDefenders, aiFaction, playerFaction);
                            if (isViable) {
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
