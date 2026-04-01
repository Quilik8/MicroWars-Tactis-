/**
 * LightSweep — "Rayo de Sol" (Nivel 8)
 *
 * VISUAL: Tres esferas/orbs de calor (estilo lupa solar) cruzan el mapa
 * rápidamente de izquierda a derecha. Cada orb es un círculo brillante con
 * núcleo blanco y anillo ámbar/naranja caliente.
 *
 * MECÁNICA: Al pasar un orb sobre un nodo marcado (isMarkedForSweep):
 *   1. El nodo pasa a NEUTRAL (owner = 'neutral').
 *   2. Pierde cualquier evolución (evolution = null).
 *   3. Se rompen túneles logísticos conectados.
 *   4. Las hormigas NO mueren — conservan su facción.
 *   ★ Afecta a TODOS los dueños (jugador, enemigos, neutral).
 *
 * FASES:
 *   waiting  → espera cooldown segundos
 *   alerting → 3.5 s de alerta (nodos parpadean, barra pulsante lateral)
 *   sweeping → 3 orbs cruzan el mapa rápidamente (stagger de 90 px)
 */
export class LightSweep {
    constructor(config) {
        this.speed         = config.speed        || 420;   // px/s
        this.cooldown      = config.cooldown     || 15;    // s entre barridas
        this.initialDelay  = config.initialDelay || 14;    // s antes de la primera
        this.alertDuration = 3.5;                          // s de alerta visual
        this.orbRadius     = config.orbRadius    || 15;    // tamaño visual/colisión
        
        // Array de Y relativas donde viajarán los orbes
        // ej: [0.12, 0.18, 0.25, 0.48]
        this.rails         = config.rails        || [0.5]; 

        // Orbes activos
        this.orbs = [];  // { worldX, worldY }

        const rawColor = config.color || 0xff8c00;
        this.color     = rawColor;
        this.colorCss  = '#' + rawColor.toString(16).padStart(6, '0');

        this.state  = 'waiting';
        this.timer  = this.initialDelay;

        this._resetThisCycle = new Set();
        this._gfx = null;
    }

    initGraphics(PIXI, layerVFX) {
        this._gfx = new PIXI.Graphics();
        layerVFX.addChild(this._gfx);
    }

    destroy() {
        if (this._gfx && !this._gfx.destroyed) this._gfx.destroy();
        this._gfx = null;
    }

    update(dt, allUnits, nodes, game) {
        const w = game.world;

        // Pulso de alerta para nodos marcados
        const isAlert = this.state === 'alerting';
        for (let node of nodes) {
            if (node.isMarkedForSweep) node._sweepAlerting = isAlert;
        }

        switch (this.state) {
            case 'waiting':
                if (this._gfx) this._gfx.clear();
                this.timer -= dt;
                if (this.timer <= 0) {
                    this.state = 'alerting';
                    this.timer = this.alertDuration;
                    this._resetThisCycle.clear();
                }
                break;

            case 'alerting':
                if (this._gfx) this._gfx.clear();
                this.timer -= dt;
                if (this.timer <= 0) {
                    // Inicializar orbes en los rieles configurados
                    const scaleX = (w ? w.scale.x : 1) || 1;
                    const scaleY = (w ? w.scale.y : 1) || 1;
                    const offsetX = (w ? w.position.x : 0) || 0;
                    const offsetY = (w ? w.position.y : 0) || 0;

                    this.orbs = [];
                    // El orbe arranca fuera de la pantalla por la izquierda
                    let startX = (0 - offsetX) / scaleX - (this.orbRadius * 2);

                    // Pequeño stagger aleatorio (desfase en X) opcional
                    for (let relativeY of this.rails) {
                        // Coordenada Y en mundo (el nivel usa px absolutos basados en alto de ventana pre-cámara)
                        const screenHeightAtInit = game.height || window.innerHeight;
                        const worldY = relativeY * screenHeightAtInit;
                        // Ojo: los nodos están en Y = relativeY * cy
                        // Usamos lo mismo que LevelManager (cy = game.height)

                        this.orbs.push({
                            worldX: startX - Math.random() * 40, // stagger de hasta 40px
                            worldY: worldY
                        });
                    }

                    this.state = 'sweeping';
                }
                break;

            case 'sweeping': {
                if (this._gfx) this._gfx.clear();

                const scaleX = (w ? w.scale.x : 1) || 1;
                const worldSpeed = this.speed / scaleX;
                let allFinished = true;

                // Actualizar X de cada orbe
                for (let orb of this.orbs) {
                    orb.worldX += worldSpeed * dt;

                    const screenX = orb.worldX * scaleX + (w ? w.position.x : 0);
                    if (screenX <= game.width + this.orbRadius + 60) {
                        allFinished = false; // Aún hay al menos un orbe en pantalla
                    }
                }

                // Colisión 2D con los nodos
                for (let node of nodes) {
                    if (!node.isMarkedForSweep) continue;
                    if (this._resetThisCycle.has(node)) continue;

                    for (let orb of this.orbs) {
                        const dx = node.x - orb.worldX;
                        const dy = node.y - orb.worldY;
                        const dist = Math.sqrt(dx * dx + dy * dy);

                        // Si el centro del orbe entra en el área colisionable
                        if (dist <= this.orbRadius + node.radius) {
                            this._resetNode(node, nodes);
                            this._resetThisCycle.add(node);
                            break; // evitamos múltiples orbes reseteando el mismo nodo
                        }
                    }
                }

                this._drawOrbs();

                if (allFinished) {
                    this.orbs = [];
                    if (this._gfx) this._gfx.clear();
                    for (let node of nodes) {
                        if (node.isMarkedForSweep) node._sweepAlerting = false;
                    }
                    this.state = 'waiting';
                    this.timer = this.cooldown;
                }
                break;
            }
        }
    }

