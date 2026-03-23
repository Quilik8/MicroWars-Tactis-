/**
 * Clase Unit ('Hormiga')
 *
 * COMPORTAMIENTO EN 3 FASES:
 *  1. VUELO DIRECTO: Sprint al nodo destino
 *  2. APROXIMACIÓN ENVOLVENTE: Rodea el nodo desde su ángulo personal
 *  3. DENTRO DEL NODO: Orbita en su posición personal girando lentamente
 *
 * PROPIEDADES RTS:
 *  - faction: 'player' | 'enemy' | 'neutral'
 *  - state: 'idle' | 'traveling'
 *  - targetNode: el nodo que persigue actualmente
 *
 * RENDERIZADO: Usa PIXI.Sprite asignado externamente desde main.js
 */
export class Unit {
    constructor(x, y, faction) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 2;
        this.vy = (Math.random() - 0.5) * 2;
        this.speed = 75; // Reducido a la mitad (antes 150)
        this.speedMult = 1; // Multiplicador para túneles logísticos
        this.power = 1; // Potencia base para combate (Tanques = 3)
        this.pendingRemoval = false; // Flag para eliminación segura al final del frame

        // Facción y estado RTS
        this.faction = faction || 'neutral';
        this.state = 'idle'; // 'idle' o 'traveling'
        this.targetNode = null;
        this.homeNode = null; // Nodo de origen al nacer (para retiradas)

        // Visual (ángulo para orientar el sprite)
        this.angle = Math.random() * Math.PI * 2;

        // Posición personal dentro del nodo (distribución uniforme con √)
        this.personalR = Math.sqrt(Math.random()) * 0.98;
        this.personalTheta = Math.random() * Math.PI * 2;

        // Cache nodo anterior para detectar cambio
        this._lastTargetX = 0;
        this._lastTargetY = 0;

        // Sprite de PixiJS —  se asigna desde main.js al crear la unidad
        this.sprite = null;
    }

    /**
     * @param {number} dt  Tiempo transcurrido en segundos (delta time)
     * @param {number} targetX
     * @param {number} targetY
     * @param {number} nodeRadius
     * @param {Array}  neighborIds
     * @param {Array}  unitsList
     */
    updateForces(dt, targetX, targetY, nodeRadius, neighborIds, unitsList) {
        // Detectar cambio de nodo → reasignar posición personal
        if (targetX !== this._lastTargetX || targetY !== this._lastTargetY) {
            this.personalTheta = Math.random() * Math.PI * 2;
            // Distribución uniforme con √ — usar 0.98 para llenar casi todo el radio
            this.personalR = Math.sqrt(Math.random()) * 0.98;
            this._lastTargetX = targetX;
            this._lastTargetY = targetY;
        }

        const APPROACH_ZONE = nodeRadius * 4;
        let dx = targetX - this.x;
        let dy = targetY - this.y;
        let distToCenter = Math.sqrt(dx * dx + dy * dy);

        let desiredVx = 0, desiredVy = 0;
        let actualSpeed = this.speed * this.speedMult * (this.currentZoneMult || 1.0);

        if (distToCenter > 0.01) {
            if (distToCenter > APPROACH_ZONE) {
                // ─── FASE 1: VUELO DIRECTO ───
                desiredVx = (dx / distToCenter) * actualSpeed;
                desiredVy = (dy / distToCenter) * actualSpeed;
            } else if (distToCenter > nodeRadius) {
                // ─── FASE 2: APROXIMACIÓN ENVOLVENTE ───
                let t = (distToCenter - nodeRadius) / (APPROACH_ZONE - nodeRadius); // 0..1
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
                // ─── FASE 3: DENTRO DEL NODO ───
                let px = targetX + Math.cos(this.personalTheta) * this.personalR * nodeRadius;
                let py = targetY + Math.sin(this.personalTheta) * this.personalR * nodeRadius;
                let hDx = px - this.x;
                let hDy = py - this.y;
                let distH = Math.sqrt(hDx * hDx + hDy * hDy);

                if (distH > 1.0) {
                    // Atracción suave pero progresiva
                    let factor = Math.min(distH / 10, 1.0) * 0.8;
                    desiredVx = (hDx / distH) * actualSpeed * factor;
                    desiredVy = (hDy / distH) * actualSpeed * factor;
                } else {
                    // "Snap" suave: cuando está muy cerca, desacelerar drásticamente para evitar oscilaciones
                    this.vx *= 0.1;
                    this.vy *= 0.1;
                    desiredVx = hDx * 5;
                    desiredVy = hDy * 5;
                }
            }
        }

        // ── SEPARACIÓN SUAVE (solo en proximidad del nodo) ──
        let sepVx = 0, sepVy = 0;
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

        // FÍSICA INDEPENDIENTE DE FPS:
        // Usamos un factor de suavizado basado en dt (aprox 7.5 unidades de velocidad por segundo)
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

        // Sincronizar el sprite de Pixi con la posición matemática
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
