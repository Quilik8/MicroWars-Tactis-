# Guía Técnica Maestra de MicroWars Tactics - Documentación Completa de `src`

Este documento es la referencia definitiva sobre la arquitectura, lógica y sistemas del proyecto. Ha sido diseñado para proporcionar un nivel de detalle exhaustivo, cubriendo desde el arranque inicial hasta los sistemas de partículas y combate de bajo nivel.

---

## 1. El Arranque del Sistema: `main.js`
El archivo `main.js` es el punto de entrada (Entry Point) y actúa como el **Director de Orquesta**. Su responsabilidad es instanciar todos los componentes y coordinar el flujo de datos entre ellos para evitar dependencias circulares.

### Proceso de Bootstrap e Inicialización
El orden de carga en el evento `window.load` es estricto:
1.  **`Engine`**: Registra PixiJS y crea el canvas.
2.  **`UIManager`**: Une los elementos del DOM (HTML) con los callbacks de lógica.
3.  **`WorldManager`**: Inicializa el contenedor `world` de PixiJS.
4.  **`CampaignCore` / `InputManager` / `LevelManager`**: Se inyectan las referencias cruzadas.
5.  **Carga de Nivel**: El `LevelManager` lee el primer nivel de `LEVELS` y puebla el mundo.

### El Bucle Principal (The Main Loop)
`main.js` define dos callbacks críticos para el motor:
- **`game.onUpdate(dt)`**: Se ejecuta en cada frame. Recorre todos los managers para actualizar posiciones, procesar la IA y verificar condiciones de victoria. Separa la lógica de los FPS mediante el `dt`.
- **`game.onDraw(ctx)`**: Dibuja elementos sobre el `uiCanvas` (Canvas 2D nativo). Esto se usa para elementos que cambian cada frame pero no necesitan la complejidad de un objeto Pixi, como las líneas de ataque del ratón.

---

## 2. Directorio `src/core`: La Infraestructura

### [engine.js](file:///c:/Users/jp_va/Documents/Proyecto%20hormiga/src/core/engine.js)
Es el motor gráfico basado en **PixiJS v8**. Su función principal es inicializar el entorno de WebGL y gestionar el ciclo de vida del renderizado.

**Características Clave:**
- **Sistema de Capas**: Organiza visualmente el juego en contenedores (`PIXI.Container`) para manejar el orden de profundidad (z-index):
  - `layerNodes`: Fondo, túneles y bases.
  - `layerUnits`: Las hormigas/unidades en movimiento.
  - `layerVFX`: Efectos visuales como láseres y chispas.
  - `layerMenu`: Interfaz de usuario de Pixi.
- **Canvas Dual**: Utiliza un canvas de WebGL para el juego y un canvas 2D auxiliar (`uiCtx`) para elementos de interfaz ligeros que requieren dibujo tradicional.
- **Adaptativo**: Incluye un `_resizeHandler` que ajusta el tamaño del canvas y escala el mundo proporcionalmente cuando se cambia el tamaño de la ventana.

```javascript
// Ejemplo de cómo se organizan las capas en el constructor
this.layerNodes = new PIXI.Container();
this.layerUnits = new PIXI.Container();
this.world.addChild(this.layerNodes);
this.world.addChild(this.layerUnits);
```

### [logic_grid.js](file:///c:/Users/jp_va/Documents/Proyecto%20hormiga/src/core/logic_grid.js)
Implementa un **Spatial Hash Grid** (Grilla de Hash Espacial). Es una optimización crítica para el rendimiento.

**¿Por qué es necesario?**
Cuando tienes cientos de hormigas, comprobar la colisión de cada una contra todas las demás es costoso ($O(N^2)$). Esta grilla divide el mundo en celdas cuadradas, permitiendo que cada unidad solo busque "vecinos" en su celda y las adyacentes.

- `insert(unitIndex, x, y)`: Registra una unidad en una celda específica.
- `findNear(x, y, radius, outArray)`: Devuelve rápidamente los índices de las unidades cercanas.

---

## 3. Directorio `src/data`: Definición del Mundo

