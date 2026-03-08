/**
 * DOM and UI Manager for MicroWars
 */
export class UIManager {
    constructor(gameCallbacks) {
        this.callbacks = gameCallbacks;
        this.gameState = 'MENU';
        this.isPaused = false;

        // Element references (initialized later in init() if needed, but we can try now)
        this.hudFPS = null;
        this.hudUnits = null;
        this.sendSlider = null;
        this.sendPct = null;
        this.pauseBtn = null;
        this.hud = null;
        this.sendBar = null;
        this.nodeTooltip = null;
    }

    init() {
        this.hudFPS = document.getElementById('hudFPS');
        this.hudUnits = document.getElementById('hudUnits');
        this.sendSlider = document.getElementById('sendSlider');
        this.sendPct = document.getElementById('sendPct');
        this.pauseBtn = document.getElementById('pauseBtn');
        this.hud = document.getElementById('hud');
        this.sendBar = document.getElementById('sendBar');

        // Tooltip DOM element
        let existingTooltip = document.getElementById('nodeTooltip');
        if (existingTooltip) existingTooltip.remove();

        this.nodeTooltip = document.createElement('div');
        this.nodeTooltip.id = 'nodeTooltip';
        this.nodeTooltip.className = 'node-tooltip hidden';
        document.body.appendChild(this.nodeTooltip);

        this.initEventListeners();
    }

    initEventListeners() {
        // Slider de porcentaje
        if (this.sendSlider) {
            this.sendSlider.addEventListener('input', (e) => {
                const val = e.target.value;
                if (this.sendPct) this.sendPct.innerText = val + '%';
                if (this.callbacks.onSendPercentChange) {
                    this.callbacks.onSendPercentChange(parseInt(val) / 100);
                }
            });
        }

        // Botón Pausa
        if (this.pauseBtn) {
            this.pauseBtn.addEventListener('click', () => {
                this.callbacks.onTogglePause();
            });
        }

        // Botones Generales de Pantallas
        const btnPlay = document.getElementById('btnPlay');
        if (btnPlay) btnPlay.onclick = () => {
            if (this.callbacks.onStartLevel) this.callbacks.onStartLevel(0);
        };

        const btnLevels = document.getElementById('btnLevels');
        if (btnLevels) btnLevels.onclick = () => this.setGameState('LEVELS');

        const btnBackToMenu = document.getElementById('btnBackToMenu');
        if (btnBackToMenu) btnBackToMenu.onclick = () => this.setGameState('MENU');

        const btnSurrender = document.getElementById('btnSurrender');
        if (btnSurrender) btnSurrender.onclick = () => {
            if (this.callbacks.onClearLevel) this.callbacks.onClearLevel();
            this.setGameState('MENU');
        };
        const btnMenuFromWin = document.getElementById('btnMenuFromWin');
        if (btnMenuFromWin) btnMenuFromWin.onclick = () => {
            if (this.callbacks.onClearLevel) this.callbacks.onClearLevel();
            this.setGameState('MENU');
        };

        const btnMenuFromLoss = document.getElementById('btnMenuFromLoss');
        if (btnMenuFromLoss) btnMenuFromLoss.onclick = () => {
            if (this.callbacks.onClearLevel) this.callbacks.onClearLevel();
            this.setGameState('MENU');
        };

        const btnRestart = document.getElementById('btnRestart');
        if (btnRestart) btnRestart.onclick = () => {
            if (this.callbacks.onRestartLevel) this.callbacks.onRestartLevel();
        };

        const btnNextLevel = document.getElementById('btnNextLevel');
        if (btnNextLevel) btnNextLevel.onclick = () => {
            if (this.callbacks.onNextLevel) this.callbacks.onNextLevel();
        };

        const btnZoomIn = document.getElementById('btnZoomIn');
        if (btnZoomIn) btnZoomIn.onclick = () => {
            if (this.callbacks.onZoom) this.callbacks.onZoom(1.2);
        };

        const btnZoomOut = document.getElementById('btnZoomOut');
        if (btnZoomOut) btnZoomOut.onclick = () => {
            if (this.callbacks.onZoom) this.callbacks.onZoom(0.8);
        };
    }

    updateHUD(fps, units, power) {
        if (this.hudFPS) this.hudFPS.textContent = `FPS: ${fps}`;
        if (this.hudUnits) this.hudUnits.textContent = `Hormigas: ${units} (Fuerza: ${power})`;
    }

