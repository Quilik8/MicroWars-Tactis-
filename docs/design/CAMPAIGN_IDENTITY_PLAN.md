# Campaña jugable, ejércitos e identidad — propuesta revisada

> Documento de propuesta anterior a v5, conservado como origen de bancos e identidad. Su diagnóstico técnico y tareas pendientes son históricos. El estado implementado y las decisiones aprobadas vigentes están en `../CAMPAIGN.md` (campaña automática v5).

**Estado:** plan de trabajo para la próxima implementación. No describe funciones nuevas ya disponibles. Conserva las reglas aprobadas de `docs/CAMPAIGN.md`; los cambios de modo, comandantes y perfiles que aquí se proponen necesitan revisión al implementarse. Este documento reemplaza el alcance incompleto del primer estudio visual.

## 1. Correcciones de dirección

- Un solo prompt por lote de hasta diez imágenes: instrucciones comunes una vez, salidas enumeradas dentro del mismo prompt. No un prompt repetido por asset.
- Primero se establece la función de un asset. La campaña debe poder probarse con símbolos antes de encargar ilustraciones. No se necesitan seis imágenes para que el ciclo estratégico funcione.
- Hay once identidades registradas, no seis en todo el proyecto. Seis son las posiciones principales del jardín actual.
- UI neutral cálida: carbón `#1D1C1A`, superficie `#292725`, marfil `#EEE5D7`, texto secundario `#B7AEA1`, borde `#5A544A`, foco `#DECCA7`. El jardín conserva sus biomas; el verde de la UI se reserva a donde tenga significado, por ejemplo Tejedoras. El contexto de parque no obliga a pintar todos los paneles de verde.
- El estudio de anatomía sigue siendo naturalista estilizado. La interfaz y los emblemas deben ayudar a decidir, reconocer y recordar, además de verse coherentes.

## 2. Inventario real y alcance

Fuente: `src/campaign/faction_data.js`, `BASE_FACTIONS` en `rules.js`, encuentros y GDD Parte 6B. Registrar una especie y ponerle `isPremium` no significa que sus reglas o su campaña estén terminadas. La etiqueta comercial antigua tampoco decide el alcance técnico de esta entrega.

| Identidad | Papel actual / límite |
|---|---|
| Hormigas Carpinteras | Principal de campaña; dificultad parcialmente representada |
| Hormigas Negras | Principal de campaña; dificultad parcialmente representada |
| Hormigas Tejedoras | Principal de campaña; dificultad parcialmente representada |
| Cortadoras de Hojas | Principal de campaña; dificultad parcialmente representada |
| Hormigas de Fuego | Principal de campaña; dificultad parcialmente representada |
| Hormiga Bala | Principal de campaña; dificultad parcialmente representada |
| Hormigas Mutantes | Escaramuza con mutantes existente; rol de campaña pendiente. |
| Termitas | Registrada; reglas y rol jugable de campaña pendientes. |
| Avispas | Registrada; expansión e invasiones previstas en GDD, pendientes. |
| Arañas | Registrada; facción y guardianes requieren roles distintos, pendientes. |
| Escarabajos | Registrada; reglas disruptivas de asedio pendientes. |

Mutantes ya aparece como propietario de un nodo en `src/data/levels/sector3.js`. Las cuatro especies especiales tienen identidad y descripciones en el registro; no se afirma que vuelo, excavación, eclosión y asedio estén implementados como campaña. Una araña guardiana y la facción Arañas necesitan variantes visuales y reglas de rol diferenciadas.

**Plan de catálogo:** definir las once identidades y sus roles. **Plan de partida inicial:** estabilizar las seis posiciones existentes. Incorporar otras como encuentros, amenazas o facciones seleccionables dependerá de que tengan reglas, rutas y objetivos propios; no se convertirán automáticamente en cinco capitales adicionales.

## 3. Estado real de jugabilidad

