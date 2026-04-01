const UINT32_SCALE = 4294967296;
const HASH_PRIME_A = 0x85ebca6b;
const HASH_PRIME_B = 0xc2b2ae35;
const GOLDEN_RATIO_32 = 0x9e3779b9;
const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;
const TAU = Math.PI * 2;

export function hashUint32(value) {
    let x = value >>> 0;
    x ^= x >>> 16;
    x = Math.imul(x, HASH_PRIME_A);
    x ^= x >>> 13;
    x = Math.imul(x, HASH_PRIME_B);
    x ^= x >>> 16;
    return x >>> 0;
}

export function mixSeeds(seedA, seedB) {
    return hashUint32((seedA ^ Math.imul(seedB >>> 0, GOLDEN_RATIO_32)) >>> 0);
}

export function hashStringSeed(text) {
    let hash = FNV_OFFSET >>> 0;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, FNV_PRIME);
    }
    return hashUint32(hash);
}

export function fractionFromSeed(seed) {
    return (hashUint32(seed) >>> 0) / UINT32_SCALE;
}

export function angleFromSeed(seed) {
    return fractionFromSeed(seed) * TAU;
}

export function radialFractionFromSeed(seed, scale = 1) {
    return Math.sqrt(fractionFromSeed(seed)) * scale;
}

export function getNodeSeed(node) {
    if (!node) return 0;
    const nav = node.navIndex != null ? (node.navIndex + 1) : 0;
    const x = node.x | 0;
    const y = node.y | 0;
    return hashUint32(
        (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(nav, 83492791)) >>> 0
    );
}

export function seedUnitDeterministicState(unit, seed) {
    const motionAngle = angleFromSeed(mixSeeds(seed, 1));
    const driftSpeed = 0.35 + (fractionFromSeed(mixSeeds(seed, 2)) * 0.65);

    unit.deterministicSeed = seed >>> 0;
    unit.vx = Math.cos(motionAngle) * driftSpeed;
    unit.vy = Math.sin(motionAngle) * driftSpeed;
    unit.angle = motionAngle;
    unit.personalTheta = angleFromSeed(mixSeeds(seed, 3));
    unit.personalR = radialFractionFromSeed(mixSeeds(seed, 4), 0.98);
}

export function reseedUnitFormation(unit, seed) {
    unit.personalTheta = angleFromSeed(mixSeeds(seed, 5));
    unit.personalR = radialFractionFromSeed(mixSeeds(seed, 6), 0.98);
}

export function placeUnitInCircle(unit, cx, cy, radius, seed, radiusScale = 1) {
    const theta = angleFromSeed(mixSeeds(seed, 7));
    const dist = radialFractionFromSeed(mixSeeds(seed, 8), radius * radiusScale);

    unit.x = cx + Math.cos(theta) * dist;
    unit.y = cy + Math.sin(theta) * dist;
}
