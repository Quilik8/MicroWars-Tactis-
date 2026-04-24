import { flood, mobileNode, node, puddle, rectPuddle, ring, ringHazards, zigZagHazards } from './helpers.js';

export const sector3 = {
    id: 'sector-3',
    name: 'Sector 3: Zonas de Contencion',
    description: 'El insecticida aniquila al contacto. Ferries, tuneles y rutas seguras son tan importantes como la fuerza bruta.',
    config: { allowEvolutions: true },
    aiStrategy: {
        focus: 'expansion',
        aggressionMult: 1.1,
        minEvolutionGarrison: 34,
        minPostCaptureGarrison: 22,
        hazardGarrisonBonus: 8,
        hazardFatalityRatio: 0.32,
        difficultyOverrides: {
            hard: {
                aggressionMult: 1.25,
                minEvolutionGarrison: 42,
                minPostCaptureGarrison: 28,
                hazardGarrisonBonus: 12,
                hazardFatalityRatio: 0.24
            }
        }
    },
    levels: [
        {
            name: 'Nivel 10: La Hoja Flotante',
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
            name: 'Nivel 11: El Ojo de la Tormenta',
            description: 'Un anillo grueso de insecticida protege el nucleo del mapa.\nUsa el ferry orbital para cruzar de forma segura o fuerza el paso asumiendo bajas.',
            nodes: [
                node('p_base', 0.06, 0.82, 'player', 'gigante', 150),
                node('outer_top', 0.28, 0.10, 'neutral', 'normal', 20),
                node('outer_left', 0.12, 0.44, 'neutral', 'enjambre', 20),
                node('outer_right', 0.88, 0.56, 'neutral', 'enjambre', 20),
                node('inner_top', 0.50, 0.30, 'neutral', 'normal', 20),
                node('inner_mid', 0.56, 0.50, 'neutral', 'normal', 20),
                node('inner_bot', 0.50, 0.70, 'neutral', 'normal', 20),
                node('enemy_core', 0.88, 0.14, 'enemy', 'gigante', 175),
                mobileNode('storm_ferry', 0.50, 0.50, 0.50, 0.50, 0.20, 0, 0.42)
            ],
            hazards: [
                ring(0.50, 0.50, 0.24, 0.14, { scaleY: 1.1 })
            ]
        },
        {
            name: 'Nivel 12: Islas de Seguridad',
            description: 'Todo el mapa es un mar de insecticida. Solo pequenas islas seguras alrededor de cada nodo permiten reagruparte.\nDebes enviar con precision quirurgica de isla en isla.',
            nodes: [
                node('p_base', 0.06, 0.50, 'player', 'gigante', 150),
                node('isle_1', 0.22, 0.18, 'neutral', 'normal', 20),
                node('isle_2', 0.22, 0.82, 'neutral', 'normal', 20),
                node('isle_3', 0.46, 0.30, 'neutral', 'enjambre', 20),
                node('isle_4', 0.46, 0.70, 'neutral', 'enjambre', 20),
                node('isle_5', 0.70, 0.14, 'neutral', 'normal', 20),
                node('isle_6', 0.70, 0.86, 'neutral', 'normal', 20),
                node('enemy_top', 0.94, 0.22, 'enemy', 'gigante', 145),
                node('enemy_bot', 0.94, 0.78, 'fuego', 'gigante', 145)
            ],
            hazards: [
                flood([
                    { x: 0.06, y: 0.50, radius: 0.055 },
                    { x: 0.22, y: 0.18, radius: 0.045 },
                    { x: 0.22, y: 0.82, radius: 0.045 },
                    { x: 0.46, y: 0.30, radius: 0.045 },
                    { x: 0.46, y: 0.70, radius: 0.045 },
                    { x: 0.70, y: 0.14, radius: 0.045 },
                    { x: 0.70, y: 0.86, radius: 0.045 },
                    { x: 0.94, y: 0.22, radius: 0.055 },
                    { x: 0.94, y: 0.78, radius: 0.055 }
                ])
            ]
        },
        {
            name: 'Nivel 13: Rios Venenosos',
            description: 'Tres rios de insecticida cruzan un mapa colosal.\nLas zonas seguras son escasas, pero los nodos mas formidables aguardan en pleno veneno.',
            cameraPadding: 400,
            nodes: [
                // Fila Segura Extrema 1 (Arriba)
                node('p_base', -0.20, -0.40, 'player', 'gigante', 150),
                node('mut_base', 1.20, -0.40, 'mutantes', 'gigante', 150),

                // Río 1 (Superior) Y=0.0
                node('riv1_a', 0.20, 0.00, 'neutral', 'gigante', 100),
                node('riv1_b', 0.80, 0.00, 'neutral', 'gigante', 100),

                // Tierra Media 1 (Y=0.25) [3 Nodos]
                node('safe_mid1_a', 0.20, 0.25, 'neutral', 'normal', 30),
                node('safe_mid1_b', 0.50, 0.25, 'neutral', 'normal', 30),
                node('safe_mid1_c', 0.80, 0.25, 'neutral', 'normal', 30),

                // Río 2 (Central) Y=0.50
                node('riv2_core', 0.50, 0.50, 'neutral', 'gigante', 150),

                // Tierra Media 2 (Y=0.75) [3 Nodos]
                node('safe_mid2_a', 0.20, 0.75, 'neutral', 'normal', 30),
                node('safe_mid2_b', 0.50, 0.75, 'neutral', 'normal', 30),
                node('safe_mid2_c', 0.80, 0.75, 'neutral', 'normal', 30),

                // Río 3 (Inferior) Y=1.00
                node('riv3_a', 0.20, 1.00, 'neutral', 'gigante', 100),
                node('riv3_b', 0.80, 1.00, 'neutral', 'gigante', 100),

                // Fila Segura Extrema 4 (Abajo)
                node('f_base', -0.20, 1.40, 'fuego', 'gigante', 150),
                node('e_base', 1.20, 1.40, 'enemy', 'gigante', 150)
            ],
            hazards: [
                rectPuddle(-2.0, -0.15, 5.0, 0.30),
                rectPuddle(-2.0, 0.35, 5.0, 0.30),
                rectPuddle(-2.0, 0.85, 5.0, 0.30)
            ]
        },
        {
            name: 'Nivel 14: El Pantano de los Ferries',
            description: 'Un rio vertical de insecticida divide el mapa por la mitad.\nNo existe ruta terrestre segura: solo los ferries permiten cruzar al territorio enemigo.',
            nodes: [
                node('p_base', 0.06, 0.50, 'player', 'gigante', 150),
                node('p_top', 0.16, 0.16, 'neutral', 'normal', 20),
                node('p_bot', 0.16, 0.84, 'neutral', 'normal', 20),
                node('mid_top', 0.50, 0.14, 'neutral', 'enjambre', 20),
                node('mid_bot', 0.50, 0.86, 'neutral', 'enjambre', 20),
                node('e_top', 0.84, 0.18, 'enemy', 'normal', 60),
                node('e_bot', 0.84, 0.82, 'fuego', 'normal', 60),
                node('enemy_core', 0.94, 0.50, 'enemy', 'gigante', 185),
                mobileNode('ferry_top', 0.38, 0.22, 0.38, 0.22, 0.18, 0, 0.50),
                mobileNode('ferry_mid', 0.38, 0.50, 0.38, 0.50, 0.18, 0, 0.65),
                mobileNode('ferry_bot', 0.38, 0.78, 0.38, 0.78, 0.18, 0, 0.45)
            ],
            hazards: [
                rectPuddle(0.28, -0.02, 0.22, 1.04)
            ]
        },
        {
            name: 'Nivel 15: Zig-Zag Letal',
            description: 'Dos muros horizontales de insecticida crean un corredor serpenteante.\nControla el flujo: un paso en falso y las tropas se pierden en el veneno.',
            nodes: [
                node('p_base', 0.06, 0.86, 'player', 'gigante', 150),
                node('path_1', 0.18, 0.62, 'neutral', 'normal', 20),
                node('path_2', 0.34, 0.86, 'neutral', 'normal', 20),
                node('path_3', 0.50, 0.50, 'neutral', 'enjambre', 20),
                node('path_4', 0.66, 0.14, 'neutral', 'normal', 20),
                node('path_5', 0.82, 0.38, 'neutral', 'normal', 20),
                node('enemy_core', 0.94, 0.10, 'enemy', 'gigante', 175)
            ],
            hazards: [
                rectPuddle(0.00, -0.02, 0.42, 0.40),
                rectPuddle(0.30, 0.60, 0.70, 0.42),
                rectPuddle(0.58, -0.02, 0.42, 0.30)
            ]
        }
    ]
};
