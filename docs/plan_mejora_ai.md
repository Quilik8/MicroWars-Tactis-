# Plan de mejora de la AI

Este documento resume el diagnostico actual de la AI del juego y propone una ruta de implementacion para convertirla en un sistema modular, configurable por sector/nivel/faccion y consciente del entorno. La intencion no es reescribir todo de golpe, sino ordenar las mejoras para evitar parches que vuelvan a mezclar la AI con reglas de nivel, hazards y decisiones globales.

## Resumen ejecutivo

La AI ya tiene una base mas avanzada que "atacar el nodo mas cercano": existen `AIManager`, `UtilityEngine`, simulador predictivo, solver de despliegue, analizador de oportunidades y sistema de navegacion. El problema esta en la integracion y en la falta de memoria/identidad estrategica por faccion.

Los sintomas reportados encajan con estos puntos:

- Todas las facciones enemigas usan una misma estrategia global (`world.aiStrategy`), sin perfiles separados por faccion.
- En `main.js`, las facciones activas se recorren con una lista fija y cada faccion considera como objetivo a cualquier nodo que no sea suyo. Eso crea free-for-all permanente.
- No hay diplomacia, alianzas temporales, prioridades de objetivo ni filtros por nivel. Una AI puede preferir atacar otra AI cercana aunque el nivel quiera que presione al jugador o expanda hacia neutrales.
- No hay memoria anti-pendulo: si dos AI se quitan nodos entre si, el scoring vuelve a ver el mismo nodo como buen objetivo en el siguiente ciclo.
- El sector 3 configura `hazardFatalityRatio: 0.95`, lo que permite aceptar rutas donde se perderia hasta el 95% del escuadron antes de vetar por hazard. Para insecticida, eso es practicamente "ignorar el medio".
- Hay logica de agua que fuerza envio total si existe cualquier `waterSweep` en el nivel, aunque no sea una evacuacion real.
- Parte de la logica de peligro dinamico parece desactualizada frente a la API actual de `WaterSweep`: `ai_doomsday.js` usa `bar.worldX`, pero `water_sweep.js` maneja eventos con `scalar`, `radius`, patrones lineales/radiales y `predictUnsafeUntil()`.
- Hay al menos un bug directo: `ai_scoring.js` usa `W_REARGUARD_CHECK` sin importarlo desde `ai_constants.js`.

La mejora debe separar claramente cuatro capas:

1. Percepcion: que sabe la AI sobre nodos, rutas, hazards, oportunidades y amenazas.
2. Politica: que le esta permitido o recomendado hacer en este sector/nivel/faccion.
3. Decision: como compara atacar, reforzar, evolucionar, esperar o evacuar.
4. Ejecucion: como convierte una decision en comandos sin romper rutas, reservas ni reglas del mapa.

## Diagnostico tecnico

### 1. Facciones activas y objetivos

Archivo: `main.js`

Actualmente el bucle principal usa:

```js
const activeEnemies = ['enemy', 'fuego', 'carpinteras', 'bala', 'tejedoras'];
for (const enemyFaction of activeEnemies) {
    ai.update(dt, world.nodes, world.allUnits, enemyFaction, pId);
}
```

Problemas:

- La lista no sale del nivel cargado. Si un nivel tiene `mutantes`, esa faccion queda inerte; si no tiene `bala`, se intenta evaluar igual y sale por filtro.
- La AI recibe solo `aiFaction` y `playerFaction`, pero no recibe una politica de relaciones. En `UtilityEngine._classifyNodes()`, todo nodo que no sea de `aiFaction` pasa a ser target potencial.
- Para una faccion AI, otra faccion AI se evalua como objetivo valido. Eso explica el efecto pendulo entre AIs.

Mejora:

- Derivar facciones activas desde `world.nodes` y `world.allUnits`.
- Excluir siempre `neutral` y `playerFaction`.
- Pasar a la AI un perfil por faccion con relaciones: hostil, neutral, aliado, ignorar salvo amenaza.

### 2. Estrategia global insuficiente

