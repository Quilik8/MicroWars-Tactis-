import { SpatialHashGrid } from '../core/logic_grid.js';
import { Node } from '../entities/node.js';
import { CombatManager } from './combat_manager.js';

export class PhysicsManager {
    static updateGrid(world) {
        if (world.grid.boundsWidth !== world.game.width || world.grid.boundsHeight !== world.game.height) {
            world.grid = new SpatialHashGrid(world.game.width, world.game.height, world.gridSize, 10000);
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
            u.updateForces(dt, u.targetNode.x, u.targetNode.y, targetR, world.neighbors, world.allUnits);
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

                n.redraw(); // Forzar actualización visual del nodo en su nueva coordenada
            }
        }

        // Damage units in hazards
        if (world.hazards) {
            for (let hz of world.hazards) {
                const hx = hz.x * world.game.width;
                const hy = hz.y * world.game.height;
                const hR = hz.radius * world.game.width; // Assume radius is % of width for circular logic
                
                for (let u of world.allUnits) {
                    if (u.pendingRemoval) continue;
                    
                    // Inmunidad: Si están dentro del Ferry Orbital (nodo móvil)
                    if (u.state === 'idle' && u.targetNode && u.targetNode.isMobile) {
                        continue;
                    }
                    
                    const dx = u.x - hx;
                    const dy = u.y - hy;
                    
                    if (dx * dx + dy * dy < hR * hR) {
                        if (hz.shape === "semicircle" && dx < 0) {
                            continue; // Ignorar colisión en la mitad trasera/recta del arco
                        }

                        // Daño como porcentaje gradual:
                        // dps = % de hormigas muertas por segundo
                        const damageChance = (hz.dps / 100) * dt;
                        if (Math.random() < damageChance) {
                            if (u.power > 1) u.power -= 1;
                            else u.pendingRemoval = true;

                            // Flash effect visual universal: Tintes PIXI afectan texturas rojas negativamente. Usamos Alpha.
                            if (u.sprite && !u.sprite.destroyed) {
                                u.sprite.alpha = 0.2; // Parpadeo casi invisible
                                setTimeout(() => { if (u.sprite && !u.sprite.destroyed) u.sprite.alpha = 1.0; }, 80);
                            }
                        }
                    }
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
                    u.x = tn.tunnelTo.x + (Math.random() - 0.5) * tn.tunnelTo.radius;
                    u.y = tn.tunnelTo.y + (Math.random() - 0.5) * tn.tunnelTo.radius;
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
        if (!world.barriers || world.barriers.length === 0) return;
        const gw = world.game.width;
        const gh = world.game.height;

        for (let u of world.allUnits) {
            if (u.pendingRemoval) continue;
            // Inmunidad: idle dentro de un nodo móvil (el ferry)
            if (u.state === 'idle' && u.targetNode && u.targetNode.isMobile) continue;

            for (let b of world.barriers) {
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

                if      (m === dL) { u.x = bx - 1;       if (u.vx > 0) u.vx = 0; }
                else if (m === dR) { u.x = bx + bw + 1;  if (u.vx < 0) u.vx = 0; }
                else if (m === dT) { u.y = by - 1;        if (u.vy > 0) u.vy = 0; }
                else               { u.y = by + bh + 1;  if (u.vy < 0) u.vy = 0; }
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
