import { PIXI } from '../core/engine.js';
import { Node } from '../entities/node.js';
import { FACTIONS } from '../campaign/faction_data.js';

export class InputManager {
    constructor(game, world, ui, sfx) {
        this.game = game;
        this.world = world; // WorldManager
        this.ui = ui; // UIManager
        this.sfx = sfx;

        this.mouseX = 0;
        this.mouseY = 0;
        this.worldMouseX = 0;
        this.worldMouseY = 0;

        this.selectedNode = null;
        this.dragStartNode = null;
        this.lastClickTime = 0;
        this.lastClickNode = null;

        this.isPanning = false;
        this.panStart = { x: 0, y: 0 };
        this.worldStart = { x: 0, y: 0 };

        this.sendPercent = 0.5;
        this.evoMenu = null;
    }

    setSendPercent(val) {
        this.sendPercent = Math.max(0.01, Math.min(1.0, val));
    }

    init() {
        this.evoMenu = document.getElementById('evolutionMenu');
        this.setupListeners();
    }

    setupListeners() {
        this._handlers = {
            move: (e) => this.onPointerMove(e),
            down: (e) => this.onPointerDown(e),
            up: (e) => this.onPointerUp(e),
            wheel: (e) => this.onWheel(e),
            context: (e) => { e.preventDefault(); this.onRightClick(e); },
            keydown: (e) => { if (e.code === 'Space') this.ui.callbacks.onTogglePause(); }
        };

        window.addEventListener('pointermove', this._handlers.move);
        window.addEventListener('pointerdown', this._handlers.down);
        window.addEventListener('pointerup', this._handlers.up);
        window.addEventListener('wheel', this._handlers.wheel);
        window.addEventListener('contextmenu', this._handlers.context);
        window.addEventListener('keydown', this._handlers.keydown);

        // Event delegation for evolution menu
        if (this.evoMenu) {
            this.evoMenu.addEventListener('click', (e) => {
                const btn = e.target.closest('.evo-btn');
                if (btn) this.onEvoButtonClick(btn);
            });
        }
    }

    destroy() {
        window.removeEventListener('pointermove', this._handlers.move);
        window.removeEventListener('pointerdown', this._handlers.down);
        window.removeEventListener('pointerup', this._handlers.up);
        window.removeEventListener('wheel', this._handlers.wheel);
        window.removeEventListener('contextmenu', this._handlers.context);
        window.removeEventListener('keydown', this._handlers.keydown);
    }

    updateMouseCoords(clientX, clientY) {
        this.mouseX = clientX;
        this.mouseY = clientY;
        const w = this.game.world;
        if (w) {
            this.worldMouseX = (this.mouseX - w.position.x) / w.scale.x;
            this.worldMouseY = (this.mouseY - w.position.y) / w.scale.y;
        } else {
            this.worldMouseX = this.mouseX;
            this.worldMouseY = this.mouseY;
        }
    }

    onPointerMove(e) {
        // Ignorar si el mouse está sobre la UI (y no estamos paneando)
        const onUI = e.target.closest('#sendBar') || e.target.closest('#hud') || e.target.id === 'pauseBtn' || e.target.closest('#uiLayer');
        if (!this.isPanning && onUI) return;

        this.updateMouseCoords(e.clientX, e.clientY);

        if (this.ui.gameState === 'CAMPAIGN') {
            this.handleCampaignInput(e, 'move');
            return;
        }

        const w = this.game.world;
        if (this.isPanning && w) {
            w.position.x = this.worldStart.x + (this.mouseX - this.panStart.x);
            w.position.y = this.worldStart.y + (this.mouseY - this.panStart.y);
        }
        for (let n of this.world.nodes) {
            n.hovered = n.containsPoint(this.worldMouseX, this.worldMouseY);
        }
    }

