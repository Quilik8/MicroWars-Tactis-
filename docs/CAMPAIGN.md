# MicroWars — campaña automática del jardín (v5)

Estado: implementación jugable del plan aprobado «Colonias, veteranos e invasiones». Los coeficientes y dificultades son parámetros de prototipo. Esta entrega permite jugar hasta el final sin entrar al RTS de nodos. Las escaramuzas conservan su funcionamiento y progreso separados. Singularity sigue siendo otro juego.

## Cómo jugar

Entrar en **Modo campaña**, seleccionar colonia y confirmar. Mantener pulsada una ficha de ejército, arrastrarla a un territorio vecino y soltarla. La ficha queda colocada como **orden provisional**, con silueta en origen y flecha al destino. No cambia todavía propietario, recursos, experiencia ni disponibilidad real. Se puede recoger otra vez, elegir otro destino o devolverla al origen. También se pueden deshacer todas las órdenes.

**Terminar turno confirma las órdenes juntas**: se ejecutan movimientos y encuentros automáticos y luego actúan los rivales. No hay un botón de confirmar cada movimiento ni una pantalla de preparación que haya que aceptar para ejecutarlo. Los resultados y las recompensas se muestran al concluir el encuentro. La advertencia al terminar aparece únicamente si no hay ninguna orden preparada y quedan ejércitos disponibles.

Las órdenes se guardan al soltar una ficha y se conservan al recargar. Durante la ejecución, la cola conserva el punto resuelto. Se permite reunir varios ejércitos propios en un territorio, conservando nombres, comandantes, acciones, mutaciones y veteranía individuales. Las órdenes de ataque dirigidas al mismo territorio se resuelven juntas, incluso desde orígenes distintos. Todos los ejércitos estacionados defienden juntos. Arrastrar una ficha mueve la formación seleccionada; la ficha muestra ×N y el panel permite seleccionar cada formación. Reclutar ya no requiere una capital vacía de ejércitos aliados. La IA utiliza las mismas reglas de apilamiento y puede atacar con sus formaciones listas reunidas.

El arrastre de terreno y el pellizco siguen disponibles. Teclado: seleccionar un ejército con **Siguiente ejército**, enfocar el mapa, Espacio para coger, flechas para destino, Enter para soltar y Escape para cancelar. La política de retirada, los nombres y las mejoras permanecen en la ficha opcional.

El jardín completo aparece al entrar. Arrastrar y rueda/pellizco permiten explorar; **Ver jardín** recupera el encuadre general. Los controles y la ficha se pliegan. La leyenda explica símbolos y fronteras. Flechas seleccionan vecinos, Tab recorre controles y Escape cierra la ficha. El mapa también funciona con movimiento reducido.

## Mundo y perfiles

Atlas predeterminado de 300 superficies irregulares, tres charcos con espacio físico propio y conexiones terrestres explícitas. La macrogeografía y sus pasos son estables; la semilla cambia encuentros y recompensas. La geometría se subdivide mediante Voronoi: no se afirma que cada uno de los 300 polígonos esté dibujado a mano. También se comprueban atlas de 50, 400 y 500 territorios.

Las posesiones iniciales son corredores conectados a su capital, con destacamentos avanzados y abundante territorio neutral. No se distribuye todo el jardín entre propietarios. Las capitales mantienen 1/2/2/2/3/5 accesos físicos para Carpinteras/Negras/Tejedoras/Cortadoras/Fuego/Bala. El atlas completo incorpora cinco aproximaciones independientes a Bala desde las otras capitales, abriendo el conjunto mínimo de bordes secos necesario; no hay saltos sobre agua.

| Colonia | Ejércitos | PE | Situación y dificultad objetivo provisional |
|---|---:|---:|---|
| Carpinteras | 2 novatos | 8 | Refugio protegido; muy fácil |
| Negras | 2 novatos | 6 | Periferia con alternativas; fácil |
| Tejedoras | 2 novatos | 6 | Destacamento avanzado y dos frentes; normal |
| Cortadoras | 2 novatos | 4 | Recompensas escasas en la orilla y expediciones defendidas; difícil |
| Fuego | 2 novatos | 6 | Despliegue expuesto y tres accesos; muy difícil |
| Bala | 1 con instrucción 2 | 6 | Centro con cinco aproximaciones e interés de Avispas; infernal |

