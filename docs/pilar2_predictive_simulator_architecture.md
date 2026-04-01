# Pilar 2: Simulador Predictivo de Combate y Proyeccion de Estado

## Objetivo

Disenar un `MentalSandbox` capaz de contestar, en background y sin allocation, esta pregunta:

> "Si envio este escuadron ahora, que estado tendra el nodo objetivo cuando yo entre en su radio de influencia, cuanto me desgastara el nodo durante la aproximacion, si gano el intercambio matematico y si completo la captura antes de que el defensor regenere o reciba refuerzos?"

La recomendacion arquitectonica es **no** simular unidades visuales ni frames renderizados. El predictor debe operar sobre un **estado agregado por faccion, clase de unidad y relojes de evento**, y resolver el enfrentamiento con un **solver hibrido por eventos**:

1. Proyectar el nodo objetivo hasta el instante en que el escuadron entra al radio que ya cuenta para combate/captura.
2. Inyectar el escuadron atacante como masa agregada.
3. Resolver combate, mitigaciones defensivas y captura con una agenda discreta de hitos.
4. Clasificar el resultado y escribirlo en un buffer de salida preasignado.

Con esta aproximacion, el coste por simulacion deja de ser `O(unidades)` y pasa a ser `O(eventos_locales)`, que en practica es casi constante.

---

## Hallazgos del runtime actual

El predictor debe alinearse con estas reglas ya presentes en runtime:

- El combate del nodo usa `combatInterval = 0.7s` y una formula de dano por poder, no por cuerpo.
- La captura usa `counts` de cuerpos, no `power`.
- Las unidades empiezan a contar para `counts/power` antes de llegar al centro: cualquier unidad `traveling` dentro de `2.5 * radius` ya participa.
- El estado `idle` se activa al entrar en `1.5 * radius`.
- `espinoso` mata exactamente `1` unidad cada `0.15s` mientras la victima siga en `traveling`.
- `tanque` no solo da `power = 3`; tambien ralentiza la produccion del nodo (`regenInterval * 1.5`).
- El cap de nodo se aplica sobre `population`, y hoy `population` acumula `power`, no cuerpos.
- Si un nodo tiene `tunnelTo` valido, sus nuevas unidades salen directamente hacia el tunel y no se quedan defendiendo el origen.

Deuda tecnica detectada:

- El runtime aun tiene RNG en `combat_manager.killNPower()` y en el splash de `artilleria`.
- Si se quiere equivalencia 1:1 real entre runtime y predictor, ambos kernels deben migrar al mismo modelo determinista.

---

## Arquitectura propuesta

### 1. Capas

#### A. `FutureNodeLedgerBuilder`

Se ejecuta **una vez por ciclo de decision de IA**, no una vez por simulacion.

Responsabilidad:

- Escanear `world.allUnits`.
- Comprimir refuerzos en transito hacia cada nodo en eventos agregados.
- Escribir eventos ordenados por `targetNode`.

Salida:

- `arrivalOffsetByNode[nodeId]`
- `arrivalCountByNode[nodeId]`
- `arrivalTime[eventId]`
- `arrivalFaction[eventId]`
- `arrivalLight[eventId]`
- `arrivalHeavy[eventId]`
- `arrivalFlags[eventId]`

La compresion debe hacerse por `(targetNode, faction, etaBucket, classMask)` para evitar reescanear 3000 unidades por cada simulacion mental.

#### B. `PredictiveCombatSimulator`

Kernel puro, estatico y zero-allocation.

Responsabilidad:

- Leer snapshot del nodo objetivo.
- Proyectarlo hasta `ToA.contact`.
- Inyectar el escuadron atacante.
- Resolver combate/captura hasta exito, derrota o estancamiento.
- Escribir resultado en un buffer de salida.

#### C. `CombatKernel`

Resuelve dano agregado por poder.

#### D. `CaptureKernel`

Resuelve `conquestProgress` como integrador por tramos.

