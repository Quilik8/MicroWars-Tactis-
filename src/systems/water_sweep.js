/**
 * WaterSweep — "Marea Barriente"
 *
 * ARQUITECTURA FINAL:
 *   La barra visual es un PIXI.Graphics dentro del world container (layerVFX).
 *   Al pertenecer al árbol de PixiJS del mapa, se mueve exactamente igual que
 *   los nodos y unidades cuando el jugador hace pan o zoom — es un elemento
 *   más del mundo, no un overlay de pantalla.
 *
 *   La posición se trackea en coordenadas de MUNDO (_worldX), lo que garantiza
 *   que la colisión y el visual estén siempre alineados sin importar la cámara.
 *
 *   El indicador de alerta (barra pulsante antes de la ola) sí es pantalla-fija
 *   porque es un elemento HUD — se dibuja en el uiCanvas vía draw(ctx).
 *
 * FASES:
 *   waiting  → espera cooldown segundos
 *   alerting → 3 s de barra pulsante en el borde izquierdo (HUD, uiCanvas)
 *   sweeping → la barra PIXI avanza en espacio de mundo
 */
export class WaterSweep {
    constructor(config) {
        this.speed         = config.speed        || 20;   // px/s pantalla a zoom 1:1
        this.width         = config.width        || 62;   // px pantalla a zoom 1:1
        this.cooldown      = config.cooldown     || 8;    // s entre barridas
        this.initialDelay  = config.initialDelay || 8;    // s antes de la primera
        this.alertDuration = 3;                           // s de aviso visual

        const rawColor    = config.color || 0x0097a7;
        this.color        = rawColor;
        this.colorCss     = '#' + rawColor.toString(16).padStart(6, '0');
        this.alpha        = config.alpha || 0.42;

        // Estado interno
        this.state    = 'waiting';
        this.timer    = this.initialDelay;

        // Posición y dimensiones en ESPACIO DE MUNDO
        this._worldX     = null;  // null = no activo
        this._worldW     = 0;     // ancho en unidades de mundo (calculado al inicio)
        this._worldSpeed = 0;     // velocidad en unidades de mundo/s

        // PIXI.Graphics que vive dentro del world container
        this._gfx = null;
    }

    // ─────────────────────────────────────────────────────────
    // INIT — llamado una vez al cargar el nivel
    // Crea el Graphics de PixiJS y lo añade al layer del mapa.
    // ─────────────────────────────────────────────────────────
    initGraphics(PIXI, layerVFX) {
        this._gfx = new PIXI.Graphics();
        layerVFX.addChild(this._gfx);
    }

    // ─────────────────────────────────────────────────────────
    // DESTROY — llamado en clearLevel()
    // ─────────────────────────────────────────────────────────
    destroy() {
        if (this._gfx && !this._gfx.destroyed) {
            this._gfx.destroy();
        }
        this._gfx = null;
    }

    // ─────────────────────────────────────────────────────────
    // UPDATE — lógica de fases y colisión
    // ─────────────────────────────────────────────────────────
    update(dt, allUnits, nodes, game) {
        const w = game.world;

        switch (this.state) {

            case 'waiting':
                if (this._gfx) this._gfx.clear();
                this.timer -= dt;
                if (this.timer <= 0) {
                    this.state = 'alerting';
                    this.timer = this.alertDuration;
                }
                break;

            case 'alerting':
                if (this._gfx) this._gfx.clear();
                this.timer -= dt;
                if (this.timer <= 0) {
                    // Calcular posición y dimensiones en espacio de mundo
                    // usando la escala y offset actuales de la cámara.
                    const scaleX  = (w ? w.scale.x    : 1) || 1;
                    const offsetX = (w ? w.position.x : 0) || 0;

                    // La barra empieza justo fuera del borde izquierdo de la pantalla
                    this._worldW     = this.width / scaleX;
                    this._worldSpeed = this.speed / scaleX;
                    this._worldX     = (0 - offsetX) / scaleX - this._worldW;

                    this.state = 'sweeping';
                }
                break;

            case 'sweeping': {
                // Avanzar en espacio de mundo
                this._worldX += this._worldSpeed * dt;

                // Zona de colisión directa en coordenadas de mundo — sin conversiones
                const worldL = this._worldX;
                const worldR = this._worldX + this._worldW;

                for (let u of allUnits) {
                    if (u.pendingRemoval) continue;
                    if (u.x >= worldL && u.x <= worldR) {
                        u.pendingRemoval = true;
                    }
                }

                // Dibujar la barra en el PIXI Graphics (espacio de mundo)
                this._drawWorldBar(game);

                // Condición de fin: la barra salió por la derecha de la pantalla
                if (w) {
                    const scaleX  = w.scale.x    || 1;
                    const offsetX = w.position.x || 0;
                    const screenRight = this._worldX * scaleX + offsetX;
                    if (screenRight > game.width + this.width + 50) {
                        this._worldX = null;
                        if (this._gfx) this._gfx.clear();
                        this.state = 'waiting';
                        this.timer = this.cooldown;
                    }
                }
                break;
            }
        }
    }

