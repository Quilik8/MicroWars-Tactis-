import test from 'node:test';
import assert from 'node:assert/strict';
import {CampaignModel} from '../src/campaign/campaign_model.js';
import {MapLogic,auditAtlas,crossesWater} from '../src/campaign/atlas.js';
import {BASE_FACTIONS,START_PROFILES,RULES,preparation,clone} from '../src/campaign/rules.js';
import {simulateCombat} from '../src/campaign/strategic_combat.js';
import {namePool} from '../src/campaign/identity.js';
import {actorNeighbors,actThreat,processWorldEvents,reserveIntervention,refreshWorldEffects} from '../src/campaign/world_director.js';
import {StateManager} from '../src/campaign/state_manager.js';
import {gameStorage} from '../src/platform/storage.js';

const template=CampaignModel.create('carpinteras',2026).snapshot();
const fresh=()=>new CampaignModel(clone(template));
function drain(m){let steps=0;while((m.data.phase==='rivals'||m.data.pending||m.data.reward||m.data.resultNotice)&&!m.data.winner){
 if(++steps>5000)throw new Error('Queue stuck');if(m.data.resultNotice)m.acknowledge();else if(m.data.reward)m.data.reward=null;
 else if(m.data.pending){if(m.canAuto())m.startResolution();m.advanceEncounter();}else m.aiStep();}return steps;}
function encounter(m,{force=100,defense=35,capital=false,third=false}={}){
 const a=m.data.armies.find(a=>a.faction===m.data.playerFaction),from=a.territory,target=m.node(from).neighbors.find(id=>!m.node(id).capitalOf&&!m.armyAt(id));
 const n=m.node(target);m.data.actors=m.data.actors.filter(t=>t.territory!==target);n.owner=capital?'negras':'neutral';n.type=capital?'capital':'ordinary';if(capital)n.capitalOf='negras';else delete n.capitalOf;n.defended=true;n.cleared=false;
 if(capital){const old=m.node(m.faction('negras').capital);old.type='ordinary';delete old.capitalOf;m.faction('negras').capital=target;}
 const e=m.move(a.faction,a.id,target);e.participants=e.participants.slice(0,2);e.participants[0].force=force;e.participants[1].force=defense;
 if(third)e.participants.push({id:'visitor',actorId:null,armyId:null,faction:'avispas',role:'intruder',force:65,mutations:[],enterAt:3,retreatAllowed:false,retreatTarget:null});
 return {e,a,n,from};
}
function run(m){m.startResolution();while(m.data.pending)m.advanceEncounter();return m.data.lastResult;}
function controlled(m,winnerId,status={}){
 const e=m.data.pending;
 return m.applyResult({encounterId:e.id,resolutionMode:'strategic_auto',winnerId,winnerFaction:e.participants.find(p=>p.id===winnerId)?.faction||null,steps:1,conditions:e.conditions,trace:[],participants:e.participants.map(p=>({...p,initial:p.force,remaining:status[p.id]==='destroyed'?0:p.force/2,status:status[p.id]||(p.id===winnerId?'victory':'destroyed'),damageDealt:0,damageTaken:0}))});
}