#### E. `DeterministicCasualtyKernel`

Convierte dano agregado a bajas por clase sin RNG.

---

## Modelo de datos zero-allocation

### 1. Estado minimo del nodo

Un nodo debe exponerse al simulador como SoA o como un bloque plano.

```txt
NodeStateBuffer (Float32Array / Int32Array compartidos)

[0] nodeId
[1] ownerFactionId
[2] nodeTypeId
[3] maxPopulationPower
[4] radius
[5] regenIntervalBase
[6] regenTimer
[7] combatTimer
[8] conquestProgress
[9] conqueringFactionId
[10] currentEvolutionId
[11] pendingEvolutionId
[12] pendingEvolutionEtaSec
[13] espinosoTimer
[14] artilleryTimer
[15] tunnelTargetNodeId
[16] arrivalEventOffset
[17] arrivalEventCount
```

### 2. Estado agregado por faccion

Para soportar 2 o mas facciones sin allocations, usar ancho fijo `MAX_FACTIONS`.

```txt
FactionSlices por nodo simulado

lightBodies[f]
heavyBodies[f]
bodyCount[f]      = lightBodies[f] + heavyBodies[f]
powerCount[f]     = lightBodies[f] + 3 * heavyBodies[f]
damageCarry[f]    = dano fraccional acumulado
```

Recomendacion:

- `Uint16Array` para cuerpos.
- `Float32Array` para `powerCount` y `damageCarry`.
- `Uint8Array` para `owner/conquering/evolution/result flags`.

### 3. Buffer del atacante

```txt
AttackerDataBuffer

[0] attackerFactionId
[1] sourceNodeId
[2] lightBodiesSent
[3] heavyBodiesSent
[4] routePowerLossBeforeContact
[5] tEnterDefenseShell
[6] tEnterInfluenceShell
[7] tBecomeIdle
[8] tExitDefenseShell
[9] routeCasualtiesLight
[10] routeCasualtiesHeavy
```

Notas:

- `tEnterInfluenceShell` es el tiempo al radio `2.5R`, no al centro.
- `tBecomeIdle` es el tiempo al radio `1.5R`.
- Si Pilar 1 ya conoce hazards de ruta, debe entregarlos agregados aqui, no recalcularlos en Pilar 2.

### 4. Buffer de salida

```txt
SimResultBuffer

[0] projectedResultCode
[1] estimatedSurvivorsBodies
[2] estimatedSurvivorsPower
[3] estimatedSurvivorsLight
[4] estimatedSurvivorsHeavy
[5] criticalMassAchieved
[6] criticalMassTimeSec
[7] timeToDefenderCollapseSec
[8] timeToCaptureStartSec
[9] timeToFullCaptureSec
[10] finalOwnerFactionId
[11] captureProgressAtStop
[12] stopReasonCode
```

---

## Recomendacion central: solver hibrido por eventos

En vez de iterar frame a frame, el simulador mantiene un reloj local `t` y siempre salta al siguiente hito:

- `t = siguiente regen`
- `t = siguiente refuerzo externo`
- `t = fin de evolucion`
- `t = siguiente pulso espinoso`
- `t = siguiente disparo/impacto artilleria`
- `t = critical mass point`
- `t = colapso de una faccion`
- `t = cambio de tramo de captura`
- `t = captura completa`

Entre hitos, el sistema es lineal por tramos y puede resolverse en cerrado.

Eso deja la complejidad en:

```txt
Construccion del ledger global: O(U + N)
Simulacion puntual: O(E_local + R)
```

Donde:

- `U`: unidades vivas en transito.
- `N`: nodos.
- `E_local`: eventos realmente asociados al nodo objetivo.
- `R`: cambios de regimen del combate (`balanceado`, `aplastante`, `captura congelada`, etc.).

En el caso comun, `E_local` es muy pequeno.

---

## Modulo 1: Proyeccion de estado topologico al tiempo de llegada

## 1. Estado proyectado

Defino el estado local del nodo como:

```txt
S(t) =
{
  owner,
  conqueringFaction,
  conquestProgress,
  evolutionCurrent,
  evolutionPending,
  regenTimer,
  combatTimer,
  L_f(t),   cuerpos ligeros por faccion
  H_f(t),   cuerpos pesados por faccion
  P_f(t)    poder por faccion = L_f + 3H_f
}
```

La proyeccion al tiempo de contacto no debe ser una suma ingenua de produccion. Debe ser:

```txt
S(ToA.contact-) = Phi_local(ToA.contact, S0, Xi_ext)
```

Donde `Xi_ext` es la secuencia de eventos externos ya comprimidos en el ledger:

- refuerzos que llegan al nodo,
- cambios de owner previos al contacto,
- evoluciones que terminan antes del contacto,
- produccion local,
- desgaste por defensas locales sobre terceros ya presentes.

### 2. Produccion pasiva exacta

Para un nodo que produce y cuyo owner actual es `o`:

```txt
I_base(type) =
  0.50  si type = enjambre
  1.25  si type = gigante
  1.00  en otro caso
  +inf  si type = tunel
```

Si la evolucion activa es `tanque`:

```txt
I = 1.5 * I_base
spawnPower = 3
spawnBodies = 1
```

En otro caso:

```txt
I = I_base
spawnPower = 1
spawnBodies = 1
```

El cap real del nodo es por `population power`, no por cuerpos:

```txt
capPowerRemaining = max(0, maxPopulationPower - P_o(t))
capSpawns = floor(capPowerRemaining / spawnPower)
```

Si no hay cambio de evolucion en el tramo:

```txt
generatedBodies(Delta t) =
  min(
    capSpawns,
    floor((regenTimer0 + Delta t) / I)
  )
```

```txt
generatedPower(Delta t) = generatedBodies * spawnPower
```

Si el nodo tiene `tunnelTo` valido y mismo owner, la produccion **no** se suma a la defensa local; se emite como evento de salida.

### 3. Evoluciones pendientes

Para soportar "esta evolucionando", hace falta agregar dos campos que hoy no existen:

```txt
pendingEvolutionId
pendingEvolutionEtaSec
```

La evolucion debe ser modelada como una discontinuidad en `t = t_evo`.

Si `t_evo > ToA.contact`, el nodo sigue con su kernel actual.

Si `t_evo <= ToA.contact`, el estado se parte en dos tramos:

```txt
S(ToA) = Phi_post(
           ToA - t_evo,
           Jump_evo(Phi_pre(t_evo, S0))
         )
```

`Jump_evo()` cambia:

- `currentEvolutionId`
- `regen interval`
- `spawnPower`
- `espinoso/artilleria timers`
- `defense shell metadata`

### 4. Recomendacion sobre ToA

`ToA` no deberia ser un escalar. Deberia ser un bloque con hitos:

```txt
ToA.contact      = entrada a 2.5R
ToA.idle         = entrada a 1.5R
ToA.defenseIn    = entrada al shell defensivo
ToA.defenseOut   = salida del shell defensivo o paso a idle
```

Esto es importante porque:

- el combate/captura empiezan en `2.5R`,
- `espinoso` y `artilleria` solo golpean mientras la tropa sigue `traveling`,
- por tanto existe un tramo donde el escuadron ya cuenta en combate pero aun puede recibir mitigacion defensiva.

---

## Modulo 2: Matriz de resolucion de combate determinista

## 1. Estado agregado de combate

Para el caso de dos lados, el estado minimo es:

```txt
A_L(t), A_H(t), A_P(t) = A_L + 3A_H
D_L(t), D_H(t), D_P(t) = D_L + 3D_H
```

Si hay mas facciones, se usa el mismo kernel por vector fijo `MAX_FACTIONS`, pero la IA normalmente puede consultar el resultado colapsando "atacante foco" vs "resto del nodo".

## 2. Dano base del runtime actual

Con:

```txt
tau = combatInterval = 0.7
alpha = 0.12
beta  = 0.08
```

El dano que la faccion `i` inflige sobre `j` es:

```txt
Damage(i -> j) =
  alpha * min(P_i, P_j)
  + beta * max(0, P_i - 2P_j)
```

En multi-faccion:

```txt
D_j = sum(i != j) Damage(i -> j)
```

### 3. Regimen balanceado

Si el lado fuerte `M` cumple:

```txt
m <= M < 2m
```

con `m = min(P_A, P_D)`, entonces no hay bonus de aplastamiento.

El sistema continuo equivalente es:

```txt
dm/dt = -(alpha / tau) * m
dM/dt = -(alpha / tau) * m
Delta = M - m = constante
```

Solucion cerrada:

```txt
m(t) = m0 * exp(-(alpha / tau) * t)
M(t) = Delta + m(t)
```

### 4. Critical Mass Point

El umbral de masa critica se alcanza cuando:

```txt
M(t_cm) = 2 * m(t_cm)
```

En el regimen balanceado:

```txt
t_cm = (tau / alpha) * ln(m0 / Delta)
```

Valido solo si:

```txt
0 < Delta < m0
```

Interpretacion:

- Si `Delta <= 0`, no existe lado fuerte.
- Si `Delta >= m0`, el bonus `>2x` ya estaba activo al inicio.
- Si el tramo termina por refuerzos/evolucion antes de `t_cm`, no se alcanza masa critica.

### 5. Regimen de superioridad aplastante

Si `P_A > 2P_D`, el sistema pasa a:

```txt
d/dt [P_A]   1/tau [   0    -alpha ] [P_A]
      [P_D] =      [ -beta  2beta-alpha ] [P_D]
```

Es decir:

```txt
dP_A/dt = -(alpha / tau) * P_D
dP_D/dt = -(beta / tau) * P_A + ((2beta - alpha) / tau) * P_D
```

Con `alpha = 0.12` y `beta = 0.08`:

```txt
2beta - alpha = 0.04
```

Este tramo se resuelve con una exponencial matricial `2x2`:

```txt
X(t) = exp(M_A * t) * X0
```

Como `alpha`, `beta` y `tau` son constantes globales, `M_A` y `M_D` pueden precomputarse o resolverse con formula cerrada sin allocation.

Observacion util:

- Una vez que un lado entra realmente en `>2x`, el regimen tiende a mantenerse hasta colapso salvo evento externo fuerte.
- Por eso `criticalMassAchieved` puede setearse una sola vez y reutilizarse como fast-path.

### 6. Conversion de dano a bajas sin RNG

El runtime actual usa azar para consumir dano fraccional. El predictor no debe hacerlo.

Propuesta determinista:

1. Acumular dano fraccional en `damageCarry[f]`.
2. Consumir primero ligeras.
3. Consumir pesadas cuando `damageCarry >= 3`.

Formalmente:

```txt
damageCarry_f += incomingDamage_f

killLight = min(L_f, floor(damageCarry_f))
L_f -= killLight
damageCarry_f -= killLight

killHeavy = min(H_f, floor(damageCarry_f / 3))
H_f -= killHeavy
damageCarry_f -= 3 * killHeavy
```

Ventajas:

- Cero RNG.
- Costo constante.
- Las unidades tanque realmente "absorben" 3 de dano.
- Reproduce la semantica de `power`, no el orden incidental del array `allUnits`.

Si se quiere una fidelidad absoluta con el runtime futuro, `combat_manager` debe migrar a este mismo kernel.

### 7. Mitigacion defensiva previa al nucleo

#### A. Espinoso

Hoy `espinoso` mata exactamente una unidad enemiga cada `0.15s` mientras la unidad siga en `traveling`.

Definir:

```txt
tau_s = 0.15
```

Si el escuadron atacante permanece `T_travel_shell` segundos en estado `traveling` dentro del aura:

```txt
K_esp = floor((espinosoTimer0 + T_travel_shell) / tau_s)
```

