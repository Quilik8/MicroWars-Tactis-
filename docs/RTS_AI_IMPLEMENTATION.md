# Revisión de actividad y dificultad de la IA del RTS

La ruta de producción utiliza `AIManager.updateAll` y `RTSAIRuntime`. Esta revisión afecta al RTS de nodos en todos los sectores activos. La campaña conserva su sistema independiente.

La implementación técnica está preparada para revisión humana. **Las comprobaciones automáticas no certifican diversión, equilibrio ni dificultad jugable.** No se abrió ningún navegador, no se controló el juego y no se realizaron partidas del agente. Se inspeccionaron los datos y se ejecutaron pruebas de funciones, decisiones sobre estados fijos y contrastes aislados con la simulación física.

## Qué cambió y por qué

1. **Respuesta táctica independiente.** Defender, evacuar, expandirse o explotar una posición expuesta no requiere completar un pronóstico del worker. Un cálculo pendiente y un grupo esperando una compuerta permiten atender otro frente.
2. **Reservas por unidades concretas.** Una orden conserva referencias a sus hormigas; no toma prestado otro grupo al ejecutarse. Una defensa puede cancelar salidas ofensivas pendientes. Los destinos de las hormigas que ya viajan permanecen iguales. La inversión evita grupos reservados.
3. **Propósito antes que un filtro universal.** Conquista, defensa, disputa, explotación, evacuación y reagrupación tienen comprobaciones distintas. Conservar diez segundos dejó de ser un requisito de todas las decisiones. La referencia física conserva ese valor por defecto para las comparaciones antiguas; la ruta de producción solicita explícitamente cero segundos de conservación obligatoria.
4. **Prioridad por situación.** Se clasifican amenazas y oportunidades de todos los orígenes disponibles, se preseleccionan hasta tres candidatos y se rota la exploración para no insistir indefinidamente en el mismo objetivo imposible. La defensa tiene prioridad sobre conquistas ordinarias; la evacuación militar considera si puede llegar socorro.
5. **Dificultad por coordinación.** Los modos comparten reglas y predicción del terreno. Cambian la coordinación, los frentes, las alternativas rivales y la frecuencia de revisión. No se añadieron ventajas ocultas de tropas, producción, daño o información.
6. **Esperas explicables.** Cada facción informa si carece de tropas, tiene fuerzas comprometidas, acumula para un objetivo, espera terreno, invierte, no encuentra utilidad o agotó su presupuesto. Las esperas incluyen destino, fuerza requerida o hora de apertura cuando corresponde.

El menú transmite `easy`, `normal` o `hard` a `AIManager.setDifficulty`; al seleccionar nivel se aplica la dificultad guardada. Cambiarla libera reservas futuras y reinicia el perfil sin redirigir viajeros. Los diagnósticos muestran el modo efectivo de cada facción.

## Arquitectura y contratos

`TacticalObservation` construye índices de fuerzas presentes, unidades disponibles y llegadas separadas por facción. La observación se comparte y se reutiliza como máximo 0,1 segundos. Las propias órdenes del ciclo se incorporan como compromisos; otra IA no obtiene acceso a órdenes futuras por su posición en el bucle. El comienzo del reparto de trabajo rota entre facciones.

`TacticalDecision` contiene propósito, objetivo, grupos, dependencias, instante de planificación, acontecimiento observado, vencimiento, previsión y estado. Las decisiones distinguen preparación, espera, envío, disputa, finalización y cancelación. El historial conserva órdenes y consecuencias observadas.

`ForecastRequest` identifica el objetivo ambiguo, sus dependencias y su vencimiento. Las predicciones físicas usan copias aisladas mediante `WorldSnapshot`, `forecastOperation` y los gestores compartidos. El worker conserva sus límites de solicitudes y memoria; si no existe, el generador avanza por cuotas en el hilo principal. No se reescribió la física.

El pronóstico físico puede autorizar una operación ambigua si termina dentro de su ventana y sigue siendo válido. Las órdenes ordinarias tienen un margen de preparación de 0,35 segundos. Los transportes usan ventanas explícitas del calendario orbital; su espera no aumenta para compensar un cálculo lento. Una respuesta tardía se descarta y se contabiliza; no bloquea otras órdenes. Un resultado parcial no se interpreta como victoria ni derrota.

