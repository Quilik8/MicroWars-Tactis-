import { BASE_FACTIONS, START_PROFILES } from './rules.js';

// Minimum-cost five vertex-disjoint approaches. Reopen only real, dry shared borders.
export function ensureBalaRoutes(map,canOpen=()=>true){
 const nodes=map.nodes,source=nodes.find(n=>n.capitalOf==='bala'),sink=nodes.length*2,N=sink+1;
 const graph=Array.from({length:N},()=>[]),land=[];
 function edge(a,b,cap,cost,meta=null){const f={to:b,rev:graph[b].length,cap,original:cap,cost,meta},r={to:a,rev:graph[a].length,cap:0,original:0,cost:-cost};graph[a].push(f);graph[b].push(r);if(meta)land.push({from:a,...meta,edge:f});}
 for(const n of nodes){edge(n.id*2,n.id*2+1,n.id===source.id?5:1,0);if(n.capitalOf&&n.id!==source.id)edge(n.id*2+1,sink,1,0);}
 const pairs=new Map();
 for(const e of map.connections)pairs.set([e.from,e.to].sort((a,b)=>a-b).join(':'),{...e,blocked:false});
 for(const e of map.blockedEdges)if(e.reason!=='water'&&!nodes[e.from].capitalOf&&!nodes[e.to].capitalOf&&canOpen(nodes[e.from],nodes[e.to]))pairs.set([e.from,e.to].sort((a,b)=>a-b).join(':'),{...e,blocked:true});
 for(const e of pairs.values()){
  if(e.from===map.picnic||e.to===map.picnic)continue;
  const cost=1+(e.blocked?1000:0)+Math.hypot(nodes[e.from].x-nodes[e.to].x,nodes[e.from].y-nodes[e.to].y)/10000;
  edge(e.from*2+1,e.to*2,1,cost,{a:e.from,b:e.to,blocked:e.blocked});edge(e.to*2+1,e.from*2,1,cost,{a:e.to,b:e.from,blocked:e.blocked});
 }
 let flow=0;
 while(flow<5){
  const distance=Array(N).fill(Infinity),prev=Array(N),queue=[source.id*2],queued=new Set(queue);distance[queue[0]]=0;
  for(let i=0;i<queue.length;i++){
   const u=queue[i];queued.delete(u);
   graph[u].forEach((e,j)=>{if(e.cap&&distance[e.to]>distance[u]+e.cost+1e-8){distance[e.to]=distance[u]+e.cost;prev[e.to]=[u,j];if(!queued.has(e.to)){queued.add(e.to);queue.push(e.to);}}});
  }
  if(!prev[sink])break;
  for(let v=sink;v!==source.id*2;){const [u,j]=prev[v],e=graph[u][j];e.cap--;graph[v][e.rev].cap++;v=u;}flow++;
 }
 if(flow<5&&nodes.length>=300)throw new Error('Five independent Bala approaches unavailable');
 const used=land.filter(e=>e.edge.original>e.edge.cap),paths=[];
 for(const first of used.filter(e=>e.a===source.id)){
  const path=[source.id,first.b],seen=new Set(path);let at=first.b;
  while(!nodes[at].capitalOf){const next=used.find(e=>e.a===at&&!seen.has(e.b));if(!next)break;at=next.b;seen.add(at);path.push(at);}
  if(nodes[at].capitalOf&&at!==source.id)paths.push({faction:nodes[at].capitalOf,path});
 }
 const opened=new Set();
 for(const e of used.filter(e=>e.blocked)){
  const key=[e.a,e.b].sort((a,b)=>a-b).join(':');if(opened.has(key))continue;opened.add(key);
  nodes[e.a].neighbors.push(e.b);nodes[e.b].neighbors.push(e.a);map.connections.push({from:Math.min(e.a,e.b),to:Math.max(e.a,e.b)});
 }
 map.blockedEdges=map.blockedEdges.filter(e=>!opened.has([e.from,e.to].sort((a,b)=>a-b).join(':')));
 for(const n of nodes){n.neighbors=[...new Set(n.neighbors)].sort((a,b)=>a-b);if(n.type==='ordinary')n.role=n.neighbors.length===2?'corridor':n.neighbors.length>=4?'junction':'frontier';}
 map.approaches=paths;map.openedApproaches=opened.size;
 return map;
}
export function applyStarts(data){
 const nodes=data.nodes,bala=nodes.find(n=>n.capitalOf==='bala'),paths=data.approaches;
 const fallback=(capital)=>{const q=[[capital]],seen=new Set([capital]);for(const path of q){if(path.at(-1)===bala.id)return path;for(const id of nodes[path.at(-1)].neighbors)if(!seen.has(id)&&!nodes[id].capitalOf){seen.add(id);q.push([...path,id]);}}return[capital];};
 for(const id of BASE_FACTIONS){
  const cap=nodes.find(n=>n.capitalOf===id),profile=START_PROFILES[id];
  const route=id==='bala'?[cap.id]:(paths.find(p=>p.faction===id)?.path.slice().reverse()||fallback(cap.id));
  // Last cell belongs to Bala; all other cells create a connected starting region.
  const own=route.filter(n=>n!==bala.id||id==='bala');
  for(const i of own){nodes[i].owner=id;nodes[i].cleared=true;}
  const position=own[Math.min(own.length-1,Math.max(1,Math.floor((own.length-1)*profile.advance)))];
  data.factions[id]={id,capital:cap.id,alive:true,points:profile.points,upgrades:{incubation:0,training:0,reserve:0},
   claimed:[...own],epicClaimed:[],consumables:[],incomeTurn:1,profile:{...profile,route:own,forward:position}};
 }
 // Give Bala one adjacent escape pocket while preserving all five distinct approaches.
 const pocket=paths.find(p=>p.path.length>3)?.path[1];
 if(pocket!==undefined){
  const former=nodes[pocket].owner,route=data.factions[former]?.profile.route;
  // Removing the terminal cell of a corridor cannot disconnect its home region.
  if(route?.at(-1)===pocket){route.pop();data.factions[former].claimed=data.factions[former].claimed.filter(id=>id!==pocket);
   if(data.factions[former].profile.forward===pocket)data.factions[former].profile.forward=route.at(-1);
   nodes[pocket].owner='bala';nodes[pocket].cleared=true;data.factions.bala.claimed.push(pocket);data.factions.bala.profile.route.push(pocket);}
 }
 for(const n of nodes){n.conquestReward=1;if(n.region==='pond'&&n.owner==='neutral')n.conquestReward=n.defended?3:0;}
}