Ya existe un ciclo técnico de mover, ocupar, luchar en RTS, resolver consecuencias, guardar y pasar a rivales. Hay nombre editable, preparación, mutaciones y experiencia almacenados. Falta cerrar la jugabilidad de campaña: comandantes, nombres variados, relato de veteranía, perfiles de dificultad fieles, amenazas y combate automático general.

El ejército nuevo se llama hoy con un número (`01`, `02`…). El input de renombrar existe y admite hasta 40 caracteres. No hay generador de nombres ni comandante persistente. El campo `wins` empieza con la mejora de instrucción, por lo que actualmente mezcla entrenamiento y victorias reales. No debe presentarse ese valor como un historial de batallas ganado.

El autoresolutor actual compara preparación, cantidad de mutaciones y una defensa especial. No incorpora de forma suficiente identidad de facción, entorno y condiciones estratégicas. Por ello no basta con desbloquear su botón para dar por diseñada la campaña.

## 4. Siguiente ciclo jugable: estrategia con combate automático

### Flujo

1. Elegir colonia viendo dificultad objetivo, situación inicial y grado de implementación. Examinar una entrada no empieza partida.
2. Recibir un ejército con ID estable, nombre sugerido por facción, comandante y ficha de historial vacía.
3. Seleccionar el ejército: ver acción, preparación, experiencia real, instrucción, mutaciones y qué se arriesga.
4. Seleccionar un vecino: distinguir ocupación pacífica de encuentro. Mostrar ruta, visión, defensa conocida y destino de retirada válido.
5. Confirmar la orden; si hay combate, resolverlo automáticamente mediante el contrato de encuentro y resultado. Una sola acción, sin ataques accidentales ni encadenados.
6. Ver un resumen breve: qué influyó, vencedor, ocupación, victoria obtenida o ejército perdido, preparación y mutación. Recompensa épica: elección guardada antes de mostrarla.
7. Terminar turno y observar las acciones rivales visibles, con pausa para revisar el resultado de una defensa propia. Continuar la cola guardada sin repetir acciones.
8. Decidir si conservar el ejército veterano, reclutar otro, recuperar preparación o disputar un objetivo.

### Modo de prototipo separado

Proponer `campaignMode: strategic_auto`. Resolvería también capitales, guardianes y Picnic sin exigir plantillas vencidas manualmente. Sus resultados no desbloquearían victorias manuales de escaramuza. Tampoco aplicaría el turno adicional perdido de la opción de autoresolución actual: si siempre se resuelve así, esa penalización deja de ser una elección y distorsiona todo el ritmo. Se mantiene una acción por turno.

Estas excepciones pertenecen al prototipo estratégico; no reescriben de forma silenciosa las reglas finales del RTS. Se necesita distinguir `resolutionMode` de la victoria manual para guardar, recargar y volver posteriormente al combate táctico.

### Resolución explicable

Entrada: participantes y comandante/ejército, preparación, experiencia e instrucción sin contarlas dos veces, mutaciones por efecto concreto, plantilla, territorio, tipo de defensa, información militar y rutas de retirada congeladas antes de resolver. Salida: victoria/derrota/retirada, pérdida o supervivencia, ocupación, preparación, experiencia, recompensa y explicación breve.

El modelo debe separar despliegue inicial, desgaste y captura. No se sumará un porcentaje genérico por cada mutación independientemente de su tipo. Un rasgo de movilidad no otorgará otra acción estratégica; un descuento de evolución táctica no se convertirá en PE gratis. Se diseñarán equivalentes para el encuentro abstracto, etiquetados como parámetros de prototipo. Hasta entonces, un rasgo no modelado se mostrará como pendiente, no como ventaja aplicada.

Mismas reglas para IA y jugador, sin posiciones ocultas ni refuerzos que aparezcan sin ruta. Cualquier variación aleatoria se deriva de la semilla y se guarda antes de revelar el resultado. La previsualización usa información permitida: fuera de visión no puede revelar un vencedor exacto calculado con fuerzas secretas.