Las dependencias se revisan por origen y destino. La producción normal y la evolución que ya figuraba en el calendario no cancelan automáticamente un resultado. Un cambio militar nuevo, recursos consumidos, una relación incompatible o una ventana caducada sí impiden ejecutar la orden. Las salidas demoradas se vuelven a validar.

`issueTroopOrder` continúa siendo la validación compartida de existencia, identidad, cantidad, origen y paso físico. `DecisionTrace` es opcional. Los registros normales están acotados: 64 entradas tácticas, 128 latencias y 600 muestras de CPU; la caché profunda mantiene hasta 16 resultados. No se transmite telemetría automáticamente.

Se corrigió también la mezcla de configuración sector/nivel para conservar overrides de dificultad anidados por facción. La personalidad del escenario permanece separada de los límites de coordinación.

## Predicción y límites de confianza

La vía rápida calcula ventanas de salida, llegada y bajas, con composición ligera/pesada. Recorta los segmentos por contornos reales de charcos, anillos, elipses, islas, refugios y superficies de velocidad. Un charco estrecho no desaparece entre muestras uniformes. El veneno utiliza un presupuesto compartido de bajas; no se multiplica su daño por cada hormiga. Los márgenes de dispersión que no puede justificar se remiten al análisis físico.

Las paredes permanentes prohíben la orden. Las compuertas permiten esperar una apertura calculada para el grupo. Agua, luz, defensas de densidad, ciertos destinos móviles y salidas de túnel conservan incertidumbre explícita y pueden necesitar el pronóstico físico. Los recorridos nunca inventan puntos intermedios fuera de nidos.

El modelo rápido de disputa mantiene las facciones separadas e incluye presentes, llegadas, producción, evolución y progreso de conquista. Utiliza pasos de 0,25 segundos y un horizonte acotado de hasta 60 segundos. Es una **estimación**, no una reproducción exacta de cada choque físico. Las hipótesis de refuerzo y contraataque son alternativas independientes y respetan las relaciones del escenario; no se suman como una alianza ficticia.

El contraste exacto con los gestores reales se conserva para terreno y composición. Se añadió un contraste del veredicto táctico en veinte aperturas controladas. Eso no demuestra precisión universal del modelo rápido, especialmente ante concentraciones, efectos combinados o cambios posteriores del jugador. Los casos ambiguos que agotan el plazo siguen apareciendo en el diagnóstico y necesitan valoración humana.

## Parámetros de dificultad

| Parámetro | Fácil | Normal | Difícil |
|---|---:|---:|---:|
| Respuestas tácticas por revisión | 1 | 2 | 3 |
| Orígenes por operación | 1 | 2 | 3 |
| Frentes ofensivos máximos | 1 | 2 | 3 |
| Alternativas rivales | Mantener | Reforzar | Reforzar o contraatacar |
| Etapas revisables de ruta | 1 | 2 | 3 |
| Revisión estratégica | 1,5 s | 1 s | 0,5 s |
| Separación entre rondas de emisión | 0,20 s | 0,12 s | 0,08 s |
| Objetivo p95 urgente | 500 ms | 350 ms | 250 ms |
| Objetivo p95 habitual | 750 ms | 600 ms | 500 ms |

Los máximos no obligan a dividir un ejército pequeño ni a atacar sin utilidad. Una ruta de varias etapas solo aparece si la geografía requiere nidos intermedios reales; no autoriza saltárselos. Las preferencias y objetivos de escenario siguen influyendo en la puntuación.

La vía táctica tiene un presupuesto objetivo de 1,2 ms por llamada, y el análisis profundo recibe inicialmente 0,65 ms, dentro del límite general de 4 ms. Se comprueba el reloj entre candidatos y facciones. Una función en curso y la recolección de basura pueden exceder ese límite: no es una garantía de tiempo real. El reparto rotatorio evita relegar permanentemente una facción cuando se acaba el presupuesto.

## Comprobaciones reproducibles

Desde la raíz del proyecto:

```text
npm run test:rts-ai
npm run evaluate:rts-ai
```

La batería reúne 92 pruebas: reglas físicas, aislamiento, veneno, superficies, agua, luz, compuertas, túneles, movilidad, composición, tres facciones, más de 32 nidos, identidad de órdenes y transporte del worker; además de actividad en los tres modos, oportunidad expuesta, defensa, evacuación militar, refuerzo tardío, preempción de reservas, frentes simultáneos, producción normal, dificultad anidada y alternativas rivales permitidas. Los escenarios tienen órdenes o cambios de estado programados; no son partidas autónomas.

