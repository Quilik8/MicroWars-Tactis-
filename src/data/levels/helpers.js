export const VENOM_COLOR = 0x2ecc71;
export const WATER_COLOR = 0x0097a7;
export const FAST_COLOR = 0x7ed957;
export const SLOW_COLOR = 0x8b5a2b;
export const BARRIER_COLOR = 0x00e5ff;

export function node(id, x, y, owner, type, startUnits, extra = {}) {
    const data = { id, x, y, owner, type, ...extra };
    if (startUnits !== undefined) data.startUnits = startUnits;
    return data;
}

export function mobileNode(id, x, y, anchorX, anchorY, radiusX, radiusY, orbitSpeed, extra = {}) {
    return node(id, x, y, 'neutral', 'enjambre', 0, {
        isMobile: true,
        orbitAnchorX: anchorX,
        orbitAnchorY: anchorY,
        orbitRadiusX: radiusX,
        orbitRadiusY: radiusY,
        orbitSpeed,
        ...extra
    });
}

export function rectZone(id, x, y, width, height, speedMult, color, alpha = 0.18) {
    return { id, x, y, width, height, speedMult, color, alpha };
}

export function puddle(x, y, radius, extra = {}) {
    return {
        x,
        y,
        radius,
        dps: 7.2,
        color: VENOM_COLOR,
        alpha: 0.24,
        shape: 'puddle',
        scaleY: 1,
        ...extra
    };
}

export function ring(cx, cy, outerRadius, innerRadius, extra = {}) {
    return {
        x: cx,
        y: cy,
        radius: outerRadius,
        innerRadius,
        dps: 7.2,
        color: VENOM_COLOR,
        alpha: 0.24,
        shape: 'ring',
        scaleY: 1,
        seed: (cx * 1000 + cy * 777) | 0,
        ...extra
    };
}

export function flood(safeZones, extra = {}) {
    return {
        x: 0.5,
        y: 0.5,
        radius: 0.55,
        shape: 'flood',
        safeZones,
        dps: 7.2,
        color: VENOM_COLOR,
        alpha: 0.24,
        scaleY: 0.60,
        seed: 314,
        ...extra
    };
}

export function rectPuddle(x, y, width, height, extra = {}) {
    return {
        x,
        y,
        width,
        height,
        radius: Math.max(width, height) * 2,
        shape: 'rect_puddle',
        dps: 7.2,
        color: VENOM_COLOR,
        alpha: 0.24,
        scaleY: 1,
        seed: (x * 1000 + y * 777) | 0,
        ...extra
    };
}

export function ringHazards(centerX, centerY, orbitRadius, blobRadius, count, extra = {}) {
    const hazards = [];
    for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count;
        hazards.push(puddle(
            centerX + (Math.cos(angle) * orbitRadius),
            centerY + (Math.sin(angle) * orbitRadius),
            blobRadius,
            extra
        ));
    }
    return hazards;
}

export function zigZagHazards(points, radius, extra = {}) {
    return points.map(([x, y]) => puddle(x, y, radius, extra));
}

export function checkerZones(cols, rows, fastMult, slowMult) {
    const zones = [];
    const cellW = 1 / cols;
    const cellH = 1 / rows;
    let fastIdx = 0;
    let slowIdx = 0;

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const isFast = (row + col) % 2 === 0;
            zones.push(rectZone(
                `${isFast ? 'fast' : 'slow'}_${isFast ? fastIdx++ : slowIdx++}`,
                col * cellW,
                row * cellH,
                cellW,
                cellH,
                isFast ? fastMult : slowMult,
                isFast ? FAST_COLOR : SLOW_COLOR,
                isFast ? 0.14 : 0.18
            ));
        }
    }

    return zones;
}

export function gateWall(y, height, gaps, interval, initialDelay = 0, color = BARRIER_COLOR) {
    return [
        {
            zones: gaps.map((gap) => ({ x: 0, y, width: gap[0], height, color })).concat([{ hidden: true }]),
            interval,
            initialDelay,
            activeZoneIndex: 0
        },
        {
            zones: gaps.map((gap) => ({ x: gap[1], y, width: 1 - gap[1], height, color })).concat([{ hidden: true }]),
            interval,
            initialDelay,
            activeZoneIndex: 0
        }
    ];
}

export function verticalGateWall(x, width, gaps, interval, initialDelay = 0, color = BARRIER_COLOR) {
    return [
        {
            zones: gaps.map((gap) => ({ x, y: 0, width, height: gap[0], color })).concat([{ hidden: true }]),
            interval,
            initialDelay,
            activeZoneIndex: 0
        },
        {
            zones: gaps.map((gap) => ({ x, y: gap[1], width, height: 1 - gap[1], color })).concat([{ hidden: true }]),
            interval,
            initialDelay,
            activeZoneIndex: 0
        }
    ];
}

export function hollowPulse(x, y, width, height, interval, initialDelay = 0, color = BARRIER_COLOR, activeZoneIndex = 0) {
    return {
        zones: [
            { isHollow: true, x, y, width, height, color },
            { hidden: true }
        ],
        interval,
        initialDelay,
        activeZoneIndex
    };
}
