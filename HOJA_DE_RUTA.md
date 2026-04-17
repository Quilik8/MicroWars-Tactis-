# Hoja de ruta: Mapa del Proyecto

./
├── .gitignore
├── HOJA_DE_RUTA.md
├── index.html
├── main.js
├── style.css
├── Mapa del diseño del juego.txt
├── campaign/
│   └── (vacío)
├── docs/
│   ├── pilar2_predictive_simulator_architecture.md
│   └── pixijs_v8_graphics_vfx_fix.md
└── src/
    ├── assets/
    │   └── campaign_bg.png
    ├── campaign/
    │   ├── campaign_core.js
    │   ├── faction_data.js
    │   ├── map_logic.js
    │   ├── map_visuals.js
    │   └── state_manager.js
    ├── core/
    │   ├── engine.js
    │   └── logic_grid.js
    ├── data/
    │   └── levels.js
    ├── entities/
    │   ├── node.js
    │   ├── node_renderer.js
    │   └── unit.js
    ├── managers/
    │   ├── ai_manager.js
    │   ├── audio.js
    │   ├── combat_manager.js
    │   ├── input_manager.js
    │   ├── level_manager.js
    │   ├── physics_manager.js
    │   ├── ui_manager.js
    │   └── world_manager.js
    ├── navigation/
    │   └── navigation_system.js
    ├── simulation/
    │   ├── deterministic_layout.js
    │   ├── deterministic_rules.js
    │   ├── opportunity_analyzer.js
    │   ├── optimal_deployment_solver.js
    │   ├── predictive_combat_simulator.js
    │   └── utility_engine.js
    └── systems/
        ├── intermittent_barrier.js
        ├── light_sweep.js
        └── water_sweep.js