Jugador e IA usan los mismos perfiles. La instrucción inicial de Bala pertenece a ese ejército: no es una mejora global gratuita. La etiqueta describe la intención del diseño, no un orden de dificultad ya demostrado. Las simulaciones registradas muestran resultados diferentes según ruta y semilla; todavía se requieren partidas humanas.

La geografía y capitales son públicas. La visión militar procede de posesiones y vecinos; fuera de visión se guarda la última observación con su ronda. El Picnic ocupado es público. Las predicciones omiten invasores ocultos; un riesgo observado se muestra antes del combate. La IA consulta fuerzas visibles e información observada, sin localizar ejércitos ocultos.

## Economía, identidad y veteranía

La capital original produce 2 PE por turno. Reclutar cuesta 6 y requiere capital libre; el nuevo ejército actúa en la ronda siguiente. La primera conquista de cada territorio por facción concede su recompensa una vez: normalmente 1 PE; en la orilla, 0 si está vacío y 3 si está defendido. Recuperarlo no permite cultivar puntos.

Mejoras globales con costes 8/12 PE y dos niveles:

- Incubación: reclutar pasa a costar 5/4.
- Instrucción: los nuevos reclutas reciben 1/2 niveles de instrucción.
- Reserva del nido: +10% por nivel al despliegue de la defensa local de capital, limitado al 100%.

Cada ejército guarda victorias reales, instrucción, penalización de retirada, tres espacios de mutación, matrícula, comandante y un historial propio. Preparación base: **50% + 10 puntos por victoria o instrucción**, hasta 100%. La experiencia no vuelve a multiplicar el daño. Las ocupaciones pacíficas no conceden experiencia; una victoria militar concede como máximo una por encuentro, incluso con tres bandos.

Comandante y ejército tienen nombres separados y editables. El emblema de facción, número de formación y marca personal permanecen estables al renombrar. Los bancos curados generan más de mil combinaciones no redundantes por facción principal, mediante semilla local y sin reutilizar nombres de ejércitos caídos. Los nombres propios iniciales están en español y se conservan al cambiar de idioma; las etiquetas de la interfaz están en ES/EN/PT/ZH. No se han creado todavía bancos literarios específicos de nombres para los otros idiomas.

La aniquilación pierde ejército, comandante y mutaciones. Los caídos conservan una ficha histórica; el siguiente recluta recibe otra identidad y no hereda sus victorias.

Mutaciones disponibles: aproximación rápida, adaptación al terreno anegado y resistencia tóxica. Las opciones se fijan y guardan antes de mostrarse; tres espacios, con sustitución validada cuando hay una nueva opción. El catálogo puede ampliarse al incorporar encuentros RTS.

## Encuentros automáticos

Contrato con dos o tres bandos hostiles, cada uno con una o varias formaciones aliadas: identidad, rol, fuerza/preparación, mutaciones, retirada y momento de entrada. Fases: aproximación, choque, irrupción, desgaste/retirada y consecuencias. El mundo no avanza durante esas fases.

Daño simultáneo y determinista, objetivos por rol y desempate estable, máximo 24 pasos. La misma entrada produce el mismo resultado. Si no hay vencedor al límite, el propietario conserva el territorio y se explican supervivientes/retiradas. La fuerza restante solo describe ese encuentro; no traslada cantidades exactas de hormigas al siguiente. Las grandes amenazas sí conservan heridas.

Fuerzas iniciales: ejército según preparación; capital al menos 60%, con Reserva; se suma la fuerza de los ejércitos estacionados y se eleva al mínimo de defensa local si no lo alcanza, sin duplicar ese mínimo por ejército. Defensas ordinarias 25–40, pasos 45–60, puntos épicos 65–80, Picnic 95, grandes amenazas 150/170/160. Son valores ajustables en `src/campaign/rules.js`.

Rasgos automáticos separados del RTS: Carpinteras resiste en nidos/pasos; Negras mejora despliegue propio; Tejedoras mejora aproximación; Cortadoras recibe refuerzos con fragilidad; Fuego aplica quemadura; Bala recupera fuerza por daño causado. Las especies adicionales añaden veneno, defensa excavadora, vuelo, redes y armadura. El resultado conserva daños, recuperación y contribuciones de factores para explicarlos bajo demanda.

