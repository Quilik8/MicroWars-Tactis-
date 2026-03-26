/**
 * AI Manager for MicroWars (Skirmish AI)
 * FIX #11: Eliminados filter()/sort()/Math.min(...map()) en el hot path.
 * Se usan bucles directos para evitar allocations y GC pressure.
 *
 * FIX Pass4: Timer por facción — antes las 5 facciones compartían un único
 * this.timer, por lo que todas atacaban exactamente en el mismo tick.
 * Ahora cada facción tiene su propio contador en this._timers[faction],
 * inicializado con un offset aleatorio para que los ataques se distribuyan
 * de forma natural a lo largo del ciclo en vez de llegar en avalancha.
 */
export class AIManager {
    constructor(config) {
        this.attackInterval = config.attackInterval || 6;
        // _timers: objeto plano { [factionId]: number } — inicializado
        // con offset aleatorio la primera vez que se ve cada facción.
        this._timers = {};
        // Buffers reutilizables para evitar allocations en el hot path
        this._aiNodes = [];
        this._targetNodes = [];
        this._playerNodes = [];
        this._frontlines = [];

        // Costos conocidos de evolución (duplicado temporal para uso rápido sin depender de Entity)
        this.evoCosts = { espinoso: 30, artilleria: 40, tanque: 35 };
    }

    update(dt, nodes, allUnits, aiFaction = 'enemy', playerFaction = 'player') {
        // Inicializar el timer de esta facción con un offset aleatorio la primera
        // vez que se ve — garantiza que las 5 facciones no ataquen sincronizadas.
        if (this._timers[aiFaction] === undefined) {
            this._timers[aiFaction] = Math.random() * this.attackInterval;
        }

        this._timers[aiFaction] += dt;
        if (this._timers[aiFaction] < this.attackInterval) return;
        this._timers[aiFaction] = 0;

        // Reusar arrays del buffer — limpiar sin crear nuevos
        this._aiNodes.length = 0;
        this._targetNodes.length = 0;
        this._playerNodes.length = 0;

        for (let n of nodes) {
            if (n.owner === aiFaction) this._aiNodes.push(n);
            else this._targetNodes.push(n);
            if (n.owner === playerFaction) this._playerNodes.push(n);
        }

        if (this._aiNodes.length === 0) return;

        const countAt = (node, faction) => node.population ? (node.population[faction] || 0) : 0;

        // 1. GESTIÓN DE NODOS PROPIOS (Logística y Evolución)
        for (let en of this._aiNodes) {
            let count = countAt(en, aiFaction);

            // A) Adquirir Evoluciones
            if (!en.evolution && en.type !== 'tunel' && count > 60) {
                // Determinar si es nodo "Frontline" (cerca de enemigos) o "Backline" (lejos)
                let minDistToEnemy = Infinity;
                for (let pn of this._playerNodes) {
                    const d = Math.hypot(pn.x - en.x, pn.y - en.y);
                    if (d < minDistToEnemy) minDistToEnemy = d;
                }

                if (minDistToEnemy < 400) {
                    // Cerca del frente -> Defensivo
                    if (count >= this.evoCosts.artilleria && Math.random() < 0.5) {
                        this.buyEvolution(en, 'artilleria', this.evoCosts.artilleria, aiFaction, allUnits);
                    } else if (count >= this.evoCosts.espinoso) {
                        this.buyEvolution(en, 'espinoso', this.evoCosts.espinoso, aiFaction, allUnits);
                    }
                } else {
                    // Lejos del frente -> Producción de vida/daño pesado
                    if (count >= this.evoCosts.tanque) {
                        this.buyEvolution(en, 'tanque', this.evoCosts.tanque, aiFaction, allUnits);
                    }
                }
            }

            // B) Logística de Túneles
            if (en.type !== 'tunel') {
                if (en.tunnelTo) {
                    // Cancelar túnel si el destino está lleno
                    if (countAt(en.tunnelTo, aiFaction) >= en.tunnelTo.maxUnits * 0.90) {
                        en.tunnelTo = null;
                    }
                }

                // Crear nuevo túnel si tenemos exceso de tropas
                if (count > en.maxUnits * 0.6 && !en.tunnelTo) {
                    let bestFront = null;
                    let bestDist = Infinity;

                    for (let fn of this._aiNodes) {
                        if (fn === en || countAt(fn, aiFaction) >= fn.maxUnits * 0.85) continue;
                        let minDistToPlayer = Infinity;
                        for (let pn of this._playerNodes) {
                            const d = Math.hypot(pn.x - fn.x, pn.y - fn.y);
                            if (d < minDistToPlayer) minDistToPlayer = d;
                        }
                        if (minDistToPlayer < bestDist) {
                            bestDist = minDistToPlayer;
                            bestFront = fn;
                        }
                    }
                    if (bestFront) en.tunnelTo = bestFront;
                }
            }
        }

        // 2. ATAQUES ESTRATÉGICOS
        for (let attacker of this._aiNodes) {
            let count = countAt(attacker, aiFaction);
            let needsToDump = count >= attacker.maxUnits - 10;
            if (count < 20 && !needsToDump) continue;

            let bestTarget = null;
            let bestScore = -Infinity;

            for (let target of this._targetNodes) {
                let dist = Math.hypot(target.x - attacker.x, target.y - attacker.y);
                let defenders = 0;
                for (let f in target.counts) {
                    if (f !== aiFaction) defenders += (target.counts[f] || 0);
                }

                let score = 10000 / (dist + 1);
                score -= defenders * 3;
                if (target.type === 'enjambre') score += 150;
                if (target.type === 'gigante') score += 80;

                // Expansión Agresiva Temprana: Extra bonificación si es neutral y está casi vacío
                if (target.owner === 'neutral') {
                    score += 500;
                    if (defenders < 10) score += 800;
                }

                // Evaluar la ventaja matemática (solo atacamos si tenemos al menos el 70% de la fuerza enemiga, 
                // o si estamos al máximo de capacidad y necesitamos escupir tropas)
                if ((count * 0.7 > defenders) || target.owner === 'neutral' || needsToDump) {
                    if (score > bestScore) {
                        bestScore = score;
                        bestTarget = target;
                    }
                }
            }

            if (bestTarget) {
                let sent = 0;
                let toSend = Math.max(1, Math.floor(count * (needsToDump ? 0.8 : 0.5)));
                for (let u of allUnits) {
                    if (sent >= toSend) break;
                    if (!u.pendingRemoval && u.faction === aiFaction && u.targetNode === attacker && u.state === 'idle') {
                        u.targetNode = bestTarget;
                        u.state = 'traveling';
                        sent++;
                    }
                }
            }
        }
    }

    buyEvolution(node, type, cost, faction, allUnits) {
        node.evolution = type;
        if (type === 'artilleria') node.artilleryInterval = 1.0;
        node.redraw();

        let killed = 0;
        for (let u of allUnits) {
            if (killed >= cost) break;
            if (!u.pendingRemoval && u.faction === faction && u.targetNode === node && u.state === 'idle') {
                u.pendingRemoval = true;
                killed++;
            }
        }
    }
}
