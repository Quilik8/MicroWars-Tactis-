// Provisional tuning, centralized for playtesting.
export const RULES = Object.freeze({ version: 5, territories: 300, startPoints: 6,
    income: 2, recruit: 6, upgradeCosts: [8, 12], retreatSeconds: 8,
    retreatPenalty: 0.2, minPreparation: 0.3, picnicRounds: 3, mutationSlots: 3 });
export const BASE_FACTIONS = ['carpinteras', 'negras', 'tejedoras', 'cortadoras', 'fuego', 'bala'];
export const UPGRADES = ['incubation', 'training', 'reserve'];
export const MUTATIONS = ['swift', 'marsh', 'acid'];
export const clone = value => JSON.parse(JSON.stringify(value));
export function hash(value) {
    let h = 2166136261;
    for (const c of String(value)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
    return (h ^ (h >>> 16)) >>> 0;
}
export const random = (seed, key) => hash(`${seed}:${key}`) / 4294967296;
export const preparation = army => Math.max(RULES.minPreparation,
    Math.min(1, 0.5 + Math.min(5, (army?.battleVictories || 0)+(army?.trainingLevel || 0))*0.1) - (army?.penalty || 0));
export const STRATEGY = Object.freeze({damage:0.18,initialDamageWeight:0.45,maxSteps:24,retreatThreshold:0.3,
    capitalPreparation:0.6,guardianReward:6,largeRecovery:0.1,flightRange:140,
    maxExpeditions:4,enclaveActivation:3,enclaveBudget:2,enclaveInterval:4,
    waspRounds:[4,12,20],eventFirst:8,eventInterval:6,eventWarning:1,eventDuration:2,
    localMin:25,localMax:40,passMin:45,passMax:60,epicMin:65,epicMax:80,largeMin:140,largeMax:180,picnicForce:95,
    wolfSpiderForce:150,centipedeForce:170,colossalForce:160,expeditionForce:55,waspForce:65,
    swiftBonus:0.1,mudMultiplier:0.85,marshMultiplier:0.925,toxicDamage:0.01});
export const START_PROFILES = Object.freeze({
    carpinteras:{armies:2,points:8,training:0,difficulty:'veryEasy',advance:0.15},
    negras:{armies:2,points:6,training:0,difficulty:'easy',advance:0.45},
    tejedoras:{armies:2,points:6,training:0,difficulty:'normal',advance:0.75},
    cortadoras:{armies:2,points:4,training:0,difficulty:'hard',advance:0.75},
    fuego:{armies:2,points:6,training:0,difficulty:'veryHard',advance:0.9},
    bala:{armies:1,points:6,training:2,difficulty:'infernal',advance:0}
});
export const COMBAT_TRAITS = Object.freeze({carpinteras:0.12,negras:0.1,tejedoras:0.15,
    cortadorasReinforce:0.15,cortadorasFragility:0.15,fuego:0.03,bala:1/3,
    mutantes:0.025,arañas:0.2,escarabajosArmor:0.3,escarabajosSlow:0.2,termitas:0.15,avispas:0.25});