Archivos: `src/managers/level_manager.js`, `src/simulation/utility_engine.js`, `src/data/levels/sector*.js`

Existe `aiStrategy` a nivel de sector y nivel, y `LevelManager` lo fusiona en `world.aiStrategy`. El `UtilityEngine` lee campos como:

- `focus`
- `preferredEvolution`
- `minEvolutionGarrison`
- `aggressionMult`
- `minPostCaptureGarrison`
- `hazardGarrisonBonus`
- `hazardFatalityRatio`
- `difficultyOverrides`

Esto es buen inicio, pero no permite:

- Configurar una faccion diferente de otra en el mismo nivel.
- Definir sectores con "preceptos" concretos de comportamiento.
- Definir relaciones entre AIs.
- Configurar cooldowns anti-pendulo.
- Configurar politicas de hazard por tipo: insecticida, agua, luz, barrera, zona lenta.
- Definir objetivos o prohibiciones por id/tag de nodo.

Mejora:

- Mantener compatibilidad con `aiStrategy`, pero convertirlo internamente a un `AIProfile` por faccion.
- Permitir `sector.ai` y `level.ai` con overrides profundos.

Ejemplo propuesto:

```js
ai: {
    defaults: {
        doctrine: 'balanced',
        diplomacy: 'antiPlayerWithNeutralExpansion',
        hazardPolicy: 'strict',
        minReserveRatio: 0.22,
        targetCooldownSec: 10,
        recaptureCooldownSec: 16
    },
    factions: {
        enemy: {
            doctrine: 'fortress',
            allowedTargets: ['player', 'neutral'],
            avoidFactions: ['fuego'],
            preferredEvolution: 'espinoso'
        },
        fuego: {
            doctrine: 'raider',
            allowedTargets: ['player', 'neutral'],
            aggressionMult: 1.15
        }
    },
    hazards: {
        insecticide: {
            maxCasualtyRatio: 0.18,
            hardVetoIfNoSafeHop: true,
            preferMobileSafeHops: true
        },
        water: {
            waitForWindow: true,
            panicOnlyWhenNodeThreatened: true
        },
        light: {
            avoidMarkedCaptureIfHitSoonSec: 8,
            evacuateOwnMarkedNodeIfHitSoonSec: 5
        }
    }
}
```

### 3. Hazard awareness demasiado permisiva

Archivos: `src/data/levels/sector3.js`, `src/simulation/ai_scoring.js`, `src/simulation/ai_command_buffer.js`, `src/navigation/nav_graph_store.js`

El sector 3 declara:

```js
hazardFatalityRatio: 0.95
```

Y el hard-veto actual compara:

```js
if (routeResult.projectedCasualties >= estimatedSend * fatalityRatio) {
    return -Infinity;
}
```

Con `0.95`, la AI tolera rutas casi suicidas. El default global en `ai_constants.js` es `0.35`, que ya es agresivo para veneno si el diseno dice "aniquila al contacto".

Ademas:

- Si el origen esta casi lleno (`needsDump`), algunas validaciones de conservacion se relajan.
- `writeAttackCmd()` cambia el ratio de envio a `1.0` si existe cualquier `world.waterSweeps`, aunque la ruta especifica no este en peligro.
- El valor economico de capturar un nodo puede superar la penalizacion de hazard si la perdida estimada parece baja.
- La navegacion estima casualties por longitud/tiempo en hazard, pero la ficcion de nivel trata insecticida como algo mucho mas peligroso.

Mejora:

- Separar hazards de attrition vs hazards letales.
- Para insecticida, usar politica estricta por defecto: max 10%-20% de bajas, o veto absoluto si hay ruta segura alternativa.
- `needsDump` solo debe ignorar reservas cuando el nodo de origen se va a perder por cap o por hazard inminente. No debe ser una excusa generica para suicidar tropas.
- El envio total por water sweep debe vivir solo en `executePanicEvacuation()`, no en cualquier ataque normal de niveles con agua.
- Si una ruta tiene `suggestedDelay`, la AI debe poder esperar en vez de atacar inmediatamente.