### Retirada en este modo

La cuenta de ocho segundos pertenece al RTS, que no corre aquí. Propuesta para el prototipo: antes de combatir se puede ordenar retirada si el resultado sería adverso, eligiendo un territorio propio adyacente disponible. El defensor puede recibir esa decisión al notificarse el ataque, antes de aplicar consecuencias. Solo es posible si ese destino sigue siendo válido y existe preparación suficiente para evacuar; umbral y coste de evacuación deben calibrarse con el modelo de desgaste. Si se sobrepasa el umbral o no queda salida, la derrota puede aniquilar al ejército.

Se conserva el −20 puntos porcentuales de preparación con mínimo 30%, acción consumida y recuperación al descansar un turno completo. No presentar la retirada como un seguro gratuito para ejércitos de élite. La defensa de capital debe advertir que abandonarla y perderla elimina la facción, aunque el comandante hubiera evacuado: no se fabrica una ruta de supervivencia que contradiga la derrota por capital.

## 5. Qué significa conservar tropas veteranas

La continuidad pertenece al ejército como organización, no al recuento exacto de hormigas supervivientes entre escenarios. Sus victorias cuentan preparación, práctica y memoria de campaña. Las conquistas vacías dan territorio y recompensa económica, pero no experiencia militar.

| Victorias reales + instrucción inicial, hasta 5 | Despliegue base |
|---|---:|
| 0 | 50% |
| 1 | 60% |
| 2 | 70% |
| 3 | 80% |
| 4 | 90% |
| 5 o más | 100% |

No se aplica esa preparación otra vez como un multiplicador de daño. No aumenta capacidad máxima del escenario. Las victorias reales se conservan por encima de cinco para el historial, sin crecer el bono sin límite.

Separar `battleVictories`, `trainingLevel`, `retreatPenalty`, `mutationSlots` y `history`. Ejemplo: 2 victorias + 1 instrucción = 80% base; tras retirada, 60% de preparación actual. La UI dice exactamente eso. Un ejército instruido recién reclutado no recibe relatos ni medallas por batallas que no libró.

Los tres espacios de mutación dan especialización y decisiones de sustitución. Las pérdidas importan porque se pierde experiencia, comandante, mutaciones e historial activo. El registro de caídos conserva el recuerdo, sin resurrección automática ni transferencia invisible de sus bonos a un ejército nuevo. Si sobrevive la capital, se puede reconstruir con otra identidad. La veteranía hace valiosa la retirada y la rotación de ejércitos, no solo un número mayor en un ataque.

Una guarnición de capital sin ejército es defensa local; no inventar un comandante con experiencia persistente. Un ejército estacionado sí conserva su comandante y participa en ese mismo encuentro.

## 6. Comandante: identidad legible y persistente

Propuesta inicial: un comandante por ejército, inseparable de su ficha. Comparte su continuidad y experiencia; todavía no se añade un héroe con árbol, inventario o resurrección. Es una propuesta de rol, no una función ya existente.

Tres niveles de reconocimiento:

- **Facción:** emblema y anatomía de especie.
- **Mando:** distintivo de mando constante y una silueta de ficha distinta de las tropas o guarniciones.
- **Individuo:** nombre, matrícula de formación, marca personal estable y, cuando haya arte útil, variante de retrato. Un cambio de selección no cambia esa identidad.

En mapa: ficha de ejército con emblema de facción, número de formación y disponibilidad. En detalle: nombre del ejército como titular y debajo «Comandante Ámbar — Nudo Firme», insignia individual, experiencia y breve historial. En preparación y resultado reaparece la misma identidad para reconocer quién arriesga o gana. Los detalles biográficos quedan bajo demanda.

Nombre de ejército y nombre de comandante son campos diferentes. El jugador puede cambiar ambos. La insignia y el ID no cambian al renombrar. Mando no se representa mediante una corona de reina ni mediante un uniforme humano. Pequeñas variaciones de marca corporal, encuadre y distintivo pueden ayudar, pero nunca serán la única clave visual de identidad.