La retirada se autoriza antes de combatir, con destino propio válido registrado. Se intenta al bajar del 30% de la fuerza inicial; una aniquilación previa o salida inválida la hace fracasar. Defensas locales y amenazas no se retiran. Un ejército evacuado conserva identidad y mutaciones, pierde la posición defendida y recibe −20 puntos de preparación, con mínimo 30%. Descansar una ronda completa elimina esa penalización. No hay decisión emergente durante una irrupción.

## Enclaves, invasiones y grandes amenazas

Las once identidades tienen presencia estratégica: seis colonias principales y Mutantes, Termitas, Avispas, Arañas y Escarabajos. Las adicionales no son seis capitales seleccionables más ni requieren exterminio para ganar.

- Mutantes: dos enclaves y contaminación del entorno.
- Termitas: enclave excavador y tres pasos exclusivos sobre bordes físicos secos.
- Arañas: dos enclaves con redes y expediciones.
- Avispas: oleadas en rondas 4, 12 y 20 si hay entrada válida; red aérea separada, alcance 140.
- Escarabajos: expedición colosal de asedio, lenta y acorazada.

Cada enclave dispone de dos expediciones; actividad desde ronda 3 e intervalo de cuatro rondas. No se genera una reserva infinita. Destruirlo cancela sus expediciones dependientes. Máximo cuatro expediciones especiales activas simultáneamente.

Un tercer bando debe tener alcance desde su posición, ruta aérea o salida de enclave válida. Prioridad y semilla eligen como máximo uno; condiciones y participante quedan fijados al preparar el encuentro. Consume su acción y no vuelve a actuar en esa ronda. El combate continúa automáticamente con todos hostiles entre sí.

Contenido grande inicial: araña lobo fija, ciempiés errante y escarabajo colosal. Los móviles muestran una intención observada hacia un destino legal. Conservan heridas y recuperan 10% de su máximo tras una ronda sin combatir. Derrotarlos concede una única recompensa de 6 PE y mutación al ejército vencedor. No reaparecen para repetirla.

Lluvias desde ronda 8 y cada seis rondas: aviso con una ronda de antelación, dos rondas de efecto y restauración. Anegamiento modifica condiciones y bloquea temporalmente pasos concretos; se muestran cruces bloqueados, región y duración. No borra territorios del atlas.

## Capitales, objetivos y cola

Colonia principal que captura una capital: elimina a su facción, disuelve sus fuerzas, transfiere territorios, recibe el 50% de su tesorería y una adaptación genética consumible. Una capital conquistada conserva defensa, pero no se convierte en otro centro de ingresos/reclutamiento.

Amenaza que vence una capital original: elimina su colonia, neutraliza sus posesiones y deja capital en ruinas. No recibe tesorería, colonia ni condición de victoria. La fauna que vence en otro territorio puede neutralizarlo.

Picnic: conquistarlo y conservarlo **tres rondas completas**, después de amenazas y sucesos; perderlo reinicia la cuenta. Los rivales priorizan un Picnic ocupado por otro bando. Dominación: última colonia principal superviviente. Sin colonias supervivientes no hay vencedor. Ningún objetivo exige recorrer los 300 territorios ni esperar a todas las oleadas.

Cola guardable: órdenes del jugador → colonias rivales en orden rotatorio → amenazas aún disponibles → sucesos y recuperaciones → cierre de ronda. Los resultados contra el jugador se resumen al terminar; las irrupciones no abren decisiones intermedias. El botón de acelerar y el movimiento reducido acortan la presentación.

## Arquitectura y guardado

- `campaign_model.js`: validación de acciones, economía, identidad, consecuencias, objetivos y cola.
- `strategic_combat.js`: resolución pura multibando, reanudable por pasos.
- `world_director.js`: actores, intervenciones, presupuestos, rutas especiales y sucesos.
- `atlas.js` / `start_profiles.js`: geografía, bordes físicos y posiciones iniciales.
- `identity.js`: bancos y generación estable.
- `campaign_core.js`: coordinación, guardado y presentación; no inicia el RTS.
- `map_visuals.js` / `campaign.css`: mapa SVG y UI neutral carbón/marfil.

