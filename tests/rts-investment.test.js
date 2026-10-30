import test from 'node:test';
import assert from 'node:assert/strict';
import {makeWorld} from './helpers/rts-world.js';
import {TacticalObservation} from '../src/simulation/rts_tactical.js';
import {evolutionCandidates} from '../src/simulation/rts_investment.js';
import {RTSAIRuntime,FactionAIState} from '../src/simulation/rts_ai_runtime.js';
import {resolveAIProfile} from '../src/simulation/ai_config.js';
test('spines value a traffic corridor even without enemies stationed in range',()=>{
 const w=makeWorld({nodes:[{x:400,y:200,owner:'enemy',count:150},{x:700,y:200,owner:'enemy',count:10},{x:50,y:200,owner:'player',count:50}]});
 assert.equal(evolutionCandidates(new TacticalObservation(w),'enemy',0,{} )[0].type,'espinoso');
});
test('artillery requires a target within its actual range',()=>{
 const w=makeWorld(); const candidates=evolutionCandidates(new TacticalObservation(w),'enemy',0,{});
 assert.ok(!candidates.some(c=>c.type==='artilleria'));
});
test('unaffordable evolution leaves the configured post-payment garrison untouched',()=>{
 const w=makeWorld();const ai=new RTSAIRuntime({worldRef:w});const s=new FactionAIState('enemy','normal');
 s.profile={...resolveAIProfile(null,null,'enemy','normal'),minEvolutionGarrison:90};
 assert.equal(ai._tacticalInvestment(new TacticalObservation(w),s,new Set()),false);
 assert.equal(w.allUnits.filter(u=>u.pendingRemoval).length,0);
});
