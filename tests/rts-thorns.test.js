import test from 'node:test';
import assert from 'node:assert/strict';
import {makeWorld} from './helpers/rts-world.js';
import {PhysicsManager} from '../src/managers/physics_manager.js';
import {CombatManager} from '../src/managers/combat_manager.js';
import {updateNodeCounts} from '../src/simulation/rts_world_rules.js';
function exposed(count,power,dt,seconds){
 const w=makeWorld({nodes:[{x:200,y:200,owner:'enemy',count:0}]});const n=w.nodes[0];n.completeEvolution('espinoso');w.spawnUnitsAt(n,'player',count);
 for(const u of w.allUnits){u.x=250;u.y=200;u.state='traveling';u.power=power;}
 for(let t=0;t<seconds-1e-8;t+=dt){PhysicsManager.updateGrid(w);n.update(dt,w.grid,w.allUnits,{},null,null);}
 return w.allUnits.filter(u=>u.pendingRemoval).length;
}
test('300 exposed ants lose at most eight to two seconds of thorns',()=>{assert.equal(exposed(300,1,.05,2),8);});
test('thorn damage is shared, density independent and consistent at x4',()=>{
 assert.equal(exposed(30,1,1/60,3),exposed(300,1,4/60,3));
 assert.ok(exposed(300,1,4/60,3)<=12);
});
test('heavy warriors resist three thorn impacts per body',()=>{assert.equal(exposed(1,3,.25,.5),0);assert.equal(exposed(1,3,.25,.75),1);});
test('tank nests have no damage aura and do not fight at the old distant boundary',()=>{
 const w=makeWorld({nodes:[{x:200,y:200,owner:'enemy',type:'gigante',forces:{enemy:80,player:20}}]});const n=w.nodes[0];n.completeEvolution('tanque');
 const incoming=w.allUnits.filter(u=>u.faction==='player');for(const u of incoming){u.state='traveling';u.x=n.x+n.radius*2;u.y=n.y;}
 updateNodeCounts(w);assert.equal(n.counts.player,0);CombatManager.processCombat(w,0,1,null);
 PhysicsManager.updateGrid(w);n.update(1,w.grid,w.allUnits,{},null,null);assert.ok(incoming.every(u=>!u.pendingRemoval));
 for(const u of incoming)u.x=n.x+n.radius*1.4;updateNodeCounts(w);assert.equal(n.counts.player,20);
});
