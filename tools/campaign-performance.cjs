const {chromium}=require('playwright-core');
const fs=require('fs');
(async()=>{const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--no-sandbox']});
try{const p=await b.newPage({viewport:{width:1280,height:720}});
const errors=[];p.on('pageerror',e=>errors.push(String(e)));
await p.goto('http://127.0.0.1:5173');
await p.waitForFunction(()=>window.campaign?.visuals,null,{timeout:90000});
await p.click('#btnCampaign');
await p.locator('.faction-card').first().click();await p.click('#btnConfirmFaction');await p.waitForSelector('#campaignScreen.active');
const cdp=await p.context().newCDPSession(p);
await cdp.send('Performance.enable');
const metric=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
const a=await metric();
await p.waitForTimeout(2000);
const z=await metric();
const result=await p.evaluate(async()=>{const m=campaign.state.model,v=campaign.visuals;
const times={};
const bench=(key,n,fn)=>{const a=[];for(let i=0;i<n;i++){const t=performance.now();fn(i);a.push(performance.now()-t);}a.sort((a,b)=>a-b);times[key]={median:a[Math.floor(n/2)],p95:a[Math.min(n-1,Math.floor(n*.95))],max:a.at(-1)};};bench('fullRenderMs',12,()=>v.render());bench('changedSceneRenderMs',6,()=>{v.sceneKey=null;v.render();});bench('selectionMs',12,i=>v.select(i%2?m.faction(m.data.playerFaction).capital:m.node(m.faction(m.data.playerFaction).capital).neighbors[0]));bench('cameraMs',50,i=>v.zoom(i%2?1/1.01:1.01));bench('saveMs',12,()=>campaign.state.save());
const {CampaignModel}=await import('/src/campaign/campaign_model.js');bench('create300Ms',3,()=>CampaignModel.create('carpinteras',2026));
const isolation=m.data.nodes.filter(n=>n.owner!=='neutral').map(n=>{const seen=new Set([n.id]),q=[n.id];for(let i=0;i<q.length;i++)for(const id of m.node(q[i]).neighbors)if(!seen.has(id)&&m.node(id).type!=='capital'){seen.add(id);q.push(id);}return{faction:n.owner,territory:n.id,accessibleWithoutOtherCapitals:seen.size};});return{times,isolation,dom:document.querySelectorAll('#gardenAtlas *').length,tickerStarted:campaign.game.app.ticker.started,renderer:campaign.game.app.renderer.name};});
result.idle={seconds:2,taskMs:(z.TaskDuration-a.TaskDuration)*1000,scriptMs:(z.ScriptDuration-a.ScriptDuration)*1000};
result.strategy=await p.evaluate(async()=>{
 const {CampaignModel}=await import('/src/campaign/campaign_model.js');const {simulateCombat}=await import('/src/campaign/strategic_combat.js');
 const m=CampaignModel.create('carpinteras',20261019),d=m.data;let combats=0,thirdParties=0;const times=[];
 for(const f of Object.values(d.factions))for(const n of d.nodes.filter(n=>n.owner===f.id&&!m.armyAt(n.id)).slice(0,4))m.addArmy(f.id,n.id,true);
 const armyCount=d.armies.length;
 for(let r=0;r<6&&!d.winner;r++){
  const start=performance.now();m.endPlayerTurn();let guard=0;
  while(d.phase==='rivals'&&!d.winner){if(++guard>1500)throw Error('Dense round loop');
   if(d.pending){if(d.pending.status==='preparation')m.startResolution();while(d.pending)m.advanceEncounter();combats++;thirdParties+=d.lastResult.participants.length===3?1:0;}
   if(d.resultNotice)m.acknowledge();if(d.reward)d.reward=null;m.aiStep();
  }times.push(performance.now()-start);
 }
 times.sort((a,b)=>a-b);return{initialDenseArmies:armyCount,rounds:times.length,combats,thirdParties,roundMs:{median:times[Math.floor(times.length/2)],p95:times.at(-1)},tickerStarted:campaign.game.app.ticker.started};
});
result.errors=errors;
result.environment='Headless Edge, software WebGL SwiftShader, 1280x720; comparative timings, not hardware FPS. Dense scenario adds legal-position armies for load measurement only; six full AI/threat/event rounds measured without DOM or save cost. RTS remains stopped.';
fs.writeFileSync(process.argv[2]||'docs/evidence/campaign/performance-v5.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result));}finally{await b.close();}})();
