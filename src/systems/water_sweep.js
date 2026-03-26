/**
 * WaterSweep — "Marea Barriente"
 *
 * ARQUITECTURA v3 — Barras múltiples en COORDENADAS DE MUNDO:
 *
 *   Cada barra es un objeto del mundo con posición en unidades de mundo,
 *   exactamente igual que un nodo o una hormiga.  PixiJS aplica zoom/pan
 *   de forma transparente al renderizar layerVFX — la barra nunca "flota"
 *   sobre la pantalla ni se ve afectada por cámara.
 *
 *   Inicio: worldX = -barWorldWidth   (justo fuera del borde izq. del mundo)
 *   Fin:    worldX > game.width + barWorldWidth  (borde der. del mundo)
 *   Speed:  config.speed unidades-de-mundo / segundo — NO se divide por scale
 *
 *   El ancho de la barra se expresa como fracción del mundo:
 *     barWorldWidth = config.width * game.width  (por defecto ~0.032 × 1920 ≈ 62)
 *   De este modo se conserva la proporción visual con independencia de
 *   la resolución real de pantalla.
 *
 *   La colisión es directa: u.x >= worldL && u.x <= worldR.
 *   No se necesita convertir nada — todo vive en el mismo espacio.
 *
 * COMPONENTES:
 *   _spawnTimer  — cuenta atrás hasta la próxima alerta/spawn (corre siempre)
 *   _isAlerting  — true durante la ventana de aviso visual previa al spawn
 *   _alertTimer  — cuenta atrás de la fase de alerta
 *   _activeBars  — array de { worldX } — cada barra vive de forma autónoma
 *   _gfx         — PIXI.Graphics compartido; se limpia y redibujan TODAS
 *                  las barras activas cada frame
 */
export class WaterSweep {
    constructor(config) {
        this.speed         = config.speed        || 20;    // unidades-de-mundo / s
        this.widthFrac     = config.width        || 0.032; // fracción del ancho del mundo
        this.cooldown      = config.cooldown     || 32;    // s entre spawns
        this.initialDelay  = config.initialDelay || 8;     // s antes del primer spawn
        this.alertDuration = 3;                            // s de aviso visual previo

        const rawColor    = config.color || 0x0097a7;
        this.color        = rawColor;
        this.colorCss     = '#' + rawColor.toString(16).padStart(6, '0');
        this.alpha        = config.alpha || 0.42;

        // Timer de spawn — corre independientemente de las barras activas
        this._spawnTimer  = this.initialDelay;
        this._isAlerting  = false;
        this._alertTimer  = 0;

        // Barras activas — cada elemento es { worldX: number }
        this._activeBars  = [];

        // PIXI.Graphics compartido para todas las barras
        this._gfx = null;

        // Ancho de mundo calculado en init (necesita game.width)
        this._barWorldWidth = null;
    }

    // ─────────────────────────────────────────────────────────
    // INIT — llamado una vez al cargar el nivel
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
    // UPDATE — lógica de spawn, movimiento, colisión y dibujo
    // game.width es el ancho del mundo en unidades de mundo.
    // ─────────────────────────────────────────────────────────
    update(dt, allUnits, nodes, game) {
        // Calcular el ancho de barra en unidades de mundo la primera vez
        // (y recalcular si cambia game.width, aunque eso no ocurre en runtime)
        const barW = this.widthFrac * game.width;
        this._barWorldWidth = barW;

        // ── 1. Timer de spawn (independiente de barras activas) ───────
        if (this._isAlerting) {
            this._alertTimer -= dt;
            if (this._alertTimer <= 0) {
                this._isAlerting = false;
                // Spawn justo fuera del borde izquierdo del mundo
                this._activeBars.push({ worldX: -barW });
                // El cooldown empieza a contar DESDE el spawn — periodicidad estricta
                this._spawnTimer = this.cooldown;
            }
        } else {
            this._spawnTimer -= dt;
            if (this._spawnTimer <= 0) {
                this._isAlerting = true;
                this._alertTimer = this.alertDuration;
            }
        }

        // ── 2. Actualizar barras activas ──────────────────────────────
        if (this._gfx) this._gfx.clear();

        let i = this._activeBars.length - 1;
        while (i >= 0) {
            const bar = this._activeBars[i];

            // Avanzar en coordenadas de mundo — zoom no afecta
            bar.worldX += this.speed * dt;

            // Colisión directa en mundo — sin conversión de cámara
            const worldL = bar.worldX;
            const worldR = bar.worldX + barW;
            for (const u of allUnits) {
                if (!u.pendingRemoval && u.x >= worldL && u.x <= worldR) {
                    u.pendingRemoval = true;
                }
            }

            // Dibujar esta barra en coordenadas de mundo (acumula sin borrar)
            this._appendBarToGraphics(game, bar.worldX, barW);

            // Eliminar si salió completamente por el borde derecho del mundo
            if (bar.worldX > game.width + barW) {
                this._activeBars.splice(i, 1);
            }
            i--;
        }
    }

    // ─────────────────────────────────────────────────────────
    // _appendBarToGraphics — dibuja UNA barra directamente en
    // coordenadas de mundo.  PixiJS aplica zoom/pan automáticamente
    // porque el Graphics vive en layerVFX (igual que los sprites).
    // NO llama clear() — eso lo hace update() una sola vez al inicio.
    // ─────────────────────────────────────────────────────────
    _appendBarToGraphics(game, worldX, barW) {
        if (!this._gfx) return;

        // Alto: cubre todo el mundo verticalmente con margen generoso
        const halfH = game.height * 2 + 500;

        // Estela trasera tenue
        this._gfx.rect(worldX - barW * 0.4, -halfH, barW * 0.4, halfH * 2);
        this._gfx.fill({ color: this.color, alpha: 0.06 });

        // Cuerpo principal
        this._gfx.rect(worldX, -halfH, barW, halfH * 2);
        this._gfx.fill({ color: this.color, alpha: this.alpha });

        // Borde trasero más oscuro
        this._gfx.rect(worldX, -halfH, barW * 0.08, halfH * 2);
        this._gfx.fill({ color: this.color, alpha: this.alpha * 0.55 });

        // Borde delantero brillante — frente de la ola
        this._gfx.rect(worldX + barW * 0.85, -halfH, barW * 0.15, halfH * 2);
        this._gfx.fill({ color: 0x4dd0e1, alpha: 0.60 });

        // Línea de espuma blanca en el frente
        this._gfx.rect(worldX + barW * 0.97, -halfH, barW * 0.03, halfH * 2);
        this._gfx.fill({ color: 0xffffff, alpha: 0.28 });
    }

    // ─────────────────────────────────────────────────────────
    // DRAW — indicador de alerta en uiCanvas (HUD pantalla-fijo)
    // Se llama desde world_manager.drawSweep() cada frame.
    // ─────────────────────────────────────────────────────────
    draw(ctx, game) {
        if (!ctx || !this._isAlerting) return;

        const H        = game.height;
        const progress = 1 - (this._alertTimer / this.alertDuration); // 0 → 1
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
    get isSweeping()  { return this._activeBars.length > 0; }
    get isAlerting()  { return this._isAlerting; }
    get timeToNext()  { return this._isAlerting ? 0 : this._spawnTimer; }
    get alertProgress() {
        return this._isAlerting
            ? 1 - this._alertTimer / this.alertDuration
            : 0;
    }
}
