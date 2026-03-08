/**
 * Archivo de Niveles (JSON/Objetos)
 * Las coordenadas x e y están en formato de porcentaje (0.0 a 1.0)
 * para que el mapa se estire y adapte dinámicamente a cualquier resolución o pantalla de celular.
 */

export const LEVELS = [
    {
        name: "Nivel 1: Aprende a Conquistar",
        description: "1. Haz CLIC en tu base azul.\n2. Ajusta la barra de enviar tropas al 100%.\n3. Haz CLIC en el nodo enemigo para atacarlo.",
        nodes: [
            { id: "base_player", x: 0.15, y: 0.5, owner: 'player', type: 'normal', startUnits: 80 },
            { id: "base_enemy", x: 0.85, y: 0.5, owner: 'enemy', type: 'normal', startUnits: 50 },
            { id: "neutral_center", x: 0.5, y: 0.5, owner: 'neutral', type: 'normal', startUnits: 20 }
        ]
    },
    {
        name: "Nivel 2: Disputa por los Recursos",
        description: "Asegura los nodos de tipo enjambre del centro ántes que el enemigo.",
        nodes: [
            { id: "base_player", x: 0.1, y: 0.8, owner: 'player', type: 'gigante', startUnits: 150 },
            { id: "base_enemy", x: 0.9, y: 0.2, owner: 'enemy', type: 'gigante', startUnits: 150 },
            { id: "swarm_1", x: 0.35, y: 0.35, owner: 'neutral', type: 'enjambre', startUnits: 30 },
            { id: "swarm_2", x: 0.65, y: 0.65, owner: 'neutral', type: 'enjambre', startUnits: 30 }
        ]
    },
    {
        name: "Nivel 3: El Foso Central",
        description: "Estamos rodeados. Sobrevive a dos frentes simultáneos.",
        nodes: [
            { id: "player_center", x: 0.5, y: 0.5, owner: 'player', type: 'normal', startUnits: 200 },
            { id: "enemy_1", x: 0.1, y: 0.1, owner: 'enemy', type: 'enjambre', startUnits: 100 },
            { id: "enemy_2", x: 0.9, y: 0.8, owner: 'enemy', type: 'enjambre', startUnits: 100 },
            { id: "neutral_top", x: 0.8, y: 0.2, owner: 'neutral', type: 'gigante', startUnits: 60 },
            { id: "neutral_bot", x: 0.2, y: 0.8, owner: 'neutral', type: 'gigante', startUnits: 60 }
        ]
    }
];
