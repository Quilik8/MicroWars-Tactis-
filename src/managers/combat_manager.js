import { FACTIONS } from '../campaign/faction_data.js';
import {
    applyDamageToComposition,
    deriveHeavyBodies,
    deriveLightBodies
} from '../simulation/deterministic_rules.js';

// Cache de factionData por id para evitar FACTIONS.find() en el hot path
const _factionCache = {};
function getFactionData(id) {
    if (!_factionCache[id]) {
        _factionCache[id] = FACTIONS.find(f => f.id === id) || null;
    }
    return _factionCache[id];
}

export class CombatManager {
    static processCombat(world, nodeIdx, dt, SFX) {
        let node = world.nodes[nodeIdx];
        let prevOwner = node.owner;
        // Capturar conquestProgress antes de la lógica para detectar
        // el frame en que el anillo pasa de >0 a 0 (necesita un redraw final).
        const prevConquestProgress = node.conquestProgress;
        // node.power se inicializa en updateNodeCounts; en el primer frame puede ser undefined
        let p = node.power || {};

        // Recopilar facciones activas SIN Object.keys/filter (sin allocations)
        // Reutilizamos un buffer estático para evitar crear un array por tick
        CombatManager._factionBuf.length = 0;
        for (const f in node.counts) {
            if (node.counts[f] > 0) CombatManager._factionBuf.push(f);
        }
        const factionIds = CombatManager._factionBuf;

        if (factionIds.length > 1) {
            node.combatTimer += dt;
            if (node.combatTimer >= world.combatInterval) {
                node.combatTimer = 0;

                // Daño recíproco y Trade 1v1
                for (let f of factionIds) {
                    let totalDamage = 0;
                    for (let otherF of factionIds) {
                        if (f === otherF) continue;
                        
                        let nAttacker = p[otherF] || 0;
                        let nDefender = p[f] || 0;
                        
                        let pairings = Math.min(nAttacker, nDefender);
                        let overwhelm = Math.max(0, nAttacker - 2 * nDefender);
                        
                        let baseRate  = 0.12; 
                        let bonusRate = 0.08;
                        
                        totalDamage += (pairings * baseRate) + (overwhelm * bonusRate);
                    }
                    CombatManager.killNPower(world, node, f, totalDamage);
                }
            }
        } else {
            node.combatTimer = 0;
        }

        // Control de Conquista por tiempos (El Anillo)
        let mainAttacker  = null;
        let attackerCount = 0;
        
        if (factionIds.length === 1 && factionIds[0] !== node.owner) {
            mainAttacker  = factionIds[0];
            attackerCount = node.counts[mainAttacker];
        } else if (factionIds.length > 1) {
            for (let f of factionIds) {
                if (f !== node.owner && node.counts[f] > attackerCount) {
                    mainAttacker  = f;
                    attackerCount = node.counts[f];
                }
            }
        }

        if (mainAttacker) {
            if (node.conqueringFaction && node.conqueringFaction !== mainAttacker) {
                node.conquestProgress -= 0.5 * dt;
                if (node.conquestProgress <= 0) {
                    node.conquestProgress  = 0;
                    node.conqueringFaction = null;
                }
            } else {
                let enemiesCount = 0;
                for (let f in node.counts) {
                    if (f !== mainAttacker) enemiesCount += node.counts[f];
                }

                if (enemiesCount > 3) {
                    if (node.conquestProgress > 0) node.conqueringFaction = mainAttacker;
                } else {
                    let conquestSpeed = 0.15;
                    if (attackerCount < 50)  conquestSpeed = 0.05;
                    if (attackerCount > 250) conquestSpeed = 0.35;

                    node.conqueringFaction  = mainAttacker;
                    node.conquestProgress  += conquestSpeed * dt;
                    
                    if (node.conquestProgress >= 1.0) {
                        node.owner             = mainAttacker;
                        node.conquestProgress  = 0;
                        node.conqueringFaction = null;
                    }
                }
            }
        } else {
            if (node.conquestProgress > 0) {
                node.conquestProgress -= 0.5 * dt;
                if (node.conquestProgress <= 0) {
                    node.conquestProgress  = 0;
                    node.conqueringFaction = null;
                }
            }
        }

        // Redraw condicional — solo cuando hay cambio visual real que combat gestiona:
        //   · owner cambió         → nuevo color de nodo
        //   · conquestProgress > 0 → el arco de conquista necesita animarse cada frame
        //   · prevConquest > 0     → un redraw final para borrar el arco cuando llega a 0
        // El sweep mark (Nivel 8) lo redibuja node.update() cada frame (Pass 1) — no aquí.
        // El flash lo redibuja node.update() al activarlo y al expirar — no aquí.
        const needsRedraw = node.owner !== prevOwner
            || node.conquestProgress > 0
            || prevConquestProgress > 0;
        if (needsRedraw) {
            node.redraw(getFactionData(node.owner));
        }

        if (node.owner !== prevOwner) {
            node.combatDamageCarry = null;
            node.resetEvolutionState();
            if (SFX) {
                if (node.owner === 'player' || node.owner === 'carpinteras') SFX.capture();
                else if (prevOwner === 'player' || prevOwner === 'carpinteras') SFX.lost();
            }
            for (let n of world.nodes) {
                if (n.tunnelTo === node || n === node) {
                    if (n.type !== 'tunel') n.tunnelTo = null;
                }
            }
        }
    }