test('v5 initial world: six asymmetric profiles and all five special identities',()=>{
 const m=fresh();assert.equal(m.data.mode,'strategic_auto');assert.equal(m.data.version,5);assert.equal(m.data.armies.length,11);
 for(const id of BASE_FACTIONS){const f=m.faction(id),p=START_PROFILES[id];assert.equal(f.points,p.points);assert.equal(m.data.armies.filter(a=>a.faction===id).length,p.armies);}
 for(const id of ['mutantes','termitas','arañas','escarabajos'])assert.ok(m.data.actors.some(a=>a.faction===id));
 assert.deepEqual(m.data.scheduledWaves.map(w=>w.turn),[4,12,20]);
});
test('atlas 50/300/400/500: real reciprocal dry borders and five independent approaches for full atlases',()=>{
 for(const size of [50,300,400,500]){const a=new MapLogic().generateMap(2026,size);assert.deepEqual(auditAtlas(a).errors,[]);if(size>=300)assert.equal(a.approaches.length,5);
  for(const e of a.connections)assert.equal(crossesWater(a.nodes[e.from],a.nodes[e.to]),false);
 }
});
test('starting possessions are connected to their own capital; neutral land and Picnic retained',()=>{
 const m=fresh();for(const f of Object.values(m.data.factions)){const seen=new Set([f.capital]),q=[f.capital];for(let i=0;i<q.length;i++)for(const id of m.node(q[i]).neighbors)if(m.node(id).owner===f.id&&!seen.has(id)){seen.add(id);q.push(id);}assert.equal(seen.size,m.data.nodes.filter(n=>n.owner===f.id).length);}
 assert.ok(m.data.nodes.filter(n=>n.owner==='neutral').length>100);assert.equal(m.node(m.data.picnic).owner,'neutral');
});
test('training and real victories are distinct; preparation applies only once',()=>{
 const m=fresh(),a=m.data.armies.find(a=>a.faction==='bala');assert.equal(a.battleVictories,0);assert.equal(a.trainingLevel,2);assert.ok(Math.abs(preparation(a)-.7)<1e-9);
 a.battleVictories=2;a.trainingLevel=1;a.penalty=.2;assert.ok(Math.abs(preparation(a)-.6)<1e-9);a.battleVictories=40;assert.equal(preparation({...a,penalty:0}),1);
});
test('name banks exceed 1000 nonredundant combinations for every principal',()=>{
 for(const f of BASE_FACTIONS){const pool=namePool(f);assert.ok(pool.length>1000);assert.equal(new Set(pool).size,pool.length);assert.ok(pool.every(n=>n.length<=40));}
});
test('identity, renaming and generated suggestions survive serialisation',()=>{
 const m=fresh(),a=m.data.armies[0],commander=m.commander(a),id=commander.id,seed=commander.identitySeed;
 m.rename(a.faction,a.id,'Las del Tocón');m.rename(a.faction,a.id,'Ámbar',true);m.suggestName(a.faction,a.id);
 const loaded=new CampaignModel(m.snapshot()),b=loaded.data.armies[0];assert.equal(loaded.commander(b).id,id);assert.equal(loaded.commander(b).identitySeed,seed);assert.equal(loaded.commander(b).name,'Ámbar');assert.equal(b.name,a.name);
});
test('new names never reuse the fallen army pool',()=>{
 const m=fresh(),a=m.data.armies[0],name=a.name;m.retireArmy(a,'annihilated');const n=m.addArmy('carpinteras',m.faction('carpinteras').capital);assert.notEqual(n.name,name);assert.notEqual(m.commander(n).id,a.commanderId);assert.equal(m.data.lostArmies[0].commander.status,'annihilated');
});
test('empty occupation consumes exactly one action and grants no experience',()=>{
 const m=fresh(),a=m.data.armies[0],n=m.node(m.node(a.territory).neighbors[0]);m.data.armies=m.data.armies.filter(x=>x.territory!==n.id);m.data.actors=m.data.actors.filter(x=>x.territory!==n.id);n.type='ordinary';n.defended=false;n.owner='neutral';
 assert.equal(m.move(a.faction,a.id,n.id),null);assert.equal(a.battleVictories,0);assert.equal(a.ready,false);assert.equal(m.validateMove(a.faction,a.id,a.previousTerritory),'noAction');
});
test('recruit waits a turn and occupied capital blocks recruitment',()=>{
 const m=fresh();assert.throws(()=>m.recruit('carpinteras'));const cap=m.faction('carpinteras').capital,a=m.armyAt(cap);m.retireArmy(a,'annihilated');const n=m.recruit('carpinteras');assert.equal(n.ready,false);m.data.turn++;m.beginFaction('carpinteras');assert.equal(n.ready,true);
});
test('capture cannot farm points by repeated recapture',()=>{
 const m=fresh(),n=m.data.nodes.find(n=>n.owner==='neutral'&&n.type==='ordinary'),f=m.faction('carpinteras');m.capture(n.id,f.id);const points=f.points;n.owner='negras';m.capture(n.id,f.id);assert.equal(f.points,points);
});
test('automatic resolution includes capitals without manual unlock or extra skipped turn',()=>{
 const m=fresh(),{a}=encounter(m,{force:100,defense:20,capital:true});assert.equal(m.canAuto(),true);run(m);assert.equal(a.battleVictories,1);m.acknowledge();m.data.turn++;m.beginFaction(a.faction);assert.equal(a.ready,true);
});
test('same encounter gives same deterministic multiband result; pure preview does not mutate',()=>{
 const m=fresh(),{e}=encounter(m,{third:true}),before=JSON.stringify(e),a=simulateCombat(e),b=simulateCombat(e);assert.deepEqual(a,b);assert.equal(JSON.stringify(e),before);assert.ok(a.trace.some(t=>t.key==='intervention'));assert.equal(a.participants.length,3);
});
test('damage is simultaneous and never exceeds 24 steps; draw preserves ownership',()=>{
 const m=fresh(),{e,n}=encounter(m);e.participants.forEach(p=>{p.faction=p.id;p.force=50;p.retreatAllowed=false;});const owner=n.owner,r=run(m);assert.ok(r.steps<=24);assert.equal(r.winnerId,null);assert.equal(n.owner,owner);
});
test('save during a third-party encounter resumes to exactly the same consequences',()=>{
 const m=fresh();encounter(m,{third:true});m.startResolution();m.advanceEncounter();m.advanceEncounter();const loaded=new CampaignModel(m.snapshot());
 while(m.data.pending)m.advanceEncounter();while(loaded.data.pending)loaded.advanceEncounter();assert.deepEqual(loaded.snapshot(),m.snapshot());
});
test('a controlled victory awards at most one experience despite two defeated opponents',()=>{
 const m=fresh(),{e,a}=encounter(m,{third:true});controlled(m,a.id);assert.equal(a.battleVictories,1);assert.throws(()=>m.applyResult(m.data.lastResult));assert.equal(a.history.filter(h=>h.key==='wonBattle').length,1);
});
test('retreat preserves commander and mutations with penalty; invalid retreat destroys',()=>{
 const m=fresh(),{e,a,from}=encounter(m);a.mutations=['swift'];const commander=a.commanderId;
 controlled(m,e.participants[1].id,{[a.id]:'retreated'});assert.equal(m.data.armies.find(x=>x.id===a.id).commanderId,commander);assert.deepEqual(a.mutations,['swift']);assert.equal(a.territory,from);assert.equal(a.penalty,.2);
 const other=fresh(),x=encounter(other);other.node(x.from).owner='negras';controlled(other,x.e.participants[1].id,{[x.a.id]:'retreated'});assert.ok(other.data.lostArmies.some(a=>a.id===x.a.id));
});
test('resting a complete turn recovers preparation; moving does not',()=>{
 const m=fresh(),a=m.data.armies[0];a.penalty=.2;a.actedTurn=1;m.data.turn=2;m.beginFaction(a.faction);assert.equal(a.penalty,.2);m.data.turn=3;m.beginFaction(a.faction);assert.equal(a.penalty,0);
});
test('a principal captures a capital: transfer, dissolution and reward once',()=>{
 const m=fresh(),f=m.faction('negras'),winner=m.faction('carpinteras'),points=winner.points;f.points=9;m.capture(f.capital,winner.id);
 assert.equal(f.alive,false);assert.ok(!m.data.armies.some(a=>a.faction===f.id));assert.ok(!m.data.nodes.some(n=>n.owner===f.id));assert.ok(winner.points>=points+4);const p=winner.points;m.eliminate(f.id,winner.id);assert.equal(winner.points,p);
});
test('a threat wins a capital: neutral territories, ruined capital, no treasury or new colony',()=>{
 const m=fresh(),{e,n}=encounter(m,{capital:true});e.participants[0]={...e.participants[0],id:'threat',armyId:null,actorId:'threat',faction:'centipede'};m.data.actors.push({id:'threat',faction:'centipede',kind:'predator',territory:e.from,force:170,maxForce:170,active:true,large:true});
 const points=m.faction('carpinteras').points;controlled(m,'threat');assert.equal(m.faction('negras').alive,false);assert.equal(n.type,'ruin');assert.equal(n.owner,'neutral');assert.equal(m.faction('carpinteras').points,points);assert.ok(!m.data.nodes.some(n=>n.owner==='centipede'));
});
test('zero surviving principal colonies ends without a victor',()=>{
 const m=fresh();for(const id of BASE_FACTIONS)m.eliminate(id,null);m.checkVictory();assert.equal(m.data.winner,'none');assert.equal(m.data.victory,'extinction');
});
test('finite enclave budgets and destruction cancel dependent expeditions',()=>{
 const m=fresh(),enclave=m.data.actors.find(a=>a.kind==='enclave');m.data.turn=3;actThreat(m,enclave.id);assert.equal(enclave.budget,1);
 const child=m.data.actors.find(a=>a.enclave===enclave.id);assert.ok(child);
 const {e,a,n}=encounter(m);enclave.territory=n.id;enclave.active=true;e.participants[1]=m.actorParticipant(enclave,'defender');controlled(m,a.id);m.acknowledge();m.data.reward=null;
 assert.equal(enclave.active,false);assert.equal(child.active,false);m.data.turn=8;actThreat(m,enclave.id);assert.equal(m.data.actors.filter(a=>a.active&&a.enclave===enclave.id).length,0);
});
test('large threats retain wounds and recover only after a round without fighting',()=>{
 const m=fresh(),t=m.data.actors.find(t=>t.large);t.force=30;t.lastCombat=3;m.data.turn=3;processWorldEvents(m);assert.equal(t.force,30);m.data.turn=4;processWorldEvents(m);assert.equal(t.force,30+t.maxForce*.1);
});
test('large threat reward is unique and mutation options persist',()=>{
 const m=fresh(),{e,a,n}=encounter(m),t=m.data.actors.find(t=>t.large);t.territory=n.id;e.participants[1]=m.actorParticipant(t,'defender');controlled(m,a.id);const points=m.faction(a.faction).points;assert.equal(t.rewardClaimed,true);const options=[...m.data.reward.options];assert.deepEqual(new CampaignModel(m.snapshot()).data.reward.options,options);assert.equal(m.faction(a.faction).points,points);
});
test('intervention consumes its action and persists without reroll',()=>{
 let found=false;for(let seed=0;seed<30&&!found;seed++){const m=fresh(),{e,n}=encounter(m);m.data.seed=seed;const t=m.data.actors.find(t=>t.kind==='predator');t.territory=m.node(n.id).neighbors.find(id=>id!==e.from)??e.from;t.actedTurn=0;e.participants=e.participants.slice(0,2);reserveIntervention(m,e);
 if(e.participants.length===3){found=true;assert.equal(t.actedTurn,m.data.turn);const before=t.territory;actThreat(m,t.id);assert.equal(t.territory,before);assert.deepEqual(new CampaignModel(m.snapshot()).data.pending.participants,e.participants);}}
 assert.equal(found,true);
});
test('aerial range is separate; termite tunnels use shared dry physical borders',()=>{
 const m=fresh(),n=m.data.nodes.find(n=>n.owner==='neutral'),a={faction:'avispas',territory:n.id};for(const id of actorNeighbors(m,a))assert.ok(Math.hypot(m.node(id).x-n.x,m.node(id).y-n.y)<=140);
 for(const e of m.data.tunnels){assert.equal(crossesWater(m.node(e.from),m.node(e.to)),false);assert.ok(m.node(e.from).polygon.some(p=>m.node(e.to).polygon.some(q=>Math.hypot(p[0]-q[0],p[1]-q[1])<.1)));}
});
test('weather warns, blocks temporarily and expires; geography remains valid',()=>{
 const m=fresh();m.data.turn=8;processWorldEvents(m);const w=m.data.weather[0];assert.equal(w.start,9);assert.equal(m.edgeBlocked(w.edges[0].from,w.edges[0].to),false);m.data.turn=9;refreshWorldEffects(m);assert.equal(m.edgeBlocked(w.edges[0].from,w.edges[0].to),true);m.data.turn=11;processWorldEvents(m);assert.equal(m.data.weather.length,0);assert.deepEqual(auditAtlas(m.data).errors,[]);
});
test('wasp waves appear only on schedule and never exceed the expedition cap',()=>{
 const m=fresh();m.data.turn=3;processWorldEvents(m);assert.ok(!m.data.actors.some(a=>a.faction==='avispas'));m.data.turn=4;processWorldEvents(m);assert.equal(m.data.actors.filter(a=>a.faction==='avispas').length,1);processWorldEvents(m);assert.equal(m.data.actors.filter(a=>a.faction==='avispas').length,1);
});
test('round queue includes factions, threats, events and roundEnd; save resumes exactly',()=>{
 const m=fresh();m.endPlayerTurn();assert.deepEqual(m.data.aiQueue.slice(-2).map(e=>e.kind),['events','roundEnd']);m.aiStep();const loaded=new CampaignModel(m.snapshot());drain(m);drain(loaded);assert.deepEqual(loaded.snapshot(),m.snapshot());assert.equal(m.data.turn,2);
});
test('Picnic counts after all threats/events, and losing occupation resets it',()=>{
 const m=fresh(),p=m.node(m.data.picnic);p.owner='carpinteras';p.cleared=true;m.syncPicnic();m.data.phase='rivals';m.data.aiQueue=[{kind:'events'},{kind:'roundEnd'}];m.aiStep();assert.equal(m.data.picnicHeld,0);m.aiStep();assert.equal(m.data.picnicHeld,1);
 p.owner='negras';m.syncPicnic();assert.equal(m.data.picnicHeld,0);
});
test('controlled complete Picnic campaign uses real automatic encounters and no RTS',()=>{
 const m=fresh(),{a}=encounter(m,{force:100,defense:20});run(m);m.acknowledge();const p=m.node(m.data.picnic);m.data.actors=m.data.actors.filter(t=>t.territory!==p.id);
 // A controlled path bypasses travel duration only; the objective fight uses the real resolver.
 a.territory=p.neighbors.find(id=>!m.armyAt(id));m.node(a.territory).owner=a.faction;a.ready=true;a.battleVictories=5;a.retreatAllowed=false;
 const e=m.move(a.faction,a.id,p.id);e.participants=e.participants.slice(0,2);e.participants[1].force=65;run(m);m.acknowledge();m.data.reward=null;
 assert.equal(p.owner,a.faction);for(let i=0;i<3&&!m.data.winner;i++){m.data.phase='rivals';m.data.aiQueue=[{kind:'events'},{kind:'roundEnd'}];drain(m);}assert.equal(m.data.winner,a.faction);assert.equal(m.data.victory,'picnic');
});
test('domination can complete without visiting every territory',()=>{
 const m=fresh();for(const f of BASE_FACTIONS.filter(f=>f!=='carpinteras'))m.capture(m.faction(f).capital,'carpinteras');m.checkVictory();assert.equal(m.data.winner,'carpinteras');assert.equal(m.data.victory,'domination');assert.ok(m.faction('carpinteras').claimed.length<100);
});
test('military information is stale outside vision; prediction never includes hidden intruders',()=>{
 const m=fresh(),{e}=encounter(m,{third:true});m.data.actors.push({id:'visitor',territory:m.data.nodes.find(n=>!m.visible('carpinteras').has(n.id)).id,active:true});e.participants[2].actorId='visitor';const p=m.prediction();e.participants[2].force=10000;assert.deepEqual(m.prediction(),p);assert.equal(p.uncertain,true);
});
test('v4 saves are backed up; v5 and mid-resolution state round-trip exactly',()=>{
 const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)};
 globalThis.window={localStorage:globalThis.localStorage};gameStorage.setItem('microwars_campaign',JSON.stringify({...template,version:4}));const sm=new StateManager();assert.equal(sm.load(),false);assert.equal(sm.issue,'legacy');assert.ok(memory.has('microwars_campaign_backup_v4'));
 const m=fresh();encounter(m,{third:true});m.startResolution();m.advanceEncounter();sm.model=m;assert.equal(sm.save(),true);const loaded=new StateManager();assert.equal(loaded.load(),true);assert.deepEqual(loaded.data,m.data);
});
test('storage failure blocks cleanly without silently discarding state',()=>{
 globalThis.localStorage={getItem:()=>null,setItem:()=>{throw new Error('quota');}};globalThis.window={localStorage:globalThis.localStorage};const s=new StateManager();s.model=fresh();assert.equal(s.save(),false);assert.equal(s.issue,'saveError');assert.equal(s.data.version,RULES.version);
});