### 4. Doomsday y WaterSweep estan desalineados

Archivos: `src/simulation/ai_doomsday.js`, `src/systems/water_sweep.js`, `src/navigation/nav_hazard_evaluator.js`

`WaterSweep` ahora soporta:

- Eventos lineales por direccion.
- Eventos radiales.
- Secuencias de patrones.
- `predictUnsafeUntil()`.
- Barras activas con propiedades como `scalar` o `radius`, no necesariamente `worldX`.

Pero `ai_doomsday.js` todavia calcula amenazas con:

```js
for (const bar of ws._activeBars) {
    if (bar.worldX < node.x) {
        const tti = (node.x - bar.worldX) / Math.max(1, ws.speed);
    }
}
```

Eso rompe o degrada la lectura de agua en niveles modernos. La navegacion temporal si sabe llamar `predictUnsafeUntil()`, pero la capa de panico y veto extra no.

Mejora:

- Reemplazar calculos manuales de agua por una API unica:
  - `world.hazardOracle.predictRouteRisk(from, to, departureTime, squadSize)`
  - `world.hazardOracle.predictNodeThreat(node, horizonSec)`
- `ai_doomsday.js` no debe leer internals de `WaterSweep`; debe usar metodos publicos.

### 5. Bug directo en scoring

Archivo: `src/simulation/ai_scoring.js`

`evaluateAttacks()` usa:

```js
const wRG = w[W_REARGUARD_CHECK];
```

pero `W_REARGUARD_CHECK` no esta importado. Cuando un ataque no neutral llega a esa rama, esto puede producir `ReferenceError` y cortar la evaluacion de AI.

Mejora inmediata:

- Importar `W_REARGUARD_CHECK` desde `ai_constants.js`.
- Agregar un smoke test que importe y ejecute una evaluacion basica de ataque contra player.

### 6. La AI no se resetea claramente al cargar nivel

Archivos: `main.js`, `src/managers/level_manager.js`, `src/managers/ai_manager.js`, `src/simulation/opportunity_analyzer.js`

`OpportunityAnalyzer` tiene un metodo `reset(world)` y `AIManager` tiene `reset()`, pero `LevelManager.loadLevel()` no parece llamar a `ai.reset()` al cargar nivel. Esto puede dejar:

- Timers por faccion.
- Memoria de oportunidades.
- Head de la cola round-robin.
- Ultimo tiempo de captura.

Mejora inmediata:

- Exponer callback `onAIReset` desde `main.js` hacia `LevelManager`, o llamar reset justo antes/despues de `level.loadLevel()`.
- Resetear despues de crear nodos y antes de reanudar partida, para que snapshots empiecen limpios.

### 7. No hay memoria anti-pendulo

Archivos propuestos: `src/simulation/ai_memory.js` o `src/ai/ai_memory.js`

Ahora cada decision se evalua de forma local. Si una AI toma un nodo y otra lo recupera, ambas pueden repetir el intercambio sin evaluar:

- Quien acaba de capturar el nodo.
- Cuantas veces cambio de owner en los ultimos segundos.
- Si el intercambio produce valor neto.
- Si el enemigo esta cebando a la AI para gastar tropas.
- Si el frente esta estancado.

Mejora:

- Registrar por nodo:
  - `lastOwner`
  - `lastOwnerChangeTime`
  - `captureFlipCountWindow`
  - `lastAttackerFaction`
  - `recentAttackersByFaction`
  - `lastFailedAttackByFaction`
- Penalizar ataques a nodos con muchos flips recientes.
- Aplicar `recaptureCooldownSec` salvo que el nodo sea objetivo critico o el jugador este a punto de ganar.
- Agregar "commitment": si la AI decide un plan de expansion, que no cambie de objetivo cada tick salvo emergencia.

### 8. Orden de acciones poco flexible

Archivo: `src/simulation/utility_engine.js`

El flujo actual por nodo es:

1. Panico doomsday.
2. Brace por light.
3. Evolucion.
4. Ataque.
5. Refuerzo si no ataco.

Problema:

- Refuerzo nunca compite realmente con ataque.
- Esperar no compite como accion valida, aunque la ruta tenga `suggestedDelay`.
- Evacuar solo ocurre por doomsday, no por amenaza tactica.
- Evolucion puede bloquear ataque, pero no existe una evaluacion global de "que accion conviene mas ahora".

Mejora:

- Crear candidatos de accion para cada fuente:
  - attack
  - reinforce
  - evolve
  - waitForRouteWindow
  - evacuate
  - hold
- Scoring comun y luego elegir top accion por nodo/faccion.
- Ordenar command buffer por prioridad final, no por orden de iteracion.

## Arquitectura objetivo

La AI deberia moverse hacia un modulo propio, manteniendo `AIManager` como fachada. Dos opciones validas:

Opcion A: mantener bajo `src/simulation/ai_*`

- Menos movimiento de archivos.
- Menos riesgo inmediato.
- Bueno para refactor incremental.

Opcion B: crear `src/ai/`

- Mas claro semanticamente.
- Permite separar simulacion de decision.
- Bueno si se va a seguir expandiendo.

Recomiendo Opcion B a medio plazo, con adaptadores temporales.

Estructura propuesta:

```txt
src/ai/
  ai_manager.js              # Fachada publica, reemplaza gradualmente managers/ai_manager.js
  ai_config.js               # Schema, defaults, merge profundo y validacion
  ai_profiles.js             # Arquetipos y doctrinas
  ai_diplomacy.js            # Relaciones y target filters
  ai_blackboard.js           # Estado percibido por faccion
  ai_memory.js               # Historial de capturas, cooldowns, ataques fallidos
  ai_hazard_oracle.js        # Riesgo de rutas/nodos usando APIs publicas de hazards
  ai_action_scoring.js       # Scoring comun de acciones
  ai_command_planner.js      # Convierte decisiones en comandos
  ai_telemetry.js            # Debug overlay/logs/replay
```

Los modulos existentes pueden quedarse y migrarse:

- `utility_engine.js` pasa a ser el orquestador de decisiones o se divide.
- `ai_scoring.js` se transforma en `ai_action_scoring.js`.
- `ai_doomsday.js` se apoya en `ai_hazard_oracle.js`.
- `ai_command_buffer.js` se mantiene como capa de ejecucion optimizada.

## Sistema de preceptos por sector/nivel/faccion

Los preceptos son reglas de alto nivel que sesgan o vetan acciones sin reescribir codigo.

Tipos recomendados:

- `diplomacy`: define a quien atacar.
- `doctrine`: expansion, turtle, raider, opportunist, scriptedBoss.
- `hazardPolicy`: strict, cautious, normal, reckless, immune.
- `frontPolicy`: mantener frontera, rodear, evitar centro, priorizar choke.
- `economyPolicy`: neutralFirst, productionFirst, denyPlayer, noEarlyEvolve.
- `evolutionPolicy`: preferir/evitar evoluciones por sector.
- `reservePolicy`: reservas minimas por fase y hazard.
- `timingPolicy`: esperar ventanas de agua/luz/barreras.
- `antiPendulumPolicy`: cooldowns y penalizaciones por flips.

Ejemplo de sector con insecticida:

```js
ai: {
    defaults: {
        doctrine: 'cautiousExpansion',
        hazardPolicy: 'strict',
        allowedTargets: ['player', 'neutral'],
        maxRouteCasualtyRatio: 0.18,
        minPostCaptureGarrison: 24,
        recaptureCooldownSec: 14
    },
    hazards: {
        insecticide: {
            lethal: true,
            maxCasualtyRatio: 0.15,
            preferSafeHops: true,
            waitForMobileNode: true
        }
    }
}
```

Ejemplo de nivel con dos AIs que no deben matarse entre si:

```js
ai: {
    diplomacy: {
        enemy: { hostileTo: ['player'], neutralTo: ['fuego'] },
        fuego: { hostileTo: ['player'], neutralTo: ['enemy'] }
    },
    factions: {
        enemy: { doctrine: 'leftFlank', preferredTargets: ['neutral_left', 'player'] },
        fuego: { doctrine: 'rightFlank', preferredTargets: ['neutral_right', 'player'] }
    }
}
```

