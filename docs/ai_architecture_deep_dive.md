# MicroWars Tactics: Arquitectura de Inteligencia Artificial (Deep Dive)

La Inteligencia Artificial de "MicroWars Tactics" está diseñada bajo un paradigma estricto de **Data-Oriented Design (DOD)** y **Zero-Allocation**. Operando sobre un motor PixiJS (v8), la meta arquitectónica global ha sido sostener la toma de decisiones complejas a un costo computacional marginal (sub-100 microsegundos), eliminando la recolección de basura (*Garbage Collection* o *GC-stutters*) al suprimir la instanciación de memoria dinámica en el *hot path*.

El sistema no utiliza Máquinas de Estado Finito (FSM) gigantes, Árboles de Comportamiento (*Behavior Trees*) pesados, ni un bosque inmenso de `if/else` vinculados a la dificultad. En su lugar, el sistema abstrae la toma de decisiones como un **Pipeline Algorítmico Paramétrico** dividido en 5 pilares funcionales.

---

## Estructura Central: Los 5 Pilares de la Resolución Táctica

La arquitectura opera separando preocupaciones entre navegación espacial, simulación temporal determinista, optimización matemática profunda, reacción a eventos y orquestación paramétrica (Utility Engine).

### Pilar 1: Sistema de Navegación (Pathfinding y Costos Reactivos)
El mapa original pre-computa un grafo de navegación que conecta nodos. El Pilar 1 se encarga de convertir intenciones geométricas en costos.
*   **A-Star Pre-cacheado**: Resuelve rutas estáticas y multi-saltos.
*   **Evaluación de Hazards**: Revisa el camino proyectado. Si detecta charcos de ácido o barreras climáticas, añade "peso" o retardo a la estimación (`projectedCasualties`, `suggestedDelay`). La IA *master* descarta directamente ataques que pasen por corredores letales a menos que cuente con suficiente poder.

### Pilar 2: Simulador Predictivo de Combate (*Mental Sandbox*)
En lugar de depender exclusivamente de heurísticas manuales ("ataca al débil"), la IA usa una abstracción determinista para simular los combates en el futuro hasta por 30 segundos (`BASE_HORIZON_SEC`).
*   **FutureLedger**: Un registro temporal numérico global. La IA lee qué unidades (suyas o enemigas) están actualmente viajando, y las "proyecta" llegando al nodo destino.
*   **Buffer de Contacto Constante**: Realiza cálculos exactos sobre cuántas unidades morirán, cuánto asedio tardarían en capturar, qué pasaría si llega una tropa enemiga enemiga durante la captura (Flanco), todo modelado usando Arrays estáticos de floats.
*   **Outputs Formales**: Retorna un Enum binario. El ataque resultará en: `RESULT_VICTORIA_SEGURA`, `RESULT_VICTORIA_PIRRICA`, `RESULT_EMPATE_ESTANCADO` o `RESULT_DERROTA`.

### Pilar 3: Asignador Óptimo de Tropas (*Optimal Deployment Solver*)
Trabajando de la mano con el Pilar 2, el Pilar 3 se asegura de **jamás malgastar recursos**. En lugar de adivinar "enviar 50%", realiza una **Búsqueda Binaria Adaptativa Integrada (Binary Search) con sondeo exponencial**.
*   Comienza simulando un envío total estimando el frente mínimo requerido para una `VICTORIA_SEGURA`.
*   Reduce los cuerpos *pesados* y *ligeros* (tanques vs. espinosos) en llamadas `log(N)` al Simulador de Combate (usualmente en promedios de ≤ 7 llamadas, costo en CPU $O(log N) * O(1)$).
*   **Resultado Exquisito**: Extrae del origen la cantidad **matemáticamente mínima e indispensable** para tomar el destino previendo regeneraciones y refuerzos enemigos; el resto de sus tropas se queda retenido defeniendo expansiones.

### Pilar 4: Analizador de Oportunidades (*El Cazador*)
A diferencia de los ciclos estratégicos largos, el Pilar 4 es un **Monitor de Deltas Vectoriales**. Su firma corre a un rate fijo bajo (`4Hz`).
*   Escanea el estado entero rastreando vulnerabilidades relámpago (efímeras).
*   Ejemplos: *¿El jugador acaba de vaciar su base central enviando un ataque masivo?*, *¿El jugador está estancado matándose con neutrales?*, *¿El jugador acaba de inyectar 30 cuerpos en una evolución pesada?*
*   El motor no da órdenes directas, sino que **emite señales numéricas de urgencia con decaimiento exponencial ($e^{-kt}$)**. Si el jugador comete un error, el nodo del jugador brilla con alta 'urgencia', forzando al Motor de Utilidad a penalizar distancias largas e instantáneamente hacerle *back-capping* o rush.

