import { LEVELS } from '../data/levels.js';
import { Node } from '../entities/node.js';
import { PIXI } from '../core/engine.js';
import { WaterSweep } from '../systems/water_sweep.js';
import { LightSweep } from '../systems/light_sweep.js';

export class LevelManager {
    constructor(game, world, ui, sfx, music) {
        this.game = game;
        this.world = world;
        this.ui = ui;
        this.sfx = sfx;
        this.startMusic = music.start;

        this.currentLevelIndex = 0;
        this.unlockedLevels = 1;

        this._levelStartGrace = 0;
        this._GRACE_DURATION = 1.5;

        this.loadProgress();
    }

    loadProgress() {
        const saved = localStorage.getItem('microwars_save');
        if (saved) {
            try {
                this.unlockedLevels = JSON.parse(saved).unlockedLevels || 1;
            } catch (e) { console.error("Error loading save:", e); }
        }
        // ── MODO DESARROLLO ──────────────────────────────────────────────────────
        // Todos los niveles permanecen desbloqueados durante la fase de pruebas.
        // Esto permite iterar, resetear el navegador y probar cualquier nivel
        // sin necesidad de completar los anteriores.
        // ANTES DE PRODUCCIÓN: eliminar esta línea para activar el progreso real.
        // ────────────────────────────────────────────────────────────────────────
        this.unlockedLevels = LEVELS.length;
    }

    saveProgress() {
        localStorage.setItem('microwars_save', JSON.stringify({ unlockedLevels: this.unlockedLevels }));
    }

