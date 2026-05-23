import { node, WATER_COLOR } from './helpers.js';

export const sector5 = {
    id: 'sector-5',
    name: 'Sector 5: Mareas Implacables',
    description: 'El agua barre todo a su paso. Direccion, cadencia y lectura del tiempo son la clave para sobrevivir.',
    config: { allowEvolutions: true },
    aiStrategy: {
        focus: 'cautious',
        aggressionMult: 0.75,
        minEvolutionGarrison: 35,
        minPostCaptureGarrison: 16,
        hazardPolicy: 'strict',
        maxRouteCasualtyRatio: 0.10,
        antiPendulum: {
            targetCooldownSec: 7,
            sourceCooldownSec: 3,
            recaptureCooldownSec: 14,
            flipWindowSec: 36,
            maxFlipsBeforePenalty: 1,
            recentAttackPenalty: 550,
            flipPenalty: 900,
            sourceRepeatPenalty: 300
        },
        difficultyOverrides: {
            easy: {
                aggressionMult: 0.40,
                maxRouteCasualtyRatio: 0.05,
                minPostCaptureGarrison: 10,
                antiPendulum: {
                    recaptureCooldownSec: 12,
                    flipPenalty: 1200
                }
            },
            hard: {
                aggressionMult: 1.10,
                hazardPolicy: 'cautious',
                maxRouteCasualtyRatio: 0.22,
                minEvolutionGarrison: 24,
                minPostCaptureGarrison: 22,
                antiPendulum: {
                    recaptureCooldownSec: 3,
                    flipPenalty: 400
                }
            }
        }
    },
    levels: [
        {
            name: 'Nivel 22: El Arroyuelo',
            description: 'Una corriente de agua barre el campo periodicamente.\nElimina todas las tropas a su paso, aliadas y enemigas.\nSincroniza tus ataques con el ciclo del agua para ganar.',
            nodes: [
                node('p_base', 0.07, 0.5, 'player', 'gigante', 130),
                node('p_top', 0.18, 0.28, 'neutral', 'normal'),
                node('p_bot', 0.18, 0.72, 'neutral', 'normal'),
                node('n_top', 0.38, 0.22, 'neutral', 'enjambre', 55),
                node('n_center', 0.5, 0.5, 'neutral', 'gigante', 90),
                node('n_bot', 0.38, 0.78, 'neutral', 'enjambre', 55),
                node('e1_front', 0.65, 0.28, 'enemy', 'normal', 50),
                node('e1_base', 0.88, 0.18, 'enemy', 'gigante', 130),
                node('e2_front', 0.65, 0.72, 'fuego', 'normal', 50),
                node('e2_base', 0.88, 0.82, 'fuego', 'gigante', 130)
            ],
            waterSweeps: [
                { speed: 20, width: 0.065, cooldown: 37, initialDelay: 15, color: WATER_COLOR, alpha: 0.42 }
            ]
        },
        {
            name: 'Nivel 23: Bombardeo desde el Centro',
            description: 'Una rafaga circular nace en el centro y se expande hacia los bordes.\nExpandete primero por la periferia y empuja al nucleo despues del paso del anillo.',
            nodes: [
                node('p_base', 0.10, 0.84, 'player', 'gigante', 150),
                node('p_inner', 0.18, 0.76, 'neutral', 'enjambre', 20),
                node('rim_1', 0.22, 0.66, 'neutral', 'normal', 20),
                node('rim_2', 0.22, 0.30, 'neutral', 'normal', 20),
                node('rim_3', 0.50, 0.90, 'neutral', 'normal', 20),
                node('rim_4', 0.78, 0.72, 'neutral', 'normal', 20),
                node('rim_5', 0.82, 0.24, 'neutral', 'normal', 20),
                node('inner_1', 0.42, 0.46, 'neutral', 'enjambre', 20),
                node('enemy_core', 0.50, 0.50, 'enemy', 'gigante', 150)
            ],
            waterSweeps: [
                {
                    kind: 'radial',
                    centerX: 0.50,
                    centerY: 0.50,
                    speed: 26,
                    width: 0.085,
                    cooldown: 27,
                    initialDelay: 10,
                    color: WATER_COLOR,
                    alpha: 0.38
                }
            ]
        },
        {
            name: 'Nivel 24: Mareas Impredecibles',
            description: 'Las rafagas llegan desde arriba, la derecha y diagonales en una secuencia irregular.\nDebes adaptarte rapido y no dar por segura ninguna ruta demasiado tiempo.',
            nodes: [
                node('p_base', 0.10, 0.82, 'player', 'gigante', 150),
                node('north', 0.28, 0.18, 'neutral', 'normal', 20),
                node('west', 0.22, 0.52, 'neutral', 'normal', 20),
                node('center', 0.50, 0.50, 'neutral', 'enjambre', 20),
                node('east', 0.78, 0.48, 'neutral', 'normal', 20),
                node('south', 0.50, 0.82, 'neutral', 'normal', 20),
                node('enemy_top', 0.86, 0.22, 'enemy', 'gigante', 150),
                node('enemy_bot', 0.90, 0.78, 'fuego', 'gigante', 150)
            ],
            waterSweeps: [
                {
                    cooldown: 3,
                    initialDelay: 6,
                    preventMultiple: true,
                    width: 0.065,
                    color: WATER_COLOR,
                    alpha: 0.40,
                    sequence: [
                        { direction: 'down', speed: 38 },
                        { direction: 'left', speed: 34 },
                        { direction: 'up-left', speed: 36 },
                        { direction: 'right', speed: 33 },
                        { direction: 'down-right', speed: 37 }
                    ]
                }
            ]
        },
        {
            name: 'Nivel 25: Convergencia',
            description: 'La marea nace en los bordes y se contrae hacia el centro de forma letal.\nLucha desde las cuatro esquinas cardinales mientras el mapa se encoge.',
            nodes: [
                // Bases (Jugador y 3 Enemigos) más separadas
                node('p_base', 0.50, 0.90, 'player', 'gigante', 150),
                node('e_base1', 0.50, 0.10, 'enemy', 'gigante', 150),
                node('e_base2', 0.10, 0.50, 'fuego', 'gigante', 150),
                node('e_base3', 0.90, 0.50, 'tejedoras', 'gigante', 150),
                // Nodos circulares en el centro más espaciados
                node('center_1', 0.50, 0.30, 'neutral', 'enjambre', 30),
                node('center_2', 0.50, 0.70, 'neutral', 'enjambre', 30),
                node('center_3', 0.30, 0.50, 'neutral', 'enjambre', 30),
                node('center_4', 0.70, 0.50, 'neutral', 'enjambre', 30),
                // Nodo central
                node('core', 0.50, 0.50, 'neutral', 'gigante', 60),
                // Nodos esparcidos en las diagonales más hacia las esquinas
                node('diag_1', 0.25, 0.25, 'neutral', 'normal', 25),
                node('diag_2', 0.75, 0.75, 'neutral', 'normal', 25),
                node('diag_3', 0.25, 0.75, 'neutral', 'normal', 25),
                node('diag_4', 0.75, 0.25, 'neutral', 'normal', 25)
            ],
            waterSweeps: [
                {
                    kind: 'radial',
                    centerX: 0.50,
                    centerY: 0.50,
                    speed: -35, // Velocidad negativa para implosión
                    width: 0.085,
                    cooldown: 8,
                    initialDelay: 5,
                    preventMultiple: true,
                    color: WATER_COLOR,
                    alpha: 0.40
                }
            ]
        },
        {
            name: 'Nivel 26: Ida y Vuelta',
            description: 'La rafaga funciona como un pendulo: cruza el mapa, descansa un instante, y luego regresa.\nDebes leer la oscilacion y atacar justo en el hueco correcto.',
            nodes: [
                // Jugador a la izquierda
                node('p_base', 0.08, 0.50, 'player', 'gigante', 150),
                node('p_front', 0.20, 0.50, 'neutral', 'tanque', 40),
                
                // Islas centrales superior, centro, inferior
                node('mid_top_1', 0.35, 0.25, 'neutral', 'normal', 20),
                node('mid_top_2', 0.60, 0.25, 'neutral', 'enjambre', 30),
                
                node('mid_cen_1', 0.40, 0.50, 'neutral', 'normal', 20),
                node('mid_cen_2', 0.55, 0.50, 'neutral', 'gigante', 50),
                
                node('mid_bot_1', 0.35, 0.75, 'neutral', 'normal', 20),
                node('mid_bot_2', 0.60, 0.75, 'neutral', 'enjambre', 30),
                
                // 3 Enemigos a la derecha
                node('e_base_top', 0.88, 0.20, 'enemy', 'gigante', 150),
                node('e_base_mid', 0.95, 0.50, 'fuego', 'gigante', 150),
                node('e_base_bot', 0.88, 0.80, 'tejedoras', 'gigante', 150),
                
                // Defensas enemigas
                node('e_def_top', 0.75, 0.35, 'neutral', 'tanque', 30),
                node('e_def_bot', 0.75, 0.65, 'neutral', 'tanque', 30)
            ],
            waterSweeps: [
                {
                    cooldown: 1, // 1 segundo exacto de pausa antes de la alerta
                    initialDelay: 6,
                    width: 0.065,
                    color: WATER_COLOR,
                    alpha: 0.42,
                    preventMultiple: true,
                    sequence: [
                        { direction: 'right', speed: 38 },
                        { direction: 'left', speed: 38 }
                    ]
                }
            ]
        }
    ]
};
