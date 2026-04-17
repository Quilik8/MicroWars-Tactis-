const RADIAL_SAMPLE_STEPS = 18;
const FUTURE_SPAWN_LOOKAHEAD = 10;

function clamp01(value) {
    if (value <= 0) return 0;
    if (value >= 1) return 1;
    return value;
}

function normalizeVector(x, y) {
    const length = Math.hypot(x, y) || 1;
    return { x: x / length, y: y / length };
}

function resolveDirectionVector(direction, directionX, directionY) {
    if (typeof directionX === 'number' || typeof directionY === 'number') {
        return normalizeVector(directionX || 0, directionY || 0);
    }

    switch (direction) {
        case 'left': return { x: -1, y: 0 };
        case 'up': return { x: 0, y: -1 };
        case 'down': return { x: 0, y: 1 };
        case 'down-right': return normalizeVector(1, 1);
        case 'down-left': return normalizeVector(-1, 1);
        case 'up-right': return normalizeVector(1, -1);
        case 'up-left': return normalizeVector(-1, -1);
        case 'right':
        default:
            return { x: 1, y: 0 };
    }
}

function dot(x1, y1, x2, y2) {
    return (x1 * x2) + (y1 * y2);
}

function getScalarOverlapExit(unitPos, unitVel, duration, bandPos, bandWidth, bandSpeed) {
    const relV = unitVel - bandSpeed;

    if (Math.abs(relV) < 1e-5) {
        if (unitPos >= bandPos && unitPos <= bandPos + bandWidth) {
            return duration;
        }
        return -1;
    }

    const t1 = (bandPos - unitPos) / relV;
    const t2 = ((bandPos + bandWidth) - unitPos) / relV;
    const enter = t1 < t2 ? t1 : t2;
    const exit = t1 > t2 ? t1 : t2;

    if (exit < 0 || enter > duration) return -1;
    return exit > duration ? duration : exit;
}

function isInsideAnnulus(distance, innerRadius, outerRadius) {
    return distance >= innerRadius && distance <= outerRadius;
}

export class WaterSweep {
    constructor(config) {
        this.speed = config.speed || 20;
        this.widthFrac = config.width || 0.032;
        this.cooldown = config.cooldown || 32;
        this.initialDelay = config.initialDelay || 8;
        this.alertDuration = config.alertDuration || 3;

        const rawColor = config.color || 0x0097a7;
        this.color = rawColor;
        this.colorCss = '#' + rawColor.toString(16).padStart(6, '0');
        this.alpha = config.alpha || 0.42;

        this._spawnTimer = this.initialDelay;
        this._isAlerting = false;
        this._alertTimer = 0;
        this._activeBars = [];
        this._gfx = null;
        this._barWorldWidth = null;

        this._patterns = this._normalizePatterns(config);
        this._nextPatternIndex = 0;
    }

    _normalizePatterns(config) {
        const rawPatterns = Array.isArray(config.sequence) && config.sequence.length > 0
            ? config.sequence
            : [config];

        return rawPatterns.map((entry) => ({
            kind: entry.kind || entry.mode || config.kind || config.mode || 'line',
            direction: entry.direction || config.direction || 'right',
            directionX: entry.directionX ?? config.directionX,
            directionY: entry.directionY ?? config.directionY,
            widthFrac: entry.width || entry.widthFrac || config.width || config.widthFrac || 0.032,
            speed: entry.speed || config.speed || 20,
            centerX: entry.centerX ?? config.centerX ?? 0.5,
            centerY: entry.centerY ?? config.centerY ?? 0.5,
            startRadius: entry.startRadius ?? config.startRadius,
            color: entry.color || config.color || 0x0097a7,
            alpha: entry.alpha ?? config.alpha ?? 0.42
        }));
    }

    initGraphics(PIXI, layerVFX) {
        this._gfx = new PIXI.Graphics();
        layerVFX.addChild(this._gfx);
    }

