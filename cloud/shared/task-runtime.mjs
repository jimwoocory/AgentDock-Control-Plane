// A management assignment is an association, never proof that a task is executing.
const observedStatuses=new Set(['Idle','Planning','Running','Waiting Approval','Blocked','Failed','Completed','Unknown']);
const lastTurn={task_started:'Running',task_complete:'Completed',turn_aborted:'Aborted'};
function rootNode(data,id){
 const node=(data.nodes??[]).find(n=>n.id===id||n.sourceTaskId===id&&n.kind==='task');
 if(!node)return null;
 return node.sourceTaskId?(data.nodes??[]).find(n=>n.kind==='task'&&n.sourceTaskId===node.sourceTaskId)??node:node;
}
function reportsTask(agent,node){return !!agent.taskId&&[node.id,node.sourceTaskId].includes(agent.taskId);}
export function taskRuntime(data,id){
 const node=rootNode(data,id);if(!node)return null;
 const task=(data.tasks??[]).find(t=>t.id===node.sourceTaskId);
 const declaredAgentId=node.agentId||null;
 const reported=(data.agents??[]).filter(a=>reportsTask(a,node));
 const assigned=(data.agents??[]).find(a=>a.id===declaredAgentId);
 const candidates=[...new Map([...(assigned?[assigned]:[]),...reported].map(a=>[a.id,a])).values()];
 const agent=candidates.length===1?candidates[0]:null;
 const shared=declaredAgentId&&(data.nodes??[]).filter(n=>n.kind==='task'&&!n.missing&&n.agentId===declaredAgentId&&!['completed','done','canceled','cancelled'].includes(n.status)).length>1;
 const conflict=!!shared||candidates.length>1||!!(declaredAgentId&&reported.some(a=>a.id!==declaredAgentId))||!!(assigned?.taskId&&!reportsTask(assigned,node));
 const binding=conflict?'CONFLICT':declaredAgentId?'MANAGEMENT':reported.length?'RUNTIME':'UNBOUND';
 const sourceStale=data.source?.stale!==false||!!node.missing;
 const fresh=!!agent&&agent.stale===false&&agent.present!==false&&!sourceStale&&!conflict;
 const evidence=conflict?'CONFLICT':!agent?'UNAVAILABLE':fresh?'FRESH':'STALE';
 return {
  nodeId:node.id,taskId:node.sourceTaskId??node.id,taskStatus:node.status??'unknown',
  binding,declaredAgentId,agent,candidates,sourceStale,evidence,
  sessionStatus:fresh&&observedStatuses.has(agent.status)?agent.status:'Unknown',
  lastTurnStatus:agent?lastTurn[agent.rawStatus]??'Unknown':'Unknown',
  lastTurnAt:agent?.lastActivityAt??null,observedAt:agent?.observedAt??null,
  currentAction:fresh?agent.currentAction??null:null,heartbeatAt:fresh?agent.lastHeartbeatAt??null:null,
  checkpointAt:task?.updated_at??null,
  checkpoints:(task?.steps??[]).filter(s=>['in_progress','active','running'].includes(s.status)).map(s=>({id:s.id,title:s.title,status:s.status,updatedAt:s.updated_at??task.updated_at??null}))
 };
}
export function scopedAgents(data,{taskId,projectId}={}){
 if(!taskId&&!projectId)return data.agents??[];
 const selected=taskId?rootNode(data,taskId):null;
 const roots=(data.nodes??[]).filter(n=>n.kind==='task'&&(!taskId||n.id===selected?.id)&&(!projectId||n.projectId===projectId));
 return (data.agents??[]).filter(a=>roots.some(n=>n.agentId===a.id||reportsTask(a,n)));
}
