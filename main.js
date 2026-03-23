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
    aiAttackInterval: 3
};

const game = new Engine();
const ui = new UIManager({
    onTogglePause: (p) => togglePause(p),
    onStartLevel: (idx) => level.loadLevel(idx),
    onResetCamera: () => {
        if (game.world) {
            game.world.position.set(0, 0);
            game.world.scale.set(1);
        }
    },
    onSpawnMenuAnts: () => world.spawnMenuAnts(),
    onClearMenuAnts: () => world.clearMenuAnts(),
    onClearLevel: () => world.clearLevel(),
    onStartMusic: (type, idx) => startMusic(type, idx),
    onStopMusic: () => stopMusic(),
    onVictory: () => SFX.victory(),
    onGameOver: () => SFX.gameover(),
    onSendPercentChange: (val) => input.setSendPercent(val),
    onRestartLevel: () => level.loadLevel(level.currentLevelIndex),
    onNextLevel: () => level.loadLevel(level.currentLevelIndex + 1),
    onZoom: (factor) => input.doZoom(factor),
    onStartCampaign: () => campaign.start(),
    onStopCampaign: () => campaign.stop(),
    onPlayIntro: () => SFX.intro(),
    onRenderFactions: () => {
        ui.renderFactionSelection(FACTIONS, (selectedFaction) => {
            campaign.setPlayerFaction(selectedFaction);
            ui.setGameState('CAMPAIGN');
        });
    }
});
const world = new WorldManager(game, ui, CONFIG);

const ai = new AIManager({ attackInterval: CONFIG.aiAttackInterval });
const input = new InputManager(game, world, ui, SFX);
const level = new LevelManager(game, world, ui, SFX, { start: startMusic });
const campaign = new CampaignCore(game, ui);

// Exponer para InputManager (Auditoría: Fallo de desacoplamiento temporal)
window.campaign = campaign;

// ══════════════════════════════════════════════════════════════
// LÓGICA DE CONTROL GLOBAL
// ══════════════════════════════════════════════════════════════
function togglePause(forcedState) {
    const newState = (forcedState !== undefined) ? forcedState : !ui.isPaused;
    ui.setPauseState(newState, true); // Update UI
    if (game.app) {
        game.app.ticker.speed = newState ? 0 : 1;
        // Si estamos reanudando, asegurar que el ticker esté corriendo
        if (!newState) game.app.ticker.start();
    }
}

// ══════════════════════════════════════════════════════════════
// BUCLE PRINCIPAL (Delegación Total)
// ══════════════════════════════════════════════════════════════
game.onUpdate = (dt) => {
    // 1. Simulación física y lógica de mundo
    world.update(dt, ui.gameState, ui.isPaused, SFX);

    // 2. Lógica específica de partida activa
    if (ui.gameState === 'PLAYING' && !ui.isPaused) {
        // IDs dinámicos basados en el modo (Campaña vs Skirmish)
        const pId = campaign.isStarted ? (campaign.playerFaction?.id || 'player') : 'player';

        const activeEnemies = ['enemy', 'fuego', 'carpinteras', 'bala', 'tejedoras'];
        for (let enemyFaction of activeEnemies) {
            ai.update(dt, world.nodes, world.allUnits, enemyFaction, pId);
        }

        // 3. Telemetría y HUD
        const fps = game.app ? Math.round(game.app.ticker.FPS) : 0;
        let pUnits = 0, pPower = 0, eUnits = 0, eNodes = 0, pNodes = 0;

        for (let n of world.nodes) {
            if (n.owner === pId) pNodes++;
            else if (n.owner !== 'neutral') eNodes++;
        }
        for (let u of world.allUnits) {
            if (u.pendingRemoval) continue;
            if (u.faction === pId) {
                pUnits++;
                pPower += (u.power || 1);
            } else if (u.faction !== 'neutral') {
                eUnits++;
            }
        }

        ui.updateHUD(fps, pUnits, pPower);

        // 4. Condiciones de Victoria/Derrota
        level.checkVictory(dt, pNodes, eNodes, pUnits, eUnits);
    }
};

game.onDraw = (ctx) => {
    input.draw(ctx);
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
    ui.renderLevelGrid(LEVELS, LEVELS.length, (idx) => level.loadLevel(idx)); // Temporarily unlock all
    ui.setGameState('MENU');
});

// Desbloquear audio
window.addEventListener('pointerdown', () => {
    resumeAudio();
}, { once: true });


// ══════════════════════════════════════════════════════════════
// PUENTES GLOBALES (Legacy Compatibility / HTML Buttons)
// ══════════════════════════════════════════════════════════════
window.togglePause = () => togglePause();
window.restartLevel = () => level.loadLevel(level.currentLevelIndex);
window.backToMenu = () => { togglePause(false); ui.setGameState('MENU'); };
window.surrender = () => { if (ui.callbacks.onClearLevel) ui.callbacks.onClearLevel(); togglePause(false); ui.setGameState('MENU'); };
window.startLevel = (idx) => level.loadLevel(idx);
