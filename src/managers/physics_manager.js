import { SpatialHashGrid } from '../core/logic_grid.js';
import { Node } from '../entities/node.js';
import { CombatManager } from './combat_manager.js';

export class PhysicsManager {
    static updateGrid(world) {
        if (world.grid.boundsWidth !== world.game.width || world.grid.boundsHeight !== world.game.height) {
            world.grid = new SpatialHashGrid(world.game.width, world.game.height, world.gridSize, 10000);
        }
        if (world.navigation && world.navigation.store) {
            world.grid.setSurfaceStore(world.navigation.store);
        }
        world.grid.clear();
        world.travelingIds.length = 0;

        for (let i = 0; i < world.allUnits.length; i++) {
            let u = world.allUnits[i];
            if (u.pendingRemoval) continue;
            world.grid.insert(i, u.x | 0, u.y | 0);
            if (u.state === 'traveling') {
                world.travelingIds.push(i);
            }
        }
    }

    static updatePhysics(world, dt) {
        // Traveling units
        for (let i = 0; i < world.travelingIds.length; i++) {
            let u = world.allUnits[world.travelingIds[i]];
            if (!u.targetNode) continue;
            let targetR = u.targetNode.radius;
            let dx = u.targetNode.x - u.x;
            let dy = u.targetNode.y - u.y;
            if (dx * dx + dy * dy < (targetR * 4) * (targetR * 4)) {
                world.grid.findNear(u.x, u.y, 30, world.neighbors);
            } else {
                world.neighbors.length = 0;
            }
            u.updateForces(
                dt,
                u.targetNode.x,
                u.targetNode.y,
                targetR,
                world.neighbors,
                world.allUnits,
                world.grid,
                world.navigation ? world.navigation.localAvoidanceSolver : null
            );
        }

        // Idle units (orbit)
        for (let u of world.allUnits) {
            if (u.state !== 'idle' || !u.targetNode) continue;
            let tn = u.targetNode;
            u.personalTheta += dt * (0.3 + u.personalR * 0.5) * (u.faction === 'player' ? 1 : -1);
            let px = tn.x + Math.cos(u.personalTheta) * u.personalR * tn.radius;
            let py = tn.y + Math.sin(u.personalTheta) * u.personalR * tn.radius;
            let hDx = px - u.x, hDy = py - u.y;
            let distH = Math.sqrt(hDx * hDx + hDy * hDy);
            
            // Si el nodo se mueve, aplicar fuerza adicional para "arrastrar" a la hormiga
            if (tn.isMobile) {
               u.x += tn.vx * dt;
               u.y += tn.vy * dt;
            }

            if (distH > 0.5) {
                let factor = Math.min(distH / 15, 1.0) * 0.6;
                u.vx = u.vx * 0.82 + (hDx / distH) * u.speed * factor * 0.15;
                u.vy = u.vy * 0.82 + (hDy / distH) * u.speed * factor * 0.15;
            } else {
                u.vx *= 0.5; u.vy *= 0.5;
            }
            if (u.vx !== 0 || u.vy !== 0) u.angle = Math.atan2(u.vy, u.vx);
        }

        for (let u of world.allUnits) u.updatePosition(dt);

        this.resolveBarriers(world);       // ← Barrera de cristal (Nivel 9)
        this.processLevelLogic(world, dt);
    }