La auditoría recorre los 31 niveles de los seis sectores importados por el catálogo, en los tres modos. Ejecuta veinte llamadas de decisión sobre cada apertura fija: no avanza movimiento, combate ni producción de la partida. Incluye mecánicas combinadas según los datos del nivel. El archivo `sector7.js` existe pero no está importado por el catálogo activo; no se habilitó como efecto de esta revisión.

Se miden también sesenta oportunidades programadas —veinte semillas por dificultad— y estados de aproximadamente 1.000, 5.000 y 10.000 unidades con seis facciones. La auditoría de catálogo utiliza los presupuestos normales y la alternativa del hilo principal disponible en Node; la carga extrema aísla la vía táctica. El trabajador real se verifica en la batería de pruebas. No hay medición de renderizado, GPU ni rendimiento del navegador en esta revisión.

<!-- BEGIN_ACTIVITY_AUDIT -->
Medición 2026-10-29T22:16:43.821Z, AMD A8-6410 APU with AMD Radeon R5 Graphics, v24.14.0, win32. Incluye arranque y pausas del proceso. No representa una partida ni una medición de navegador.

| Carga | p50 ms | p95 ms | p99 ms | Máximo ms |
|---|---:|---:|---:|---:|
| 93 aperturas; 1860 llamadas | 0,81 | 3,88 | 9,52 | 39,15 |
| 984 unidades; seis facciones | 1,52 | 5,45 | 8,24 | 8,24 |
| 4992 unidades; seis facciones | 1,69 | 5,74 | 8,43 | 8,43 |
| 9984 unidades; seis facciones | 1,54 | 7,48 | 11,99 | 11,99 |

Excluyendo las primeras cuatro llamadas de cada apertura, p95 2,91 ms. Se mantienen arriba los picos de arranque. Todas las facciones recibieron evaluación en los tres estados de carga. No se detectó doble asignación de unidades en la auditoría.

Latencia externa p95 del origen expuesto: fácil 50,00 ms, normal 50,00 ms y difícil 50,00 ms. Casos sin respuesta: 0 de sesenta. Son resultados de ese acontecimiento controlado, no garantías generales.

90 de 93 aperturas emitieron órdenes en la ventana de 0,475 segundos. Excepciones: sector-6, nivel 4: analysis_pending; sector-6, nivel 4: terrain_window. Las esperas se conservan con su motivo y hora de salida. Esto comprueba actividad inicial, no calidad de toda la partida.

El proceso terminó con 26.0 MiB de heap usado y 99.4 MiB de RSS. Se observaron 51 pausas de GC, p95 7,82 ms. Es memoria del proceso completo, incluida la construcción sucesiva de fixtures; no una medición de fuga ni memoria del juego.
<!-- END_ACTIVITY_AUDIT -->

El JSON completo se conserva en `docs/evidence/rts-ai/activity-audit.json` y la salida de pruebas en `docs/evidence/rts-ai/activity-tests.txt`. El objetivo anterior de 2 ms p95 no se declara cumplido universalmente: deben considerarse los arranques, los picos y la carga extrema, además del comportamiento en el equipo del jugador. Reducir el coste de las aperturas no sustituye medir una partida humana.

## Diagnóstico y exportación local

El diagnóstico por facción muestra dificultad, límites efectivos, visitas, órdenes, alternativas, hipótesis, motivos de descarte, inactividad, rutas, esperas ambientales y latencia observada. Se distinguen los tiempos agregados de observación, táctica, preparación, predicción y ejecución. La latencia registrada parte de lo observado por la IA; la auditoría del acontecimiento programado parte de un reloj externo y añade el retraso de observación. La espera ambiental se registra separada y no se confunde con tiempo de cálculo.

Para quien quiera adjuntar un registro durante su propia sesión, sin instalar nada:

```js
window.__rtsAI.diagnostics()
window.__rtsAI.exportDiagnostics()
```

La segunda llamada devuelve texto JSON local. El jugador decide si lo copia y comparte. No hay subida, envío ni recogida remota automática. El modo antiguo sigue disponible como referencia de desarrollo, no como requisito del nuevo planificador. Las herramientas anteriores que simulaban encuentros completos no forman parte del comando de evaluación de esta revisión.

## Revisión humana pendiente

