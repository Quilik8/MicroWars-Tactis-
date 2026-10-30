# Rendimiento de la campaña automática v5

## Medición actual

Evidencia: `evidence/campaign/performance-v5.json`. Script: `node tools/campaign-performance.cjs`, servidor local en 5173. Edge headless, 1280×720, WebGL por software SwiftShader. Es una referencia local de CPU/DOM, no una promesa de FPS ni una medición GPU en dispositivos reales. Los informes `performance-before.json` y `performance-after.json` pertenecen a la revisión anterior con RTS y se conservan como históricos.

| Operación | Mediana | P95 / máximo observado |
|---|---:|---:|
| Render sin cambiar mundo | 11,5 ms | 13,4 ms |
| Actualizar escena modificada | 17,4 ms | 29,2 ms |
| Selección | 14,5 ms | 90,7 ms |
| Cámara | 7,6 ms | P95 10,7; máximo 32,9 ms |
| Guardado local | 10,9 ms | 13,9 ms |
| Crear atlas/campaña de 300 | 1.610 ms | 1.995 ms |
| Ronda densa, solo lógica | 44,3 ms | 107,6 ms |

Muestras: 12 renders, 6 escenas modificadas, 12 selecciones, 50 cambios de cámara, 12 guardados y 3 creaciones. Ronda densa: 32 ejércitos iniciales, seis rondas, 22 combates y una irrupción. Se añaden fuerzas a posiciones legales únicamente para medir carga; no es una partida de equilibrio. La medida de ronda excluye DOM, almacenamiento y pausas de presentación.

En dos segundos de reposo se observaron 5,58 ms de tareas y 1,71 ms de script. El ticker del RTS está detenido tanto en jardín como durante la resolución automática. El SVG observado contiene aproximadamente 2.563 elementos. No hay simulación táctica oculta consumiendo CPU continuamente.

## Decisiones aplicadas

- La campaña usa un motor abstracto independiente del RTS y no crea sus unidades durante encuentros estratégicos.
- La cola solo programa trabajo cuando hay acciones pendientes; la vista en reposo no reconstruye el jardín continuamente.
- Polígonos y decoración se conservan entre selecciones y pasos. Cambian marcadores, fronteras, rutas y ficha cuando procede.
- La geografía solo se reconstruye por nueva campaña, idioma o cambios estructurales como una capital arruinada.
- La resolución avanza por pasos guardables y admite presentación acelerada/movimiento reducido.
- PixiJS se sirve localmente, conservando las optimizaciones previas de escaramuza.

## Límites observados

El coste habitual es razonable para un prototipo por turnos; no se declara optimización completa. Crear el mundo sigue siendo una tarea síncrona de aproximadamente 1,6 segundos en este entorno. El botón muestra un estado de preparación antes de empezarla. Selecciones y cambios de cámara tienen picos; sería útil medir en un móvil real antes de fijar objetivos de fluidez. Una siguiente optimización justificada por esas mediciones puede trasladar la generación a un worker y reducir trabajo de layout.

El informe actual verifica que el RTS permanece parado; no vuelve a certificar su rendimiento en combate táctico. Las mediciones RTS anteriores son históricas. Evaluar cada futura plantilla de nodos, su IA y sus unidades continuará siendo necesario.
