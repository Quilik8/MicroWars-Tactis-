import { crossesBarrier } from './rts_forecast.js';
const cache = new WeakMap();
export function productionValue(view,node,faction) {
    if (node.type === 'tunel') return 0;
    const growth = node.type === 'enjambre' ? view.modifiers?.[faction]?.generation || 1 : 1;
    return growth / Math.max(.1,node.regenInterval || 1) * (node.evolution === 'tanque' ? 2 : 1);
}
export function regionsFor(view) {
    if (view.regionalCache) return view.regionalCache;
    const key = view.nodes.map(n => n.isMobile ? 'mobile' : `${n.x},${n.y}`).join(';') + JSON.stringify(view.barriers);
    const old = cache.get(view.nodes);
    if (old?.key === key) { view.regionalCache = old; return old; }
    const adjacency = view.nodes.map((a,i) => a.isMobile ? [] : view.nodes.flatMap((b,j) => i !== j && !b.isMobile
        && !crossesBarrier(a,b,view.barriers,view.game) ? [j] : []));
    const region = view.nodes.map(() => -1), discovered = [], low = [], articulation = new Set();
    let clock = 0, count = 0;
    function visit(i,parent,component) {
        region[i] = component; discovered[i] = low[i] = ++clock;
        let children = 0;
        for (const j of adjacency[i]) {
            if (!discovered[j]) { children++; visit(j,i,component); low[i] = Math.min(low[i],low[j]);
                if (parent >= 0 && low[j] >= discovered[i]) articulation.add(i);
            } else if (j !== parent) low[i] = Math.min(low[i],discovered[j]);
        }
        if (parent < 0 && children > 1) articulation.add(i);
    }
    for (let i=0;i<view.nodes.length;i++) if (!view.nodes[i].isMobile && !discovered[i]) visit(i,-1,count++);
    const result = { key, adjacency, region, articulation, count }; cache.set(view.nodes,result); view.regionalCache = result; return result;
}
export function positionalValue(view, source, target, faction) {
    const graph = regionsFor(view), node = view.nodes[target];
    let value = graph.articulation.has(target) ? 45 : 0;
    const exit = view.nodes.indexOf(node.tunnelTo);
    if (node.type === 'tunel' && exit >= 0 && graph.region[target] !== graph.region[exit]) value += 100;
    if (node.owner === 'neutral' && graph.region[source] === graph.region[target]) {
        let localOwned = 0;
        for (let i=0;i<view.nodes.length;i++) if (view.nodes[i].owner === faction && graph.region[i] === graph.region[source]) localOwned++;
        if (localOwned < 3) value += 25 * productionValue(view,node,faction);
    }
    return value;
}