Ejemplo free-for-all controlado:

```js
ai: {
    diplomacyMode: 'controlledFreeForAll',
    antiPendulum: {
        nodeFlipWindowSec: 30,
        maxFlipsBeforePenalty: 2,
        penaltyPerFlip: 900,
        ceasefireAfterFailedAttackSec: 8
    }
}
```

## Plan de implementacion por fases

### Fase 0 - Fixes de seguridad inmediata

Objetivo: quitar los comportamientos mas peligrosos sin redisenar todo.

Cambios:

- Importar `W_REARGUARD_CHECK` en `ai_scoring.js`.
- Resetear AI al cargar/reiniciar nivel.
- Derivar facciones activas desde el nivel/mundo, no desde lista fija en `main.js`.
- Bajar `hazardFatalityRatio` del sector 3 a un rango estricto (`0.15` a `0.25`).
- Quitar el envio total automatico por `world.waterSweeps` en `writeAttackCmd()` y `writeAttackCmdResolved()`. Dejarlo solo para panico real.
- Agregar veto para `needsDump` si la ruta tiene hazard letal y no es evacuacion.
- Corregir `ai_doomsday.js` para usar `WaterSweep.predictUnsafeUntil()` o una API wrapper.

Riesgo: bajo-medio. Son cambios puntuales, pero tocan decision de AI.

### Fase 1 - Telemetria y pruebas reproducibles

Objetivo: poder ver por que la AI toma una decision.

Cambios:

- Crear `ai_telemetry.js`.
- Guardar para cada decision:
  - faction
  - source node
  - target node
  - accion
  - score total
  - desglose: base, distancia, defensa, hazard, politica, memoria
  - tropas estimadas, bajas proyectadas, garrison restante
  - motivo de veto si lo hubo
- Agregar modo debug visual: al seleccionar una AI, mostrar top 3 candidatos y vetos.
- Crear escenarios de prueba:
  - insecticida con ruta directa suicida y ruta por ferry.
  - agua cruzando ruta.
  - rayo de luz sobre nodo marcado.
  - dos AIs con nodos cercanos para validar anti-pendulo.

Riesgo: bajo. Principalmente observabilidad.

### Fase 2 - Configuracion modular

Objetivo: permitir preceptos por sector, nivel y faccion.

Cambios:

- Crear `ai_config.js`.
- Definir defaults fuertes.
- Implementar merge profundo:
  - defaults globales
  - sector.ai
  - level.ai
  - faction override
  - difficulty override
- Mantener compatibilidad con `aiStrategy` actual mediante adaptador:
  - `focus -> doctrine`
  - `aggressionMult -> aggressionMult`
  - `hazardFatalityRatio -> maxRouteCasualtyRatio`
- Validar campos y avisar en consola si hay keys desconocidas.
- Pasar `AIProfile` resuelto a `AIManager.update()`.

Riesgo: medio. Afecta carga de niveles y perfiles.

### Fase 3 - Diplomacia y filtros de objetivo

Objetivo: detener ataques indeseados entre AIs y controlar free-for-all.

Cambios:

- Crear `ai_diplomacy.js`.
- Implementar `canTargetFaction(profile, sourceFaction, targetOwner)`.
- Diferenciar objetivos:
  - neutral economy
  - player pressure
  - hostile AI
  - allied/ignored
- En `UtilityEngine._classifyNodes()`, no meter todo no-propio como target. Usar diplomacy filter.
- Para niveles con dos AIs, default recomendado:
  - `allowedTargets: ['player', 'neutral']`
  - otras AIs solo si atacan primero o si el nivel lo pide.

Riesgo: medio. Cambia el ritmo de varios niveles.

### Fase 4 - Memoria anti-pendulo

Objetivo: evitar bucles de capturar/recapturar sin avance.

Cambios:

