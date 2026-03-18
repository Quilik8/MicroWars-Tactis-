import { FACTIONS } from '../campaign/faction_data.js';

export class CombatManager {
    static processCombat(world, nodeIdx, dt, SFX) {
        let node = world.nodes[nodeIdx];
        let prevOwner = node.owner;
        let p = node.power;

        const factionIds = Object.keys(node.counts).filter(f => node.counts[f] > 0);

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
                        
                        // Sistema 1vs1: Cada par de unidades lucha causando daño equitativo
                        let pairings = Math.min(nAttacker, nDefender);
                        
                        // Ventaja abrumadora: Solo se activa cuando se tiene más del doble de tropas
                        let overwhelm = Math.max(0, nAttacker - 2 * nDefender);
                        
                        let baseRate = 0.12; 
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
        let mainAttacker = null;
        let attackerCount = 0;
        
        if (factionIds.length === 1 && factionIds[0] !== node.owner) {
            mainAttacker = factionIds[0];
            attackerCount = node.counts[mainAttacker];
        } else if (factionIds.length > 1) {
            // Find strongest attacker that isn't the owner
            for (let f of factionIds) {
                if (f !== node.owner && node.counts[f] > attackerCount) {
                    mainAttacker = f;
                    attackerCount = node.counts[f];
                }
            }
        }

        if (mainAttacker) {
            // Check if another faction already started a conquest
            if (node.conqueringFaction && node.conqueringFaction !== mainAttacker) {
                // Decay previous conqueror's progress before starting our own
                node.conquestProgress -= 0.5 * dt;
                if (node.conquestProgress <= 0) {
                    node.conquestProgress = 0;
                    node.conqueringFaction = null; // Next frame, mainAttacker will start theirs
                }
            } else {
                // Determinar la cantidad de tropas enemigas en el nodo
                let enemiesCount = 0;
                for (let f in node.counts) {
                    if (f !== mainAttacker) {
                        enemiesCount += node.counts[f];
                    }
                }

                if (enemiesCount > 3) {
                    // Si quedan más de 3 hormigas enemigas, el progreso de conquista se pausa
                    if (node.conquestProgress > 0) {
                        node.conqueringFaction = mainAttacker;
                    }
                } else {
                    // Determinar velocidad de conquista (3 niveles según número de tropas)
                    let conquestSpeed = 0.15; // Tropas normales (100-)
                    if (attackerCount < 50) conquestSpeed = 0.05; // Pocas tropas
                    if (attackerCount > 250) conquestSpeed = 0.35; // Muchas tropas

                    node.conqueringFaction = mainAttacker;
                    node.conquestProgress += conquestSpeed * dt;
                    
                    // Si supera 1.0, el nodo cambia de dueño
                    if (node.conquestProgress >= 1.0) {
                        node.owner = mainAttacker;
                        node.conquestProgress = 0;
                        node.conqueringFaction = null;
                        node.evolution = null; // Pierde evoluciones al ser conquistado
                    }
                }
            }
        } else {
            // Decaer progreso de conquista si pierdes las tropas / no hay atacantes dominantes
            if (node.conquestProgress > 0) {
                node.conquestProgress -= 0.5 * dt;
                if (node.conquestProgress <= 0) {
                    node.conquestProgress = 0;
                    node.conqueringFaction = null;
                }
            }
        }

        // Redraw to ensure ring/color updates reflect
        const currentFactionData = FACTIONS.find(f => f.id === node.owner);
        node.redraw(currentFactionData);

        if (node.owner !== prevOwner) {
            if (SFX) {
                if (node.owner === 'player' || node.owner === 'carpinteras') SFX.capture();
                else if (prevOwner === 'player' || prevOwner === 'carpinteras') SFX.lost();
            }
            for (let n of world.nodes) {
                if (n.tunnelTo === node || n === node) {
                    if (n.type !== 'tunel') n.tunnelTo = null; // Only break logistical tunnels
                }
            }
        }
    }

    static killNPower(world, node, faction, damage) {
        if (damage <= 0) return;
        // Matamos unidades que tengan este nodo como objetivo Y estén cerca o idle
        for (let i = world.allUnits.length - 1; i >= 0 && damage > 0; i--) {
            let u = world.allUnits[i];
            if (u.faction === faction && u.targetNode === node && !u.pendingRemoval) {
                const dx = u.x - node.x;
                const dy = u.y - node.y;
                if (u.state === 'idle' || (dx * dx + dy * dy < node.radius * node.radius * 6.25)) {
                    let hp = u.power || 1;
                    if (damage >= hp) {
                        damage -= hp; u.pendingRemoval = true;
                    } else {
                        if (Math.random() < damage / hp) u.pendingRemoval = true;
                        damage = 0;
                    }
                }
            }
        }
    }
}