    destroy() {
        if (this._gfx && !this._gfx.destroyed) {
            this._gfx.destroy();
        }
        this._gfx = null;
    }

    _resolvePattern(pattern, worldWidth, worldHeight) {
        if ((pattern.kind || 'line') === 'radial') {
            const minDim = Math.min(worldWidth, worldHeight);
            const width = (pattern.widthFrac || this.widthFrac) * minDim;
            const speed = pattern.speed || this.speed;
            const centerX = (pattern.centerX ?? 0.5) * worldWidth;
            const centerY = (pattern.centerY ?? 0.5) * worldHeight;
            const maxRadius = Math.max(
                Math.hypot(centerX, centerY),
                Math.hypot(worldWidth - centerX, centerY),
                Math.hypot(centerX, worldHeight - centerY),
                Math.hypot(worldWidth - centerX, worldHeight - centerY)
            );
            const startRadius = typeof pattern.startRadius === 'number'
                ? pattern.startRadius * minDim
                : (-width - (speed * 4));

            return {
                kind: 'radial',
                width,
                speed,
                centerX,
                centerY,
                startRadius,
                maxRadius,
                color: pattern.color || this.color,
                alpha: pattern.alpha ?? this.alpha
            };
        }

        const dir = resolveDirectionVector(pattern.direction, pattern.directionX, pattern.directionY);
        const tx = -dir.y;
        const ty = dir.x;
        const width = (pattern.widthFrac || this.widthFrac) * worldWidth;
        const speed = pattern.speed || this.speed;
        const projections = [
            dot(0, 0, dir.x, dir.y),
            dot(worldWidth, 0, dir.x, dir.y),
            dot(0, worldHeight, dir.x, dir.y),
            dot(worldWidth, worldHeight, dir.x, dir.y)
        ];
        let minScalar = projections[0];
        let maxScalar = projections[0];
        for (let i = 1; i < projections.length; i++) {
            if (projections[i] < minScalar) minScalar = projections[i];
            if (projections[i] > maxScalar) maxScalar = projections[i];
        }

        const halfLen = Math.hypot(worldWidth, worldHeight) * 1.5;
        let hudEdge = 'left';
        if (Math.abs(dir.x) >= Math.abs(dir.y)) {
            hudEdge = dir.x >= 0 ? 'left' : 'right';
        } else {
            hudEdge = dir.y >= 0 ? 'top' : 'bottom';
        }

        return {
            kind: 'line',
            width,
            speed,
            nx: dir.x,
            ny: dir.y,
            tx,
            ty,
            minScalar,
            maxScalar,
            startScalar: minScalar - width - (speed * 4),
            halfLen,
            hudEdge,
            color: pattern.color || this.color,
            alpha: pattern.alpha ?? this.alpha
        };
    }

    _spawnPattern(worldWidth, worldHeight) {
        const pattern = this._patterns[this._nextPatternIndex];
        const resolved = this._resolvePattern(pattern, worldWidth, worldHeight);
        this._nextPatternIndex = (this._nextPatternIndex + 1) % this._patterns.length;

        if (resolved.kind === 'radial') {
            return {
                kind: 'radial',
                radius: resolved.startRadius,
                width: resolved.width,
                speed: resolved.speed,
                centerX: resolved.centerX,
                centerY: resolved.centerY,
                maxRadius: resolved.maxRadius,
                color: resolved.color,
                alpha: resolved.alpha
            };
        }

        return {
            kind: 'line',
            scalar: resolved.startScalar,
            width: resolved.width,
            speed: resolved.speed,
            nx: resolved.nx,
            ny: resolved.ny,
            tx: resolved.tx,
            ty: resolved.ty,
            maxScalar: resolved.maxScalar,
            halfLen: resolved.halfLen,
            hudEdge: resolved.hudEdge,
            color: resolved.color,
            alpha: resolved.alpha
        };
    }

