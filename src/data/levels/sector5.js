import { node, WATER_COLOR } from './helpers.js';

export const sector5 = {
    id: 'sector-5',
    name: 'Sector 5: Mareas Implacables',
    description: 'El agua barre todo a su paso. Direccion, cadencia y lectura del tiempo son la clave para sobrevivir.',
    config: { allowEvolutions: true },
    levels: [
        {
            name: 'Nivel 1: El Arroyuelo',
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
                { speed: 20, width: 0.032, cooldown: 37, initialDelay: 15, color: WATER_COLOR, alpha: 0.42 }
            ]
        },
        {
            name: 'Nivel 2: Bombardeo desde el Centro',
            description: 'Una rafaga circular nace en el centro y se expande hacia los bordes.\nExpandete primero por la periferia y empuja al nucleo despues del paso del anillo.',
            nodes: [
                node('p_base', 0.10, 0.84, 'player', 'gigante', 150),
                node('rim_1', 0.22, 0.66, 'neutral', 'normal', 20),
                node('rim_2', 0.22, 0.30, 'neutral', 'normal', 20),
                node('rim_3', 0.50, 0.90, 'neutral', 'normal', 20),
                node('rim_4', 0.78, 0.72, 'neutral', 'normal', 20),
                node('rim_5', 0.82, 0.24, 'neutral', 'normal', 20),
                node('inner_1', 0.42, 0.46, 'neutral', 'enjambre', 20),
                node('inner_2', 0.58, 0.54, 'neutral', 'enjambre', 20),
                node('enemy_core', 0.50, 0.50, 'enemy', 'gigante', 190)
            ],
            waterSweeps: [
                {
                    kind: 'radial',
                    centerX: 0.50,
                    centerY: 0.50,
                    speed: 26,
                    width: 0.065,
                    cooldown: 22,
                    initialDelay: 10,
                    color: WATER_COLOR,
                    alpha: 0.38
                }
            ]
        },
        {
            name: 'Nivel 3: Mareas Impredecibles',
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
                    cooldown: 11,
                    initialDelay: 8,
                    width: 0.032,
                    color: WATER_COLOR,
                    alpha: 0.40,
                    sequence: [
                        { direction: 'down', speed: 28 },
                        { direction: 'left', speed: 24 },
                        { direction: 'up-left', speed: 26 },
                        { direction: 'right', speed: 23 },
                        { direction: 'down-right', speed: 27 }
                    ]
                }
            ]
        },
        {
            name: 'Nivel 4: El Embudo Inundado',
            description: 'Todo converge en el centro mientras rafagas desde abajo barren el embudo.\nReagrupa fuera de la marea y cruza solo cuando la ventana este limpia.',
            nodes: [
                node('p_base', 0.10, 0.12, 'player', 'gigante', 150),
                node('funnel_l1', 0.28, 0.24, 'neutral', 'normal', 20),
                node('funnel_l2', 0.42, 0.40, 'neutral', 'normal', 20),
                node('funnel_r1', 0.28, 0.76, 'neutral', 'normal', 20),
                node('funnel_r2', 0.42, 0.60, 'neutral', 'normal', 20),
                node('center', 0.60, 0.50, 'neutral', 'enjambre', 20),
                node('enemy_front', 0.78, 0.50, 'enemy', 'normal', 70),
                node('enemy_core', 0.92, 0.50, 'enemy', 'gigante', 180)
            ],
            waterSweeps: [
                {
                    direction: 'up',
                    speed: 30,
                    width: 0.034,
                    cooldown: 12,
                    initialDelay: 7,
                    color: WATER_COLOR,
                    alpha: 0.40
                }
            ]
        },
        {
            name: 'Nivel 5: Ida y Vuelta',
            description: 'La rafaga funciona como un pendulo: cruza el mapa y luego regresa.\nDebes leer la oscilacion y atacar justo en el hueco correcto.',
            nodes: [
                node('p_base', 0.10, 0.50, 'player', 'gigante', 150),
                node('lane_1', 0.24, 0.30, 'neutral', 'normal', 20),
                node('lane_2', 0.40, 0.50, 'neutral', 'enjambre', 20),
                node('lane_3', 0.56, 0.30, 'neutral', 'normal', 20),
                node('lane_4', 0.72, 0.50, 'neutral', 'normal', 20),
                node('enemy_top', 0.88, 0.24, 'enemy', 'normal', 60),
                node('enemy_core', 0.92, 0.68, 'enemy', 'gigante', 180)
            ],
            waterSweeps: [
                {
                    cooldown: 9,
                    initialDelay: 6,
                    width: 0.032,
                    color: WATER_COLOR,
                    alpha: 0.42,
                    sequence: [
                        { direction: 'right', speed: 24 },
                        { direction: 'left', speed: 24 }
                    ]
                }
            ]
        }
    ]
};
