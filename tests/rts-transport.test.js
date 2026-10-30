import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, finish, stepWorld } from './helpers/rts-world.js';
import { TacticalObservation, planTactical } from '../src/simulation/rts_tactical.js';
import { orbitalPosition, ferryWindows, setLogisticsLink, removeLogisticsLink, ferryObjective } from '../src/simulation/rts_transport.js';
import { regionsFor } from '../src/simulation/rts_regions.js';
import { WorldSnapshot } from '../src/simulation/rts_snapshot.js';
import { forecastOperation } from '../src/simulation/rts_forecast.js';
import { issueTroopOrder } from '../src/simulation/rts_world_rules.js';
import { FactionAIState, RTSAIRuntime } from '../src/simulation/rts_ai_runtime.js';
import { resolveAIProfile } from '../src/simulation/ai_config.js';
import { sector2 } from '../src/data/levels/sector2.js';
import { levelFixture } from './helpers/level-fixture.js';

test('regional geometry distinguishes true bridges from a node next to an open corridor',()=>{
 const w=levelFixture(sector2,sector2.levels[2]);const graph=regionsFor(new TacticalObservation(w));
 assert.equal(graph.articulation.has(w.nodes.findIndex(n=>n.id==='choke')),false);
 const split=levelFixture(sector2,sector2.levels[0]);assert.equal(regionsFor(new TacticalObservation(split)).count,2);
});
test('logistics uses one shared payment, supports removal and respects reserves',()=>{
 const w=makeWorld({nodes:[{x:100,y:100,owner:'enemy',count:30},{x:300,y:100,owner:'enemy',count:0}]});
 assert.equal(setLogisticsLink(w,w.nodes[0],w.nodes[1],'enemy',20),false);
 assert.equal(setLogisticsLink(w,w.nodes[0],w.nodes[1],'enemy',10),true);
 assert.equal(w.allUnits.filter(u=>u.pendingRemoval).length,15);
 assert.equal(setLogisticsLink(w,w.nodes[0],w.nodes[1],'enemy',0),false);
 assert.equal(removeLogisticsLink(w.nodes[0],'enemy'),true);
});
test('automatic logistics follows a necessary detour without spending a committed defense',()=>{
 const w=levelFixture(sector2,sector2.levels[1]);for(const n of w.nodes)if(n.owner==='neutral')n.owner='enemy';
 for(const u of w.allUnits)if(u.faction==='neutral')u.pendingRemoval=true;
 const state=new FactionAIState('enemy','hard');state.profile=resolveAIProfile(w.aiStrategy,null,'enemy','hard');
 const ai=new RTSAIRuntime({worldRef:w,difficulty:'hard'});
 assert.equal(ai._manageLogistics(new TacticalObservation(w),state,new Set()),true);
 assert.ok(w.nodes.some(n=>n.owner==='enemy'&&n.tunnelTo));
});
test('ferry can open a useful route through a wall and shortlist both boarding and landing',()=>{
 const w=makeWorld({nodes:[{x:100,y:250,owner:'enemy',count:90},{x:240,y:250,owner:'neutral',count:0,isMobile:true,orbitAnchorX:.5,orbitAnchorY:.5,orbitRadiusX:.2,orbitRadiusY:0,orbitSpeed:.4,orbitAngle:Math.PI},{x:700,y:250,owner:'player',count:5}],barriers:[{x:.49,y:0,width:.02,height:1}]});
 const v=new TacticalObservation(w);assert.equal(ferryObjective(v,0,1,'enemy',resolveAIProfile(null,null,'enemy','hard')).goal,2);
 assert.ok(ferryWindows(v,0,1).length>0);const windows=ferryWindows(v,1,2);assert.ok(windows.length>0);
 for(const win of windows)assert.ok(orbitalPosition(w.nodes[1],w.game,win.delay).x>408);
});
test('portal oracle evaluates the exit rather than ownership of an already owned entry',()=>{
 const w=makeWorld({nodes:[{x:100,y:100,owner:'enemy',count:80},{x:200,y:100,owner:'enemy',type:'tunel',count:0},{x:600,y:100,owner:'neutral',count:0,type:'tunel'}],barriers:[{x:.45,y:0,width:.03,height:1}]});w.nodes[1].tunnelTo=w.nodes[2];
 const s=new WorldSnapshot(w),op=finish(forecastOperation(s,'enemy',2,[{source:0,target:1,units:s.idle[0].get('enemy').slice(0,70),delay:0}],{holdSeconds:0,horizon:40}));
 assert.equal(op.owner,'enemy');assert.ok(op.arrived>0);
});
test('reverse regrouping needs a changed situation rather than a new score',()=>{
 const w=levelFixture(sector2,sector2.levels[1]);for(const n of w.nodes)if(n.owner==='neutral')n.owner='enemy';
 const state=new FactionAIState('enemy','hard');state.relocations=new WeakMap();const sig=w.nodes.map(n=>n.owner).join('|');
 const source=w.nodes.findIndex(n=>n.id==='enemy_front_top'),next=w.nodes.findIndex(n=>n.id==='neutral_aux_top');
 for(const u of w.allUnits){
  if(u.faction==='neutral'||u.faction==='enemy'&&u.targetNode!==w.nodes[source])u.pendingRemoval=true;
  if(u.faction==='enemy')state.relocations.set(u,{source:next,target:source,signature:sig});
 }
 const profile=resolveAIProfile(w.aiStrategy,null,'enemy','hard');
 assert.equal(planTactical(new TacticalObservation(w),state,profile,new Set(),'player').decision,null);
 w.nodes.find(n=>n.id==='neutral_mid').owner='player';
 const revised=planTactical(new TacticalObservation(w),state,profile,new Set(),'player');
 assert.equal(revised.decision?.purpose,'regroup');
 assert.ok(revised.decision.orders.some(o=>o.source===source));
});
for(const fixture of ['ferry','shared_poison'])test(`twenty physical-reference seeds: ${fixture}`,()=>{
 for(let seed=1;seed<=20;seed++){
  const mobile=fixture==='ferry';
  const w=makeWorld({seed,nodes:[{x:100,y:250,owner:'enemy',count:85},{x:400,y:250,owner:'neutral',count:0,...(mobile?{isMobile:true,orbitAnchorX:.5,orbitAnchorY:.5,orbitRadiusX:.1,orbitRadiusY:.08,orbitSpeed:.15,orbitAngle:seed*.05}:{})},...(!mobile?[{x:100,y:350,owner:'player',count:30}]:[])],hazards:mobile?[]:[{shape:'rect_puddle',x:.2,y:0,width:.2,height:1,dps:3},{shape:'rect_puddle',x:.3,y:0,width:.2,height:1,dps:2}]});
  if(!mobile)issueTroopOrder(w,w.nodes[2],w.nodes[1],25,'player');
  const snapshot=new WorldSnapshot(w),units=snapshot.idle[0].get('enemy').slice(0,80);
  const predicted=finish(forecastOperation(snapshot,'enemy',1,[{source:0,target:1,units,delay:0}],{holdSeconds:0,horizon:30}),500000);
  const selected=w.allUnits.filter(u=>u.faction==='enemy').slice(0,80);issueTroopOrder(w,w.nodes[0],w.nodes[1],80,'enemy',selected);
  const arrived=new Set();
  for(let t=0;t<30;t+=1/30){stepWorld(w);for(const u of selected)if(!u.pendingRemoval&&u.state==='idle')arrived.add(u);if(w.nodes[1].owner==='enemy'&&selected.every(u=>u.pendingRemoval||arrived.has(u)))break;}
  assert.equal(predicted.arrived,arrived.size,`seed ${seed}`);
 }
});


