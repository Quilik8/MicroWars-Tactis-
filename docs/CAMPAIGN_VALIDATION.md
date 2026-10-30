# Validación — campaña automática v5

## Información sobre el mapa y turnos observados — 19/10/2026

Inspección manual del juego en navegador a 1280×720, 1920×1080 y 390×844, utilizando un frente controlado para aislar estados observados y ocultos. Arrastrar mostró «Habrá combate», fuerza propia / defensa y riesgo; soltar dejó «Ataque preparado» y la comparación sobre el destino. Un movimiento rival observado cambió la cámara, dibujó un recorrido y añadió una noticia con facción y región; el tiempo de lectura registrado fue de unos 1,25–1,3 segundos. La pausa mantuvo sin cambios el estado estratégico durante la observación. Un movimiento enteramente oculto mantuvo la cámara y las noticias sin cambios. Entrada en visión: origen nulo y destino conocido; salida: origen conocido y destino nulo, con avisos diferentes y sin trazar la parte oculta.

Revisión visual independiente a 1280×720 y 390×844: se corrigió contexto insuficiente de las etiquetas (defensa y emblema), se añadió lugar a la noticia y se hizo explícita la velocidad. Capturas reales: `map-attack-visible-1280.png`, `map-attack-visible-1920.png`, `map-attack-visible-mobile.png`, `rival-watch-1280.png`, `rival-watch-1920.png`, `rival-watch-mobile.png`. Esta revisión no vuelve a certificar la suite histórica ni el equilibrio de campañas completas.

## Revisión de apilamiento y combate — 19/10/2026

Inspección manual en navegador a 1280×720 y 390×844 con un frente controlado para aislar las interacciones. Se arrastró una formación sobre otra aliada, se ejecutó la orden sin combate y se prepararon dos ataques al mismo paso: 50 + 50 contra 60. Ambos ejércitos vencieron, ocuparon el destino y recibieron una victoria individual. El aviso pasó de riesgo alto (50/60) a ventaja de fuerza (100/60). Sin errores de ejecución observados. Capturas: `stacked-armies.png`, `coordinated-orders.png`, `coordinated-result.png`, `stacked-armies-mobile.png`. Esto no sustituye partidas completas de equilibrio. La suite de reglas anterior no se volvió a ejecutar en esta revisión.

## Resultado y reproducción anteriores

40 pruebas de reglas aprobadas. Prueba real de navegador aprobada en 1280×720, 1920×1080 y 390×844, sin errores de consola. Se conservan resultados en `evidence/campaign/tests-v5.txt`, `browser-report.json`, `performance-v5.json` y capturas del juego ejecutado. No se confunden las capturas de la propuesta HTML con el juego.

```powershell
npm run test:campaign
# Con servidor local en 127.0.0.1:5173:
node tools/campaign-browser-check.cjs
node tools/campaign-performance.cjs
node tools/campaign-evaluate.mjs
npm run build
```

## Cobertura de reglas

- Atlas de 50/300/400/500: conexiones físicas secas recíprocas, conectividad, capitales y cinco aproximaciones independientes de Bala en atlas completos.
- Perfiles asimétricos iguales para jugador e IA, posesiones conectadas, tierra neutral y once identidades estratégicas.
- Victoria real separada de instrucción; preparación aplicada una vez, ocupación sin experiencia y máximo una victoria por encuentro.
- Nombre de ejército y comandante, identidad estable, bancos de más de mil combinaciones por colonia y exclusión de caídos.
- Acción única, reclutamiento diferido, recompensa de conquista sin cultivo por recaptura.
- Resolución determinista de tres bandos, daño simultáneo, invasor vencedor y derrotado, empate y máximo de 24 pasos.
- Recarga durante irrupción con consecuencias idénticas; consumo de acción sin repetición de intervención.
- Retirada, salida inválida, aniquilación, recuperación por descanso y conservación/pérdida de identidad según caso.
- Capital capturada por colonia frente a capital arruinada por amenaza; transferencia o neutralización, disolución y recompensa única.
- Presupuestos de enclaves y cancelación real de sus expediciones al destruir el origen.
- Heridas, recuperación y recompensa única de grandes amenazas; intención hacia destino legal.
- Vuelo separado y galerías de termitas sobre bordes físicos secos.
- Oleadas finitas y lluvia con aviso, tránsito temporal y restauración.
- Cola de facciones/amenazas/sucesos/cierre reanudable; Picnic contado después del mundo y reiniciado al perderse.
- Victoria por Picnic/dominación, extinción, información militar antigua y pronóstico que omite invasores ocultos.
- Respaldo de v4, guardado v5 y fallo de almacenamiento visible.
- Volver a capital propia vacía no genera un combate contra su defensa; Picnic hostil siempre requiere encuentro.

Las pruebas de consecuencias utilizan algunos resultados controlados para aislar captura/retirada; los combates puros y las partidas de evaluación usan el resolutor real. No se presenta una victoria inyectada en una prueba unitaria como partida completa.

## Partidas completas con el mundo activo

El evaluador ejecuta una política sencilla de jugador mediante órdenes legales, junto a rivales, amenazas, invasiones y sucesos. No concede fuerzas extra ni declara vencedores desde fuera del motor. Usa fuerzas militares observadas para escoger destinos. Es una evaluación automatizada, no una prueba humana de dificultad.

