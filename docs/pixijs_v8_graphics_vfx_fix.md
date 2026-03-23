# Registro Técnico: Problema de Invisibilidad de VFX en PixiJS v8

Este documento detalla el error crítico que causó que los efectos visuales (balas de artillería y chispas de batalla) fueran invisibles, a pesar de que el código de lógica y dibujo parecía correcto. 

## Síntomas
- Los nodos de artillería disparaban según la lógica (consumían cooldown, sonaba el SFX), pero no se veía ningún proyectil.
- En las batallas no aparecían las chispas internas de los nodos.
- Otros elementos como los túneles (`tunnelGraphics`) sí eran visibles.

## Causa Raíz: Arquitectura de PixiJS v8
PixiJS v8 introdujo cambios profundos en cómo se manejan los objetos `Graphics`. A diferencia de versiones anteriores donde cada objeto `Graphics` era una lista de comandos de dibujo inmediata, en v8:

1. **"Graphics Is About Building, Not Drawing"**: Llamar a `.rect()`, `.circle()`, o `.stroke()` no dibuja nada de inmediato; construye un **blueprint de geometría** dentro de un `GraphicsContext`.
2. **Limitación del `clear()`**: La documentación oficial de v8 advierte: ***"Do not clear and rebuild graphics every frame"*** sobre objetos individuales si se puede evitar.
3. **Problema del Pool**: El sistema anterior usaba un `bulletPool` de cientos de objetos `PIXI.Graphics` individuales. Cada bala o chispa llamaba a `.clear()` al nacer o cada frame. En v8, este ciclo constante de `clear()` y reconstrucción de geometría en cientos de objetos distintos provocaba que el motor de renderizado los omitiera o no tuviera tiempo de subirlos a la GPU antes de que volvieran a limpiarse.

## La Solución: Dibujo Centralizado (Patrón v8)
Se eliminó la dependencia de un pool de objetos `Graphics` pesados para VFX dinámicos. En su lugar, se adoptó el patrón de **"Batching Manual"**:

### 1. Graphics Estáticos Compartidos
En `world_manager.js`, se crearon dos objetos únicos:
- `vfxGraphics`: Para toda la artillería de todos los nodos.
- `sparksGraphics`: Para toda la chispas de todos los nodos.

### 2. Ciclo de Vida por Frame
1. **Inicio del Frame**: `world_manager` llama a `.clear()` una sola vez en estos dos objetos compartidos.
2. **Update de Nodos**: Cada `node.update()` recibe estas referencias y **acumula** sus dibujos en ellas.
3. **Datos Planos**: Las balas y chispas ahora son objetos de JavaScript simples `{ x, y, vx, vy, color, timer }` (muy ligeros) en lugar de objetos `PIXI.Graphics` completos.

```javascript
// Ejemplo del nuevo patrón eficiente:
update(dt, grid, allUnits, vfxGraphics, sparksGraphics) {
    // 1. Limpiar datos viejos
    this.activeShots = this.activeShots.filter(s => s.timer > 0);
    
    // 2. Acumular dibujos en el Graphics compartido
    for (const shot of this.activeShots) {
        vfxGraphics.moveTo(shot.ox, shot.oy).lineTo(tex, tey);
        vfxGraphics.stroke({ color: shot.color, width: 3 });
    }
}
```

## Reglas de Oro para el Futuro
> [!IMPORTANT]
> **NUNCA** crees un pool de objetos `PIXI.Graphics` individuales que llamen a `.clear()` frecuentemente.

> [!TIP]
> Si algo necesita dibujarse y borrarse cada frame (VFX, láseres, indicadores), usa un **único `PIXI.Graphics` global** y dibuja todo en él durante el frame. Es mucho más rápido para la GPU y garantiza visibilidad en PixiJS v8.

---
*Este registro se creó tras la sesión de depuración del 17 de marzo de 2026.*
