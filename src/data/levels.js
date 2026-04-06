/**
 * Archivo de Niveles (JSON/Objetos)
 * Las coordenadas x e y están en formato de porcentaje (0.0 a 1.0)
 * para que el mapa se estire y adapte dinámicamente a cualquier resolución.
 *
 * PROPIEDAD waterSweeps[]
 *   Define "Mareas Barrientes" que barren el nivel periódicamente.
 *   Todos los valores espaciales están en COORDENADAS DE MUNDO.
 *   Parámetros:
 *     speed        — velocidad en unidades-de-mundo / s (ej. 20 → ~96s para cruzar 1920px de mundo)
 *     width        — fracción del ancho del mundo (ej. 0.032 ≈ 62px sobre un mundo de 1920)
 *     cooldown     — segundos entre spawns (el timer arranca en el spawn, no al desaparecer)
 *     initialDelay — segundos hasta el primer spawn
 *     color        — color hex numérico PixiJS (ej. 0x0097a7)
 *     alpha        — opacidad de la franja (0.0 – 1.0)
 */

export const LEVELS = [
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
        name: "CONEXIONES SUBTERRÁNEAS",
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
    },
    {
        name: "Nivel 5: La Hoja Flotante",
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

            {
                id: "hoja_movil", x: 0.35, y: 0.5,
                owner: 'neutral', type: 'enjambre', startUnits: 0,
                isMobile: true,
                orbitAnchorX: 0.35, orbitAnchorY: 0.5,
                orbitRadiusX: 0.13, orbitRadiusY: 0,
                orbitSpeed: 0.6
            }
        ],
        hazards: [
            { x: 0.35, y: 0.5, radius: 0.12, dps: 6, color: 0x8e44ad, alpha: 0.25, shape: "puddle", scaleY: 1.6 }
        ]
    },
    {
        name: "Nivel 6: Carreteras y Pantanos",
        description: "El terreno afecta a tu velocidad. Las zonas verdes (carreteras de hojas) te aceleran el doble. Las zonas rojas (barro pegajoso) te ralentizan a la mitad.",
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
    },

    // ══════════════════════════════════════════════════════════════════
    // NIVEL 7: EL ARROYUELO
    // ══════════════════════════════════════════════════════════════════
    // MECÁNICA CENTRAL — Marea Barriente (coordenadas de mundo):
    //   Una franja azul-agua (teal) cruza el mundo de izquierda a derecha.
    //   Nace en worldX = -barWorldWidth, muere cuando supera game.width.
    //   Elimina TODAS las unidades a su paso — aliadas y enemigas.
    //   Los nodos sobreviven con su dueño intacto pero sin tropas.
    //   Hacer zoom/pan NO afecta ni la velocidad percibida ni la colisión.
    //
    // PARÁMETROS (v3 mundo):
    //   · speed 20 u/s  — lenta; a 1920px de mundo tarda ~96 s en cruzar
    //   · width 0.032   — fracción del mundo ≈ 62 px sobre ~1920 de mundo
    //   · cooldown 37 s — ciclo completo ~40 s; máx. 2-3 barras simultáneas
    //   · initialDelay 15 s — tiempo para prepararse antes de la primera ola
    // ══════════════════════════════════════════════════════════════════
    {
        name: "Nivel 7: El Arroyuelo",
        description: "Una corriente de agua barre el campo periódicamente.\nElimina TODAS las tropas a su paso — aliadas y enemigas.\nLos nodos sobreviven vacíos. El borde izquierdo te avisa 3 s antes.\n\nSincroniza tus ataques con el ciclo del agua para ganar.",
        nodes: [
            // ── Jugador (Azul) — flanco izquierdo ──
            { id: "p_base", x: 0.07, y: 0.5, owner: 'player', type: 'gigante', startUnits: 130 },
            { id: "p_top", x: 0.18, y: 0.28, owner: 'neutral', type: 'normal' },
            { id: "p_bot", x: 0.18, y: 0.72, owner: 'neutral', type: 'normal' },

            // ── Nodos neutrales — corredor central ──
            // La marea los vaciará repetidamente; consolidarlos es la clave.
            { id: "n_top", x: 0.38, y: 0.22, owner: 'neutral', type: 'enjambre', startUnits: 55 },
            { id: "n_center", x: 0.5, y: 0.5, owner: 'neutral', type: 'gigante', startUnits: 90 },
            { id: "n_bot", x: 0.38, y: 0.78, owner: 'neutral', type: 'enjambre', startUnits: 55 },

            // ── Enemigo 1 (Rojo) — flanco derecho superior ──
            { id: "e1_front", x: 0.65, y: 0.28, owner: 'enemy', type: 'normal', startUnits: 50 },
            { id: "e1_base", x: 0.88, y: 0.18, owner: 'enemy', type: 'gigante', startUnits: 130 },

            // ── Enemigo 2 (Fuego/Naranja) — flanco derecho inferior ──
            { id: "e2_front", x: 0.65, y: 0.72, owner: 'fuego', type: 'normal', startUnits: 50 },
            { id: "e2_base", x: 0.88, y: 0.82, owner: 'fuego', type: 'gigante', startUnits: 130 }
        ],

        waterSweeps: [
            {
                speed: 20,     // unidades-de-mundo / s → ~96 s para cruzar el mundo
                width: 0.032,  // fracción del mundo ≈ 62px sobre ~1920 de mundo
                cooldown: 37,     // s entre spawns (ajustado para dar margen)
                initialDelay: 15,     // s antes del primer spawn (ajustado)
                color: 0x0097a7,
                alpha: 0.42
            }
        ]
    },

    // ══════════════════════════════════════════════════════════════════
    // NIVEL 8: EL OJO DEL SOL
    // ══════════════════════════════════════════════════════════════════
    // MECÁNICA CENTRAL — Rayo de Luz (LightSweep):
    //   Un haz de luz solar barre el campo de izquierda a derecha
    //   cada ~15 segundos. Cuando toca un nodo marcado (anillo dorado
    //   giratorio):
    //     - El nodo vuelve a NEUTRAL (pierde su dueño).
    //     - Cualquier mejora (espinoso/tanque/artillería) desaparece.
    //     - Los caminos (túneles logísticos) conectados se rompen.
    //     - Las hormigas presentes NO mueren — conservan su facción.
    //
    //   Las bases de jugador/enemigo son inmunes (NO están marcadas).
    //   La franja central de nodos neutrales sí están marcados — el
    //   jugador debe decidir cuándo y cuánto invertir en ellos.
    //
    // ESTRATEGIA:
    //   Sincroniza tus expansiones con el ciclo solar. Mejora nodos
    //   justo después de que el rayo pase para aprovechar la ventana.
    //   Tomar los nodos marcados da producción pero no es permanente.
    // ══════════════════════════════════════════════════════════════════
    {
        name: "Nivel 8: El Ojo del Sol",
        description: "Orbes solares barren el campo rápidamente por rieles térmicos.\nTocan cualquier nodo marcado (aro cian) → lo vuelve NEUTRAL y pierde mejoras.\nLas hormigas sobreviven. ¡Mide bien tus tiempos!",

        nodes: [
            // ── Jugador (Azul) — flanco superior izquierdo (ANTES e1) ──
            { id: "p_base", x: 0.10, y: 0.12, owner: 'player', type: 'gigante', startUnits: 140, isMarkedForSweep: true },
            { id: "p_front", x: 0.22, y: 0.25, owner: 'player', type: 'normal', startUnits: 40, isMarkedForSweep: true },

            // ── Enemigo 2 (Naranja) — flanco superior derecho ────────
            { id: "e2_base", x: 0.90, y: 0.12, owner: 'fuego', type: 'gigante', startUnits: 130, isMarkedForSweep: true },
            { id: "e2_front", x: 0.78, y: 0.25, owner: 'fuego', type: 'normal', startUnits: 40, isMarkedForSweep: true },

            // ── Fila superior neutral (alineados con las bases) ──────
            { id: "n_top_l", x: 0.35, y: 0.18, owner: 'neutral', type: 'normal', startUnits: 25, isMarkedForSweep: true },
            { id: "n_top_c", x: 0.50, y: 0.12, owner: 'neutral', type: 'enjambre', startUnits: 50, isMarkedForSweep: true },
            { id: "n_top_r", x: 0.65, y: 0.18, owner: 'neutral', type: 'normal', startUnits: 25, isMarkedForSweep: true },

            // ── Fila CENTRAL ─────────────────────────────────────────
            { id: "n_mid_ll", x: 0.22, y: 0.48, owner: 'neutral', type: 'normal', startUnits: 20, isMarkedForSweep: true },
            { id: "n_mid_l", x: 0.36, y: 0.48, owner: 'neutral', type: 'enjambre', startUnits: 35, isMarkedForSweep: true },
            { id: "n_mid_c", x: 0.50, y: 0.48, owner: 'neutral', type: 'gigante', startUnits: 70, isMarkedForSweep: true },
            { id: "n_mid_r", x: 0.64, y: 0.48, owner: 'neutral', type: 'enjambre', startUnits: 35, isMarkedForSweep: true },
            { id: "n_mid_rr", x: 0.78, y: 0.48, owner: 'neutral', type: 'normal', startUnits: 20, isMarkedForSweep: true },

            // ── Enemigo 1 (Rojo) — base inferior central (ANTES plyr) ──
            { id: "e1_base", x: 0.50, y: 0.82, owner: 'enemy', type: 'gigante', startUnits: 130 },
            { id: "e1_left", x: 0.28, y: 0.78, owner: 'enemy', type: 'normal', startUnits: 30 },
            { id: "e1_right", x: 0.72, y: 0.78, owner: 'enemy', type: 'normal', startUnits: 30 },

            // ── Fila inferior neutral (inmune al rayo) ────────────────
            { id: "n_bot_l", x: 0.36, y: 0.65, owner: 'neutral', type: 'normal', startUnits: 20 },
            { id: "n_bot_r", x: 0.64, y: 0.65, owner: 'neutral', type: 'normal', startUnits: 20 }
        ],

        lightSweeps: [
            {
                speed: 420,       // px/s — MUY rápido
                cooldown: 16,        // s entre rayazos
                initialDelay: 12,        // s antes del primer rayo
                color: 0xff8c00,  // ámbar candente
                orbRadius: 15,        // orbe concentrado (pequeño)

                // Estos son los "Rieles" (Y relativo). Hay nodos en Y=0.12, 0.18, 0.25 y 0.48
                rails: [0.12, 0.18, 0.25, 0.48]
            }
        ]
    },

    // ══════════════════════════════════════════════════════════════════
    // NIVEL 9: LA FORTALEZA DE CRISTAL
    // ══════════════════════════════════════════════════════════════════
    // MECÁNICA CENTRAL — Barrera de Bloqueo:
    //   Un muro de fuerza azul en forma de U encierra el nido enemigo.
    //   Las hormigas NO pueden atravesar el muro — se acumulan en el
    //   borde sin recibir daño, intentando pasar.
    //
    //   La ÚNICA forma de entrar es el FERRY: un nodo móvil que viaja
    //   verticalmente, cruzando la pared inferior de la U.
    //   Si una unidad está IDLE dentro del ferry cuando cruza el muro,
    //   el muro la ignora completamente (inmunidad de ferry).
    //
    // ESTRATEGIA:
    //   1. Envía tropas al ferry cuando esté en TU lado (fuera de la U).
    //   2. Espera a que el ferry cruce el muro inferior hacia el interior.
    //   3. Desde dentro, envía las tropas a atacar el nido enemigo.
    //   4. Una vez dentro, las tropas permanecen — no pueden salir fácil.
    //
    // DISPOSICIÓN:
    //   · Jugador: fuera, debajo de la U (en la zona abierta inferior).
    //   · Enemigos: dentro de la U.
    //   · Ferry: cruza la pared inferior (y ≈ 0.83–0.88) cada ~16 s.
    //   · U abierta por arriba (sin pared superior) — los nodos del
    //     borde superior son accesibles para ambos lados.
    // ══════════════════════════════════════════════════════════════════
    {
        name: "Nivel 9: La Fortaleza de Cristal",
        description: "Un muro de fuerza azul encierra el nido enemigo por tres lados.\nLas hormigas NO pueden atravesar el muro — se acumulan en el borde, sin daño.\nEl FERRY (nodo móvil central) sube y baja cruzando la pared inferior.\n¡Embarca tus tropas en el ferry para infiltrarte y atacar desde dentro!",

        nodes: [
            // ── Jugador (Azul) — fuera de la U, muy al fondo ─────────
            { id: "p_base",  x: 0.50, y: 0.92, owner: 'player', type: 'gigante', startUnits: 140 },
            { id: "p_left",  x: 0.25, y: 0.92, owner: 'player', type: 'normal',  startUnits: 45 },
            { id: "p_right", x: 0.75, y: 0.92, owner: 'player', type: 'normal',  startUnits: 45 },

            // ── Ferry (nodo móvil) — cruza la pared inferior de la U ──
            // Pared inferior está en y=0.58.
            // Recorrido vertical estricto: y=0.48 (interior) ↔ y=0.68 (exterior).
            {
                id: "ferry",
                x: 0.50, y: 0.58,
                owner: 'neutral', type: 'enjambre', startUnits: 0,
                isMobile:     true,
                orbitAnchorX: 0.50,
                orbitAnchorY: 0.58,
                orbitRadiusX: 0,
                orbitRadiusY: 0.10,
                orbitSpeed:   0.38 
            },

            // ── Enemigo 1 Clásico (Rojo) — Zona Superior Izquierda ──
            { id: "e1_base",  x: 0.22, y: 0.12, owner: 'enemy',   type: 'gigante', startUnits: 130 },
            { id: "e1_front", x: 0.38, y: 0.32, owner: 'enemy',   type: 'normal',  startUnits: 55 },

            // ── Enemigo 2 Fuego (Naranja) — Zona Superior Derecha ──
            { id: "e2_base",  x: 0.78, y: 0.12, owner: 'fuego',   type: 'gigante', startUnits: 130 },
            { id: "e2_front", x: 0.62, y: 0.32, owner: 'fuego',   type: 'normal',  startUnits: 55 },

            // ── Neutral estratégico en el interior de la U ────────────
            { id: "n_inner", x: 0.50, y: 0.25, owner: 'neutral', type: 'enjambre', startUnits: 65 }
        ],

        // ── Barreras de Bloqueo — forma de U más corta ──────
        barriers: [
            // Pared IZQUIERDA (vertical)
            { x: 0.12, y: 0.04, width: 0.03, height: 0.54 },
            // Pared DERECHA (vertical)
            { x: 0.85, y: 0.04, width: 0.03, height: 0.54 },
            // Pared INFERIOR (horizontal)
            { x: 0.12, y: 0.58, width: 0.76, height: 0.03 }
        ]
    },

    // ══════════════════════════════════════════════════════════════════
    // NIVEL 10: EL MURO INFRANQUEABLE
    // ══════════════════════════════════════════════════════════════════
    {
        name: "Nivel 10: El Muro Infranqueable",
        description: "Un bloqueo absoluto impide el paso directo entre tu nido inferior izquierdo y el del enemigo.\nDeberás rodear su inmensa estructura de cristal conquistando los nodos superiores para flanquear.",
        nodes: [
            // Bases principales (solo 1 por bando, en la parte inferior)
            { id: "p1", x: 0.20, y: 0.80, owner: 'player', type: 'gigante', startUnits: 150 },
            { id: "e1", x: 0.80, y: 0.80, owner: 'enemy',  type: 'gigante', startUnits: 150 },
            
            // Nodos neutrales (3 formando un arco por la parte superior)
            { id: "n_left",  x: 0.20, y: 0.30, owner: 'neutral', type: 'enjambre', startUnits: 60 },
            { id: "n_top",   x: 0.50, y: 0.15, owner: 'neutral', type: 'gigante',  startUnits: 100 },
            { id: "n_right", x: 0.80, y: 0.30, owner: 'neutral', type: 'enjambre', startUnits: 60 }
        ],
        barriers: [
            // Muro vertical central infranqueable
            // Comienza debajo de n_top (y=0.45) hasta el fondo del mapa (y=0.90)
            { x: 0.48, y: 0.45, width: 0.04, height: 0.45 }
        ]
    },

    // ══════════════════════════════════════════════════════════════════
    // NIVEL 11: PRISIONES INTERMITENTES
    // ══════════════════════════════════════════════════════════════════
    {
        name: "Nivel 11: PRISIONES INTERMITENTES",
        description: "Tus ejércitos inician encerrados en paredes holográficas huecas.\nDentro tienes 2 nodos neutrales para expandirte, pero no puedes salir aún.\nCada 8 segundos la prisión se abre y puedes acceder al centro, donde te esperan valiosos Nodos Tanque.\n¡Domina el medio antes que tu enemigo lo haga!",
        nodes: [
            // Nodos dentro de la caja Izquierda (Jugador)
            { id: "p1", x: 0.12, y: 0.50, owner: 'player', type: 'gigante', startUnits: 180 },
            { id: "p2", x: 0.26, y: 0.30, owner: 'neutral', type: 'normal',  startUnits: 30 },
            { id: "p3", x: 0.26, y: 0.70, owner: 'neutral', type: 'normal',  startUnits: 30 },
            
            // Nodos libres centrales (Tipo Tanque)
            { id: "c_top", x: 0.50, y: 0.30, owner: 'neutral', type: 'tanque', startUnits: 120 },
            { id: "c_bot", x: 0.50, y: 0.70, owner: 'neutral', type: 'tanque', startUnits: 120 },

            // Nodos dentro de la caja Derecha (Enemigo)
            { id: "e1", x: 0.88, y: 0.50, owner: 'enemy',  type: 'gigante', startUnits: 180 },
            { id: "e2", x: 0.74, y: 0.30, owner: 'neutral',  type: 'normal',  startUnits: 30 },
            { id: "e3", x: 0.74, y: 0.70, owner: 'neutral',  type: 'normal',  startUnits: 30 }
        ],
        intermittentBarriers: [
            // Barrera 1: Oscila entre encerrar la base Izquierda (ON) y liberarla (OFF)
            {
                zones: [
                    // Zona 0: Prisión Hueca Azul (izquierda) - ON
                    { isHollow: true, x: 0.03, y: 0.15, width: 0.32, height: 0.70, color: 0x00e5ff },
                    // Zona 1: Estado OFF (No bloquea ni dibuja, pero permite que la Zona 0 se sombree)
                    { hidden: true }
                ],
                interval: 8,
                activeZoneIndex: 0
            },
            // Barrera 2: Oscila entre encerrar la base Derecha (ON) y liberarla (OFF)
            {
                zones: [
                    // Zona 0: Prisión Hueca Roja (derecha) - ON
                    { isHollow: true, x: 0.65, y: 0.15, width: 0.32, height: 0.70, color: 0x00e5ff },
                    // Zona 1: Estado OFF
                    { hidden: true }
                ],
                interval: 8,
                activeZoneIndex: 0
            }
        ]
    }
];
