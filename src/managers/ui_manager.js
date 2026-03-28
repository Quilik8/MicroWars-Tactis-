/**
 * DOM and UI Manager for MicroWars
 */
import { Node } from '../entities/node.js';

export class UIManager {
    constructor(gameCallbacks) {
        this.callbacks = gameCallbacks;
        this.gameState = 'MENU';
        this.isPaused = false;

        this.hudFPS = null;
        this.hudUnits = null;
        this.sendSlider = null;
        this.sendPct = null;
        this.pauseBtn = null;
        this.hud = null;
        this.sendBar = null;
        this.nodeTooltip = null;
        this.difficultyBtns = null;   // ← NUEVO
    }

    init() {
        this.hudFPS = document.getElementById('hudFPS');
        this.hudUnits = document.getElementById('hudUnits');
        this.sendSlider = document.getElementById('sendSlider');
        this.sendPct = document.getElementById('sendPct');
        this.pauseBtn = document.getElementById('pauseBtn');
        this.topControls = document.getElementById('topControls');
        this.hud = document.getElementById('hud');
        this.sendBar = document.getElementById('sendBar');
        this.speedBtns = document.querySelectorAll('.speed-btn');
        this.difficultyBtns = document.querySelectorAll('.diff-select-btn'); // ← NUEVO

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

        // Botones de velocidad (1×, 2×, 4×)
        if (this.speedBtns) {
            this.speedBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const speed = parseInt(btn.dataset.speed);
                    if (this.callbacks.onSetSpeed) this.callbacks.onSetSpeed(speed);
                });
            });
        }

        // ── Botones de dificultad ────────────────────────────────────
        if (this.difficultyBtns) {
            this.difficultyBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const d = btn.dataset.difficulty;
                    if (d && this.callbacks.onSetDifficulty) {
                        this.callbacks.onSetDifficulty(d);
                    }
                });
            });
        }

        // Botones Generales de Pantallas
        const btnCampaign = document.getElementById('btnCampaign');
        if (btnCampaign) btnCampaign.onclick = () => {
            if (this.callbacks.onPlayIntro) this.callbacks.onPlayIntro();
            this.setGameState('FACTIONS');
        };

        const btnBackToMenuFromFactions = document.getElementById('btnBackToMenuFromFactions');
        if (btnBackToMenuFromFactions) btnBackToMenuFromFactions.onclick = () => {
            this.setGameState('MENU');
        };

        const btnLevels = document.getElementById('btnLevels');
        if (btnLevels) btnLevels.onclick = () => {
            if (this.callbacks.onPlayIntro) this.callbacks.onPlayIntro();
            this.setGameState('LEVELS');
        };

        const btnBackFromCampaign = document.getElementById('btnBackFromCampaign');
        if (btnBackFromCampaign) btnBackFromCampaign.onclick = () => this.setGameState('MENU');

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

        const btnRestartLevel = document.getElementById('btnRestartLevel');
        if (btnRestartLevel) btnRestartLevel.onclick = () => {
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

    // ── NUEVO: actualiza el estado visual de los botones de dificultad ─────
    updateDifficultyButtons(activeDifficulty) {
        if (!this.difficultyBtns) return;
        this.difficultyBtns.forEach(btn => {
            btn.classList.toggle('active-difficulty', btn.dataset.difficulty === activeDifficulty);
        });
    }

    updateHUD(fps, units, power) {
        if (this.hudFPS) this.hudFPS.textContent = `FPS: ${fps}`;
        if (this.hudUnits) this.hudUnits.textContent = `Hormigas: ${units} (Fuerza: ${power})`;
    }

    updateSpeedButtons(activeSpeed) {
        if (!this.speedBtns) return;
        this.speedBtns.forEach(btn => {
            const speed = parseInt(btn.dataset.speed);
            btn.classList.toggle('active-speed', speed === activeSpeed);
        });
    }

    showNodeTooltip(node) {
        if (!this.nodeTooltip) return;
        if (!node.gfx || node.gfx.destroyed || !node.gfx.parent) return;

        const world = node.gfx.parent.parent;
        if (!world) return;
        const screenX = node.x * world.scale.x + world.position.x;
        const screenY = node.y * world.scale.y + world.position.y;

        const p = node.population || {};
        const evLabel = node.evolution ? `Evo: ${node.evolution.toUpperCase()}` : 'Sin evolución';

        let total = Math.round(p['neutral'] || 0);
        let factionHtml = '';

        let allKeys = Object.keys(p);
        if (allKeys.includes('player')) {
            allKeys = allKeys.filter(k => k !== 'player');
            allKeys.unshift('player');
        }

        for (let factionId of allKeys) {
            if (factionId === 'neutral') continue;
            let count = Math.round(p[factionId] || 0);
            if (count > 0 || factionId === 'player' || factionId === 'enemy') {
                let factionName = Node.COLORS[factionId]?.name || factionId.charAt(0).toUpperCase() + factionId.slice(1);
                let colorHex = Node.COLORS[factionId] ? "#" + Node.COLORS[factionId].fill.toString(16).padStart(6, '0') : "#ffffff";
                factionHtml += `<div class="tooltip-row"><span>${factionName}:</span> <span style="font-weight: bold; color: ${colorHex}">${count}</span></div>\n`;
            }
            total += count;
        }

        this.nodeTooltip.innerHTML = `
            <div class="tooltip-header">[${node.type.toUpperCase()}]</div>
            <div class="tooltip-row"><span>${evLabel}</span></div>
            <div class="tooltip-row"><span>Dueño:</span> <span class="owner-${node.owner}">${node.owner}</span></div>
            <div class="tooltip-row"><span>Límite:</span> <span>${Math.round(total)} / ${node.maxUnits}</span></div>
            <div class="tooltip-divider"></div>
            ${factionHtml}
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

        const isIngame = (state === 'PLAYING' || state === 'VICTORY' || state === 'GAMEOVER');

        if (this.hud) this.hud.classList.toggle('hidden', !isIngame);
        if (this.sendBar) this.sendBar.classList.toggle('hidden', !isIngame);
        if (this.topControls) this.topControls.classList.toggle('hidden', !isIngame);

        if (state === 'MENU') {
            this.showScreen('mainMenu');
            this.hideNodeTooltip();
            if (this.callbacks.onSetSpeed)     this.callbacks.onSetSpeed(1);
            if (this.callbacks.onStopCampaign) this.callbacks.onStopCampaign();
            if (this.callbacks.onClearLevel)   this.callbacks.onClearLevel();
            if (this.callbacks.onResetCamera)  this.callbacks.onResetCamera();
            if (this.callbacks.onSpawnMenuAnts) this.callbacks.onSpawnMenuAnts();
            if (this.callbacks.onStartMusic)   this.callbacks.onStartMusic('MENU');
        } else if (state === 'LEVELS') {
            this.showScreen('levelSelection');
            this.hideNodeTooltip();
            if (this.callbacks.onClearMenuAnts) this.callbacks.onClearMenuAnts();
            if (this.callbacks.onClearLevel)    this.callbacks.onClearLevel();
        } else if (state === 'CAMPAIGN') {
            this.showScreen('campaignScreen');
            this.hideNodeTooltip();
            if (this.callbacks.onClearMenuAnts) this.callbacks.onClearMenuAnts();
            if (this.callbacks.onStartMusic)    this.callbacks.onStartMusic('MENU');
            if (this.callbacks.onStartCampaign) this.callbacks.onStartCampaign();
        } else if (state === 'FACTIONS') {
            this.showScreen('factionSelection');
            if (this.callbacks.onClearMenuAnts)  this.callbacks.onClearMenuAnts();
            if (this.callbacks.onRenderFactions) this.callbacks.onRenderFactions();
        } else if (state === 'PLAYING') {
            ['mainMenu', 'levelSelection', 'levelComplete', 'gameOver', 'levelIntro', 'campaignScreen'].forEach(id => {
                const s = document.getElementById(id);
                if (s) { s.classList.remove('active'); s.classList.add('hidden'); }
            });
            if (this.callbacks.onClearMenuAnts) this.callbacks.onClearMenuAnts();
            if (this.callbacks.onSetSpeed)      this.callbacks.onSetSpeed(1);
        } else if (state === 'VICTORY') {
            if (this.callbacks.onSetSpeed) this.callbacks.onSetSpeed(1);
            if (this.callbacks.onVictory)  this.callbacks.onVictory();
            this.showScreen('levelComplete');
            if (this.callbacks.onStopMusic) this.callbacks.onStopMusic();
        } else if (state === 'GAMEOVER') {
            if (this.callbacks.onSetSpeed) this.callbacks.onSetSpeed(1);
            if (this.callbacks.onGameOver) this.callbacks.onGameOver();
            this.showScreen('gameOver');
            if (this.callbacks.onStopMusic) this.callbacks.onStopMusic();
        }
    }

    renderFactionSelection(factions, onSelect) {
        const grid = document.querySelector('.faction-grid');
        if (!grid) return;
        grid.innerHTML = '';

        factions.forEach(f => {
            const card = document.createElement('div');
            card.className = `faction-card ${f.isPremium ? 'premium-locked' : ''}`;

            const colorHex = '#' + f.color.toString(16).padStart(6, '0');
            card.style.setProperty('--f-color', colorHex);
            card.style.setProperty('--f-color-alpha', colorHex + '44');

            card.innerHTML = `
                <div class="faction-icon" style="background: ${colorHex}"></div>
                <h3>${f.name}</h3>
                <div class="faction-trait">${f.trait}</div>
                <div class="faction-desc">${f.description}</div>
                <div class="difficulty-badge diff-${f.difficulty.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")}">${f.difficulty}</div>
            `;

            if (!f.isPremium) {
                card.onclick = () => onSelect(f);
            } else {
                card.onclick = () => alert("¡Esta facción es exclusiva de la versión Premium!");
            }

            grid.appendChild(card);
        });
    }

    setPauseState(isPaused, skipCallback = false) {
        this.isPaused = isPaused;
        if (this.pauseBtn) {
            this.pauseBtn.innerText = isPaused ? '▶ REANUDAR' : '⏸ PAUSA';
        }

        if (!skipCallback && this.callbacks.onTogglePause) {
            this.callbacks.onTogglePause(isPaused);
        }
    }
}