    update(dt, allUnits, nodes, game) {
        const worldWidth = game.width;
        const worldHeight = game.height;
        this._barWorldWidth = this.widthFrac * worldWidth;

        if (this._isAlerting) {
            this._alertTimer -= dt;
            if (this._alertTimer <= 0) {
                this._isAlerting = false;
                this._activeBars.push(this._spawnPattern(worldWidth, worldHeight));
                this._spawnTimer = this.cooldown;
            }
        } else {
            this._spawnTimer -= dt;
            if (this._spawnTimer <= 0) {
                this._isAlerting = true;
                this._alertTimer = this.alertDuration;
            }
        }

        if (this._gfx) this._gfx.clear();

        let i = this._activeBars.length - 1;
        while (i >= 0) {
            const active = this._activeBars[i];

            if (active.kind === 'radial') {
                active.radius += active.speed * dt;
                this._applyRadialDamage(active, allUnits);
                this._drawRadial(active);

                if (active.radius > active.maxRadius + active.width) {
                    this._activeBars.splice(i, 1);
                }
            } else {
                active.scalar += active.speed * dt;
                this._applyLineDamage(active, allUnits);
                this._drawLine(active);

                if (active.scalar > active.maxScalar + active.width + (active.speed * 4)) {
                    this._activeBars.splice(i, 1);
                }
            }

            i--;
        }
    }

    _applyLineDamage(active, allUnits) {
        const worldL = active.scalar;
        const worldR = active.scalar + active.width;

        for (const unit of allUnits) {
            if (unit.pendingRemoval) continue;
            const projection = dot(unit.x, unit.y, active.nx, active.ny);
            if (projection >= worldL && projection <= worldR) {
                unit.pendingRemoval = true;
            }
        }
    }

    _applyRadialDamage(active, allUnits) {
        const innerRadius = Math.max(0, active.radius);
        const outerRadius = active.radius + active.width;
        if (outerRadius <= 0) return;

        for (const unit of allUnits) {
            if (unit.pendingRemoval) continue;
            const distance = Math.hypot(unit.x - active.centerX, unit.y - active.centerY);
            if (isInsideAnnulus(distance, innerRadius, outerRadius)) {
                unit.pendingRemoval = true;
            }
        }
    }

    _drawQuad(centerX, centerY, nx, ny, tx, ty, width, halfLen, color, alpha) {
        if (!this._gfx) return;

        const halfWidth = width * 0.5;
        const lx = tx * halfLen;
        const ly = ty * halfLen;
        const wx = nx * halfWidth;
        const wy = ny * halfWidth;

        this._gfx.poly([
            centerX - lx - wx, centerY - ly - wy,
            centerX + lx - wx, centerY + ly - wy,
            centerX + lx + wx, centerY + ly + wy,
            centerX - lx + wx, centerY - ly + wy
        ]);
        this._gfx.fill({ color, alpha });
    }

    _drawLine(active) {
        if (!this._gfx) return;

        const centerScalar = active.scalar + (active.width * 0.5);
        const centerX = active.nx * centerScalar;
        const centerY = active.ny * centerScalar;

        this._drawQuad(
            centerX - (active.nx * active.width * 0.2),
            centerY - (active.ny * active.width * 0.2),
            active.nx,
            active.ny,
            active.tx,
            active.ty,
            active.width * 0.42,
            active.halfLen,
            active.color,
            0.06
        );

        this._drawQuad(
            centerX,
            centerY,
            active.nx,
            active.ny,
            active.tx,
            active.ty,
            active.width,
            active.halfLen,
            active.color,
            active.alpha
        );

        this._drawQuad(
            centerX + (active.nx * active.width * 0.42),
            centerY + (active.ny * active.width * 0.42),
            active.nx,
            active.ny,
            active.tx,
            active.ty,
            active.width * 0.18,
            active.halfLen,
            0x4dd0e1,
            0.58
        );

        this._drawQuad(
            centerX + (active.nx * active.width * 0.48),
            centerY + (active.ny * active.width * 0.48),
            active.nx,
            active.ny,
            active.tx,
            active.ty,
            active.width * 0.05,
            active.halfLen,
            0xffffff,
            0.26
        );
    }

