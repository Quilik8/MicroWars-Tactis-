/**
 * InputManager — MicroWars v2
 *
 * ── PC ──────────────────────────────────────────────────────────
 *  LMB click nodo propio (sin selección)      → selecciona (toggle)
 *  LMB click mismo nodo seleccionado          → deselecciona
 *  LMB click nodo distinto (con selección)    → envía tropas → deselecciona
 *  LMB drag nodo → cualquier nodo             → envía tropas (flecha sólida)
 *  LMB click/drag → vacío                     → deselecciona / pan
 *  Doble LMB nodo propio sin evolución        → menú de evolución
 *
 *  RMB drag nodo propio → nodo propio         → crea línea de suministro
 *  RMB click nodo propio (con selección)      → crea túnel: selectedNode → este
 *  RMB click nodo propio sin túnel (sin sel)  → recallToHome
 *  RMB click nodo propio CON túnel (sin sel)  → elimina el túnel (toggle off)
 *  RMB click vacío                            → deselecciona todo
 *
 *  ESC                                        → deselecciona / cancela todo
 *  SPACE                                      → pausa
 *  Rueda del ratón                            → zoom hacia cursor
 *
 * ── MOBILE (pointerType === 'touch') ────────────────────────────
 *  Tap corto  (<480 ms, <8 px de movimiento)  → mismo que LMB click
 *  Long press (≥480 ms, sin moverse)          → activa "modo túnel"
 *    · Tap en nodo propio destino             → crea túnel, sale del modo
 *    · Tap en vacío / cualquier otro          → cancela modo túnel
 *  Drag (≥8 px de movimiento)                 → envía tropas (flecha sólida)
 *  Pinch (dos dedos)                          → zoom
 *
 * ── THRESHOLD ───────────────────────────────────────────────────
 *  DRAG_THRESHOLD = 8 px  →  click no activa el modo drag aunque haya vibración
 */

import { PIXI } from '../core/engine.js';
import { Node } from '../entities/node.js';
import { FACTIONS } from '../campaign/faction_data.js';
import { CombatManager } from './combat_manager.js';

// ── Constantes de interacción ────────────────────────────────────
const DRAG_THRESHOLD  = 8;    // px mínimos para distinguir click de drag
const LONG_PRESS_MS   = 480;  // ms para activar modo túnel en mobile
const DBL_CLICK_MS    = 300;  // ventana de doble clic/tap
const TUNNEL_COST     = 15;   // tropas que cuesta crear una línea de suministro

export class InputManager {
    constructor(game, world, ui, sfx) {
        this.game  = game;
        this.world = world;
        this.ui    = ui;
        this.sfx   = sfx;

        // Posición del puntero en pantalla y en espacio de mundo
        this.mouseX      = 0;
        this.mouseY      = 0;
        this.worldMouseX = 0;
        this.worldMouseY = 0;

        // ── Selección ─────────────────────────────────────────────
        this.selectedNode = null;

        // ── Drag ──────────────────────────────────────────────────
        this.dragStartNode = null;
        this.dragStartX    = 0;
        this.dragStartY    = 0;
        this.isDragging    = false;   // true cuando supera DRAG_THRESHOLD
        this.dragButton    = 0;       // 0 = LMB, 2 = RMB
        this.dragMode      = null;    // 'attack' | 'tunnel'

        // ── Modo túnel mobile (long press → espera destino) ───────
        this.tunnelSourceNode = null;
        this._longPressTimer  = null;
        this._longPressNode   = null;

        // ── Pinch zoom (mobile, dos dedos) ────────────────────────
        this._pinchActive    = false;
        this._pinchDist      = 0;
        this._activeTouches  = {};    // pointerId → {x, y}

        // ── Pan de cámara ─────────────────────────────────────────
        this.isPanning  = false;
        this.panStart   = { x: 0, y: 0 };
        this.worldStart = { x: 0, y: 0 };

        // ── Doble clic / doble tap ────────────────────────────────
        this.lastClickTime = 0;
        this.lastClickNode = null;

        this.sendPercent = 0.5;
        this.evoMenu     = null;
    }

    // ─── API pública ──────────────────────────────────────────────
    setSendPercent(val) {
        this.sendPercent = Math.max(0.01, Math.min(1.0, val));
    }