    onPointerDown(e) {
        const canInteract = (this.ui.gameState === 'PLAYING' && !this.ui.isPaused) || (this.ui.gameState === 'CAMPAIGN');
        if (!canInteract) return;

        // IGNORAR SI EL CLIC ES EN LA UI 
        const onUI = e.target.closest('#sendBar') || e.target.closest('#hud') || e.target.id === 'pauseBtn' || e.target.closest('#uiLayer');
        if (onUI) return;

        this.updateMouseCoords(e.clientX, e.clientY);

        if (this.ui.gameState === 'CAMPAIGN') {
            this.handleCampaignInput(e, 'down');
            return;
        }

        if (!this.evoMenu.classList.contains('hidden') && !this.evoMenu.contains(e.target)) {
            this.evoMenu.classList.add('hidden');
        }

        let clicked = this.world.nodes.find(n => n.containsPoint(this.worldMouseX, this.worldMouseY));
        let now = Date.now();

        if (clicked) {
            this.dragStartNode = clicked;
            if (clicked === this.lastClickNode && (now - this.lastClickTime) < 300) {
                if (clicked.owner === 'player' && !clicked.evolution) {
                    this.showEvolutionMenu(clicked);
                    this.lastClickTime = 0;
                    return;
                }
            }
            this.lastClickTime = now;
            this.lastClickNode = clicked;
        } else {
            this.dragStartNode = null;
            if (!this.evoMenu.contains(e.target)) {
                if (this.selectedNode) {
                    this.selectedNode.isSelected = false;
                    this.selectedNode.redraw();
                }
                this.selectedNode = null;
            }
            const w = this.game.world;
            if (w) {
                this.isPanning = true;
                this.panStart = { x: this.mouseX, y: this.mouseY };
                this.worldStart = { x: w.position.x, y: w.position.y };
            }
        }
    }

    onPointerUp(e) {
        if (this.ui.gameState !== 'PLAYING' || this.ui.isPaused) return;
        this.updateMouseCoords(e.clientX, e.clientY);
        this.isPanning = false;

        let clicked = this.world.nodes.find(n => n.containsPoint(this.worldMouseX, this.worldMouseY));

        if (this.dragStartNode) {
            if (clicked && clicked !== this.dragStartNode) {
                if (this.dragStartNode.owner === 'player' && clicked.owner === 'player') {
                    if (this.world.countAt(this.dragStartNode, 'player') >= 15) {
                        this.world.killNPower(this.dragStartNode, 'player', 15);
                        this.dragStartNode.tunnelTo = clicked;
                    }
                } else if (this.dragStartNode.owner === 'player') {
                    // ATAQUE O REFUERZO VÍA DRAG
                    this.world.sendTroops(this.dragStartNode, clicked, this.sendPercent);
                    if (this.sfx) this.sfx.move();
                }
                if (this.selectedNode !== this.dragStartNode) {
                    if (this.selectedNode) { this.selectedNode.isSelected = false; this.selectedNode.redraw(); }
                    this.selectedNode = null;
                }
            } else if (!clicked) {
                if (this.dragStartNode.owner === 'player') this.dragStartNode.tunnelTo = null;
                if (this.selectedNode) { this.selectedNode.isSelected = false; this.selectedNode.redraw(); }
                this.selectedNode = null;
            } else if (clicked === this.dragStartNode) {
                if (this.evoMenu.classList.contains('hidden')) {
                    if (this.selectedNode && this.selectedNode !== clicked) {
                        this.world.sendTroops(this.selectedNode, clicked, this.sendPercent);
                        if (this.sfx) this.sfx.move();
                        this.selectedNode.isSelected = false;
                        this.selectedNode.redraw();
                        this.selectedNode = null;
                    } else if (this.selectedNode === clicked) {
                        this.selectedNode.isSelected = false;
                        this.selectedNode.redraw();
                        this.selectedNode = null;
                    } else {
                        if (this.world.countAt(clicked, 'player') > 0) {
                            if (this.sfx) this.sfx.click();
                            this.selectedNode = clicked;
                            this.selectedNode.isSelected = true;
                            this.selectedNode.redraw();
                        }
                    }
                }
            }
        }
        this.dragStartNode = null;
    }

    onWheel(e) {
        if (this.ui.gameState !== 'PLAYING' || this.ui.isPaused || !this.game.world) return;
        let zoomFactor = 1.1;
        let newScale = e.deltaY < 0 ? this.game.world.scale.x * zoomFactor : this.game.world.scale.x / zoomFactor;
        newScale = Math.max(0.3, Math.min(2.5, newScale));

        let point = new PIXI.Point();
        this.game.world.worldTransform.applyInverse({ x: this.mouseX, y: this.mouseY }, point);

        this.game.world.scale.set(newScale);
        this.game.world.position.x = this.mouseX - point.x * newScale;
        this.game.world.position.y = this.mouseY - point.y * newScale;
    }

    onRightClick(e) {
        if (this.ui.gameState !== 'PLAYING' || this.ui.isPaused) return;
        this.updateMouseCoords(e.clientX, e.clientY);
        let clicked = this.world.nodes.find(n => n.containsPoint(this.worldMouseX, this.worldMouseY));
        if (clicked) this.world.recallToHome(clicked);
    }

