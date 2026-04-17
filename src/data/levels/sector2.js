import { node } from './helpers.js';

export const sector2 = {
    id: 'sector-2',
    name: 'Sector 2: Redes Subterraneas',
    description: 'Domina tuneles, logistica y evoluciones tacticas. Artilleria, espinas y tanques empiezan a definir cada puzzle.',
    config: { allowEvolutions: true },
    levels: [
        {
            name: 'Nivel 1: Conexiones Subterraneas',
            description: 'Utiliza los tuneles profundos para viajar largas distancias. Crea caminos logisticos fuertes y lucha entre tres frentes iguales.',
            nodes: [
                node('base_player', 0.1, 0.5, 'player', 'gigante', 150),
                node('base_enemy', 0.9, 0.5, 'enemy', 'gigante', 150),
                node('base_fuego', 0.5, 0.9, 'fuego', 'gigante', 150),
                node('center', 0.5, 0.5, 'neutral', 'enjambre'),
                node('mid_left', 0.35, 0.5, 'neutral', 'normal'),
                node('mid_right', 0.65, 0.5, 'neutral', 'normal'),
                node('flank_tl', 0.35, 0.35, 'neutral', 'enjambre'),
                node('flank_tr', 0.65, 0.35, 'neutral', 'enjambre'),
                node('top', 0.5, 0.2, 'neutral', 'gigante'),
                node('hole_left', 0.15, 0.8, 'neutral', 'tunel', 0, { tunnelTo: 'hole_right' }),
                node('hole_right', 0.85, 0.2, 'neutral', 'tunel', 0, { tunnelTo: 'hole_left' })
            ]
        },
        {
            name: 'Nivel 2: El Baluarte del Artillero',
            description: 'El enemigo domina un bastion central con ventaja numerica brutal.\nCaptura el nodo lateral, evolucionalo a artilleria y ablanda el nido rojo antes del asalto final.',
            nodes: [
                node('p_base', 0.10, 0.78, 'player', 'gigante', 150),
                node('p_mid', 0.24, 0.63, 'player', 'normal', 45),
                node('art_left', 0.24, 0.28, 'neutral', 'normal', 20),
                node('bridge', 0.42, 0.50, 'neutral', 'enjambre', 20),
                node('enemy_front_l', 0.64, 0.34, 'enemy', 'normal', 70),
                node('enemy_front_r', 0.64, 0.66, 'enemy', 'normal', 70),
                node('enemy_core', 0.84, 0.50, 'enemy', 'gigante', 210),
                node('enemy_aux_top', 0.82, 0.18, 'enemy', 'normal', 60),
                node('enemy_aux_bot', 0.82, 0.82, 'fuego', 'normal', 60),
                node('side_supply', 0.38, 0.16, 'neutral', 'enjambre', 20)
            ],
            barriers: [
                { x: 0.56, y: 0.12, width: 0.03, height: 0.30 },
                { x: 0.56, y: 0.58, width: 0.03, height: 0.30 },
                { x: 0.56, y: 0.42, width: 0.20, height: 0.04 },
                { x: 0.56, y: 0.54, width: 0.20, height: 0.04 }
            ]
        },
        {
            name: 'Nivel 3: Chokepoint Espinoso',
            description: 'El mapa es un reloj de arena con un unico cuello central.\nSi conviertes ese nodo en espinoso, podras detener oleadas enteras mientras preparas el contraataque.',
            nodes: [
                node('p_base', 0.10, 0.50, 'player', 'gigante', 155),
                node('p_top', 0.24, 0.28, 'neutral', 'normal', 20),
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
            name: 'Nivel 4: Duelo de Titanes',
            description: 'Hay pocos nodos y todos son gigantes.\nLa produccion masiva y la evolucion a tanques decidiran quien sobrevive a los choques de desgaste.',
            nodes: [
                node('p_base', 0.10, 0.55, 'player', 'gigante', 170),
                node('mid_low', 0.32, 0.72, 'neutral', 'gigante', 30),
                node('mid_high', 0.36, 0.28, 'neutral', 'gigante', 30),
                node('center', 0.54, 0.50, 'neutral', 'gigante', 30),
                node('enemy_front', 0.72, 0.35, 'enemy', 'gigante', 150),
                node('fuego_front', 0.72, 0.70, 'fuego', 'gigante', 150),
                node('enemy_core', 0.90, 0.50, 'enemy', 'gigante', 180)
            ]
        }
    ]
};
