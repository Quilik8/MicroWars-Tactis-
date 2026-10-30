# MicroWars: Swarm Tactics

RTS web de conquista mediante enjambres, con una campaña estratégica por turnos en un jardín orgánico.

## Ejecutar

Desde esta carpeta, ejecutar `python -m http.server 5173 --bind 127.0.0.1` y abrir `http://127.0.0.1:5173`. Seleccionar **Modo campaña**. El jardín empieza con el mapa completo; arrastrar y usar zoom para explorar, **Ver jardín** para recuperar la vista general, **Detalles** para el panel y **Ocultar controles** para despejar la pantalla. Un guardado compatible continúa la campaña; sin guardado se elige una de las seis facciones. Las escaramuzas siguen disponibles mediante **Jugar**.

PixiJS 8.9.1 se distribuye localmente en `src/vendor`, con su licencia MIT. No se descarga desde una CDN al iniciar. La integración de CrazyGames fue retirada.

## Diseño y estado

- [Campaña: reglas, arquitectura y evaluación](docs/CAMPAIGN.md).
- [Validación y revisión visual](docs/CAMPAIGN_VALIDATION.md).
- [GDD del juego](Mapa%20del%20dise%C3%B1o%20del%20juego.txt).

La campaña incluye atlas de 300 territorios, turnos, ejército persistente, economía, mejoras, mutaciones, información militar parcial, combate automático multibando, retirada, comandantes, enclaves, depredadores, sucesos y objetivos. Sus cifras y posiciones iniciales son provisionales hasta evaluarlas jugando. La campaña se puede completar sin abrir el RTS. Las plantillas tácticas y sus nuevos enemigos se incorporarán después, una a una.

`singularity-game/` es una demo de otro juego. No forma parte del arranque o la distribución de MicroWars.

## Comprobar y empaquetar

```powershell
npm run test:campaign
# Con el servidor local anterior activo y Chrome o Edge instalado:
node tools/campaign-browser-check.cjs
npm run build
```

El build copia el juego a `dist/`. Tauri utiliza ese directorio para empaquetar escritorio. La campaña se guarda en almacenamiento local, separada del progreso de escaramuzas. El modo automático usa guardados v5 y requiere campaña nueva; conserva el guardado anterior como respaldo.

## Rendimiento y siguiente etapa

Ver [revisión de rendimiento](docs/PERFORMANCE.md) para mediciones, optimizaciones y límites pendientes. La campaña automática ya está activada. El siguiente trabajo de contenido podrá incorporar enemigos y plantillas RTS sobre sus contratos, después de ajustar rutas, duración y equilibrio con partidas humanas.
