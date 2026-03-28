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

            if (count > en.maxUnits * 0.55 && !en.tunnelTo) {
                let bestFront = null;
                let bestDist  = Infinity;

                for (const fn of this._aiNodes) {
                    if (fn === en) continue;
                    // En 'master', permite sobre-saturar tuneles para empujar mas rapido
                    if (prof.targetingIntelligence !== 'master' && this._countAt(fn, aiFaction) >= fn.maxUnits * 0.80) continue;

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

        if (!needsDump && target.owner !== 'neutral') {
            const ratio = ownCount / (defenders + 1);
            if (ratio < prof.aggressionThreshold) return -Infinity;
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
        const hazardPenalty = this._evaluateHazards(target, attacker);
        score -= hazardPenalty;

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
                if (sweep.timer !== undefined && sweep.timer < 3.5) {
                    penalty += 50000;
                }
            }
        }

        // Conciencia de Barreras (Level 9)
        if (typeof window !== 'undefined' && window.world
            && window.world.barriers && window.world.barriers.length > 0) {
            const gw = window.world.game ? window.world.game.width  : window.innerWidth;
            const gh = window.world.game ? window.world.game.height : window.innerHeight;

            for (const b of window.world.barriers) {
                if (attacker.isMobile) continue;

                const bx = b.x * gw;
                const by = b.y * gh;
                const bw = b.width * gw;
                const bh = b.height * gh;

                const ax = attacker.x, ay = attacker.y;
                const tx = target.x, ty = target.y;

                const minX = Math.min(ax, tx), maxX = Math.max(ax, tx);
                const minY = Math.min(ay, ty), maxY = Math.max(ay, ty);

                if (maxX > bx && minX < bx + bw && maxY > by && minY < by + bh) {
                    penalty += 8000;
                }
            }
        }

        return penalty;
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
}