test('x1 and x4 scheduled opportunities retain competent responses without changing acceleration',()=>{
 for(const scale of [1,4])for(const difficulty of ['easy','normal','hard']){
  const w=makeWorld({nodes:[{x:100,y:100,owner:'enemy',count:90},{x:400,y:100,owner:'player',count:240}]});w.allowEvolutions=false;
  const ai=new RTSAIRuntime({worldRef:w,difficulty,budgetMs:1000,planningBudgetMs:0});ai.updateAll(0,['enemy']);
  w.allUnits.filter(u=>u.faction==='player').slice(2).forEach(u=>u.pendingRemoval=true);
  let emitted=null;
  for(let i=1;i<=30;i++){w.simTime=i*scale/60;ai.updateAll(scale/60,['enemy']);if(ai.metrics.orders){emitted=w.simTime;break;}}
  assert.ok(emitted!==null&&emitted<=.5,`${difficulty} x${scale}`);
 }
});


test('portal activation shares the player rule and cannot ping-pong without an objective',async()=>{
 const {activatePortal}=await import('../src/simulation/rts_transport.js');
 const w=makeWorld({nodes:[{x:100,y:100,owner:'enemy',type:'tunel',count:40},{x:600,y:100,owner:'enemy',type:'tunel',count:0}],barriers:[{x:.4,y:0,width:.05,height:1}]});w.nodes[0].tunnelTo=w.nodes[1];w.nodes[1].tunnelTo=w.nodes[0];
 const state=new FactionAIState('enemy','hard'),profile=resolveAIProfile(null,null,'enemy','hard');
 assert.equal(planTactical(new TacticalObservation(w),state,profile,new Set(),'player').decision,null);
 assert.equal(activatePortal(w,w.nodes[0],'enemy'),40);
 assert.ok(w.allUnits.every(u=>u.targetNode===w.nodes[1]));
 assert.equal(planTactical(new TacticalObservation(w),state,profile,new Set(),'player').decision,null);
});
test('portal activation forecast reaches an enemy exit from stationed troops',()=>{
 const w=makeWorld({nodes:[{x:100,y:100,owner:'enemy',type:'tunel',count:80},{x:600,y:100,owner:'neutral',type:'tunel',count:0}],barriers:[{x:.4,y:0,width:.05,height:1}]});w.nodes[0].tunnelTo=w.nodes[1];
 const s=new WorldSnapshot(w);const r=finish(forecastOperation(s,'enemy',1,[{source:0,target:1,kind:'portal',units:s.idle[0].get('enemy').slice(0,70),delay:0}],{holdSeconds:0,horizon:30}));
 assert.equal(r.owner,'enemy');assert.equal(r.arrived,70);
});
test('twenty physical-reference seeds: ferry landing across a wall',()=>{
 for(let seed=1;seed<=20;seed++){
  const w=makeWorld({seed,nodes:[{x:240,y:250,owner:'enemy',count:85,isMobile:true,orbitAnchorX:.5,orbitAnchorY:.5,orbitRadiusX:.2,orbitRadiusY:0,orbitSpeed:.4,orbitAngle:Math.PI},{x:700,y:250,owner:'neutral',count:0}],barriers:[{x:.49,y:0,width:.02,height:1}]});
  const window=ferryWindows(new TacticalObservation(w),0,1)[0];assert.ok(window);
  const s=new WorldSnapshot(w),ids=s.idle[0].get('enemy').slice(0,80),delay=window.delay;
  const forecast=finish(forecastOperation(s,'enemy',1,[{source:0,target:1,units:ids,delay}],{holdSeconds:0,horizon:30}),500000);
  const selected=w.allUnits.filter(u=>u.faction==='enemy').slice(0,80),arrived=new Set();let launched=false;
  for(let t=0;t<30;t+=1/30){if(!launched&&t+1e-6>=delay){issueTroopOrder(w,w.nodes[0],w.nodes[1],80,'enemy',selected);launched=true;}stepWorld(w);if(launched)for(const u of selected)if(!u.pendingRemoval&&u.state==='idle'&&u.targetNode===w.nodes[1])arrived.add(u);if(w.nodes[1].owner==='enemy'&&selected.every(u=>u.pendingRemoval||arrived.has(u)))break;}
  assert.equal(forecast.owner,'enemy');assert.ok(forecast.arrived>0);assert.equal(forecast.arrived,arrived.size,`seed ${seed}`);
 }
});


