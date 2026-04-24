import { node } from './helpers.js';

export const sector2 = {
    id: 'sector-2',
    name: 'Sector 2: Redes Subterraneas',
    description: 'Domina tuneles, logistica y evoluciones tacticas. Artilleria, espinas y tanques empiezan a definir cada puzzle.',
    config: { allowEvolutions: true },
    levels: [
        {
            name: 'Nivel 6: Conexiones Subterraneas',
            description: 'Una inmensa barrera diagonal divide por completo el mapa. La unica forma de avanzar y asediar el otro extremo es utilizando el tunel profundo. Cuidado: la faccion naranja esta presente en ambos frentes.',
            nodes: [
                node('base_player', 0.1, 0.6, 'player', 'gigante', 150),
                node('base_enemy', 0.9, 0.4, 'enemy', 'gigante', 150),
                node('fuego_1', 0.3, 0.8, 'fuego', 'gigante', 150),
                node('fuego_2', 0.7, 0.2, 'fuego', 'gigante', 150),
                node('center_p', 0.4, 0.6, 'neutral', 'enjambre'),
                node('center_e', 0.6, 0.4, 'neutral', 'enjambre'),
                node('mid_left', 0.2, 0.75, 'neutral', 'normal'),
                node('mid_right', 0.8, 0.25, 'neutral', 'normal'),
                node('hole_left', 0.1, 0.9, 'neutral', 'tunel', 0, { tunnelTo: 'hole_right' }),
                node('hole_right', 0.9, 0.1, 'neutral', 'tunel', 0, { tunnelTo: 'hole_left' })
            ],
            barriers: Array.from({length: 35}).map((_, i) => ({
                x: (i / 35) - 0.02,
                y: (i / 35) - 0.02,
                width: 0.055,
                height: 0.055
            }))
        },
        {
            name: 'Nivel 7: El Baluarte del Artillero',
            description: 'El enemigo se atrincheró al otro lado del estrecho. Reune a tus tropas y asegura los nodos centrales para abrirte paso.',
            nodes: [
                node('p_top', 0.38, 0.22, 'player', 'gigante', 120),
                node('p_bot', 0.38, 0.78, 'player', 'gigante', 120),
                node('neutral_mid', 0.25, 0.50, 'neutral', 'gigante', 60),
                node('bridge', 0.44, 0.50, 'neutral', 'normal', 30),
                node('enemy_front_top', 0.64, 0.34, 'enemy', 'normal', 70),
                node('enemy_front_bot', 0.64, 0.66, 'enemy', 'normal', 70),
                node('enemy_core', 0.84, 0.50, 'enemy', 'gigante', 210),
                node('neutral_aux_top', 0.82, 0.18, 'neutral', 'normal', 40),
                node('neutral_aux_bot', 0.82, 0.82, 'neutral', 'normal', 40)
            ],
            barriers: [
                { x: 0.56, y: 0.12, width: 0.03, height: 0.30 },
                { x: 0.56, y: 0.58, width: 0.03, height: 0.30 },
                { x: 0.56, y: 0.42, width: 0.20, height: 0.04 },
                { x: 0.56, y: 0.54, width: 0.20, height: 0.04 }
            ]
        },
        {
            name: 'Nivel 8: Chokepoint Espinoso',
            description: 'El mapa es un reloj de arena con un unico cuello central.\nSi conviertes ese nodo en espinoso, podras detener oleadas enteras mientras preparas el contraataque.',
            nodes: [
                node('p_base', 0.10, 0.50, 'player', 'gigante', 155),
                node('p_top', 0.24, 0.28, 'player', 'normal', 20),
                node('p_bot', 0.24, 0.72, 'neutral', 'normal', 20),
                node('choke', 0.50, 0.50, 'neutral', 'normal', 20),
                node('e_top', 0.76, 0.30, 'enemy', 'normal', 70),
                node('e_bot', 0.76, 0.70, 'fuego', 'normal', 70),
                node('enemy_core', 0.90, 0.50, 'enemy', 'gigante', 195)
            ],
            barriers: [
                { x: 0.36, y: 0.00, width: 0.08, height: 0.37 },
                { x: 0.36, y: 0.63, width: 0.08, height: 0.37 },
                { x: 0.56, y: 0.00, width: 0.08, height: 0.37 },
                { x: 0.56, y: 0.63, width: 0.08, height: 0.37 }
            ]
        },
        {
            name: 'Nivel 9: Duelo de Titanes',
            description: 'Hay pocos nodos y todos son gigantes.\nLa produccion masiva y la evolucion a tanques decidiran quien sobrevive a los choques de desgaste.',
            nodes: [
                node('p_base', 0.10, 0.55, 'player', 'gigante', 170),
                node('mid_low', 0.32, 0.72, 'neutral', 'gigante', 30),
                node('mid_high', 0.36, 0.28, 'neutral', 'gigante', 30),
                node('center', 0.54, 0.50, 'neutral', 'gigante', 30),
                node('enemy_front', 0.72, 0.35, 'neutral', 'gigante', 150),
                node('fuego_front', 0.72, 0.70, 'fuego', 'gigante', 150),
                node('enemy_core', 0.90, 0.50, 'enemy', 'gigante', 180)
            ]
        }
    ]
};
