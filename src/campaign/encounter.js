import { SECTORS } from '../data/levels.js';
import { clone } from './rules.js';

const SECTOR = { sand:0,grass:1,leaves:2,roots:3,asphalt:3,pond:4,picnic:5 };
// The tactical runtime uses player/enemy for input, while strategy retains faction IDs.
export function buildEncounterLevel(encounter, playerFaction) {
    const sectorIndex=SECTOR[encounter.region]??0;
    const sector=SECTORS[sectorIndex];
    const variant=Number(encounter.template.split('-').pop())||0;
    const source=sector.levels[variant%sector.levels.length];
    const level=clone(source);
    const playerAttacking=encounter.attacker===playerFaction;
    const playerPreparation=playerAttacking?encounter.attackPreparation:encounter.defendPreparation;
    const enemyPreparation=playerAttacking?encounter.defendPreparation:encounter.attackPreparation;
    // Keep authored topography/hazards but normalize sides into the existing input contract.
    level.nodes=level.nodes.map(n=>{
        if(n.owner==='neutral')return n;
        const attackingSide=n.owner==='player';
        const sideIsPlayer=attackingSide===playerAttacking;
        const type=n.type==='gigante'?500:n.type==='enjambre'?300:n.type==='tunel'?0:200;
        const power=n.evolution==='tanque'?3:1;
        return {...n,owner:sideIsPlayer?'player':'enemy',startUnits:Math.floor(type*(sideIsPlayer?playerPreparation:enemyPreparation)/power)};
    });
    if(['capital','epic','picnic'].includes(encounter.type)){
        const defenderSide=playerAttacking?'enemy':'player';
        const nest=level.nodes.find(n=>n.owner===defenderSide&&n.type!=='tunel');
        if(nest&&!nest.evolution)nest.evolution=encounter.type==='capital'?'espinoso':'artilleria';
    }
    level.name='';level.description='';
    return {sectorIndex,level,mutations:{player:playerAttacking?encounter.attackMutations:encounter.defendMutations,
        enemy:playerAttacking?encounter.defendMutations:encounter.attackMutations},
        factions:{player:playerFaction,enemy:playerAttacking?encounter.defender:encounter.attacker},
        seed:encounter.seed};
}

export function campaignModifiers(side, mutations, faction) {
    return { speed:(mutations.includes('swift')?1.1:1)*(faction==='tejedoras'?1.1:1)*(faction==='fuego'?0.9:1),
        marsh:mutations.includes('marsh'),acid:mutations.includes('acid'),
        evolutionDiscount:faction==='carpinteras'?0.9:1,logisticsDiscount:faction==='negras'?0.8:1,
        generation:faction==='cortadoras'?1.3:1,fragility:faction==='cortadoras'?1.15:1,
        burn:faction==='fuego',leech:faction==='bala',side };
}