test('runtime physically validates and executes the portal action across a wall',()=>{
 const w=makeWorld({nodes:[{x:100,y:100,owner:'enemy',type:'tunel',count:80},{x:600,y:100,owner:'neutral',type:'tunel',count:0}],barriers:[{x:.4,y:0,width:.05,height:1}]});w.nodes[0].tunnelTo=w.nodes[1];
 const ai=new RTSAIRuntime({worldRef:w,difficulty:'hard'}),state=new FactionAIState('enemy','hard');state.profile=resolveAIProfile(null,null,'enemy','hard');
 const snapshot=new WorldSnapshot(w),op={kind:'portal',target:1,reservations:new Set(),candidates:[{source:0,target:1,kind:'portal',transportKind:'portal',score:300}]};
 const prepared=finish(ai._plan(snapshot,state,op,'player'),500000);assert.ok(prepared.forecast);assert.equal(prepared.orders[0].kind,'portal');
 ai._acceptForecast({state,operation:prepared,snapshot});assert.equal(state.tacticalOrders[0].state,'waiting');
 w.simTime=.35;ai._trackTactics(new TacticalObservation(w),state);
 assert.ok(w.allUnits.filter(u=>u.targetNode===w.nodes[1]).length>0);
 assert.ok(ai.metrics.orders>0);
});


