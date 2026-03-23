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
    },
    {
        name: "CONEXIONES SUBTERRÁNEAS",
        description: "Utiliza los Túneles Profundos para viajar largas distancias. Crea Caminos Logísticos fuertes. Lucha entre tres frentes iguales.",
        nodes: [
            // BASES (1 por Facción, totalmente equilibradas)
            { id: "base_player", x: 0.1,  y: 0.5,  owner: 'player',  type: 'gigante',  startUnits: 150 },
            { id: "base_enemy",  x: 0.9,  y: 0.5,  owner: 'enemy',   type: 'gigante',  startUnits: 150 },
            { id: "base_fuego",  x: 0.5,  y: 0.9,  owner: 'fuego',   type: 'gigante',  startUnits: 150 },

            // VARIEDAD DE NODOS CENTRALES
            { id: "center",      x: 0.5,  y: 0.5,  owner: 'neutral', type: 'enjambre' },
            { id: "mid_left",    x: 0.35, y: 0.5,  owner: 'neutral', type: 'normal' },
            { id: "mid_right",   x: 0.65, y: 0.5,  owner: 'neutral', type: 'normal' },
            { id: "flank_tl",    x: 0.35, y: 0.35, owner: 'neutral', type: 'enjambre' },
            { id: "flank_tr",    x: 0.65, y: 0.35, owner: 'neutral', type: 'enjambre' },
            { id: "top",         x: 0.5,  y: 0.2,  owner: 'neutral', type: 'gigante' },

            // TÚNELES PROFUNDOS (Teletransporte bi-direccional)
            { id: 'hole_left',   x: 0.15, y: 0.8,  owner: 'neutral', type: 'tunel', tunnelTo: 'hole_right', startUnits: 0 },
            { id: 'hole_right',  x: 0.85, y: 0.2,  owner: 'neutral', type: 'tunel', tunnelTo: 'hole_left',  startUnits: 0 }
        ]
    },
    {
        name: "Nivel 5: La Hoja Flotante",
        description: "El centro está bloqueado por un charco de insecticida letal. Usa la hoja flotante móvil para cruzar de forma segura sin perder tropas.",
        nodes: [
            // Jugador (Azul) - Izquierda central
            { id: "p1", x: 0.1, y: 0.5, owner: 'player', type: 'gigante', startUnits: 150 },
            { id: "p2", x: 0.1, y: 0.3, owner: 'neutral', type: 'normal', startUnits: 20 },
            { id: "p3", x: 0.1, y: 0.7, owner: 'neutral', type: 'normal', startUnits: 20 },

            // Enemigo 1 (Rojo) - Esquina superior derecha
            { id: "e1", x: 0.9, y: 0.1, owner: 'enemy', type: 'gigante', startUnits: 150 },
            { id: "e2", x: 0.7, y: 0.1, owner: 'neutral', type: 'normal', startUnits: 20 },

            // Enemigo 2 (Naranja) - Esquina inferior derecha
            { id: "f1", x: 0.9, y: 0.9, owner: 'fuego', type: 'gigante', startUnits: 150 },
            { id: "f2", x: 0.7, y: 0.9, owner: 'neutral', type: 'normal', startUnits: 20 },

            // Centro y Nodos Estratégicos
            { id: "center", x: 0.6, y: 0.5, owner: 'neutral', type: 'gigante', startUnits: 100 },
            { id: "top_mid", x: 0.6, y: 0.2, owner: 'neutral', type: 'enjambre', startUnits: 50 },
            { id: "bot_mid", x: 0.6, y: 0.8, owner: 'neutral', type: 'enjambre', startUnits: 50 },

            // Hoja Flotante Móvil (El Ferry oscilante)
            { id: "hoja_movil", x: 0.35, y: 0.5, owner: 'neutral', type: 'enjambre', startUnits: 0, isMobile: true, orbitAnchorX: 0.34, orbitAnchorY: 0.5, orbitRadiusX: 0.17, orbitRadiusY: 0, orbitSpeed: 0.6 }
        ],
        hazards: [
            // Zona que rodea parcialmente la salida del jugador (Semicírculo protector bloqueante)
            { x: 0.16, y: 0.5, radius: 0.30, dps: 15, color: 0x8e44ad, alpha: 0.25, shape: "semicircle" }
        ]
    },
    {
        name: "Nivel 6: Carreteras y Pantanos",
        description: "El terreno afecta a tu velocidad. Las zonas verdes (carreteras de hojas) te aceleran el doble. Las zonas rojas (barro pegajoso) te ralentizan a la mitad.",
        nodes: [
            // Jugador (Azul) - Centro izquierda en zona verde
            { id: "p1", x: 0.15, y: 0.35, owner: 'player', type: 'gigante', startUnits: 150 },
            { id: "p2", x: 0.25, y: 0.25, owner: 'neutral', type: 'normal', startUnits: 20 },
            { id: "p3", x: 0.25, y: 0.45, owner: 'neutral', type: 'normal', startUnits: 20 },

            // Enemigo 1 (Rojo) - Esquina inferior derecha en zona verde
            { id: "e1", x: 0.85, y: 0.65, owner: 'enemy', type: 'gigante', startUnits: 150 },
            { id: "e2", x: 0.75, y: 0.55, owner: 'neutral', type: 'normal', startUnits: 20 },
            { id: "e3", x: 0.75, y: 0.75, owner: 'neutral', type: 'normal', startUnits: 20 },

            // Nodos neutrales en la lenta zona roja (centro y diagonales opuestas)
            { id: "n1", x: 0.5, y: 0.5, owner: 'neutral', type: 'enjambre', startUnits: 80 },
            { id: "n2", x: 0.2, y: 0.8, owner: 'neutral', type: 'normal', startUnits: 30 },
            { id: "n3", x: 0.3, y: 0.7, owner: 'neutral', type: 'normal', startUnits: 30 },
            { id: "n4", x: 0.8, y: 0.2, owner: 'neutral', type: 'normal', startUnits: 30 },
            { id: "n5", x: 0.7, y: 0.3, owner: 'neutral', type: 'normal', startUnits: 30 }
        ],
        zones: [
            // Zonas Verdes (Rápidas)
            { id: "green1", color: 0x00FF00, alpha: 0.2, speedMult: 2.0, x: 0.05, y: 0.1, width: 0.35, height: 0.4 },
            { id: "green2", color: 0x00FF00, alpha: 0.2, speedMult: 2.0, x: 0.6, y: 0.5, width: 0.35, height: 0.4 },
            
            // Zona Roja (Lenta) cubriendo el resto / fondo base
            { id: "red1", color: 0xFF0000, alpha: 0.15, speedMult: 0.5, x: 0.0, y: 0.0, width: 1.0, height: 1.0 }
        ]
    }
];
