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
            this.setGameState('LEVELS', { returnToSector: true });
        };
        const btnMenuFromWin = document.getElementById('btnMenuFromWin');
        if (btnMenuFromWin) btnMenuFromWin.onclick = () => {
            if (this.callbacks.onClearLevel) this.callbacks.onClearLevel();
            this.setGameState('LEVELS', { returnToSector: true });
        };

        const btnMenuFromLoss = document.getElementById('btnMenuFromLoss');
        if (btnMenuFromLoss) btnMenuFromLoss.onclick = () => {
            if (this.callbacks.onClearLevel) this.callbacks.onClearLevel();
            this.setGameState('LEVELS', { returnToSector: true });
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
        const DESCS = {
            easy:   'Conciencia estratégica: planifica rutas, refuerza momentum y evita sobreextensión.',
            normal: 'Inteligencia enjambre: coordinación de pinzas, ataques precisos y sniping oportunista.',
            hard:   'Dominio absoluto: back-capping, flanqueos letales, conciencia de peligros del mapa.'
        };
        const desc = document.getElementById('difficultyDesc');
        if (desc) desc.textContent = DESCS[activeDifficulty] || '';

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

        this.nodeTooltip.classList.remove('hidden');
        
        // Asignar temporalmente para obtener el tamaño real
        this.nodeTooltip.style.left = `${screenX + node.radius * world.scale.x + 10}px`;
        this.nodeTooltip.style.top = `${screenY - 40}px`;

        // Calcular colisión con bordes del window
        const rect = this.nodeTooltip.getBoundingClientRect();
        let left = screenX + node.radius * world.scale.x + 10;
        let top = screenY - 40;

        if (left + rect.width > window.innerWidth) {
            left = screenX - node.radius * world.scale.x - 10 - rect.width;
        }
        if (top + rect.height > window.innerHeight) {
            top = window.innerHeight - rect.height - 10;
        }
        if (left < 0) left = 10;
        if (top < 0) top = 10;

        this.nodeTooltip.style.left = `${left}px`;
        this.nodeTooltip.style.top = `${top}px`;
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

    renderSectorGrid(sectors, levelState, onSelectLevel, autoOpenSectorIndex = null) {
        const root = document.getElementById('levelSelection');
        if (!root) return;
        
        let grid = root.querySelector('.level-grid');
        if (grid) grid.style.display = 'none';

        let gallery = root.querySelector('.sector-gallery');
        if (!gallery) {
            gallery = document.createElement('div');
            gallery.className = 'sector-gallery';
            root.appendChild(gallery);
        }
        gallery.innerHTML = '';

        let levelContainer = root.querySelector('.levels-container');
        if (!levelContainer) {
            levelContainer = document.createElement('div');
            levelContainer.className = 'levels-container';
            root.appendChild(levelContainer);
        }
        levelContainer.innerHTML = '';

        let radar = root.querySelector('.fast-travel-radar');
        if (!radar) {
            radar = document.createElement('div');
            radar.className = 'fast-travel-radar';
            root.appendChild(radar);
        }
        radar.innerHTML = '';

        // Botón de retorno al macro
        const backBtn = document.createElement('button');
        backBtn.className = 'btn-back-macro';
        backBtn.innerText = '← VISTA DE SECTORES';
        backBtn.onclick = () => {
            levelContainer.classList.remove('active');
        };
        levelContainer.appendChild(backBtn);

        const trail = document.createElement('div');
        trail.className = 'pheromone-trail';
        levelContainer.appendChild(trail);

        const renderLevels = (sector, sIdx) => {
            trail.innerHTML = ''; // reset nodes
            sector.levels.forEach((lvl, lIdx) => {
                const nodeWrap = document.createElement('div');
                nodeWrap.className = 'level-node-wrapper';
                nodeWrap.innerHTML = `
                    <div class="level-node">${lIdx + 1}</div>
                    <div class="level-info">
                        <div class="level-info-title">${lvl.name}</div>
                        <div class="level-info-desc">${lvl.description}</div>
                    </div>
                `;
                nodeWrap.onclick = () => onSelectLevel(sIdx, lIdx);
                trail.appendChild(nodeWrap);
            });
            levelContainer.classList.add('active');
        };

        const RomanToSector = ["I","II","III","IV","V","VI","VII"];

        sectors.forEach((sector, sIdx) => {
            const card = document.createElement('div');
            card.className = `sector-macro-card`;
            card.dataset.idx = sIdx;
            
            // Elegir un bio background basado en el index (+1 o específico al sector)
            const bgClass = `bg-bio-${(sIdx % 7) + 1}`;
            const borderClass = `border-bio-${(sIdx % 7) + 1}`;

            card.innerHTML = `
                <div class="smc-bg ${bgClass}"></div>
                <div class="smc-shape ${borderClass}">
                    <div class="smc-content">
                        <h2 class="smc-title">${sector.name}</h2>
                        <div class="smc-desc">${sector.description}</div>
                        <div class="smc-levels-badge">${sector.levels.length} REDES IDENTIFICADAS</div>
                    </div>
                </div>
            `;

            // Sector 3: Inyectar gotas tóxicas que GOLPEAN la pantalla (como lente mojada)
            if (sIdx === 2) {
                const bg = card.querySelector('.smc-bg');
                const drops = [
                    { left: '12%',  top: '25%', delay: '0s',    dur: '4.0s', size: 8,  splashSize: 55 },
                    { left: '28%',  top: '60%', delay: '1.2s',  dur: '3.5s', size: 6,  splashSize: 40 },
                    { left: '47%',  top: '38%', delay: '0.5s',  dur: '4.5s', size: 11, splashSize: 70 },
                    { left: '63%',  top: '72%', delay: '2.0s',  dur: '3.8s', size: 7,  splashSize: 48 },
                    { left: '79%',  top: '20%', delay: '0.8s',  dur: '4.2s', size: 9,  splashSize: 58 },
                    { left: '20%',  top: '80%', delay: '2.8s',  dur: '3.6s', size: 8,  splashSize: 52 },
                    { left: '55%',  top: '55%', delay: '1.5s',  dur: '4.8s', size: 6,  splashSize: 44 },
                    { left: '88%',  top: '45%', delay: '0.3s',  dur: '3.9s', size: 10, splashSize: 62 },
                    { left: '38%',  top: '15%', delay: '3.2s',  dur: '4.1s', size: 7,  splashSize: 50 },
                    { left: '72%',  top: '85%', delay: '1.8s',  dur: '3.7s', size: 9,  splashSize: 56 },
                ];
                drops.forEach(d => {
                    const wrap = document.createElement('div');
                    wrap.className = 'toxic-drop-wrap';
                    wrap.style.cssText = `left:${d.left}; top:${d.top}; animation-delay:${d.delay}; animation-duration:${d.dur};`;
                    wrap.innerHTML = `
                        <div class="toxic-drop" style="width:${d.size}px; height:${d.size}px; animation-delay:${d.delay}; animation-duration:${d.dur};"></div>
                        <div class="toxic-splash" style="width:${d.splashSize}px; height:${d.splashSize}px; animation-delay:${d.delay}; animation-duration:${d.dur};"></div>
                    `;
                    bg.appendChild(wrap);
                });
            }

            gallery.appendChild(card);
            
            // Radar node
            const rNode = document.createElement('div');
            rNode.className = 'ft-node';
            rNode.innerText = RomanToSector[sIdx] || String(sIdx + 1);
            rNode.onclick = () => {
                if (gallery.children[sIdx]) {
                    gallery.children[sIdx].scrollIntoView({behavior: 'smooth', inline: 'center'});
                }
                if (levelContainer.classList.contains('active')) {
                    renderLevels(sector, sIdx);
                }
            };
            radar.appendChild(rNode);
        });

        // ── LÓGICA DE RATÓN (DRAG-TO-SCROLL) ──
        let isDown = false;
        let startX;
        let scrollLeft;
        let dragged = false;

        gallery.onmousedown = (e) => {
            isDown = true;
            dragged = false;
            gallery.style.scrollSnapType = 'none'; // desactiva snap rigido mientras arrastra
            gallery.style.cursor = 'grabbing';
            startX = e.pageX - gallery.offsetLeft;
            scrollLeft = gallery.scrollLeft;
        };

        gallery.onmouseleave = () => {
            isDown = false;
            gallery.style.scrollSnapType = 'x mandatory';
            gallery.style.cursor = 'grab';
        };

        gallery.onmouseup = (e) => {
            isDown = false;
            gallery.style.scrollSnapType = 'x mandatory';
            gallery.style.cursor = 'grab';
            
            if (!dragged) {
                // Fue un click real, abrir niveles
                const card = e.target.closest('.sector-macro-card');
                if (card) {
                    const idx = parseInt(card.dataset.idx);
                    renderLevels(sectors[idx], idx);
                }
            } else {
                // Forzar resnap al contenedor más cercano tras haber soltado el ratón
                const snapNode = Math.round(gallery.scrollLeft / window.innerWidth);
                if (gallery.children[snapNode]) {
                    gallery.children[snapNode].scrollIntoView({behavior: 'smooth', inline: 'center'});
                }
            }
        };

        gallery.onmousemove = (e) => {
            if (!isDown) return;
            const x = e.pageX - gallery.offsetLeft;
            const walk = (x - startX) * 1.5; // multiplicador de scroll
            if (Math.abs(walk) > 5) {
                dragged = true;
            }
            gallery.scrollLeft = scrollLeft - walk;
        };
        // ─────────────────────────────────────

        if (autoOpenSectorIndex !== null && autoOpenSectorIndex !== undefined) {
            if (sectors[autoOpenSectorIndex]) {
                renderLevels(sectors[autoOpenSectorIndex], autoOpenSectorIndex);
                // Mover scroll instantaneo para que quede en contexto
                setTimeout(() => {
                    if (gallery.children[autoOpenSectorIndex]) {
                        gallery.children[autoOpenSectorIndex].scrollIntoView({behavior: 'instant', inline: 'center'});
                    }
                }, 50);
            }
        } else {
            levelContainer.classList.remove('active');
        }
    }

    setGameState(state, options = {}) {
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
            
            // Forzar actualización si hay callback global de repintado de sectores
            // Utilizando options.returnToSector
            if (window.level && window.SECTORS) {
                let sIdx = options.returnToSector ? window.level.currentSectorIndex : null;
                this.renderSectorGrid(window.SECTORS, window.level.state, (s, l) => {
                    if (window.ai) window.ai.setDifficulty(currentDifficulty);
                    window.level.loadLevel(s, l);
                }, sIdx);
            }
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