### [levels.js](file:///c:/Users/jp_va/Documents/Proyecto%20hormiga/src/data/levels.js)
Contiene un array de objetos que definen cada misión. Una de las innovaciones de este proyecto es el uso de **coordenadas porcentuales (0.0 a 1.0)**.

**Ventajas de este diseño:**
- El mapa es totalmente responsivo. Si la pantalla es 1920x1080 o 800x600, los nodos mantienen su posición relativa.
- Facilidad para definir mecánicas complejas como:
  - `waterSweeps`: Mareas que barren el nivel.
  - `lightSweeps`: Rayos solares que resetean nodos.
  - `barriers`: Muros físicos que las unidades deben rodear.

**Ejemplo de definición de nivel:**
```javascript
{
    name: "Nivel 5: La Hoja Flotante",
    nodes: [
        { id: "p1", x: 0.1, y: 0.5, owner: 'player', type: 'gigante' },
        { id: "hoja_movil", x: 0.35, y: 0.5, isMobile: true, orbitRadiusX: 0.13 }
    ],
    hazards: [
        { x: 0.35, y: 0.5, radius: 0.12, dps: 6, shape: "puddle" }
    ]
}
```

---

## 4. Directorio `src/campaign`: Meta-juego y Persistencia

### [campaign_core.js](file:///c:/Users/jp_va/Documents/Proyecto%20hormiga/src/campaign/campaign_core.js)
Es el orquestador. Conecta la lógica del mapa, los visuales y el estado de guardado.

### [state_manager.js](file:///c:/Users/jp_va/Documents/Proyecto%20hormiga/src/campaign/state_manager.js)
Se encarga de la persistencia. Guarda en qué nivel se encuentra el jugador, qué facción eligió (Jugador Azul, Hormigas de Fuego, etc.) y si ha completado misiones, usualmente utilizando `localStorage`.

### [map_logic.js](file:///c:/Users/jp_va/Documents/Proyecto%20hormiga/src/campaign/map_logic.js) y [map_visuals.js](file:///c:/Users/jp_va/Documents/Proyecto%20hormiga/src/campaign/map_visuals.js)
- **Logica**: Genera la estructura de nodos del mapa de campaña (rutas, conexiones).
- **Visuales**: Renderiza el mapa usando PixiJS, gestionando los iconos de los niveles y las líneas que los conectan.

---

## 5. Directorio `src/entities`: Los Actores del Campo

### [node.js](file:///c:/Users/jp_va/Documents/Proyecto%20hormiga/src/entities/node.js)
El Nodo es el objetivo táctico. No es solo un círculo estático; es una entidad compleja con lógica de combate y evolución.

**Tipos y Evoluciones:**
- **Tipos Base**: `normal`, `enjambre` (más regeneración), `gigante` (más capacidad) y `tunel` (conexión rápida).
- **Sistema de Evolución**:
  - **Espinoso**: Un aura defensiva que elimina unidades enemigas cercanas de forma determinista (cada 0.15s).
  - **Artillería v2**: Dispara proyectiles de ácido en parábola con daño de área (*splash damage*).
  - **Tanque**: Las unidades nacidas aquí tienen triple potencia de combate (`power: 3`).

**Lógica de Combate Visual:**
- Gestiona las **chispas de batalla** (`sparks`) que saltan cuando hay conflicto dentro del nodo, indicando visualmente quién tiene la ventaja mediante colores.

```javascript
// Ejemplo de sistema de Artillería v2
_applySplashDamage(cx, cy, splashR, grid, allUnits) {
    // Máximo 8 bajas por disparo para mantener el balance
    const MAX_KILLS = 8;
    // El daño es más probable en el centro del impacto que en los bordes
    if (Math.random() < 0.55 - distanceFactor * 0.45) {
        unit.pendingRemoval = true;
    }
}
```

