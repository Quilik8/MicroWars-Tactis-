import { gateWall, verticalGateWall, hollowPulse, node, BARRIER_COLOR } from './helpers.js';

export const sector6 = {
    id: 'sector-6',
    name: 'Sector 6: Barreras Dinamicas',
    description: 'Compuertas intermitentes, celdas pulsantes y barridos solares convierten cada avance en una prueba de sincronizacion.',
    config: { allowEvolutions: true },
    levels: [
        {
            name: 'Nivel 1: El Latido de la Espiral',
            description: 'Las barreras pulsan hacia afuera desde el centro como un latido.\nSincroniza el avance a traves de las capas mientras evitas el rayo solar.',
            nodes: [
                node('p_base', 0.1, 0.5, 'player', 'gigante', 150),
                node('p_top', 0.2, 0.2, 'neutral', 'normal', 25),
                node('p_bot', 0.2, 0.8, 'neutral', 'normal', 25),
                node('ring_1_t', 0.5, 0.3, 'neutral', 'enjambre', 20, { isMarkedForSweep: true }),
                node('ring_1_b', 0.5, 0.7, 'neutral', 'enjambre', 20, { isMarkedForSweep: true }),
                node('center', 0.5, 0.5, 'neutral', 'gigante', 80, { isMarkedForSweep: true }),
                node('e_base', 0.9, 0.5, 'enemy', 'gigante', 180)
            ],
            intermittentBarriers: [
                hollowPulse(0.40, 0.40, 0.20, 0.20, 6, 0),
                hollowPulse(0.30, 0.30, 0.40, 0.40, 6, 2),
                hollowPulse(0.20, 0.20, 0.60, 0.60, 6, 4)
            ],
            lightSweeps: [
                { cooldown: 18, initialDelay: 10, rails: [0.5] }
            ]
        },
        {
            name: 'Nivel 2: Las Tres Eclusas',
            description: 'Tres barreras masivas cruzan el mapa. Sus compuertas se abren en momentos distintos.\nAcumula tropas entre eclusas y avanza en el momento exacto.',
            nodes: [
                node('p_base', 0.08, 0.5, 'player', 'gigante', 150),
                node('plaza_1_t', 0.2, 0.2, 'neutral', 'normal', 20),
                node('plaza_1_b', 0.2, 0.8, 'neutral', 'normal', 20),
                node('plaza_2_t', 0.4, 0.2, 'neutral', 'normal', 20),
                node('plaza_2_b', 0.4, 0.8, 'neutral', 'normal', 20),
                node('plaza_3_m', 0.6, 0.5, 'neutral', 'enjambre', 30),
                node('enemy_front', 0.8, 0.5, 'enemy', 'normal', 60),
                node('enemy_core', 0.92, 0.5, 'enemy', 'gigante', 180)
            ],
            intermittentBarriers: [
                ...verticalGateWall(0.3, 0.04, [[0.4, 0.6]], 8, 0),
                ...verticalGateWall(0.5, 0.04, [[0.1, 0.3], [0.7, 0.9]], 8, 3),
                ...verticalGateWall(0.7, 0.04, [[0.4, 0.6]], 8, 6)
            ]
        },
        {
            name: 'Nivel 3: La Prision de Sombras',
            description: 'Los nodos neurales mas ricos estan protegidos en celdas temporales.\nEl Rayo Solar los resetea periodicamente. Entra y refuerza justo despues del barrido.',
            nodes: [
                node('p_base', 0.1, 0.8, 'player', 'gigante', 150),
                node('safe_l', 0.2, 0.5, 'neutral', 'normal', 20),
                node('safe_r', 0.8, 0.5, 'neutral', 'normal', 20),
                node('cell_1', 0.4, 0.3, 'neutral', 'gigante', 30, { isMarkedForSweep: true }),
                node('cell_2', 0.6, 0.7, 'neutral', 'gigante', 30, { isMarkedForSweep: true }),
                node('enemy_core', 0.9, 0.2, 'enemy', 'gigante', 180)
            ],
            intermittentBarriers: [
                hollowPulse(0.35, 0.20, 0.10, 0.20, 7, 0),
                hollowPulse(0.55, 0.60, 0.10, 0.20, 7, 3.5)
            ],
            lightSweeps: [
                { cooldown: 14, initialDelay: 5, rails: [0.3, 0.7] }
            ]
        },
        {
            name: 'Nivel 4: Laberinto de Espejos Desfasados',
            description: 'Dos opciones: la ruta central es rapida pero esta plagada de muros parpadeantes mortales.\nLa ruta exterior es un paseo largo y lento.',
            nodes: [
                node('p_base', 0.1, 0.5, 'player', 'gigante', 150),
                node('detour_top', 0.5, 0.1, 'neutral', 'enjambre', 15),
                node('detour_bot', 0.5, 0.9, 'neutral', 'enjambre', 15),
                node('flicker_1', 0.3, 0.5, 'neutral', 'normal', 15),
                node('flicker_2', 0.5, 0.5, 'neutral', 'normal', 15),
                node('flicker_3', 0.7, 0.5, 'neutral', 'normal', 15),
                node('enemy_core', 0.9, 0.5, 'enemy', 'gigante', 180)
            ],
            intermittentBarriers: [
                ...verticalGateWall(0.25, 0.03, [[0.4, 0.6]], 3, 0),
                ...verticalGateWall(0.45, 0.03, [[0.4, 0.6]], 3, 1),
                ...verticalGateWall(0.65, 0.03, [[0.4, 0.6]], 3, 2),
                ...verticalGateWall(0.85, 0.03, [[0.4, 0.6]], 3, 0),
                {
                    zones: [
                        { x: 0.2, y: 0.25, width: 0.7, height: 0.05, color: BARRIER_COLOR },
                        { x: 0.2, y: 0.7, width: 0.7, height: 0.05, color: BARRIER_COLOR }
                    ],
                    interval: 1000,
                    initialDelay: 0,
                    activeZoneIndex: 0
                }
            ]
        },
        {
            name: 'Nivel 5: El Gran Engranaje',
            description: 'El nucleo del engranaje se hace accesible cada 25 segundos.\nLos rieles solares limpian formaciones.',
            nodes: [
                node('p_base', 0.1, 0.5, 'player', 'gigante', 170),
                node('gear_tl', 0.3, 0.25, 'neutral', 'normal', 30),
                node('gear_bl', 0.3, 0.75, 'neutral', 'normal', 30),
                node('gear_r', 0.75, 0.5, 'neutral', 'normal', 40),
                node('center', 0.5, 0.5, 'neutral', 'gigante', 120, { isMarkedForSweep: true }),
                node('enemy_top', 0.85, 0.2, 'enemy', 'gigante', 150),
                node('enemy_bot', 0.85, 0.8, 'fuego', 'gigante', 150)
            ],
            intermittentBarriers: [
                {
                    zones: [
                        { x: 0.40, y: 0.40, width: 0.20, height: 0.02, color: BARRIER_COLOR }, 
                        { x: 0.40, y: 0.58, width: 0.20, height: 0.02, color: BARRIER_COLOR }, 
                        { x: 0.40, y: 0.40, width: 0.02, height: 0.20, color: BARRIER_COLOR }, 
                        { x: 0.58, y: 0.40, width: 0.02, height: 0.20, color: BARRIER_COLOR }  
                    ],
                    interval: 1000,
                    initialDelay: 0,
                    activeZoneIndex: 0
                },
                ...verticalGateWall(0.40, 0.03, [[0.45, 0.55]], 25, 0),
                ...verticalGateWall(0.57, 0.03, [[0.45, 0.55]], 25, 0),
                ...gateWall(0.40, 0.03, [[0.45, 0.55]], 25, 0),
                ...gateWall(0.57, 0.03, [[0.45, 0.55]], 25, 0)
            ],
            lightSweeps: [
                { cooldown: 20, initialDelay: 5, rails: [0.25, 0.75] }
            ]
        }
    ]
};