| Semilla | Jugador / objetivo | Final | Ronda | Territorios distintos con combate, todos los bandos |
|---|---|---|---:|---:|
| 20261019 | Carpinteras / Picnic | Fuego gana por Picnic | 24 | 46 |
| 20261019 | Carpinteras / dominación | Fuego gana por Picnic | 24 | 46 |
| 20261019 | Tejedoras / Picnic | Capital del jugador perdida | 19 | 35 |
| 20261019 | Tejedoras / dominación | Jugador gana por dominación | 64 | 57 |
| 20261019 | Bala / Picnic | Capital del jugador perdida | 15 | 28 |
| 20261019 | Bala / dominación | Negras gana por Picnic | 147 | 47 |
| 2026 | Carpinteras / Picnic | Bala gana por Picnic | 46 | 75 |
| 2026 | Tejedoras / Picnic | Capital del jugador perdida | 18 | 35 |
| 2026 | Bala / Picnic | Jugador gana por Picnic | 33 | 54 |

Informes: `evaluation-v5.json` y `evaluation-v5-seed2026.json`. El segundo se reproduce estableciendo `CAMPAIGN_SEED=2026`, `CAMPAIGN_GOALS=picnic` y `REPORT_PATH=docs/evidence/campaign/evaluation-v5-seed2026.json` antes de ejecutar el evaluador. Los tiempos registrados durante algunas evaluaciones compartieron carga con el navegador: para rendimiento se usa únicamente el informe dedicado.

Esto demuestra cierres completos de ambos objetivos y campañas sin recorrer los 300 territorios. No demuestra que Carpinteras sea siempre más fácil que Bala. Las etiquetas siguen siendo objetivos provisionales. Falta evaluar con personas las aperturas, legibilidad de riesgos, rutas interesantes y duración deseada.

## Navegador y revisión visual

Entrada desde menú, selección y confirmación de colonia, mapa inicial completo, tres charcos, panel opcional, controles plegables, movimiento y ataque confirmado. Un encuentro de comprobación fija previamente instrucción y defensa para aislar la UI; luego se resuelve con el motor real. Se comprueban retorno, carga, ronda rival, teclado, arrastre, pellizco, idiomas y nombres persistentes separados. El progreso de escaramuzas permanece idéntico y el ticker táctico no se activa.

Capturas actuales: `faction-profiles.png`, `garden-1280.png`, `garden-1920.png`, `garden-controls-hidden.png`, `garden-mobile.png`, `army-identity-mobile.png`, `battle-preparation.png` y `automatic-result.png`. `campaign-rts.png` pertenece a la fase anterior y no representa el modo v5.

La crítica visual independiente produjo una pasada de corrección:

- Botón de confirmar facción fuera de las tarjetas y accesible; estado de preparación del jardín.
- Leyenda plegable para símbolos y fronteras; retirada de terminología interna repetida en tarjetas.
- Ficha móvil con preparación, acciones y fuentes de veteranía antes de campos de identidad; sugerencia de nombre secundaria.
- Matrícula con texto «Ejército» y marca personal explicada.
- Resultado con etiqueta de fuerza restante y consecuencias principales visibles; detalles y factores bajo demanda.
- Defensa local con nombre legible, sin identificador interno expuesto.

No se generaron ilustraciones ni se añadió multijugador. La incorporación del RTS multibando, nuevos modelos de hormigas y cada plantilla táctica queda para su fase de contenido.


## Revisión posterior: arrastrar y planificar antes de terminar turno

La interacción de selección/destino/confirmación descrita en la revisión inicial queda sustituida por arrastrar y soltar. La ficha se coloca como orden provisional, sin consumir acción ni cambiar propietarios; devolverla al origen anula la orden. Terminar turno confirma todas las órdenes. La advertencia solo aparece cuando no se preparó ningún movimiento.

Comprobación real con ratón: preparar orden, devolver ficha, volver a colocar, recargar y recuperar el borrador, terminar turno sin confirmación adicional y llegar a la siguiente ronda. Comprobación táctil mediante eventos reales: devolver una ficha preparada al origen anula la orden. Se observaron capturas en 1280×720 y 390×844: `drag-start.png`, `drag-held.png`, `drag-staged.png` y `drag-mobile.png`. La ayuda se trasladó al pie, las superficies no se resaltan durante la selección y se mantiene silueta de origen/flecha de orden. Los números de territorio se retiraron de la interacción.

El script de navegador se actualizó al nuevo flujo. Las cifras de rendimiento anteriores corresponden a su fecha de medición, no certifican esta revisión de interacción.


### Corrección de anclaje y entrada en territorio enemigo

Se detectó que el desplazamiento fijo del icono (+26/−22 píxeles) situaba 10 de 11 ejércitos iniciales sobre un polígono distinto de su territorio real en el encuadre de referencia. Se retiró ese desplazamiento de fichas, siluetas y líneas. La devolución vuelve a usar el territorio real, sin una zona invisible que pueda cancelar una suelta en el vecino. Las órdenes y fichas arrastradas se dibujan por encima de defensores y amenazas para que no desaparezcan visualmente al atacar.

Los destinos enemigos conectados admiten órdenes; los bordes sin paso y el agua devuelven un motivo explícito. Durante el arrastre se indican las salidas válidas con puntos discretos, sin resaltar superficies. Evidencia de navegador: `army-anchor-fixed.png`, `enemy-drop-held.png`, `enemy-drop-staged.png`, `enemy-occupied-staged.png` y `enemy-occupied-result.png`. Las comprobaciones de frontera usan un ejército colocado en un frente propio controlado para aislar la interacción; no se presentan como una campaña recorrida desde la capital.
