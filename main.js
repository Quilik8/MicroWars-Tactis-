import { Engine, PIXI } from './src/core/engine.js';
import { UIManager } from './src/managers/ui_manager.js';
import { AIManager } from './src/managers/ai_manager.js';
import { WorldManager } from './src/managers/world_manager.js';
import { InputManager } from './src/managers/input_manager.js';
import { LevelManager } from './src/managers/level_manager.js';
import { CampaignCore } from './src/campaign/campaign_core.js';
import { SFX, resumeAudio, startMusic, stopMusic } from './src/managers/audio.js';
import { FACTIONS } from './src/campaign/faction_data.js';
import { LEVELS } from './src/data/levels.js';

// ══════════════════════════════════════════════════════════════
// CONFIGURACIÓN Y BOOTSTRAP
// ══════════════════════════════════════════════════════════════
const CONFIG = {
    gridCellSize: 30,
    combatInterval: 0.7,
    aiAttackInterval: 3     // solo usado si no hay dificultad activa (retrocompat)
};

// Velocidad actual del juego: 1 = normal, 2 = x2, 4 = x4
let gameSpeed = 1;

// ── Dificultad ────────────────────────────────────────────────
// 'easy' | 'normal' | 'hard' | 'brutal'
// Se persiste en localStorage para recordarla entre sesiones.
let currentDifficulty = _loadDifficulty();

function _loadDifficulty() {
    try {
        const saved = localStorage.getItem('microwars_difficulty');
        if (['easy', 'normal', 'hard', 'brutal'].includes(saved)) return saved;
    } catch (e) {}
    return 'normal';
}

function _saveDifficulty(d) {
    try { localStorage.setItem('microwars_difficulty', d); } catch (e) {}
}

function setDifficulty(d) {
    if (!['easy', 'normal', 'hard', 'brutal'].includes(d)) return;
    currentDifficulty = d;
    _saveDifficulty(d);
    ai.setDifficulty(d);
    // Actualizar botones en la UI
    ui.updateDifficultyButtons(d);
}

// ─────────────────────────────────────────────────────────────

const game = new Engine();
const ui = new UIManager({
    onTogglePause:        (p) => togglePause(p),
    onStartLevel:         (idx) => level.loadLevel(idx),
    onResetCamera:        () => {
        if (game.world) {
            game.world.position.set(0, 0);
            game.world.scale.set(1);
        }
    },
    onSpawnMenuAnts:      () => world.spawnMenuAnts(),
    onClearMenuAnts:      () => world.clearMenuAnts(),
    onClearLevel:         () => world.clearLevel(),
    onStartMusic:         (type, idx) => startMusic(type, idx),
    onStopMusic:          () => stopMusic(),
    onVictory:            () => SFX.victory(),
    onGameOver:           () => SFX.gameover(),
    onSendPercentChange:  (val) => input.setSendPercent(val),
    onRestartLevel:       () => level.loadLevel(level.currentLevelIndex),
    onNextLevel:          () => level.loadLevel(level.currentLevelIndex + 1),
    onZoom:               (factor) => input.doZoom(factor),
    onStartCampaign:      () => campaign.start(),
    onStopCampaign:       () => campaign.stop(),
    onPlayIntro:          () => SFX.intro(),
    onSetSpeed:           (speed) => setGameSpeed(speed),
    onSetDifficulty:      (d) => setDifficulty(d),   // ← NUEVO
    onRenderFactions:     () => {
        ui.renderFactionSelection(FACTIONS, (selectedFaction) => {
            campaign.setPlayerFaction(selectedFaction);
            ui.setGameState('CAMPAIGN');
        });
    }
});

const world    = new WorldManager(game, ui, CONFIG);
const ai       = new AIManager({ difficulty: currentDifficulty });
const campaign = new CampaignCore(game, ui);
const input    = new InputManager(game, world, ui, SFX, campaign);
const level    = new LevelManager(game, world, ui, SFX, { start: startMusic });

