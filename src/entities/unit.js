/**
 * Clase Unit ('Hormiga')
 *
 * COMPORTAMIENTO EN 3 FASES:
 *  1. VUELO DIRECTO: Sprint al nodo destino
 *  2. APROXIMACION ENVOLVENTE: Rodea el nodo desde su angulo personal
 *  3. DENTRO DEL NODO: Orbita en su posicion personal girando lentamente
 *
 * PROPIEDADES RTS:
 *  - faction: 'player' | 'enemy' | 'neutral'
 *  - state: 'idle' | 'traveling'
 *  - targetNode: el nodo que persigue actualmente
 *
 * RENDERIZADO: Usa PIXI.Sprite asignado externamente desde main.js
 */
import { mixSeeds, reseedUnitFormation, seedUnitDeterministicState } from '../simulation/deterministic_layout.js';

export class Unit {
    constructor(x, y, faction, seed = 1) {
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.speed = 75; // Reducido a la mitad (antes 150)
        this.speedMult = 1; // Multiplicador para tuneles logisticos
        this.power = 1; // Potencia base para combate (Tanques = 3)
        this.pendingRemoval = false; // Flag para eliminacion segura al final del frame

        // Faccion y estado RTS
        this.faction = faction || 'neutral';
        this.state = 'idle'; // 'idle' o 'traveling'
        this.targetNode = null;
        this.homeNode = null; // Nodo de origen al nacer (para retiradas)

        // Visual (angulo para orientar el sprite)
        this.angle = 0;

        // Posicion personal dentro del nodo (distribucion uniforme con raiz)
        this.personalR = 0;
        this.personalTheta = 0;

        // Cache nodo anterior para detectar cambio
        this._lastTargetX = 0;
        this._lastTargetY = 0;

        // Sprite de PixiJS; se asigna desde main.js al crear la unidad
        this.sprite = null;

        seedUnitDeterministicState(this, seed);
    }

    /**
     * @param {number} dt  Tiempo transcurrido en segundos (delta time)
     * @param {number} targetX
     * @param {number} targetY
     * @param {number} nodeRadius
     * @param {Array}  neighborIds
     * @param {Array}  unitsList
     * @param {SpatialHashGrid|null} grid
     * @param {object|null} localAvoidanceSolver
     */
    updateForces(dt, targetX, targetY, nodeRadius, neighborIds, unitsList, grid = null, localAvoidanceSolver = null) {
        // Detectar cambio de nodo y reasignar posicion personal de forma determinista.
        if (targetX !== this._lastTargetX || targetY !== this._lastTargetY) {
            const targetSeed = mixSeeds(
                this.deterministicSeed != null ? this.deterministicSeed : 1,
                (Math.imul(targetX | 0, 73856093) ^ Math.imul(targetY | 0, 19349663)) >>> 0
            );
            reseedUnitFormation(this, targetSeed);
            this._lastTargetX = targetX;
            this._lastTargetY = targetY;
        }

        const APPROACH_ZONE = nodeRadius * 4;
        let dx = targetX - this.x;
        let dy = targetY - this.y;
        let distToCenter = Math.sqrt(dx * dx + dy * dy);

        let desiredVx = 0;
        let desiredVy = 0;
        let actualSpeed = this.speed * this.speedMult * (this.currentZoneMult || 1.0);

        if (distToCenter > 0.01) {
            if (distToCenter > APPROACH_ZONE) {
                desiredVx = (dx / distToCenter) * actualSpeed;
                desiredVy = (dy / distToCenter) * actualSpeed;
            } else if (distToCenter > nodeRadius) {
                let t = (distToCenter - nodeRadius) / (APPROACH_ZONE - nodeRadius);
                let currentRadius = nodeRadius + t * (APPROACH_ZONE - nodeRadius) * 0.6;

                let approachX = targetX + Math.cos(this.personalTheta) * currentRadius;
                let approachY = targetY + Math.sin(this.personalTheta) * currentRadius;
                let aDx = approachX - this.x;
                let aDy = approachY - this.y;
                let distA = Math.sqrt(aDx * aDx + aDy * aDy);
                if (distA > 0.5) {
                    desiredVx = (aDx / distA) * actualSpeed;
                    desiredVy = (aDy / distA) * actualSpeed;
                }
            } else {
                let px = targetX + Math.cos(this.personalTheta) * this.personalR * nodeRadius;
                let py = targetY + Math.sin(this.personalTheta) * this.personalR * nodeRadius;
                let hDx = px - this.x;
                let hDy = py - this.y;
                let distH = Math.sqrt(hDx * hDx + hDy * hDy);

                if (distH > 1.0) {
                    let factor = Math.min(distH / 10, 1.0) * 0.8;
                    desiredVx = (hDx / distH) * actualSpeed * factor;
                    desiredVy = (hDy / distH) * actualSpeed * factor;
                } else {
                    this.vx *= 0.1;
                    this.vy *= 0.1;
                    desiredVx = hDx * 5;
                    desiredVy = hDy * 5;
                }
            }
        }

        let sepVx = 0;
        let sepVy = 0;
        if (distToCenter <= APPROACH_ZONE) {
            for (let i = 0; i < neighborIds.length; i++) {
                let other = unitsList[neighborIds[i]];
                if (!other || other === this || other.pendingRemoval) continue;
                let ox = this.x - other.x;
                let oy = this.y - other.y;
                let dist2 = ox * ox + oy * oy;
                const SEP_DIST = 14;
                if (dist2 < SEP_DIST * SEP_DIST && dist2 > 0.2) {
                    let d = Math.sqrt(dist2);
                    let strength = (1 - d / SEP_DIST) * 45;
                    sepVx += (ox / d) * strength;
                    sepVy += (oy / d) * strength;
                }
            }
        }

        let tVx = desiredVx + sepVx;
        let tVy = desiredVy + sepVy;
        if (localAvoidanceSolver && grid) {
            const adjustedVelocity = localAvoidanceSolver.solve(
                this,
                desiredVx,
                desiredVy,
                sepVx,
                sepVy,
                actualSpeed,
                grid
            );
            tVx = adjustedVelocity[0];
            tVy = adjustedVelocity[1];
        }

        const lerpFactor = 1 - Math.exp(-7.5 * dt);
        this.vx += (tVx - this.vx) * lerpFactor;
        this.vy += (tVy - this.vy) * lerpFactor;

        if (this.vx !== 0 || this.vy !== 0) {
            this.angle = Math.atan2(this.vy, this.vx);
        }
    }

    updatePosition(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        if (this.sprite) {
            this.sprite.x = this.x;
            this.sprite.y = this.y;
            this.sprite.rotation = this.angle;
        }
    }

    /** Destruye el sprite de Pixi al morir la unidad */
    destroy() {
        if (this.sprite) {
            this.sprite.destroy();
            this.sprite = null;
        }
    }
}
