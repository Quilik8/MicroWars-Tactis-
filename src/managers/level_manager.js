import { LEVELS } from '../data/levels.js';
import { Node } from '../entities/node.js';
import { PIXI } from '../core/engine.js';

export class LevelManager {
    constructor(game, world, ui, sfx, music) {
        this.game = game;
        this.world = world;
        this.ui = ui;
        this.sfx = sfx;
        this.startMusic = music.start;

        this.currentLevelIndex = 0;
        this.unlockedLevels = 1;

        // FIX #18: gracia para evitar race condition de victoria/derrota al cargar nivel
        this._levelStartGrace = 0;
        this._GRACE_DURATION = 1.5; // segundos hasta que se comprueba victoria

        this.loadProgress();
    }

    loadProgress() {
        const saved = localStorage.getItem('microwars_save');
        if (saved) {
            try {
                this.unlockedLevels = JSON.parse(saved).unlockedLevels || 1;
            } catch (e) { console.error("Error loading save:", e); }
        }
        
        // TODO: RECORDATORIO - REMOVER ESTA LÍNEA AL HACER EL INSTALADOR FINAL.
        // Mantiene temporalmente todos los niveles abiertos para pruebas.
        this.unlockedLevels = LEVELS.length;
    }

    saveProgress() {
        localStorage.setItem('microwars_save', JSON.stringify({ unlockedLevels: this.unlockedLevels }));
    }

    loadLevel(index) {
        if (index >= LEVELS.length) index = 0;
        this.currentLevelIndex = index;
        // FIX #18: reiniciar el contador de gracia al cargar nivel
        this._levelStartGrace = 0;

        this.ui.setGameState('PLAYING');
        this.world.clearLevel();
        if (this.ui.callbacks && this.ui.callbacks.onResetCamera) {
            this.ui.callbacks.onResetCamera();
        }

        const cx = this.game.width || window.innerWidth;
        const cy = this.game.height || window.innerHeight;
        const levelData = LEVELS[index];

        this.world.nodes = levelData.nodes.map(nData => {
            let n = new Node(nData.x * cx, nData.y * cy, nData.owner, nData.type);
            if (nData.isMobile) {
                n.isMobile = true;
                n.orbitAnchorX = nData.orbitAnchorX;
                n.orbitAnchorY = nData.orbitAnchorY;
                n.orbitRadiusX = nData.orbitRadiusX;
                n.orbitRadiusY = nData.orbitRadiusY;
                n.orbitSpeed = nData.orbitSpeed;
                n.orbitAngle = 0;
            }
            return n;
        });

        for (let n of this.world.nodes) {
            this.world.createNodeGfx(n);
        }

        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        this.world.hazards = [];
        if (levelData.hazards) {
            for (let hz of levelData.hazards) {
                // Duplicate hazard data into world to be handled by physics
                this.world.hazards.push({ ...hz });
                
                // Draw hazard visually
                const gfx = new PIXI.Graphics();
                if (hz.shape === "semicircle") {
                    // Dibuja un arco cerrado de -90 a 90 grados apuntando al frente derecho
                    gfx.moveTo(hz.x * cx, hz.y * cy - hz.radius * cx);
                    gfx.arc(hz.x * cx, hz.y * cy, hz.radius * cx, -Math.PI/2, Math.PI/2);
                    gfx.closePath();
                } else {
                    gfx.circle(hz.x * cx, hz.y * cy, hz.radius * cx);
                }
                gfx.fill({ color: hz.color || 0xff0000, alpha: hz.alpha || 0.2 });
                this.game.layerNodes.addChild(gfx);
            }
        }

        if (levelData.zones) {
            this.world.zones = [...levelData.zones];
            this.world.drawZones();
        }

        for (let i = 0; i < this.world.nodes.length; i++) {
            let n = this.world.nodes[i];
            let nData = levelData.nodes[i];
            let cant = (nData.startUnits !== undefined) ? nData.startUnits : Math.floor(n.maxUnits * 0.4);
            this.world.spawnUnitsAt(n, nData.owner, cant);

            if (nData.tunnelTo) {
                let targetIdx = levelData.nodes.findIndex(nd => nd.id === nData.tunnelTo);
                if (targetIdx !== -1) {
                    n.tunnelTo = this.world.nodes[targetIdx];
                }
            }

            // Registrar límites físicos de la partida
            if (n.x < minX) minX = n.x;
            if (n.x > maxX) maxX = n.x;
            if (n.y < minY) minY = n.y;
            if (n.y > maxY) maxY = n.y;
        }

        // --- ENCUADRE DINÁMICO DE CÁMARA (Dynamic Auto-Zoom) ---
        if (this.game.world && this.world.nodes.length > 0) {
            const padding = 150; // Margen en píxeles
            const mapWidth = (maxX - minX) + padding * 2;
            const mapHeight = (maxY - minY) + padding * 2;
            
            // Calculamos qué escala se requiere para que mapWidth quepa en cx, y lo mismo con cy
            const scaleX = cx / mapWidth;
            const scaleY = cy / mapHeight;
            let idealScale = Math.min(scaleX, scaleY);
            
            // Limitamos a la escala máxima/mínima del usuario
            idealScale = Math.max(0.3, Math.min(1.2, idealScale));
            
            this.game.world.scale.set(idealScale);
            
            // Centrar el mapa calculado en la pantalla real
            const mapCenterX = (minX + maxX) / 2;
            const mapCenterY = (minY + maxY) / 2;
            this.game.world.position.x = (cx / 2) - (mapCenterX * idealScale);
            this.game.world.position.y = (cy / 2) - (mapCenterY * idealScale);
        }

        const introTitle = document.getElementById('introTitle');
        const introDesc = document.getElementById('introDesc');
        const introScreen = document.getElementById('levelIntro');

        if (introTitle) introTitle.innerText = levelData.name || `NIVEL ${index + 1}`;
        if (introDesc) introDesc.innerText = levelData.description || "Acaba con el nido enemigo.";
        if (introScreen) {
            introScreen.classList.remove('hidden');
            introScreen.classList.add('active');
            this.ui.setPauseState(true);

            const onIntroClick = () => {
                introScreen.classList.remove('active');
                introScreen.classList.add('hidden');
                this.ui.setPauseState(false);
                introScreen.removeEventListener('click', onIntroClick);
            };
            introScreen.addEventListener('click', onIntroClick);
        }

        if (this.startMusic) this.startMusic('LEVEL', index);
    }

    checkVictory(dt, playerNodes, enemyNodes, playerUnits, enemyUnits) {
        // FIX #18: no evaluar condiciones de victoria durante el período de gracia inicial
        this._levelStartGrace += dt;
        if (this._levelStartGrace < this._GRACE_DURATION) return null;

        if (playerNodes === 0 && playerUnits === 0) {
            this.ui.setGameState('GAMEOVER');
            return false;
        } else if (enemyNodes === 0 && enemyUnits === 0) {
            this.ui.setGameState('VICTORY');
            this.onLevelComplete();
            return true;
        }
        return null;
    }

    onLevelComplete() {
        if (this.currentLevelIndex + 2 > this.unlockedLevels && this.currentLevelIndex + 1 < LEVELS.length) {
            this.unlockedLevels = this.currentLevelIndex + 2;
            this.saveProgress();
            this.ui.renderLevelGrid(LEVELS, this.unlockedLevels, (idx) => this.loadLevel(idx));
        }
    }
}