test('friendly empty capital is movement; hostile Picnic always requires an encounter',()=>{
 const m=fresh(),a=m.data.armies.find(a=>a.faction==='carpinteras'),cap=a.territory,near=m.node(cap).neighbors[0];
 m.node(near).owner=a.faction;a.territory=near;a.ready=true;
 assert.equal(m.move(a.faction,a.id,cap),null);assert.equal(a.territory,cap);
 const p=m.node(m.data.picnic);p.cleared=true;p.owner='negras';assert.equal(m.isDefended(p),true);
});
test('Bala initial instruction is not a free global training upgrade',()=>{
 const m=fresh('bala');assert.equal(m.faction('bala').upgrades.training,0);
 assert.equal(m.data.armies.find(a=>a.faction==='bala').trainingLevel,2);
});

test('a strong intruder wins and a weak intruder is defeated under the real resolver',()=>{
 for(const force of [1,180]){const m=fresh(),{e}=encounter(m,{third:true});e.participants.forEach(p=>p.retreatAllowed=false);e.participants[2].force=force;const r=simulateCombat(e),intruder=r.participants[2];if(force===1)assert.equal(intruder.status,'destroyed');else assert.equal(r.winnerId,intruder.id);}
});
test('observed threat intents point to a legal next territory, not the current position',()=>{
 const m=fresh();for(const a of m.data.actors.filter(a=>a.active&&['predator','siege'].includes(a.kind))){assert.notEqual(a.intent,a.territory);assert.ok(actorNeighbors(m,a).includes(a.intent));}
});
test('invalid retreat policy cannot mutate an army',()=>{
 const m=fresh(),a=m.data.armies[0],before=JSON.stringify(a);assert.throws(()=>m.setRetreat(a.faction,a.id,false,99999));assert.equal(JSON.stringify(a),before);
});

test('duplicate participant results are rejected before applying any consequences',()=>{
 const m=fresh(),{e}=encounter(m),r=simulateCombat(e);r.participants[1]={...r.participants[0]};const before=m.snapshot();assert.throws(()=>m.applyResult(r));assert.deepEqual(m.snapshot(),before);
});