### [unit.js](file:///c:/Users/jp_va/Documents/Proyecto%20hormiga/src/entities/unit.js)
Representa a una sola hormiga. Su movimiento no es lineal, sino que sigue un **comportamiento de 3 fases**:
1. **Vuelo Directo**: Corre hacia el nodo destino.
2. **Aproximación Envolvente**: Al acercarse, busca su "ángulo personal" para no amontonarse en un solo punto.
3. **Órbita**: Una vez dentro, gira suavemente alrededor del centro del nodo.

**Física y Separación:**
- Implementa una fuerza de **separación suave** entre unidades cercanas para evitar solapamientos feos, creando un efecto de "enjambre" natural y fluido.

---

## 6. Directorio `src/managers`: Lógica y Simulación

### [world_manager.js](file:///c:/Users/jp_va/Documents/Proyecto%20hormiga/src/managers/world_manager.js)
Es el "contenedor maestro". Su responsabilidad es:
- Gestionar las listas de todas las unidades, nodos, zonas y peligros (*hazards*).
- **Generación de Texturas**: Crea dinámicamente los sprites de las hormigas basándose en los colores de la facción (usando `PIXI.Graphics` para generar texturas en tiempo de ejecución).
- **Simulación de Menú**: Gestiona las "Menu Ants" que reaccionan al cursor en la pantalla principal.

### [physics_manager.js](file:///c:/Users/jp_va/Documents/Proyecto%20hormiga/src/managers/physics_manager.js)
Se encarga de las leyes físicas del mundo:
- **Colisiones con Barreras**: Implementa la lógica de la "Fortaleza de Cristal" (Nivel 9), donde las unidades chocan contra muros a menos que viajen dentro de un nodo móvil (*ferry*).
- **Peligros Ambientales**: Gestiona el daño por charcos de insecticida y las mareas de agua.
- **Túneles Logísticos**: Dibuja y gestiona las conexiones visuales y el bono de velocidad entre nodos aliados.

### [combat_manager.js](file:///c:/Users/jp_va/Documents/Proyecto%20hormiga/src/managers/combat_manager.js)
El cerebro matemático de la guerra.
- **Intercambio 1v1**: Las unidades se eliminan entre sí en base a su `power`. 
- **Bonificación por Superperioridad**: Si una facción supera masivamente a otra (más del doble), recibe un bono de daño adicional para limpiar el nodo rápidamente.
- **Sistema de Conquista (El Anillo)**: Gestiona el progreso de captura del nodo. Si una facción enemiga domina el área, un anillo de color comienza a completarse hasta que el dueño del nodo cambia.

### [ai_manager.js](file:///c:/Users/jp_va/Documents/Proyecto%20hormiga/src/managers/ai_manager.js)
Es uno de los archivos más extensos y complejos. Implementa una IA jerárquica que escala no por "trampas", sino por **capas de conciencia**.

**Niveles de Inteligencia:**
- **Medium (Easy/Normal)**: Conciencia básica de tipos de nodo y ratios de tropas.
- **High (Normal+)**: Añade conciencia estratégica (momentum, chokepoints).
- **Expert (Hard)**: Inteligencia de enjambre (ataques coordinados multi-facción en pinza).
- **Master (Brutal)**: Conciencia de peligros ambientales, flanqueo letal y *back-capping* (capturar la retaguardia del jugador cuando este avanza).

**Características avanzadas:**
- **Simulador Predictivo**: Antes de atacar, la IA simula la batalla mentalmente para evitar ataques suicidas.
- **Perfilado del Jugador**: Detecta si el jugador está jugando de forma defensiva ("turtle") o agresiva para adaptar su contraestrategia.
- **Hazard Awareness**: En niveles con insecticida o rayos solares, la IA evita deliberadamente esas zonas o sincroniza sus ataques con los tiempos de calma.

### [audio.js](file:///c:/Users/jp_va/Documents/Proyecto%20hormiga/src/managers/audio.js)
**Audio 100% Procedural**:
- Este módulo es una joya técnica. No utiliza archivos `.mp3` ni `.wav`. Todo el sonido se genera en tiempo real sintetizando ondas senoidales y cuadradas mediante la **Web Audio API**.
- **Música Ambiental**: El generador musical adapta su BPM y escala melódica según el nivel y el tema (Menú vs Batalla).

