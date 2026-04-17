import { mobileNode, node, puddle, ringHazards, zigZagHazards } from './helpers.js';

export const sector3 = {
    id: 'sector-3',
    name: 'Sector 3: Zonas de Contencion',
    description: 'El insecticida aniquila al contacto. Ferries, tuneles y rutas seguras son tan importantes como la fuerza bruta.',
    config: { allowEvolutions: true },
    levels: [
        {
            name: 'Nivel 1: La Hoja Flotante',
            description: 'El centro esta bloqueado por un charco de insecticida letal. Usa la hoja flotante movil para cruzar de forma segura sin perder tropas.',
            nodes: [
                node('p1', 0.1, 0.5, 'player', 'gigante', 150),
                node('p2', 0.1, 0.3, 'neutral', 'normal', 20),
                node('p3', 0.1, 0.7, 'neutral', 'normal', 20),
                node('e1', 0.9, 0.1, 'enemy', 'gigante', 150),
                node('e2', 0.7, 0.1, 'neutral', 'normal', 20),
                node('f1', 0.9, 0.9, 'fuego', 'gigante', 150),
                node('f2', 0.7, 0.9, 'neutral', 'normal', 20),
                node('center', 0.6, 0.5, 'neutral', 'gigante', 100),
                node('top_mid', 0.6, 0.2, 'neutral', 'enjambre', 50),
                node('bot_mid', 0.6, 0.8, 'neutral', 'enjambre', 50),
                mobileNode('hoja_movil', 0.35, 0.5, 0.35, 0.5, 0.13, 0, 0.6)
            ],
            hazards: [
                puddle(0.35, 0.5, 0.12, { scaleY: 1.6 })
            ]
        },
        {
            name: 'Nivel 2: El Ojo de la Tormenta',
            description: 'Un anillo grueso de insecticida protege el nucleo del mapa.\nPuedes atravesarlo con el ferry, conquistar el tunel o forzar el paso asumiendo bajas.',
            nodes: [
                node('p_base', 0.12, 0.80, 'player', 'gigante', 150),
                node('outer_top', 0.32, 0.18, 'neutral', 'normal', 20),
                node('outer_left', 0.20, 0.48, 'neutral', 'enjambre', 20),
                node('outer_right', 0.80, 0.52, 'neutral', 'enjambre', 20),
                node('inner_top', 0.50, 0.28, 'neutral', 'normal', 20),
                node('inner_mid', 0.58, 0.50, 'neutral', 'normal', 20),
                node('inner_bot', 0.50, 0.72, 'neutral', 'normal', 20),
                node('enemy_core', 0.80, 0.20, 'enemy', 'gigante', 175),
                node('inner_tunnel_a', 0.36, 0.50, 'neutral', 'tunel', 0, { tunnelTo: 'inner_tunnel_b' }),
                node('inner_tunnel_b', 0.66, 0.50, 'neutral', 'tunel', 0, { tunnelTo: 'inner_tunnel_a' }),
                mobileNode('storm_ferry', 0.50, 0.50, 0.50, 0.50, 0.16, 0, 0.48)
            ],
            hazards: [
                ...ringHazards(0.50, 0.50, 0.18, 0.05, 14, { scaleY: 1.15 })
            ]
        },
        {
            name: 'Nivel 3: Islas de Seguridad',
            description: 'Casi todo el mapa es insecticida. Solo pequenas islas alrededor de cada nodo permiten reagruparte.\nDebes enviar con precision quirurgica.',
            nodes: [
                node('p_base', 0.08, 0.50, 'player', 'gigante', 150),
                node('isle_1', 0.24, 0.22, 'neutral', 'normal', 20),
                node('isle_2', 0.24, 0.78, 'neutral', 'normal', 20),
                node('isle_3', 0.48, 0.32, 'neutral', 'enjambre', 20),
                node('isle_4', 0.48, 0.68, 'neutral', 'enjambre', 20),
                node('isle_5', 0.72, 0.18, 'neutral', 'normal', 20),
                node('isle_6', 0.72, 0.82, 'neutral', 'normal', 20),
                node('enemy_top', 0.92, 0.24, 'enemy', 'gigante', 145),
                node('enemy_bot', 0.92, 0.76, 'fuego', 'gigante', 145)
            ],
            hazards: [
                puddle(0.34, 0.50, 0.18, { scaleY: 2.6 }),
                puddle(0.60, 0.50, 0.18, { scaleY: 2.6 }),
                puddle(0.50, 0.18, 0.14, { scaleY: 1.3 }),
                puddle(0.50, 0.82, 0.14, { scaleY: 1.3 }),
                puddle(0.82, 0.50, 0.12, { scaleY: 2.0 })
            ]
        },
        {
            name: 'Nivel 4: Anillos Concentricos Venenosos',
            description: 'Tres capas de insecticida rodean al nucleo enemigo.\nDebes saltar de anillo en anillo usando tuneles y ferrys sincronizados.',
            nodes: [
                node('p_base', 0.10, 0.86, 'player', 'gigante', 150),
                node('ring_1_a', 0.28, 0.78, 'neutral', 'normal', 20),
                node('ring_1_b', 0.28, 0.48, 'neutral', 'normal', 20),
                node('ring_2_a', 0.46, 0.66, 'neutral', 'normal', 20),
                node('ring_2_b', 0.46, 0.34, 'neutral', 'normal', 20),
                node('ring_3_a', 0.62, 0.56, 'neutral', 'normal', 20),
                node('ring_3_b', 0.62, 0.40, 'neutral', 'normal', 20),
                node('enemy_core', 0.82, 0.22, 'enemy', 'gigante', 180),
                node('tunnel_outer', 0.20, 0.60, 'neutral', 'tunel', 0, { tunnelTo: 'tunnel_inner' }),
                node('tunnel_inner', 0.58, 0.24, 'neutral', 'tunel', 0, { tunnelTo: 'tunnel_outer' }),
                mobileNode('ring_ferry', 0.55, 0.50, 0.55, 0.50, 0.09, 0.12, 0.55)
            ],
            hazards: [
                ...ringHazards(0.54, 0.50, 0.11, 0.035, 10, { scaleY: 1.05 }),
                ...ringHazards(0.54, 0.50, 0.21, 0.04, 14, { scaleY: 1.10 }),
                ...ringHazards(0.54, 0.50, 0.31, 0.045, 18, { scaleY: 1.18 })
            ]
        },
        {
            name: 'Nivel 5: El Pantano de los Ferries',
            description: 'No existe ruta terrestre segura entre tu base y la roja.\nTodo el centro es un pantano toxico: solo varios ferries permiten una invasion completa.',
            nodes: [
                node('p_base', 0.08, 0.52, 'player', 'gigante', 150),
                node('p_top', 0.20, 0.20, 'neutral', 'normal', 20),
                node('p_bot', 0.20, 0.80, 'neutral', 'normal', 20),
                node('mid_top', 0.50, 0.22, 'neutral', 'enjambre', 20),
                node('mid_bot', 0.50, 0.78, 'neutral', 'enjambre', 20),
                node('e_top', 0.82, 0.22, 'enemy', 'normal', 60),
                node('e_bot', 0.82, 0.78, 'fuego', 'normal', 60),
                node('enemy_core', 0.92, 0.52, 'enemy', 'gigante', 185),
                mobileNode('ferry_top', 0.34, 0.24, 0.34, 0.24, 0.16, 0, 0.55),
                mobileNode('ferry_mid', 0.34, 0.52, 0.34, 0.52, 0.16, 0, 0.72),
                mobileNode('ferry_bot', 0.34, 0.80, 0.34, 0.80, 0.16, 0, 0.48)
            ],
            hazards: [
                puddle(0.50, 0.50, 0.24, { scaleY: 2.9 }),
                puddle(0.66, 0.50, 0.18, { scaleY: 2.4 })
            ]
        },
        {
            name: 'Nivel 6: Zig-Zag Letal',
            description: 'La unica ruta segura describe una S estrecha entre pozas venenosas.\nControla bien el flujo para que el ejercito no se desparrame en las curvas.',
            nodes: [
                node('p_base', 0.08, 0.82, 'player', 'gigante', 150),
                node('path_1', 0.20, 0.68, 'neutral', 'normal', 20),
                node('path_2', 0.36, 0.84, 'neutral', 'normal', 20),
                node('path_3', 0.50, 0.52, 'neutral', 'enjambre', 20),
                node('path_4', 0.66, 0.18, 'neutral', 'normal', 20),
                node('path_5', 0.82, 0.34, 'neutral', 'normal', 20),
                node('enemy_core', 0.92, 0.14, 'enemy', 'gigante', 175)
            ],
            hazards: zigZagHazards([
                [0.16, 0.22],
                [0.24, 0.46],
                [0.32, 0.30],
                [0.42, 0.58],
                [0.54, 0.36],
                [0.62, 0.70],
                [0.74, 0.48],
                [0.84, 0.74]
            ], 0.10, { scaleY: 1.4 })
        }
    ]
};