    showNodeTooltip(node) {
        if (!this.nodeTooltip) return;

        const world = node.gfx.parent.parent; // Access world container to get scale/position
        const screenX = node.x * world.scale.x + world.position.x;
        const screenY = node.y * world.scale.y + world.position.y;

        const p = node.population;
        const total = p.player + p.enemy + p.neutral;
        const evLabel = node.evolution ? `Evo: ${node.evolution.toUpperCase()}` : 'Sin evolución';

        this.nodeTooltip.innerHTML = `
            <div class="tooltip-header">[${node.type.toUpperCase()}]</div>
            <div class="tooltip-row"><span>${evLabel}</span></div>
            <div class="tooltip-row"><span>Dueño:</span> <span class="owner-${node.owner}">${node.owner}</span></div>
            <div class="tooltip-row"><span>Límite:</span> <span>${Math.round(total)} / ${node.maxUnits}</span></div>
            <div class="tooltip-divider"></div>
            <div class="tooltip-row"><span>Azules:</span> <span class="owner-player">${Math.round(p.player)}</span></div>
            <div class="tooltip-row"><span>Rojos:</span> <span class="owner-enemy">${Math.round(p.enemy)}</span></div>
        `;

        this.nodeTooltip.style.left = `${screenX + node.radius * world.scale.x + 10}px`;
        this.nodeTooltip.style.top = `${screenY - 40}px`;
        this.nodeTooltip.classList.remove('hidden');
    }

    hideNodeTooltip() {
        if (this.nodeTooltip) this.nodeTooltip.classList.add('hidden');
    }

    showScreen(id) {
        document.querySelectorAll('.screen').forEach(s => {
            if (s.id !== id) {
                s.classList.remove('active');
                s.classList.add('hidden');
            }
        });
        const target = document.getElementById(id);
        if (target) {
            target.classList.remove('hidden');
            target.classList.add('active');
        }
    }

    renderLevelGrid(levels, unlockedCount, onSelect) {
        const grid = document.querySelector('.level-grid');
        if (!grid) return;
        grid.innerHTML = '';

        levels.forEach((level, i) => {
            const isUnlocked = i < unlockedCount;
            const card = document.createElement('div');
            card.className = `level-card ${isUnlocked ? 'unlocked' : 'locked'}`;
            card.innerHTML = `
                <div class="level-card-header">NIVEL ${String(i + 1).padStart(2, '0')}</div>
                <div class="level-card-body">
                    <div class="level-card-title">${level.name}</div>
                </div>
                <div class="level-card-footer">${isUnlocked ? 'DISPONIBLE' : 'BLOQUEADO'}</div>
            `;
            if (isUnlocked) {
                card.onclick = () => onSelect(i);
            }
            grid.appendChild(card);
        });
    }

    setGameState(state) {
        this.gameState = state;

        // HUD/UI Visibility
        const isIngame = (state === 'PLAYING' || state === 'VICTORY' || state === 'GAMEOVER');

        if (this.hud) this.hud.classList.toggle('hidden', !isIngame);
        if (this.sendBar) this.sendBar.classList.toggle('hidden', !isIngame);
        if (this.pauseBtn) this.pauseBtn.classList.toggle('hidden', !isIngame);

        if (state === 'MENU') {
            this.showScreen('mainMenu');
            this.hideNodeTooltip();
            if (this.callbacks.onClearLevel) this.callbacks.onClearLevel();
            if (this.callbacks.onResetCamera) this.callbacks.onResetCamera();
            if (this.callbacks.onSpawnMenuAnts) this.callbacks.onSpawnMenuAnts();
            if (this.callbacks.onStartMusic) this.callbacks.onStartMusic('MENU');
        } else if (state === 'LEVELS') {
            this.showScreen('levelSelection');
            this.hideNodeTooltip();
            if (this.callbacks.onClearLevel) this.callbacks.onClearLevel();
        } else if (state === 'PLAYING') {
            // Hide all potential interfering screens
            ['mainMenu', 'levelSelection', 'levelComplete', 'gameOver', 'levelIntro'].forEach(id => {
                const s = document.getElementById(id);
                if (s) { s.classList.remove('active'); s.classList.add('hidden'); }
            });
            if (this.callbacks.onClearMenuAnts) this.callbacks.onClearMenuAnts();
        } else if (state === 'VICTORY') {
            if (this.callbacks.onVictory) this.callbacks.onVictory();
            this.showScreen('levelComplete');
            if (this.callbacks.onStopMusic) this.callbacks.onStopMusic();
        } else if (state === 'GAMEOVER') {
            if (this.callbacks.onGameOver) this.callbacks.onGameOver();
            this.showScreen('gameOver');
            if (this.callbacks.onStopMusic) this.callbacks.onStopMusic();
        }
    }

    setPauseState(isPaused, skipCallback = false) {
        this.isPaused = isPaused;
        if (this.pauseBtn) {
            this.pauseBtn.innerText = isPaused ? '▶ REANUDAR' : '⏸ PAUSA';
        }

        if (!skipCallback && this.callbacks.onTogglePause) {
            // This ensures ticker speed is updated in main.js
            this.callbacks.onTogglePause(isPaused);
        }
    }
}
