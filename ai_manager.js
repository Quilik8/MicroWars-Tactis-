/**
 * AI Manager for MicroWars (Skirmish AI)
 */
export class AIManager {
    constructor(config) {
        this.attackInterval = config.attackInterval || 6;
        this.timer = 0;
    }

    update(dt, nodes, allUnits) {
        this.timer += dt;
        if (this.timer < this.attackInterval) return;
        this.timer = 0;

        const enemyNodes = nodes.filter(n => n.owner === 'enemy');
        if (enemyNodes.length === 0) return;
        const otherNodes = nodes.filter(n => n.owner !== 'enemy');

        // Helper local para conteo rápido (sin depender de main.js)
        const countAt = (node, faction) => node.counts ? (node.counts[faction] || 0) : 0;

        // 1. TÚNELES LOGÍSTICOS IA
        for (let en of enemyNodes) {
            let count = countAt(en, 'enemy');
            if (count > en.maxUnits * 0.6 && !en.tunnelTo) {
                let frontlines = enemyNodes.filter(fn => fn !== en && countAt(fn, 'enemy') < fn.maxUnits * 0.85);
                if (frontlines.length > 0) {
                    let playerNodes = nodes.filter(n => n.owner === 'player');
                    if (playerNodes.length > 0) {
                        frontlines.sort((a, b) => {
                            let distA = Math.min(...playerNodes.map(p => Math.hypot(p.x - a.x, p.y - a.y)));
                            let distB = Math.min(...playerNodes.map(p => Math.hypot(p.x - b.x, p.y - b.y)));
                            return distA - distB;
                        });
                        en.tunnelTo = frontlines[0];
                    }
                }
            }
        }

        // 2. ATAQUES ESTRATÉGICOS
        for (let attacker of enemyNodes) {
            let count = countAt(attacker, 'enemy');
            let needsToDump = count >= attacker.maxUnits - 10;
            if (count < 20 && !needsToDump) continue;

            if (otherNodes.length > 0) {
                let bestTarget = null;
                let bestScore = -Infinity;

                for (let target of otherNodes) {
                    let dist = Math.hypot(target.x - attacker.x, target.y - attacker.y);
                    let defenders = (target.counts.player || 0) + (target.counts.enemy || 0) + (target.counts.neutral || 0);
                    // Nota: el AI original sumaba countAt(target, target.owner) + countAt(target, 'neutral')
                    // pero para simplificar aqui usamos total presence de otros

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
                    // Seleccionar unidades idle del atacante
                    let sent = 0;
                    let toSend = Math.max(1, Math.floor(count * (needsToDump ? 0.8 : 0.5)));
                    for (let u of allUnits) {
                        if (sent >= toSend) break;
                        if (!u.pendingRemoval && u.faction === 'enemy' && u.targetNode === attacker && u.state === 'idle') {
                            u.targetNode = bestTarget;
                            u.state = 'traveling';
                            sent++;
                        }
                    }
                }
            }
        }
    }
}
