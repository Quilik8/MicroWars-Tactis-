import { mobileNode, node } from './helpers.js';

export const sector1 = {
    id: 'sector-1',
    name: 'Sector 1: El Despertar',
    description: 'Fundamentos, movilidad pura y establecimiento de caminos logisticos. Aprende a dominar el enjambre. Mejoras desactivadas.',
    config: { allowEvolutions: false },
    levels: [
        {
            name: 'Nivel 1: Aprende a Conquistar',
            description: '1. Haz clic en tu base azul.\n2. Ajusta la barra de enviar tropas al 100%.\n3. Haz clic en el nodo enemigo para atacarlo.',
            nodes: [
                node('base_player', 0.15, 0.5, 'player', 'normal', 80),
                node('base_enemy', 0.85, 0.5, 'enemy', 'normal', 50),
                node('neutral_center', 0.5, 0.5, 'neutral', 'normal', 20)
            ]
        },
        {
            name: 'Nivel 2: Disputa por los Recursos',
            description: 'Asegura los nodos de tipo enjambre del centro antes que el enemigo.',
            nodes: [
                node('base_player', 0.1, 0.8, 'player', 'gigante', 150),
                node('base_enemy', 0.9, 0.2, 'enemy', 'gigante', 150),
                node('swarm_1', 0.35, 0.35, 'neutral', 'enjambre', 30),
                node('swarm_2', 0.65, 0.65, 'neutral', 'enjambre', 30)
            ]
        },
        {
            name: 'Nivel 3: El Foso Central',
            description: 'Estamos rodeados. Sobrevive a dos frentes simultaneos.',
            nodes: [
                node('player_center', 0.5, 0.5, 'player', 'normal', 200),
                node('enemy_1', 0.1, 0.1, 'enemy', 'enjambre', 100),
                node('enemy_2', 0.9, 0.8, 'enemy', 'enjambre', 100),
                node('neutral_top', 0.8, 0.2, 'neutral', 'gigante', 60),
                node('neutral_bot', 0.2, 0.8, 'neutral', 'gigante', 60)
            ]
        },
        {
            name: 'Nivel 4: La Fortaleza de Cristal',
            description: 'Un muro de fuerza azul encierra el nido enemigo por tres lados.\nLas hormigas no pueden atravesar el muro y se acumulan en el borde.\nEl ferry movil central sube y baja cruzando la pared inferior.\nEmbarca tus tropas en el ferry para infiltrarte y atacar desde dentro.',
            nodes: [
                node('p_base', 0.50, 0.92, 'player', 'gigante', 140),
                node('p_left', 0.25, 0.92, 'player', 'normal', 45),
                node('p_right', 0.75, 0.92, 'player', 'normal', 45),
                mobileNode('ferry', 0.50, 0.58, 0.50, 0.58, 0, 0.10, 0.38),
                node('e1_base', 0.22, 0.12, 'enemy', 'gigante', 130),
                node('e1_front', 0.38, 0.32, 'enemy', 'normal', 55),
                node('e2_base', 0.78, 0.12, 'fuego', 'gigante', 130),
                node('e2_front', 0.62, 0.32, 'fuego', 'normal', 55),
                node('n_inner', 0.50, 0.25, 'neutral', 'enjambre', 65)
            ],
            barriers: [
                { x: 0.12, y: 0.04, width: 0.03, height: 0.54 },
                { x: 0.85, y: 0.04, width: 0.03, height: 0.54 },
                { x: 0.12, y: 0.58, width: 0.76, height: 0.03 }
            ]
        },
        {
            name: 'Nivel 5: El Muro Infranqueable',
            description: 'Un bloqueo absoluto impide el paso directo entre tu nido inferior izquierdo y el del enemigo.\nDebes rodear su inmensa estructura de cristal conquistando los nodos superiores para flanquear.',
            nodes: [
                node('p1', 0.20, 0.80, 'player', 'gigante', 150),
                node('e1', 0.80, 0.80, 'enemy', 'gigante', 150),
                node('n_left', 0.20, 0.30, 'neutral', 'enjambre', 60),
                node('n_top', 0.50, 0.15, 'neutral', 'gigante', 100),
                node('n_right', 0.80, 0.30, 'neutral', 'enjambre', 60)
            ],
            barriers: [
                { x: 0.48, y: 0.45, width: 0.04, height: 0.45 }
            ]
        }
    ]
};
