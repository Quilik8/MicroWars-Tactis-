/**
 * Archivo de Niveles (JSON/Objetos) estructurado por SECTORES
 * 
 * Cada sector agrupa niveles bajo una misma filosofía de aprendizaje y
 * dicta si ciertas mecánicas (como allowEvolutions) están permitidas.
 */

export const SECTORS = [
    {
        id: 'sector-1',
        name: 'Sector 1: El Despertar',
        description: 'Fundamentos, movilidad pura y establecimiento de Caminos Logísticos. Aprende a dominar el enjambre. (Mejoras desactivadas)',
        config: { allowEvolutions: false },
        levels: [
            {
                name: "Nivel 1: Aprende a Conquistar",
                description: "1. Haz CLIC en tu base azul.\n2. Ajusta la barra de enviar tropas al 100%.\n3. Haz CLIC en el nodo enemigo para atacarlo.",
                nodes: [
                    { id: "base_player", x: 0.15, y: 0.5, owner: 'player', type: 'normal', startUnits: 80 },
                    { id: "base_enemy", x: 0.85, y: 0.5, owner: 'enemy', type: 'normal', startUnits: 50 },
                    { id: "neutral_center", x: 0.5, y: 0.5, owner: 'neutral', type: 'normal', startUnits: 20 }
                ]
            },
            {
                name: "Nivel 2: Disputa por los Recursos",
                description: "Asegura los nodos de tipo enjambre del centro antes que el enemigo.",
                nodes: [
                    { id: "base_player", x: 0.1, y: 0.8, owner: 'player', type: 'gigante', startUnits: 150 },
                    { id: "base_enemy", x: 0.9, y: 0.2, owner: 'enemy', type: 'gigante', startUnits: 150 },
                    { id: "swarm_1", x: 0.35, y: 0.35, owner: 'neutral', type: 'enjambre', startUnits: 30 },
                    { id: "swarm_2", x: 0.65, y: 0.65, owner: 'neutral', type: 'enjambre', startUnits: 30 }
                ]
            },
            {
                name: "Nivel 3: El Foso Central",
                description: "Estamos rodeados. Sobrevive a dos frentes simultáneos.",
                nodes: [
                    { id: "player_center", x: 0.5, y: 0.5, owner: 'player', type: 'normal', startUnits: 200 },
                    { id: "enemy_1", x: 0.1, y: 0.1, owner: 'enemy', type: 'enjambre', startUnits: 100 },
                    { id: "enemy_2", x: 0.9, y: 0.8, owner: 'enemy', type: 'enjambre', startUnits: 100 },
                    { id: "neutral_top", x: 0.8, y: 0.2, owner: 'neutral', type: 'gigante', startUnits: 60 },
                    { id: "neutral_bot", x: 0.2, y: 0.8, owner: 'neutral', type: 'gigante', startUnits: 60 }
                ]
            },
            {
                name: "Nivel 4: La Fortaleza de Cristal",
                description: "Un muro de fuerza azul encierra el nido enemigo por tres lados.\nLas hormigas NO pueden atravesar el muro, se acumulan en el borde.\nEl FERRY (nodo móvil central) sube y baja cruzando la pared inferior.\n¡Embarca tus tropas en el ferry para infiltrarte y atacar desde dentro!",
                nodes: [
                    { id: "p_base",  x: 0.50, y: 0.92, owner: 'player', type: 'gigante', startUnits: 140 },
                    { id: "p_left",  x: 0.25, y: 0.92, owner: 'player', type: 'normal',  startUnits: 45 },
                    { id: "p_right", x: 0.75, y: 0.92, owner: 'player', type: 'normal',  startUnits: 45 },
                    { id: "ferry", x: 0.50, y: 0.58, owner: 'neutral', type: 'enjambre', startUnits: 0, isMobile: true, orbitAnchorX: 0.50, orbitAnchorY: 0.58, orbitRadiusX: 0, orbitRadiusY: 0.10, orbitSpeed: 0.38 },
                    { id: "e1_base",  x: 0.22, y: 0.12, owner: 'enemy',   type: 'gigante', startUnits: 130 },
                    { id: "e1_front", x: 0.38, y: 0.32, owner: 'enemy',   type: 'normal',  startUnits: 55 },
                    { id: "e2_base",  x: 0.78, y: 0.12, owner: 'fuego',   type: 'gigante', startUnits: 130 },
                    { id: "e2_front", x: 0.62, y: 0.32, owner: 'fuego',   type: 'normal',  startUnits: 55 },
                    { id: "n_inner", x: 0.50, y: 0.25, owner: 'neutral', type: 'enjambre', startUnits: 65 }
                ],
                barriers: [
                    { x: 0.12, y: 0.04, width: 0.03, height: 0.54 },
                    { x: 0.85, y: 0.04, width: 0.03, height: 0.54 },
                    { x: 0.12, y: 0.58, width: 0.76, height: 0.03 }
                ]
            },
            {
                name: "Nivel 5: El Muro Infranqueable",
                description: "Un bloqueo absoluto impide el paso directo entre tu nido inferior izquierdo y el del enemigo.\nDeberás rodear su inmensa estructura de cristal conquistando los nodos superiores para flanquear.",
                nodes: [
                    { id: "p1", x: 0.20, y: 0.80, owner: 'player', type: 'gigante', startUnits: 150 },
                    { id: "e1", x: 0.80, y: 0.80, owner: 'enemy',  type: 'gigante', startUnits: 150 },
                    { id: "n_left",  x: 0.20, y: 0.30, owner: 'neutral', type: 'enjambre', startUnits: 60 },
                    { id: "n_top",   x: 0.50, y: 0.15, owner: 'neutral', type: 'gigante',  startUnits: 100 },
                    { id: "n_right", x: 0.80, y: 0.30, owner: 'neutral', type: 'enjambre', startUnits: 60 }
                ],
                barriers: [
                    { x: 0.48, y: 0.45, width: 0.04, height: 0.45 }
                ]
            }
        ]
    },
    {
        id: 'sector-2',
        name: 'Sector 2: Redes Subterráneas',
        description: 'Domina los túneles de mapa y fortifica tus rutas.\n¡Evoluciones desbloqueadas! Perfecciona el uso de Tanques, Artillería y Espinas.',
        config: { allowEvolutions: true },
        levels: [
            {
                name: "Nivel 1: Conexiones Subterráneas",
                description: "Utiliza los Túneles Profundos para viajar largas distancias. Crea Caminos Logísticos fuertes. Lucha entre tres frentes iguales.",
                nodes: [
                    { id: "base_player", x: 0.1, y: 0.5, owner: 'player', type: 'gigante', startUnits: 150 },
                    { id: "base_enemy", x: 0.9, y: 0.5, owner: 'enemy', type: 'gigante', startUnits: 150 },
                    { id: "base_fuego", x: 0.5, y: 0.9, owner: 'fuego', type: 'gigante', startUnits: 150 },
                    { id: "center", x: 0.5, y: 0.5, owner: 'neutral', type: 'enjambre' },
                    { id: "mid_left", x: 0.35, y: 0.5, owner: 'neutral', type: 'normal' },
                    { id: "mid_right", x: 0.65, y: 0.5, owner: 'neutral', type: 'normal' },
                    { id: "flank_tl", x: 0.35, y: 0.35, owner: 'neutral', type: 'enjambre' },
                    { id: "flank_tr", x: 0.65, y: 0.35, owner: 'neutral', type: 'enjambre' },
                    { id: "top", x: 0.5, y: 0.2, owner: 'neutral', type: 'gigante' },
                    { id: 'hole_left', x: 0.15, y: 0.8, owner: 'neutral', type: 'tunel', tunnelTo: 'hole_right', startUnits: 0 },
                    { id: 'hole_right', x: 0.85, y: 0.2, owner: 'neutral', type: 'tunel', tunnelTo: 'hole_left', startUnits: 0 }
                ]
            }
        ]
    },
    {
        id: 'sector-3',
        name: 'Sector 3: Zonas de Contención',
        description: 'El insecticida aniquila al contacto. Aprende a usar Ferrys y evadir peligros ambientales.',
        config: { allowEvolutions: true },
        levels: [
            {
                name: "Nivel 1: La Hoja Flotante",
                description: "El centro está bloqueado por un charco de insecticida letal. Usa la hoja flotante móvil para cruzar de forma segura sin perder tropas.",
                nodes: [
                    { id: "p1", x: 0.1, y: 0.5, owner: 'player', type: 'gigante', startUnits: 150 },
                    { id: "p2", x: 0.1, y: 0.3, owner: 'neutral', type: 'normal', startUnits: 20 },
                    { id: "p3", x: 0.1, y: 0.7, owner: 'neutral', type: 'normal', startUnits: 20 },
                    { id: "e1", x: 0.9, y: 0.1, owner: 'enemy', type: 'gigante', startUnits: 150 },
                    { id: "e2", x: 0.7, y: 0.1, owner: 'neutral', type: 'normal', startUnits: 20 },
                    { id: "f1", x: 0.9, y: 0.9, owner: 'fuego', type: 'gigante', startUnits: 150 },
                    { id: "f2", x: 0.7, y: 0.9, owner: 'neutral', type: 'normal', startUnits: 20 },
                    { id: "center", x: 0.6, y: 0.5, owner: 'neutral', type: 'gigante', startUnits: 100 },
                    { id: "top_mid", x: 0.6, y: 0.2, owner: 'neutral', type: 'enjambre', startUnits: 50 },
                    { id: "bot_mid", x: 0.6, y: 0.8, owner: 'neutral', type: 'enjambre', startUnits: 50 },
                    { id: "hoja_movil", x: 0.35, y: 0.5, owner: 'neutral', type: 'enjambre', startUnits: 0, isMobile: true, orbitAnchorX: 0.35, orbitAnchorY: 0.5, orbitRadiusX: 0.13, orbitRadiusY: 0, orbitSpeed: 0.6 }
                ],
                hazards: [
                    { x: 0.35, y: 0.5, radius: 0.12, dps: 6, color: 0x2ecc71, alpha: 0.25, shape: "puddle", scaleY: 1.6 }
                ]
            }
        ]
    },
    {
        id: 'sector-4',
        name: 'Sector 4: Terrenos Alterados',
        description: 'Domina la fricción. Las zonas de velocidad alteran drásticamente el flujo del combate matemático.',
        config: { allowEvolutions: true },
        levels: [
            {
                name: "Nivel 1: Carreteras y Pantanos",
                description: "El terreno afecta a tu velocidad. Las zonas verdes te aceleran el doble. Las zonas rojas te ralentizan a la mitad.",
                nodes: [
                    { id: "p1", x: 0.15, y: 0.35, owner: 'player', type: 'gigante', startUnits: 150 },
                    { id: "p2", x: 0.25, y: 0.25, owner: 'neutral', type: 'normal', startUnits: 20 },
                    { id: "p3", x: 0.25, y: 0.45, owner: 'neutral', type: 'normal', startUnits: 20 },
                    { id: "e1", x: 0.85, y: 0.65, owner: 'enemy', type: 'gigante', startUnits: 150 },
                    { id: "e2", x: 0.75, y: 0.55, owner: 'neutral', type: 'normal', startUnits: 20 },
                    { id: "e3", x: 0.75, y: 0.75, owner: 'neutral', type: 'normal', startUnits: 20 },
                    { id: "n1", x: 0.5, y: 0.5, owner: 'neutral', type: 'enjambre', startUnits: 80 },
                    { id: "n2", x: 0.2, y: 0.8, owner: 'neutral', type: 'normal', startUnits: 30 },
                    { id: "n3", x: 0.3, y: 0.7, owner: 'neutral', type: 'normal', startUnits: 30 },
                    { id: "n4", x: 0.8, y: 0.2, owner: 'neutral', type: 'normal', startUnits: 30 },
                    { id: "n5", x: 0.7, y: 0.3, owner: 'neutral', type: 'normal', startUnits: 30 }
                ],
                zones: [
                    { id: "green1", color: 0x00FF00, alpha: 0.2, speedMult: 2.0, x: 0.05, y: 0.1, width: 0.35, height: 0.4 },
                    { id: "green2", color: 0x00FF00, alpha: 0.2, speedMult: 2.0, x: 0.6, y: 0.5, width: 0.35, height: 0.4 },
                    { id: "red1", color: 0xFF0000, alpha: 0.15, speedMult: 0.5, x: 0.0, y: 0.0, width: 1.0, height: 1.0 }
                ]
            }
        ]
    },
    {
        id: 'sector-5',
        name: 'Sector 5: Mareas Implacables',
        description: 'El agua barre todo a su paso. Sincronízate o perece.',
        config: { allowEvolutions: true },
        levels: [
            {
                name: "Nivel 1: El Arroyuelo",
                description: "Una corriente de agua barre el campo periódicamente.\nElimina TODAS las tropas a su paso — aliadas y enemigas.\nSincroniza tus ataques con el ciclo del agua para ganar.",
                nodes: [
                    { id: "p_base", x: 0.07, y: 0.5, owner: 'player', type: 'gigante', startUnits: 130 },
                    { id: "p_top", x: 0.18, y: 0.28, owner: 'neutral', type: 'normal' },
                    { id: "p_bot", x: 0.18, y: 0.72, owner: 'neutral', type: 'normal' },
                    { id: "n_top", x: 0.38, y: 0.22, owner: 'neutral', type: 'enjambre', startUnits: 55 },
                    { id: "n_center", x: 0.5, y: 0.5, owner: 'neutral', type: 'gigante', startUnits: 90 },
                    { id: "n_bot", x: 0.38, y: 0.78, owner: 'neutral', type: 'enjambre', startUnits: 55 },
                    { id: "e1_front", x: 0.65, y: 0.28, owner: 'enemy', type: 'normal', startUnits: 50 },
                    { id: "e1_base", x: 0.88, y: 0.18, owner: 'enemy', type: 'gigante', startUnits: 130 },
                    { id: "e2_front", x: 0.65, y: 0.72, owner: 'fuego', type: 'normal', startUnits: 50 },
                    { id: "e2_base", x: 0.88, y: 0.82, owner: 'fuego', type: 'gigante', startUnits: 130 }
                ],
                waterSweeps: [
                    { speed: 20, width: 0.032, cooldown: 37, initialDelay: 15, color: 0x0097a7, alpha: 0.42 }
                ]
            }
        ]
    },
    {
        id: 'sector-6',
        name: 'Sector 6: Prisiones',
        description: 'Barreras intermitentes restringen tu flujo. El despiadado Light Sweep castigará tus excesos de evolución.',
        config: { allowEvolutions: true },
        levels: [
            {
                name: "Nivel 1: El Ojo del Sol",
                description: "Orbes solares barren el campo rápidamente por rieles térmicos.\nTocan cualquier nodo marcado (aro cian) → lo vuelve NEUTRAL y pierde mejoras.\nLas hormigas sobreviven. ¡Mide bien tus tiempos!",
                nodes: [
                    { id: "p_base", x: 0.10, y: 0.12, owner: 'player', type: 'gigante', startUnits: 140, isMarkedForSweep: true },
                    { id: "p_front", x: 0.22, y: 0.25, owner: 'player', type: 'normal', startUnits: 40, isMarkedForSweep: true },
                    { id: "e2_base", x: 0.90, y: 0.12, owner: 'fuego', type: 'gigante', startUnits: 130, isMarkedForSweep: true },
                    { id: "e2_front", x: 0.78, y: 0.25, owner: 'fuego', type: 'normal', startUnits: 40, isMarkedForSweep: true },
                    { id: "n_top_l", x: 0.35, y: 0.18, owner: 'neutral', type: 'normal', startUnits: 25, isMarkedForSweep: true },
                    { id: "n_top_c", x: 0.50, y: 0.12, owner: 'neutral', type: 'enjambre', startUnits: 50, isMarkedForSweep: true },
                    { id: "n_top_r", x: 0.65, y: 0.18, owner: 'neutral', type: 'normal', startUnits: 25, isMarkedForSweep: true },
                    { id: "n_mid_ll", x: 0.22, y: 0.48, owner: 'neutral', type: 'normal', startUnits: 20, isMarkedForSweep: true },
                    { id: "n_mid_l", x: 0.36, y: 0.48, owner: 'neutral', type: 'enjambre', startUnits: 35, isMarkedForSweep: true },
                    { id: "n_mid_c", x: 0.50, y: 0.48, owner: 'neutral', type: 'gigante', startUnits: 70, isMarkedForSweep: true },
                    { id: "n_mid_r", x: 0.64, y: 0.48, owner: 'neutral', type: 'enjambre', startUnits: 35, isMarkedForSweep: true },
                    { id: "n_mid_rr", x: 0.78, y: 0.48, owner: 'neutral', type: 'normal', startUnits: 20, isMarkedForSweep: true },
                    { id: "e1_base", x: 0.50, y: 0.82, owner: 'enemy', type: 'gigante', startUnits: 130 },
                    { id: "e1_left", x: 0.28, y: 0.78, owner: 'enemy', type: 'normal', startUnits: 30 },
                    { id: "e1_right", x: 0.72, y: 0.78, owner: 'enemy', type: 'normal', startUnits: 30 },
                    { id: "n_bot_l", x: 0.36, y: 0.65, owner: 'neutral', type: 'normal', startUnits: 20 },
                    { id: "n_bot_r", x: 0.64, y: 0.65, owner: 'neutral', type: 'normal', startUnits: 20 }
                ],
                lightSweeps: [
                    { speed: 420, cooldown: 16, initialDelay: 12, color: 0xff8c00, orbRadius: 15, rails: [0.12, 0.18, 0.25, 0.48] }
                ]
            },
            {
                name: "Nivel 2: Prisiones Intermitentes",
                description: "Tus ejércitos inician encerrados en paredes holográficas huecas.\nDentro tienes nodos para expandirte, pero no puedes salir aún.\nCada 8 segundos la prisión se abre. ¡Domina el medio!",
                nodes: [
                    { id: "p1", x: 0.12, y: 0.50, owner: 'player', type: 'gigante', startUnits: 180 },
                    { id: "p2", x: 0.26, y: 0.30, owner: 'neutral', type: 'normal',  startUnits: 30 },
                    { id: "p3", x: 0.26, y: 0.70, owner: 'neutral', type: 'normal',  startUnits: 30 },
                    { id: "c_top", x: 0.50, y: 0.30, owner: 'neutral', type: 'tanque', startUnits: 120 },
                    { id: "c_bot", x: 0.50, y: 0.70, owner: 'neutral', type: 'tanque', startUnits: 120 },
                    { id: "e1", x: 0.88, y: 0.50, owner: 'enemy',  type: 'gigante', startUnits: 180 },
                    { id: "e2", x: 0.74, y: 0.30, owner: 'neutral',  type: 'normal',  startUnits: 30 },
                    { id: "e3", x: 0.74, y: 0.70, owner: 'neutral',  type: 'normal',  startUnits: 30 }
                ],
                intermittentBarriers: [
                    {
                        zones: [
                            { isHollow: true, x: 0.03, y: 0.15, width: 0.32, height: 0.70, color: 0x00e5ff },
                            { hidden: true }
                        ],
                        interval: 8,
                        activeZoneIndex: 0
                    },
                    {
                        zones: [
                            { isHollow: true, x: 0.65, y: 0.15, width: 0.32, height: 0.70, color: 0x00e5ff },
                            { hidden: true }
                        ],
                        interval: 8,
                        activeZoneIndex: 0
                    }
                ]
            }
        ]
    },
    {
        id: 'sector-7',
        name: 'Sector 7: El Ecosistema Supremo',
        description: 'El clímax de la supervivencia. Todo el entorno conspira en tu contra.',
        config: { allowEvolutions: true },
        levels: []
    }
];