    // ─────────────────────────────────────────────────────────
    // DRAW WORLD BAR — dibuja la barra en PIXI Graphics (mundo)
    // Se llama desde update() en estado sweeping.
    // ─────────────────────────────────────────────────────────
    _drawWorldBar(game) {
        if (!this._gfx || this._worldX === null) return;

        const x = this._worldX;
        const w = this._worldW;

        // Alto en mundo: suficientemente grande para cubrir toda la pantalla
        // sin importar el pan vertical. game.height / scaleX garantiza cobertura total.
        const scaleX = (game.world ? game.world.scale.x : 1) || 1;
        const scaleY = (game.world ? game.world.scale.y : 1) || 1;
        const halfH  = (game.height / scaleY) * 2 + 500;

        this._gfx.clear();

        // Estela trasera muy tenue (marca por donde ya pasó)
        if (x > -100000) {
            this._gfx.rect(x - w * 0.4, -halfH, w * 0.4, halfH * 2);
            this._gfx.fill({ color: this.color, alpha: 0.06 });
        }

        // Cuerpo principal
        this._gfx.rect(x, -halfH, w, halfH * 2);
        this._gfx.fill({ color: this.color, alpha: this.alpha });

        // Borde trasero más oscuro
        this._gfx.rect(x, -halfH, w * 0.08, halfH * 2);
        this._gfx.fill({ color: this.color, alpha: this.alpha * 0.55 });

        // Borde delantero brillante — frente de la ola
        this._gfx.rect(x + w * 0.85, -halfH, w * 0.15, halfH * 2);
        this._gfx.fill({ color: 0x4dd0e1, alpha: 0.60 });

        // Línea de espuma blanca en el frente
        this._gfx.rect(x + w * 0.97, -halfH, w * 0.03, halfH * 2);
        this._gfx.fill({ color: 0xffffff, alpha: 0.28 });
    }

    // ─────────────────────────────────────────────────────────
    // DRAW — indicador de alerta en uiCanvas (HUD pantalla-fijo)
    // Solo dibuja la barra de aviso antes de la ola. Correcto que
    // sea pantalla-fija porque es un elemento de interfaz, no de mundo.
    // ─────────────────────────────────────────────────────────
    draw(ctx, game) {
        if (!ctx || this.state !== 'alerting') return;

        const H        = game.height;
        const progress = 1 - (this.timer / this.alertDuration); // 0 → 1
        const pulse    = 0.35 + 0.65 * Math.abs(Math.sin(Date.now() * 0.007));

        ctx.save();

        // Franja fija pulsante en el borde izquierdo (7 px)
        ctx.globalAlpha = pulse * 0.9;
        ctx.fillStyle   = this.colorCss;
        ctx.fillRect(0, 0, 7, H);

        // Segunda línea que crece indicando proximidad
        ctx.globalAlpha = 0.18;
        ctx.fillRect(7, 0, Math.max(0, progress * 30), H);

        ctx.restore();
    }

    // Getters de solo lectura
    get isSweeping()  { return this.state === 'sweeping'; }
    get isAlerting()  { return this.state === 'alerting'; }
    get timeToNext()  { return this.state === 'waiting' ? this.timer : 0; }
    get alertProgress() {
        return this.state === 'alerting'
            ? 1 - this.timer / this.alertDuration
            : 0;
    }
}