    _drawOrbs() {
        if (!this._gfx || this.orbs.length === 0) return;
        this._gfx.clear();

        for (let orb of this.orbs) {
            const cx = orb.worldX;
            const cy = orb.worldY;
            const R  = this.orbRadius;

            // Riel térmico sutil (estela) horizontal detrás del orbe
            this._gfx.rect(cx - 300, cy - R*0.3, 300, R*0.6);
            this._gfx.fill({ color: 0xff8c00, alpha: 0.15 });

            // Halo luminoso difuso 
            this._gfx.circle(cx, cy, R * 3.5);
            this._gfx.fill({ color: 0xff4500, alpha: 0.12 });

            // Cuerpo ámbar principal
            this._gfx.circle(cx, cy, R * 1.8);
            this._gfx.fill({ color: 0xff8c00, alpha: 0.65 });

            // Anillo interior denso
            this._gfx.circle(cx, cy, R * 1.2);
            this._gfx.fill({ color: 0xffa500, alpha: 0.85 });

            // Núcleo candente
            this._gfx.circle(cx, cy, R * 0.6);
            this._gfx.fill({ color: 0xffffff, alpha: 1.0 });

            // Sombra del orbe
            this._gfx.ellipse(cx - 5, cy + R * 2, R * 1.5, R * 0.4);
            this._gfx.fill({ color: 0x000000, alpha: 0.2 });
        }
    }

    _resetNode(node, allNodes) {
        node.owner             = 'neutral';
        node.conquestProgress  = 0;
        node.conqueringFaction = null;
        if (node.resetEvolutionState) node.resetEvolutionState();
        else {
            node.evolution = null;
            node.pendingEvolution = null;
            node.pendingEvolutionEtaSec = 0;
        }
        node.activeShots       = [];
        node.artilleryTimer    = node.artilleryInterval;

        if (node.type !== 'tunel') node.tunnelTo = null;
        for (let other of allNodes) {
            if (other !== node && other.type !== 'tunel' && other.tunnelTo === node) {
                other.tunnelTo = null;
            }
        }

        node.flashTargetColor = 0xff8c00;
        node.flashTimer       = 0.5;
        node.redraw();
    }

    // Ya no hay barra parpadeante en el HUD; la alerta son los nodos mismos
    draw(ctx, game) {
        // Obsoleto en V2; lo dejamos vacío por compatibilidad con world_manager.js
    }

    get isSweeping()    { return this.state === 'sweeping'; }
    get isAlerting()    { return this.state === 'alerting'; }
    get timeToNext()    { return this.state === 'waiting' ? this.timer : 0; }
    get alertProgress() {
        return this.state === 'alerting' ? 1 - this.timer / this.alertDuration : 0;
    }
}
