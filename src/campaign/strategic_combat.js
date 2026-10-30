import { STRATEGY as S, COMBAT_TRAITS as T } from './rules.js';

/** Pure multi-participant contract. A future RTS adapter can return the same result. */
export function initialiseCombat(encounter){
 return {step:0,phase:'approach',fighters:encounter.participants.map(p=>({...p,
  initial:p.force,remaining:p.force,status:'waiting',burn:0,poison:0,damageDealt:0,
  damageTaken:0,reinforced:false,factorTotals:p.deploymentBonus?{factorLogistics:p.deploymentBonus}:{}})),trace:[],done:false,result:null};
}
const record=(f,key,value)=>{f.factorTotals[key]=(f.factorTotals[key]||0)+value;};
export function advanceCombat(encounter){
 const s=encounter.combat??=initialiseCombat(encounter);if(s.done)return s.result;
 s.step++;s.phase=s.step<=2?'approach':s.step===3?'intervention':s.step<7?'clash':'attrition';
 for(const f of s.fighters)if(f.status==='waiting'&&s.step>=f.enterAt){
  f.status='active';s.trace.push({step:s.step,key:f.enterAt?'intervention':'joined',participant:f.id,faction:f.faction});
 }
 for(const f of s.fighters.filter(f=>f.status==='active')){
  if(f.retreatAllowed&&f.retreatTarget!==null&&f.remaining>0&&f.remaining<=f.initial*S.retreatThreshold){
   f.status='retreated';s.trace.push({step:s.step,key:'retreated',participant:f.id});
  }
 }
 const active=s.fighters.filter(f=>f.status==='active'),hits=new Map(active.map(f=>[f.id,0])),heals=new Map();
 for(const f of active){
  if(f.faction==='cortadoras'&&!f.reinforced&&s.step>=f.enterAt+4){
   const reinforcement=Math.min(f.initial-f.remaining,f.initial*T.cortadorasReinforce);f.remaining+=reinforcement;record(f,'reinforcement',reinforcement);f.reinforced=true;
   s.trace.push({step:s.step,key:'reinforcement',participant:f.id});
  }
 }
 for(const f of active){
  const targets=active.filter(o=>o.faction!==f.faction).sort((a,b)=>{
   const value=o=>f.behavior==='hunt'?o.remaining:-o.remaining;
   return value(a)-value(b)||a.id.localeCompare(b.id);
  });
  const target=targets[0];if(!target)continue;
  let damage=(f.initial*S.initialDamageWeight+f.remaining*(1-S.initialDamageWeight))*S.damage;
  const modify=(coefficient,key)=>{const before=damage;damage*=coefficient;record(f,key,damage-before);};
  if(f.faction==='tejedoras'&&s.step<=f.enterAt+3)modify(1+T.tejedoras,'autoTrait.tejedoras');
  if(f.mutations.includes('swift')&&s.step<=f.enterAt+3)modify(1+S.swiftBonus,'swift');
  if(f.faction==='avispas'&&s.step<=f.enterAt+2)modify(1+T.avispas,'avispas');
  if(f.faction==='escarabajos')modify(1-T.escarabajosSlow,'escarabajos');
  if(f.faction==='termitas'&&f.role==='defender')modify(1+T.termitas,'termitas');
  if(encounter.conditions.mud&&f.faction!=='avispas')modify(f.mutations.includes('marsh')?S.marshMultiplier:S.mudMultiplier,f.mutations.includes('marsh')?'marsh':'mud');
  if(target.faction==='carpinteras'&&target.role==='defender'&&['capital','pass'].includes(encounter.type))modify(1-T.carpinteras,'autoTrait.carpinteras');
  if(target.faction==='escarabajos')modify(1-T.escarabajosArmor,'escarabajos');
  if(target.faction==='arañas'&&s.step<=target.enterAt+2)modify(1-T.arañas,'arañas');
  if(target.faction==='cortadoras')modify(1+T.cortadorasFragility,'autoTrait.cortadoras');
  if(f.faction==='fuego')target.burn=Math.max(target.burn,2);
  if(f.faction==='mutantes')target.poison=Math.max(target.poison,2);
  hits.set(target.id,hits.get(target.id)+damage);f.damageDealt+=damage;
  if(f.faction==='bala')heals.set(f.id,damage*T.bala);
 }
 for(const f of active){
  let damage=hits.get(f.id)||0;
  const toxins=f.mutations.includes('acid')?0.5:1;
  if(f.burn>0){damage+=f.initial*T.fuego;record(f,'autoTrait.fuego',-f.initial*T.fuego);f.burn--;}
  if(f.poison>0){damage+=f.initial*T.mutantes*toxins;record(f,'toxic',-f.initial*T.mutantes*toxins);f.poison--;}
  if(encounter.conditions.toxic)damage+=f.initial*S.toxicDamage*toxins;
  const recovery=Math.min(f.initial-f.remaining,heals.get(f.id)||0);if(recovery)record(f,'autoTrait.bala',recovery);
  f.damageTaken+=damage;f.remaining=Math.max(0,Math.min(f.initial,f.remaining+(heals.get(f.id)||0))-damage);
  if(f.remaining<=0.001){f.remaining=0;f.status='destroyed';s.trace.push({step:s.step,key:'destroyed',participant:f.id});}
 }
 const survivors=s.fighters.filter(f=>f.status==='active'),waiting=s.fighters.some(f=>f.status==='waiting');
 const survivingFactions=new Set(survivors.map(f=>f.faction));
 if((survivingFactions.size<=1&&!waiting)||s.step>=S.maxSteps){
  const winner=survivingFactions.size===1?survivors[0]:null;
  s.phase='consequences';s.done=true;
  s.result={encounterId:encounter.id,resolutionMode:'strategic_auto',winnerId:winner?.id??null,
   winnerFaction:winner?.faction??null,steps:s.step,participants:s.fighters.map(f=>({
    id:f.id,armyId:f.armyId,actorId:f.actorId,faction:f.faction,role:f.role,
    status:winner&&f.faction===winner.faction&&f.status==='active'?'victory':f.status==='active'?'survived':f.status,
    initial:f.initial,remaining:f.remaining,retreatTarget:f.retreatTarget,
    damageDealt:f.damageDealt,damageTaken:f.damageTaken,factors:f.factors,factorTotals:f.factorTotals})),trace:s.trace,
   conditions:{...encounter.conditions}};
  return s.result;
 }
 return null;
}
export function simulateCombat(encounter){
 const copy=JSON.parse(JSON.stringify(encounter));
 while(!copy.combat?.done)advanceCombat(copy);
 return copy.combat.result;
}
