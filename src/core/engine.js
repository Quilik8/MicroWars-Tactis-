/**
 * Motor Gráfico con PixiJS v8 (WebGL)
 * Inicializa la aplicacion Pixi, gestiona el bucle de juego y expone
 * callbacks onUpdate / onDraw para mantener la misma interfaz que el motor anterior.
 */
import * as PIXI from 'pixi.js';
export { PIXI };

export class Engine {
    constructor() {
        this.app = null;   // PIXI.Application
        this.width = window.innerWidth || 1920;
        this.height = window.innerHeight || 1080;
        this.isReady = false;

        // Capas del escenario (zIndex)
        this.layerNodes = null;   // Fondo: túneles y nodos
        this.layerUnits = null;   // Medio: las hormigas
        this.layerVFX = null;     // Frente: lásers y chispas
        this.layerMenu = null;    // UI/Menú Pixi

        // Callbacks insertables desde main.js
        this.onUpdate = null;
        this.onDraw = null;

        // Canvas auxiliar 2D para elementos de UI sobre WebGL
        this.uiCanvas = null;
        this.uiCtx = null;
    }

    /** Se llama desde window 'load' en main.js */
    async init() {
        if (this.isReady) return;

        this.app = new PIXI.Application();
        await this.app.init({
            width: this.width,
            height: this.height,
            backgroundColor: 0x050505,   // Fondo muy oscuro
            antialias: true,
            resolution: window.devicePixelRatio || 1,
            autoDensity: true,
        });

        const container = document.getElementById('gameContainer');
        if (container) {
            container.appendChild(this.app.canvas);
        }

        // Canvas 2D transparente encima
        this.uiCanvas = document.createElement('canvas');
        this.uiCanvas.width = this.width;
        this.uiCanvas.height = this.height;
        this.uiCanvas.style.position = 'absolute';
        this.uiCanvas.style.top = '0';
        this.uiCanvas.style.left = '0';
        this.uiCanvas.style.pointerEvents = 'none';
        if (container) container.appendChild(this.uiCanvas);
        this.uiCtx = this.uiCanvas.getContext('2d');

        // Crear capas ordenadas
        this.world = new PIXI.Container();
        this.layerNodes = new PIXI.Container();
        this.layerUnits = new PIXI.Container();
        this.layerVFX = new PIXI.Container();
        this.layerMenu = new PIXI.Container();

        this.world.addChild(this.layerNodes);
        this.world.addChild(this.layerUnits);
        this.world.addChild(this.layerVFX);
        this.app.stage.addChild(this.world);
        this.app.stage.addChild(this.layerMenu);

        this.isReady = true;
        this._resizeHandler = () => this._resize();
        window.addEventListener('resize', this._resizeHandler);

        this.app.ticker.add((ticker) => {
            const dt = ticker.deltaMS / 1000;
            if (this.onUpdate) this.onUpdate(dt);
            if (this.onDraw) {
                this.uiCtx.clearRect(0, 0, this.width, this.height);
                this.onDraw(this.uiCtx);
            }
        });
    }

    _resize() {
        const prevW = this.width;
        const prevH = this.height;

        this.width  = window.innerWidth;
        this.height = window.innerHeight;

        if (this.app && this.app.renderer) {
            this.app.renderer.resize(this.width, this.height);
        }
        if (this.uiCanvas) {
            this.uiCanvas.width  = this.width;
            this.uiCanvas.height = this.height;
        }

        // Escalar y recentrar el world container proporcionalmente al nuevo tamaño
        if (this.world && prevW > 0 && prevH > 0) {
            const scaleX = this.width  / prevW;
            const scaleY = this.height / prevH;
            // Ajustar posición del mundo para que no se desplace al cambiar resolución
            this.world.position.x *= scaleX;
            this.world.position.y *= scaleY;
        }
    }

    /** Limpia recursos y desregistra listeners */
    destroy() {
        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
        }
        if (this.app) {
            this.app.destroy(true, { children: true });
            this.app = null;
        }
        if (this.uiCanvas && this.uiCanvas.parentNode) {
            this.uiCanvas.parentNode.removeChild(this.uiCanvas);
        }
        this.isReady = false;
    }
}
