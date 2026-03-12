/**
 * AI Manager for MicroWars (Skirmish AI)
 * FIX #11: Eliminados filter()/sort()/Math.min(...map()) en el hot path.
 * Se usan bucles directos para evitar allocations y GC pressure.
 */
export class AIManager {
    constructor(config) {
        this.attackInterval = config.attackInterval || 6;
        this.timer = 0;
        // Buffers reutilizables para evitar allocations en el hot path
        this._aiNodes = [];
        this._targetNodes = [];
        this._playerNodes = [];
        this._frontlines = [];
    }

    update(dt, nodes, allUnits, aiFaction = 'enemy', playerFaction = 'player') {
        this.timer += dt;
        if (this.timer < this.attackInterval) return;
        this.timer = 0;

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

        const countAt = (node, faction) => node.counts ? (node.counts[faction] || 0) : 0;

        // 1. TÚNELES LOGÍSTICOS IA
        for (let en of this._aiNodes) {
            let count = countAt(en, aiFaction);
            if (count > en.maxUnits * 0.6 && !en.tunnelTo) {
                // Buscar el nodo IA más cercano al frente del jugador con espacio disponible
                let bestFront = null;
                let bestDist = Infinity;

                for (let fn of this._aiNodes) {
                    if (fn === en || countAt(fn, aiFaction) >= fn.maxUnits * 0.85) continue;
                    // Distancia al nodo del jugador más cercano
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

                if (count * 0.6 > defenders || target.owner === 'neutral' || needsToDump) {
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
}