    init() {
        this.evoMenu = document.getElementById('evolutionMenu');
        this.setupListeners();
    }

    // ═══════════════════════════════════════════════════════════════
    // REGISTRO DE LISTENERS
    // ═══════════════════════════════════════════════════════════════
    setupListeners() {
        this._handlers = {
            move:    (e) => this.onPointerMove(e),
            down:    (e) => this.onPointerDown(e),
            up:      (e) => this.onPointerUp(e),
            cancel:  (e) => this._onPointerCancel(e),
            wheel:   (e) => this.onWheel(e),
            context: (e) => e.preventDefault(),   // solo suprime menú del navegador
            keydown: (e) => this._onKeyDown(e),
        };

        window.addEventListener('pointermove',  this._handlers.move);
        window.addEventListener('pointerdown',  this._handlers.down);
        window.addEventListener('pointerup',    this._handlers.up);
        window.addEventListener('pointercancel',this._handlers.cancel);
        window.addEventListener('wheel',        this._handlers.wheel, { passive: true });
        window.addEventListener('contextmenu',  this._handlers.context);
        window.addEventListener('keydown',      this._handlers.keydown);

        if (this.evoMenu) {
            this.evoMenu.addEventListener('click', (e) => {
                const btn = e.target.closest('.evo-btn');
                if (btn) this.onEvoButtonClick(btn);
            });
        }
    }

    destroy() {
        window.removeEventListener('pointermove',   this._handlers.move);
        window.removeEventListener('pointerdown',   this._handlers.down);
        window.removeEventListener('pointerup',     this._handlers.up);
        window.removeEventListener('pointercancel', this._handlers.cancel);
        window.removeEventListener('wheel',         this._handlers.wheel);
        window.removeEventListener('contextmenu',   this._handlers.context);
        window.removeEventListener('keydown',       this._handlers.keydown);
        this._cancelLongPress();
    }

    // ═══════════════════════════════════════════════════════════════
    // HELPERS INTERNOS
    // ═══════════════════════════════════════════════════════════════
    updateMouseCoords(clientX, clientY) {
        this.mouseX = clientX;
        this.mouseY = clientY;
        const w = this.game.world;
        if (w) {
            this.worldMouseX = (clientX - w.position.x) / w.scale.x;
            this.worldMouseY = (clientY - w.position.y) / w.scale.y;
        } else {
            this.worldMouseX = clientX;
            this.worldMouseY = clientY;
        }
    }

    _nodeAt(wx, wy) {
        for (let n of this.world.nodes) {
            if (n.containsPoint(wx, wy)) return n;
        }
        return null;
    }

    // FIX: Se añade #evolutionMenu a la lista de elementos UI.
    // Sin esto, al hacer clic en un botón de evolución, pointerdown disparaba
    // _deselect() porque el botón no estaba sobre un nodo, borrando selectedNode
    // antes de que onEvoButtonClick pudiera usarlo.
    _isOnUI(e) {
        return !!(
            e.target.closest('#sendBar')       ||
            e.target.closest('#hud')           ||
            e.target.id === 'pauseBtn'         ||
            e.target.closest('#uiLayer')       ||
            e.target.closest('#evolutionMenu')
        );
    }

    // Seleccionar nodo: actualiza estado visual
    _select(node) {
        if (this.selectedNode && this.selectedNode !== node) {
            this.selectedNode.isSelected = false;
            this.selectedNode.redraw();
        }
        this.selectedNode    = node;
        node.isSelected      = true;
        node.redraw();
        if (this.sfx) this.sfx.click();
    }

    // Deseleccionar: limpia todo estado visual y modo túnel mobile
    _deselect() {
        if (this.selectedNode) {
            this.selectedNode.isSelected = false;
            this.selectedNode.redraw();
            this.selectedNode = null;
        }
        this.tunnelSourceNode = null;
        this._cancelLongPress();
    }

    _cancelLongPress() {
        if (this._longPressTimer) {
            clearTimeout(this._longPressTimer);
            this._longPressTimer = null;
        }
        this._longPressNode = null;
    }

