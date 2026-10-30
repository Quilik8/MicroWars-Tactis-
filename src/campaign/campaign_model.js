import { MapLogic } from './map_logic.js';
import { BASE_FACTIONS, RULES, STRATEGY, START_PROFILES, UPGRADES, MUTATIONS, clone, preparation, random, hash, COMBAT_TRAITS } from './rules.js';
import { applyStarts } from './start_profiles.js';
import { createIdentity, nextArmyName } from './identity.js';
import { advanceCombat, simulateCombat } from './strategic_combat.js';
import { createWorld, actorAt, actorNeighbors, reserveIntervention, actThreat, processWorldEvents, refreshWorldEffects, refreshThreatIntents } from './world_director.js';

export class CampaignModel {
 constructor(data){this.data=data;data.plannedMoves??=[];data.ordersCommitted??=false;}
 static create(playerFaction,seed=Date.now(),count=RULES.territories){
  if(!BASE_FACTIONS.includes(playerFaction))throw new Error('Invalid campaign faction');
  const data={version:RULES.version,mode:'strategic_auto',startProfileVersion:1,seed,turn:1,phase:'player',playerFaction,
   ...new MapLogic().generateMap(seed,count),armies:[],factions:{},commanders:[],lostArmies:[],usedNames:{},usedCommanderNames:{},
   recruitmentCounters:{},actors:[],tunnels:[],effects:[],weather:[],scheduledWaves:[],intel:{},events:[],sequence:0,eventSequence:0,
   pending:null,reward:null,resultNotice:false,lastResult:null,completedTemplates:[],picnicOwner:null,picnicHeld:0,
   winner:null,victory:null,aiQueue:[],worldRevision:0};
  const m=new CampaignModel(data);applyStarts(data);
  for(const id of BASE_FACTIONS){
   const f=m.faction(id);const initial=m.addArmy(id,f.capital,true);initial.trainingLevel=START_PROFILES[id].training;
   if(START_PROFILES[id].armies===2){
    let at=f.profile.forward;
    if(at===f.capital||m.armyAt(at)){
     at=m.node(f.capital).neighbors.find(n=>!m.armyAt(n)&&!m.node(n).capitalOf&&m.node(n).owner==='neutral');
     if(at!==undefined){m.node(at).owner=id;m.node(at).cleared=true;f.claimed.push(at);f.profile.route.push(at);}
    }
    if(at!==undefined&&at!==f.capital)m.addArmy(id,at,true);
   }
  }
  createWorld(m);m.refreshIntel();return m;
 }
 node(id){return this.data.nodes[id];}
 faction(id){return this.data.factions[id];}
 armiesAt(id){return this.data.armies.filter(a=>a.territory===id);}
 armyAt(id){return this.armiesAt(id)[0];}
 actorAt(id){return actorAt(this,id);}
 commander(army){return this.data.commanders.find(c=>c.id===army?.commanderId);}
 log(key,values={},territory=null,visibleTo=null){
  visibleTo??=territory===null?BASE_FACTIONS:BASE_FACTIONS.filter(f=>this.visible(f).has(territory));
  this.data.events.push({id:++this.data.eventSequence,key,values,territory,turn:this.data.turn,visibleTo:[...visibleTo]});
  if(this.data.events.length>100)this.data.events.shift();
 }
 movementObservation(from,to){
  const seenFrom=BASE_FACTIONS.filter(f=>this.visible(f).has(from)),seenTo=BASE_FACTIONS.filter(f=>this.visible(f).has(to));
  return {seenFrom,seenTo};
 }
 logMovement(key,actor,from,to,observation,extra={}){
  this.log(key,{faction:actor,from,...observation,...extra},to,[...new Set([...observation.seenFrom,...observation.seenTo,actor].filter(f=>BASE_FACTIONS.includes(f)))]);
 }
 history(a,key,encounter=null){a.history.push({key,turn:this.data.turn,encounter,territory:a.territory});}
 addArmy(faction,territory,ready=false){
  const d=this.data,f=this.faction(faction),id=`a${++d.sequence}`,serial=(d.recruitmentCounters[faction]||0)+1;
  d.recruitmentCounters[faction]=serial;const c=createIdentity(d,faction,serial,id);d.commanders.push(c);
  const army={id,faction,territory,name:nextArmyName(d,faction,serial),nameOrigin:'generated',nameTokens:{serial},nameLanguage:'es',formationNumber:serial,
   commanderId:c.id,battleVictories:0,trainingLevel:f.upgrades.training,mutations:[],penalty:0,ready,
   availableTurn:d.turn+(ready?0:1),actedTurn:0,retreatAllowed:true,retreatTarget:null,history:[]};
  this.history(army,'recruited');d.armies.push(army);return army;
 }
 rename(actor,id,name,commander=false){
  if(!this.allowed(actor))throw new Error('busy');
  const a=this.data.armies.find(a=>a.id===id&&a.faction===actor),value=String(name||'').trim().slice(0,40);
  if(!a||!value)throw new Error('invalidName');const target=commander?this.commander(a):a;
  target.name=value;target.nameOrigin='custom';
 }
 suggestName(actor,id){
  if(!this.allowed(actor))throw new Error('busy');const a=this.data.armies.find(a=>a.id===id&&a.faction===actor);if(!a)throw new Error('noAction');
  a.name=nextArmyName(this.data,actor,++this.data.sequence);a.nameOrigin='generated';
 }
 setRetreat(actor,id,allowed,target){
  if(!this.allowed(actor))throw new Error('busy');const a=this.data.armies.find(a=>a.id===id&&a.faction===actor);if(!a)throw new Error('noAction');
  const destination=target===null||target===''?null:Number(target);
  if(destination!==null&&!this.retreatDestinations(actor,a.territory).includes(destination))throw new Error('noRetreat');
  a.retreatAllowed=!!allowed;a.retreatTarget=destination;
 }
 visible(faction){
  const ids=new Set();for(const n of this.data.nodes)if(n.owner===faction){ids.add(n.id);n.neighbors.forEach(id=>ids.add(id));}
  if(this.data.picnicOwner)ids.add(this.data.picnic);return ids;
 }
 actorVision(a){return new Set([a.territory,...actorNeighbors(this,a)]);}
 refreshIntel(){
  for(const faction of BASE_FACTIONS){
   this.data.intel[faction]??={};
   for(const id of this.visible(faction)){
    const n=this.node(id),a=this.armyAt(id),t=this.actorAt(id);
    this.data.intel[faction][id]={turn:this.data.turn,owner:n.owner,type:n.type,
     army:a?{faction:a.faction,battleVictories:a.battleVictories,preparation:preparation(a),name:a.name,count:this.armiesAt(id).length,force:this.defendingArmies(id).reduce((sum,p)=>sum+p.force,0)}:null,
     actor:t?{id:t.id,faction:t.faction,kind:t.kind,force:t.force,maxForce:t.maxForce,intent:t.intent}:null,
     effects:this.data.effects.filter(e=>e.territory===id).map(e=>e.kind),defended:this.isDefended(n)};
   }
  }
 }
 allowed(actor){
  const d=this.data;
  return !d.winner&&!d.pending&&!d.reward&&!d.resultNotice&&(!d.ordersCommitted||this.executingOrders)&&this.faction(actor)?.alive&&
   (d.phase==='player'?actor===d.playerFaction:d.phase==='rivals'&&d.aiQueue[0]?.kind==='faction'&&actor===d.aiQueue[0].faction);
 }
 recruitCost(actor){return RULES.recruit-this.faction(actor).upgrades.incubation;}
 recruit(actor){
  if(!this.allowed(actor))throw new Error('busy');const f=this.faction(actor),cost=this.recruitCost(actor);
  if(this.node(f.capital).owner!==actor||this.armiesAt(f.capital).some(a=>a.faction!==actor)||this.actorAt(f.capital)||f.points<cost)throw new Error('recruitBlocked');
  f.points-=cost;const a=this.addArmy(actor,f.capital);this.log('recruited',{faction:actor},f.capital,[actor]);this.refreshIntel();return a;
 }
 upgrade(actor,key){
  if(!this.allowed(actor)||!UPGRADES.includes(key))throw new Error('busy');const f=this.faction(actor),cost=RULES.upgradeCosts[f.upgrades[key]];
  if(cost===undefined||f.points<cost)throw new Error('upgradeBlocked');f.points-=cost;f.upgrades[key]++;this.log('upgraded',{upgrade:key},null,[actor]);
 }
 edgeBlocked(from,to){return this.data.weather.some(w=>this.data.turn>=w.start&&this.data.turn<w.end&&w.edges.some(e=>e.from===from&&e.to===to||e.from===to&&e.to===from));}
 validateMove(actor,armyId,targetId){
  if(!this.allowed(actor))return 'busy';const a=this.data.armies.find(a=>a.id===armyId),n=this.node(targetId);
  if(!a||a.faction!==actor||!a.ready)return 'noAction';
  if(!n)return 'notAdjacent';
  if(!this.node(a.territory).neighbors.includes(targetId)){const edge=this.data.blockedEdges.find(e=>e.from===a.territory&&e.to===targetId||e.to===a.territory&&e.from===targetId);return edge?(edge.reason==='water'?'waterBlocked':'closedPass'):'notAdjacent';}
  if(this.edgeBlocked(a.territory,targetId))return 'flooded';
  return null;
 }
 validatePlan(actor,armyId,targetId){
  const d=this.data,a=d.armies.find(a=>a.id===armyId);if(!this.allowed(actor))return 'busy';
  if(!a||a.faction!==actor||!a.ready)return 'noAction';if(targetId===a.territory)return null;
  const error=this.validateMove(actor,armyId,targetId);if(error)return error;
  return null;
 }
 planMove(actor,armyId,target){
  const error=this.validatePlan(actor,armyId,target);if(error)throw new Error(error);
  const a=this.data.armies.find(a=>a.id===armyId);this.data.plannedMoves=this.data.plannedMoves.filter(o=>o.armyId!==armyId);
  if(target!==a.territory)this.data.plannedMoves.push({armyId,target,from:a.territory});

 }
 clearPlans(){if(!this.allowed(this.data.playerFaction))throw new Error('busy');this.data.plannedMoves=[];}
 commitOrders(){
  const d=this.data;if(!this.allowed(d.playerFaction))throw new Error('busy');
  for(const o of d.plannedMoves){const error=this.validatePlan(d.playerFaction,o.armyId,o.target);if(error)throw new Error(error);}
  d.ordersCommitted=true;
 }
 executeNextOrder(){
  const d=this.data;if(!d.ordersCommitted||d.pending||d.reward||d.resultNotice||d.winner)return;
  d.plannedMoves=d.plannedMoves.filter(o=>d.armies.some(a=>a.id===o.armyId&&a.ready));
  if(!d.plannedMoves.length){d.ordersCommitted=false;this.endPlayerTurn();return;}
  const order=d.plannedMoves[0];
  const coordinated=d.plannedMoves.filter(o=>o.target===order.target);
  this.executingOrders=true;try{
   this.move(d.playerFaction,order.armyId,order.target,coordinated.slice(1).map(o=>o.armyId));
   const executed=new Set(d.pending?coordinated.map(o=>o.armyId):[order.armyId]);
   d.plannedMoves=d.plannedMoves.filter(o=>!executed.has(o.armyId));
   if(d.pending)this.startResolution();
  }finally{this.executingOrders=false;}

 }
 retreatDestinations(faction,id){return this.node(id).neighbors.filter(t=>this.node(t).owner===faction&&(!this.armyAt(t)||this.armyAt(t).faction===faction)&&!this.actorAt(t)&&!this.edgeBlocked(id,t));}
 armyParticipant(a,role,territory){
  const n=this.node(territory),f=this.faction(a.faction);let force=100*preparation(a);
  const logistics=a.faction==='negras'&&n.owner===a.faction;if(logistics)force=Math.min(100,force*(1+COMBAT_TRAITS.negras));
  const destinations=role==='attacker'?[a.territory,...this.retreatDestinations(a.faction,a.territory)]:this.retreatDestinations(a.faction,territory);
  const target=destinations.includes(a.retreatTarget)?a.retreatTarget:destinations[0]??null;
  return{id:a.id,armyId:a.id,actorId:null,faction:a.faction,role,force,mutations:[...a.mutations],enterAt:0,
   retreatAllowed:a.retreatAllowed,retreatTarget:target,behavior:'fight',factors:logistics?['logistics']:[],deploymentBonus:logistics?force-100*preparation(a):0};
 }
 defendingArmies(territory){
  const n=this.node(territory),participants=this.armiesAt(territory).map(a=>this.armyParticipant(a,'defender',territory));
  if(n.type==='capital'&&participants.length){
   const floor=100*Math.min(1,STRATEGY.capitalPreparation*(1+0.1*(this.faction(n.owner)?.upgrades.reserve||0)));
   participants[0].force+=Math.max(0,floor-participants.reduce((sum,p)=>sum+p.force,0));
  }
  return participants;
 }
 actorParticipant(a,role,enterAt=0){return{id:a.id,armyId:null,actorId:a.id,faction:a.faction,role,force:a.force,
  mutations:[],enterAt,retreatAllowed:false,retreatTarget:null,behavior:a.kind==='predator'?'hunt':'fight',factors:[a.kind]};}
 localParticipant(n){
  const capital=n.type==='capital',force=capital?100*Math.min(1,STRATEGY.capitalPreparation*(1+0.1*(this.faction(n.owner)?.upgrades.reserve||0))):
   n.type==='picnic'?STRATEGY.picnicForce:(n.type==='epic'?STRATEGY.epicMin:n.type==='pass'?STRATEGY.passMin:STRATEGY.localMin)+Math.floor(random(this.data.seed,`guard:${n.id}`)*((n.type==='epic'?STRATEGY.epicMax-STRATEGY.epicMin:n.type==='pass'?STRATEGY.passMax-STRATEGY.passMin:STRATEGY.localMax-STRATEGY.localMin)+1));
  return{id:`local-${n.id}`,armyId:null,actorId:null,faction:n.owner==='neutral'?`local-${n.id}`:n.owner,
   role:'defender',force,mutations:[],enterAt:0,retreatAllowed:false,retreatTarget:null,behavior:'guard',factors:['localDefense']};
 }
 orderAssessment(armyId,targetId){
  const d=this.data,a=d.armies.find(a=>a.id===armyId),n=this.node(targetId);
  if(!a||!n||targetId===a.territory)return null;
  const attackIds=new Set([armyId,...d.plannedMoves.filter(o=>o.target===targetId).map(o=>o.armyId)]);
  const attack=d.armies.filter(x=>attackIds.has(x.id)).reduce((sum,x)=>sum+this.armyParticipant(x,'attacker',targetId).force,0);
  if(!this.visible(a.faction).has(targetId))return {attack,defense:null,risk:'unknown'};
  if(n.owner===a.faction)return {attack,defense:0,risk:'regroup'};
  const defenders=this.armiesAt(targetId),threat=this.actorAt(targetId);
  const defense=defenders.length?this.defendingArmies(targetId).reduce((sum,p)=>sum+p.force,0):threat?threat.force:this.isDefended(n)?this.localParticipant(n).force:0;
  return {attack,defense,risk:!defense?'unopposed':attack<defense*1.15?'danger':'advantage'};
 }
 isDefended(n){return n.type==='capital'||n.type==='picnic'||!!this.actorAt(n.id)||(n.defended&&!n.cleared);}
 createEncounter(attacker,n,support=[]){
  const d=this.data,defender=this.armyAt(n.id),threat=this.actorAt(n.id),participants=[attacker];
  if(defender)participants.push(...this.defendingArmies(n.id));
  else if(threat)participants.push(this.actorParticipant(threat,'defender'));
  else participants.push(this.localParticipant(n));
  participants.push(...support.map(a=>this.armyParticipant(a,'attacker',n.id)));
  const e={playerPointsBefore:this.faction(d.playerFaction).points,id:`e${++d.sequence}`,territory:n.id,type:n.type,region:n.region,template:n.template,from:attacker.armyId?d.armies.find(a=>a.id===attacker.armyId).territory:d.actors.find(a=>a.id===attacker.actorId).territory,
   attacker:attacker.faction,defender:participants[1].faction,attackArmy:attacker.armyId,defendArmy:participants[1].armyId,
   attackPreparation:attacker.force/100,defendPreparation:participants[1].force/100,attackMutations:attacker.mutations,defendMutations:participants[1].mutations,
   retreatAttack:attacker.retreatTarget===null?[]:[attacker.retreatTarget],retreatDefend:participants[1].retreatTarget===null?[]:[participants[1].retreatTarget],
   participants,seed:hash(`${d.seed}:${d.sequence}`),status:'preparation',conditions:{mud:d.effects.some(e=>e.territory===n.id&&(e.kind==='mud'||e.kind==='web')),toxic:d.effects.some(e=>e.territory===n.id&&e.kind==='toxic')},
   visibleTo:BASE_FACTIONS.filter(f=>this.visible(f).has(n.id)||f===attacker.faction),consumable:null};
  reserveIntervention(this,e);d.pending=e;this.logMovement('attackStarted',e.attacker,e.from,n.id,this.movementObservation(e.from,n.id));this.refreshIntel();return e;
 }
 move(actor,armyId,targetId,supportIds=[]){
  const error=this.validateMove(actor,armyId,targetId);if(error)throw new Error(error);
  const a=this.data.armies.find(a=>a.id===armyId),n=this.node(targetId);a.ready=false;a.actedTurn=this.data.turn;
  if(this.armiesAt(n.id).some(x=>x.faction!==actor)||this.actorAt(n.id)||n.owner!==actor&&this.isDefended(n)){
   const support=this.data.armies.filter(x=>supportIds.includes(x.id)&&!this.validateMove(actor,x.id,targetId));
   for(const ally of support){ally.ready=false;ally.actedTurn=this.data.turn;}
   return this.createEncounter(this.armyParticipant(a,'attacker',n.id),n,support);
  }
  const from=a.territory,observation=this.movementObservation(from,n.id),conquered=n.owner!==actor;if(conquered)this.capture(n.id,actor);a.previousTerritory=from;a.territory=n.id;
  this.history(a,'moved');this.logMovement('moved',actor,from,n.id,observation,{conquered});this.refreshIntel();return null;
 }
 beginActorAttack(a,n){
  // A ruined or conquered capital is not another faction's elimination condition.
  const participant=this.actorParticipant(a,'attacker');return this.createEncounter(participant,n);
 }
 capture(id,actor){
  const n=this.node(id),former=n.owner,f=this.faction(actor);if(!f?.alive)throw new Error('Invalid conqueror');
  n.owner=actor;n.cleared=true;
  if(!f.claimed.includes(id)){f.claimed.push(id);f.points+=n.conquestReward??1;}
  if(n.type==='capital'&&n.capitalOf===former&&this.faction(former)?.alive)this.eliminate(former,actor);
  this.syncPicnic();
 }
 retireArmy(a,reason,encounter=null){
  const c=this.commander(a);if(c)c.status=reason;this.history(a,reason,encounter);
  this.data.lostArmies.push({...clone(a),commander:clone(c),lostTurn:this.data.turn,reason});
  this.data.armies=this.data.armies.filter(x=>x.id!==a.id);this.data.plannedMoves=this.data.plannedMoves.filter(o=>o.armyId!==a.id);
 }
 eliminate(loser,winner=null){
  const d=this.data,f=this.faction(loser),w=this.faction(winner);if(!f?.alive)return;
  f.alive=false;if(w?.alive){w.points+=Math.floor(f.points/2);w.consumables.push({id:`g${++d.sequence}`,source:loser});}f.points=0;
  for(const a of [...d.armies].filter(a=>a.faction===loser))this.retireArmy(a,'colonyLost');
  for(const n of d.nodes)if(n.owner===loser)n.owner=w?.alive?winner:'neutral';
  if(!w?.alive){const capital=this.node(f.capital);capital.type='ruin';capital.role='ruin';capital.cleared=true;capital.defended=false;d.worldRevision++;}
  this.syncPicnic();this.log(w?.alive?'eliminated':'devastated',{faction:loser,winner},f.capital,BASE_FACTIONS);
 }
 syncPicnic(){
  const d=this.data,n=this.node(d.picnic),owner=this.faction(n.owner)?.alive&&!this.actorAt(n.id)?n.owner:null;
  if(owner!==d.picnicOwner){d.picnicOwner=owner;d.picnicHeld=0;d.picnicEligibleTurn=d.turn+(d.phase==='player'?0:1);}
 }
 checkVictory(){
  const d=this.data,alive=BASE_FACTIONS.filter(f=>this.faction(f).alive);if(d.winner)return;
  if(alive.length===0){d.winner='none';d.victory='extinction';}
  else if(!this.faction(d.playerFaction).alive){d.winner=alive.length===1?alive[0]:'rivals';d.victory='capitalLost';}
  else if(alive.length===1){d.winner=alive[0];d.victory='domination';}
  if(d.winner)d.phase='finished';
 }
 canAuto(){return this.data.mode==='strategic_auto'&&this.data.pending?.status==='preparation';}
 prediction(){
  const e=this.data.pending;if(!e)throw new Error('noEncounter');const visible=this.visible(this.data.playerFaction);
  const known=e.participants.filter(p=>!p.actorId||visible.has(this.data.actors.find(a=>a.id===p.actorId)?.territory));
  const r=simulateCombat({...e,participants:known});
  return {winner:r.winnerFaction===e.attacker?'attacker':r.winnerFaction===e.defender?'defender':null,
   attack:e.participants.filter(p=>p.role==='attacker').reduce((sum,p)=>sum+p.force,0)/100,defense:e.participants.filter(p=>p.role==='defender').reduce((sum,p)=>sum+p.force,0)/100,knownIntruders:known.filter(p=>p.role==='intruder').map(p=>({faction:p.faction,force:p.force})),uncertain:true};
 }
 consume(id){
  const e=this.data.pending,f=this.faction(this.data.playerFaction);if(!e||e.status!=='preparation'||e.consumable||!e.participants.some(p=>p.faction===f.id))throw new Error('busy');
  const item=f.consumables.find(c=>c.id===id);if(!item)throw new Error('busy');f.consumables=f.consumables.filter(c=>c.id!==id);e.consumable=item;
  const p=e.participants.find(p=>p.faction===f.id);p.force=Math.min(100,p.force+15);
 }
 startResolution(){const e=this.data.pending;if(!e||e.status!=='preparation')throw new Error('busy');e.status='resolving';}
 advanceEncounter(){
  const e=this.data.pending;if(!e||e.status!=='resolving')return false;
  const result=advanceCombat(e);if(result)this.applyResult(result);return !!result;
 }
 applyResult(result){
  const d=this.data,e=d.pending;if(!e||e.id!==result.encounterId||result.participants.length!==e.participants.length||result.participants.some(p=>!e.participants.some(x=>x.id===p.id)))throw new Error('staleResult');
  const statuses=['victory','survived','retreated','destroyed'];
  if(new Set(result.participants.map(p=>p.id)).size!==e.participants.length||result.participants.some(p=>{
   const original=e.participants.find(x=>x.id===p.id);return !statuses.includes(p.status)||!Number.isFinite(p.remaining)||p.remaining<0||p.remaining>original.force||p.faction!==original.faction||p.armyId!==original.armyId||p.actorId!==original.actorId||p.role!==original.role;
  })||result.participants.some(p=>p.status==='victory'&&p.faction!==result.winnerFaction)||(!result.winnerId&&result.participants.some(p=>p.status==='victory'))||result.winnerId&&!result.participants.some(p=>p.id===result.winnerId&&p.status==='victory'))throw new Error('staleResult');
  const winner=result.participants.find(p=>p.id===result.winnerId),n=this.node(e.territory),changes=[],rewardedArmies=new Set();
  for(const p of result.participants){
   const a=d.armies.find(a=>a.id===p.armyId),t=d.actors.find(a=>a.id===p.actorId);
   if(a){
    if(p.status==='destroyed'){this.retireArmy(a,'annihilated',e.id);changes.push({key:'annihilated',army:a.name,faction:a.faction});}
    else if(p.status==='retreated'){
     const target=p.retreatTarget;
     if(target!==null&&this.node(target)?.owner===a.faction&&(!this.armyAt(target)||this.armyAt(target).faction===a.faction)&&!this.actorAt(target)&&!this.edgeBlocked(a.territory,target)){
      a.territory=target;a.penalty=RULES.retreatPenalty;a.ready=false;a.actedTurn=d.turn;this.history(a,'retreated',e.id);changes.push({key:'retreated',army:a.name,faction:a.faction});
     }else{this.retireArmy(a,'annihilated',e.id);changes.push({key:'annihilated',army:a.name,faction:a.faction});}
    }else if(p.status==='victory'){a.battleVictories++;a.penalty=0;this.history(a,'wonBattle',e.id);changes.push({key:'veterancyGained',army:a.name,faction:a.faction});}
   }
   if(t){
    t.actedTurn=d.turn;t.lastCombat=d.turn;
    if(t.large)t.force=p.remaining;
    if(p.status==='destroyed'){
     t.active=false;
     if(t.kind==='enclave'){n.cleared=true;for(const expedition of d.actors.filter(x=>x.enclave===t.id))expedition.active=false;}
     if(t.large&&!t.rewardClaimed&&this.faction(winner?.faction)?.alive&&winner?.armyId){
      t.rewardClaimed=true;this.faction(winner.faction).points+=STRATEGY.guardianReward;this.grantMutation(winner.armyId,t.id);rewardedArmies.add(winner.armyId);
     }
    }
   }
   if(!p.armyId&&!p.actorId&&p.status==='destroyed'&&!['capital','picnic'].includes(n.type))n.cleared=true;
  }
  if(winner){
   if(this.faction(winner.faction)?.alive){
    const a=d.armies.find(a=>a.id===winner.armyId);
    if(winner.role!=='defender'){this.capture(n.id,winner.faction);changes.push({key:'territoryCaptured',faction:winner.faction});for(const p of result.participants.filter(p=>p.faction===winner.faction&&p.role!=='defender'&&p.status==='victory')){const ally=d.armies.find(x=>x.id===p.armyId);if(ally){ally.previousTerritory=ally.territory;ally.territory=n.id;}}}
    if(n.type==='epic'&&a&&winner.role!=='defender'&&!this.faction(a.faction).epicClaimed.includes(n.id)){
     this.faction(a.faction).epicClaimed.push(n.id);if(!rewardedArmies.has(a.id))this.grantMutation(a.id,n.id);
    }
   }else{
    const t=d.actors.find(a=>a.id===winner.actorId);
    if(t){t.previousTerritory=t.territory;t.territory=n.id;if(n.type!=='capital'&&n.owner!=='neutral')n.owner='neutral';}
    if(n.type==='capital'&&n.owner===n.capitalOf&&this.faction(n.capitalOf)?.alive)this.eliminate(n.capitalOf,null);
   }
  }
  refreshWorldEffects(this);refreshThreatIntents(this);this.syncPicnic();
  const gained=this.faction(d.playerFaction).points-(e.playerPointsBefore??this.faction(d.playerFaction).points);if(gained>0)changes.push({key:'pointsGained',value:gained});
  result.territory=n.id;result.changes=changes;result.turn=d.turn;result.participantNames=e.participants.map(p=>({id:p.id,name:d.armies.find(a=>a.id===p.armyId)?.name||d.lostArmies.find(a=>a.id===p.armyId)?.name||p.faction,faction:p.faction}));
  d.lastResult=result;d.resultNotice=e.participants.some(p=>p.faction===d.playerFaction);d.pending=null;
  this.log('battleResult',{faction:winner?.faction||'neutral',encounter:e.id,attacker:e.attacker,defender:e.defender,conquered:!!winner&&winner.role!=='defender'},n.id,e.visibleTo);this.refreshIntel();this.checkVictory();return result;
 }
 grantMutation(armyId,source){
  const a=this.data.armies.find(a=>a.id===armyId);if(!a)return;
  const options=[...MUTATIONS].sort((x,y)=>hash(`${this.data.seed}:${source}:${x}`)-hash(`${this.data.seed}:${source}:${y}`));
  if(a.faction===this.data.playerFaction)this.data.reward={army:a.id,options,source};
  else {const choice=options.find(k=>!a.mutations.includes(k));if(choice)a.mutations=[...a.mutations,choice].slice(-RULES.mutationSlots);}
 }
 chooseMutation(key,replaceIndex=null){
  const r=this.data.reward,a=this.data.armies.find(a=>a.id===r?.army);
  if(!a||!r.options.includes(key)||a.mutations.includes(key))throw new Error('mutationBlocked');
  if(a.mutations.length<RULES.mutationSlots)a.mutations.push(key);
  else if(Number.isInteger(replaceIndex)&&replaceIndex>=0&&replaceIndex<RULES.mutationSlots)a.mutations[replaceIndex]=key;else throw new Error('replacementRequired');
  this.data.reward=null;this.history(a,'mutation');
 }
 acknowledge(){this.data.resultNotice=false;}
 beginFaction(actor){
  const d=this.data,f=this.faction(actor);if(!f.alive)return;
  if(this.node(f.capital).owner===actor&&f.incomeTurn!==d.turn){f.points+=RULES.income;f.incomeTurn=d.turn;}
  for(const a of d.armies.filter(a=>a.faction===actor)){
   if(a.actedTurn<d.turn-1)a.penalty=0;a.ready=a.availableTurn<=d.turn;
  }
 }
 endPlayerTurn(){
  if(!this.allowed(this.data.playerFaction))throw new Error('busy');const d=this.data,rivals=BASE_FACTIONS.filter(f=>f!==d.playerFaction&&this.faction(f).alive),offset=(d.turn-1)%Math.max(1,rivals.length);
  d.aiQueue=[...rivals.slice(offset),...rivals.slice(0,offset)].map(faction=>({kind:'faction',faction,started:false}));
  d.aiQueue.push(...d.actors.filter(a=>a.active).map(a=>({kind:'threat',id:a.id})),{kind:'events'},{kind:'roundEnd'});
  d.phase='rivals';this.refreshIntel();
 }
 aiStep(){
  const d=this.data;if(d.phase!=='rivals'||d.pending||d.reward||d.resultNotice||d.winner)return false;
  const entry=d.aiQueue[0];if(!entry)throw new Error('Missing round-end queue');
  if(entry.kind!=='faction'){
   d.aiQueue.shift();
   if(entry.kind==='threat')actThreat(this,entry.id);
   if(entry.kind==='events')processWorldEvents(this);
   if(entry.kind==='roundEnd')this.finishRound();
   this.refreshIntel();return true;
  }
  const actor=entry.faction,f=this.faction(actor);if(!f.alive){d.aiQueue.shift();return true;}
  if(!entry.started){this.beginFaction(actor);entry.started=true;
   const upgrade=UPGRADES.find(k=>f.upgrades[k]<2&&f.points>=RULES.upgradeCosts[f.upgrades[k]]+this.recruitCost(actor));if(upgrade)this.upgrade(actor,upgrade);}
  if(!this.actorAt(f.capital)&&f.points>=this.recruitCost(actor)&&d.armies.filter(a=>a.faction===actor).length<6)this.recruit(actor);
  const a=d.armies.find(a=>a.faction===actor&&a.ready);if(!a){d.aiQueue.shift();return true;}
  if(a.penalty||a.territory===d.picnic&&d.picnicOwner===actor){a.ready=false;return true;}
  const visible=this.visible(actor),intel=d.intel[actor]||{},capital=this.node(f.capital);
  const threatened=capital.neighbors.some(id=>visible.has(id)&&(this.armyAt(id)?.faction!==actor&&this.armyAt(id)||this.actorAt(id)));
  if(threatened&&a.territory===f.capital){a.ready=false;return true;}
  const targets=threatened?[f.capital]:d.picnicOwner&&d.picnicOwner!==actor?[d.picnic]:[...d.nodes.filter(n=>visible.has(n.id)&&n.owner!==actor&&this.isDefended(n)&&n.type!=='capital'&&(intel[n.id]?.actor?.force??45)<100*preparation(a)*0.85).map(n=>n.id),d.picnic];
  const goal=targets[0],dist=new Map([[goal,0]]),queue=[goal];
  for(let i=0;i<queue.length;i++)for(const id of this.node(queue[i]).neighbors)if(!dist.has(id)){dist.set(id,dist.get(queue[i])+1);queue.push(id);}
  const candidates=this.node(a.territory).neighbors.filter(id=>!this.validateMove(actor,a.id,id)).map(id=>{
   const n=this.node(id),known=intel[id];let score=-(dist.get(id)??100)*3+(known?.owner!==actor?3:0)-(id===a.previousTerritory?5:0);
   const enemyPower=known?.actor?.force??(known?.army?known.army.force??known.army.preparation*100:known?.defended?(n.type==='capital'?65:n.type==='picnic'?STRATEGY.picnicForce:50):0);
   if(visible.has(id)&&enemyPower>preparation(a)*100*1.12)score-=35;
   if(id===f.capital&&threatened)score+=35;return{id,score};
  }).sort((a,b)=>b.score-a.score||a.id-b.id);
  if(!candidates.length||candidates[0].score<-65){a.ready=false;return true;}
  this.move(actor,a.id,candidates[0].id,d.armies.filter(x=>x.id!==a.id&&x.faction===actor&&x.territory===a.territory&&x.ready).map(x=>x.id));return true;
 }
 finishRound(){
  const d=this.data;this.syncPicnic();
  if(d.picnicOwner&&d.turn>=(d.picnicEligibleTurn||0)){
   d.picnicHeld++;if(d.picnicHeld>=RULES.picnicRounds){d.winner=d.picnicOwner;d.victory='picnic';d.phase='finished';return;}
  }
  this.checkVictory();if(d.winner)return;
  d.turn++;d.phase='player';d.aiQueue=[];refreshWorldEffects(this);this.beginFaction(d.playerFaction);this.refreshIntel();
 }
 snapshot(){return clone(this.data);}
}