Abrir manualmente el juego en [http://127.0.0.1:5173/](http://127.0.0.1:5173/) cuando el servidor local esté iniciado desde la carpeta del proyecto. Si hace falta iniciarlo: `python -m http.server 5173 --bind 127.0.0.1`.

Para comunicar un fallo bastan cinco datos:

| Campo | Ejemplo |
|---|---|
| Sector y nivel | Sector 2, nivel 3 |
| Dificultad | Normal |
| Situación observada | Mi ataque dejó otro origen casi vacío |
| Oportunidad desaprovechada | El rival tenía tropas, pero no intervino ni contraatacó |
| Momento aproximado | Alrededor de 00:40 |

Matriz para valorar ritmo y decisiones, sin exigir que el jugador mida milisegundos:

| Situación | Qué observar en los tres modos |
|---|---|
| Apertura | Expansión útil, sin acumular indefinidamente |
| Vaciar un origen | Respuesta a la exposición cuando exista una ruta viable |
| Ataque a una base propia | Defensa, contraataque o evacuación con una consecuencia comprensible |
| Conquista disputada | Intervención oportuna, sin oleadas pequeñas que solo alimenten pérdidas |
| Dos frentes | Otra fuerza actúa aunque haya una espera ambiental pendiente |
| Veneno y velocidad | Evita envíos condenados y progresa si existe una operación viable |
| Agua y compuertas | Espera una apertura y aprovecha los demás grupos |
| Luz, ferry y túneles | Mantiene utilidad al cambiar accesos, propiedad o destino real |
| Tres facciones | Aprovecha rivalidades y respeta las relaciones del escenario |
| Evolución | Invierte sin consumir una defensa reservada |

La aceptación jugable queda pendiente de esa valoración. Las etiquetas fácil, normal y difícil no se consideran equilibradas por el simple hecho de pasar pruebas automáticas.


## Ajuste de consolidación tras la valoración del jugador — 29 de octubre de 2026

La prueba humana confirmó más actividad y mejor ritmo, pero también abandono prematuro de capturas y posiciones. Se localizaron tres causas: los grupos llegados volvían al conjunto libre aunque todavía conquistaran; la reserva ordinaria podía ser una sola hormiga; y el riesgo de contraataque solo reducía utilidad cuando el origen producía más que el destino.

`sourceRetention` distingue el grupo que termina una captura, la reserva local y el excedente libre. Los recién llegados conservan su compromiso hasta que cambia realmente el propietario. Después pueden actuar los excedentes, sin una espera fija de diez segundos. Si la posición está perdida, una evacuación justificada puede liberar ese grupo.

La reserva de un frente parte de `minPostCaptureGarrison` del escenario y aumenta con enemigos presentes y llegadas observadas a ocho segundos, descontando refuerzos comprometidos. No es una prueba de resistencia contra todas las decisiones futuras del adversario. Los nodos interiores pueden liberar más fuerzas que los expuestos. El contraataque hipotético en difícil penaliza también el abandono de orígenes de igual valor.

Una superioridad numérica momentánea ya no basta por sí sola para ordenar retirada: se contrasta la supervivencia prevista y la llegada de socorro. La operación puede entrar en consolidación si ya cambió el propietario pero continúa bajo presión observada. Tanto la vía táctica como la salida de un pronóstico físico y las inversiones respetan el compromiso del origen.

Se añadieron once regresiones: captura en curso y actividad independiente en cada dificultad, mantenimiento del frente sin frenar el ataque, presión en tránsito más allá de la antigua ventana, retirada prematura, evacuación de una posición perdida, respeto del compromiso por la vía física y consolidación bajo presión. Los registros incluyen fuerza retenida y motivo: terminar captura, defender compromiso, controlar frente o liberar excedentes interiores. La valoración del desafío sigue correspondiendo al jugador.


## Entrega de evoluciones por función

La elección compara espinas por presión y cobertura de trayectos legales, artillería por objetivos dentro de alcance y tanque por inversión productiva. La preferencia del escenario añade prioridad sin imponer una compra inviable. La decisión conserva la comprobación de defensa y compromisos y aplica `minEvolutionGarrison` después del pago, incluyendo el redondeo de tropas pesadas. Si una alternativa no es pagable o segura se considera la siguiente. Los registros incluyen alternativas, motivo y reserva mínima. La cobertura es una heurística de segmentos legales, no una certificación de control de todos los movimientos futuros.

Esa entrega cubría únicamente evoluciones. La integración posterior de transporte y riesgo se describe a continuación; la aceleración permanece intacta.


## Integración de rutas, riesgo y transporte — 29 de octubre de 2026

Las rutas por origen conservan objetivo, etapas, tipo de conexión, destino efectivo, estimación temporal y requisitos de propiedad/calendario. Pueden empezar alejándose del adversario. Las regiones se calculan con paredes permanentes, excluyendo el ferry de los pasos terrestres estáticos. La caché se invalida por cambios geométricos. Se valoran articulaciones reales y portales entre regiones; un nodo junto a un corredor abierto no se convierte en puerta obligatoria. La valoración económica utiliza el intervalo real de producción, evitando tratar un túnel sin producción como una fábrica.

Las reagrupaciones requieren una continuación alcanzable y una mejora respecto a permanecer. Si el destino ya puede financiar su siguiente conquista, no se añaden tropas por rutina. El recuerdo por unidad impide regresar por la misma conexión de reagrupación si no cambió la propiedad que justificaba la ruta. Una defensa urgente puede actuar; la memoria no es una prohibición temporal universal. La protección se aplica también al fallback físico. Las tropas en tránsito no cambian de destino.

El veneno mantiene un presupuesto físico de daño compartido por las fuerzas expuestas. La evaluación rápida conserva límites de bajas y un valor intermedio orientativo, que no constituye una probabilidad calibrada. Cuando la diferencia entre los límites puede cambiar el veredicto, se consulta la simulación física con todos los participantes y peligros. Esto evita rechazar automáticamente una operación por cargar a cada grupo todo el daño posible. Los movimientos internos con pérdidas mayoritarias requieren otra alternativa; el pronóstico físico tampoco puede autorizarlos solo porque el destino conserve tropas propias.

El ferry usa la posición orbital compartida con la física. Se busca durante un ciclo, con 96 muestras geométricas y hasta tres ventanas de fases distintas. Se considera también el ahorro de trayecto expuesto a veneno, aunque el viaje resulte más lento; la caja de riesgo es solo un filtro de candidatos y no autoriza el embarque. El pronóstico valida el grupo y las condiciones de espera antes de emitir una orden. El embarque exige un destino posterior que abra acceso o mejore el recorrido. El objetivo se conserva en las tropas transportadas y se descarta si ya fue conquistado, dejó de ser atacable o su fuerza creció claramente por encima de la expedición mientras existe otra alternativa alcanzable que evaluar. Los registros distinguen embarque, viaje, desembarco y disputa de llegada. Una ventana caducada no bloquea otras operaciones; se puede evaluar una ventana posterior, sin inventar más demora de pensamiento.

Los portales del escenario tienen dos operaciones distintas: llegar a una entrada propia, que teletransporta al arribar, y activar una entrada con tropas estacionadas. Esta segunda acción se comparte con el doble clic del jugador. La conquista inicial de una entrada neutral no se confunde con conquistar la salida. Los contratos y resultados evalúan el destino efectivo; no se emite un traslado ilegal a través de la pared. Una activación sin continuación útil se rechaza para evitar viajes circulares.

Los enlaces logísticos comparten coste, descuento y pago por potencia con el jugador. La IA puede crearlos para alimentar una etapa propia de una ruta útil y retirarlos cuando cambia el objetivo o se pierde el destino. Las compras respetan reservas y no utilizan tropas comprometidas. Se evitan conexiones a ferris o destinos bajo ataque inmediato. La elección de evolución sigue comparando cobertura, alcance y producción, con reserva posterior al pago.

Se mantuvieron los presupuestos del coordinador. Las búsquedas por origen y las regiones reutilizan cachés; el worker sigue siendo único y acotado. Los cambios esperados de fase de una compuerta refrescan la observación sin cancelar un pronóstico que ya incluía ese calendario. Las salidas pendientes se revalidan ante la ventana real.

### Paso temporal y validación

Se detectó un error de precisión al comparar desembarcos con distintos pasos: el pronóstico imponía 1/30 s aunque la simulación avanzara con otro dt. Ahora WorldSnapshot conserva el paso observado y lo transmite al worker. El predictor utiliza ese paso y lo incorpora a su identidad de caché. Esto no modifica el ticker, los botones de velocidad, la física del juego ni la aceleración. El pronóstico supone que el paso observado continúa: no puede conocer una variación futura de FPS o una orden posterior del jugador.

Comandos adicionales:

```text
npm run evaluate:rts-transport
```

La evidencia está en `docs/evidence/rts-ai/transport-speed-audit.json`: veinte semillas por escenario de embarque, desembarco a través de una pared y peligros superpuestos, con pasos de ×1 y ×4. Se comparan órdenes programadas con gestores físicos reales; no son partidas autónomas. El umbral de revisión es dos unidades o el 5%, el mayor, en al menos diecinueve de veinte casos por escenario y velocidad. La salida conserva todos los errores, no solo el resumen.

`docs/evidence/rts-ai/strategic-transport-tests.txt` contiene la batería completa. El informe de aperturas de esta misma página conserva CPU p50/p95/p99, memoria y GC. Esa medición usa Node y no certifica rendimiento gráfico ni el presupuesto en todos los dispositivos. La calidad jugable queda pendiente de la revisión humana.

### Configuración y límites

Los parámetros de coordinación de los tres modos, diplomacia, objetivos, preferencias de evolución, descuentos y reservas gobiernan la ruta de producción. Los pesos históricos de `antiPendulum`, `focus` y políticas de peligro de UtilityEngine pertenecen a la referencia antigua: no deben ajustarse suponiendo que controlan este coordinador. La continuidad nueva usa objetivos, compromisos y memoria de movimientos. No se introdujeron bonificaciones ocultas ni dificultad adaptativa.

La selección regional y de evolución utiliza heurísticas explícitas; no garantiza una estrategia óptima. Las consultas físicas representan órdenes conocidas y el calendario registrado, no decisiones futuras de los rivales. El rechazo por incertidumbre o presupuesto debe seguir siendo visible en los registros. Una prueba automática aprobada no valida por sí sola la dificultad percibida.


### Cierre técnico de la integración

La batería cubre además la activación de portales desde el coordinador real, la evacuación inmediata por una salida propia segura, la revisión de un objetivo de transporte, la reversión de rutas tras un cambio de propiedad y el océano con doce nodos móviles. La búsqueda costosa de misión del ferry se realiza después de la preselección; si encuentra una consulta física válida, esta puede avanzar aunque se agote el análisis opcional. Los refuerzos nuevos en un destino cancelan una salida física pendiente cuando exceden la producción y las llegadas ya registradas. La producción normal y las llegadas conocidas se conservan como cambios esperados.

La predicción de nuevas órdenes reinicia el multiplicador de velocidad logística igual que la orden real; no interpreta como permanente el doble de velocidad de una unidad recién llegada de un enlace. Una activación instantánea a un portal propio sin peligros observados puede emitirse por la vía rápida, manteniendo la comprobación compartida de identidad y propiedad. Las salidas disputadas requieren simulación física.


La auditoría de aperturas dura 0,475 segundos de simulación por caso. Una espera de transporte o una consulta física pendiente puede superar esa ventana sin constituir un bloqueo; se registra también el trabajo pendiente y sus visitas. No se presentan esos casos como campañas resueltas. Los percentiles incluyen arranque y pausas del proceso. El presupuesto de 4 ms es cooperativo, comprobado entre trabajos, y puede excederse durante funciones indivisibles o GC; el objetivo de 2 ms p95 continúa siendo una meta de optimización, no una garantía alcanzada.


## Balance de espinas y contacto de guerreras

Espinas deja de eliminar 1 más el 20% de enemigos cada 0,15 s. Ahora reparte un punto cada 0,25 s: cuatro puntos por segundo por nodo, compartidos entre todas las facciones expuestas. Una hormiga pesada de potencia 3 requiere tres impactos de espinas. El daño parcial de espinas se conserva en la unidad y se serializa en el predictor y el worker. El alcance del aura permanece igual y no se cambia la aceleración.

El tanque no activa espinas: se confirmó que el combate normal incluía viajeros hasta 2,5 radios del centro, antes de su llegada. El recuento, el pago de daño de combate y la observación de IA ahora usan 1,5 radios, alineados con la llegada física. La mayor potencia de las guerreras sigue aplicándose durante el combate normal.

Pruebas aisladas: 300 hormigas mantenidas en el aura dos segundos reciben ocho bajas por espinas, excluyendo combate y otros peligros; la densidad no aumenta el presupuesto; una pesada resiste dos impactos y cae al tercero; un nodo tanque no mata por aura ni inicia combate desde la antigua distancia. La batería completa se conserva en `docs/evidence/rts-ai/thorns-balance-tests.txt`: 92 aprobadas.
