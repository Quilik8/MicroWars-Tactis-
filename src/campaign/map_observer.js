import { FACTION_PATHS } from './faction_emblems.js';
import { ct } from './campaign_i18n.js';

const important = new Set(['moved','threatMoved','attackStarted','battleResult','eliminated','devastated','expedition','weatherWarning']);
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/** Presentation observes saved events; it never advances strategy or reveals hidden units. */
export class MapObserver {
 constructor(view, faction, color) {
  this.view=view;this.faction=faction;this.color=color;this.follow=true;this.paused=false;
  this.expanded=innerWidth>=700;this.holdUntil=0;
  view.root.insertAdjacentHTML('beforeend', '<section class="garden-world" aria-label="'+ct('worldNews')+'"><div id="gardenTurnWatch" aria-live="polite"></div><div class="garden-news"><button data-action="newsToggle" id="gardenNewsToggle"></button><div id="gardenNewsItems" aria-live="polite"></div></div></section><div id="gardenIntent" role="status" aria-live="polite"></div>');
 }
 get delay(){return Math.max(0,this.holdUntil-performance.now());}
 observed(e,me){return e.visibleTo.includes(me)&&important.has(e.key);}
 endpoints(e,me){
  const movement=['moved','threatMoved','attackStarted'].includes(e.key),own=e.values.faction===me;
  // Legacy events recorded destination visibility only; do not infer their hidden origin.
  return {from:movement&&(own||e.values.seenFrom?.includes(me))?e.values.from:null,
   to:!movement||own||e.values.seenTo?.includes(me)||!e.values.seenTo?e.territory:null};
 }
 text(e,me){
  const f=this.faction(e.values.faction),ends=this.endpoints(e,me);
  if(['moved','threatMoved','attackStarted'].includes(e.key))return `${f} · ${ct(ends.to===null?'newsLost':ends.from===null?'newsAppeared':e.key==='attackStarted'?'newsAttack':e.values.conquered?'newsConquest':e.key==='threatMoved'?'newsThreat':'newsMovement')}${ends.to!==null&&this.data.nodes[ends.to]?' · '+ct(this.data.nodes[ends.to].region):''}`;
  if(e.key==='battleResult')return `${ct('newsBattle')} · ${e.values.faction==='neutral'?ct('draw'):f}`;
  if(e.key==='eliminated'||e.key==='devastated')return `${f} · ${ct(e.key)}`;
  if(e.key==='weatherWarning')return `${ct('weatherWarning')} · ${ct(e.values.region)}`;
  return `${f} · ${ct(e.key)}`;
 }
 render(m){
  const d=m.data,me=d.playerFaction,v=this.view;
  v.root.querySelector('.garden-world').setAttribute('aria-label',ct('worldNews'));
  if(this.data!==d){this.data=d;this.sequence=d.eventSequence;this.trail=null;this.holdUntil=0;this.paused=false;this.returnView=null;}
  const resolving=d.phase==='rivals'||d.ordersCommitted;
  if(resolving&&!this.wasResolving)this.returnView={box:[...v.box],mode:v.cameraMode};
  const fresh=d.events.filter(e=>e.id>this.sequence&&this.observed(e,me));this.sequence=d.eventSequence;
  const latest=fresh.filter(e=>e.values.faction!==me||['eliminated','devastated','weatherWarning'].includes(e.key)).at(-1);
  if(latest){
   const ends=this.endpoints(latest,me);this.trail={event:latest,...ends};
   this.holdUntil=performance.now()+(v.fast?180:1300);
   if(this.follow&&resolving)this.frameEvent(latest,m);
  }
  if(!resolving&&this.wasResolving&&this.returnView&&this.follow){v.box=this.returnView.box;v.cameraMode=this.returnView.mode;v.applyView();}
  this.wasResolving=resolving;
  const queue=d.aiQueue[0],actor=queue?.kind==='faction'?this.faction(queue.faction):queue?.kind==='threat'?ct('worldThreats'):ct('worldEvents');
  const watch=v.root.querySelector('#gardenTurnWatch'),focused=watch.contains(document.activeElement)?document.activeElement.dataset.action:null;watch.hidden=!resolving;
  watch.innerHTML=resolving?`<strong>${d.ordersCommitted?ct('executingOwnOrders'):ct('rivalTurn')+' · '+esc(actor)}</strong><div><button data-action="watchPause" aria-pressed="${this.paused}">${ct(this.paused?'watchResume':'watchPause')}</button><button data-action="watchFollow" aria-pressed="${this.follow}">${ct(this.follow?'following':'followOff')}</button><button data-action="watchSpeed" aria-pressed="${v.fast}">${ct('playbackSpeed')}: ${ct(v.fast?'speedFast':'speedNormal')}</button></div>`:'';
  if(focused)watch.querySelector(`[data-action="${focused}"]`)?.focus({preventScroll:true});
  const focusedNews=v.root.querySelector('#gardenNewsItems').contains(document.activeElement)?document.activeElement.dataset.event:null;
  const recent=d.events.filter(e=>this.observed(e,me)).slice(-40).reverse();
  const toggle=v.root.querySelector('#gardenNewsToggle');toggle.textContent=`${ct('worldNews')} · ${recent.length} ${this.expanded?'▾':'▸'}`;toggle.setAttribute('aria-expanded',String(this.expanded));
  v.root.querySelector('#gardenNewsItems').innerHTML=(this.expanded?recent:recent.slice(0,1)).map(e=>{
   const ends=this.endpoints(e,me),target=ends.to??ends.from;
   return `<button data-action="watchEvent" data-event="${e.id}" ${target===null?'disabled':''}><small>${ct('turn')} ${e.turn}</small><span>${esc(this.text(e,me))}</span></button>`;
  }).join('')||`<p>${ct('newsEmpty')}</p>`;
  if(focusedNews)v.root.querySelector(`#gardenNewsItems [data-event="${focusedNews}"]`)?.focus({preventScroll:true});
  this.mapIntel(m);this.intent(m);
 }
 frameEvent(e,m){
  const ends=this.endpoints(e,m.data.playerFaction),id=ends.to??ends.from;if(id===null||!m.node(id))return;
  const v=this.view;v.panelOpen=false;v.root.classList.remove('garden-panel-open');v.panel.inert=true;
  v.root.querySelector('[data-action="panel"]').setAttribute('aria-expanded','false');
  v.frame(id,innerWidth<700?330:650);
 }
 intent(m){
  const v=this.view,drag=v.armyDrag,target=drag?.target??v.selected;
  const army=drag?.armyId??v.armyId,plan=m.data.plannedMoves.find(o=>o.armyId===army);
  const e=v.root.querySelector('#gardenIntent');
  if((drag&&drag.target===null)||!army||target===null||m.data.phase!=='player'||m.data.ordersCommitted||m.data.pending||(!drag&&!plan&&target===m.data.armies.find(a=>a.id===army)?.territory)){e.hidden=true;return;}
  const info=m.orderAssessment(army,drag?target:plan?.target??target),adjacent=m.node(m.data.armies.find(a=>a.id===army)?.territory)?.neighbors.includes(target);if(!info){e.hidden=true;return;}
  e.hidden=false;e.dataset.risk=info.risk;
  e.innerHTML=`<strong>${ct(info.risk==='regroup'?'dropRegroup':info.risk==='unopposed'?'unopposed':plan&&!drag?'attackStaged':!drag&&!adjacent?'territoryDefense':'battleHere')}</strong><span>${info.defense===0?'':`${ct('ownForce')} <b>${Math.round(info.attack)}</b> · ${ct('defendingForce')} <b>${info.defense===null?'?':Math.round(info.defense)}</b>`}</span>${info.defense!==0?`<small>${ct(info.risk==='unknown'?'unknownRisk':info.risk==='danger'?'riskDanger':'riskAdvantage')}<span class="garden-risk-explanation"> · ${ct('forceNotGuarantee')}</span></small>`:''}`;
 }
 mapIntel(m){
  const v=this.view,visible=m.visible(m.data.playerFaction);let layer=v.svg.querySelector('#gardenIntel');
  if(!layer){layer=document.createElementNS('http://www.w3.org/2000/svg','g');layer.id='gardenIntel';layer.setAttribute('pointer-events','none');v.svg.appendChild(layer);}
  layer.innerHTML=m.data.nodes.filter(n=>n.owner!==m.data.playerFaction&&(visible.has(n.id)?m.armyAt(n.id)||m.isDefended(n):n.type==='capital')).map(n=>{
   const known=visible.has(n.id),defense=known?(m.armiesAt(n.id).length?m.defendingArmies(n.id).reduce((sum,p)=>sum+p.force,0):m.actorAt(n.id)?.force??m.localParticipant(n).force):null;
   const owner=known?(m.armyAt(n.id)?.faction??m.actorAt(n.id)?.faction??n.owner):n.capitalOf;
   return `<g data-map-marker="intel" data-x="${n.x}" data-y="${n.y}" class="garden-force-label"><title>${esc(this.faction(owner))} · ${ct('defendingForce')}: ${defense===null?ct('unknownRisk'):Math.round(defense)}</title><path class="force-leader" fill="none" stroke="#eee0c3" stroke-width="1" opacity=".65"/><g class="force-tag"><rect x="-39" y="-38" width="78" height="18" rx="3" style="stroke:${this.color(owner)}"/>${FACTION_PATHS[owner]?`<g transform="translate(-34 -36) scale(.45)" fill="none" stroke="#eee5d7" stroke-width="3">${FACTION_PATHS[owner]}</g>`:`<text x="-29" y="-25" text-anchor="middle">◇</text>`}<text x="7" y="-25" text-anchor="middle">${ct('mapDefense')} ${defense===null?'?':Math.round(defense)}</text></g></g>`;
  }).join('');
  this.drawTrail(m);v.svg.appendChild(layer);v.applyView();
 }
 placeIntelLabels(scale){
  const m=this.view.core.state.model;if(!m)return;
  const capitals=m.data.nodes.filter(n=>n.type==='capital');
  const occupied=[];
  this.view.svg.querySelectorAll('.garden-force-label').forEach(g=>{
   const x=Number(g.dataset.x),y=Number(g.dataset.y);
   const choices=[[0,0],[-80,0],[80,0],[0,-50],[0,65]];
   const clear=([dx,dy])=>{
    const cx=x+dx*scale,cy=y+(-29+dy)*scale;
    if(capitals.some(c=>Math.abs(cx-c.x)<59*scale&&Math.abs(cy-c.y)<29*scale||Math.abs(cx-c.x)<89*scale&&Math.abs(cy-(c.y+40*scale))<19*scale))return false;
    return !occupied.some(p=>Math.abs(cx-p.x)<80*scale&&Math.abs(cy-p.y)<20*scale);
   };
   const [dx,dy]=choices.find(clear)||[0,-50];
   occupied.push({x:x+dx*scale,y:y+(-29+dy)*scale});
   g.querySelector('.force-tag').setAttribute('transform',`translate(${dx} ${dy})`);
   g.querySelector('.force-leader').setAttribute('d',dx||dy?`M0 -18L${dx} ${-20+dy}`:'');
  });
 }
 drawTrail(m){
  const v=this.view;let layer=v.svg.querySelector('#gardenWatchTrail');
  if(!layer){layer=document.createElementNS('http://www.w3.org/2000/svg','g');layer.id='gardenWatchTrail';layer.setAttribute('pointer-events','none');v.svg.appendChild(layer);}
  const t=this.trail;if(!t){layer.innerHTML='';return;}
  if(!['moved','threatMoved','attackStarted'].includes(t.event.key)){
   const n=m.node(t.to),battle=t.event.key==='battleResult';
   layer.innerHTML=n?`<g data-map-marker="news" data-x="${n.x}" data-y="${n.y}"><circle r="21" fill="#24211e88" stroke="#f3cf9a" stroke-width="2" stroke-dasharray="4 3"/><text y="6" text-anchor="middle" fill="#ffe6be" font-size="20">${battle?'⚔':'!'}</text><text y="37" text-anchor="middle" fill="#fff0cf" stroke="#24211e" stroke-width="3" paint-order="stroke" font-size="11" font-family="system-ui">${ct(battle?'battleResolved':t.event.key)}</text></g>`:'';return;
  }
  const a=m.node(t.from),b=m.node(t.to),tone=this.color(t.event.values.faction);
  if(a&&b){const reduced=this.paused||matchMedia('(prefers-reduced-motion: reduce)').matches;
   layer.innerHTML=`<defs><marker id="watchArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M1 1L9 5L1 9" fill="none" stroke="${tone}" stroke-width="1.5"/></marker></defs><path d="M${a.x} ${a.y}L${b.x} ${b.y}" stroke="#211f1b" stroke-width="6"/><path d="M${a.x} ${a.y}L${b.x} ${b.y}" stroke="${tone}" stroke-width="3" stroke-dasharray="7 3" marker-end="url(#watchArrow)"/><circle cx="${b.x}" cy="${b.y}" r="9" fill="none" stroke="${tone}" stroke-width="2"/>${reduced?'':`<circle r="5" fill="${tone}" stroke="#fff1cf" stroke-width="1.5"><animate attributeName="cx" from="${a.x}" to="${b.x}" dur="${v.fast?'.15':'.85'}s" fill="freeze"/><animate attributeName="cy" from="${a.y}" to="${b.y}" dur="${v.fast?'.15':'.85'}s" fill="freeze"/></circle>`}`;
  }else{const n=a||b;layer.innerHTML=n?`<circle cx="${n.x}" cy="${n.y}" r="13" fill="none" stroke="${tone}" stroke-width="3" stroke-dasharray="4 3"/>`:'';}
 }
 action(action,data){
  const v=this.view,m=v.core.state.model;
  if(action==='newsToggle'){this.expanded=!this.expanded;this.render(m);return true;}
  if(action==='watchPause'){this.paused=!this.paused;this.render(m);v.core.schedule();return true;}
  if(action==='watchFollow'){this.follow=!this.follow;this.render(m);return true;}
  if(action==='watchSpeed'){v.fast=!v.fast;this.holdUntil=0;this.render(m);v.core.schedule();return true;}
  if(action==='watchEvent'){const e=m.data.events.find(e=>e.id===Number(data.event)&&this.observed(e,m.data.playerFaction));if(e){this.trail={event:e,...this.endpoints(e,m.data.playerFaction)};if(m.data.phase==='rivals'||m.data.ordersCommitted)this.paused=true;this.frameEvent(e,m);this.render(m);v.core.schedule();}return true;}
  return false;
 }
}
