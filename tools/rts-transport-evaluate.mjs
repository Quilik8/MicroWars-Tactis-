import {makeWorld,stepWorld,finish} from '../tests/helpers/rts-world.js';
import {WorldSnapshot} from '../src/simulation/rts_snapshot.js';
import {forecastOperation} from '../src/simulation/rts_forecast.js';
import {issueTroopOrder} from '../src/simulation/rts_world_rules.js';
import {ferryWindows} from '../src/simulation/rts_transport.js';
import {TacticalObservation} from '../src/simulation/rts_tactical.js';
import {writeFileSync} from 'node:fs';
const rows=[];
for(const scenario of ['boarding','landing','poison'])for(let seed=1;seed<=20;seed++){
 const setup=()=>makeWorld({seed,nodes:scenario==='landing'?[{x:240,y:250,owner:'enemy',count:85,isMobile:true,orbitAnchorX:.5,orbitAnchorY:.5,orbitRadiusX:.2,orbitRadiusY:0,orbitSpeed:.4,orbitAngle:Math.PI},{x:700,y:250,owner:'neutral',count:0}]:[{x:100,y:250,owner:'enemy',count:85},{x:400,y:250,owner:'neutral',count:0,...(scenario==='boarding'?{isMobile:true,orbitAnchorX:.5,orbitAnchorY:.5,orbitRadiusX:.1,orbitRadiusY:.08,orbitSpeed:.15,orbitAngle:seed*.05}:{})}],barriers:scenario==='landing'?[{x:.49,y:0,width:.02,height:1}]:[],hazards:scenario==='poison'?[{shape:'rect_puddle',x:.2,y:0,width:.2,height:1,dps:3},{shape:'rect_puddle',x:.3,y:0,width:.2,height:1,dps:2}]:[]});
 const initial=setup(),s=new WorldSnapshot(initial),delay=scenario==='landing'?ferryWindows(new TacticalObservation(initial),0,1)[0].delay:0;
 for(const speed of [1,4]){
  const observed=setup();observed.lastSimulationStep=speed/60;const physicalSnapshot=new WorldSnapshot(observed);
  const started=performance.now(),prediction=finish(forecastOperation(physicalSnapshot,'enemy',1,[{source:0,target:1,units:s.idle[0].get('enemy').slice(0,80),delay}],{holdSeconds:0,horizon:30}),500000);const forecastMs=performance.now()-started;
  const w=setup(),selected=w.allUnits.filter(u=>u.faction==='enemy').slice(0,80),arrived=new Set();let launched=false;const dt=speed/60,begin=performance.now();
  for(let t=0;t<30;t+=dt){if(!launched&&t+1e-6>=delay){issueTroopOrder(w,w.nodes[0],w.nodes[1],80,'enemy',selected);launched=true;}stepWorld(w,dt);if(launched)for(const u of selected)if(!u.pendingRemoval&&u.state==='idle'&&u.targetNode===w.nodes[1])arrived.add(u);if(w.nodes[1].owner==='enemy'&&selected.every(u=>u.pendingRemoval||arrived.has(u)))break;}
  const error=Math.abs(prediction.arrived-arrived.size);rows.push({scenario,seed,speed,expected:prediction.arrived,actual:arrived.size,error,withinTolerance:error<=Math.max(2,prediction.arrived*.05),forecastMs,referenceCpuMs:performance.now()-begin});
 }
}
const summary=Object.fromEntries(['boarding','landing','poison'].map(s=>[s,Object.fromEntries([1,4].map(speed=>{const values=rows.filter(r=>r.scenario===s&&r.speed===speed);return [speed,{cases:values.length,withinTolerance:values.filter(r=>r.withinTolerance).length,maxError:Math.max(...values.map(r=>r.error))}];}))]));
writeFileSync('docs/evidence/rts-ai/transport-speed-audit.json',JSON.stringify({scope:'Scripted manager integration only; no browser or autonomous matches. Frame steps x1/x4, acceleration unchanged.',generated:new Date().toISOString(),summary,rows},null,2));console.log(JSON.stringify(summary,null,2));
if(Object.values(summary).some(s=>Object.values(s).some(v=>v.withinTolerance<19)))process.exitCode=1;
