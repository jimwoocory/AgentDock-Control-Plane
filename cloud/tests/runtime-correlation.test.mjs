import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,fixture} from './helpers.mjs';
const module=await import('../shared/task-runtime.mjs').catch(()=>({}));
const taskId='tsk_0123456789abcdef',nodeId=`src:${taskId}`;
const agent=(extra={})=>({id:'codex:fixture',runtime:'codex',label:'Synthetic worker',status:'Running',rawStatus:'task_started',taskId:null,currentAction:null,lastHeartbeatAt:null,lastActivityAt:new Date().toISOString(),observedAt:new Date().toISOString(),stale:false,present:true,...extra});
const data=(a=agent(),extra={})=>({nodes:[{id:nodeId,kind:'task',sourceTaskId:taskId,status:'active',agentId:'codex:fixture',missing:false}],tasks:[{id:taskId,status:'active',updated_at:'2026-10-12T00:00:00Z',steps:[{id:'design',title:'Recorded design checkpoint',status:'in_progress',updated_at:'2026-10-12T00:00:00Z'}]}],agents:[a],source:{stale:false},...extra});
test('explicit management association returns observed session and separately labelled checkpoint',()=>{
 assert.equal(typeof module.taskRuntime,'function');
 const r=module.taskRuntime(data(),nodeId);
 assert.equal(r.binding,'MANAGEMENT');assert.equal(r.taskId,taskId);assert.equal(r.agent.id,'codex:fixture');
 assert.equal(r.sessionStatus,'Running');assert.equal(r.lastTurnStatus,'Running');assert.equal(r.currentAction,null);assert.equal(r.heartbeatAt,null);
 assert.equal(r.checkpoints[0].title,'Recorded design checkpoint');assert.equal(r.checkpointAt,'2026-10-12T00:00:00Z');
});
test('active task never becomes Running without runtime evidence; stale completion remains last-turn evidence',()=>{
 assert.equal(typeof module.taskRuntime,'function');
 for(const extra of [{stale:true},{present:false},{stale:undefined}])assert.equal(module.taskRuntime(data(agent(extra)),taskId).sessionStatus,'Unknown');
 const r=module.taskRuntime(data(agent({stale:true,status:'Unknown',rawStatus:'task_complete'})),taskId);
 assert.equal(r.sessionStatus,'Unknown');assert.equal(r.lastTurnStatus,'Completed');assert.equal(r.evidence,'STALE');
 const noAgent=module.taskRuntime(data(undefined,{agents:[]}),nodeId);assert.equal(noAgent.evidence,'UNAVAILABLE');assert.equal(noAgent.sessionStatus,'Unknown');
 const unbound=data();unbound.nodes[0].agentId='';assert.equal(module.taskRuntime(unbound,nodeId).binding,'UNBOUND');
 assert.equal(module.taskRuntime({...data(),source:{stale:true}},nodeId).sessionStatus,'Unknown');
});
test('runtime-reported binding works; mismatched or multiply assigned sessions fail closed',()=>{
 assert.equal(typeof module.taskRuntime,'function');
 const reported=data(agent({taskId}),{nodes:[{id:nodeId,sourceTaskId:taskId,kind:'task',status:'active',agentId:''}]});
 assert.equal(module.taskRuntime(reported,nodeId).binding,'RUNTIME');
 const mismatch=module.taskRuntime(data(agent({taskId:'tsk_1111111111111111'})),nodeId);assert.equal(mismatch.binding,'CONFLICT');assert.equal(mismatch.sessionStatus,'Unknown');
 const shared=data();shared.nodes.push({...shared.nodes[0],id:'src:tsk_1111111111111111',sourceTaskId:'tsk_1111111111111111'});
 assert.equal(module.taskRuntime(shared,nodeId).binding,'CONFLICT');
 assert.equal(module.taskRuntime(data(undefined,{nodes:[]}),nodeId),null);
});
test('a different runtime-reported worker cannot be hidden by an owner assignment',()=>{
 const conflicting=data(undefined,{agents:[agent(),agent({id:'codex:reported',taskId})]});
 const r=module.taskRuntime(conflicting,nodeId);
 assert.equal(r.binding,'CONFLICT');assert.equal(r.evidence,'CONFLICT');assert.equal(r.sessionStatus,'Unknown');assert.equal(r.currentAction,null);
 assert.deepEqual(r.candidates.map(a=>a.id).sort(),['codex:fixture','codex:reported']);
});
test('MCP task and project filters return only explicitly linked agents, independent of limit',async()=>{
 const {call,service,user}=setup(),snap=fixture();
 snap.agents=[agent({id:'codex:other'}),agent()];
 await call('/api/ingest','POST',snap,service);
 await call(`/api/nodes/${encodeURIComponent(nodeId)}`,'PATCH',{agentId:'codex:fixture'},user);
 const rpc=async(name,args)=>{const response=await call('/mcp','POST',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}},service);assert.equal(response.status,200);return (await response.json()).result.structuredContent;};
 for(const id of [taskId,nodeId]){
  const task=await rpc('get_task',{taskId:id});assert.equal(task.task.id,taskId);assert.equal(task.runtime.agent.id,'codex:fixture');
  const agents=await rpc('list_agents',{taskId:id,limit:1});assert.deepEqual(agents.agents.map(a=>a.id),['codex:fixture']);
 }
 assert.deepEqual((await rpc('list_agents',{taskId:'tsk_2222222222222222'})).agents,[]);
 assert.deepEqual((await rpc('list_agents',{projectId:'preset:BMAD'})).agents,[]);
 assert.deepEqual((await rpc('list_agents',{projectId:'unassigned'})).agents.map(a=>a.id),['codex:fixture']);
 assert.deepEqual((await rpc('list_agents',{taskId,projectId:'preset:BMAD'})).agents,[]);
 const step=await rpc('get_task',{taskId:`step:${taskId}:s1`});
 assert.equal(step.task.id,`step:${taskId}:s1`);assert.equal(step.task.kind,'subtask');assert.equal(step.runtime.taskId,taskId);
});
