import { gateWall, verticalGateWall, hollowPulse, node, BARRIER_COLOR } from './helpers.js';

export const sector6 = {
    id: 'sector-6',
    name: 'Sector 6: Barreras Dinamicas',
    description: 'Compuertas intermitentes, celdas pulsantes y barridos solares convierten cada avance en una prueba de sincronizacion.',
    config: { allowEvolutions: true },
    aiStrategy: {
        focus: 'timing',
        aggressionMult: 0.80,
        minEvolutionGarrison: 32,
        minPostCaptureGarrison: 14,
        hazardPolicy: 'cautious',
        maxRouteCasualtyRatio: 0.18,
        antiPendulum: {
            targetCooldownSec: 6,
            sourceCooldownSec: 2.5,
            recaptureCooldownSec: 12,
            flipWindowSec: 32,
            maxFlipsBeforePenalty: 1,
            recentAttackPenalty: 480,
            flipPenalty: 800,
            sourceRepeatPenalty: 250
        },
        difficultyOverrides: {
            easy: {
                aggressionMult: 0.50,
                maxRouteCasualtyRatio: 0.10,
                antiPendulum: {
                    recaptureCooldownSec: 16,
                    flipPenalty: 1000
                }
            },
            hard: {
                aggressionMult: 1.10,
                hazardPolicy: 'normal',
                maxRouteCasualtyRatio: 0.25,
                minEvolutionGarrison: 26,
                antiPendulum: {
                    recaptureCooldownSec: 8,
                    flipPenalty: 550
                }
            }
        }
    },
    levels: [
        {
            name: 'Nivel 27: El Latido de la Espiral',
            description: 'Las barreras pulsan hacia afuera desde el centro como un latido.\nSincroniza el avance a traves de las capas mientras evitas el rayo solar.',
            nodes: [
                // ── Bases principales ────────────────────────────────────────
                node('p_base', 0.04, 0.50, 'player',  'gigante', 150),
                node('e_base', 0.96, 0.50, 'enemy',   'gigante', 180),
                // ── Satélites de staging (FUERA del anillo exterior) ─────────
                // Claramente al margen de la pared izquierda/derecha del outer box
                node('p_top',    0.08, 0.25, 'neutral', 'normal', 25),
                node('p_bot',    0.08, 0.75, 'neutral', 'normal', 25),
                node('e_top',    0.92, 0.25, 'neutral', 'normal', 25),
                node('e_bot',    0.92, 0.75, 'neutral', 'normal', 25),
                // ── Nodos interiores marcados para el rayo solar ─────────────
                // ring_1_t y ring_1_b quedan centrados en corredores mas amplios.
                node('ring_1_t', 0.50, 0.265, 'neutral', 'enjambre', 20, { isMarkedForSweep: true }),
                node('ring_1_b', 0.50, 0.735, 'neutral', 'enjambre', 20, { isMarkedForSweep: true }),
                // center: dentro del inner box con margen limpio en los 4 lados
                node('center',   0.50, 0.50, 'neutral', 'gigante',  80, { isMarkedForSweep: true })
            ],
            intermittentBarriers: [
                // inner: caja mas amplia para que el nodo gigante central respire.
                hollowPulse(0.36, 0.35, 0.28, 0.30, 6, 0),
                // middle: abre corredores superior/inferior para los nodos marcados.
                hollowPulse(0.25, 0.14, 0.50, 0.72, 6, 2),
                // outer: mantiene los satelites fuera del anillo con mas margen lateral.
                hollowPulse(0.14, 0.04, 0.72, 0.92, 6, 4)
            ],
            lightSweeps: [
                // 3 rieles que pasan EXACTAMENTE por los centros de los 3 nodos marcados:
                //   rail 0.265 → ring_1_t (y=0.265)
                //   rail 0.50 → center   (y=0.50)
                //   rail 0.735 → ring_1_b (y=0.735)
                { cooldown: 18, initialDelay: 10, rails: [0.265, 0.50, 0.735] }
            ]
        },
        {
            name: 'Nivel 28: Las Tres Eclusas',
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
            name: 'Nivel 29: La Prision de Sombras',
            description: 'Los nodos neurales mas ricos estan protegidos en celdas temporales.\nEl Rayo Solar castiga las bases activas; usa las prisiones como refugios de expansion.',
            nodes: [
                node('p_base', 0.1, 0.8, 'player', 'gigante', 150, { isMarkedForSweep: true }),
                node('safe_l', 0.2, 0.5, 'neutral', 'normal', 20),
                node('safe_r', 0.8, 0.5, 'neutral', 'normal', 20),
                node('cell_1', 0.4, 0.3, 'neutral', 'gigante', 30),
                node('cell_2', 0.6, 0.7, 'neutral', 'gigante', 30),
                node('enemy_core', 0.9, 0.2, 'enemy', 'gigante', 180, { isMarkedForSweep: true })
            ],
            intermittentBarriers: [
                hollowPulse(0.30, 0.15, 0.20, 0.30, 7, 0),
                hollowPulse(0.50, 0.55, 0.20, 0.30, 7, 3.5)
            ],
            lightSweeps: [
                { cooldown: 14, initialDelay: 5, rails: [0.2, 0.8] }
            ]
        },
        {
            name: 'Nivel 30: Laberinto de Espejos Desfasados',
            description: 'Dos opciones: la ruta central es rapida pero esta plagada de muros parpadeantes mortales.\nLa ruta exterior es un paseo largo y lento.',
            nodes: [
                node('p_base', 0.1, 0.5, 'player', 'gigante', 150, { isMarkedForSweep: true }),
                node('top_1', 0.35, 0.14, 'neutral', 'enjambre', 25),
                node('top_2', 0.55, 0.14, 'neutral', 'enjambre', 25),
                node('top_3', 0.75, 0.14, 'neutral', 'enjambre', 25),
                node('mid_1', 0.33, 0.5, 'neutral', 'normal', 15, { isMarkedForSweep: true }),
                node('mid_2', 0.50, 0.5, 'neutral', 'normal', 15, { isMarkedForSweep: true }),
                node('mid_3', 0.67, 0.5, 'neutral', 'normal', 15, { isMarkedForSweep: true }),
                node('bot_1', 0.35, 0.86, 'neutral', 'enjambre', 25),
                node('bot_2', 0.55, 0.86, 'neutral', 'enjambre', 25),
                node('bot_3', 0.75, 0.86, 'neutral', 'enjambre', 25),
                node('enemy_core', 0.94, 0.5, 'enemy', 'gigante', 180, { isMarkedForSweep: true })
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
            ],
            lightSweeps: [
                { cooldown: 16, initialDelay: 6, rails: [0.5] }
            ]
        },
        {
            name: 'Nivel 31: El Gran Engranaje',
            description: 'El nucleo del engranaje se hace accesible cada 25 segundos.\nLos rieles solares limpian formaciones.',
            nodes: [
                node('p_base', 0.1, 0.5, 'player', 'gigante', 170, { isMarkedForSweep: true }),
                node('gear_tl', 0.24, 0.25, 'neutral', 'normal', 30),
                node('gear_bl', 0.24, 0.78, 'neutral', 'normal', 30),
                node('gear_r', 0.75, 0.5, 'neutral', 'normal', 40),
                node('center', 0.5, 0.5, 'neutral', 'gigante', 120, { isMarkedForSweep: true }),
                node('enemy_top_guard', 0.74, 0.16, 'neutral', 'normal', 25),
                node('enemy_bot_guard', 0.74, 0.84, 'neutral', 'normal', 25),
                node('enemy_top', 0.89, 0.16, 'enemy', 'gigante', 150, { isMarkedForSweep: true }),
                node('enemy_bot', 0.89, 0.84, 'fuego', 'gigante', 150, { isMarkedForSweep: true })
            ],
            intermittentBarriers: [
                {
                    zones: [
                        { x: 0.34, y: 0.30, width: 0.32, height: 0.02, color: BARRIER_COLOR }, 
                        { x: 0.34, y: 0.68, width: 0.32, height: 0.02, color: BARRIER_COLOR }, 
                        { x: 0.34, y: 0.30, width: 0.02, height: 0.40, color: BARRIER_COLOR }, 
                        { x: 0.64, y: 0.30, width: 0.02, height: 0.40, color: BARRIER_COLOR }  
                    ],
                    interval: 1000,
                    initialDelay: 0,
                    activeZoneIndex: 0
                },
                ...verticalGateWall(0.33, 0.025, [[0.38, 0.62]], 25, 0),
                ...verticalGateWall(0.65, 0.025, [[0.38, 0.62]], 25, 0),
                ...gateWall(0.31, 0.025, [[0.42, 0.58]], 25, 0),
                ...gateWall(0.67, 0.025, [[0.42, 0.58]], 25, 0)
            ],
            lightSweeps: [
                { cooldown: 20, initialDelay: 5, rails: [0.16, 0.5, 0.84] }
            ]
        }
    ]
};
