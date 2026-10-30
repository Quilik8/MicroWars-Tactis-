import { ensureBalaRoutes } from './start_profiles.js';
import { BASE_FACTIONS, RULES, random } from './rules.js';
// Authored macro geography; seeds change encounters, never the garden silhouette.
export const REGIONS = [
    { id: 'sand', x: 150, y: 150, color: '#b69b65', name: 'Arenero' },
    { id: 'grass', x: 480, y: 130, color: '#657844', name: 'Césped' },
    { id: 'leaves', x: 870, y: 150, color: '#88724b', name: 'Hojarasca' },
    { id: 'roots', x: 230, y: 470, color: '#756c4d', name: 'Raíces' },
    { id: 'asphalt', x: 730, y: 440, color: '#777c6d', name: 'Asfalto' },
    { id: 'pond', x: 890, y: 660, color: '#6d815b', name: 'Orilla del charco' },
    { id: 'picnic', x: 540, y: 660, color: '#a38b66', name: 'Mantel del picnic' }
];
const STARTS = [[65,65], [95,640], [1000,160], [1020,695], [610,100], [580,380]];
export const CAPITAL_CONNECTIONS = {carpinteras:1,negras:2,tejedoras:2,cortadoras:2,fuego:3,bala:5};
function puddle(id,cx,cy,rx,ry,phase){
    const polygon=Array.from({length:40},(_,i)=>{
        const a=i*Math.PI*2/40,shape=1+Math.sin(a*3+phase)*0.09+Math.cos(a*5-phase)*0.055;
        return [cx+Math.cos(a)*rx*shape,cy+Math.sin(a)*ry*shape];
    });
    return {id,cx,cy,polygon};
}
export const WATER_BODIES=[puddle('rain-pool',365,245,108,62,.6),puddle('root-pool',460,455,58,83,1.8),puddle('pond',855,620,115,91,2.6)];
export function inWater(x,y,buffer=0){
    return WATER_BODIES.some(w=>{
        let inside=false;
        for(let i=0,j=w.polygon.length-1;i<w.polygon.length;j=i++){
            const a=w.polygon[i],b=w.polygon[j];
            if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
            if(buffer){const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)));if(Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy)<buffer)return true;}
        }
        return inside;
    });
}
export function crossesWater(a,b){
    const steps=Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/2);
    for(let i=0;i<=steps;i++)if(inWater(a.x+(b.x-a.x)*i/steps,a.y+(b.y-a.y)*i/steps,2))return true;
    return false;
}
export function hasUsableLandBorder(a,b){
    const shared=a.polygon.filter(p=>b.polygon.some(q=>Math.hypot(p[0]-q[0],p[1]-q[1])<.1));
    if(shared.length<2)return false;
    const pairs=shared.flatMap((p,i)=>shared.slice(i+1).map(q=>[p,q])).sort((a,b)=>Math.hypot(...[b[0][0]-b[1][0],b[0][1]-b[1][1]])-Math.hypot(...[a[0][0]-a[1][0],a[0][1]-a[1][1]]));
    const [p,q]=pairs[0].sort((a,b)=>a[0]-b[0]||a[1]-b[1]),length=Math.hypot(p[0]-q[0],p[1]-q[1]);
    if(length<5)return false;
    let dryRun=0;
    const steps=Math.ceil(length);
    for(let i=0;i<=steps;i++){
        if(!inWater(p[0]+(q[0]-p[0])*i/steps,p[1]+(q[1]-p[1])*i/steps,2))dryRun+=length/steps;
        else dryRun=0;
        if(dryRun>=5)return true;
    }
    return false;
}
function connected(nodes,excluded=new Set()){
    const start=nodes.find(n=>!excluded.has(n.id));if(!start)return true;
    const seen=new Set([start.id]),queue=[start.id];
    for(let i=0;i<queue.length;i++)for(const id of nodes[queue[i]].neighbors)if(!excluded.has(id)&&!seen.has(id)){seen.add(id);queue.push(id);}
    return seen.size===nodes.length-excluded.size;
}
function openLandConnected(nodes,extra=[]){return connected(nodes,new Set([...nodes.filter(n=>n.type==='capital').map(n=>n.id),...extra]));}
function removeRoute(nodes,a,b){nodes[a].neighbors=nodes[a].neighbors.filter(id=>id!==b);nodes[b].neighbors=nodes[b].neighbors.filter(id=>id!==a);}
function removeIfSafe(nodes,a,b){
    removeRoute(nodes,a,b);
    if(connected(nodes)&&openLandConnected(nodes))return true;
    nodes[a].neighbors.push(b);nodes[b].neighbors.push(a);return false;
}
const DOMAIN = [[20,20],[960,20],[1080,100],[1090,610],[1010,770],[130,780],[15,650]];
function clip(poly, a, b, c) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
        const p = poly[i], q = poly[(i+1)%poly.length];
        const u = a*p[0]+b*p[1]-c, v = a*q[0]+b*q[1]-c;
        if (u <= 0.00001) out.push(p);
        if ((u < 0) !== (v < 0)) {
            const t = u/(u-v); out.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]);
        }
    }
    return out;
}
export class MapLogic {
    generateMap(seed = 1, count = RULES.territories) {
        if (!Number.isInteger(count) || count < 40 || count > 500) throw new Error('Invalid atlas size');
        // Land-only sites: water occupies real space rather than painted territory.
        let candidates=[];
        for(let density=1.35;candidates.length<count;density+=.15){
            const cols=Math.ceil(Math.sqrt(count*1.4*density)),rows=Math.ceil(count*density/cols);
            candidates=[];
            for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
                const site=row*cols+col;
                const x=55+(col+random('geography',site*2)*.65)*955/cols;
                const y=55+(row+random('geography',site*2+1)*.65)*650/rows;
                if(!inWater(x,y,10))candidates.push({x,y});
            }
        }
        const nodes=Array.from({length:count},(_,id)=>{
            const {x,y}=candidates[Math.floor(id*candidates.length/count)];
            const region=REGIONS.reduce((a,b)=>Math.hypot(x-a.x,y-a.y)<Math.hypot(x-b.x,y-b.y)?a:b);
            return {id,x,y,region:region.id,type:'ordinary',owner:'neutral',
                defended:random(seed,`encounter${id}`)<.22,cleared:false,
                template:`${region.id}-${id%4}`,neighbors:[],polygon:[],name:`${region.name} · ${id+1}`};
        });
        const edges = new Map(), connections = [];
        for (const n of nodes) {
            let poly = DOMAIN.map(p=>[...p]);
            for (const o of nodes) {
                if(n===o)continue;
                poly=clip(poly,o.x-n.x,o.y-n.y,(o.x**2+o.y**2-n.x**2-n.y**2)/2);
                if(!poly.length)break;
            }
            n.polygon=poly;
            for(let i=0;i<poly.length;i++) {
                const p=poly[i],q=poly[(i+1)%poly.length];
                if(Math.hypot(p[0]-q[0],p[1]-q[1])<0.01)continue;
                const key=[p,q].map(v=>v.map(c=>c.toFixed(2)).join(',')).sort().join('|');
                if(edges.has(key)) {
                    const o=nodes[edges.get(key)]; n.neighbors.push(o.id);o.neighbors.push(n.id);
                    connections.push({from:n.id,to:o.id});
                } else edges.set(key,n.id);
            }
        }
        // A shared border is necessary, but never sufficient to cross a puddle.
        const blockedEdges=[];
        for(const e of connections)if(crossesWater(nodes[e.from],nodes[e.to])||!hasUsableLandBorder(nodes[e.from],nodes[e.to])){
            removeRoute(nodes,e.from,e.to);blockedEdges.push({...e,reason:'water'});
        }
        if(!connected(nodes))throw new Error(`Water disconnected atlas ${count}`);
        const reserved=new Set();
        STARTS.forEach(([x,y],i)=>{
            const faction=BASE_FACTIONS[i],degree=CAPITAL_CONNECTIONS[faction];
            const eligible=nodes.filter(n=>!reserved.has(n.id)&&n.neighbors.length>=degree&&openLandConnected(nodes,[n.id]));
            const n=eligible.sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))[0];
            if(!n)throw new Error(`No valid capital for ${faction}`);
            reserved.add(n.id);n.type='capital';n.capitalOf=faction;n.owner=faction;n.defended=true;
        });
        const picnic=nodes.filter(n=>!reserved.has(n.id)).sort((a,b)=>Math.hypot(a.x-580,a.y-610)-Math.hypot(b.x-580,b.y-610))[0];
        picnic.type='picnic';picnic.defended=true;picnic.name='El Gran Picnic';
        // Distinct starting exposure, with no extra long-distance links.
        for(const n of nodes.filter(n=>n.type==='capital')){
            const goal=CAPITAL_CONNECTIONS[n.capitalOf];
            for(const id of [...n.neighbors].sort((a,b)=>Math.hypot(nodes[b].x-n.x,nodes[b].y-n.y)-Math.hypot(nodes[a].x-n.x,nodes[a].y-n.y))){
                if(n.neighbors.length<=goal)break;
                if(nodes[id].type!=='capital'&&removeIfSafe(nodes,n.id,id))blockedEdges.push({from:n.id,to:id,reason:'nest'});
            }
            if(n.neighbors.length!==goal)throw new Error(`Capital connection mismatch: ${n.capitalOf}`);
        }
        // Two land crossings per regional border. Connectivity checks forbid islands.
        const regionalEdges=new Map();
        for(const e of connections){
            const a=nodes[e.from],b=nodes[e.to];
            if(!a.neighbors.includes(b.id)||a.region===b.region)continue;
            const key=[a.region,b.region].sort().join(':');
            if(!regionalEdges.has(key))regionalEdges.set(key,[]);
            regionalEdges.get(key).push(e);
        }
        const protectedEdges=new Set();
        for(const group of regionalEdges.values()){
            group.sort((a,b)=>(nodes[a.from].x+nodes[a.to].x+nodes[a.from].y+nodes[a.to].y)-(nodes[b.from].x+nodes[b.to].x+nodes[b.from].y+nodes[b.to].y));
            for(let i=0;i<group.length;i++){
                const e=group[i],a=nodes[e.from],b=nodes[e.to];
                const retain=i===0||i===group.length-1||a.type==='capital'||b.type==='capital';
                if(!retain&&removeIfSafe(nodes,a.id,b.id)){blockedEdges.push({...e,reason:'region'});continue;}
                protectedEdges.add([a.id,b.id].sort((x,y)=>x-y).join(':'));
                if(a.type==='ordinary'){a.type='pass';a.defended=true;}
            }
        }
        // Reduce mesh shortcuts while retaining local alternatives and key crossings.
        for(const e of [...connections].sort((a,b)=>{
            const length=e=>Math.hypot(nodes[e.from].x-nodes[e.to].x,nodes[e.from].y-nodes[e.to].y);
            return length(b)-length(a);
        })){
            const a=nodes[e.from],b=nodes[e.to];
            if(!a.neighbors.includes(b.id)||a.type==='capital'||b.type==='capital')continue;
            if(protectedEdges.has([a.id,b.id].sort((x,y)=>x-y).join(':')))continue;
            if((a.neighbors.length>3&&b.neighbors.length>2)||(b.neighbors.length>3&&a.neighbors.length>2)){
                if(removeIfSafe(nodes,a.id,b.id))blockedEdges.push({...e,reason:'terrain'});
            }
        }
        for(const n of nodes){
            n.neighbors.sort((a,b)=>a-b);
            if(n.type==='ordinary'&&(n.neighbors.length===1||random(seed,`epic${n.id}`)<.025)){n.type='epic';n.defended=true;}
            n.role=n.type!=='ordinary'?n.type:n.neighbors.length===2?'corridor':n.neighbors.length>=4?'junction':'frontier';
        }
        return ensureBalaRoutes({nodes,connections:connections.filter(e=>nodes[e.from].neighbors.includes(e.to)),blockedEdges,
            water:WATER_BODIES,regions:REGIONS,picnic:picnic.id},(a,b)=>hasUsableLandBorder(a,b)&&!crossesWater(a,b));
    }
}