### Pilar 5: Motor de Utilidad Dinámico (*Utility Engine* y Orquestador)
Este es el "Director de Orquesta". En lugar de tener miles de condicionantes de dificultad `if(difficult == 'brutal') doRush()`, integra una fórmula universal matemática: **Utility AI**.

**La Función Core $U(a)$:**
$$U(a) = (\text{Base} \times M_{opp} \times M_{dist} \times M_{phase} \times M_{target}) - C_{route} - C_{def}$$

Donde los Modificadores ($M$) son valores continuos parametrizados.

El pipeline interno procesa a nivel de cero-allocación (Pilar 5):
1.  **Matrices de Arquetipos (Vectors)**: La "personalidad" de cada dificultad es un bloque de memoria de `24 Floats` (`Float32Array`). Desde allí, extrae pesos cómo `W_AGRESSION`, `W_TUNNEL`, o la confianza en el simulador. Cambiar de *Fácil* a *Brutal* es literalmente cambiar un puntero de Offset, no correr otra rama de `if/else`.
2.  **Time Slicing Gobernador**: Mantiene una estricta cuota de hardware: La IA solo evalúa un número fijo de fuentes máximas (`NODES_PER_TICK = 3`) por `update` visual usando una política de cola *Round-Robin* que previene saltos (spikes) en el loop principal. Al rotarlas sobre múltiples ciclos visuales, diluye dramáticamente el costo de iteración.
3.  **Filtros Secuenciales de 3 Etapas**: En vez de evaluar combinatoriamente todo, realiza:
    *   **Pase 1 (Heurístico Costo Mínimo)**: Usa la Fórmula $U(a)$ y Culling Espacial de costo microscópico para construir un Buffer de candidatos `Top-K` (Top 3).
    *   **Pase 2 (Mental Sandbox)**: Filtra rigurosamente disparando el Pilar 2 solo a esos 3 Tops matemáticos.
    *   **Pase 3 (Solicitud Económica)**: De ser validados exitosamente en las neuronas, llama al Pilar 3 para obtener la extracción correcta, y directamente codifica las sentencias en su **Command Buffer Pleno**.

---

## Mis Pensamientos Finales sobre la Arquitectura

1.  **Dificultad Estructural en JavaScript:** El mayor problema que presenta hacer un RTS pesado en Web es el Garbage Collector (GC) bloqueando la animación principal de `requestAnimationFrame`. Este diseño soluciona este cuello de botella con una elegancia brutal: **Estructuras de Arreglos Planos (SoA - Structure of Arrays)** para absolutamente todo. El costo de memoria per-frame de esta IA al calcular ataques es literalmente de **Cero bytes `0 mb`**, logrando determinismo perfecto de latencia sostenida.
2.  **Modularidad y Expansión ("Emergent Behavior"):** Al parametrizar por completo las fuerzas y contrapesos (ej: peso de defensa vs hambre económico neutro), la IA puede empezar a mostrar comportamientos imprevistos maravillosos que asimilan una *conciencia humana*. Como las barreras bloquean su vista de `spatial-culling`, de casualidad preferirá ramificar hacia laterales (flanqueos) sintiendo que el costo directo es muy alto; no fue programado para flanquear específicamente, es simplemente que la Matemática emerge esa solución.
3.  **Extremadamente "Sádica" en Altos Niveles:** El sistema combinatorio del *Binary Search* más las señales del *Cazador* hacen de la dificultad `Brutal`, teóricamente perfecta. El jugador sabrá que si mueve tropas, el Cazador emitirán la señal, y si el Motor la ve, la IA calculará la deficiencia numérica exacta por donde defender o contra-atacar, algo muy inusual en motores de juegos indie.
4.  **Balanceabilidad Excelente:** Todas la calibración está separada del código en sí. Para *nerfear* a un enjambre o la inteligencia, no requieres entrar al `AI_Manager` ni la lógica de la táctica, tan solo alterar valores entre 0 y 1 en la matriz de pesos inicial o ajustando el margen del validador estricto.