    static processLevelLogic(world, dt) {

        // Mover nodos móviles (Level 5 Orbital)
        for (let n of world.nodes) {
            if (n.isMobile) {
                if (!n.orbitAngle) n.orbitAngle = 0;
                n.orbitAngle += n.orbitSpeed * dt;
                
                let oldX = n.x;
                let oldY = n.y;
                
                n.x = (n.orbitAnchorX + Math.cos(n.orbitAngle) * n.orbitRadiusX) * world.game.width;
                n.y = (n.orbitAnchorY + Math.sin(n.orbitAngle) * n.orbitRadiusY) * world.game.height;
                
                n.vx = (n.x - oldX) / dt;
                n.vy = (n.y - oldY) / dt;
                if (world.navigation && world.navigation.store && n.navIndex != null) {
                    world.navigation.store.nodeX[n.navIndex] = n.x;
                    world.navigation.store.nodeY[n.navIndex] = n.y;
                }

                n.redraw(); // Forzar actualización visual del nodo en su nueva coordenada
            }
        }

        // Damage units in hazards
        if (world.hazards) {
            for (let hz of world.hazards) {
                if (hz._timer === undefined) hz._timer = 0;
                hz._timer += dt;

                // Determine how many kills should happen this frame based on the fixed DPS
                const killInterval = hz.dps > 0 ? 1 / hz.dps : 999;
                let killsPending = Math.floor(hz._timer / killInterval);
                let killedThisFrame = 0;
                let anyUnitsInHazard = false;

                const hx = hz.x * world.game.width;
                const hy = hz.y * world.game.height;
                const hR = hz.radius * world.game.width; // Assume radius is % of width for circular logic
                
                for (let u of world.allUnits) {
                    if (u.pendingRemoval) continue;
                    
                    // Inmunidad universal: Si están en la base (idle), el nodo / superficie de tierra las protege
                    if (u.state === 'idle') {
                        continue;
                    }

                    // Inmunidad extra: Si están dentro del radio de cualquier nodo, no sufren daño
                    let safeInNode = false;
                    for (let n of world.nodes) {
                        if (n.type === 'tunel') continue;
                        let dnx = u.x - n.x;
                        let dny = u.y - n.y;
                        if (dnx * dnx + dny * dny <= n.radius * n.radius) {
                            safeInNode = true;
                            break;
                        }
                    }
                    if (safeInNode) continue;

                    // ── Shape-aware containment check ──
                    let inHazard = false;

                    if (hz.shape === 'flood') {
                        // ── Verificar si estamos dentro del colosal contorno del lago ──
                        const dx = u.x - hx;
                        const sy = hz.scaleY || 1.0;
                        const dy = (u.y - hy) / sy;
                        if (dx * dx + dy * dy < hR * hR) {
                            inHazard = true;
                            // Revisar inmunidad en islas
                            if (hz.safeZones) {
                                for (let s = 0; s < hz.safeZones.length; s++) {
                                    const sz = hz.safeZones[s];
                                    const sx = sz.x * world.game.width;
                                    const sy = sz.y * world.game.height;
                                    const sR = sz.radius * world.game.width;
                                    const sdx = u.x - sx;
                                    const sdy = u.y - sy;
                                    if (sdx * sdx + sdy * sdy < sR * sR) {
                                        inHazard = false;
                                        break;
                                    }
                                }
                            }
                        }
                    } else if (hz.shape === 'rect_puddle') {
                        // Rectangular bounds check
                        const left   = hz.x * world.game.width;
                        const top    = hz.y * world.game.height;
                        const right  = left + (hz.width * world.game.width);
                        const bottom = top  + (hz.height * world.game.height);
                        inHazard = (u.x >= left && u.x <= right && u.y >= top && u.y <= bottom);
                    } else {
                        // Circular / elliptical containment (puddle, ring, semicircle)
                        const dx = u.x - hx;
                        const sy = hz.scaleY || 1.0;
                        const dy = (u.y - hy) / sy;
                        const distSq = dx * dx + dy * dy;

                        if (distSq < hR * hR) {
                            if (hz.shape === "semicircle" && dx < 0) {
                                // skip — behind the semicircle arc
                            } else if (hz.shape === 'ring' && hz.innerRadius) {
                                const iR = hz.innerRadius * world.game.width;
                                inHazard = (distSq >= iR * iR); // safe inside inner radius
                            } else {
                                inHazard = true;
                            }
                        }
                    }

                    if (!inHazard) continue;

                    anyUnitsInHazard = true;

                    if (killedThisFrame < killsPending) {
                        // Deterministic damage: mark for exact removal
                        u.pendingRemoval = true;
                        killedThisFrame++;

                        // Flash effect visual universal
                        if (u.sprite && !u.sprite.destroyed) {
                            u.sprite.alpha = 0.2; // Parpadeo casi invisible
                            setTimeout(() => { if (u.sprite && !u.sprite.destroyed) u.sprite.alpha = 1.0; }, 80);
                        }
                    }
                }

                if (!anyUnitsInHazard) {
                    // Si no hay tropas para dañar, reiniciamos el reloj para evitar acumulación de muertes (kill debts)
                    hz._timer = 0;
                } else if (killedThisFrame > 0) {
                    // Consume the time used for the kills, but keep remainder
                    hz._timer = hz._timer % killInterval;
                }
            }
        }

        // Apply Zone Multipliers
        if (world.zones && world.zones.length > 0) {
            for (let u of world.allUnits) {
                if (u.pendingRemoval) continue;
                u.currentZoneMult = 1.0; // Reset every frame
                
                const uxPercent = u.x / world.game.width;
                const uyPercent = u.y / world.game.height;

                for (let z of world.zones) {
                    if (uxPercent >= z.x && uxPercent <= z.x + z.width &&
                        uyPercent >= z.y && uyPercent <= z.y + z.height) {
                        u.currentZoneMult = z.speedMult;
                        break; // Top-most zone takes precedence (if they overlap)
                    }
                }
            }
        } else {
            for (let u of world.allUnits) {
                if (!u.pendingRemoval) u.currentZoneMult = 1.0;
            }
        }
    }

