// Float64 preserves the exact positions, seeds and timers used by the live oracle.
const FIELDS = ['thornDamageTaken', 'x', 'y', 'vx', 'vy', 'speed', 'speedMult', 'currentZoneMult', 'power', 'angle',
    'personalR', 'personalTheta', 'deterministicSeed', '_lastTargetX', '_lastTargetY',
    'targetIndex', 'homeIndex', 'lastTargetIndex', 'observationIndex'];
const STRIDE = FIELDS.length + 2;

export function packUnits(units) {
    const data = new Float64Array(units.length * STRIDE), factions = [], ids = new Map();
    for (let i = 0; i < units.length; i++) {
        const unit = units[i], offset = i * STRIDE;
        for (let j = 0; j < FIELDS.length; j++) data[offset + j] = unit[FIELDS[j]] ?? NaN;
        if (!ids.has(unit.faction)) { ids.set(unit.faction, factions.length); factions.push(unit.faction); }
        data[offset + FIELDS.length] = ids.get(unit.faction);
        data[offset + FIELDS.length + 1] = unit.state === 'traveling' ? 1 : 0;
    }
    return { data, factions };
}

export function unpackUnits({ data, factions }) {
    const units = new Array(data.length / STRIDE);
    for (let i = 0; i < units.length; i++) {
        const unit = {}, offset = i * STRIDE;
        for (let j = 0; j < FIELDS.length; j++) {
            const value = data[offset + j]; unit[FIELDS[j]] = Number.isNaN(value) ? undefined : value;
        }
        unit.faction = factions[data[offset + FIELDS.length]];
        unit.state = data[offset + FIELDS.length + 1] ? 'traveling' : 'idle';
        unit.pendingRemoval = false; units[i] = unit;
    }
    return units;
}