    // Crear túnel logístico de src → dst. Devuelve true si tuvo éxito.
    _createTunnel(src, dst) {
        if (!src || !dst || src === dst) return false;
        if (src.owner !== 'player' || dst.owner !== 'player') return false;
        if (src.type === 'tunel') return false;

        // Toggle: si ya apunta a ese destino, eliminarlo
        if (src.tunnelTo === dst) {
            src.tunnelTo = null;
            src.redraw();
            return true;
        }

        if (this.world.countAt(src, 'player') < TUNNEL_COST) return false;

        CombatManager.killNPower(this.world, src, 'player', TUNNEL_COST);
        src.tunnelTo = dst;
        src.redraw();
        if (this.sfx) this.sfx.evolve();
        return true;
    }

    // ═══════════════════════════════════════════════════════════════
    // POINTER DOWN
    // ═══════════════════════════════════════════════════════════════
    onPointerDown(e) {
        const isTouch = e.pointerType === 'touch';

        // ── Pinch zoom (mobile, segundo dedo) ──────────────────────
        if (isTouch) {
            this._activeTouches[e.pointerId] = { x: e.clientX, y: e.clientY };
            const ids = Object.keys(this._activeTouches);
            if (ids.length === 2) {
                const a = this._activeTouches[ids[0]];
                const b = this._activeTouches[ids[1]];
                this._pinchDist   = Math.hypot(b.x - a.x, b.y - a.y);
                this._pinchActive = true;
                this._cancelLongPress();
                this.dragStartNode = null;
                this.isPanning     = false;
                return;
            }
        }

        const canInteract = (this.ui.gameState === 'PLAYING' && !this.ui.isPaused) ||
                             this.ui.gameState === 'CAMPAIGN';
        if (!canInteract) return;
        if (!this.isPanning && this._isOnUI(e)) return;

        this.updateMouseCoords(e.clientX, e.clientY);

        if (this.ui.gameState === 'CAMPAIGN') {
            this.handleCampaignInput(e, 'down');
            return;
        }

        // Cerrar evo menu si clic fuera de él
        if (this.evoMenu && !this.evoMenu.classList.contains('hidden') &&
            !this.evoMenu.contains(e.target)) {
            this.evoMenu.classList.add('hidden');
        }

        const clicked = this._nodeAt(this.worldMouseX, this.worldMouseY);

        // ── RMB (solo desktop) ──────────────────────────────────────
        if (e.button === 2) {
            if (clicked) {
                this.dragStartNode = clicked;
                this.dragStartX    = e.clientX;
                this.dragStartY    = e.clientY;
                this.isDragging    = false;
                this.dragButton    = 2;
                this.dragMode      = 'tunnel';
            }
            return; // la acción se completa en pointerUp
        }

        // ── LMB / Touch ─────────────────────────────────────────────
        if (e.button !== 0) return;

        if (clicked) {
            this.dragStartNode = clicked;
            this.dragStartX    = e.clientX;
            this.dragStartY    = e.clientY;
            this.isDragging    = false;
            this.dragButton    = 0;
            this.dragMode      = 'attack';

            // Mobile: iniciar long press para modo túnel
            if (isTouch && clicked.owner === 'player' && clicked.type !== 'tunel') {
                this._cancelLongPress();
                this._longPressNode  = clicked;
                this._longPressTimer = setTimeout(() => {
                    if (!this.isDragging && this._longPressNode === clicked) {
                        if (this.selectedNode) {
                            this.selectedNode.isSelected = false;
                            this.selectedNode.redraw();
                            this.selectedNode = null;
                        }
                        this.tunnelSourceNode = clicked;
                        this._longPressNode   = null;
                        if (this.sfx) this.sfx.click();
                    }
                }, LONG_PRESS_MS);
            }

        } else {
            // Touch/click en vacío
            this.dragStartNode = null;

            // Modo túnel mobile activo: cancelar con tap en vacío
            if (this.tunnelSourceNode) {
                this.tunnelSourceNode = null;
                this._cancelLongPress();
                return;
            }

            this._deselect();

            // Iniciar pan de cámara
            const w = this.game.world;
            if (w) {
                this.isPanning  = true;
                this.panStart   = { x: this.mouseX, y: this.mouseY };
                this.worldStart = { x: w.position.x, y: w.position.y };
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // POINTER MOVE
    // ═══════════════════════════════════════════════════════════════
    onPointerMove(e) {
        // Pinch zoom (mobile)
        if (e.pointerType === 'touch' && this._activeTouches[e.pointerId]) {
            this._activeTouches[e.pointerId] = { x: e.clientX, y: e.clientY };
            const ids = Object.keys(this._activeTouches);
            if (ids.length === 2 && this._pinchActive) {
                const a = this._activeTouches[ids[0]];
                const b = this._activeTouches[ids[1]];
                const newDist = Math.hypot(b.x - a.x, b.y - a.y);
                if (this._pinchDist > 0) {
                    const factor   = newDist / this._pinchDist;
                    const midX     = (a.x + b.x) / 2;
                    const midY     = (a.y + b.y) / 2;
                    this._applyZoom(factor, midX, midY);
                }
                this._pinchDist = newDist;
                return;
            }
        }

        const onUI = this._isOnUI(e);
        if (!this.isPanning && onUI) return;

        this.updateMouseCoords(e.clientX, e.clientY);

        if (this.ui.gameState === 'CAMPAIGN') {
            this.handleCampaignInput(e, 'move');
            return;
        }

        // Pan de cámara
        const w = this.game.world;
        if (this.isPanning && w) {
            w.position.x = this.worldStart.x + (this.mouseX - this.panStart.x);
            w.position.y = this.worldStart.y + (this.mouseY - this.panStart.y);
        }

        // Detectar si se superó el threshold de drag
        if (this.dragStartNode && !this.isDragging) {
            const dx = e.clientX - this.dragStartX;
            const dy = e.clientY - this.dragStartY;
            if (dx * dx + dy * dy >= DRAG_THRESHOLD * DRAG_THRESHOLD) {
                this.isDragging = true;
                this._cancelLongPress(); // el drag cancela el long press
            }
        }

        // Hover de nodos
        for (let n of this.world.nodes) {
            n.hovered = n.containsPoint(this.worldMouseX, this.worldMouseY);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // POINTER UP
    // ═══════════════════════════════════════════════════════════════
    onPointerUp(e) {
        // Limpiar tracking de touch
        if (e.pointerType === 'touch') {
            delete this._activeTouches[e.pointerId];
            if (Object.keys(this._activeTouches).length < 2) {
                this._pinchActive = false;
                this._pinchDist   = 0;
            }
            if (this._pinchActive) {
                // Aún quedan dos dedos: no procesar como click
                return;
            }
        }

        if (this.ui.gameState !== 'PLAYING' || this.ui.isPaused) {
            this.isPanning = false;
            this._cancelLongPress();
            return;
        }

        this.updateMouseCoords(e.clientX, e.clientY);
        this.isPanning = false;
        this._cancelLongPress();

        const clicked     = this._nodeAt(this.worldMouseX, this.worldMouseY);
        const wasDragging = this.isDragging;
        const src         = this.dragStartNode;
        const btn         = this.dragButton;

        // Limpiar estado de drag
        this.dragStartNode = null;
        this.isDragging    = false;
        this.dragButton    = 0;
        this.dragMode      = null;

        // ════ RMB UP ════════════════════════════════════════════════
        if (e.button === 2 || btn === 2) {
            this._handleRMBUp(src, clicked, wasDragging);
            return;
        }

        // ════ LMB / TOUCH UP ════════════════════════════════════════
        if (e.button !== 0) return;
        if (!src) return;

        if (wasDragging) {
            // Drag LMB: envío de tropas (nunca crea túnel)
            if (clicked && clicked !== src && src.owner === 'player') {
                this.world.sendTroops(src, clicked, this.sendPercent);
                if (this.sfx) this.sfx.move();
            }
            if (!clicked) this._deselect();
        } else {
            // Click / tap sin drag
            this._handleLMBClick(src, clicked);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // LÓGICA DE CLICK LMB
    // ═══════════════════════════════════════════════════════════════
    _handleLMBClick(src, clicked) {
        // ── Modo túnel mobile activo ──────────────────────────────
        if (this.tunnelSourceNode) {
            if (clicked && clicked.owner === 'player' && clicked !== this.tunnelSourceNode) {
                this._createTunnel(this.tunnelSourceNode, clicked);
            }
            this.tunnelSourceNode = null;
            return;
        }

        // ── Doble clic / doble tap ────────────────────────────────
        const now = Date.now();
        if (clicked && clicked === this.lastClickNode &&
            (now - this.lastClickTime) < DBL_CLICK_MS) {
            this.lastClickTime = 0;
            this.lastClickNode = null;

            if (clicked.owner === 'player' && !clicked.evolution && clicked.type !== 'tunel') {
                this.showEvolutionMenu(clicked);
                return;
            }
            // Doble clic en nodo túnel propio: teletransportar tropas
            if (clicked.type === 'tunel' && clicked.owner === 'player' && clicked.tunnelTo) {
                const dest = clicked.tunnelTo;
                for (let u of this.world.allUnits) {
                    if (u.faction === 'player' && u.targetNode === clicked && u.state === 'idle') {
                        u.x          = dest.x + (Math.random() - 0.5) * dest.radius * 0.5;
                        u.y          = dest.y + (Math.random() - 0.5) * dest.radius * 0.5;
                        u.targetNode = dest;
                        u.homeNode   = dest;
                        u.state      = 'idle';
                    }
                }
                return;
            }
        }
        if (clicked) {
            this.lastClickTime = now;
            this.lastClickNode = clicked;
        }

        // ── Click en vacío → deseleccionar ───────────────────────
        if (!clicked) {
            this._deselect();
            return;
        }

        // ── Hay selección + clic en nodo distinto → enviar tropas ─
        if (this.selectedNode && this.selectedNode !== clicked) {
            if (this.selectedNode.owner === 'player') {
                this.world.sendTroops(this.selectedNode, clicked, this.sendPercent);
                if (this.sfx) this.sfx.move();
            }
            this._deselect();
            return;
        }

        // ── Toggle de selección en el mismo nodo ─────────────────
        if (this.selectedNode === clicked) {
            this._deselect();
            return;
        }

        // ── Seleccionar nodo propio con tropas ────────────────────
        if (clicked.owner === 'player' && this.world.countAt(clicked, 'player') > 0) {
            this._select(clicked);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // LÓGICA DE RMB UP
    // ═══════════════════════════════════════════════════════════════
    _handleRMBUp(src, clicked, wasDragging) {
        // Drag RMB entre dos nodos propios → crear túnel
        if (wasDragging && src && clicked && clicked !== src) {
            if (src.owner === 'player' && clicked.owner === 'player') {
                this._createTunnel(src, clicked);
            }
            this._deselect();
            return;
        }

        // Click RMB en vacío → deseleccionar
        if (!clicked) {
            this._deselect();
            return;
        }

        // Click RMB con selección activa en nodo propio → crear túnel
        if (this.selectedNode && this.selectedNode !== clicked &&
            this.selectedNode.owner === 'player' && clicked.owner === 'player') {
            this._createTunnel(this.selectedNode, clicked);
            this._deselect();
            return;
        }

        // Click RMB en nodo propio sin selección
        if (clicked.owner === 'player') {
            if (clicked.tunnelTo) {
                // Tiene túnel activo → eliminarlo
                clicked.tunnelTo = null;
                clicked.redraw();
            } else {
                // Sin túnel → recallToHome (retirar tropas)
                this.world.recallToHome(clicked);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // CANCELACIÓN (pointer sale de la ventana, etc.)
    // ═══════════════════════════════════════════════════════════════
    _onPointerCancel(e) {
        if (e.pointerType === 'touch') {
            delete this._activeTouches[e.pointerId];
        }
        this.isPanning     = false;
        this.dragStartNode = null;
        this.isDragging    = false;
        this.dragButton    = 0;
        this.dragMode      = null;
        this._cancelLongPress();
        this.tunnelSourceNode = null;
        this._pinchActive = false;
    }

    // ═══════════════════════════════════════════════════════════════
    // TECLADO
    // ═══════════════════════════════════════════════════════════════
    _onKeyDown(e) {
        if (e.code === 'Escape') {
            this._deselect();
            if (this.evoMenu) this.evoMenu.classList.add('hidden');
            return;
        }
        if (e.code === 'Space') {
            if (this.ui.callbacks && this.ui.callbacks.onTogglePause) {
                this.ui.callbacks.onTogglePause();
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // RUEDA / ZOOM
    // ═══════════════════════════════════════════════════════════════
    onWheel(e) {
        if (this.ui.gameState !== 'PLAYING' || this.ui.isPaused || !this.game.world) return;
        const factor = e.deltaY < 0 ? 1.1 : (1 / 1.1);
        this._applyZoom(factor, this.mouseX, this.mouseY);
    }

    _applyZoom(factor, cx, cy) {
        const w = this.game.world;
        if (!w) return;
        let newScale = w.scale.x * factor;
        newScale = Math.max(0.3, Math.min(2.5, newScale));
        const point = new PIXI.Point();
        w.worldTransform.applyInverse({ x: cx, y: cy }, point);
        w.scale.set(newScale);
        w.position.x = cx - point.x * newScale;
        w.position.y = cy - point.y * newScale;
    }

    doZoom(factor) {
        this._applyZoom(factor, window.innerWidth / 2, window.innerHeight / 2);
    }

    // ═══════════════════════════════════════════════════════════════
    // MENÚ DE EVOLUCIÓN
    // ═══════════════════════════════════════════════════════════════
    showEvolutionMenu(node) {
        if (!this.evoMenu) return;
        this.selectedNode = node;
        const w       = this.game.world;
        const screenX = node.x * w.scale.x + w.position.x;
        const screenY = node.y * w.scale.y + w.position.y;

        this.evoMenu.style.left = `${screenX}px`;
        this.evoMenu.style.top  = `${screenY}px`;
        this.evoMenu.classList.remove('hidden');

        const buttons         = Array.from(document.querySelectorAll('.evo-btn'));
        const currentTroops   = this.world.countAt(node, 'player');
        const expansionRadius = node.radius + 45;
        const baseAngle       = -Math.PI / 2;
        const arcSpread       = Math.PI * 0.85;

        const evoButtons = buttons.filter(b => b.dataset.evo !== 'cancel');
        const cancelBtn  = buttons.find(b => b.dataset.evo === 'cancel');

        evoButtons.forEach((btn, idx) => {
            const angle = baseAngle - (arcSpread / 2) +
                          (idx * (arcSpread / Math.max(1, evoButtons.length - 1)));
            const x = Math.cos(angle) * expansionRadius;
            const y = Math.sin(angle) * expansionRadius;
            btn.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
            const cost   = Node.EVOLUTION_COSTS[btn.dataset.evo];
            btn.disabled = currentTroops < cost;
        });

        if (cancelBtn) {
            cancelBtn.style.transform = `translate(-50%, ${node.radius + 15}px)`;
        }
    }

    onEvoButtonClick(btn) {
        const type = btn.dataset.evo;
        this.evoMenu.classList.add('hidden');
        if (type === 'cancel' || !this.selectedNode) return;
        const cost = Node.EVOLUTION_COSTS[type];
        if (this.world.countAt(this.selectedNode, 'player') >= cost) {
            CombatManager.killNPower(this.world, this.selectedNode, 'player', cost);
            this.selectedNode.evolution = type;
            if (type === 'artilleria') this.selectedNode.artilleryInterval = 1.0;
            this.selectedNode.redraw();
            if (this.sfx) this.sfx.evolve();
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // CAMPAÑA
    // ═══════════════════════════════════════════════════════════════
    handleCampaignInput(e, type) {
        const campaign = window.campaign;
        if (!campaign || !campaign.visuals) return;
        const visuals = campaign.visuals;
        if (type === 'move')       visuals.checkHover(this.mouseX, this.mouseY);
        else if (type === 'down')  visuals.checkClick(this.mouseX, this.mouseY);
    }

    // ═══════════════════════════════════════════════════════════════
    // DRAW — llamado cada frame desde game.onDraw (uiCanvas 2D)
    // ═══════════════════════════════════════════════════════════════
    draw(ctx) {
        if (this.ui.gameState !== 'PLAYING' || this.ui.isPaused) return;
        const w = this.game.world;
        if (!w) return;

        const now = performance.now();

        // ── 1. Línea de arrastre activa (solo si supera threshold) ──
        if (this.dragStartNode && this.isDragging) {
            const sx = this.dragStartNode.x * w.scale.x + w.position.x;
            const sy = this.dragStartNode.y * w.scale.y + w.position.y;

            if (this.dragMode === 'tunnel') {
                this._drawTunnelLine(ctx, sx, sy, this.mouseX, this.mouseY, now);
            } else {
                this._drawAttackArrow(ctx, sx, sy, this.mouseX, this.mouseY,
                                      this.dragStartNode.owner);
            }
        }

        // ── 2. Modo túnel mobile: halo en nodo fuente + línea al cursor ──
        if (this.tunnelSourceNode) {
            const sx = this.tunnelSourceNode.x * w.scale.x + w.position.x;
            const sy = this.tunnelSourceNode.y * w.scale.y + w.position.y;
            const sr = this.tunnelSourceNode.radius * w.scale.x;

            // Halo pulsante doble
            const pulse = 0.5 + 0.5 * Math.sin(now * 0.007);
            ctx.save();
            ctx.beginPath();
            ctx.arc(sx, sy, sr + 6 + pulse * 8, 0, Math.PI * 2);
            ctx.strokeStyle = '#f39c12';
            ctx.lineWidth   = 2.5;
            ctx.globalAlpha = 0.8 * pulse;
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(sx, sy, sr + 14 + pulse * 4, 0, Math.PI * 2);
            ctx.lineWidth   = 1.2;
            ctx.globalAlpha = 0.35 * pulse;
            ctx.stroke();
            ctx.restore();

            // Línea punteada hacia el cursor (solo si el cursor se movió del nodo)
            const dx = this.mouseX - sx;
            const dy = this.mouseY - sy;
            if (dx * dx + dy * dy > (sr + 20) * (sr + 20)) {
                this._drawTunnelLine(ctx, sx, sy, this.mouseX, this.mouseY, now);
            }
        }

        // ── 3. Previsualización de flecha desde nodo seleccionado ──
        //    Solo cuando el cursor está sobre un nodo destino válido
        if (this.selectedNode && !this.isDragging && !this.tunnelSourceNode) {
            let hovered = null;
            for (let n of this.world.nodes) {
                if (n.hovered && n !== this.selectedNode) { hovered = n; break; }
            }
            if (hovered) {
                const sx = this.selectedNode.x * w.scale.x + w.position.x;
                const sy = this.selectedNode.y * w.scale.y + w.position.y;
                const tx = hovered.x * w.scale.x + w.position.x;
                const ty = hovered.y * w.scale.y + w.position.y;
                this._drawAttackArrow(ctx, sx, sy, tx, ty, this.selectedNode.owner, 0.40);
            }
        }
    }

    // ─── Flecha sólida de ataque / envío de tropas ────────────────
    _drawAttackArrow(ctx, x1, y1, x2, y2, owner, alphaOverride) {
        const dx   = x2 - x1;
        const dy   = y2 - y1;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 10) return;

        const angle = Math.atan2(dy, dx);
        const fData = FACTIONS.find(f => f.id === owner);
        const color = fData
            ? `#${fData.color.toString(16).padStart(6, '0')}`
            : (owner === 'player' ? '#3498db' : '#e74c3c');

        ctx.save();
        ctx.strokeStyle   = color;
        ctx.fillStyle     = color;
        ctx.lineWidth     = 3.5;
        ctx.globalAlpha   = alphaOverride ?? 0.88;
        ctx.setLineDash([]);
        ctx.lineCap       = 'round';

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

    // ─── Línea punteada animada para modo túnel ───────────────────
    _drawTunnelLine(ctx, x1, y1, x2, y2, now) {
        const dx   = x2 - x1;
        const dy   = y2 - y1;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 12) return;

        const dashOffset = -(now * 0.09) % 24;

        ctx.save();

        // Halo exterior suave
        ctx.strokeStyle   = '#f39c12';
        ctx.lineWidth     = 5;
        ctx.globalAlpha   = 0.18;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        // Línea punteada animada principal
        ctx.strokeStyle    = '#f39c12';
        ctx.lineWidth      = 2.5;
        ctx.globalAlpha    = 0.92;
        ctx.setLineDash([10, 14]);
        ctx.lineDashOffset = dashOffset;
        ctx.lineCap        = 'round';
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        // Círculo indicador en el destino
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(x2, y2, 7, 0, Math.PI * 2);
        ctx.fillStyle   = '#f39c12';
        ctx.globalAlpha = 0.88;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth   = 1.5;
        ctx.globalAlpha = 0.70;
        ctx.stroke();

        ctx.restore();
    }

    // ─── Alias de compatibilidad (por si algo externo los llama) ──
    drawArrow(ctx, x1, y1, x2, y2, owner) {
        this._drawAttackArrow(ctx, x1, y1, x2, y2, owner);
    }
    onRightClick() { /* ahora gestionado en _handleRMBUp vía pointerUp */ }
}
