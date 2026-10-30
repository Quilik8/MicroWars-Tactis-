import {CampaignModel} from '../src/campaign/campaign_model.js';
import {preparation,UPGRADES,RULES} from '../src/campaign/rules.js';
import fs from 'node:fs';
const reports=[],seed=Number(process.env.CAMPAIGN_SEED||20261019);const factions=(process.env.CAMPAIGN_FACTIONS||'carpinteras,tejedoras,bala').split(','),goals=(process.env.CAMPAIGN_GOALS||'picnic,domination').split(',');
for(const faction of factions)for(const goal of goals){
 const m=CampaignModel.create(faction,seed);const d=m.data;let battles=0,thirdParties=0,moves=0,maxArmies=d.armies.length;const fought=new Set(),roundTimes=[];
 const settle=()=>{let guard=0;while(d.pending||d.reward||d.resultNotice){if(++guard>100)throw Error('settle loop');if(d.pending){if(d.pending.status==='preparation')m.startResolution();while(d.pending)m.advanceEncounter();battles++;thirdParties+=d.lastResult.participants.length===3?1:0;fought.add(d.lastResult.territory);}if(d.resultNotice)m.acknowledge();if(d.reward){const a=d.armies.find(a=>a.id===d.reward.army),key=d.reward.options.find(k=>!a?.mutations.includes(k));if(key&&a)m.chooseMutation(key,a.mutations.length>=3?0:null);else d.reward=null;}}};
 while(!d.winner&&d.turn<=180){const started=performance.now();const f=m.faction(faction);
  for(const key of ['training','incubation','reserve'])if(f.upgrades[key]<2&&f.points>=RULES.upgradeCosts[f.upgrades[key]]+(key==='training'?0:m.recruitCost(faction)))m.upgrade(faction,key);
  if(!m.armyAt(f.capital)&&!m.actorAt(f.capital)&&f.points>=m.recruitCost(faction)&&d.armies.filter(a=>a.faction===faction).length<6)m.recruit(faction);
  for(const a of [...d.armies].filter(a=>a.faction===faction&&a.ready)){
   if(d.winner)break;if(a.penalty||goal==='picnic'&&a.territory===d.picnic&&d.picnicOwner===faction)continue;
   const vision=m.visible(faction),intel=d.intel[faction];
   const power=n=>intel[n.id]?.actor?.force??(intel[n.id]?.army?intel[n.id].army.preparation*100:intel[n.id]?.defended?m.localParticipant(n).force:0);
   const prep=preparation(a)*100;
   const vulnerable=d.nodes.filter(n=>vision.has(n.id)&&m.isDefended(n)&&n.owner!==faction&&power(n)<prep*.85);
   const objectives=goal==='domination'?Object.values(d.factions).filter(x=>x.alive&&x.id!==faction).map(x=>m.node(x.capital)):[m.node(d.picnic)];
   let goals=prep>=85?objectives:vulnerable;
   if(!goals.length)goals=d.nodes.filter(n=>n.owner!==faction&&vision.has(n.id)&&!m.isDefended(n));
   const dist=new Map(goals.map(n=>[n.id,0])),q=[...dist.keys()];for(let i=0;i<q.length;i++)for(const id of m.node(q[i]).neighbors)if(!dist.has(id)){dist.set(id,dist.get(q[i])+1);q.push(id);}
   const candidates=m.node(a.territory).neighbors.filter(id=>!m.validateMove(faction,a.id,id)).map(id=>{const n=m.node(id);return{id,score:-(dist.get(id)??100)*4+(n.owner!==faction?1:0)-(id===a.previousTerritory?3:0)-(vision.has(id)&&power(n)>prep*1.05?70:0)};}).sort((a,b)=>b.score-a.score||a.id-b.id);
   if(candidates[0]&&candidates[0].score>-100){m.move(faction,a.id,candidates[0].id);moves++;settle();}
  }
  if(d.winner)break;m.endPlayerTurn();let safety=0;while(d.phase==='rivals'&&!d.winner){if(++safety>1000)throw Error('queue loop');settle();if(!d.winner)m.aiStep();}settle();roundTimes.push(performance.now()-started);maxArmies=Math.max(maxArmies,d.armies.length);
 }
 roundTimes.sort((a,b)=>a-b);const report={faction,goal,winner:d.winner,victory:d.victory,round:d.turn,battles,thirdParties,moves,distinctBattleTerritories:fought.size,maxArmies,remainingMajors:Object.values(d.factions).filter(f=>f.alive).map(f=>f.id),playerVeterans:d.armies.filter(a=>a.faction===faction).map(a=>({victories:a.battleVictories,training:a.trainingLevel})),roundMs:{median:roundTimes[Math.floor(roundTimes.length/2)],p95:roundTimes[Math.floor(roundTimes.length*.95)],max:roundTimes.at(-1)}};reports.push(report);console.log(JSON.stringify(report));
}
fs.writeFileSync(process.env.REPORT_PATH||'docs/evidence/campaign/evaluation-v5.json',JSON.stringify({seed,method:'Deterministic heuristic player using legal orders and visible military information. All rivals, threats and events active; no force boosts or scripted winners. Not a human balance assessment.',reports},null,2));
