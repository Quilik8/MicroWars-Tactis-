import { LEVELS } from './levels.js';
import { Node } from './node.js';

export class LevelManager {
    constructor(game, world, ui, sfx, music) {
        this.game = game;
        this.world = world;
        this.ui = ui;
        this.sfx = sfx;
        this.startMusic = music.start; // reference to startMusic

        this.currentLevelIndex = 0;
        this.unlockedLevels = 1;

        this.loadProgress();
    }

    loadProgress() {
        const saved = localStorage.getItem('microwars_save');
        if (saved) {
            try {
                this.unlockedLevels = JSON.parse(saved).unlockedLevels || 1;
            } catch (e) { console.error("Error loading save:", e); }
        }
    }

    saveProgress() {
        localStorage.setItem('microwars_save', JSON.stringify({ unlockedLevels: this.unlockedLevels }));
    }

    loadLevel(index) {
        if (index >= LEVELS.length) index = 0;
        this.currentLevelIndex = index;

        // 1. Set state to PLAYING first (hides menus/intro)
        this.ui.setGameState('PLAYING');

        // 2. Clear and reset camera
        this.world.clearLevel();
        if (this.ui.callbacks && this.ui.callbacks.onResetCamera) {
            this.ui.callbacks.onResetCamera();
        }

        const cx = this.game.width || window.innerWidth;
        const cy = this.game.height || window.innerHeight;
        const levelData = LEVELS[index];

        this.world.nodes = levelData.nodes.map(nData => {
            return new Node(nData.x * cx, nData.y * cy, nData.owner, nData.type);
        });

        for (let n of this.world.nodes) {
            this.world.createNodeGfx(n);
        }

        // Populate nodes
        for (let i = 0; i < this.world.nodes.length; i++) {
            let n = this.world.nodes[i];
            let cant = Math.floor(n.maxUnits * 0.5);
            this.world.spawnUnitsAt(n, levelData.nodes[i].owner, cant);
        }

        // UI Intro
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

    checkVictory(playerNodes, enemyNodes, playerUnits, enemyUnits) {
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