    _drawRadial(active) {
        if (!this._gfx) return;

        const innerRadius = Math.max(0, active.radius);
        const outerRadius = active.radius + active.width;
        if (outerRadius <= 0) return;

        const midRadius = Math.max(0, innerRadius + ((outerRadius - innerRadius) * 0.5));
        const ringWidth = Math.max(2, outerRadius - innerRadius);

        this._gfx.circle(active.centerX, active.centerY, Math.max(0, midRadius - (ringWidth * 0.28)));
        this._gfx.stroke({ color: active.color, alpha: 0.09, width: ringWidth * 0.55 });

        this._gfx.circle(active.centerX, active.centerY, midRadius);
        this._gfx.stroke({ color: active.color, alpha: active.alpha, width: ringWidth });

        this._gfx.circle(active.centerX, active.centerY, Math.max(0, outerRadius - (ringWidth * 0.1)));
        this._gfx.stroke({ color: 0x4dd0e1, alpha: 0.55, width: Math.max(2, ringWidth * 0.18) });

        this._gfx.circle(active.centerX, active.centerY, Math.max(0, outerRadius - 2));
        this._gfx.stroke({ color: 0xffffff, alpha: 0.22, width: 2 });
    }

    _getNextSpawnDelay() {
        if (this._isAlerting) return Math.max(0, this._alertTimer || 0);
        return Math.max(0, (this._spawnTimer || 0) + this.alertDuration);
    }

    _isInsideRadialEvent(x, y, radius, width, centerX, centerY) {
        const innerRadius = Math.max(0, radius);
        const outerRadius = radius + width;
        if (outerRadius <= 0) return false;
        const distance = Math.hypot(x - centerX, y - centerY);
        return isInsideAnnulus(distance, innerRadius, outerRadius);
    }

    _predictRadialExit(x1, y1, vx, vy, duration, startRadius, width, speed, centerX, centerY) {
        if (duration <= 0) return -1;

        let previousTime = 0;
        let previousInside = this._isInsideRadialEvent(x1, y1, startRadius, width, centerX, centerY);
        let lastInsideTime = previousInside ? 0 : -1;

        for (let step = 1; step <= RADIAL_SAMPLE_STEPS; step++) {
            const sampleTime = (duration * step) / RADIAL_SAMPLE_STEPS;
            const sampleX = x1 + (vx * sampleTime);
            const sampleY = y1 + (vy * sampleTime);
            const sampleRadius = startRadius + (speed * sampleTime);
            const isInside = this._isInsideRadialEvent(sampleX, sampleY, sampleRadius, width, centerX, centerY);

            if (isInside) {
                lastInsideTime = sampleTime;
            }

            if (isInside !== previousInside) {
                let low = previousTime;
                let high = sampleTime;
                for (let i = 0; i < 6; i++) {
                    const mid = (low + high) * 0.5;
                    const midX = x1 + (vx * mid);
                    const midY = y1 + (vy * mid);
                    const midRadius = startRadius + (speed * mid);
                    const midInside = this._isInsideRadialEvent(midX, midY, midRadius, width, centerX, centerY);
                    if (midInside === isInside) high = mid;
                    else low = mid;
                }

                if (previousInside && !isInside) {
                    lastInsideTime = high;
                } else if (isInside) {
                    lastInsideTime = sampleTime;
                }
            }

            previousTime = sampleTime;
            previousInside = isInside;
        }

        return lastInsideTime;
    }

