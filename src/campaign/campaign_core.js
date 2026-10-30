import { StateManager } from './state_manager.js';
import { CampaignModel } from './campaign_model.js';
import { MapVisuals } from './map_visuals.js';
import { ct } from './campaign_i18n.js';

export class CampaignCore {
 constructor(game,ui){this.game=game;this.ui=ui;this.state=new StateManager();this.visuals=null;this.timer=null;this.isStarted=false;this.activeEncounter=null;}
 init(){
  this.state.load();this.visuals=new MapVisuals(this.game,this.ui,this);
  if(this.state.issue){const note=document.createElement('p');note.id='campaignLoadIssue';note.textContent=ct(this.state.issue);note.style.cssText='max-width:640px;padding:16px;color:#decca7;text-align:center';document.querySelector('#factionSelection .campaign-footer').before(note);}
 }
 connect(level,world){this.level=level;this.world=world;}
 setPlayerFaction(faction){
  this.state.model=CampaignModel.create(faction.id);this.state.issue=null;document.getElementById('campaignLoadIssue')?.remove();
  this.visuals.cameraInitialized=false;this.visuals.panelOpen=false;this.visuals.sceneData=null;
  this.visuals.selected=this.state.data.factions[faction.id].capital;this.visuals.armyId=null;
  this.state.save();
 }
 start(){if(!this.state.model){this.ui.setGameState('FACTIONS');return;}this.isStarted=true;this.game.app?.ticker.stop();this.visuals.render();this.schedule();}
 stop(){this.isStarted=false;clearTimeout(this.timer);this.visuals?.clear();}
 perform(action,data={}){
  const m=this.state.model,actor=m?.data.playerFaction;if(!m)return;
  if(this.state.issue&&action!=='retry'){this.visuals.notice(ct(this.state.issue));return;}
  try{
   if(action!=='retry')this.visuals.notice('');
   if(action==='retry'){if(this.state.save()){this.visuals.notice('');this.visuals.render();this.schedule();}return;}
   if(action==='planMove')m.planMove(actor,data.army||this.visuals.armyId,Number(data.target));
   if(action==='clearPlans')m.clearPlans();
   if(action==='recruit')m.recruit(actor);
   if(action==='upgrade')m.upgrade(actor,data.key);
   if(action==='end'||action==='endConfirm')m.commitOrders();
   if(action==='mutation')m.chooseMutation(data.key,data.replace===undefined?null:Number(data.replace));
   if(action==='discard')m.data.reward=null;
   if(action==='consume')m.consume(data.id);
   if(action==='rename')m.rename(actor,data.army,data.value);
   if(action==='renameCommander')m.rename(actor,data.army,data.value,true);
   if(action==='suggestName')m.suggestName(actor,data.army);
   if(action==='retreatPolicy')m.setRetreat(actor,data.army,data.allowed,data.target);
   if(action==='auto'||action==='fight')m.startResolution();
   if(action==='ack')m.acknowledge();
   this.state.save();this.visuals.render();this.schedule();
  }catch(error){this.visuals.notice(ct(error.message));}
 }
 schedule(){
  clearTimeout(this.timer);const d=this.state.data;
  if(this.visuals.observer.paused||!this.isStarted||this.ui.gameState!=='CAMPAIGN'||this.state.issue||d.resultNotice||d.reward||d.winner)return;
  const ready=d.pending?.status==='preparation';if(ready&&d.pending.attacker===d.playerFaction&&!d.ordersCommitted)return;
  if(!d.pending&&d.phase!=='rivals'&&!d.ordersCommitted)return;
  this.timer=setTimeout(()=>{
   try{
    const m=this.state.model;
    if(m.data.pending){
     if(m.data.pending.status==='preparation')m.startResolution();
     const ownBattle=m.data.pending.participants.some(p=>p.faction===m.data.playerFaction);
     const steps=!ownBattle||this.visuals.fast||matchMedia('(prefers-reduced-motion: reduce)').matches?24:2;
     for(let i=0;i<steps&&m.data.pending;i++)m.advanceEncounter();
    }else if(m.data.ordersCommitted)m.executeNextOrder();else m.aiStep();
    this.state.save();this.visuals.render();this.schedule();
   }catch(error){console.error('Campaign resolution failed',error);this.state.issue='simulationError';this.visuals.notice(ct('simulationError'));}
  },Math.max(this.visuals.observer.delay,this.visuals.fast?30:(d.pending?160:45)));
 }
 // Existing skirmish loop retains its hook; strategic encounters never start Pixi RTS.
 updateBattle(){return false;}
}