window.campaign = campaign;

// ══════════════════════════════════════════════════════════════
// LÓGICA DE CONTROL GLOBAL
// ══════════════════════════════════════════════════════════════
function togglePause(forcedState) {
    const newState = (forcedState !== undefined) ? forcedState : !ui.isPaused;
    ui.setPauseState(newState, true);
    if (game.app) {
        game.app.ticker.speed = newState ? 0 : gameSpeed;
        if (!newState) game.app.ticker.start();
    }
}

function setGameSpeed(speed) {
    gameSpeed = speed;
    if (game.app && !ui.isPaused) {
        game.app.ticker.speed = gameSpeed;
    }
    ui.updateSpeedButtons(gameSpeed);
}

// ══════════════════════════════════════════════════════════════
// BUCLE PRINCIPAL
// ══════════════════════════════════════════════════════════════
game.onUpdate = (dt) => {
    world.update(dt, ui.gameState, ui.isPaused, SFX);

    if (ui.gameState === 'PLAYING' && !ui.isPaused) {
        input.validateState();

        const pId = campaign.isStarted ? (campaign.playerFaction?.id || 'player') : 'player';

        const activeEnemies = ['enemy', 'fuego', 'carpinteras', 'bala', 'tejedoras'];
        for (const enemyFaction of activeEnemies) {
            ai.update(dt, world.nodes, world.allUnits, enemyFaction, pId);
        }

        const fps = game.app ? Math.round(game.app.ticker.FPS) : 0;
        let pUnits = 0, pPower = 0, eUnits = 0, eNodes = 0, pNodes = 0;

        for (const n of world.nodes) {
            if (n.owner === pId) pNodes++;
            else if (n.owner !== 'neutral') eNodes++;
        }
        for (const u of world.allUnits) {
            if (u.pendingRemoval) continue;
            if (u.faction === pId) { pUnits++; pPower += (u.power || 1); }
            else if (u.faction !== 'neutral') eUnits++;
        }

        ui.updateHUD(fps, pUnits, pPower);
        level.checkVictory(dt, pNodes, eNodes, pUnits, eUnits);
    }
};

game.onDraw = (ctx) => {
    input.draw(ctx);
    world.drawSweep(ctx, ui.gameState, ui.isPaused);
};

// ══════════════════════════════════════════════════════════════
// INICIALIZACIÓN
// ══════════════════════════════════════════════════════════════
window.addEventListener('load', async () => {
    ui.init();
    await game.init();
    world.init(game.app);
    input.init();
    campaign.init();
    ui.renderLevelGrid(LEVELS, level.unlockedLevels, (idx) => {
        // Aplicar dificultad actual justo antes de cargar el nivel
        ai.setDifficulty(currentDifficulty);
        level.loadLevel(idx);
    });
    ui.setGameState('MENU');

    // Inicializar botones de dificultad con el valor guardado
    ui.updateDifficultyButtons(currentDifficulty);
});

// Gather point en menú principal
window.addEventListener('pointerdown', (e) => {
    if (ui.gameState !== 'MENU') return;
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('a')) return;
    world.setMenuGather(e.clientX, e.clientY);
});

window.addEventListener('pointerdown', () => {
    resumeAudio();
}, { once: true });

// ── Puentes globales (Legacy / HTML buttons) ──────────────────
window.togglePause    = () => togglePause();
window.restartLevel   = () => { setGameSpeed(1); level.loadLevel(level.currentLevelIndex); };
window.backToMenu     = () => { setGameSpeed(1); togglePause(false); ui.setGameState('MENU'); };
window.surrender      = () => {
    setGameSpeed(1);
    if (ui.callbacks.onClearLevel) ui.callbacks.onClearLevel();
    togglePause(false);
    ui.setGameState('MENU');
};
window.startLevel     = (idx) => level.loadLevel(idx);
window.setDifficulty  = setDifficulty;   // acceso global para botones HTML si hiciera falta
