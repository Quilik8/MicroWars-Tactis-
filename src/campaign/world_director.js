import { crossesWater, hasUsableLandBorder } from './atlas.js';
import { STRATEGY as S, BASE_FACTIONS, random, hash } from './rules.js';
export const SPECIAL_FACTIONS=['mutantes','termitas','avispas','arañas','escarabajos'];
export function createWorld(model){
 const d=model.data,used=new Set();
 const choose=(region)=>d.nodes.filter(n=>n.owner==='neutral'&&n.type!=='picnic'&&!n.capitalOf&&!used.has(n.id)&&n.neighbors.some(id=>model.node(id).owner==='neutral')&&[...used].every(id=>Math.hypot(n.x-model.node(id).x,n.y-model.node(id).y)>80)&&d.nodes.filter(c=>c.capitalOf).every(c=>Math.hypot(c.x-n.x,c.y-n.y)>90))
  .sort((a,b)=>(a.region===region?0:1000)+a.id-((b.region===region?0:1000)+b.id))[0];
 const specs=[['mutantes','enclave','asphalt',60],['mutantes','enclave','leaves',55],['termitas','enclave','roots',60],
  ['arañas','enclave','leaves',65],['arañas','enclave','grass',55],['wolfSpider','guardian','roots',S.wolfSpiderForce],
  ['centipede','predator','asphalt',S.centipedeForce],['escarabajos','siege','pond',S.colossalForce]];
 for(const [faction,kind,region,power]of specs){
  const n=choose(region);if(!n)throw new Error('No safe actor placement');used.add(n.id);
  const a={id:`t${++d.sequence}`,faction,kind,territory:n.id,origin:n.id,force:power,maxForce:power,
   active:true,actedTurn:0,lastCombat:0,budget:kind==='enclave'?S.enclaveBudget:0,nextSpawn:S.enclaveActivation,
   rewardClaimed:false,intent:null,large:['guardian','predator','siege'].includes(kind),bornTurn:1};
  d.actors.push(a);if(['guardian','enclave'].includes(kind)){n.cleared=false;n.defended=true;}
  if(kind==='enclave'){n.type='enclave';n.role='enclave';}
  if(kind==='guardian'){n.type='epic';n.role='epic';}
 }
 // Aerial expeditions are scheduled world content, not another selectable capital.
 d.scheduledWaves=S.waspRounds.map(turn=>({id:`wasps-${turn}`,turn,created:false}));
 const termite=d.actors.find(a=>a.faction==='termitas');
 const possible=d.blockedEdges.filter(e=>e.reason!=='water'&&!d.nodes[e.from].capitalOf&&!d.nodes[e.to].capitalOf&&hasUsableLandBorder(d.nodes[e.from],d.nodes[e.to])&&!crossesWater(d.nodes[e.from],d.nodes[e.to]))
  .sort((a,b)=>Math.hypot(d.nodes[a.from].x-d.nodes[termite.territory].x,d.nodes[a.from].y-d.nodes[termite.territory].y)-Math.hypot(d.nodes[b.from].x-d.nodes[termite.territory].x,d.nodes[b.from].y-d.nodes[termite.territory].y));
 d.tunnels=possible.slice(0,3).map(e=>({from:e.from,to:e.to,enclave:termite.id}));
 refreshWorldEffects(model);refreshThreatIntents(model);
}
export function actorAt(model,id){return model.data.actors.find(a=>a.active&&a.territory===id);}
export function actorNeighbors(model,a){
 const d=model.data,n=model.node(a.territory);let ids=[...n.neighbors];
 if(a.faction==='avispas')ids=d.nodes.filter(t=>t.id!==n.id&&Math.hypot(t.x-n.x,t.y-n.y)<=S.flightRange).map(t=>t.id);
 if(a.faction==='termitas')for(const e of d.tunnels)if(d.actors.some(x=>x.id===e.enclave&&x.active)){
  if(e.from===n.id)ids.push(e.to);if(e.to===n.id)ids.push(e.from);
 }
 return [...new Set(ids)].filter(id=>!model.edgeBlocked(n.id,id));
}
export function reserveIntervention(model,encounter){
 const d=model.data,candidates=d.actors.filter(a=>a.active&&a.actedTurn!==d.turn&&a.kind!=='guardian'&&
  !encounter.participants.some(p=>p.faction===a.faction||p.actorId===a.id)&&
  (a.kind!=='enclave'||a.budget>0)&&actorNeighbors(model,a).includes(encounter.territory));
 candidates.sort((a,b)=>(a.faction==='avispas'?-1:0)-(b.faction==='avispas'?-1:0)||hash(`${encounter.seed}:${a.id}`)-hash(`${encounter.seed}:${b.id}`));
 const chosen=candidates[0];if(!chosen)return;
 // Conditional surprise is world-seeded and fixed before any result is shown.
 if(random(d.seed,`intervention:${encounter.id}:${chosen.id}`)>=0.55)return;
 chosen.actedTurn=d.turn;
 if(chosen.kind==='enclave'){
  const expedition=spawnExpedition(model,chosen,chosen.territory);if(!expedition)return;
  expedition.actedTurn=d.turn;encounter.participants.push(model.actorParticipant(expedition,'intruder',3));
 }else encounter.participants.push(model.actorParticipant(chosen,'intruder',3));
}
function spawnExpedition(model,enclave,territory){
 const d=model.data;
 if(enclave.budget<=0||d.actors.filter(a=>a.active&&a.kind==='expedition').length>=S.maxExpeditions)return null;
 enclave.budget--;const a={id:`t${++d.sequence}`,faction:enclave.faction,kind:'expedition',territory,origin:territory,
  force:S.expeditionForce,maxForce:S.expeditionForce,active:true,actedTurn:0,lastCombat:0,large:false,enclave:enclave.id,bornTurn:d.turn,intent:null};
 d.actors.push(a);model.log('expedition',{faction:a.faction},territory);return a;
}
export function actThreat(model,id){
 const d=model.data,a=d.actors.find(a=>a.id===id);
 if(!a?.active||a.actedTurn===d.turn||a.bornTurn===d.turn&&a.kind==='expedition')return;
 a.actedTurn=d.turn;
 if(a.kind==='guardian')return;
 if(a.kind==='enclave'){
  if(d.turn>=S.enclaveActivation&&d.turn>=a.nextSpawn&&a.budget>0){
   const destination=model.node(a.territory).neighbors.find(id=>!actorAt(model,id)&&!model.armyAt(id)&&model.node(id).owner==='neutral');
   if(destination!==undefined&&spawnExpedition(model,a,destination))a.nextSpawn=d.turn+S.enclaveInterval;
  }
  return;
 }
 if(a.kind==='siege'&&d.turn%2===0)return;
 const target=chooseThreatTarget(model,a);if(!target)return;
 const n=model.node(target.id);a.intent=target.id;
 if(model.armyAt(n.id)||n.capitalOf&&d.factions[n.capitalOf]?.alive){model.beginActorAttack(a,n);return;}
 const observation=model.movementObservation(a.territory,n.id);a.previousTerritory=a.territory;a.territory=n.id;model.logMovement('threatMoved',a.faction,a.previousTerritory,n.id,observation);
 refreshThreatIntents(model);
}
function chooseThreatTarget(model,a){
 const d=model.data;const visible=model.actorVision(a),bala=d.factions.bala;
 const picnic=model.node(d.picnic),publicGoal=a.faction==='avispas'&&bala.alive?bala.capital:picnic.id;
 const neighbors=actorNeighbors(model,a).filter(id=>!actorAt(model,id));
 const target=neighbors.map(id=>{
  const n=model.node(id),army=visible.has(id)?model.armyAt(id):null;
  const distance=Math.hypot(n.x-model.node(publicGoal).x,n.y-model.node(publicGoal).y);
  const score=(army?120-preparationScore(army):0)+(n.capitalOf&&d.factions[n.capitalOf]?.alive?75:0)-distance/20-(id===a.previousTerritory?15:0);
  return{id,score};
 }).sort((a,b)=>b.score-a.score||a.id-b.id)[0];
 return target;
}
export function refreshThreatIntents(model){
 for(const a of model.data.actors)if(a.active)a.intent=['predator','siege','expedition'].includes(a.kind)?chooseThreatTarget(model,a)?.id??null:null;
}

