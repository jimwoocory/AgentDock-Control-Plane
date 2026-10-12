import {loadConfig} from './configure.mjs';
const c=await loadConfig();
const h={'OAI-Sites-Authorization':`Bearer ${c.siteToken}`,'X-CP-Collector-Key':c.collectorKey};
const r=await fetch(c.siteUrl+'/api/state',{headers:h,redirect:'manual'});
if(!r.ok)throw Error(`Readback ${r.status}`);
const s=await r.json();
const anonymous=await fetch(c.siteUrl+'/api/state',{redirect:'manual'});
console.log(JSON.stringify({status:r.status,machine:s.source.machine,taskCount:s.source.taskCount,nodeCount:s.nodes.length,agentCount:s.agents.length,historyCount:s.history.length,capturedAt:s.source.capturedAt,receivedAt:s.source.receivedAt,stale:s.source.stale,anonymousStatus:anonymous.status}));
