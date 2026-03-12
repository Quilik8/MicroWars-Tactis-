/**
 * StateManager - Persistencia y estado de la campaña.
 */
export class StateManager {
    constructor() {
        this.data = {
            playerFaction: null,
            turn: 1,
            nodes: [],
            connections: [],
            factions: []
        };
    }

    initialize(mapData, factions) {
        this.data.nodes = mapData.nodes;
        this.data.connections = mapData.connections;
        this.data.factions = factions;

        // FIX #21: Solo las facciones NO premium ocupan posiciones del tablero (máx 6).
        // 'player' no es un ID válido — el jugador elige su facción en la pantalla de selección.
        const playableFactions = factions.filter(f => !f.isPremium);
        const outerRingNodes = this.data.nodes.filter(n => n.ring === 3);

        playableFactions.forEach((f, i) => {
            if (outerRingNodes[i]) {
                outerRingNodes[i].owner = f.id;
            }
        });

        // El playerFaction se establece cuando el usuario selecciona en la pantalla de facciones.
        // Por defecto asignamos la primera facción jugable como placeholder.
        this.data.playerFaction = playableFactions[0]?.id || null;
    }

    load() {
        const saved = localStorage.getItem('microwars_campaign');
        if (saved) {
            try {
                this.data = JSON.parse(saved);
                return true;
            } catch (e) {
                console.warn('Error cargando estado de campaña, generando nuevo:', e);
                return false;
            }
        }
        return false;
    }

    save() {
        localStorage.setItem('microwars_campaign', JSON.stringify(this.data));
    }
}