test('expected gate phases refresh observation without killing an independent forecast',()=>{
 const w=makeWorld({nodes:[{x:100,y:100,owner:'enemy',count:0},{x:300,y:100,owner:'neutral',count:90}]});
 const ai=new RTSAIRuntime({worldRef:w,difficulty:'hard',budgetMs:1000,planningBudgetMs:0}),state=new FactionAIState('enemy','hard');ai.states.set('enemy',state);
 const job=state.job={started:0,snapshot:{revision:0,nodes:[]},operation:{candidates:[],cancel(){}},iterator:(function*(){while(true)yield 'waiting_worker';})()};
 ai.updateAll(0,['enemy']);w.aiEnvironmentRevision=1;w.simTime=.2;ai.updateAll(.2,['enemy']);
 assert.equal(state.job,job);
});


test('the insecticide ocean can expose a useful action or a physical query without a faction lock',async()=>{
 const {SECTORS}=await import('../src/data/levels/index.js');const w=levelFixture(SECTORS[2],SECTORS[2].levels[4]);
 const state=new FactionAIState('enemy','hard'),profile=resolveAIProfile(w.aiStrategy,null,'enemy','hard');
 const result=planTactical(new TacticalObservation(w),state,profile,new Set(),'player');
 assert.ok(result.decision||result.uncertain.length>0);
});


test('a doomed portal crew escapes immediately through a safe owned exit',()=>{
 const w=makeWorld({nodes:[{x:100,y:100,owner:'enemy',type:'tunel',forces:{enemy:20,player:100}},{x:600,y:100,owner:'enemy',type:'tunel',count:10},{x:100,y:300,owner:'player',count:0}],barriers:[{x:.4,y:0,width:.05,height:1}]});w.nodes[0].tunnelTo=w.nodes[1];
 const crew=w.allUnits.filter(u=>u.faction==='enemy'&&u.targetNode===w.nodes[0]);
 const ai=new RTSAIRuntime({worldRef:w,difficulty:'hard',budgetMs:1000,planningBudgetMs:0});ai.updateAll(0,['enemy']);
 assert.ok(crew.every(u=>u.targetNode===w.nodes[1]));
 assert.ok(ai.states.get('enemy').tacticalHistory.some(e=>e.purpose==='evacuation'));
});


test('a new reinforcement cancels a delayed physical order instead of using its obsolete victory',async()=>{
 const {OperationPlan}=await import('../src/simulation/rts_ai_runtime.js');const {updateNodeCounts}=await import('../src/simulation/rts_world_rules.js');
 const w=makeWorld({nodes:[{x:100,y:100,owner:'enemy',count:90},{x:400,y:100,owner:'player',count:3}]});
 const s=new WorldSnapshot(w),state=new FactionAIState('enemy','hard'),ai=new RTSAIRuntime({worldRef:w,difficulty:'hard'});
 const op=new OperationPlan(1,'enemy',1,'conquest',0);op.orders=[{source:0,target:1,units:s.idle[0].get('enemy').slice(0,70),delay:2}];op.forecast={owner:'enemy',arrived:70};
 ai._acceptForecast({state,operation:op,snapshot:s});assert.equal(state.tacticalOrders[0].state,'waiting');
 w.spawnUnitsAt(w.nodes[1],'player',100);updateNodeCounts(w);w.simTime=2;ai._trackTactics(new TacticalObservation(w),state);
 assert.equal(state.tacticalOrders[0].reason,'new_military_evidence');assert.equal(ai.metrics.orders,0);
});


test('an outgrown ferry objective releases its mission when a viable alternative exists',()=>{
 const w=makeWorld({nodes:[{x:400,y:250,owner:'enemy',count:40,isMobile:true,orbitAnchorX:.5,orbitAnchorY:.5,orbitRadiusX:.1,orbitRadiusY:.1,orbitSpeed:.2},{x:700,y:100,owner:'player',type:'gigante',count:500},{x:500,y:250,owner:'neutral',count:0}]});
 const crew=w.allUnits.filter(u=>u.faction==='enemy');for(const u of crew)u._aiTransportGoal=1;
 const state=new FactionAIState('enemy','hard'),profile=resolveAIProfile(null,null,'enemy','hard');
 const result=planTactical(new TacticalObservation(w),state,profile,new Set(),'player');
 assert.ok(crew.every(u=>u._aiTransportGoal===undefined));
 assert.ok(state.tacticalHistory.some(e=>e.purpose==='transport_replan'));
 assert.ok(result.uncertain.some(c=>c.target===2));
});