Si el ejército se retira, el comandante sigue con él. Si es aniquilado, ambos se pierden y su ficha pasa al registro de caídos. No resolver todavía muerte individual o sucesión dentro de un ejército vivo: sería otro sistema, con nuevas consecuencias que este prototipo no necesita.

## 7. Nombres variados por facción

Generador local, sin llamadas a IA durante la partida. Semilla de identidad = semilla de campaña + facción + número de reclutamiento de esa facción. Generar una vez y guardar nombre final, tokens, idioma y origen (`generated`/`custom`). Cambiar de idioma o recargar no renombra un ejército ni traduce un nombre que escribió el jugador.

Formato: `{formación} {frase de lugar} «{epíteto}»`. Las frases ya llevan sus artículos y preposiciones; no concatenar sustantivos al azar con concordancias rotas. El jugador puede aceptar el nombre, pedir una sugerencia o escribir el suyo, hasta los 40 caracteres actuales. La UI no necesita exponer los tokens.

`army-names.proposal.json` contiene bancos concretos, no solo ejemplos. Se filtran a 40 caracteres y se descartan repeticiones como «Mandíbula del Cerco — Cerco» o «Muesca — Muesca». Cantidades de propuesta tras esos filtros:

| Identidad | Nombres de ejército | Nombres de comandante |
|---|---:|---:|
| carpinteras | 1076 | 95 |
| negras | 1080 | 95 |
| tejedoras | 1049 | 94 |
| cortadoras | 1061 | 93 |
| fuego | 1061 | 93 |
| bala | 1068 | 95 |
| mutantes | 217 | 30 |
| termitas | 217 | 32 |
| avispas | 228 | 31 |
| arañas | 221 | 30 |
| escarabajos | 224 | 32 |

El comandante usa un banco separado. Estas cantidades son combinaciones de los bancos iniciales, no nombres definitivos de personajes. Revisar el tono y ampliar por idioma antes de integrar.


| Facción | Ejército de ejemplo | Comandante de ejemplo |
|---|---|---|
| Carpinteras | Guardia del Duramen «Nudo Firme» | Ámbar — Veta Clara |
| Negras | Columna del Sendero «Retorno» | Ónix — Paso Firme |
| Tejedoras | Trenza del Rocío «Hebra» | Liana — Dosel |
| Cortadoras | Corte del Brote «Cosecha» | Espiga — Nervadura |
| Fuego | Brasa del Rescoldo «Ascua» | Cendra — Pedernal |
| Bala | Mandíbula del Pulso «Muesca» | Nerva — Bastión |

Evitar repeticiones con una bolsa determinista sin reemplazo por facción y campaña, incluyendo caídos. Al agotarse, añadir el número de formación sin superar el límite; no entrar en un bucle de azar. Los nombres personalizados repetidos pueden advertirse, sin impedirlos; la matrícula distingue siempre. Los bancos de otros idiomas se escribirán por idioma, sin traducir automáticamente nombres propios personalizados.

## 8. Dificultad: objetivo del GDD y estado real

No está completamente reflejada. El atlas fija 1/2/2/2/3/5 accesos, pero un acceso no equivale a un frente enemigo. Los recursos iniciales son actualmente iguales; la escasez de Cortadoras y las invasiones contra Bala aún no tienen el sistema necesario. Negras no tiene campo `difficulty` en su entrada actual pese al «Fácil» del GDD. Las etiquetas existentes no prueban balance.