    _predictLineUnsafe(active, x1, y1, x2, y2, departureAbs, transitTime, now) {
        const unitScalar = dot(x1, y1, active.nx, active.ny);
        const unitVel = dot(x2 - x1, y2 - y1, active.nx, active.ny) / Math.max(0.01, transitTime);
        const bandScalar = active.scalar + (active.speed * (departureAbs - now));
        const exit = getScalarOverlapExit(unitScalar, unitVel, transitTime, bandScalar, active.width, active.speed);
        return exit >= 0 ? departureAbs + exit : -1;
    }

    _predictFutureLineUnsafe(pattern, x1, y1, x2, y2, departureAbs, transitTime, spawnAbs) {
        const unitScalar = dot(x1, y1, pattern.nx, pattern.ny);
        const unitVel = dot(x2 - x1, y2 - y1, pattern.nx, pattern.ny) / Math.max(0.01, transitTime);

        if (spawnAbs <= departureAbs) {
            const bandScalar = pattern.startScalar + (pattern.speed * (departureAbs - spawnAbs));
            const exit = getScalarOverlapExit(unitScalar, unitVel, transitTime, bandScalar, pattern.width, pattern.speed);
            return exit >= 0 ? departureAbs + exit : -1;
        }

        const localSpawn = spawnAbs - departureAbs;
        if (localSpawn >= transitTime) return -1;

        const unitScalarAtSpawn = unitScalar + (unitVel * localSpawn);
        const exit = getScalarOverlapExit(
            unitScalarAtSpawn,
            unitVel,
            transitTime - localSpawn,
            pattern.startScalar,
            pattern.width,
            pattern.speed
        );
        return exit >= 0 ? spawnAbs + exit : -1;
    }

    _predictRadialUnsafe(active, x1, y1, x2, y2, departureAbs, transitTime, now) {
        const vx = (x2 - x1) / Math.max(0.01, transitTime);
        const vy = (y2 - y1) / Math.max(0.01, transitTime);
        const startRadius = active.radius + (active.speed * (departureAbs - now));
        const exit = this._predictRadialExit(
            x1,
            y1,
            vx,
            vy,
            transitTime,
            startRadius,
            active.width,
            active.speed,
            active.centerX,
            active.centerY
        );
        return exit >= 0 ? departureAbs + exit : -1;
    }

    _predictFutureRadialUnsafe(pattern, x1, y1, x2, y2, departureAbs, transitTime, spawnAbs) {
        const vx = (x2 - x1) / Math.max(0.01, transitTime);
        const vy = (y2 - y1) / Math.max(0.01, transitTime);

        if (spawnAbs <= departureAbs) {
            const startRadius = pattern.startRadius + (pattern.speed * (departureAbs - spawnAbs));
            const exit = this._predictRadialExit(
                x1,
                y1,
                vx,
                vy,
                transitTime,
                startRadius,
                pattern.width,
                pattern.speed,
                pattern.centerX,
                pattern.centerY
            );
            return exit >= 0 ? departureAbs + exit : -1;
        }

        const localSpawn = spawnAbs - departureAbs;
        if (localSpawn >= transitTime) return -1;

        const startX = x1 + (vx * localSpawn);
        const startY = y1 + (vy * localSpawn);
        const exit = this._predictRadialExit(
            startX,
            startY,
            vx,
            vy,
            transitTime - localSpawn,
            pattern.startRadius,
            pattern.width,
            pattern.speed,
            pattern.centerX,
            pattern.centerY
        );
        return exit >= 0 ? spawnAbs + exit : -1;
    }

