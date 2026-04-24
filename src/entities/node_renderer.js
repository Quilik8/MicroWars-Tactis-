import * as PIXI from 'pixi.js';
import { Node } from './node.js';

export class NodeRenderer {
    static redraw(node, factionData = null) {
        if (!node.gfx || node.gfx.destroyed) return;

        // 1. Determinar esquema de colores
        const c = Node.COLORS[node.owner] || Node.COLORS.neutral;

        let fill = node.flashTargetColor ? node.flashTargetColor : (factionData ? factionData.color : c.fill);
        let stroke = factionData ? 0xffffff : c.stroke;
        let alpha = factionData ? 0.45 : c.alpha;
        let glow = node.flashTargetColor ? node.flashTargetColor : (factionData ? factionData.color : (c.glow || fill));

        const r = node.radius;
        const g = node.gfx;
        g.clear();

        // ── Capas de Renderizado ──

        // A. Halo exterior (glow reactivo)
        const displayEvolution = node.pendingEvolution || node.evolution;
        const ev = displayEvolution ? Node.EVOLUTION_COLORS[displayEvolution] : null;
        g.circle(node.x, node.y, r + 6);
        g.stroke({ color: ev ? ev.accent : glow, alpha: 0.25, width: 8 });

        // B. Cuerpo principal
        if (node.type === 'tunel') {
            g.circle(node.x, node.y, r);
            g.fill({ color: 0x080808, alpha: 0.95 }); // Fondo oscuro (hoyo)
            g.stroke({ color: stroke, alpha: 0.9, width: 3 });
            // Anillos internos
            g.circle(node.x, node.y, r * 0.6);
            g.stroke({ color: fill, alpha: 0.6, width: 2, dashArray: [4, 4] });
            g.circle(node.x, node.y, r * 0.2);
            g.fill({ color: fill, alpha: 0.8 });
        } else {
            g.circle(node.x, node.y, r);
            g.fill({ color: fill, alpha: alpha });
            g.stroke({ color: stroke, alpha: 0.5, width: 2.5 });
        }

        // ── Evoluciones Visuales ──
        if (node.evolution === 'espinoso') {
            const numSpikes = 20;
            const spikeMaxDist = node.radius + Node.ESPINOSO_AURA_EXTRA;
            for (let i = 0; i < numSpikes; i++) {
                const ang = (i / numSpikes) * Math.PI * 2;
                const rx = node.x + Math.cos(ang) * (r + 2);
                const ry = node.y + Math.sin(ang) * (r + 2);
                const rx2 = node.x + Math.cos(ang) * spikeMaxDist;
                const ry2 = node.y + Math.sin(ang) * spikeMaxDist;
                g.moveTo(rx, ry).lineTo(rx2, ry2);
            }
            g.stroke({ color: 0x27ae60, alpha: 0.9, width: 3.5 });

            for (let i = 0; i < numSpikes; i++) {
                const ang = (i / numSpikes) * Math.PI * 2;
                const perpAng = ang + Math.PI / 2;
                const tinyLen = 4;
                for (let j = 1; j <= 2; j++) {
                    const distAlong = r + 8 + (j * 14);
                    if (distAlong > spikeMaxDist - 5) continue;
                    const mx = node.x + Math.cos(ang) * distAlong;
                    const my = node.y + Math.sin(ang) * distAlong;
                    g.moveTo(mx, my).lineTo(mx + Math.cos(perpAng) * tinyLen, my + Math.sin(perpAng) * tinyLen);
                    g.moveTo(mx, my).lineTo(mx - Math.cos(perpAng) * tinyLen, my - Math.sin(perpAng) * tinyLen);
                }
            }
            g.stroke({ color: 0x2ecc71, alpha: 0.8, width: 1.5 });
        } else if (node.evolution === 'artilleria') {
            // ── Cañón de artillería química ──────────────────────────
            // Cuatro cañones en diagonal apuntando hacia afuera
            const cannonAngles = [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75];
            const barrelLen    = r * 1.05;
            const barrelW      = 4.5;

            for (const ang of cannonAngles) {
                const bx1 = node.x + Math.cos(ang) * (r * 0.3);
                const by1 = node.y + Math.sin(ang) * (r * 0.3);
                const bx2 = node.x + Math.cos(ang) * barrelLen;
                const by2 = node.y + Math.sin(ang) * barrelLen;

                // Cuerpo del cañón (relleno oscuro)
                g.moveTo(bx1, by1).lineTo(bx2, by2);
                g.stroke({ color: 0x222222, alpha: 0.95, width: barrelW + 3 });

                // Brillo del cañón (naranja ácido)
                g.moveTo(bx1, by1).lineTo(bx2, by2);
                g.stroke({ color: 0xf39c12, alpha: 0.95, width: barrelW });

                // Boca del cañón: semicírculo
                g.circle(bx2, by2, barrelW * 0.6);
                g.fill({ color: 0xf39c12, alpha: 0.9 });
            }

            // Base central (soporte del cañón, encima del cuerpo del nodo)
            g.circle(node.x, node.y, r * 0.38);
            g.fill({ color: 0x1a1a1a, alpha: 0.85 });
            g.circle(node.x, node.y, r * 0.28);
            g.fill({ color: 0xf39c12, alpha: 0.75 });

            // ── Indicador de recarga (arco de progreso) ──
            if (node.artilleryTimer !== undefined && node.artilleryInterval) {
                const reloadProgress = Math.min(1, node.artilleryTimer / node.artilleryInterval);
                const startA = -Math.PI / 2;
                const endA   = startA + Math.PI * 2 * reloadProgress;
                g.moveTo(node.x + Math.cos(startA) * (r + 7), node.y + Math.sin(startA) * (r + 7));
                g.arc(node.x, node.y, r + 7, startA, endA);
                g.stroke({ color: 0xf39c12, alpha: reloadProgress * 0.9, width: 2.5, cap: 'round' });
            }

            // ── Anillo de rango punteado ──
            g.circle(node.x, node.y, node.artilleryRange);
            g.stroke({ color: 0xf39c12, alpha: 0.08, width: 1, dashArray: [6, 8] });
        } else if (node.evolution === 'tanque') {
            g.circle(node.x, node.y, r * 0.6);
            g.fill({ color: 0x8e44ad, alpha: 0.4 });
            g.stroke({ color: 0xffffff, alpha: 0.3, width: 1 });
        }

        if (node.pendingEvolution) {
            const pendingC = Node.EVOLUTION_COLORS[node.pendingEvolution] || { accent: 0xffffff };
            const total = Math.max(0.001, node.pendingEvolutionDurationSec || node.pendingEvolutionEtaSec || 1);
            const progress = Math.max(0, Math.min(1, 1 - ((node.pendingEvolutionEtaSec || 0) / total)));
            const startA = -Math.PI / 2;
            const endA = startA + (Math.PI * 2 * progress);

            g.circle(node.x, node.y, r + 9);
            g.stroke({ color: pendingC.accent, alpha: 0.18, width: 2, dashArray: [4, 5] });

            g.moveTo(node.x + Math.cos(startA) * (r + 9), node.y + Math.sin(startA) * (r + 9));
            g.arc(node.x, node.y, r + 9, startA, endA);
            g.stroke({ color: pendingC.accent, alpha: 0.95, width: 3, cap: 'round' });
        }

        // C. Indicador de Conquista (Anillo)
        if (node.conquestProgress > 0 && node.conqueringFaction) {
            const conquestC = Node.COLORS[node.conqueringFaction] || Node.COLORS.neutral;
            const conquestColor = factionData && node.conqueringFaction === factionData.id ? factionData.color : conquestC.fill;
            const startAngle = -Math.PI / 2;
            const endAngle = startAngle + (Math.PI * 2 * node.conquestProgress);
            
            g.moveTo(node.x + Math.cos(startAngle) * (r + 4), node.y + Math.sin(startAngle) * (r + 4));
            g.arc(node.x, node.y, r + 4, startAngle, endAngle);
            g.stroke({ color: conquestColor, alpha: 0.9, width: 4.5, cap: 'round' });
        }

        // D. Indicadores de Estado
        if (node.isSelected) {
            g.circle(node.x, node.y, r + 10);
            g.stroke({ color: 0xffffff, alpha: 1, width: 2.5 });
        }

        if (!node.evolution && !node.pendingEvolution && node.owner === 'player') {
            g.circle(node.x, node.y, r + 2);
            g.stroke({ color: 0xffffff, alpha: 0.2, width: 1 });
        }

        // E. Marca de Rayo de Sol (Nivel 8) — anillo orbital cian eléctrico
        if (node.isMarkedForSweep) {
            // orbitR es FIJO (r + 14) y nunca varía su tamaño.
            // Antes pulseScale expandía el radio durante la alerta, lo que hacía que
            // el anillo visual sobresaliera fuera del área interactiva de containsPoint
            // y causaba clics "en el vacío" al pulsar el borde animado del nodo.
            // Ahora solo pulseAlpha varía: la urgencia se comunica con intensidad
            // luminosa, no con expansión de radio.
            // containsPoint usa r + 12, orbitR es r + 14 → 2 px de margen interior.
            const orbitR  = r + 14;
            const angle   = node._sweepMarkAngle || 0;
            const numDots = 8;
            const dotR    = 3.2;

            let pulseAlpha = 0.75;
            if (node._sweepAlerting) {
                const t    = Date.now() * 0.005;
                const pulse = 0.5 + 0.5 * Math.abs(Math.sin(t));
                pulseAlpha  = 0.55 + 0.45 * pulse;  // solo opacidad pulsa, no el radio
            }

            // Anillo base tenue
            g.circle(node.x, node.y, orbitR);
            g.stroke({ color: 0x00e5ff, alpha: 0.22 * pulseAlpha, width: 1.5 });

            // Puntos orbitales giratorios
            for (let i = 0; i < numDots; i++) {
                const a     = angle + (i / numDots) * Math.PI * 2;
                const dotX  = node.x + Math.cos(a) * orbitR;
                const dotY  = node.y + Math.sin(a) * orbitR;
                const scale = 0.6 + 0.4 * Math.abs(Math.sin(a));
                g.circle(dotX, dotY, dotR * scale);
                g.fill({ color: 0x00e5ff, alpha: pulseAlpha * scale });
            }

            // Destello blanco en posición de "sol"
            const sunX = node.x + Math.cos(angle) * orbitR;
            const sunY = node.y + Math.sin(angle) * orbitR;
            g.circle(sunX, sunY, dotR * 1.6);
            g.fill({ color: 0xffffff, alpha: 0.9 * pulseAlpha });

            // Halo de alerta: radio fijo, solo la opacidad late
            if (node._sweepAlerting) {
                const t    = Date.now() * 0.004;
                const halo = 0.3 + 0.7 * Math.abs(Math.sin(t));
                g.circle(node.x, node.y, orbitR + 6);
                g.stroke({ color: 0xff8c00, alpha: 0.35 * halo, width: 2 });
            }
        }
    }
}