| Facción | Objetivo del GDD | Qué hay que construir / medir |
|---|---|---|
| Carpinteras | Muy fácil: Un frente protegido y margen para aprender. | La periferia existe; faltan distancias de contacto y rutas seguras medidas. |
| Negras | Fácil: Expansión periférica metódica, con alternativas. | Dos accesos; no se ha validado la presión efectiva. Falta difficulty en el registro actual. |
| Tejedoras | Normal: Dos frentes rivales que obliguen a elegir dónde intervenir. | Dos accesos no equivalen todavía a contacto con dos facciones. |
| Cortadoras | Difícil: Recursos iniciales escasos; expediciones con riesgo y recompensa. | Estar junto al charco no implementa escasez. Faltan recompensas y guardianes situados para ese perfil. |
| Fuego | Muy difícil: Tres frentes hostiles, poco espacio y necesidad de abrir salida. | Tres accesos al norte no garantizan el encajonamiento del GDD. |
| Bala | Infernal: Presión de cinco rivales y atención de amenazas nómadas. | Cinco accesos no son cinco rivales atacando. No están implementadas amenazas nómadas. |

### Perfiles de inicio verificables

Definir `startProfile` con capital y territorio inicial conectado, salidas utilizables, regiones rivales que pueden alcanzarlo, rondas mínimas de contacto por caminos reales, encuentros/recompensas cercanas, alternativas de expansión, amenazas anunciadas y prioridades estratégicas de vecinos.

- **Carpinteras:** una frontera inicial efectiva, expansión segura antes de la primera presión y salida alternativa posterior. Aprender no debe exigir vencer un guardián épico obligatorio.
- **Negras:** periferia con dos rutas de utilidad distinta; presión moderada y capacidad de cambiar de ruta sin una trampa de capital.
- **Tejedoras:** dos frentes que puedan contactar dentro de la apertura, con información y posibilidad de decidir cuál atender.
- **Cortadoras:** menos acceso inicial a territorios de recompensa relevante y una expedición defendida que permita salir de la escasez. Como hoy solo hay ingresos de capital y recompensa de conquista, hay que diseñar encuentros con recompensas diferenciadas antes de afirmar que existe esa escasez; no añadir mantenimiento ni suministro a medias.
- **Fuego:** tres frentes activos, espacio limitado y una salida que requiera iniciativa. No basta con tener tres vecinos neutrales.
- **Bala:** cinco presiones rivales por rutas de aproximación y amenaza nómada con aviso y movimiento real. «Cinco atacantes desde el turno 1» del GDD no cabe automáticamente con seis ejércitos iniciales en capitales alejadas. Lograrlo exigiría revisar despliegues y posesiones iniciales. Hasta decidirlo, se debe decir «presión central creciente», no prometer que ese asedio literal ya existe.

Los territorios iniciales adicionales, si se proponen, deben ser conjuntos conectados a su propia capital y no crear enclaves aislados. Las posiciones y reglas del perfil pertenecen a la facción tanto cuando la elige el jugador como cuando la dirige la IA. La dificultad no se logrará con información secreta o dinero infinito para rivales.

Separar dificultad contextual de campaña de dificultad de IA táctica de escaramuza. La selección mostrará nivel objetivo + motivo + vista del inicio + estado «provisional». Medir por perfil: rondas hasta primer contacto, rivales que alcanzan la frontera, rutas seguras, encuentros obligatorios, PE disponible, pérdida de primer ejército, acceso al Picnic y duración. Comparar semillas y partidas humanas antes de afirmar que Muy fácil < Fácil < Normal < Difícil < Muy difícil < Infernal se cumple.

## 9. Amenazas y sucesos con los que probar el significado de la veteranía

Después del ciclo básico, introducir una amenaza nómada y un guardián como roles estratégicos, sin exigir arte final o una especie nueva por cada regla. El nómada debe anunciar intención, moverse por rutas admitidas y presionar una decisión; el guardián bloquea una recompensa o atajo con otra ruta disponible. No aparecen durante un encuentro ya congelado como una pérdida inevitable sin aviso.

Propuesta de primer suceso ambiental: advertir de una región que quedará temporalmente bloqueada; permitir mover al veterano, arriesgar a un novato o cambiar de objetivo. Tanto duración como alcance se definirán en datos antes de jugarlo. No producir diez ilustraciones de catástrofes antes de verificar que provocan decisiones interesantes.

