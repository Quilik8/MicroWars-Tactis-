import { applyDamageToComposition, deriveHeavyBodies, getCombatDamage, getCaptureSpeed } from './deterministic_rules.js';

/** Exact count-level reduction once no unit travels, projectile flies, tunnel produces a
 * traveler, mobile nest moves or environmental sweep can change positions. Formation,
 * sprites and orbit velocities then have no bearing on combat/capture/production. */
export function* settleForecast(world, faction, targetIndex, elapsed, horizon, captureAge, result, dt, holdSeconds = 10) {
    const groups = world.nodes.map(() => new Map());
    const indices = new Map(world.nodes.map((n, i) => [n, i]));
    let total = 0;
    for (const u of world.allUnits) {
        if (u.pendingRemoval || !u.targetNode) continue;
        const group = groups[indices.get(u.targetNode)];
        if (!group.has(u.faction)) group.set(u.faction, { light: 0, heavy: 0, carry: 0 });
        group.get(u.faction)[(u.power || 1) > 1 ? 'heavy' : 'light']++;
        if (++total % 128 === 0) yield;
    }
    for (let i = 0; i < world.nodes.length; i++) for (const [f, g] of groups[i]) g.carry = world.nodes[i].combatDamageCarry?.[f] || 0;
    const damage = {};
    let ticks = 0;
    for (; elapsed < horizon; elapsed += dt) {
        let frameLength = total;
        for (let i = 0; i < world.nodes.length; i++) {
            const n = world.nodes[i], group = groups[i];
            // Capture uses the same start-of-frame population as live CombatManager.
            const counts = {}, powers = {}, factions = [];
            for (const f of group.keys()) if (!(f in n.counts)) n.counts[f] = 0;
            for (const f of Object.keys(n.counts)) {
                const g = group.get(f) || { light: 0, heavy: 0 };
                counts[f] = g.light + g.heavy; powers[f] = g.light + g.heavy * 3;
                if (counts[f]) factions.push(f);
            }
            if (factions.length > 1) {
                n.combatTimer += dt;
                if (n.combatTimer >= world.combatInterval) {
                    n.combatTimer = 0;
                    for (const f of factions) {
                        let incoming = 0;
                        for (const other of factions) if (other !== f) incoming += getCombatDamage(powers[other], powers[f]);
                        const g = group.get(f);
                        applyDamageToComposition(g.light, g.heavy, g.carry,
                            incoming * (world.campaignModifiers[f]?.fragility || 1), damage);
                        total -= damage.killedBodies;
                        g.light = damage.lightBodies; g.heavy = damage.heavyBodies; g.carry = damage.damageCarry;
                        for (const attacker of factions) {
                            if (attacker === f || !world.campaignModifiers[attacker]?.leech || !damage.killedBodies) continue;
                            n.campaignLeech ??= {};
                            n.campaignLeech[attacker] = (n.campaignLeech[attacker] || 0) + damage.killedBodies;
                            const born = Math.min(Math.floor(n.campaignLeech[attacker] / 3), Math.max(0, 3000 - frameLength));
                            n.campaignLeech[attacker] -= born * 3; group.get(attacker).light += born; total += born; frameLength += born;
                        }
                    }
                }
            } else n.combatTimer = 0;
            // Burn semantics are shared with the live frame (including damage carry).
            for (const f of factions) if (f !== n.owner && world.campaignModifiers[f]?.burn) {
                n.campaignBurn = { faction: f, remaining: 5, timer: n.campaignBurn?.timer || 0 };
            }
            if (n.campaignBurn && n.campaignBurn.faction !== n.owner && n.campaignBurn.remaining > 0) {
                n.campaignBurn.remaining -= dt; n.campaignBurn.timer += dt;
                const g = group.get(n.owner);
                if (n.campaignBurn.timer >= 1) {
                    n.campaignBurn.timer -= 1;
                    if (g) {
                        applyDamageToComposition(g.light, g.heavy, g.carry, 1, damage);
                        total -= damage.killedBodies; g.light = damage.lightBodies; g.heavy = damage.heavyBodies; g.carry = damage.damageCarry;
                    }
                }
            }
            let main = null, bodies = 0;
            for (const f of factions) if (f !== n.owner && counts[f] > bodies) { main = f; bodies = counts[f]; }
            const previousOwner = n.owner;
            if (main && n.conqueringFaction && n.conqueringFaction !== main) {
                n.conquestProgress = Math.max(0, n.conquestProgress - 0.5 * dt);
                if (!n.conquestProgress) n.conqueringFaction = null;
            } else if (main) {
                let others = 0; for (const f of factions) if (f !== main) others += counts[f];
                if (others > 3) { if (n.conquestProgress > 0) n.conqueringFaction = main; }
                else {
                    n.conqueringFaction = main; n.conquestProgress += getCaptureSpeed(bodies) * dt;
                    if (n.conquestProgress >= 1) { n.owner = main; n.conquestProgress = 0; n.conqueringFaction = null; }
                }
            } else if (n.conquestProgress > 0) {
                n.conquestProgress = Math.max(0, n.conquestProgress - .5 * dt);
                if (!n.conquestProgress) n.conqueringFaction = null;
            }
            if (n.owner !== previousOwner) {
                for (const g of group.values()) g.carry = 0;
                n.pendingEvolution = null; n.pendingEvolutionEtaSec = 0; n.pendingEvolutionDurationSec = 0;
            }
            if (n.pendingEvolution) {
                n.pendingEvolutionEtaSec = Math.max(0, n.pendingEvolutionEtaSec - dt);
                if (!n.pendingEvolutionEtaSec && n.owner !== 'neutral') n.completeEvolution();
            }
            if (n.owner !== 'neutral' && n.type !== 'tunel' && (powers[n.owner] || 0) < n.maxUnits && frameLength < 3000) {
                n.regenTimer += dt;
                let interval = n.regenInterval;
                if (n.type === 'enjambre') interval /= world.campaignModifiers[n.owner]?.generation || 1;
                if (n.evolution === 'tanque') interval *= 1.5;
                let projected = powers[n.owner] || 0;
                while (n.regenTimer >= interval && projected < n.maxUnits && frameLength < 3000) {
                    n.regenTimer -= interval;
                    if (!group.has(n.owner)) group.set(n.owner, { light: 0, heavy: 0, carry: 0 });
                    const heavy = n.evolution === 'tanque'; group.get(n.owner)[heavy ? 'heavy' : 'light']++;
                    projected += heavy ? 3 : 1; total++; frameLength++;
                }
            }
        }
        const target = world.nodes[targetIndex];
        if (target.owner === faction) {
            result.capturedAt ??= elapsed + dt; captureAge += dt;
            if (captureAge >= holdSeconds) { result.held = true; break; }
        } else captureAge = 0;
        if (++ticks % 8 === 0) yield;
    }
    const g = groups[targetIndex].get(faction);
    result.finalForces = Object.fromEntries([...groups[targetIndex]].map(([f, group]) => [f, group.light + group.heavy]));
    result.owner = world.nodes[targetIndex].owner;
    result.elapsed = elapsed + dt;
    result.survivors = g ? g.light + g.heavy : 0;
    result.sourceOwners = result.orders.map(o => ({ source: o.source, owner: world.nodes[o.source].owner }));
    return result;
}