const preparationScore=a=>50+10*Math.min(5,a.battleVictories+a.trainingLevel);
export function processWorldEvents(model){
 const d=model.data;
 for(const wave of d.scheduledWaves)if(!wave.created&&d.turn>=wave.turn){
  if(d.actors.filter(a=>a.active&&a.kind==='expedition').length>=S.maxExpeditions)continue;
  const entry=d.nodes.filter(n=>n.owner==='neutral'&&!actorAt(model,n.id)&&!model.armyAt(n.id)&&n.x>900).sort((a,b)=>a.y-b.y)[0];
  if(!entry)continue;
  wave.created=true;d.actors.push({id:wave.id,faction:'avispas',kind:'expedition',territory:entry.id,origin:entry.id,force:S.waspForce,maxForce:S.waspForce,active:true,actedTurn:d.turn,bornTurn:d.turn,lastCombat:0,large:false,intent:null});
  model.log('expedition',{faction:'avispas'},entry.id);
 }
 if(d.turn>=S.eventFirst&&((d.turn-S.eventFirst)%S.eventInterval===0)){
  const regions=d.regions.filter(r=>r.id!=='picnic'),region=regions[hash(`${d.seed}:weather:${d.turn}`)%regions.length].id;
  const edges=d.connections.filter(e=>model.node(e.from).region===region&&model.node(e.to).region===region&&!model.node(e.from).capitalOf&&!model.node(e.to).capitalOf).slice(0,2);
  d.weather.push({id:`rain-${d.turn}`,region,announcedTurn:d.turn,start:d.turn+S.eventWarning,end:d.turn+S.eventWarning+S.eventDuration,edges});
  model.log('weatherWarning',{region},null);
 }
 for(const a of d.actors)if(a.active&&a.large&&a.lastCombat<d.turn)a.force=Math.min(a.maxForce,a.force+a.maxForce*S.largeRecovery);
 d.weather=d.weather.filter(w=>w.end>d.turn);
 refreshWorldEffects(model);refreshThreatIntents(model);
}
export function refreshWorldEffects(model){
 const d=model.data;
 d.effects=[];
 for(const a of d.actors.filter(a=>a.active&&a.kind==='enclave')){
  const kind=a.faction==='mutantes'?'toxic':a.faction==='arañas'?'web':null;
  if(kind)for(const id of [a.territory,...model.node(a.territory).neighbors])d.effects.push({territory:id,kind,source:a.id});
 }
 for(const w of d.weather)if(d.turn>=w.start&&d.turn<w.end)for(const n of d.nodes.filter(n=>n.region===w.region))d.effects.push({territory:n.id,kind:'mud',source:w.id});
}
