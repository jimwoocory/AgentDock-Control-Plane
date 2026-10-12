import {visibleTree} from './model.mjs';
const terminal=new Set(['completed','done','canceled','cancelled']);
const current=n=>!terminal.has(String(n.status).toLowerCase());
export function filterDailyNodes(nodes,filter='current'){
 if(filter==='all')return nodes;
 const tasks=nodes.filter(n=>n.kind==='task'&&(filter==='history'?!current(n):filter==='blocked'?['blocked','failed'].includes(String(n.status).toLowerCase()):filter==='unassigned'?n.projectId==='unassigned':current(n)));
 const included=new Set(tasks.map(n=>n.id));
 // Steps follow their selected task, regardless of their own lifecycle status.
 let changed=true;while(changed){changed=false;for(const n of nodes)if(included.has(n.parentId)&&!included.has(n.id)){included.add(n.id);changed=true;}}
 return nodes.filter(n=>included.has(n.id));
}
export function dailyTree(nodes,filter,search='',history=[],tasks=[]){
 const selected=filterDailyNodes(nodes,filter),ids=new Set(selected.map(n=>n.id)),byId=new Map(nodes.map(n=>[n.id,n]));
 for(const n of selected){let parent=byId.get(n.parentId);const seen=new Set();while(parent&&!seen.has(parent.id)){seen.add(parent.id);ids.add(parent.id);parent=byId.get(parent.parentId);}}
 const updated=new Map(tasks.map(t=>[t.id,Date.parse(t.updated_at)||0]));
 const activity=new Map(nodes.map(n=>[n.id,updated.get(n.sourceTaskId)||0]));
 for(const h of history)if(byId.has(h.nodeId))activity.set(h.nodeId,Math.max(activity.get(h.nodeId)||0,Date.parse(h.createdAt)||0));
 for(const n of nodes){let p=byId.get(n.parentId);const seen=new Set([n.id]);while(p&&!seen.has(p.id)){seen.add(p.id);activity.set(p.id,Math.max(activity.get(p.id)||0,activity.get(n.id)||0));p=byId.get(p.parentId);}}
 return visibleTree(nodes.filter(n=>ids.has(n.id)).sort((a,b)=>(activity.get(b.id)||0)-(activity.get(a.id)||0)),search);
}
export function projectTaskStats(nodes){const tasks=nodes.filter(n=>n.kind==='task');return {total:tasks.length,current:tasks.filter(current).length,blocked:tasks.filter(n=>['blocked','failed'].includes(String(n.status).toLowerCase())).length,completed:tasks.filter(n=>['completed','done'].includes(String(n.status).toLowerCase())).length,history:tasks.filter(n=>!current(n)).length};}
export function sortDailyProjects(projects,nodes,history=[],tasks=[]){
 const updated=new Map(tasks.map(t=>[t.id,Date.parse(t.updated_at)||0]));
 const score=id=>Math.max(0,...history.filter(h=>h.projectId===id).map(h=>Date.parse(h.createdAt)||0),...nodes.filter(n=>n.projectId===id).map(n=>updated.get(n.sourceTaskId)||0));
 return [...projects].sort((a,b)=>Number(projectTaskStats(nodes.filter(n=>n.projectId===b.id)).current>0)-Number(projectTaskStats(nodes.filter(n=>n.projectId===a.id)).current>0)||Number(!!a.archived)-Number(!!b.archived)||score(b.id)-score(a.id));
}
export function governanceRecords(records,projectId,nodeId=''){return records.filter(r=>r.projectId===projectId&&(!nodeId||r.nodeId===nodeId||(nodeId.startsWith('src:')&&r.nodeId?.startsWith(`step:${nodeId.slice(4)}:`)))).sort((a,b)=>(Date.parse(b.createdAt)||0)-(Date.parse(a.createdAt)||0));}
export function partitionAgents(agents){const fresh=agents.filter(a=>a.stale===false&&a.present!==false);return {fresh,retained:agents.filter(a=>!fresh.includes(a))};}
export function safeArtifactHref(a){if(a.referenceType!=='url'||/[\x00-\x20\x7f]/.test(a.reference))return null;try{const url=new URL(a.reference);return url.protocol==='https:'&&!url.username&&!url.password?a.reference:null;}catch{return null;}}
const clean=value=>String(value??'').trim();
function required(value,name){const result=clean(value);if(!result)throw Error(`请填写${name}。`);return result;}
export function recordPayload(kind,d){
 const scope={projectId:required(d.projectId,'项目'),nodeId:d.nodeId||null};
 if(kind==='approval')return {...scope,nodeId:required(d.nodeId,'审批任务'),report:required(d.report,'验收报告'),artifactIds:[...(d.artifactIds||[])],contextDigest:required(d.contextDigest,'任务内容指纹，请重新打开审批表单')};
 if(kind==='decision')return {...scope,title:required(d.title,'决策主题'),choice:required(d.choice,'选择'),reason:required(d.reason,'理由'),alternatives:Array.isArray(d.alternatives)?d.alternatives:d.alternatives?.split('\n').map(clean).filter(Boolean)||[]};
 const payload={...scope,name:required(d.name,'产物名称'),version:required(d.version,'版本'),description:clean(d.description),referenceType:d.referenceType||'url',reference:required(d.reference,'引用'),sha256:clean(d.sha256),agentId:clean(d.agentId)};
 if(payload.sha256&&!/^[a-f\d]{64}$/i.test(payload.sha256))throw Error('sha256 必须为空或 64 位十六进制。');
 if(payload.referenceType==='url'&&!safeArtifactHref(payload)||payload.referenceType==='path'&&(/^[a-z][a-z\d+.-]*:/i.test(payload.reference)&&! /^[a-z]:[\\/]/i.test(payload.reference)||/[\x00-\x1f\x7f]/.test(payload.reference)))throw Error('引用必须是无凭据的 HTTPS 地址或纯文本本地路径。');
 return payload;
}
