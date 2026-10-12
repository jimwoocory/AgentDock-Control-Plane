import test from 'node:test';
import assert from 'node:assert/strict';
const daily=await import('../ui/daily-model.mjs').catch(()=>({}));
const nodes=[{id:'active',projectId:'p',kind:'task',status:'active'},{id:'blocked',projectId:'p',kind:'task',status:'blocked'},{id:'unknown',projectId:'unassigned',kind:'task',status:'external'},{id:'completed',projectId:'p',kind:'task',status:'completed'},{id:'step',projectId:'p',kind:'subtask',parentId:'active',status:'completed'}];
test('daily current keeps unknown and excludes terminal tasks while history remains reachable',()=>{
 assert.equal(typeof daily.filterDailyNodes,'function');
 assert.deepEqual(daily.filterDailyNodes(nodes,'current').map(n=>n.id),['active','blocked','unknown','step']);
 assert.deepEqual(daily.filterDailyNodes(nodes,'history').map(n=>n.id),['completed']);
 assert.deepEqual(daily.filterDailyNodes(nodes,'blocked').map(n=>n.id),['blocked']);
 assert.deepEqual(daily.filterDailyNodes(nodes,'unassigned').map(n=>n.id),['unknown']);
 assert.equal(daily.filterDailyNodes(nodes,'all').length,5);
});
test('task statistics exclude steps and project order prioritizes current tasks then recent activity',()=>{
 assert.equal(typeof daily.projectTaskStats,'function');
 assert.deepEqual(daily.projectTaskStats(nodes.filter(n=>n.projectId==='p')),{total:3,current:2,blocked:1,completed:1,history:1});
 const projects=[{id:'history'},{id:'p'},{id:'unassigned'}];
 assert.deepEqual(daily.sortDailyProjects(projects,nodes,[{projectId:'unassigned',createdAt:'2026-01-02'}],[]).map(p=>p.id),['unassigned','p','history']);
});
test('archived projects stay reachable after current nonarchived projects',()=>{
 assert.deepEqual(daily.sortDailyProjects([{id:'archived',archived:true},{id:'live',archived:false}],[{id:'a',projectId:'archived',kind:'task',status:'active'},{id:'b',projectId:'live',kind:'task',status:'active'}]).map(p=>p.id),['live','archived']);
 assert.deepEqual(daily.sortDailyProjects([{id:'empty',archived:false},{id:'archived',archived:true}],[{id:'a',projectId:'archived',kind:'task',status:'active'}]).map(p=>p.id),['archived','empty']);
});
test('daily search retains ancestors and source step matches show their source task',()=>{
 assert.equal(typeof daily.dailyTree,'function');
 assert.deepEqual(daily.dailyTree([{id:'e',kind:'epic',status:'completed'},{id:'t',kind:'task',parentId:'e',status:'active',title:'Needle'}],'current','needle').map(n=>n.id),['e','t']);
});
test('recent source updates and management activity sort tasks and bubble child activity to ancestors',()=>{
 const graph=[{id:'e',kind:'epic'},{id:'old',kind:'task',parentId:'e',status:'active',sourceTaskId:'external-old'},{id:'new',kind:'task',parentId:'e',status:'active',sourceTaskId:'external-new'},{id:'local',kind:'task',status:'active'},{id:'child',kind:'subtask',parentId:'local',status:'pending'}];
 assert.deepEqual(daily.dailyTree(graph,'current','',[{nodeId:'child',createdAt:'2026-03-01'}],[{id:'external-old',updated_at:'2026-01-01'},{id:'external-new',updated_at:'2026-02-01'}]).map(n=>n.id),['local','child','e','new','old']);
});
test('historical governance uses recorded project and source task anchors despite missing moved nodes',()=>{
 assert.equal(typeof daily.governanceRecords,'function');
 const records=[{id:'a',projectId:'old',nodeId:'step:external:gone'},{id:'b',projectId:'old',nodeId:'src:another'},{id:'c',projectId:'new',nodeId:'src:external'}];
 assert.deepEqual(daily.governanceRecords(records,'old','src:external').map(r=>r.id),['a']);
 assert.equal(daily.governanceRecords(records,'old','').length,2);
});
test('fresh agents exclude stale and absent evidence without deriving from task status',()=>{
 assert.equal(typeof daily.partitionAgents,'function');
 const agents=[{id:'fresh',stale:false,present:true},{id:'old',stale:true},{id:'absent',present:false},{id:'unknown'}];
 assert.deepEqual(daily.partitionAgents(agents).fresh.map(a=>a.id),['fresh']);
 assert.equal(daily.partitionAgents(agents).retained.length,3);
});
test('record payloads trim required fields, include nullable scope and explicit arrays, omit actor',()=>{
 assert.equal(typeof daily.recordPayload,'function');
 assert.deepEqual(daily.recordPayload('decision',{projectId:'p',nodeId:'',title:' Subject ',choice:' A ',reason:' Reason ',alternatives:' B \n C ',actorId:'spoof'}),{projectId:'p',nodeId:null,title:'Subject',choice:'A',reason:'Reason',alternatives:['B','C']});
 assert.deepEqual(daily.recordPayload('approval',{projectId:'p',nodeId:'t',report:' report ',artifactIds:[],contextDigest:'digest'}),{projectId:'p',nodeId:'t',report:'report',artifactIds:[],contextDigest:'digest'});
 assert.throws(()=>daily.recordPayload('approval',{projectId:'p',nodeId:'t',report:'   ',contextDigest:'digest'}),/验收报告/);
 assert.throws(()=>daily.recordPayload('approval',{projectId:'p',nodeId:'t',report:'report'}),/指纹/);
});
test('artifact payload requires safe https or plain path and sha256; links never expose credentials',()=>{
 assert.equal(typeof daily.safeArtifactHref,'function');
 assert.equal(daily.safeArtifactHref({referenceType:'path',reference:'C:\\work\\output.txt'}),null);
 assert.equal(daily.safeArtifactHref({referenceType:'url',reference:'https://example.test/a'}),'https://example.test/a');
 for(const reference of ['javascript:alert(1)','http://example.test','https://user:pass@example.test'])assert.equal(daily.safeArtifactHref({referenceType:'url',reference}),null);
 const draft={projectId:'p',nodeId:null,name:'Output',version:'1',description:'',referenceType:'path',reference:'C:\\work\\output.txt'};
 assert.deepEqual(daily.recordPayload('artifact',draft),{...draft,sha256:'',agentId:''});
 assert.throws(()=>daily.recordPayload('artifact',{...draft,sha256:'bad'}),/sha256/);
 assert.throws(()=>daily.recordPayload('artifact',{...draft,reference:'javascript:alert(1)'}),/引用/);
});
