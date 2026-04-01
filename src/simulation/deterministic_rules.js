export const COMBAT_BASE_RATE = 0.12;
export const COMBAT_BONUS_RATE = 0.08;
export const COMBAT_INTERVAL_DEFAULT = 0.7;

export const CAPTURE_DECAY_RATE = 0.5;
export const CAPTURE_CONTEST_THRESHOLD = 3;
export const CAPTURE_SPEED_LOW = 0.05;
export const CAPTURE_SPEED_MID = 0.15;
export const CAPTURE_SPEED_HIGH = 0.35;
export const CAPTURE_LOW_THRESHOLD = 50;
export const CAPTURE_HIGH_THRESHOLD = 250;

export const UNIT_POWER_LIGHT = 1;
export const UNIT_POWER_HEAVY = 3;

export const ESPINOSO_KILL_INTERVAL = 0.15;
export const ARTILLERY_SPLASH_POWER_BUDGET = 5;
export const ARTILLERY_BASE_INTERVAL = 1.8;
export const ARTILLERY_FIRE_INTERVAL = 1.0;

export const EVOLUTION_TIME_ESPINOSO = 3.0;
export const EVOLUTION_TIME_ARTILLERIA = 4.0;
export const EVOLUTION_TIME_TANQUE = 3.5;

export const EVOLUTION_NONE = 0;
export const EVOLUTION_ESPINOSO = 1;
export const EVOLUTION_ARTILLERIA = 2;
export const EVOLUTION_TANQUE = 3;

export const RESULT_DERROTA = 0;
export const RESULT_EMPATE_ESTANCADO = 1;
export const RESULT_VICTORIA_PIRRICA = 2;
export const RESULT_VICTORIA_SEGURA = 3;

export function getEvolutionCode(evolution) {
    if (evolution === 'espinoso') return EVOLUTION_ESPINOSO;
    if (evolution === 'artilleria') return EVOLUTION_ARTILLERIA;
    if (evolution === 'tanque') return EVOLUTION_TANQUE;
    return EVOLUTION_NONE;
}

export function getSpawnPowerForEvolutionCode(evolutionCode) {
    return evolutionCode === EVOLUTION_TANQUE ? UNIT_POWER_HEAVY : UNIT_POWER_LIGHT;
}

export function getEvolutionDuration(evolution) {
    const evolutionCode = typeof evolution === 'string' ? getEvolutionCode(evolution) : (evolution | 0);
    if (evolutionCode === EVOLUTION_ESPINOSO) return EVOLUTION_TIME_ESPINOSO;
    if (evolutionCode === EVOLUTION_ARTILLERIA) return EVOLUTION_TIME_ARTILLERIA;
    if (evolutionCode === EVOLUTION_TANQUE) return EVOLUTION_TIME_TANQUE;
    return 0;
}

export function getSpawnInterval(baseInterval, evolutionCode) {
    return evolutionCode === EVOLUTION_TANQUE ? (baseInterval * 1.5) : baseInterval;
}

export function getArtilleryInterval(evolutionCode, fallbackInterval = ARTILLERY_BASE_INTERVAL) {
    return evolutionCode === EVOLUTION_ARTILLERIA ? ARTILLERY_FIRE_INTERVAL : fallbackInterval;
}

export function getCaptureSpeed(attackerBodies) {
    if (attackerBodies < CAPTURE_LOW_THRESHOLD) return CAPTURE_SPEED_LOW;
    if (attackerBodies > CAPTURE_HIGH_THRESHOLD) return CAPTURE_SPEED_HIGH;
    return CAPTURE_SPEED_MID;
}

export function getCombatDamage(attackerPower, defenderPower) {
    if (attackerPower <= 0 || defenderPower <= 0) return 0;
    const pairings = attackerPower < defenderPower ? attackerPower : defenderPower;
    const overwhelm = attackerPower - (2 * defenderPower);
    return (pairings * COMBAT_BASE_RATE) + (overwhelm > 0 ? (overwhelm * COMBAT_BONUS_RATE) : 0);
}

export function deriveHeavyBodies(bodyCount, powerCount) {
    if (bodyCount <= 0 || powerCount <= bodyCount) return 0;
    const heavy = ((powerCount - bodyCount) * 0.5);
    return heavy > 0 ? (heavy + 1e-6) | 0 : 0;
}

export function deriveLightBodies(bodyCount, powerCount) {
    if (bodyCount <= 0) return 0;
    const heavy = deriveHeavyBodies(bodyCount, powerCount);
    const light = bodyCount - heavy;
    return light > 0 ? light : 0;
}

export function getTotalBodies(lightBodies, heavyBodies) {
    return lightBodies + heavyBodies;
}

export function getTotalPower(lightBodies, heavyBodies) {
    return lightBodies + (heavyBodies * UNIT_POWER_HEAVY);
}

export function applyDamageToComposition(lightBodies, heavyBodies, damageCarry, incomingDamage, out) {
    let carry = damageCarry + incomingDamage;
    const startLight = lightBodies;
    const startHeavy = heavyBodies;

    let killLight = 0;
    if (carry >= 1 && lightBodies > 0) {
        killLight = Math.min(lightBodies, carry | 0);
        lightBodies -= killLight;
        carry -= killLight;
    }

    let killHeavy = 0;
    if (carry >= UNIT_POWER_HEAVY && heavyBodies > 0) {
        killHeavy = Math.min(heavyBodies, (carry / UNIT_POWER_HEAVY) | 0);
        heavyBodies -= killHeavy;
        carry -= killHeavy * UNIT_POWER_HEAVY;
    }

    out.lightBodies = lightBodies;
    out.heavyBodies = heavyBodies;
    out.damageCarry = carry;
    out.killedLight = startLight - lightBodies;
    out.killedHeavy = startHeavy - heavyBodies;
    out.killedBodies = out.killedLight + out.killedHeavy;
    out.killedPower = out.killedLight + (out.killedHeavy * UNIT_POWER_HEAVY);
    return out;
}

export function applyBodyLosses(lightBodies, heavyBodies, bodyLosses, out) {
    let remaining = bodyLosses > 0 ? bodyLosses | 0 : 0;
    const startLight = lightBodies;
    const startHeavy = heavyBodies;

    let killLight = 0;
    if (remaining > 0 && lightBodies > 0) {
        killLight = Math.min(lightBodies, remaining);
        lightBodies -= killLight;
        remaining -= killLight;
    }

    let killHeavy = 0;
    if (remaining > 0 && heavyBodies > 0) {
        killHeavy = Math.min(heavyBodies, remaining);
        heavyBodies -= killHeavy;
        remaining -= killHeavy;
    }

    out.lightBodies = lightBodies;
    out.heavyBodies = heavyBodies;
    out.remainingLosses = remaining;
    out.killedLight = startLight - lightBodies;
    out.killedHeavy = startHeavy - heavyBodies;
    out.killedBodies = out.killedLight + out.killedHeavy;
    out.killedPower = out.killedLight + (out.killedHeavy * UNIT_POWER_HEAVY);
    return out;
}