## 10. Imágenes: función, cantidad y momento

**Necesario para el primer ciclo jugable: cero imágenes generadas.** Emblemas y fichas en código permiten validar selección, identificación de comandante, nombres y consecuencias. La imagen no determina estadísticas ni es condición para guardar una identidad.

**Posible lote posterior: seis bases ilustradas de comandante**, correspondientes a las seis posiciones principales. Función concreta: panel del ejército, comparación antes de arriesgar un veterano y recapitulación del resultado o pérdida. También se puede reutilizar su anatomía para identificar la facción en selección. No se pide una imagen diferente por pantalla.

Esas seis bases no serían seis comandantes únicos para toda la partida: compartir especie no significa compartir individuo. La marca personal, matrícula y nombre estable distinguen comandantes; variantes de arte individuales se decidirán solo si la ficha sigue siendo ambigua. No fingir un retrato individual único si se reutiliza una base.

Las otras cinco especies ya están incluidas en el catálogo y el plan. No encargar su arte todavía si no tienen un encuentro o facción operativa que lo consuma. Una petición para las once, cuando proceda, se dividirá en lotes de diez y uno, con UN prompt por lote. La petición vigente de seis se recoge en UN único prompt en `FACTION_ASSET_PROMPTS.md`, condicionado a que se decida producir esas bases. Ahora no se genera ninguna imagen.

## 11. Datos e integración previstos

Separar definición de facción, perfil de inicio, estado de ejército, identidad de comandante y motor de encuentros. Esquema de propuesta:

```text
army: id, faction, formationNumber, displayName, nameOrigin, nameTokens,
      battleVictories, trainingLevel, mutations, retreatPenalty,
      commanderId, territory, actionState, history
commander: id, armyId, displayName, nameOrigin, identitySeed,
           insigniaId, portraitBaseId?, portraitVariant?, status
campaign: mode, seed, startProfileVersion, recruitmentCounters,
          usedNames, lostArmies, turnQueue, pendingEncounter, pendingReward
```

Los retratos son referencias opcionales; no incrustar imágenes en el guardado. Guardar selección de recompensa y resultado de combate antes de mostrarlos. El historial de ejército merece un registro propio: el log actual limitado a cien sucesos de mundo no debe borrar la identidad de un veterano.

Migración: el `wins` actual no permite reconstruir victorias reales separadas de la instrucción si falta historial. No inventar esas victorias al migrar; documentar un valor heredado sin relato atribuido o iniciar una campaña nueva cuando entre el nuevo modo. No se altera ahora el guardado del juego.

## 12. Orden de implementación y aceptación

1. **Corregir dirección:** catálogo de once, UI neutral, propósito de assets y prompt único. Entrega de esta planificación.
2. **Cerrar el ciclo estratégico:** modo automático sin RTS, retirada abstracta y consecuencias, guardado y cola rival. Primero una apertura completa.
3. **Dar identidad a la continuidad:** comandante, nombres por facción, experiencia separada de instrucción, historial y caídos; ficha comprensible sin retratos.
4. **Hacer real la dificultad:** perfiles y rutas del GDD, recompensas y amenazas que los distingan; medir presión, no solo vecinos.
5. **Incorporar una amenaza y un suceso:** comprobar que alteran decisiones y no solo disparan mensajes.
6. **Producir arte útil e integrar:** solo tras ver dónde se usa y qué tamaño necesita. Después ampliar contenido y, más adelante, RTS.

Aceptación funcional futura: una campaña se puede jugar sin abrir el RTS; una derrota diferencia retirada y aniquilación; la instrucción no fabrica victorias; dos ejércitos de la misma facción se distinguen; renombrar/guardar/recargar conserva identidad; cada facción tiene voz propia en nombres; una amenaza respeta información y rutas; la selección explica la dificultad real. La UI usa bases neutrales y la propiedad no se confunde con bioma. El prototipo visual actual no acredita estos sistemas: únicamente los presenta como diseño.