    doZoom(factor) {
        if (!this.game.world) return;
        let cx = window.innerWidth / 2;
        let cy = window.innerHeight / 2;
        let point = new PIXI.Point();
        this.game.world.worldTransform.applyInverse({ x: cx, y: cy }, point);
        let newScale = this.game.world.scale.x * factor;
        newScale = Math.max(0.3, Math.min(2.5, newScale));
        this.game.world.scale.set(newScale);
        this.game.world.position.x = cx - point.x * newScale;
        this.game.world.position.y = cy - point.y * newScale;
    }

    showEvolutionMenu(node) {
        this.selectedNode = node;
        const screenX = node.x * this.game.world.scale.x + this.game.world.position.x;
        const screenY = node.y * this.game.world.scale.y + this.game.world.position.y;

        this.evoMenu.style.left = `${screenX}px`;
        this.evoMenu.style.top = `${screenY}px`;
        this.evoMenu.classList.remove('hidden');

        const buttons = Array.from(document.querySelectorAll('.evo-btn'));
        const currentTroops = this.world.countAt(node, 'player');
        const expansionRadius = node.radius + 45;
        const baseAngle = -Math.PI / 2;
        const arcSpread = Math.PI * 0.85;

        const evoButtons = buttons.filter(b => b.dataset.evo !== 'cancel');
        const cancelBtn = buttons.find(b => b.dataset.evo === 'cancel');

        evoButtons.forEach((btn, idx) => {
            const angle = baseAngle - (arcSpread / 2) + (idx * (arcSpread / (evoButtons.length - 1)));
            const x = Math.cos(angle) * expansionRadius;
            const y = Math.sin(angle) * expansionRadius;
            btn.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
            const cost = Node.EVOLUTION_COSTS[btn.dataset.evo];
            btn.disabled = currentTroops < cost;
        });

        if (cancelBtn) cancelBtn.style.transform = `translate(-50%, ${node.radius + 15}px)`;
    }

    onEvoButtonClick(btn) {
        const type = btn.dataset.evo;
        this.evoMenu.classList.add('hidden');
        if (type === 'cancel' || !this.selectedNode) return;
        const cost = Node.EVOLUTION_COSTS[type];
        if (this.world.countAt(this.selectedNode, 'player') >= cost) {
            this.world.killNPower(this.selectedNode, 'player', cost);
            this.selectedNode.evolution = type;
            if (type === 'artilleria') this.selectedNode.artilleryInterval = 0.8;
            this.selectedNode.redraw();
            if (this.sfx) this.sfx.evolve();
        }
    }

    handleCampaignInput(e, type) {
        // Obtenemos la instancia de campaña desde main (o vía callback)
        // Por simplicidad, asumimos que MapVisuals tiene acceso a los datos
        const campaign = window.campaign; // Necesitaremos exponerlo o pasar el core
        if (!campaign || !campaign.visuals) return;

        const visuals = campaign.visuals;
        if (type === 'move') {
            visuals.checkHover(this.mouseX, this.mouseY);
        } else if (type === 'down') {
            visuals.checkClick(this.mouseX, this.mouseY);
        }
    }

    draw(ctx) {
        if (this.ui.gameState !== 'PLAYING' || this.ui.isPaused) return;

        // 1. Dibujar línea de arrastre (flecha logística o ataque)
        if (this.dragStartNode) {
            const w = this.game.world;
            const startX = this.dragStartNode.x * w.scale.x + w.position.x;
            const startY = this.dragStartNode.y * w.scale.y + w.position.y;

            this.drawArrow(ctx, startX, startY, this.mouseX, this.mouseY, this.dragStartNode.owner);
        }
    }

    drawArrow(ctx, x1, y1, x2, y2, owner) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 10) return;

        // BUGFIX #1: 'angle' nunca estaba definida. Se calcula aquí.
        const angle = Math.atan2(dy, dx);

        const factionData = FACTIONS.find(f => f.id === owner);
        const color = factionData ? `#${factionData.color.toString(16).padStart(6, '0')}` : (owner === 'player' ? '#3498db' : '#e74c3c');

        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 4;
        ctx.globalAlpha = 0.85;

        // Línea principal
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        // Punta de flecha
        const headLen = 15;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();

        ctx.globalAlpha = 1.0;
    }
}