export function auditAtlas(map){
    const errors=[],degrees=map.nodes.map(n=>n.neighbors.length),lengths=[];
    for(const n of map.nodes){
        if(inWater(n.x,n.y))errors.push(`Territory ${n.id} in water`);
        for(const id of n.neighbors){
            const other=map.nodes[id];
            if(!other||!other.neighbors.includes(n.id)){errors.push(`Asymmetric ${n.id}:${id}`);continue;}
            if(crossesWater(n,other))errors.push(`Water shortcut ${n.id}:${id}`);
            const shared=n.polygon.filter(p=>other.polygon.some(q=>Math.hypot(p[0]-q[0],p[1]-q[1])<.1));
            if(shared.length<2)errors.push(`Non-border jump ${n.id}:${id}`);
            else if(!hasUsableLandBorder(n,other))errors.push(`Unusable land border ${n.id}:${id}`);
            if(id>n.id)lengths.push(Math.hypot(n.x-other.x,n.y-other.y));
        }
    }
    if(!connected(map.nodes))errors.push('Disconnected garden');
    if(!openLandConnected(map.nodes))errors.push('Land route depends on a capital');
    const capitals=Object.fromEntries(map.nodes.filter(n=>n.capitalOf).map(n=>[n.capitalOf,n.neighbors.length]));
    for(const [f,degree]of Object.entries(CAPITAL_CONNECTIONS))if(capitals[f]!==degree)errors.push(`Unexpected exposure ${f}`);
    return {territories:map.nodes.length,waterBodies:map.water.length,connections:map.connections.length,
        averageConnections:degrees.reduce((a,b)=>a+b,0)/degrees.length,maxConnections:Math.max(...degrees),
        longestConnection:Math.max(...lengths),capitals,errors};
}