### [input_manager.js](file:///c:/Users/jp_va/Documents/Proyecto%20hormiga/src/managers/input_manager.js)
Gestiona la interacción híbrida (Teclado/Ratón y Táctil).

- **Gestos Táctiles**: Soporta *Pinch-to-zoom*, pulsación larga para crear túneles y gestos de arrastre para ataques rápidos.
- **Interacción contextual**: 
    - Clic izquierdo: Selección y ataque.
    - Clic derecho: Gestión de túneles logísticos y retiradas.
    - Doble clic: Abre el menú de **Evolución** del nodo.
- **Cámara**: Gestiona el movimiento (pan) y zoom suave dentro del espacio infinito de PixiJS.

### [ui_manager.js](file:///c:/Users/jp_va/Documents/Proyecto%20hormiga/src/managers/ui_manager.js)
Controla el DOM y la interfaz superpuesta al juego.
- **Gestión de Estados**: Alterna entre el Menú Principal, la Selección de Facciones, el Mapa de Campaña y la HUD de juego.
- **Tooltips Dinámicos**: Muestra información en tiempo real sobre la población de cada facción dentro de un nodo al pasar el cursor.

---

## 7. Directorio `src/systems`: Mecánicas Ambientales

### [water_sweep.js](file:///c:/Users/jp_va/Documents/Proyecto%20hormiga/src/systems/water_sweep.js)
Gestiona la **Marea Barriente**. Funciona en dos espacios:
1. **Espacio de Mundo**: Una barra física renderizada en Pixi que colisiona con las unidades.
2. **Espacio de Pantalla (HUD)**: Un indicador visual en el borde izquierdo que avisa al jugador mediante pulsaciones de luz justo antes de que llegue la ola.

### [light_sweep.js](file:///c:/Users/jp_va/Documents/Proyecto%20hormiga/src/systems/light_sweep.js) y [intermittent_barrier.js](file:///c:/Users/jp_va/Documents/Proyecto%20hormiga/src/systems/intermittent_barrier.js)
- **LightSweep**: Rayos solares que resetean los nodos a estado neutral.
- **IntermittentBarriers**: Muros holográficos que aparecen y desaparecen cada pocos segundos, forzando al jugador a cronometrar sus movimientos.

---

## 8. Análisis de Conectividad: "El Rastro de una Hormiga"
¿Qué ocurre exactamente cuando el jugador interactúa? Aquí el rastro de conectividad:
1.  **`input_manager.js`** detecta un `pointerup` sobre un nodo destino.
2.  Llama a `world.sendUnits()`, que cambia el estado de las entidades en la capa `layerUnits`.
3.  El **`physics_manager.js`**, en su loop constante, detecta la nueva trayectoria y comienza a aplicar el movimiento por píxeles hacia el destino.
4.  Si hay un muro, el **`logic_grid.js`** permite que la unidad encuentre "aire" a su alrededor para rodearlo.
5.  Si hay un enemigo en el camino, el **`combat_manager.js`** detecta la cercanía (usando la grilla de hash) y resta vida a ambos basándose en su `power`.
6.  Al llegar al nodo destino, el **`node.js`** recibe la unidad y el **`combat_manager.js`** actualiza el equilibrio de fuerzas para decidir quién captura el nodo.

---

## 9. Filosofía Técnica y Optimización
El proyecto ha sido construido con tres pilares fundamentales que garantizan su calidad profesional:

1.  **Determinismo**: El daño y las capturas son matemáticamente exactos. No se usa `Math.random()` para el combate crítico, asegurando que la estrategia del jugador sea la que gane, no la suerte.
2.  **Zero-Allocation (Evitar el GC)**: En el bucle de combate, se reutilizan arrays y buffers. Esto evita que el recolector de basura de JavaScript cause tirones al procesar miles de bajas por segundo.
3.  **Arquitectura Modular**: Los sistemas climáticos (sweeps) son totalmente independientes. Se pueden añadir nuevas mecánicas simplemente creando un nuevo archivo en `src/systems` e inyectándolo en el `LevelManager`.