    static processArrivals(world) {
        for (let u of world.allUnits) {
            if (u.state !== 'traveling') continue;
            let tn = u.targetNode;
            if (!tn) {
                if (u.homeNode) { u.targetNode = u.homeNode; }
                continue;
            }
            let dx = u.x - tn.x, dy = u.y - tn.y;
            let arrivalR = tn.radius * 1.5;
            if (dx * dx + dy * dy <= arrivalR * arrivalR) {
                if (tn.type === 'tunel' && tn.tunnelTo && tn.owner === u.faction) {
                    if (world.positionUnitInNode) {
                        world.positionUnitInNode(u, tn.tunnelTo, 1.0, ((tn.tunnelTo.radius | 0) ^ (u.deterministicSeed != null ? u.deterministicSeed : 1)) >>> 0);
                    } else {
                        u.x = tn.tunnelTo.x;
                        u.y = tn.tunnelTo.y;
                    }
                    u.targetNode = tn.tunnelTo;
                    u.homeNode = tn.tunnelTo;
                    u.state = 'idle';
                } else {
                    u.state = 'idle';
                    u.homeNode = tn;
                    u.speedMult = 1.0;
                }
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // BARRERA DE CRISTAL (Nivel 9) — empuja unidades fuera del muro.
    //
    // Reglas:
    //   · Unidades IDLE sobre un nodo MÓVIL (el ferry) → inmunes.
    //     El ferry las transporta a través del muro sin resistencia.
    //   · Todas las demás → se empujan al borde más cercano del AABB.
    //     Sin daño. La velocidad hacia el interior se cancela.
    //     Las unidades quedan "apiladas" en el borde intentando pasar.
    // ─────────────────────────────────────────────────────────────────
    static resolveBarriers(world) {
        let activeBarriers = [];
        if (world.barriers) activeBarriers.push(...world.barriers);
        
        if (world.intermittentBarriers) {
            for (let ib of world.intermittentBarriers) {
                const act = ib.getActiveBounds();
                if (act) activeBarriers.push(...act);
            }
        }

        if (activeBarriers.length === 0) return;

        const gw = world.game.width;
        const gh = world.game.height;

        for (let u of world.allUnits) {
            if (u.pendingRemoval) continue;
            // Inmunidad: idle dentro de un nodo móvil (el ferry)
            if (u.state === 'idle' && u.targetNode && u.targetNode.isMobile) continue;

            for (let b of activeBarriers) {
                const bx = b.x * gw;
                const by = b.y * gh;
                const bw = b.width * gw;
                const bh = b.height * gh;

                if (u.x < bx || u.x > bx + bw || u.y < by || u.y > by + bh) continue;

                // Empujar hacia el borde más cercano
                const dL = u.x - bx;
                const dR = bx + bw - u.x;
                const dT = u.y - by;
                const dB = by + bh - u.y;
                const m  = Math.min(dL, dR, dT, dB);

                if (m === dL)      { u.x = bx - 2;       if (u.vx > 0) u.vx = 0; }
                else if (m === dR) { u.x = bx + bw + 2;  if (u.vx < 0) u.vx = 0; }
                else if (m === dT) { u.y = by - 2;       if (u.vy > 0) u.vy = 0; }
                else               { u.y = by + bh + 2;  if (u.vy < 0) u.vy = 0; }
            }
        }
    }

    static drawTunnels(world) {
        if (!world.tunnelGraphics) return;

        world.tunnelGraphics.clear();

        const time = performance.now();
        for (let n of world.nodes) {
            if (n.tunnelTo && n.tunnelTo.owner === n.owner && n.type !== 'tunel') {
                const c = Node.COLORS[n.owner] || Node.COLORS.neutral;
                const x1 = n.x, y1 = n.y;
                const x2 = n.tunnelTo.x, y2 = n.tunnelTo.y;

                // 1. EL TÚNEL (Línea base sutil)
                world.tunnelGraphics.moveTo(x1, y1).lineTo(x2, y2);
                world.tunnelGraphics.stroke({ color: c.fill, alpha: 0.15, width: 12 });

                // 2. RECTÁNGULOS MÓVILES (Dashed line animado)
                const scrollSpeed = 0.1;
                const offset = (time * scrollSpeed) % 30;

                world.tunnelGraphics.moveTo(x1, y1).lineTo(x2, y2);
                world.tunnelGraphics.stroke({
                    color: c.stroke,
                    alpha: 0.8,
                    width: 6,
                    dashArray: [10, 20],
                    dashOffset: -offset
                });
            }
        }
    }
}
