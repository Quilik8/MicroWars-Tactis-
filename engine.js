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
        this.width = 0;
        this.height = 0;

        // Capas del escenario (zIndex)
        this.layerNodes = null;   // Fondo: túneles y nodos
        this.layerUnits = null;   // Frente: las hormigas

        // Callbacks insertables desde main.js (igual que antes)
        this.onUpdate = null;
        this.onDraw = null; // Para dibujos de UI en canvas2D auxiliar (línea arrastre etc.)

        // Canvas auxiliar 2D para elementos de UI sobre WebGL (la línea de drag&drop)
        this.uiCanvas = null;
        this.uiCtx = null;
    }

    /** Se llama desde window 'load' en main.js (debe hacerse async) */
    async init() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;

        this.app = new PIXI.Application();
        await this.app.init({
            width: this.width,
            height: this.height,
            backgroundColor: 0x111111,   // Fondo oscuro (tierra de hormigas)
            antialias: false,       // Desactivar para maximizar FPS
            resolution: window.devicePixelRatio || 1,
            autoDensity: true,
        });

        // Inyectar el canvas WebGL en el contenedor
        const container = document.getElementById('gameContainer');
        container.appendChild(this.app.canvas);

        // Canvas 2D transparente encima del WebGL solo para la UI de drag&drop
        this.uiCanvas = document.createElement('canvas');
        this.uiCanvas.width = this.width;
        this.uiCanvas.height = this.height;
        this.uiCanvas.style.position = 'absolute';
        this.uiCanvas.style.top = '0';
        this.uiCanvas.style.left = '0';
        this.uiCanvas.style.pointerEvents = 'none'; // Que no bloquee clicks
        container.appendChild(this.uiCanvas);
        this.uiCtx = this.uiCanvas.getContext('2d');

        // Crear capas ordenadas y cámara (world)
        this.world = new PIXI.Container();
        this.layerNodes = new PIXI.Container();
        this.layerUnits = new PIXI.Container();

        this.world.addChild(this.layerNodes);
        this.world.addChild(this.layerUnits);
        this.app.stage.addChild(this.world);

        // Capa de menú vivo: separada del world para usar coordenadas de pantalla sin transformación
        this.layerMenu = new PIXI.Container();
        this.app.stage.addChild(this.layerMenu);

        // Resize dinámico
        window.addEventListener('resize', () => this._resize());

        // Registrar el bucle de juego en el ticker de Pixi
        this.app.ticker.add((ticker) => {
            const dt = ticker.deltaMS / 1000; // Delta en segundos (mismo formato que antes)
            if (this.onUpdate) this.onUpdate(dt);
            // El dibujo de las unidades Pixi es automático (el stage se autorendea)
            // onDraw se usa solo para la UI 2D (línea de drag)
            if (this.onDraw) {
                this.uiCtx.clearRect(0, 0, this.width, this.height);
                this.onDraw(this.uiCtx);
            }
        });
    }

    _resize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.app.renderer.resize(this.width, this.height);
        if (this.uiCanvas) {
            this.uiCanvas.width = this.width;
            this.uiCanvas.height = this.height;
        }
    }
}