    static killNPower(world, node, faction, damage) {
        if (damage <= 0) return;
        if (!node.combatDamageCarry) node.combatDamageCarry = {};

        const bodyCount = node.counts ? (node.counts[faction] || 0) : 0;
        if (bodyCount <= 0) {
            node.combatDamageCarry[faction] = 0;
            return;
        }

        const powerCount = node.power ? (node.power[faction] || bodyCount) : bodyCount;
        const lightBodies = deriveLightBodies(bodyCount, powerCount);
        const heavyBodies = deriveHeavyBodies(bodyCount, powerCount);
        const carry = node.combatDamageCarry[faction] || 0;

        applyDamageToComposition(lightBodies, heavyBodies, carry, damage, CombatManager._damageScratch);
        node.combatDamageCarry[faction] = CombatManager._damageScratch.damageCarry;

        let killLight = CombatManager._damageScratch.killedLight | 0;
        let killHeavy = CombatManager._damageScratch.killedHeavy | 0;
        if (killLight <= 0 && killHeavy <= 0) return;

        for (let i = world.allUnits.length - 1; i >= 0 && killLight > 0; i--) {
            const u = world.allUnits[i];
            if (!u || u.pendingRemoval || u.faction !== faction || u.targetNode !== node) continue;
            if ((u.power || 1) > 1) continue;

            const dx = u.x - node.x;
            const dy = u.y - node.y;
            if (u.state !== 'idle' && (dx * dx + dy * dy >= node.radius * node.radius * 6.25)) continue;

            u.pendingRemoval = true;
            killLight--;
        }

        for (let i = world.allUnits.length - 1; i >= 0 && killHeavy > 0; i--) {
            const u = world.allUnits[i];
            if (!u || u.pendingRemoval || u.faction !== faction || u.targetNode !== node) continue;
            if ((u.power || 1) <= 1) continue;

            const dx = u.x - node.x;
            const dy = u.y - node.y;
            if (u.state !== 'idle' && (dx * dx + dy * dy >= node.radius * node.radius * 6.25)) continue;

            u.pendingRemoval = true;
            killHeavy--;
        }

        for (let i = world.allUnits.length - 1; i >= 0 && (killLight > 0 || killHeavy > 0); i--) {
            const u = world.allUnits[i];
            if (!u || u.pendingRemoval || u.faction !== faction || u.targetNode !== node) continue;

            const dx = u.x - node.x;
            const dy = u.y - node.y;
            if (u.state !== 'idle' && (dx * dx + dy * dy >= node.radius * node.radius * 6.25)) continue;

            u.pendingRemoval = true;
            if ((u.power || 1) > 1) killHeavy--;
            else killLight--;
        }
    }
}

// Buffer estático compartido para factionIds — evita allocations en el hot path
CombatManager._factionBuf = [];
CombatManager._damageScratch = {
    lightBodies: 0,
    heavyBodies: 0,
    damageCarry: 0,
    killedLight: 0,
    killedHeavy: 0,
    killedBodies: 0,
    killedPower: 0
};