Luego:

```txt
applyBodyKills(attacker, K_esp)
```

`applyBodyKills()` debe usar la misma politica determinista de clases que el runtime final.

#### B. Artilleria

La artilleria actual aun no es determinista, asi que no existe hoy una equivalencia 1:1 posible.

Recomendacion:

- Promover `artilleria` a un kernel determinista de presupuesto fijo por impacto.
- Resolverla igual que `espinoso`: como eventos discretos de dano o bajas sobre unidades que siguen en `traveling`.

Hasta que ese cambio exista, el predictor puede:

- o excluir `artilleria` de la decision dura,
- o usar una aproximacion conservadora calibrada,
- pero no afirmar equivalencia estricta.

---

## Modulo 3: Simulacion de la fase de captura

La captura actual del runtime es un integrador por tramos, no un evento instantaneo.

### 1. Seleccion del atacante principal

```txt
mainAttacker =
  la faccion no-owner con mayor bodyCount
```

### 2. Velocidad de captura

Si `mainAttacker` es valido y la faccion del anillo no cambia:

```txt
v_cap =
  0.05 si attackerBodies < 50
  0.35 si attackerBodies > 250
  0.15 en otro caso
```

Pero solo progresa si:

```txt
enemiesBodiesAgainstMain <= 3
```

Si `enemiesBodiesAgainstMain > 3`, la captura se congela:

```txt
dC/dt = 0
```

Si el anillo pierde soporte o cambia de faccion:

```txt
dC/dt = -0.5
```

Si progresa:

```txt
dC/dt = v_cap
```

Por tanto, la captura se modela como:

```txt
C(t + Delta t) = clamp01(C(t) + slope * Delta t)
```

con `slope` en:

```txt
{-0.5, 0, +0.05, +0.15, +0.35}
```

### 3. Tiempo de captura cerrado en un tramo estable

Si el tramo es estable y `slope > 0`:

```txt
t_full_capture = (1 - C0) / slope
```

Si `slope <= 0`, no existe captura completa en ese tramo.

### 4. Produccion residual y refuerzos

Durante la captura, el nodo puede seguir:

- generando defensor(es),
- recibiendo refuerzos,
- matando al atacante con `espinoso`,
- cambiando de tramo por umbral de `3`, `50` o `250` cuerpos.

Por eso no basta con preguntar "quedan supervivientes". Hay que comprobar:

```txt
Existe una secuencia de tramos en la que C(t) alcanza 1 antes de:
  - A_body(t) = 0
  - un evento externo que cambie el mainAttacker
  - un evento que fuerce slope <= 0 durante demasiado tiempo
```

La forma correcta es seguir la agenda de eventos y recalcular `slope` solo en cambios de umbral.

### 5. Condicion de sostener la captura

Una victoria es sostenible si, al menos hasta:

```txt
H = ToA.contact + t_full_capture
```

se cumple:

```txt
mainAttacker = faccion atacante
```

y no aparece un tramo posterior en el que:

```txt
dC/dt < 0 antes de owner swap
```

Una vez hecho el `owner swap`, la simulacion debe continuar unos segundos de seguridad para clasificar:

- `Victoria_Segura`
- `Victoria_Pirrica`

---

## Clasificacion del resultado

### `Victoria_Segura`

Se produce si:

- el owner cambia al atacante,
- el atacante mantiene control tras la captura en la ventana de seguridad,
- y el margen de poder final es positivo y no trivial.

Sugerencia de regla:

```txt
ownerFinal = attacker
AND
P_att_final >= 1.25 * P_hostil_en_ventana
```

### `Victoria_Pirrica`

Se produce si:

- el owner cambia al atacante,
- pero el margen final es fragil.

Regla:

```txt
ownerFinal = attacker
AND
0 < P_att_final < 1.25 * P_hostil_en_ventana
```

### `Empate_Estancado`

Se produce si:

- no hay owner swap dentro del horizonte,
- o el anillo queda congelado,
- o el sistema entra en un equilibrio que no converge rapido.

Regla util:

```txt
ownerFinal != attacker
AND
abs(dP_relativo) < epsilon
AND
dC/dt <= 0
```

### `Derrota`

Se produce si:

- el atacante pierde toda capacidad de captura,
- o el defensor/tercero toma el control del nodo antes,
- o el horizonte termina con captura imposible.

---

## API interna propuesta

Firma recomendada del hot path:

```js
PredictiveCombatSimulator.simulateEngagement(
  attackerDataBuffer,
  defenderStateBuffer,
  toaBuffer,
  resultBuffer
);
```

Si se quiere conservar la firma pedida conceptualmente:

```js
simulateEngagement(attackerDataBuffer, defenderStateBuffer, ToA)
```

entonces `ToA` debe ser tambien un buffer estructurado y el retorno debe ser un **view pooled** sobre `resultBuffer`, no un objeto nuevo.

### Semantica

1. `projectNodeUntilContact()`
2. `injectAttackerAtContact()`
3. `simulateShellTraversalUntilIdle()`
4. `resolveCombatAndCapture()`
5. `classifyResult()`

### Minimo contractual de salida

```txt
projectedResult
estimatedSurvivors
criticalMassAchieved
timeToFullCapture
```

### Salida recomendada real

Tambien deberia incluir:

```txt
estimatedSurvivorsPower
estimatedLightSurvivors
estimatedHeavySurvivors
criticalMassTime
timeToDefenderCollapse
timeToCaptureStart
finalOwner
captureProgressAtStop
stopReason
```

---

## Pseudoflujo del solver

```txt
load snapshot -> scratch local
project external node timeline until ToA.contact
inject attacker as traveling-in-shell
apply route casualties already conocidas

while t < horizon:
  nextEvent = min(
    nextRegen,
    nextArrival,
    nextEvolution,
    nextEspinosoPulse,
    nextArtilleryImpact,
    criticalMassPoint,
    defenderCollapse,
    captureThresholdChange,
    fullCapture
  )

  solve current regime in closed form until nextEvent
  apply event jump
  recompute owner/mainAttacker/captureSlope/regime
  early-exit if result decisive

write resultBuffer
```

---

## Coste computacional esperado

### Coste por simulacion

Sin reescanear unidades globales:

```txt
O(1) amortizado
```

o mas precisamente:

```txt
O(E_local + R)
```

Con:

- `E_local` pequeno por nodo.
- `R` muy pequeno porque los cambios de regimen son escasos.

### Coste de memoria

Fijo y preasignado:

- scratch local por simulador,
- ledger global por ciclo de IA,
- buffers de salida por worker/slot.

No hay arrays dinamicos ni objetos temporales en el hot path.

---

## Recomendaciones de implementacion para lograr equivalencia real

1. Migrar `combat_manager.killNPower()` a `DeterministicCasualtyKernel`.
2. Migrar `artilleria` a un presupuesto fijo determinista por impacto.
3. Cambiar regen a un acumulador determinista con `while (timer >= interval)` para evitar drift por FPS.
4. Exponer desde navegacion no un `ToA` escalar sino hitos:
   - `defenseIn`
   - `contact`
   - `idle`
   - `defenseOut`
5. Construir el ledger de futuros eventos una vez por ciclo de IA.
6. Mantener el predictor como kernel puro sin depender de `world.allUnits`.

---

## Conclusion

La mejor arquitectura para este Pilar 2 no es un "mini juego" que reitere frames, sino un **solver hibrido, topologico y orientado a eventos** con:

- estado agregado por faccion y clase,
- agenda local de eventos discretos,
- combate resuelto por tramos cerrados,
- captura resuelta como integrador lineal por tramos,
- y un ledger global de refuerzos ya comprimidos.

Eso permite una IA que razona en futuro real, evita ataques suicidas, respeta zero-allocation y queda preparada para lockstep determinista.
