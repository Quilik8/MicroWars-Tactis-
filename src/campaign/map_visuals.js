import { MapObserver } from './map_observer.js';
import { FACTION_PATHS } from './faction_emblems.js';
import { inWater } from './atlas.js';
import { ct } from './campaign_i18n.js';
import { FACTIONS } from './faction_data.js';
import { localizeFaction } from '../i18n/content_translations.js';
import { preparation, UPGRADES, RULES, random } from './rules.js';
const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const faction = id => {const f=FACTIONS.find(f=>f.id===id);return f?localizeFaction(f).name:ct(['wolfSpider','centipede'].includes(id)?id:'neutral');};
const color = id => '#'+(FACTIONS.find(f=>f.id===id)?.color??0xaaa68b).toString(16).padStart(6,'0');
const icon = type => ({capital:'♜',epic:'✦',pass:'⋈',picnic:'✹',enclave:'⬡',ruin:'⌁'}[type]||'');
export class MapVisuals {
    constructor(game,ui,core){
        this.core=core;this.root=document.getElementById('campaignScreen');this.selected=null;this.armyId=null;
        this.box=[0,0,650,450];this.cameraMode='overview';this.cameraInitialized=false;this.panelOpen=false;this.controlsOpen=true;this.pointers=new Map();this.fast=false;
        this.root.innerHTML=`<button class="garden-controls-toggle" data-action="controls" aria-expanded="true" data-c="hideControls"></button><div class="garden-header"><div><span class="garden-eyebrow" data-c="campaign"></span><h1 data-c="garden"></h1></div><div id="gardenStats"></div><button data-action="panel" data-c="details" aria-expanded="false" aria-controls="gardenContext"></button><button data-action="menu" data-c="menu"></button></div>
        <div class="garden-workspace"><svg id="gardenAtlas" viewBox="0 0 1120 800" role="group" aria-label="Garden atlas" tabindex="0"></svg><div class="garden-map-tools"><button data-action="out" aria-label="Zoom out">−</button><button data-action="in" aria-label="Zoom in">+</button><button data-action="fit" data-c="fit"></button><button data-action="fast" aria-label="Fast rival movements" aria-pressed="false">▶▶</button></div><details class="garden-legend"><summary data-c="legend"></summary><p>♜ <span data-c="capital"></span></p><p>◇ <span data-c="army"></span> · ● <span data-c="ready"></span></p><p>⬡ <span data-c="enclave"></span></p><p>△! <span data-c="largeThreat"></span></p><p>◇× <span data-c="expedition"></span></p><p>┅ <span data-c="frontierLegend"></span></p><p>⋯ <span data-c="tunnel"></span></p></details><p class="garden-help" data-c="help"></p><aside id="gardenContext" aria-label="Territory"></aside></div>
        <footer class="garden-footer"><div id="gardenOrders" aria-live="polite"></div><div id="gardenObjective"></div><button data-action="next" data-c="next"></button><button data-action="end" class="garden-primary" data-c="endTurn"></button></footer>
        <div id="gardenNotice" role="status" aria-live="polite"></div><dialog id="gardenDialog"></dialog>`;
        this.svg=this.root.querySelector('svg');
        this.resizeObserver=new ResizeObserver(()=>this.applyView());this.resizeObserver.observe(this.svg);
        window.addEventListener('resize',()=>this.applyView());
        this.panel=this.root.querySelector('#gardenContext');
        this.dialog=this.root.querySelector('dialog');
        this.observer=new MapObserver(this,faction,color);
        this.root.addEventListener('change',e=>{
            const el=e.target;
            if(el.matches('[data-army-name]'))this.core.perform('rename',{army:el.dataset.armyName,value:el.value});
            if(el.matches('[data-commander-name]'))this.core.perform('renameCommander',{army:el.dataset.commanderName,value:el.value});
            if(el.matches('[data-retreat-policy],[data-retreat-target]')){const section=el.closest('.army-detail');this.core.perform('retreatPolicy',{army:section.dataset.army,allowed:section.querySelector('[data-retreat-policy]').checked,target:section.querySelector('[data-retreat-target]').value});}
        });
        this.root.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(b)this.action(b.dataset.action,b.dataset);});
        this.svg.addEventListener('click',e=>{
            if(this.dragged||this.suppressClick)return;const el=e.target.closest('[data-node]');if(!el)return;
            if(el.dataset.armyId&&this.core.state.data.armies.some(a=>a.id===el.dataset.armyId&&a.faction===this.core.state.data.playerFaction))this.armyId=el.dataset.armyId;
            const p=this.mapPoint(e);if(!el.matches('[data-map-marker]')&&inWater(p.x,p.y))return;this.select(Number(el.dataset.node));
        });
        this.svg.addEventListener('wheel',e=>{if(this.armyDrag)return;e.preventDefault();this.zoom(e.deltaY>0?1.15:0.87);},{passive:false});
        this.svg.addEventListener('pointerdown',e=>{
            if(e.button!==0&&e.pointerType==='mouse')return;
            const token=e.target.closest('.garden-army'),m=this.core.state.model,a=token&&m.data.armies.find(a=>a.id===token.dataset.armyId);
            if(a?.faction===m.data.playerFaction&&a.ready&&m.allowed(a.faction)&&!this.core.state.issue&&!this.pointers.size){
                e.preventDefault();this.notice('');this.armyId=a.id;this.dragged=true;this.suppressClick=true;
                this.armyDrag={pointerId:e.pointerId,armyId:a.id,token,startX:e.clientX,startY:e.clientY,moved:false,target:null};
                this.svg.setPointerCapture(e.pointerId);token.classList.add('army-dragging');this.svg.appendChild(token);this.svg.classList.add('carrying-army');return;
            }
            if(this.armyDrag){const previous=this.armyDrag;this.cancelArmyDrag();this.pointers.set(previous.pointerId,{x:previous.lastX??previous.startX,y:previous.lastY??previous.startY});}
            if(m.data.phase==='rivals')this.observer.follow=false;
            this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});this.dragged=false;this.origin={x:e.clientX,y:e.clientY,box:[...this.box]};
            if(this.pointers.size===2){const [a,b]=[...this.pointers.values()];this.pinch=Math.hypot(a.x-b.x,a.y-b.y);}
        });
        this.svg.addEventListener('pointermove',e=>{
            if(this.armyDrag){this.dragArmy(e);return;}if(!this.pointers.has(e.pointerId))return;
            const prev=this.pointers.get(e.pointerId);this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
            if(this.pointers.size===2){const [a,b]=[...this.pointers.values()],distance=Math.hypot(a.x-b.x,a.y-b.y);if(this.pinch)this.zoom(this.pinch/distance);this.pinch=distance;this.dragged=true;return;}
            if(Math.hypot(e.clientX-this.origin.x,e.clientY-this.origin.y)>5)this.dragged=true;
            if(this.dragged){if(!this.svg.hasPointerCapture(e.pointerId))this.svg.setPointerCapture(e.pointerId);const r=this.svg.getBoundingClientRect(),scale=Math.max(this.box[2]/r.width,this.box[3]/r.height);this.box[0]-=(e.clientX-prev.x)*scale;this.box[1]-=(e.clientY-prev.y)*scale;this.applyView();}
        });
        this.svg.addEventListener('pointerup',e=>{
            if(this.armyDrag&&this.armyDrag.pointerId===e.pointerId){
                if(this.armyDrag.moved)this.dragArmy(e);const drag=this.armyDrag;drag.token.remove();this.sceneKey=null;this.armyDrag=null;this.svg.classList.remove('carrying-army');this.hideDragHint();
                if(drag.moved&&drag.target!==null){this.selected=drag.target;this.panelOpen=false;this.core.perform('planMove',{army:drag.armyId,target:drag.target});}
                else {if(!drag.moved){this.selected=Number(drag.token.dataset.node);this.panelOpen=true;}this.render();if(drag.moved)this.notice(ct(drag.error||'invalidDrop'));}
                this.suppressClick=true;setTimeout(()=>this.suppressClick=false,0);return;
            }
            this.pointers.delete(e.pointerId);this.pinch=null;
        });
        this.svg.addEventListener('pointercancel',e=>{if(this.armyDrag)this.cancelArmyDrag();this.pointers.delete(e.pointerId);this.pinch=null;this.dragged=true;});
        this.svg.addEventListener('keydown',e=>{
            if(e.key==='Escape'){this.keyboardCarry=false;if(this.armyDrag)this.cancelArmyDrag();this.panelOpen=false;this.render();return;}
            if(e.key==='+'||e.key==='=')this.zoom(0.8);
            if(e.key==='-')this.zoom(1.25);
            if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){
                e.preventDefault();const d=this.core.state.data,n=d.nodes[this.selected??d.factions[d.playerFaction].capital];
                const direction={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
                const target=n.neighbors.map(id=>d.nodes[id]).sort((a,b)=>{
                    const score=p=>((p.x-n.x)*direction[0]+(p.y-n.y)*direction[1])/Math.hypot(p.x-n.x,p.y-n.y);
                    return score(b)-score(a);
                })[0];if(target)this.select(target.id);
            }
            if(e.key===' '&&this.armyId){e.preventDefault();this.keyboardCarry=true;this.notice(ct('keyboardDrop'));}
            if(e.key==='Enter'&&this.selected!==null){if(this.keyboardCarry){this.core.perform('planMove',{army:this.armyId,target:this.selected});this.keyboardCarry=false;}else this.select(this.selected);}
        });
        document.addEventListener('languagechange',()=>{this.sceneData=null;if(this.core.ui.gameState==='CAMPAIGN')this.render();});
    }
    label(n){return n.type==='capital'?`${ct('capital')} · ${faction(n.capitalOf)}`:n.type==='picnic'?ct('picnic'):ct(n.region);}
    select(id){
        const m=this.core.state.model,a=m.armiesAt(id).find(x=>x.id===this.armyId)||m.armyAt(id);this.selected=id;this.panelOpen=true;this.controlsOpen=true;
        const own=a?.faction===m.data.playerFaction;if(own&&!this.keyboardCarry)this.armyId=a.id;
        this.render();this.panel.scrollTop=0;
    }
    frame(id,width=innerWidth<700?400:650){
        const n=this.core.state.model.node(id),rect=this.svg.getBoundingClientRect();
        const height=width*Math.max(1,rect.height)/Math.max(1,rect.width);
        const top=this.controlsOpen?(innerWidth<700?112:102):12,bottom=this.controlsOpen?this.root.querySelector('.garden-footer').getBoundingClientRect().height+12:12;
        const side=this.panelOpen&&innerWidth>=700?310:0,lower=this.panelOpen&&innerWidth<700?Math.min(rect.height*.44,360):0;
        const scale=width/Math.max(1,rect.width),centerX=(rect.width-side)/2,centerY=top+(rect.height-top-bottom-lower)/2;
        this.cameraMode='local';this.box=[n.x-centerX*scale,n.y-centerY*scale,width,height];this.applyView();
    }
    focus(id){this.selected=id;this.panelOpen=true;this.controlsOpen=true;this.render();this.frame(id);}
    next(){const d=this.core.state.data,armies=d.armies.filter(a=>a.faction===d.playerFaction&&a.ready);if(!armies.length)return;
        const i=armies.findIndex(a=>a.id===this.armyId);const a=armies[(i+1)%armies.length];this.armyId=a.id;this.focus(a.territory);}
    zoom(factor){this.cameraMode='local';const w=Math.max(180,Math.min(1600,this.box[2]*factor)),ratio=w/this.box[2];this.box=[this.box[0]+this.box[2]*(1-ratio)/2,this.box[1]+this.box[3]*(1-ratio)/2,w,this.box[3]*ratio];this.applyView();}
    applyView(){
        const rect=this.svg.getBoundingClientRect();if(rect.width<1||rect.height<1)return;
        const changedLayout=this.viewportWidth!==undefined&&(this.viewportWidth<700)!==(rect.width<700);this.viewportWidth=rect.width;
        if(changedLayout&&this.cameraMode==='local'&&this.armyId){const army=this.core.state.data.armies.find(a=>a.id===this.armyId);if(army){this.frame(army.territory);return;}}
        this.root.style.setProperty('--garden-footer-height',this.root.querySelector('.garden-footer').getBoundingClientRect().height+'px');this.root.style.setProperty('--garden-panel-height',this.panelOpen?this.panel.getBoundingClientRect().height+'px':'0px');
        const world=this.root.querySelector('.garden-world');if(world)this.root.style.setProperty('--garden-world-bottom',(world.offsetTop+world.offsetHeight+8)+'px');
        const ratio=rect.width/rect.height;
        if(this.cameraMode==='overview'){
            const top=this.controlsOpen?(innerWidth<700?112:102):12,bottom=this.controlsOpen?this.root.querySelector('.garden-footer').getBoundingClientRect().height+12:12;
            const side=this.panelOpen?(innerWidth<700?0:Math.min(310,rect.width*.4)):0;
            const lower=this.panelOpen&&innerWidth<700?Math.min(rect.height*.44,360):0;
            const usableWidth=Math.max(120,rect.width-side-24),usableHeight=Math.max(120,rect.height-top-bottom-lower);
            const scale=Math.max(1120/usableWidth,800/usableHeight);
            this.box=[550-(12+usableWidth/2)*scale,400-(top+usableHeight/2)*scale,rect.width*scale,rect.height*scale];
        }else{
            const centerY=this.box[1]+this.box[3]/2;this.box[3]=this.box[2]/ratio;this.box[1]=centerY-this.box[3]/2;
            const margin=60*this.box[2]/rect.width;
            const bound=(value,extent,max)=>Math.max(-extent+margin,Math.min(max-margin,value));
            this.box[0]=bound(this.box[0],this.box[2],1100);this.box[1]=bound(this.box[1],this.box[3],800);
        }
        this.svg.setAttribute('viewBox',this.box.join(' '));this.svg.dataset.scale=this.cameraMode==='overview'?'garden':this.box[2]>500?'front':'territory';
        const scale=this.box[2]/rect.width;
        this.svg.querySelectorAll('[data-map-marker]').forEach(g=>{const army=g.dataset.mapMarker==='army';g.setAttribute('transform',`translate(${Number(g.dataset.x)} ${Number(g.dataset.y)}) scale(${scale*(army?1.45:1)})`);});this.observer?.placeIntelLabels(scale);this.drawDrafts();
    }
    checkHover(){} checkClick(){} // Legacy input bridge: this SVG owns its pointer events.
    clear(){this.root.classList.remove('garden-visible');}
    render(){
        const m=this.core.state.model;if(!m)return;const d=m.data,me=d.playerFaction;
        this.root.classList.toggle('garden-controls-hidden',!this.controlsOpen);const toggle=this.root.querySelector('[data-action=controls]');toggle.dataset.c=this.controlsOpen?'hideControls':'showControls';toggle.setAttribute('aria-expanded',String(this.controlsOpen));
        this.root.classList.add('garden-visible');this.root.classList.toggle('garden-panel-open',this.panelOpen);this.root.querySelector('[data-action=panel]').setAttribute('aria-expanded',String(this.panelOpen));this.panel.inert=!this.panelOpen;this.root.querySelectorAll('[data-c]').forEach(e=>e.textContent=ct(e.dataset.c));
        const f=m.faction(me),visible=m.visible(me),intel=d.intel[me]||{},selected=m.node(this.selected);
        const army=d.armies.find(a=>a.id===this.armyId);if(!army)this.armyId=null;
        const count=d.armies.filter(a=>a.faction===me&&a.ready&&!d.plannedMoves.some(o=>o.armyId===a.id)).length;
        this.svg.setAttribute('aria-label',ct('garden'));this.panel.setAttribute('aria-label',ct('details'));this.root.querySelector('[data-action=in]').setAttribute('aria-label',ct('zoomIn'));this.root.querySelector('[data-action=out]').setAttribute('aria-label',ct('zoomOut'));this.root.querySelector('[data-action=fast]').setAttribute('aria-label',ct('accelerate'));this.svg.setAttribute('aria-description',ct('help'));this.root.querySelector('.garden-map-tools').title=ct('help');
        this.root.querySelector('#gardenStats').innerHTML=`<span class="garden-faction" style="--faction:${color(me)}">${esc(faction(me))}</span><span>${ct('turn')} <b>${d.turn}</b></span><span>${ct('points')} <b>${f.points}</b></span><span>${ct('unassignedArmies')} <b>${count}</b></span>`;
        this.root.querySelector('#gardenObjective').innerHTML=`<strong>${d.picnicOwner?`${ct('hold')} · ${esc(faction(d.picnicOwner))} ${d.picnicHeld}/3`:ct('picnic')}</strong><span>${ct('objective')}</span>`;
        const end=this.root.querySelector('[data-action="end"]');end.disabled=d.ordersCommitted||d.phase!=='player'||!!d.pending||!!d.reward||!!d.winner||!!this.core.state.issue;
        end.textContent=d.phase==='rivals'?ct('rivals'):ct('endTurn');
        this.root.querySelector('#gardenOrders').innerHTML=this.orders(m,selected,army);
        const sceneKey=JSON.stringify([this.armyId,d.worldRevision,d.turn,d.phase,d.eventSequence,d.plannedMoves,d.ordersCommitted,d.actors.map(a=>[a.id,a.territory,a.force,a.active]),d.armies.map(a=>[a.id,a.territory,a.ready])]);
        const changed=this.sceneData!==d||this.sceneKey!==sceneKey;
        if(this.sceneData!==d||this.sceneWorldRevision!==d.worldRevision){
        const defs=`<defs><pattern id="waterRipples" width="30" height="22" patternUnits="userSpaceOnUse"><path d="M2 9q6 -3 12 0M16 18q5 -2 10 0" fill="none" stroke="#b7d4c4" stroke-width=".7" opacity=".25"/></pattern><pattern id="soilGrain" width="23" height="21" patternUnits="userSpaceOnUse"><circle cx="4" cy="8" r=".7" fill="#211c12" opacity=".18"/><circle cx="18" cy="15" r="1" fill="#eee2ad" opacity=".12"/><path d="M10 3l2 1" stroke="#332c20" stroke-width=".6" opacity=".2"/></pattern><pattern id="oldIntel" width="7" height="7" patternUnits="userSpaceOnUse"><path d="M0 7L7 0" stroke="#131b15" opacity=".2"/></pattern><filter id="gardenShadow"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-opacity=".28"/></filter></defs>`;
        const polygons=d.nodes.map(n=>{
            const region=d.regions.find(r=>r.id===n.region),known=intel[n.id],owner=visible.has(n.id)?n.owner:known?.owner;
            const points=n.polygon.map(p=>p.join(',')).join(' ');
            return `<g data-node="${n.id}" role="button" tabindex="${n.id===(this.selected??f.capital)?0:-1}" aria-label="${esc(this.label(n))}" class="garden-cell ${n.id===this.selected?'selected':''}"><polygon points="${points}" fill="${region.color}"/><polygon points="${points}" fill="url(#soilGrain)"/><polygon class="owner-tint" points="${points}" fill="transparent" fill-opacity=".28"/><polygon class="vision-shade" points="${points}" fill="#1d1c1a" opacity="0"/><polygon class="old-intel" points="${points}" fill="url(#oldIntel)" style="display:none"/><polygon class="cell-edge" points="${points}"/></g>`;
        }).join('');
        const terrain=`<g class="garden-terrain" pointer-events="none"><path d="M82 774Q310 560 306 390T540 40" stroke="#d4bb88" stroke-width="14" opacity=".24" fill="none"/><path d="M60 470Q240 540 320 670M190 525Q265 430 390 410M245 575Q170 610 150 715" stroke="#342e1d" stroke-width="10" opacity=".2" fill="none"/><path d="M995 57Q845 77 810 120Q921 155 995 57M400 110Q370 45 300 73Q340 135 400 110M97 290Q136 223 205 251Q158 310 97 290" fill="#314c2c" opacity=".22"/></g>`;
        const markers=d.nodes.filter(n=>n.type!=='ordinary').map(n=>{
            return `<g data-node="${n.id}" data-map-marker="site" data-x="${n.x}" data-y="${n.y}" class="garden-marker ${n.type}" transform="translate(${n.x} ${n.y})" role="button" aria-label="${esc(this.label(n))}"><circle r="22" fill="transparent" stroke="none" class="marker-hit"/><circle r="${n.type==='capital'?13:11}"/><text y="5">${icon(n.type)}</text>${n.type==='capital'?`<text class="capital-name" x="${n.x<150?18:n.x>950?-18:0}" style="text-anchor:${n.x<150?'start':n.x>950?'end':'middle'}" y="44">${esc(faction(n.capitalOf).replace(/^Hormigas? /,''))}</text>`:''}</g>`;
        }).join('');
        const labels=d.regions.map(r=>`<text class="garden-region ${r.id==='picnic'?'picnic-region':''}" x="${r.x}" y="${r.y-28}">${esc(ct(r.id==='picnic'?'picnic':r.id))}</text>`).join('');
        const water=`<g class="garden-water" pointer-events="none">${(d.water||[]).map(w=>{
            const path=`M${w.polygon.map(p=>p.join(',')).join('L')}Z`;
            return `<path d="${path}" fill="#2e6269" stroke="#c4bb8a" stroke-width="5"/><path d="${path}" fill="url(#waterRipples)" stroke="#729c91" stroke-width="1.5"/><text x="${w.cx}" y="${w.cy}" text-anchor="middle">${ct('water')}</text>`;
        }).join('')}</g>`;
        this.svg.innerHTML=defs+`<g class="garden-land">${polygons}${terrain}${this.geographyData===d?this.geographyHTML:(this.geographyData=d,this.geographyHTML=this.terrainDetail(d))}<g pointer-events="none"><g id="gardenBorders"></g>${labels}<g id="gardenRoutes"></g></g></g>`+water+markers+'<g id="gardenArmies"></g><g id="gardenThreats"></g><g id="gardenEffects" pointer-events="none"></g><g id="gardenPlannedArmies"></g>';
        this.sceneData=d;this.sceneWorldRevision=d.worldRevision;
        }
        if(changed){
            this.svg.querySelector('#gardenArmies').innerHTML=this.armiesMarkup(m,visible);
            const plannedLayer=this.svg.querySelector('#gardenPlannedArmies');plannedLayer.innerHTML='';this.svg.querySelectorAll('#gardenArmies [data-planned]').forEach(g=>plannedLayer.appendChild(g));
            this.svg.querySelector('#gardenThreats').innerHTML=this.threatsMarkup(m,visible);
            this.svg.querySelector('#gardenEffects').innerHTML=this.effectsMarkup(m,visible);
            this.svg.querySelector('#gardenBorders').innerHTML=this.bordersMarkup(m,visible,intel);
            this.svg.querySelectorAll('.garden-cell').forEach(g=>{const id=Number(g.dataset.node),n=m.node(id),known=intel[id],owner=visible.has(id)?n.owner:known?.owner;g.querySelector('.owner-tint').setAttribute('fill',owner&&owner!=='neutral'?color(owner):'transparent');g.querySelector('.vision-shade').setAttribute('opacity',visible.has(id)?'0':known?'.1':'.23');g.querySelector('.old-intel').style.display=known&&!visible.has(id)?'':'none';});
            this.svg.querySelectorAll('.garden-marker').forEach(g=>{const n=m.node(Number(g.dataset.node));g.style.display=['epic','pass','enclave'].includes(n.type)&&!intel[n.id]?'none':'';});
            this.sceneKey=sceneKey;
        }
        this.svg.querySelectorAll('.garden-cell').forEach(g=>{const n=m.node(Number(g.dataset.node));g.classList.toggle('selected',n.id===this.selected);g.classList.remove('reachable');g.setAttribute('tabindex',n.id===(this.selected??f.capital)?'0':'-1');});
        this.svg.querySelectorAll('.garden-army').forEach(g=>g.classList.toggle('selected',g.dataset.armyId===this.armyId));
        this.svg.querySelector('#gardenRoutes').innerHTML='';
        if(!this.cameraInitialized){this.cameraMode='overview';this.cameraInitialized=true;}
        this.applyView();
        this.panel.innerHTML=this.context(m,selected,army,visible,intel);
        this.observer.render(m);
        if(this.core.state.issue)this.notice(ct(this.core.state.issue));
        if(d.resultNotice)this.result();else if(d.winner)this.finished();else if(d.pending)this.encounter();else if(d.reward)this.reward();
    }
    armiesMarkup(m,visible){const d=m.data,me=d.playerFaction;
        const displayed=d.armies.filter(a=>a.faction===me||visible.has(a.territory));
        const location=a=>d.plannedMoves.find(o=>o.armyId===a.id)?.target??a.territory;
        return displayed.filter(a=>{const group=displayed.filter(x=>x.faction===a.faction&&location(x)===location(a));return (group.find(x=>x.id===this.armyId)||group.find(x=>x.ready)||group[0]).id===a.id;}).map(a=>{
            const stackSize=displayed.filter(x=>x.faction===a.faction&&location(x)===location(a)).length;
            const planned=d.plannedMoves.find(o=>o.armyId===a.id),n=m.node(planned?planned.target:a.territory);return `<g data-army-id="${a.id}" ${planned?'data-planned="true"':''} data-node="${n.id}" data-map-marker="army" data-x="${n.x}" data-y="${n.y}" class="garden-army ${a.id===this.armyId?'selected':''}" transform="translate(${n.x} ${n.y})"><path d="M0 -11L11 0L0 11L-11 0Z" fill="${color(a.faction)}"/><circle class="army-hit" r="17" fill="transparent" stroke="none"/><g transform="translate(-7 -7) scale(.44)" fill="none" stroke="#181715" stroke-width="2">${FACTION_PATHS[a.faction]}</g><text x="10" y="14" text-anchor="middle" font-size="7" fill="#eee5d7" stroke="#24211e" stroke-width="2" paint-order="stroke">${stackSize>1?'×'+stackSize:a.formationNumber}</text>${a.faction===me?`<circle cx="9" cy="-9" r="3.5" fill="${a.ready?'#fff2b8':'#273d2a'}"/>`:''}</g>`;
        }).join('');
    }
    bordersMarkup(m,visible,intel){const d=m.data;
        return d.connections.map(c=>{
            const a=m.node(c.from),b=m.node(c.to),oa=visible.has(a.id)?a.owner:intel[a.id]?.owner,ob=visible.has(b.id)?b.owner:intel[b.id]?.owner;
            if(!oa||!ob||oa===ob||oa==='neutral'&&ob==='neutral')return '';
            // The shared polygon edge, not a line across territory centers.
            const common=a.polygon.filter(p=>b.polygon.some(q=>Math.hypot(p[0]-q[0],p[1]-q[1])<0.1));
            return common.length>=2?`<path d="M${common[0]}L${common[1]}" stroke="${color(oa==='neutral'?ob:oa)}" stroke-width="2.2" stroke-dasharray="6 2" fill="none"/>`:'';
        }).join('');
    }
    terrainDetail(d){
        const rocks=Array.from({length:65},(_,i)=>{
            const x=50+random('pebbles',i*2)*1000,y=40+random('pebbles',i*2+1)*700;
            if(d.nodes.some(n=>n.type==='capital'&&Math.hypot(n.x-x,n.y-y)<35))return '';
            const r=2+random('stone',i)*7;
            return `<ellipse cx="${x+1}" cy="${y+2}" rx="${r*1.5}" ry="${r}" fill="#1b2819" opacity=".2"/><path d="M${x-r} ${y}l${r*.4} ${-r*.7} ${r*1.2} ${-r*.2} ${r*.8} ${r*.7} ${-r*.6} ${r*.6}Z" fill="#a9a48a" stroke="#716f56" stroke-width=".6" opacity=".65"/>`;
        }).join('');
        const leaves=[[170,280,-20,1],[870,150,30,1.3],[945,245,80,.9],[370,120,-35,.8],[740,72,15,.7]].map(([x,y,angle,scale])=>`<g transform="translate(${x} ${y}) rotate(${angle}) scale(${scale})"><path d="M-38 0Q-10 -28 40 -4Q10 28 -38 0" fill="#486039" stroke="#304d2e" stroke-width="1"/><path d="M-40 0L38 -4M-18 0l6 -12M-3 -1l12 -14M11 -2l12 -9M-18 0l8 10M-3 -1l13 12M11 -2l12 7" stroke="#a2ac69" opacity=".5" fill="none" stroke-width="1"/></g>`).join('');
        const barriers=(d.blockedEdges||[]).map(e=>{
            const a=d.nodes[e.from],b=d.nodes[e.to],shared=a.polygon.filter(p=>b.polygon.some(q=>Math.hypot(p[0]-q[0],p[1]-q[1])<.1));
            if(shared.length<2||e.reason==='water')return '';
            return `<path d="M${shared[0]}L${shared[1]}" stroke="#38472b" stroke-width="${e.reason==='terrain'?1.2:3}" stroke-linecap="round" opacity="${e.reason==='terrain'?.45:.7}"/>`;
        }).join('');
        return `<g pointer-events="none" class="garden-geography">${rocks}${leaves}${barriers}</g>`;
    }
    mapPoint(e){return new DOMPoint(e.clientX,e.clientY).matrixTransform(this.svg.getScreenCTM().inverse());}
    dropTerritory(e){
        const surface=document.elementFromPoint(e.clientX,e.clientY);if(!surface?.closest('#gardenAtlas'))return null;
        const p=this.mapPoint(e);if(inWater(p.x,p.y))return null;
        return this.core.state.data.nodes.find(n=>{let inside=false;const poly=n.polygon;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>p.y)!==(b[1]>p.y)&&p.x<(b[0]-a[0])*(p.y-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;})?.id??null;
    }
    dragArmy(e){
        const drag=this.armyDrag;if(e.pointerId!==drag.pointerId)return;drag.lastX=e.clientX;drag.lastY=e.clientY;
        if(!drag.moved&&Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)<5)return;drag.moved=true;
        const p=this.mapPoint(e),scale=this.box[2]/this.svg.getBoundingClientRect().width;
        drag.token.setAttribute('transform',`translate(${p.x} ${p.y}) scale(${scale*1.65})`);
        const id=this.dropTerritory(e),m=this.core.state.model;drag.error=id===null?'invalidDrop':m.validatePlan(m.data.playerFaction,drag.armyId,id);drag.target=drag.error?null:id;
        this.drawDrafts(drag.target,p);this.observer.intent(m);this.showDragHint(e,drag.error?ct(drag.error):id===m.data.armies.find(a=>a.id===drag.armyId).territory?ct('returnToOrigin'):this.orderHint(m,drag.armyId,id));
    }
    orderHint(m,armyId,target){
        const info=m.orderAssessment(armyId,target);if(!info)return ct('dropHere');
        if(info.risk==='regroup')return ct('dropRegroup');
        if(info.risk==='unopposed')return ct('unopposed');
        return `${ct(info.risk==='unknown'?'unknownRisk':info.risk==='danger'?'highRisk':'forceAdvantage')} · ${Math.round(info.attack)} / ${info.defense===null?'?':Math.round(info.defense)} · ${ct('dropAttack')}`;
    }
    showDragHint(e,text){let hint=this.root.querySelector('#gardenDragHint');if(!hint){hint=document.createElement('div');hint.id='gardenDragHint';this.root.appendChild(hint);}const rect=this.root.getBoundingClientRect();hint.textContent=text;hint.style.left=Math.max(8,Math.min(rect.width-210,e.clientX-rect.left+20))+'px';hint.style.top=Math.max(110,e.clientY-rect.top-45)+'px';}
    hideDragHint(){this.root.querySelector('#gardenDragHint')?.remove();}
    cancelArmyDrag(){this.armyDrag?.token.remove();this.sceneKey=null;this.armyDrag=null;this.svg.classList.remove('carrying-army');this.hideDragHint();this.render();this.suppressClick=true;setTimeout(()=>this.suppressClick=false,0);}
    drawDrafts(target=null,pointer=null){
        const m=this.core.state.model;if(!m||!this.svg.querySelector('#gardenArmies'))return;const scale=this.box[2]/Math.max(1,this.svg.getBoundingClientRect().width);
        let layer=this.svg.querySelector('#gardenDrafts');if(!layer){layer=document.createElementNS('http://www.w3.org/2000/svg','g');layer.id='gardenDrafts';layer.setAttribute('pointer-events','none');this.svg.insertBefore(layer,this.svg.querySelector('#gardenArmies'));}
        layer.innerHTML=`<defs><marker id="orderArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M1 1L9 5L1 9" fill="none" stroke="#e8d8b3" stroke-width="1.5"/></marker></defs>`+m.data.plannedMoves.filter(o=>o.armyId!==this.armyDrag?.armyId).map(o=>{
            const from=m.node(o.from),to=m.node(o.target),x=from.x,y=from.y,army=m.data.armies.find(a=>a.id===o.armyId),distance=Math.max(.001,Math.hypot(to.x-x,to.y-y)),gap=Math.min(19*scale,distance*.4),endX=to.x-(to.x-x)/distance*gap,endY=to.y-(to.y-y)/distance*gap;
            return `<path d="M${x} ${y}L${endX} ${endY}" stroke="#24211e" stroke-width="${3.5*scale}" opacity=".35"/><path d="M${x} ${y}L${endX} ${endY}" stroke="${m.orderAssessment(o.armyId,o.target)?.defense!==0?'#e4a38b':'#f0dfb6'}" stroke-width="${1.8*scale}" stroke-dasharray="${5*scale} ${3*scale}" opacity=".95" marker-end="url(#orderArrow)"/><g transform="translate(${x} ${y}) scale(${scale*1.45})" opacity=".5"><path d="M0 -11L11 0L0 11L-11 0Z" fill="${color(army.faction)}" stroke="#eee5d7" stroke-width="1.2"/><g transform="translate(-7 -7) scale(.44)" fill="none" stroke="#181715" stroke-width="2">${FACTION_PATHS[army.faction]}</g></g><text x="${x}" y="${y-23*scale}" text-anchor="middle" fill="#eee5d7" stroke="#24211e" stroke-width="${2*scale}" paint-order="stroke" font-size="${9*scale}" font-family="system-ui">${ct('originShort')}</text>`;
        }).join('');
        layer.innerHTML+=Array.from(new Set(m.data.plannedMoves.map(o=>o.target))).map(id=>{
            const order=m.data.plannedMoves.find(o=>o.target===id),info=m.orderAssessment(order.armyId,id),n=m.node(id),attack=info.defense!==0;
            return `<g transform="translate(${n.x} ${n.y}) scale(${scale})" class="garden-order-label"><rect x="-72" y="20" width="144" height="${attack?40:23}" rx="3" fill="#24211ef2" stroke="${attack?'#d99b83':'#decca7'}"/><text x="0" y="35" text-anchor="middle" fill="${attack?'#ffd1b8':'#f5e7bd'}" font-size="11" font-family="system-ui">${ct(attack?'attackStaged':info.risk==='regroup'?'regroupOrder':'unopposed')}</text>${attack?`<text x="0" y="51" text-anchor="middle" fill="#f5e7bd" font-size="12" font-family="system-ui">${Math.round(info.attack)} ${ct('versus')} ${info.defense===null?'?':Math.round(info.defense)}</text>`:''}</g>`;
        }).join('');
        if(this.armyDrag&&pointer){const a=m.data.armies.find(a=>a.id===this.armyDrag.armyId),from=m.node(a.territory),to=target===null?pointer:m.node(target);
            layer.innerHTML+=from.neighbors.filter(id=>!m.validatePlan(m.data.playerFaction,a.id,id)).map(id=>{const n=m.node(id);return `<circle cx="${n.x}" cy="${n.y}" r="${3*scale}" fill="#eee2c4" stroke="#302b25" stroke-width="${scale}" opacity=".85"/>`;}).join('');
            layer.innerHTML+=`<g transform="translate(${from.x} ${from.y}) scale(${scale*1.45})" opacity=".45"><path d="M0 -11L11 0L0 11L-11 0Z" fill="${color(a.faction)}" stroke="#eee5d7" stroke-width="1.2"/></g><path d="M${from.x} ${from.y}L${to.x} ${to.y}" fill="none" stroke="${target===null?'#b39184':'#e8d8b3'}" opacity=".7" stroke-width="${1.5*scale}"/>${target!==null?`<circle cx="${to.x}" cy="${to.y}" r="${12*scale}" stroke="#e8d8b3" stroke-width="${1.5*scale}" fill="none"/>`:''}`;
        }
    }
    orders(m){
        const d=m.data;if(d.pending||d.winner||d.reward||d.resultNotice)return '';
        if(d.ordersCommitted||d.phase!=='player')return `<span>${ct('resolvingOrders')}</span>`;
        return `<div><strong>${ct(d.plannedMoves.length?'ordersStaged':'dragInstruction')}</strong><span>${ct(d.plannedMoves.length?'endTurnCommitShort':'dragHint')}</span></div>${d.plannedMoves.length?`<button data-action="clearPlans">${ct('undoOrders')} · ${d.plannedMoves.length}</button>`:''}`;
    }
    movementCommands(m,n,a){
        const d=m.data;
        if(!a)return `<p class="garden-muted">${ct('dragInstruction')}</p>`;
        const plan=d.plannedMoves.find(o=>o.armyId===a.id);
        const assessment=plan?this.orderHint(m,a.id,plan.target):'';
        return `<section class="garden-movement"><h3>${esc(a.name)}</h3><p>${ct(!a.ready?(a.availableTurn>d.turn?'waiting':'spent'):plan?'orderStaged':'dragHint')}</p>${assessment?`<p class="garden-muted">${esc(assessment.replace(' · '+ct('dropAttack'),''))}</p>`:''}${plan?`<button data-action="cancelPlan" data-army="${a.id}" data-target="${a.territory}">${ct('undoOrder')}</button>`:''}</section>`;
    }
    context(m,n,a,visible,intel){
        const d=m.data,f=m.faction(d.playerFaction),ownArmy=d.armies.find(x=>x.id===this.armyId);
        let html=`<button data-action="panel" class="garden-panel-close" aria-label="${ct('hideDetails')}">×</button>`;
        const group=d.armies.filter(x=>x.faction===d.playerFaction&&(d.plannedMoves.find(o=>o.armyId===x.id)?.target??x.territory)===n?.id);
            if(group.length>1)html+=`<section class="garden-stack"><h3>${ct('stackedArmies')} · ${group.length}</h3>${group.map(x=>`<button data-action="chooseStackArmy" data-army="${x.id}" aria-pressed="${x.id===this.armyId}">${esc(x.name)} · ${Math.round(preparation(x)*100)}%</button>`).join('')}<p class="garden-muted">${ct('stackHelp')}</p></section>`;
        html+=this.movementCommands(m,n,ownArmy,visible)+`<span class="garden-eyebrow">${ct('campaign')}</span><h2>${n?esc(this.label(n)):ct('garden')}</h2>`;
        if(n){
            const known=intel[n.id],isVisible=visible.has(n.id),owner=isVisible?n.owner:known?.owner,hiddenSite=!isVisible&&!known&&['enclave','epic'].includes(n.type),displayType=hiddenSite?'ordinary':n.type,displayRole=hiddenSite?'frontier':(n.role||n.type);
            html+=`<p class="garden-role">${ct('role.'+displayRole)}</p><p class="garden-connections">${n.neighbors.length} ${ct('connections')}</p><p class="garden-biome">${ct(n.region==='picnic'?'picnic':n.region)} · ${ct(displayType)}</p><p>${esc(owner?faction(owner):ct('unknown'))}</p><p class="garden-muted">${isVisible?ct('known'):known?`${ct('old')} ${known.turn}`:ct('unknown')}</p>`;
            const stationed=group.find(x=>x.id===this.armyId)||m.armyAt(n.id);
            if(stationed&&(stationed.faction===d.playerFaction||isVisible)){
                const c=m.commander(stationed),own=stationed.faction===d.playerFaction,editable=own&&m.allowed(d.playerFaction),targets=m.retreatDestinations(stationed.faction,stationed.territory);
                html+=`<section class="army-detail" data-army="${stationed.id}"><span class="garden-command-mark">${ct('army')} ${String(stationed.formationNumber).padStart(2,'0')} · <span title="${ct('personalMark')}">${['○','△','◇','□','⋈','⌁'][c.insignia]}</span></span><strong>${Math.round(preparation(stationed)*100)}%<small>${ct('deployment')}</small></strong><p>${ct('victories')}: ${stationed.battleVictories} · ${ct('instruction')}: ${stationed.trainingLevel}</p><p>${ct('basePreparation')}: ${Math.min(100,50+10*(stationed.battleVictories+stationed.trainingLevel))}%${stationed.penalty?` · −${Math.round(stationed.penalty*100)} ${ct('retreatPenalty')}`:''}</p><p>${stationed.ready?ct(d.plannedMoves.some(o=>o.armyId===stationed.id)?'orderStaged':'ready'):ct(stationed.availableTurn>d.turn?'waiting':'spent')}</p><label class="garden-army-name">${ct('army')}<input data-army-name="${stationed.id}" aria-label="${ct('army')}" value="${esc(stationed.name)}" maxlength="40" ${editable?'':'readonly'}></label><label class="garden-army-name">${ct('commander')}<input data-commander-name="${stationed.id}" aria-label="${ct('commander')}" value="${esc(c.name)}" maxlength="40" ${editable?'':'readonly'}></label>${own?`<details class="garden-identity-tools"><summary>${ct('editIdentity')}</summary><button data-action="suggestName" data-army="${stationed.id}" ${editable?'':'disabled'}>${ct('suggestName')}</button></details>`:''}${stationed.mutations.map(k=>`<p title="${esc(ct(k+'Desc'))}">${ct(k)}</p>`).join('')}${own?`<label class="garden-retreat-check"><input type="checkbox" data-retreat-policy ${editable?'':'disabled'} ${stationed.retreatAllowed?'checked':''}>${ct('authorizeRetreat')}</label><label class="garden-muted">${ct('retreatDestination')}<select data-retreat-target ${editable?'':'disabled'}><option value="">${ct('automaticDestination')}</option>${targets.map(id=>`<option value="${id}" ${stationed.retreatTarget===id?'selected':''}>${esc(this.label(m.node(id)))}</option>`).join('')}</select></label><p class="garden-muted">${ct('lossWarning')}</p>`:''}<details><summary>${ct('armyHistory')}</summary>${stationed.history.slice().reverse().map(e=>`<p>${ct('turn')} ${e.turn} · ${ct(e.key)}</p>`).join('')}</details></section>`;
            }else if(isVisible&&m.isDefended(n))html+=`<p>${ct(n.type==='capital'?'defense':'local')}</p>`;
            const observed=isVisible?m.actorAt(n.id):known?.actor;
            if(observed)html+=`<div class="garden-threat-detail"><strong>${esc(faction(observed.faction))} · ${ct(observed.kind)}</strong><p>${ct('actorForce')}: ${Math.ceil(observed.force)}${observed.maxForce?' / '+observed.maxForce:''}</p>${observed.intent!==null&&observed.intent!==undefined?`<p>${ct('intent')}: ${esc(this.label(m.node(observed.intent)))}</p>`:''}</div>`;
            const effects=isVisible?d.effects.filter(e=>e.territory===n.id).map(e=>e.kind):(known?.effects||[]);
            if(effects.length)html+=`<p>${ct('conditions')}: ${[...new Set(effects)].map(k=>ct(k)).join(' · ')}</p>`;
        }else html+=`<p>${ct('select')}</p>`;
        html+=d.weather.map(w=>`<p class="garden-weather">${ct(d.turn<w.start?'weatherWarning':'weatherActive')} · ${ct(w.region)} · ${ct('until')} ${w.end-1}</p>`).join('');
        html+=`<details class="garden-colony"><summary>${ct('upgrades')}</summary><button data-action="recruit" ${!m.allowed(d.playerFaction)||m.actorAt(f.capital)||f.points<m.recruitCost(d.playerFaction)?'disabled':''}>${ct('recruit')} · ${m.recruitCost(d.playerFaction)}</button>`;
        for(const k of UPGRADES){const rank=f.upgrades[k],cost=RULES.upgradeCosts[rank];html+=`<div class="garden-upgrade"><div><strong>${ct(k)} ${rank}/2</strong><small>${ct(k+'Desc')}</small></div><button data-action="upgrade" data-key="${k}" ${!m.allowed(d.playerFaction)||cost===undefined||f.points<cost?'disabled':''}>${cost??ct('max')}</button></div>`;}
        html+=`</details><details class="garden-events"><summary>${ct('fallen')}</summary>${d.lostArmies.filter(a=>a.faction===d.playerFaction).map(a=>`<details><summary>${esc(a.name)}</summary><p>${ct('commander')}: ${esc(a.commander.name)}</p><p>${ct('victories')}: ${a.battleVictories} · ${ct('turn')} ${a.lostTurn}</p><p>${ct(a.reason)}</p></details>`).join('')}</details><details class="garden-events"><summary>${ct('chronicle')}</summary>${d.events.filter(e=>e.visibleTo.includes(d.playerFaction)).slice(-7).reverse().map((e,i)=>`<button data-action="event" data-target="${e.territory??''}">${ct('turn')} ${e.turn} · ${ct(e.key)}</button>`).join('')||`<p>${ct('noEvents')}</p>`}</details><button data-action="new" class="garden-text-button">${ct('new')}</button>`;
        return html;
    }
    showDialog(html){this.dialog.innerHTML=html;if(!this.dialog.open)this.dialog.showModal();}
    encounter(){
        const m=this.core.state.model,e=m.data.pending,own=e.participants.some(p=>p.faction===m.data.playerFaction);
        if(!own)return;
        if(e.status==='resolving'){
            const step=e.combat?.step||0,joined=e.combat?.fighters.filter(p=>p.status!=='waiting')||e.participants.filter(p=>p.enterAt===0);
            this.showDialog(`<span class="garden-eyebrow">${ct('autoMode')}</span><h2>${ct('resolving')}</h2><p>${esc(this.label(m.node(e.territory)))}</p><progress max="24" value="${step}" aria-label="${ct('steps')}"></progress><p>${ct(e.combat?.phase||'approach')}</p>${joined.map(p=>`<p>${esc(faction(p.faction))}${p.remaining!==undefined?' · '+Math.ceil(p.remaining):''}</p>`).join('')}<button data-action="menu">${ct('menu')}</button>`);
        }else if(e.attacker===m.data.playerFaction){
            const predict=m.prediction(),p=e.participants[0];
            this.showDialog(`<span class="garden-eyebrow">${ct('autoMode')}</span><h2>${esc(this.label(m.node(e.territory)))}</h2><div class="garden-versus"><div>${Math.round(predict.attack*100)}<small>${ct('own')}</small></div><div>${Math.round(predict.defense*100)}<small>${esc(faction(e.defender))}</small></div></div><p>${ct('knownAdvantage')}: ${predict.winner?ct(predict.winner==='attacker'?'win':'loss'):ct('balanced')}</p><p class="garden-muted">${ct('uncertainForecast')}</p>${predict.knownIntruders.map(p=>`<p>${ct('observedRisk')}: ${esc(faction(p.faction))} · ${Math.ceil(p.force)}</p>`).join('')}<p>${p.retreatAllowed?ct('retreat'):ct('noRetreat')} · ${p.retreatTarget===null?ct('noRetreat'):esc(this.label(m.node(p.retreatTarget)))}</p><button data-action="auto" class="garden-primary">${ct('resolveBattle')}</button><p class="garden-muted">${ct('autoCost')}</p>${!e.consumable?m.faction(m.data.playerFaction).consumables.map(c=>`<button data-action="consume" data-id="${c.id}">${ct('use')} · ${ct('consumable')}</button>`).join(''):''}<button data-action="menu">${ct('menu')}</button>`);
        }
        this.dialog.oncancel=event=>{event.preventDefault();this.dialog.close();this.core.ui.setGameState('MENU');};
    }
    result(){
        const r=this.core.state.data.lastResult,won=r.winnerFaction===this.core.state.data.playerFaction;
        this.showDialog(`<span class="garden-eyebrow">${ct('battleSummary')}</span><h2>${r.winnerId?ct(won?'battleVictory':'battleResult'):ct('draw')}</h2><p>${esc(this.label(this.core.state.model.node(r.territory)))}</p>${r.participants.map(p=>`<div class="garden-result-row"><strong>${esc(p.armyId?(r.participantNames.find(x=>x.id===p.id)?.name||faction(p.faction)):p.actorId?faction(p.faction):ct('local'))}</strong><span>${ct(p.status==='victory'?'battleVictory':p.status)} · ${ct('remainingForce')}: ${Math.ceil(p.remaining)} / ${Math.round(p.initial)}</span></div>`).join('')}${r.changes.map(c=>`<p>${ct(c.key)}${c.army?' · '+esc(c.army):''}${c.value?' · +'+c.value:''}</p>`).join('')}<details><summary>${ct('combatDetails')}</summary>${r.participants.map(p=>`<p><strong>${esc(faction(p.faction))}</strong> · ${ct('damageDealt')} ${p.damageDealt.toFixed(1)} · ${ct('damageTaken')} ${p.damageTaken.toFixed(1)}</p>${Object.entries(p.factorTotals||{}).map(([key,value])=>`<p class="garden-muted">${['mutantes','termitas','avispas','arañas','escarabajos'].includes(key)?esc(faction(key)):ct(key)}: ${value>0?'+':''}${value.toFixed(1)}</p>`).join('')}`).join('')}${r.trace.map(t=>`<p>${t.step} · ${ct(t.key)}${t.faction?' · '+esc(faction(t.faction)):''}</p>`).join('')}${Object.entries(r.conditions).filter(([,v])=>v).map(([k])=>`<p>${ct(k)}</p>`).join('')}</details><button data-action="ack" class="garden-primary">${ct('continue')}</button>`);
        this.dialog.oncancel=event=>{event.preventDefault();this.dialog.close();this.core.perform('ack');};
    }
    threatsMarkup(m,visible){
        return m.data.actors.filter(a=>a.active&&visible.has(a.territory)).map(a=>{const n=m.node(a.territory),large=a.large;
            return `<g data-node="${n.id}" data-map-marker="threat" data-x="${n.x}" data-y="${n.y}" class="garden-threat ${a.kind}" role="button" aria-label="${esc(faction(a.faction)+' · '+ct(a.kind))}"><circle r="22" fill="transparent"/><path d="${a.kind==='enclave'?'M-13 -8L0 -16L13 -8V8L0 16L-13 8Z':large?'M0 -18L17 13H-17Z':'M0 -13L13 0L0 13L-13 0Z'}" fill="${color(a.faction)}"/><text y="5">${a.kind==='enclave'?'⬡':a.faction==='avispas'?'⋈':large?'!':'×'}</text></g>`;
        }).join('');
    }
    effectsMarkup(m,visible){
        const effects=m.data.effects.filter(e=>visible.has(e.territory));
        const areas=effects.map(e=>{const n=m.node(e.territory),fill={toxic:'#9364a2',web:'#ddd2bc',mud:'#718f9c'}[e.kind];return `<polygon points="${n.polygon.map(p=>p.join(',')).join(' ')}" fill="${fill}" opacity=".15" stroke="${fill}" stroke-dasharray="3 4"/>`;}).join('');
        const tunnels=m.data.tunnels.filter(e=>m.data.actors.some(a=>a.id===e.enclave&&a.active)&&visible.has(e.from)&&visible.has(e.to)).map(e=>{const a=m.node(e.from),b=m.node(e.to);return `<path d="M${a.x} ${a.y}L${b.x} ${b.y}" stroke="#f5d9c4" stroke-width="3" stroke-dasharray="2 5"/>`;}).join('');
        const flooded=m.data.weather.filter(w=>m.data.turn>=w.start&&m.data.turn<w.end).flatMap(w=>w.edges).map(e=>{const a=m.node(e.from),b=m.node(e.to),x=(a.x+b.x)/2,y=(a.y+b.y)/2;return `<path d="M${x-5} ${y-5}l10 10m-10 0l10 -10" stroke="#dee5e7" stroke-width="2"/>`;}).join('');
        return areas+tunnels+flooded;
    }
    reward(){
        const d=this.core.state.data,r=d.reward,a=d.armies.find(a=>a.id===r.army);if(!a){d.reward=null;return;}
        this.showDialog(`<span class="garden-eyebrow">${ct('epic')}</span><h2>${ct('choose')}</h2>${r.options.filter(k=>!a.mutations.includes(k)).map(k=>`<div class="garden-mutation"><h3>${ct(k)}</h3><p>${ct(k+'Desc')}</p>${a.mutations.length<3?`<button data-action="mutation" data-key="${k}">${ct('choose')}</button>`:a.mutations.map((old,i)=>`<button data-action="mutation" data-key="${k}" data-replace="${i}">${ct('replace')} ${ct(old)}</button>`).join('')}</div>`).join('')}<button data-action="discard">${ct('discard')}</button>`);
        this.dialog.oncancel=e=>e.preventDefault();
    }
    finished(){const d=this.core.state.data;this.showDialog(`<span class="garden-eyebrow">${ct('campaign')}</span><h2>${ct(d.winner===d.playerFaction?'victory':'defeat')}</h2><p>${ct(d.victory)}</p><button data-action="new">${ct('new')}</button><button data-action="menu">${ct('menu')}</button>`);this.dialog.oncancel=e=>e.preventDefault();}
    notice(message){const e=this.root.querySelector('#gardenNotice');e.textContent=message;if(this.core.state.issue==='saveError')e.innerHTML=`${esc(message)} <button data-action="retry">${ct('retry')}</button>`;}
    action(action,data={}){
        const c=this.core,m=c.state.model;
        if(this.observer.action(action,data))return;
        if(action==='controls'){this.controlsOpen=!this.controlsOpen;if(!this.controlsOpen)this.panelOpen=false;this.render();return;}
        if(action==='menu'){this.dialog.close();c.ui.setGameState('MENU');return;}
        if(action==='chooseStackArmy'){this.armyId=data.army;this.render();return;}
        if(action==='select'||action==='chooseArmy'){this.select(Number(data.target));return;}
        if(action==='cancelPlan'){c.perform('planMove',{army:data.army,target:Number(data.target)});return;}
        if(action==='armyList'){this.armyId=null;this.selected=null;this.panelOpen=true;this.controlsOpen=true;this.render();this.panel.scrollTop=0;return;}
        if(action==='in'||action==='out'){this.zoom(action==='in'?0.8:1.25);return;}
        if(action==='fit'){this.cameraMode='overview';this.applyView();return;}
        if(action==='panel'){this.panelOpen=!this.panelOpen;this.render();return;}
        if(action==='next'){this.next();return;}
        if(action==='fast'){this.fast=!this.fast;this.observer.holdUntil=0;this.root.querySelector('[data-action=fast]').setAttribute('aria-pressed',String(this.fast));this.observer.render(m);c.schedule();return;}
        if(action==='event'){if(data.target!=='')this.focus(Number(data.target));return;}
        if(action==='new'){this.showDialog(`<h2>${ct('new')}</h2><p>${ct('confirmNew')}</p><button data-action="newConfirm">${ct('confirm')}</button><button data-action="close">${ct('cancel')}</button>`);this.dialog.oncancel=()=>{};return;}
        if(action==='newConfirm'){this.dialog.close();c.ui.setGameState('FACTIONS');return;}
        if(action==='close'){this.dialog.close();return;}
        if(action==='end'&&!m.data.plannedMoves.length&&m.data.armies.some(a=>a.faction===m.data.playerFaction&&a.ready)){
            this.showDialog(`<h2>${ct('confirmEnd')}</h2><button data-action="endConfirm">${ct('confirm')}</button><button data-action="close">${ct('cancel')}</button>`);this.dialog.oncancel=()=>{};return;
        }
        this.dialog.close();c.perform(action,data);
    }
}