    loadLevel(index) {
        if (index >= LEVELS.length) index = 0;
        this.currentLevelIndex = index;
        this._levelStartGrace = 0;

        this.ui.setGameState('PLAYING');
        this.world.clearLevel();
        if (this.ui.callbacks && this.ui.callbacks.onResetCamera) {
            this.ui.callbacks.onResetCamera();
        }

        const cx = this.game.width  || window.innerWidth;
        const cy = this.game.height || window.innerHeight;
        const levelData = LEVELS[index];

        this.world.nodes = levelData.nodes.map(nData => {
            let n = new Node(nData.x * cx, nData.y * cy, nData.owner, nData.type);
            if (nData.isMobile) {
                n.isMobile     = true;
                n.orbitAnchorX = nData.orbitAnchorX;
                n.orbitAnchorY = nData.orbitAnchorY;
                n.orbitRadiusX = nData.orbitRadiusX;
                n.orbitRadiusY = nData.orbitRadiusY;
                n.orbitSpeed   = nData.orbitSpeed;
                n.orbitAngle   = 0;
            }
            // Nivel 8 — marcar nodo si el nivel lo indica
            if (nData.isMarkedForSweep) {
                n.isMarkedForSweep = true;
            }
            return n;
        });

        // ── Prevención de Solapamiento Visual y Físico ─────────────
        // Evita tajantemente que un Nivel inicie con Hitboxes Visuales 
        // tocándose. Repulsiones vectoriales equitativas hasta separarlos.
        const MIN_GAP = 20; // Píxeles de respiro adicionales al radio sumado
        let iterations = 0;
        let hasOverlaps = true;
        while(hasOverlaps && iterations < 50) {
            hasOverlaps = false;
            for (let i = 0; i < this.world.nodes.length; i++) {
                for (let j = i + 1; j < this.world.nodes.length; j++) {
                    const n1 = this.world.nodes[i];
                    const n2 = this.world.nodes[j];
                    const dx = n2.x - n1.x;
                    const dy = n2.y - n1.y;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    const safeDist = n1.radius + n2.radius + MIN_GAP;

                    if (dist < safeDist && dist > 0.1) {
                        hasOverlaps = true;
                        const overlap = safeDist - dist;
                        const pushAmt = (overlap / 2) + 0.1;
                        const nx = dx / dist;
                        const ny = dy / dist;
                        
                        // Empujar solo si no son isMobile con rutas forzadas absolutas 
                        // (El Ferry se auto-regula por su órbita en el loop anyway).
                        if (!n1.isMobile) { n1.x -= nx * pushAmt; n1.y -= ny * pushAmt; }
                        if (!n2.isMobile) { n2.x += nx * pushAmt; n2.y += ny * pushAmt; }
                    }
                }
            }
            iterations++;
        }

        for (let n of this.world.nodes) {
            this.world.createNodeGfx(n);
        }

        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        // ── Hazards físicos ──────────────────────────────────────────
        this.world.hazards = [];
        if (levelData.hazards) {
            for (let hz of levelData.hazards) {
                this.world.hazards.push({ ...hz });
                const gfx = new PIXI.Graphics();
                if (hz.shape === "semicircle") {
                    gfx.moveTo(hz.x * cx, hz.y * cy - hz.radius * cx);
                    gfx.arc(hz.x * cx, hz.y * cy, hz.radius * cx, -Math.PI / 2, Math.PI / 2);
                    gfx.closePath();
                } else {
                    gfx.circle(hz.x * cx, hz.y * cy, hz.radius * cx);
                }
                gfx.fill({ color: hz.color || 0xff0000, alpha: hz.alpha || 0.2 });
                this.game.layerNodes.addChild(gfx);
            }
        }

        // ── Marea Barriente (WaterSweep) ─────────────────────────────────────────
        this.world.waterSweeps = [];
        if (levelData.waterSweeps) {
            for (let swCfg of levelData.waterSweeps) {
                const sweep = new WaterSweep(swCfg);
                sweep.initGraphics(PIXI, this.game.layerVFX);
                this.world.waterSweeps.push(sweep);
            }
        }

        // ── Rayo de Luz (LightSweep) ────────────────────────────────────
        this.world.lightSweeps = [];
        if (levelData.lightSweeps) {
            for (let lsCfg of levelData.lightSweeps) {
                const sweep = new LightSweep(lsCfg);
                sweep.initGraphics(PIXI, this.game.layerVFX);
                this.world.lightSweeps.push(sweep);
            }
        }

        // ── Barreras de Bloqueo (Nivel 9) ───────────────────────────────
        // Rectángulos AABB que bloquean el paso de hormigas.
        // El ferry (nodo móvil) los atraviesa libremente.
        // Los Graphics van en layerNodes y se destruyen con clearLevel().
        this.world.barriers = [];
        if (levelData.barriers && levelData.barriers.length > 0) {
            for (let b of levelData.barriers) {
                this.world.barriers.push({ ...b });
            }
            this._drawBarriers(levelData.barriers, cx, cy);
        }

        if (levelData.zones) {
            this.world.zones = [...levelData.zones];
            this.world.drawZones();
        }

        for (let i = 0; i < this.world.nodes.length; i++) {
            let n     = this.world.nodes[i];
            let nData = levelData.nodes[i];
            let cant  = (nData.startUnits !== undefined)
                ? nData.startUnits
                : Math.floor(n.maxUnits * 0.4);
            this.world.spawnUnitsAt(n, nData.owner, cant);

            if (nData.tunnelTo) {
                let targetIdx = levelData.nodes.findIndex(nd => nd.id === nData.tunnelTo);
                if (targetIdx !== -1) n.tunnelTo = this.world.nodes[targetIdx];
            }

            if (n.x < minX) minX = n.x;
            if (n.x > maxX) maxX = n.x;
            if (n.y < minY) minY = n.y;
            if (n.y > maxY) maxY = n.y;
        }

        // ── Encuadre dinámico de cámara ──────────────────────────────
        if (this.game.world && this.world.nodes.length > 0) {
            const padding   = 150;
            const mapWidth  = (maxX - minX) + padding * 2;
            const mapHeight = (maxY - minY) + padding * 2;
            let idealScale  = Math.min(cx / mapWidth, cy / mapHeight);
            idealScale = Math.max(0.3, Math.min(1.2, idealScale));

            this.game.world.scale.set(idealScale);
            const mapCenterX = (minX + maxX) / 2;
            const mapCenterY = (minY + maxY) / 2;
            this.game.world.position.x = (cx / 2) - (mapCenterX * idealScale);
            this.game.world.position.y = (cy / 2) - (mapCenterY * idealScale);
        }

        const introTitle  = document.getElementById('introTitle');
        const introDesc   = document.getElementById('introDesc');
        const introScreen = document.getElementById('levelIntro');
        if (introTitle) introTitle.innerText = levelData.name        || `NIVEL ${index + 1}`;
        if (introDesc)  introDesc.innerText  = levelData.description || "Acaba con el nido enemigo.";
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

    // ─────────────────────────────────────────────────────────────────
    // CONDICIÓN DE VICTORIA
    // ─────────────────────────────────────────────────────────────────
    checkVictory(dt, playerNodes, enemyNodes, playerUnits, enemyUnits) {
        this._levelStartGrace += dt;
        if (this._levelStartGrace < this._GRACE_DURATION) return null;

        // Derrota
        if (playerNodes === 0 && playerUnits === 0) {
            this.ui.setGameState('GAMEOVER');
            return false;
        }

        // Victoria de Dominación Total (Jugador controla TODOS los nodos del mapa)
        if (playerNodes > 0 && playerNodes === this.world.nodes.length) {
            this.ui.setGameState('VICTORY');
            this.onLevelComplete();
            return true;
        }

        // Victoria clásica
        if (enemyNodes === 0 && enemyUnits === 0) {
            this.ui.setGameState('VICTORY');
            this.onLevelComplete();
            return true;
        }

        // Victoria anticipada (anti-climax):
        // enemigo sin unidades, acorralado en ≤1 nodo, jugador con masa crítica
        if (enemyUnits === 0 && enemyNodes <= 1 && playerUnits >= 30) {
            this.ui.setGameState('VICTORY');
            this.onLevelComplete();
            return true;
        }

        return null;
    }

    onLevelComplete() {
        if (this.currentLevelIndex + 2 > this.unlockedLevels &&
            this.currentLevelIndex + 1 < LEVELS.length) {
            this.unlockedLevels = this.currentLevelIndex + 2;
            this.saveProgress();
            this.ui.renderLevelGrid(LEVELS, this.unlockedLevels, (idx) => this.loadLevel(idx));
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // _drawBarriers — dibuja las paredes de cristal azul en layerNodes.
    //
    // Visual: Campo de fuerza de energía luminosa (sin mallas complejas).
    //   1. Relleno azul cian semitransparente con glow
    //   2. Borde exterior brillante
    //   3. Destello interior
    // ─────────────────────────────────────────────────────────────────
    _drawBarriers(barriers, cx, cy) {
        const gfx = new PIXI.Graphics();
        
        for (const b of barriers) {
            const rx = b.x * cx;
            const ry = b.y * cy;
            const rw = b.width  * cx;
            const rh = b.height * cy;

            // 1. Relleno base (cian profundo semitransparente)
            gfx.rect(rx, ry, rw, rh);
            gfx.fill({ color: 0x0088ff, alpha: 0.25 });

            // 2. Borde exterior brillante (glow azul eléctrico)
            gfx.rect(rx, ry, rw, rh);
            gfx.stroke({ color: 0x00e5ff, alpha: 0.85, width: 2.5 });

            // 3. Highlight interior / núcleo central de la barrera
            if (rw > 6 && rh > 6) {
                // Dibujamos un núcleo sólido ligeramente más pequeño en el centro
                const inset = 4;
                gfx.rect(rx + inset, ry + inset, rw - inset * 2, rh - inset * 2);
                gfx.fill({ color: 0x4dd0e1, alpha: 0.15 });
                gfx.stroke({ color: 0x84ffff, alpha: 0.4, width: 1.5 });
            }
        }

        this.game.layerNodes.addChild(gfx);
    }
}