    predictUnsafeUntil(x1, y1, x2, y2, departureAbs, transitTime, now, worldWidth, worldHeight) {
        let unsafeUntil = -1;

        for (let i = 0; i < this._activeBars.length; i++) {
            const active = this._activeBars[i];
            const unsafe = active.kind === 'radial'
                ? this._predictRadialUnsafe(active, x1, y1, x2, y2, departureAbs, transitTime, now)
                : this._predictLineUnsafe(active, x1, y1, x2, y2, departureAbs, transitTime, now);

            if (unsafe > unsafeUntil) unsafeUntil = unsafe;
        }

        let spawnAbs = now + this._getNextSpawnDelay();
        const cycleInterval = this.cooldown + this.alertDuration;
        let nextPatternIndex = this._nextPatternIndex;

        for (let event = 0; event < FUTURE_SPAWN_LOOKAHEAD && spawnAbs <= departureAbs + transitTime; event++) {
            const pattern = this._resolvePattern(this._patterns[nextPatternIndex], worldWidth, worldHeight);
            const unsafe = pattern.kind === 'radial'
                ? this._predictFutureRadialUnsafe(pattern, x1, y1, x2, y2, departureAbs, transitTime, spawnAbs)
                : this._predictFutureLineUnsafe(pattern, x1, y1, x2, y2, departureAbs, transitTime, spawnAbs);

            if (unsafe > unsafeUntil) unsafeUntil = unsafe;

            spawnAbs += cycleInterval;
            nextPatternIndex = (nextPatternIndex + 1) % this._patterns.length;
        }

        return unsafeUntil;
    }

    draw(ctx, game) {
        if (!ctx || !this._isAlerting) return;

        const progress = 1 - (this._alertTimer / this.alertDuration);
        const pulse = 0.35 + (0.65 * Math.abs(Math.sin(Date.now() * 0.007)));
        const nextPattern = this._resolvePattern(
            this._patterns[this._nextPatternIndex],
            game.width,
            game.height
        );

        ctx.save();

        if (nextPattern.kind === 'radial') {
            const world = game.world;
            const screenX = (nextPattern.centerX * (world ? world.scale.x : 1)) + (world ? world.position.x : 0);
            const screenY = (nextPattern.centerY * (world ? world.scale.y : 1)) + (world ? world.position.y : 0);
            const baseRadius = 22 + (progress * 26);
            ctx.globalAlpha = pulse * 0.7;
            ctx.strokeStyle = this.colorCss;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(screenX, screenY, baseRadius, 0, Math.PI * 2);
            ctx.stroke();

            ctx.globalAlpha = 0.16;
            ctx.beginPath();
            ctx.arc(screenX, screenY, baseRadius + 14, 0, Math.PI * 2);
            ctx.stroke();
        } else {
            ctx.globalAlpha = pulse * 0.9;
            ctx.fillStyle = this.colorCss;

            switch (nextPattern.hudEdge) {
                case 'right':
                    ctx.fillRect(game.width - 7, 0, 7, game.height);
                    ctx.globalAlpha = 0.18;
                    ctx.fillRect(game.width - 7 - Math.max(0, progress * 30), 0, Math.max(0, progress * 30), game.height);
                    break;
                case 'top':
                    ctx.fillRect(0, 0, game.width, 7);
                    ctx.globalAlpha = 0.18;
                    ctx.fillRect(0, 7, game.width, Math.max(0, progress * 30));
                    break;
                case 'bottom':
                    ctx.fillRect(0, game.height - 7, game.width, 7);
                    ctx.globalAlpha = 0.18;
                    ctx.fillRect(0, game.height - 7 - Math.max(0, progress * 30), game.width, Math.max(0, progress * 30));
                    break;
                case 'left':
                default:
                    ctx.fillRect(0, 0, 7, game.height);
                    ctx.globalAlpha = 0.18;
                    ctx.fillRect(7, 0, Math.max(0, progress * 30), game.height);
                    break;
            }
        }

        ctx.restore();
    }

    get isSweeping() { return this._activeBars.length > 0; }
    get isAlerting() { return this._isAlerting; }
    get timeToNext() { return this._isAlerting ? 0 : this._spawnTimer; }
    get alertProgress() {
        return this._isAlerting
            ? 1 - (this._alertTimer / this.alertDuration)
            : 0;
    }
}
