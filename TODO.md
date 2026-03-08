# Proyecto Hormiga (MicroWars: Swarm Tactics) - Task Tracking

## Current Status
The project is a swarm tactics game built with PixiJS and Vanilla JavaScript. It has recently undergone a major refactoring into a modular architecture.

## Main Objectives
- [ ] Fix known issues from the Technical Audit (`auditoria_modular.md`)
    - [ ] Clean up listeners in `InputManager` to prevent memory leaks.
    - [ ] Ensure camera/zoom reset on level restart.
    - [ ] Optimize tunnel drawing in `WorldManager`.
    - [ ] Refine victory detection (exclude units with `pendingRemoval`).
- [ ] Implement new features from the Roadmap
- [ ] Enhance performance for large unit counts

## Completed
- [x] Initial Refactoring/Modularization
- [x] Basic Level System
- [x] Menu and UI Overlay
- [x] Sound System (SFX/Music)
