import { gameStorage } from '../platform/storage.js';
import { CampaignModel } from './campaign_model.js';
import { RULES, BASE_FACTIONS } from './rules.js';
import { auditAtlas } from './atlas.js';
export class StateManager {
    constructor() { this.model = null; this.issue = null; }
    get data() { return this.model?.data; }
    load() {
        try {
            const raw = gameStorage.getItem('microwars_campaign');
            if (!raw) return false;
            const data = JSON.parse(raw);
            if (data.version !== RULES.version) {
                const key=`microwars_campaign_backup_v${data.version||'unknown'}`;
                if(!gameStorage.getItem(key))gameStorage.setItem(key,raw);
                this.issue = 'legacy'; return false;
            }
            if (!Array.isArray(data.nodes) || !Array.isArray(data.armies) || !BASE_FACTIONS.includes(data.playerFaction)
                || data.mode!=='strategic_auto' || !Array.isArray(data.commanders) || !Array.isArray(data.actors)
                || !Array.isArray(data.lostArmies) || !data.usedNames || !data.usedCommanderNames || !data.recruitmentCounters
                || !Array.isArray(data.weather) || !Array.isArray(data.tunnels) || !Array.isArray(data.effects) || !Array.isArray(data.scheduledWaves)
                || (data.plannedMoves!==undefined&&(!Array.isArray(data.plannedMoves)||data.plannedMoves.some(o=>!data.nodes[o.target]||!data.armies.some(a=>a.id===o.armyId))))
                || !data.factions || !Array.isArray(data.aiQueue) || !Number.isInteger(data.turn)
                || !Array.isArray(data.regions) || !Array.isArray(data.events) || !Array.isArray(data.completedTemplates)
                || !['player','rivals','finished'].includes(data.phase)
                || BASE_FACTIONS.some(id => !data.factions[id] || !data.factions[id].upgrades
                    || !Number.isFinite(data.factions[id].points) || !Array.isArray(data.factions[id].claimed)
                    || !Array.isArray(data.factions[id].consumables))
                || data.armies.some(a => !BASE_FACTIONS.includes(a.faction) || !data.nodes[a.territory]
                    || !Number.isFinite(a.battleVictories) || !Number.isFinite(a.trainingLevel) || !Array.isArray(a.history) || !data.commanders.some(c=>c.id===a.commanderId&&c.armyId===a.id) || !Array.isArray(a.mutations))
                || data.actors.some(a=>!data.nodes[a.territory]||!Number.isFinite(a.force)||!Number.isFinite(a.maxForce))
                || data.aiQueue.some(q=>!['faction','threat','events','roundEnd'].includes(q.kind))
                || data.nodes.some((n,i) => n.id !== i || !Array.isArray(n.neighbors)
                    || n.neighbors.some(id => !Number.isInteger(id) || id < 0 || id >= data.nodes.length))) {
                throw new Error('Invalid campaign save');
            }
            if (auditAtlas(data).errors.length) throw new Error('Invalid atlas routes');
            this.model = new CampaignModel(data); return true;
        } catch (error) { this.issue = 'loadError'; return false; }
    }
    save() {
        try { gameStorage.setItem('microwars_campaign', JSON.stringify(this.data)); this.issue = null; return true; }
        catch (error) { this.issue = 'saveError'; return false; }
    }
}
