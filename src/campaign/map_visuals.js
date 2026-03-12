/**
 * MapVisuals - Renderizado del mapa estratégico usando PixiJS.
 */
import * as PIXI from 'pixi.js';
import { Node } from '../entities/node.js';

export class MapVisuals {
    constructor(game, ui, core) {
        this.game = game;
        this.ui = ui;
        this.core = core;
        this.container = new PIXI.Container();
        this.container.visible = false;

        this.nodesLayer = new PIXI.Container();
        this.connectionsLayer = new PIXI.Container();
        this.armiesLayer = new PIXI.Container();

        this.container.addChild(this.connectionsLayer);
        this.container.addChild(this.nodesLayer);
        this.container.addChild(this.armiesLayer);

        this.hoveredNodeId = null;
        this.selectedNodeId = null;
        this.mapData = null;

        // Integrar con el Engine
        if (this.game.app && this.game.app.stage) {
            this.game.app.stage.addChild(this.container);
        }
    }

    render(data) {
        this.mapData = data;

        // Asegurar que el contenedor esté en el stage
        if (this.game.app && this.game.app.stage && !this.container.parent) {
            this.game.app.stage.addChild(this.container);
        }

        this.container.visible = true;
        this.draw();
    }

    draw() {
        if (!this.mapData) return;
        this.clearLayers();

        const w = this.game.width || window.innerWidth;
        const h = this.game.height || window.innerHeight;

        // 1. Dibujar conexiones
        const connGfx = new PIXI.Graphics();
        this.connectionsLayer.addChild(connGfx);

        this.mapData.connections.forEach(conn => {
            const from = this.mapData.nodes.find(n => n.id === conn.from);
            const to = this.mapData.nodes.find(n => n.id === conn.to);
            if (from && to) {
                connGfx.moveTo(from.x * w, from.y * h);
                connGfx.lineTo(to.x * w, to.y * h);
            }
        });
        connGfx.stroke({ width: 2, color: 0xffffff, alpha: 0.15 });

        // 2. Dibujar territorios
        const nodesGfx = new PIXI.Graphics();
        this.nodesLayer.addChild(nodesGfx);

        this.mapData.nodes.forEach(node => {
            const faction = this.mapData.factions.find(f => f.id === node.owner);
            const ownerId = faction ? (faction.id === 'player' ? 'player' : 'enemy') : 'neutral';
            const c = Node.COLORS[ownerId];
            const isHovered = this.hoveredNodeId === node.id;
            const isSelected = this.selectedNodeId === node.id;
            const r = node.type === 'center' ? 35 : 18;

            const nx = node.x * w;
            const ny = node.y * h;

            // Brillo si está hovereado o seleccionado
            if (isHovered || isSelected) {
                nodesGfx.circle(nx, ny, r + 8);
                nodesGfx.fill({ color: isSelected ? 0xffffff : c.fill, alpha: isSelected ? 0.3 : 0.2 });
            }

            // Círculo base
            nodesGfx.circle(nx, ny, r + 2);
            nodesGfx.fill({ color: 0x000000, alpha: 0.8 });
            nodesGfx.stroke({ color: 0xffffff, alpha: isSelected ? 0.8 : 0.1, width: isSelected ? 2 : 1 });

            nodesGfx.circle(nx, ny, r);
            nodesGfx.fill({ color: c.fill, alpha: isHovered ? 0.6 : 0.4 });

            // Ficha de ejército
            if (faction) {
                this.drawArmyToken(nx, ny, faction, isHovered);
            }
        });
    }

    drawArmyToken(x, y, faction, isHovered) {
        const armyGfx = new PIXI.Graphics();
        this.armiesLayer.addChild(armyGfx);

        const r = isHovered ? 16 : 14;
        const fy = isHovered ? y - 4 : y; // Levantar un poco si hay hover

        armyGfx.circle(x, y + 4, r);
        armyGfx.fill({ color: 0x000000, alpha: 0.4 });

        armyGfx.circle(x, fy, r);
        armyGfx.fill({ color: faction.color, alpha: 1.0 });
        armyGfx.stroke({ color: 0xffffff, width: 2, alpha: 0.8 });

        armyGfx.circle(x, fy, r - 5);
        armyGfx.stroke({ color: 0x000000, width: 1, alpha: 0.2 });
    }

    checkHover(mx, my) {
        if (!this.mapData) return;
        const w = window.innerWidth;
        const h = window.innerHeight;

        const found = this.mapData.nodes.find(n => {
            const dx = mx - (n.x * w);
            const dy = my - (n.y * h);
            const r = n.type === 'center' ? 35 : 20;
            return (dx * dx + dy * dy) <= r * r;
        });

        const newHoverId = found ? found.id : null;
        if (this.hoveredNodeId !== newHoverId) {
            this.hoveredNodeId = newHoverId;
            this.draw();
        }
    }

    checkClick(mx, my) {
        if (!this.mapData) return;
        const w = window.innerWidth;
        const h = window.innerHeight;

        const found = this.mapData.nodes.find(n => {
            const dx = mx - (n.x * w);
            const dy = my - (n.y * h);
            const r = n.type === 'center' ? 35 : 20;
            return (dx * dx + dy * dy) <= r * r;
        });

        this.selectedNodeId = found ? found.id : null;
        this.draw();

        if (found) {
            // Aquí podríamos disparar el inicio de un nivel RTS o menú de acciones
        }
    }

    clearLayers() {
        this.connectionsLayer.removeChildren().forEach(c => c.destroy());
        this.nodesLayer.removeChildren().forEach(c => c.destroy());
        this.armiesLayer.removeChildren().forEach(c => c.destroy());
    }

    clear() {
        this.clearLayers();
        this.container.visible = false;
        this.mapData = null;
    }
}
