import { checkerZones, FAST_COLOR, node, rectZone, SLOW_COLOR } from './helpers.js';

export const sector4 = {
    id: 'sector-4',
    name: 'Sector 4: Terrenos Viscosos',
    description: 'Domina friccion, lodo y autopistas. La velocidad del terreno altera por completo el flujo del combate.',
    config: { allowEvolutions: true },
    levels: [
        {
            name: 'Nivel 1: Carreteras y Pantanos',
            description: 'El terreno afecta a tu velocidad. Las zonas verdes te aceleran el doble. Las zonas rojas te ralentizan a la mitad.',
            nodes: [
                node('p1', 0.15, 0.35, 'player', 'gigante', 150),
                node('p2', 0.25, 0.25, 'neutral', 'normal', 20),
                node('p3', 0.25, 0.45, 'neutral', 'normal', 20),
                node('e1', 0.85, 0.65, 'enemy', 'gigante', 150),
                node('e2', 0.75, 0.55, 'neutral', 'normal', 20),
                node('e3', 0.75, 0.75, 'neutral', 'normal', 20),
                node('n1', 0.50, 0.50, 'neutral', 'enjambre', 80),
                node('n2', 0.20, 0.80, 'neutral', 'normal', 30),
                node('n3', 0.30, 0.70, 'neutral', 'normal', 30),
                node('n4', 0.80, 0.20, 'neutral', 'normal', 30),
                node('n5', 0.70, 0.30, 'neutral', 'normal', 30)
            ],
            zones: [
                rectZone('green1', 0.05, 0.10, 0.35, 0.40, 2.0, 0x00ff00, 0.20),
                rectZone('green2', 0.60, 0.50, 0.35, 0.40, 2.0, 0x00ff00, 0.20),
                rectZone('red1', 0.00, 0.00, 1.00, 1.00, 0.5, 0xff0000, 0.15)
            ]
        },
        {
            name: 'Nivel 2: El Oasis en el Desierto Pegajoso',
            description: 'El 90% del mapa es una zona lenta. Solo un oasis central ofrece movilidad real y nodos de gran valor.\nDebes decidir entre avanzar por los bordes o pelear por el centro.',
            nodes: [
                node('p_base', 0.08, 0.84, 'player', 'gigante', 150),
                node('edge_top', 0.18, 0.16, 'neutral', 'normal', 20),
                node('edge_mid', 0.26, 0.50, 'neutral', 'normal', 20),
                node('oasis_left', 0.44, 0.42, 'neutral', 'gigante', 30),
                node('oasis_right', 0.58, 0.58, 'neutral', 'gigante', 30),
                node('east_mid', 0.76, 0.50, 'neutral', 'normal', 20),
                node('enemy_core', 0.90, 0.18, 'enemy', 'gigante', 175)
            ],
            zones: [
                rectZone('oasis', 0.40, 0.36, 0.22, 0.28, 1.8, FAST_COLOR, 0.16),
                rectZone('desert', 0.00, 0.00, 1.00, 1.00, 0.4, SLOW_COLOR, 0.18)
            ]
        },
        {
            name: 'Nivel 3: Franjas de Interferencia',
            description: 'El campo se alterna entre franjas rapidas y lentas.\nPlanifica tus rutas para vivir en las autopistas y no quedarte atrapado en el lodo.',
            nodes: [
                node('p_base', 0.08, 0.52, 'player', 'gigante', 150),
                node('lane_1', 0.20, 0.22, 'neutral', 'normal', 20),
                node('lane_2', 0.34, 0.72, 'neutral', 'normal', 20),
                node('lane_3', 0.50, 0.32, 'neutral', 'enjambre', 20),
                node('lane_4', 0.66, 0.70, 'neutral', 'normal', 20),
                node('lane_5', 0.80, 0.28, 'neutral', 'normal', 20),
                node('enemy_core', 0.92, 0.52, 'enemy', 'gigante', 175)
            ],
            zones: [
                rectZone('fast_1', 0.00, 0.00, 0.16, 1.00, 1.75, FAST_COLOR, 0.14),
                rectZone('slow_1', 0.16, 0.00, 0.16, 1.00, 0.45, SLOW_COLOR, 0.20),
                rectZone('fast_2', 0.32, 0.00, 0.16, 1.00, 1.75, FAST_COLOR, 0.14),
                rectZone('slow_2', 0.48, 0.00, 0.16, 1.00, 0.45, SLOW_COLOR, 0.20),
                rectZone('fast_3', 0.64, 0.00, 0.16, 1.00, 1.75, FAST_COLOR, 0.14),
                rectZone('slow_3', 0.80, 0.00, 0.20, 1.00, 0.45, SLOW_COLOR, 0.20)
            ]
        },
        {
            name: 'Nivel 4: El Delta de la Melaza',
            description: 'Una gran zona viscosa cubre el centro, pero varios canales rapidos serpentean por dentro.\nDominar esos canales es la forma segura de cruzar.',
            nodes: [
                node('p_base', 0.10, 0.82, 'player', 'gigante', 150),
                node('canal_1', 0.24, 0.66, 'neutral', 'normal', 20),
                node('canal_2', 0.38, 0.54, 'neutral', 'normal', 20),
                node('canal_3', 0.52, 0.36, 'neutral', 'enjambre', 20),
                node('canal_4', 0.68, 0.46, 'neutral', 'normal', 20),
                node('canal_5', 0.82, 0.22, 'neutral', 'normal', 20),
                node('enemy_core', 0.92, 0.62, 'enemy', 'gigante', 180)
            ],
            zones: [
                rectZone('fast_a', 0.16, 0.58, 0.18, 0.10, 1.8, FAST_COLOR, 0.16),
                rectZone('fast_b', 0.30, 0.48, 0.18, 0.10, 1.8, FAST_COLOR, 0.16),
                rectZone('fast_c', 0.44, 0.32, 0.18, 0.10, 1.8, FAST_COLOR, 0.16),
                rectZone('fast_d', 0.58, 0.40, 0.18, 0.10, 1.8, FAST_COLOR, 0.16),
                rectZone('fast_e', 0.72, 0.18, 0.18, 0.10, 1.8, FAST_COLOR, 0.16),
                rectZone('slow_map', 0.00, 0.12, 1.00, 0.76, 0.42, SLOW_COLOR, 0.19)
            ]
        },
        {
            name: 'Nivel 5: Trampa de Succion',
            description: 'Cruzar directo por el centro te atasca en una masa viscosa enorme.\nEl borde del mapa y la artilleria ofrecen soluciones mucho mas limpias.',
            nodes: [
                node('p_base', 0.10, 0.52, 'player', 'gigante', 150),
                node('north_edge', 0.24, 0.18, 'neutral', 'normal', 20),
                node('south_edge', 0.24, 0.84, 'neutral', 'normal', 20),
                node('center_left', 0.40, 0.50, 'neutral', 'normal', 20),
                node('center_right', 0.64, 0.50, 'neutral', 'normal', 20),
                node('enemy_north', 0.80, 0.18, 'enemy', 'normal', 65),
                node('enemy_south', 0.80, 0.84, 'fuego', 'normal', 65),
                node('enemy_core', 0.92, 0.52, 'enemy', 'gigante', 180)
            ],
            zones: [
                rectZone('slow_core_1', 0.30, 0.22, 0.40, 0.56, 0.38, SLOW_COLOR, 0.20),
                rectZone('slow_core_2', 0.22, 0.34, 0.56, 0.32, 0.38, SLOW_COLOR, 0.16)
            ]
        },
        {
            name: 'Nivel 6: Ajedrez de Friccion',
            description: 'Cada salto entre nodos exige escoger la ruta con menos resistencia.\nEs una prueba pura de microgestion y lectura del terreno.',
            nodes: [
                node('p_base', 0.08, 0.88, 'player', 'gigante', 150),
                node('cell_1', 0.20, 0.70, 'neutral', 'normal', 20),
                node('cell_2', 0.32, 0.54, 'neutral', 'normal', 20),
                node('cell_3', 0.44, 0.70, 'neutral', 'normal', 20),
                node('cell_4', 0.56, 0.38, 'neutral', 'enjambre', 20),
                node('cell_5', 0.68, 0.54, 'neutral', 'normal', 20),
                node('cell_6', 0.80, 0.22, 'neutral', 'normal', 20),
                node('enemy_core', 0.92, 0.12, 'enemy', 'gigante', 178)
            ],
            zones: checkerZones(6, 6, 1.65, 0.46)
        }
    ]
};