- Crear `ai_memory.js`.
- Actualizar memoria en cada cambio de owner.
- Agregar penalizaciones:
  - `recentFlipPenalty`
  - `recentFailedAttackPenalty`
  - `sameTargetSpamPenalty`
  - `frontlineOverextensionPenalty`
- Agregar cooldowns configurables:
  - `targetCooldownSec`
  - `recaptureCooldownSec`
  - `failedAttackCooldownSec`
- La memoria debe ser por faccion, no global.

Riesgo: medio. Necesita tuning para que la AI no se vuelva pasiva.

### Fase 5 - Hazard oracle unificado

Objetivo: que insecticida, agua, luz, zonas lentas y barreras usen una fuente comun.

Cambios:

- Crear `ai_hazard_oracle.js`.
- API minima:

```js
evaluateRoute(fromNode, toNode, faction, squadSize, departureTime, profile, outRisk)
evaluateNodeThreat(node, faction, horizonSec, profile, outThreat)
```

- Usar internamente:
  - `NavigationSystem.evaluatePath()`
  - `WaterSweep.predictUnsafeUntil()`
  - `LightSweep` prediction
  - hazards estaticos
  - intermittent barriers
- Marcar hazards como:
  - attrition
  - lethal
  - neutralizeNode
  - blocking
  - slow
- Devolver:
  - `isViable`
  - `projectedCasualties`
  - `casualtyRatio`
  - `suggestedDelay`
  - `safeAfterSec`
  - `requiresHop`
  - `riskType`
  - `vetoReason`

Riesgo: medio-alto. Es la pieza central para corregir "se lanza sin importarle el medio".

### Fase 6 - Arbitraje de acciones

Objetivo: comparar acciones en una sola mesa de decision.

Cambios:

- Reemplazar flujo "evolucion -> ataque -> refuerzo" por generacion de candidatos.
- Cada candidato tiene:
  - action type
  - source
  - target
  - estimated send
  - expected result
  - utility score
  - veto reason optional
- Elegir por prioridad:
  - panic/evacuation
  - critical defense
  - high-confidence attack
  - expansion
  - evolution
  - reinforce
  - wait
- El command buffer debe ejecutar ordenado por prioridad y respetar que un nodo no emita dos comandos incompatibles.

Riesgo: alto. Cambia el comportamiento central, conviene despues de telemetry.

### Fase 7 - Tuning por sector

Objetivo: ajustar personalidad y dificultad sin tocar codigo.

Perfiles sugeridos:

- Sector 1:
  - baja agresion
  - neutralFirst
  - sin evoluciones
  - no free-for-all entre AIs salvo niveles especificos
- Sector 2:
  - aprende a usar chokepoints y evoluciones
  - no ataques suicidas contra espinoso
  - preferir refuerzo en cuellos
- Sector 3:
  - hazardPolicy strict
  - esperar ferry/ruta segura
  - prohibir rutas con veneno letal salvo emergencia real
- Sector 4:
  - zonas lentas/rapidas influyen fuerte en score
  - preferir rutas rapidas aunque sean mas largas
- Sector 5:
  - agua como amenaza temporal
  - esperar ventanas
  - evacuar solo si el nodo propio va a ser barrido
- Sector 6:
  - luz y barreras intermitentes
  - no capturar nodos marcados si el reset llega pronto
  - usar puertas abiertas con timing

## Definicion de terminado

La mejora se considera lista cuando:

- La AI no ataca rutas de insecticida letal si existe una alternativa segura razonable.
- La AI espera o redirige ante agua/luz en vez de lanzar tropas ciegamente.
- Dos AIs no entran en pendulo indefinido salvo que el nivel lo configure como free-for-all.
- Cada sector puede cambiar politica de hazard/agresion/diplomacia sin editar codigo de AI.
- Cada nivel puede sobrescribir comportamiento para una faccion especifica.
- Hay debug/log para explicar "por que ataco este nodo".
- Hay pruebas o escenarios reproducibles que validan:
  - hazard veto
  - espera por ventana segura
  - anti-pendulo
  - reset limpio al cambiar nivel
  - facciones activas derivadas del nivel

