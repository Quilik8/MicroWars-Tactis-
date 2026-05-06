
import { Node } from '../entities/node.js';

export class InputDrawHelper {
    static draw(manager, ctx) {
        if (manager.ui.gameState !== 'PLAYING' || manager.ui.isPaused) return;
        
        manager.updateEvolutionMenuPosition();
        
        const w = manager.game.world;
        if (!w) return;

        const now = performance.now();

        // ── 1. Línea de arrastre activa (solo si supera threshold) ──
        if (manager.dragStartNode && manager.isDragging) {
            const sx = manager.dragStartNode.x * w.scale.x + w.position.x;
            const sy = manager.dragStartNode.y * w.scale.y + w.position.y;

            if (manager.dragMode === 'tunnel') {
                this._drawTunnelLine(ctx, sx, sy, manager.mouseX, manager.mouseY, now);
            } else {
                this._drawAttackArrow(ctx, sx, sy, manager.mouseX, manager.mouseY, manager.dragStartNode.owner);
            }
        }

        // ── 2. Modo túnel mobile: halo en nodo fuente + línea al cursor ──
        if (manager.tunnelSourceNode) {
            const sx = manager.tunnelSourceNode.x * w.scale.x + w.position.x;
            const sy = manager.tunnelSourceNode.y * w.scale.y + w.position.y;
            const sr = manager.tunnelSourceNode.radius * w.scale.x;

            // Halo pulsante doble
            const pulse = 0.5 + 0.5 * Math.sin(now * 0.007);
            ctx.save();
            ctx.beginPath();
            ctx.arc(sx, sy, sr + 6 + pulse * 8, 0, Math.PI * 2);
            ctx.strokeStyle = '#f39c12';
            ctx.lineWidth = 2.5;
            ctx.globalAlpha = 0.8 * pulse;
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(sx, sy, sr + 14 + pulse * 4, 0, Math.PI * 2);
            ctx.lineWidth = 1.2;
            ctx.globalAlpha = 0.35 * pulse;
            ctx.stroke();
            ctx.restore();

            // Línea punteada hacia el cursor
            const dx = manager.mouseX - sx;
            const dy = manager.mouseY - sy;
            if (dx * dx + dy * dy > (sr + 20) * (sr + 20)) {
                this._drawTunnelLine(ctx, sx, sy, manager.mouseX, manager.mouseY, now);
            }
        }

        // ── 3. Previsualización de flecha desde nodo seleccionado ──
        if (manager.selectedNode && !manager.isDragging && !manager.tunnelSourceNode) {
            let hovered = null;
            for (let n of manager.world.nodes) {
                if (n.hovered && n !== manager.selectedNode) { hovered = n; break; }
            }
            if (hovered) {
                const sx = manager.selectedNode.x * w.scale.x + w.position.x;
                const sy = manager.selectedNode.y * w.scale.y + w.position.y;
                const tx = hovered.x * w.scale.x + w.position.x;
                const ty = hovered.y * w.scale.y + w.position.y;
                this._drawAttackArrow(ctx, sx, sy, tx, ty, manager.selectedNode.owner, 0.40);
            }
        }
    }

    static _drawAttackArrow(ctx, x1, y1, x2, y2, owner, alphaOverride) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 10) return;

        const angle = Math.atan2(dy, dx);
        const nodeColors = Node.COLORS[owner];
        const color = nodeColors ? '#' + nodeColors.fill.toString(16).padStart(6, '0') : '#ffffff';

        ctx.save();
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 3.5;
        ctx.globalAlpha = alphaOverride ?? 0.88;
        ctx.setLineDash([]);
        ctx.lineCap = 'round';

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        const headLen = 14;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6),
            y2 - headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6),
            y2 - headLen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    static _drawTunnelLine(ctx, x1, y1, x2, y2, now) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 12) return;

        const dashOffset = -(now * 0.09) % 24;

        ctx.save();

        ctx.strokeStyle = '#f39c12';
        ctx.lineWidth = 5;
        ctx.globalAlpha = 0.18;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        ctx.strokeStyle = '#f39c12';
        ctx.lineWidth = 2.5;
        ctx.globalAlpha = 0.92;
        ctx.setLineDash([10, 14]);
        ctx.lineDashOffset = dashOffset;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(x2, y2, 7, 0, Math.PI * 2);
        ctx.fillStyle = '#f39c12';
        ctx.globalAlpha = 0.88;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.70;
        ctx.stroke();

        ctx.restore();
    }
}
