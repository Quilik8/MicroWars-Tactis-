/**
 * CampaignCore - Orquestador modular del modo campaña.
 */
import { MapLogic } from './map_logic.js';
import { MapVisuals } from './map_visuals.js';
import { StateManager } from './state_manager.js';
import { FACTIONS } from './faction_data.js';

export class CampaignCore {
    constructor(game, ui) {
        this.game = game;
        this.ui = ui;

        this.state = new StateManager();
        this.logic = new MapLogic();
        // BUGFIX #4: visuals se crea en init() cuando game.app ya está disponible
        this.visuals = null;

        // BUGFIX #5: propiedades que main.js espera pero no existían
        this.isStarted = false;
        this.playerFaction = null;
    }

    /** Llamado desde main.js DESPUÉS de await game.init() */
    init() {
        // Ahora game.app está disponible de forma segura
        this.visuals = new MapVisuals(this.game, this.ui, this);

        // Cargar estado previo o generar uno nuevo
        if (!this.state.load()) {
            this.generateNewCampaign();
        }
    }

    generateNewCampaign() {
        const mapData = this.logic.generateMap();
        this.state.initialize(mapData, FACTIONS);
        this.state.save();
    }

    setPlayerFaction(faction) {
        // BUGFIX #5: guardar la referencia completa al objeto facción
        this.playerFaction = faction;
        this.state.data.playerFaction = faction.id;
        this.state.save();
    }

    start() {
        this.isStarted = true;
        if (this.visuals) this.visuals.render(this.state.data);
    }

    stop() {
        this.isStarted = false;
        if (this.visuals) this.visuals.clear();
    }
}