## Orden recomendado de trabajo

1. Aplicar Fase 0.
2. Agregar telemetry minima de decisiones.
3. Crear `ai_config.js` con adapter de `aiStrategy`.
4. Implementar diplomacia/filtros.
5. Implementar memoria anti-pendulo.
6. Rehacer hazard oracle.
7. Migrar decision a candidatos/arbitraje.
8. Tunear sectores y niveles.

Este orden evita cambiar todo a la vez y permite comprobar en cada paso si el juego se siente mas inteligente sin volverse pasivo.

## Implementacion inicial aplicada

Se aplico una primera tanda de la Fase 0:

- `main.js` ahora deriva las facciones AI activas desde el estado real del mundo, no desde una lista fija.
- `AIManager.reset()` limpia timers y tambien resetea el `OpportunityAnalyzer`.
- `LevelManager.loadLevel()` dispara reset de AI al cambiar/reiniciar nivel.
- `LevelManager` acepta `ai` como alias moderno de `aiStrategy` y fusiona overrides por faccion.
- `UtilityEngine` permite `allowedTargets` por estrategia/faccion/dificultad.
- La diplomacia por defecto evita ataques AI-vs-AI: la AI expande contra neutrales y presiona al jugador, salvo que un nivel habilite otros objetivos.
- `ai_scoring.js` importa `W_REARGUARD_CHECK`, corrigiendo el `ReferenceError` potencial en ataques contra nodos no neutrales.
- El hard-veto de hazards tambien se aplica cuando el origen esta lleno (`needsDump`), para evitar suicidios por insecticida.
- `ai_command_buffer.js` ya no fuerza envio total solo porque el nivel tenga agua; el envio total queda reservado para dumps/evacuaciones reales.
- Sector 3 reduce `hazardFatalityRatio` a valores estrictos para que el insecticida pese de verdad.
- `ai_doomsday.js` usa `WaterSweep.predictUnsafeUntil()` cuando esta disponible y deja de depender solo de `bar.worldX`.

## Implementacion adicional: memoria anti-pendulo

Se agrego una primera version de memoria tactica por faccion:

- Nuevo modulo `src/simulation/ai_memory.js`.
- Cada faccion AI mantiene memoria separada de:
  - ultimo dueno observado por nodo
  - momento del ultimo cambio de dueno
  - cantidad de flips en una ventana corta
  - ultimo ataque emitido por origen y por objetivo
- `UtilityEngine` observa los nodos antes del scoring y expone la memoria activa a `ai_scoring.js`.
- `ai_scoring.js` resta utilidad a objetivos que:
  - fueron atacados hace muy poco
  - acaban de cambiar de dueno
  - estan entrando en ciclo de captura/recaptura
  - salen repetidamente del mismo nodo origen sin pausa
- `ai_command_buffer.js` registra los ataques cuando realmente se escriben al buffer.
- Sector 3 define una politica `antiPendulum` mas estricta porque combina insecticida letal con rutas estrechas y era el sector mas propenso a bucles.

Configuracion disponible por sector, nivel, faccion o dificultad:

```js
ai: {
  antiPendulum: {
    targetCooldownSec: 5,
    sourceCooldownSec: 2,
    recaptureCooldownSec: 10,
    flipWindowSec: 28,
    maxFlipsBeforePenalty: 2,
    recentAttackPenalty: 420,
    flipPenalty: 700,
    sourceRepeatPenalty: 220
  },
  factions: {
    fuego: {
      antiPendulum: {
        recaptureCooldownSec: 14,
        flipPenalty: 950
      }
    }
  },
  difficultyOverrides: {
    hard: {
      antiPendulum: {
        recaptureCooldownSec: 7,
        flipPenalty: 450
      }
    }
  }
}
```

Para desactivar esta capa en un nivel concreto:

```js
ai: {
  antiPendulum: false
}
```

Esto no reemplaza el futuro arbitraje de acciones ni el hazard oracle completo, pero corta el sintoma mas visible del pendulo sin cambiar todas las decisiones de golpe.