Guardado v5 en `microwars_campaign`, después de acciones y pasos de resolución. Guarda la posición de cola, participantes, opciones de recompensa, heridas, identidades, semilla e información observada. No repite invasiones ni recompensas al recargar. Un fallo de almacenamiento se muestra y detiene la resolución para reintentar.

Los guardados anteriores requieren campaña nueva. Se conserva respaldo `microwars_campaign_backup_v4` para v4 (o la versión de origen correspondiente). El progreso de escaramuzas no se modifica.

El futuro RTS recibirá los participantes, entorno y condiciones del encuentro y devolverá consecuencias mediante el contrato multibando. La campaña actual no usa el antiguo adaptador táctico de dos bandos como si ya estuviera actualizado: integrar y probar cada plantilla táctica será trabajo posterior.

## Evidencia y límites

Ver `CAMPAIGN_VALIDATION.md` y `PERFORMANCE.md`. Se comprobaron reglas, navegador real, tres tamaños, identidad, guardado y campañas con rivales/amenazas activos. Hay victorias completas del jugador por Picnic y dominación sin alterar fuerzas ni declarar vencedores desde el script de evaluación.

El jardín, sus once identidades y sus consecuencias ya se pueden probar. El balance de rutas, la calidad de decisiones de cada territorio, los coeficientes automáticos y las etiquetas de dificultad siguen siendo provisionales. No se declara terminado el contenido RTS ni se encargaron ilustraciones: los emblemas y marcas son SVG nativos. Los futuros encargos usarán un solo prompt por lote de un máximo de diez archivos, con utilidad definida.

### Ajuste de combate y lectura del riesgo

La dificultad de facción describe su situación geográfica y económica; no aplica bonificaciones ocultas al jugador. Un ejército novato tiene 50 de fuerza. Las defensas ordinarias permiten sus primeras victorias; pasos, capitales, puntos épicos y grandes amenazas pueden exigir reunir formaciones. Antes de soltar un ataque se muestra fuerza propia / defensa observada y riesgo; los enemigos fuera de visión permanecen desconocidos. El daño combina fuerza inicial (45%) y restante (55%), evitando combates iguales que se prolongaban sin resolverse por decaimiento exponencial. La retirada sigue autorizada por ejército y se resuelve antes del siguiente intercambio. Una facción vencedora puede tener varios supervivientes: cada ejército obtiene como máximo una victoria y los atacantes supervivientes ocupan juntos. Las heridas de amenazas y los tres bandos siguen vigentes. Estos coeficientes siguen siendo provisionales.


### Lectura del jardín y seguimiento rival

La fuerza defensora conocida se muestra directamente sobre los territorios defendidos mediante «Def. N». Las capitales conocidas sin observación militar muestran «Def. ?». La geografía sigue siendo pública; las zonas sin visión se atenúan y no muestran fichas ocultas. Una orden preparada distingue ataque, ocupación sin combate y reagrupación sobre el destino; los ataques incluyen fuerza propia / defensa y un aviso visible sobre el mapa, sin abrir Detalles.

Durante la resolución, un bloque superpuesto indica la facción o fase activa, con pausa, seguimiento de cámara y velocidad. Cada movimiento observado deja un recorrido con dirección, una noticia y unos 1,3 segundos para leerlo a velocidad normal. Las acciones ocultas avanzan sin mover la cámara. El movimiento reducido conserva la señal y el tiempo de lectura con un trazado estático. Al terminar la ronda se recupera la vista del jugador si mantuvo el seguimiento activo. Manipular el terreno permite liberar la cámara.

Las noticias del jardín están presentes sobre el mapa y conservan hasta 40 sucesos observados dentro del historial guardado: movimientos, ataques, conquistas, combates, expediciones, eliminación de colonias y lluvia. Se pueden plegar. Pulsar una noticia centra el lugar conocido y pausa la resolución si estaba en marcha. El mapa no necesita abrir la ficha contextual para comunicar esos acontecimientos.

Cada movimiento guarda qué facciones observaron su origen y su destino antes de resolver la ocupación. Si solo se observó el origen se anuncia la pérdida de contacto, sin trazar la ruta secreta. Si solo se observó la llegada se indica que entró en visión, sin revelar su procedencia. Los sucesos antiguos sin esos datos no reconstruyen orígenes ocultos. Las eliminaciones de colonias y sus capitales son información pública; la actividad militar fuera de visión sigue oculta.
