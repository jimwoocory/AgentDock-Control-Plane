import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { setup, fixture } from './helpers.mjs'

const nodeInput={projectId:'preset:USVDS2',kind:'task',title:'Synthetic acceptance',acceptanceCriteria:['Verified']}
async function create(ctx,path,input){const r=await ctx.call(path,'POST',input,ctx.user);assert.equal(r.status,201,JSON.stringify(await r.clone().json()));return r.json()}
const read=ctx=>ctx.call('/api/state','GET',undefined,ctx.user).then(r=>r.json())
const artifactInput={projectId:'preset:USVDS2',nodeId:null,name:'Evidence',version:'v1',description:'Synthetic',referenceType:'url',reference:'https://example.test/evidence',sha256:'',agentId:''}

test('project aliases are reversible, preserve source fields and explicit overrides, profiles cover source and presets',async()=>{
  const c=setup(),data=fixture();data.tasks[0].project='usvds2';await c.call('/api/ingest','POST',data,c.service)
  const link={sourceProjectId:'source-project:usvds2',targetProjectId:'preset:USVDS2',reason:'Explicit fixture field'}
  assert.equal((await c.call('/api/project-links','POST',link,c.user)).status,200)
  let s=await read(c);assert.equal(s.nodes[0].projectId,'preset:USVDS2');assert.equal(s.tasks[0].project,'usvds2');assert.equal(s.projectLinks[0].reason,link.reason)
  assert.equal((await c.call('/api/project-links','POST',{...link,targetProjectId:'source-project:usvds2'},c.user)).status,400)
  assert.equal((await c.call('/api/projects/source-project%3Ausvds2','PATCH',{owner:'Fixture owner',goal:'Daily',phase:'Review',status:'paused',archived:true},c.user)).status,200)
  s=await read(c);assert.equal(s.projects.find(p=>p.id===link.sourceProjectId).phase,'Review')
  assert.equal((await c.call('/api/project-links','POST',{...link,targetProjectId:null},c.user)).status,200)
  s=await read(c);assert.equal(s.nodes[0].projectId,link.sourceProjectId);assert.equal(s.projectLinks.length,0)
  await c.call('/api/nodes/'+encodeURIComponent(s.nodes[0].id),'PATCH',{projectId:'preset:BMAD'},c.user)
  assert.equal((await c.call('/api/project-links','POST',link,c.user)).status,200)
  assert.equal((await read(c)).nodes[0].projectId,'preset:BMAD')
})

test('alias changes reject cross-project parents and dependencies without deleting graph',async()=>{
 const c=setup(),data=fixture();data.tasks[0].project='Original';await c.call('/api/ingest','POST',data,c.service)
 const child=await create(c,'/api/nodes',{projectId:'source-project:Original',parentId:'src:'+data.tasks[0].id,kind:'subtask',title:'Local child'})
 assert.equal((await c.call('/api/project-links','POST',{sourceProjectId:'source-project:Original',targetProjectId:'preset:USVDS2',reason:'Move'},c.user)).status,400)
 const s=await read(c);assert.equal(s.nodes.find(n=>n.id===child.id).parentId,'src:'+data.tasks[0].id);assert.deepEqual(s.projectLinks,[])
})

test('approval is version-bound, audited, pending-only, and stale source/local requests cannot be reviewed',async()=>{
 const c=setup(),node=await create(c,'/api/nodes',nodeInput),artifact=await create(c,'/api/artifacts',{...artifactInput,nodeId:node.id})
 const approval=await create(c,'/api/approvals',{projectId:node.projectId,nodeId:node.id,report:'Synthetic report',artifactIds:[artifact.id]})
 assert.equal(approval.status,'pending');assert.equal(approval.actorId,'fixture-user');assert.match(approval.contextDigest,/^[a-f0-9]{64}$/)
 const path='/api/approvals/'+approval.id+'/review'
 assert.equal((await c.call(path,'POST',{decision:'approved',comment:'Reviewed'},c.service)).status,401)
 assert.equal((await c.call(path,'POST',{decision:'approved',comment:'Reviewed',reviewerId:'spoof'},c.user)).status,400)
 assert.equal((await c.call(path,'POST',{decision:'approved',comment:'Reviewed'},c.user)).status,200)
 assert.equal((await c.call(path,'POST',{decision:'rejected',comment:'Duplicate'},c.user)).status,409)
 let s=await read(c);assert.equal(s.approvals[0].reviewerId,'fixture-user');assert.equal(s.approvals[0].isStale,false)
 await c.call('/api/nodes/'+node.id,'PATCH',{acceptanceCriteria:['Changed']},c.user)
 s=await read(c);assert.equal(s.approvals[0].isStale,true)
 assert.equal((await c.call('/api/approvals','POST',{projectId:node.projectId,nodeId:node.id,report:'Old digest',artifactIds:[],contextDigest:approval.contextDigest},c.user)).status,409)
 const pending=await create(c,'/api/approvals',{projectId:node.projectId,nodeId:node.id,report:'New',artifactIds:[]})
 await c.call('/api/nodes/'+node.id,'PATCH',{dependencies:[(await create(c,'/api/nodes',{...nodeInput,title:'Dependency'})).id]},c.user)
 assert.equal((await c.call('/api/approvals/'+pending.id+'/review','POST',{decision:'approved',comment:'Old context'},c.user)).status,409)
 const data=fixture();await c.call('/api/ingest','POST',data,c.service)
 const src=await create(c,'/api/approvals',{projectId:'unassigned',nodeId:'src:'+data.tasks[0].id,report:'Source',artifactIds:[]})
 data.tasks[0].summary='Updated business content';data.capturedAt=new Date(Date.parse(data.capturedAt)+1000).toISOString();await c.call('/api/ingest','POST',data,c.service)
 assert.equal((await read(c)).approvals.find(a=>a.id===src.id).isStale,true)
 assert.equal((await c.call('/api/approvals/'+src.id+'/review','POST',{decision:'approved',comment:'Old source'},c.user)).status,409)
 assert.ok((await read(c)).history.some(h=>h.kind==='approval'&&h.nodeId===node.id))
})

test('decisions and immutable artifact versions validate scope, actor, dangerous references and bounded inputs',async()=>{
 const c=setup(),node=await create(c,'/api/nodes',nodeInput)
 const decision=await create(c,'/api/decisions',{projectId:node.projectId,nodeId:node.id,title:'Fixture choice',choice:'A',reason:'Evidence',alternatives:['B']})
 assert.equal(decision.actorId,'fixture-user')
 const artifact=await create(c,'/api/artifacts',{...artifactInput,nodeId:node.id})
 assert.equal((await c.call('/api/artifacts','POST',{...artifactInput,nodeId:node.id},c.user)).status,409)
 for(const reference of ['javascript:alert(1)','http://example.test/a','data:text/html,a','https://user:pass@example.test/a'])assert.equal((await c.call('/api/artifacts','POST',{...artifactInput,version:reference,reference},c.user)).status,400)
 assert.equal((await c.call('/api/artifacts','POST',{...artifactInput,referenceType:'path',version:'path',reference:'javascript:alert(1)'},c.user)).status,400)
 await create(c,'/api/artifacts',{...artifactInput,referenceType:'path',version:'path',reference:'C:\\fixture\\evidence.pdf'})
 assert.equal((await c.call('/api/artifacts/'+artifact.id,'PATCH',{archived:true},c.user)).status,200)
 assert.equal((await c.call('/api/artifacts/'+artifact.id,'PATCH',{version:'v2'},c.user)).status,400)
 assert.equal((await c.call('/api/artifacts/'+artifact.id,'PATCH',{archived:false},c.user)).status,200)
 const foreign=await create(c,'/api/artifacts',{...artifactInput,projectId:'preset:BMAD'})
 assert.equal((await c.call('/api/approvals','POST',{projectId:node.projectId,nodeId:node.id,report:'Foreign evidence',artifactIds:[foreign.id]},c.user)).status,400)
 assert.equal((await c.call('/api/decisions','POST',{projectId:'preset:BMAD',nodeId:node.id,title:'Bad',choice:'A',reason:'B',alternatives:[]},c.user)).status,400)
 assert.equal((await c.call('/api/decisions','POST',{projectId:node.projectId,nodeId:null,title:'x'.repeat(501),choice:'A',reason:'B',alternatives:[]},c.user)).status,400)
 assert.equal((await c.call('/api/decisions','POST',{projectId:node.projectId,nodeId:null,title:'x',choice:'A',reason:'B',alternatives:Array(51).fill('a')},c.user)).status,400)
 for(const path of ['/api/artifacts','/api/decisions','/api/approvals','/api/project-links'])assert.equal((await c.call(path,'POST',{},c.service)).status,401)
 assert.equal((await c.call('/api/projects/preset%3AUSVDS2','PATCH',{archived:true},{...c.user,Origin:'https://foreign.test'})).status,403)
})

test('competing review and ingest commits cause 409 with no unaudited partial mutation',async()=>{
 const c=setup(),node=await create(c,'/api/nodes',nodeInput),approval=await create(c,'/api/approvals',{projectId:node.projectId,nodeId:node.id,report:'Synthetic',artifactIds:[]})
 const original=c.env.DB.batch.bind(c.env.DB);let callback=async()=>assert.equal((await c.call('/api/approvals/'+approval.id+'/review','POST',{decision:'rejected',comment:'First'},c.user)).status,200)
 c.env.DB.batch=async statements=>{const fn=callback;callback=null;if(fn)await fn();return original(statements)}
 assert.equal((await c.call('/api/approvals/'+approval.id+'/review','POST',{decision:'approved',comment:'Second'},c.user)).status,409)
 let s=await read(c);assert.equal(s.approvals[0].status,'rejected');assert.equal(s.approvals[0].reviewComment,'First');assert.equal(s.history.filter(h=>h.kind==='approval_review').length,1)
 callback=async()=>assert.equal((await c.call('/api/ingest','POST',fixture(),c.service)).status,200)
 assert.equal((await c.call('/api/artifacts','POST',artifactInput,c.user)).status,409)
 assert.equal((await read(c)).artifacts.length,0)
})

test('MCP governance and history queries filter project/task and get_task supports local IDs',async()=>{
 const c=setup(),a=await create(c,'/api/nodes',nodeInput),b=await create(c,'/api/nodes',{...nodeInput,projectId:'preset:BMAD',title:'Foreign'})
 await create(c,'/api/decisions',{projectId:a.projectId,nodeId:a.id,title:'A',choice:'A',reason:'A',alternatives:[]})
 await create(c,'/api/decisions',{projectId:b.projectId,nodeId:b.id,title:'B',choice:'B',reason:'B',alternatives:[]})
 await create(c,'/api/artifacts',{...artifactInput,nodeId:a.id})
 await create(c,'/api/approvals',{projectId:a.projectId,nodeId:a.id,report:'A',artifactIds:[]})
 const rpc=async(name,args)=>{const response=await c.call('/mcp','POST',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}},c.service);assert.equal(response.status,200);return (await response.json()).result.structuredContent}
 assert.equal((await rpc('list_decisions',{projectId:a.projectId,taskId:a.id})).decisions.length,1)
 assert.equal((await rpc('list_artifacts',{projectId:a.projectId})).artifacts.length,1)
 assert.equal((await rpc('list_approvals',{taskId:a.id})).approvals.length,1)
 const detail=await rpc('get_task',{taskId:a.id});assert.equal(detail.task.id,a.id);assert.equal(detail.decisions.length,1);assert.match(detail.contextDigest,/^[a-f0-9]{64}$/)
 const pinned=await create(c,'/api/approvals',{projectId:a.projectId,nodeId:a.id,report:'Pinned draft',artifactIds:[],contextDigest:detail.contextDigest});assert.equal(pinned.contextDigest,detail.contextDigest)
 const history=await rpc('get_execution_history',{projectId:a.projectId});assert.ok(history.history.length>=4);assert.ok(history.history.every(h=>h.projectId===a.projectId))
 assert.equal((await rpc('get_task',{taskId:a.id,projectId:b.projectId})).task,null)
})

test('additive migration preserves old snapshot and node payloads',()=>{
 const db=new DatabaseSync(':memory:');db.exec(readFileSync('drizzle/0000_overrated_korvac.sql','utf8'))
 db.prepare('INSERT INTO cp_nodes(id,payload) VALUES(?,?)').run('local:old','{"id":"local:old","title":"Old"}')
 db.prepare('INSERT INTO cp_snapshots(source_key,captured_at,received_at,payload) VALUES(?,?,?,?)').run('fixture','old','old','{"tasks":[]}')
 db.exec(readFileSync('drizzle/0001_daily_governance.sql','utf8'))
 assert.equal(db.prepare('SELECT payload FROM cp_nodes').get().payload,'{"id":"local:old","title":"Old"}')
 assert.equal(db.prepare('SELECT payload FROM cp_snapshots').get().payload,'{"tasks":[]}')
})

test('source polling preserves approval context, failed capture or missing source stales it',async()=>{
 const c=setup(),data=fixture();await c.call('/api/ingest','POST',data,c.service)
 const approval=await create(c,'/api/approvals',{projectId:'unassigned',nodeId:'src:'+data.tasks[0].id,report:'Source evidence',artifactIds:[]})
 data.capturedAt=new Date(Date.parse(data.capturedAt)+1000).toISOString();data.tasks[0].events=[{type:'poll',summary:'Observation',created_at:data.capturedAt}]
 assert.equal((await c.call('/api/ingest','POST',data,c.service)).status,200)
 assert.equal((await read(c)).approvals[0].isStale,false)
 const failed={...data,capturedAt:new Date(Date.parse(data.capturedAt)+1000).toISOString(),taskReadOK:false,tasks:[]}
 assert.equal((await c.call('/api/ingest','POST',failed,c.service)).status,200);assert.equal((await read(c)).approvals[0].isStale,true)
 const missing={...data,capturedAt:new Date(Date.parse(failed.capturedAt)+1000).toISOString(),tasks:[]}
 await c.call('/api/ingest','POST',missing,c.service)
 assert.equal((await c.call('/api/approvals/'+approval.id+'/review','POST',{decision:'approved',comment:'Missing'},c.user)).status,409)
})

test('source project changes pin the effective alias project for existing local children',async()=>{
 const c=setup(),data=fixture();data.tasks[0].project='Original';await c.call('/api/ingest','POST',data,c.service)
 await c.call('/api/project-links','POST',{sourceProjectId:'source-project:Original',targetProjectId:'preset:USVDS2',reason:'Fixture'},c.user)
 const child=await create(c,'/api/nodes',{projectId:'preset:USVDS2',parentId:'src:'+data.tasks[0].id,kind:'subtask',title:'Local child'})
 data.tasks[0].project='Moved';data.capturedAt=new Date(Date.parse(data.capturedAt)+1000).toISOString()
 assert.equal((await c.call('/api/ingest','POST',data,c.service)).status,200)
 const s=await read(c);assert.equal(s.nodes.find(n=>n.id===child.parentId).projectId,'preset:USVDS2');assert.equal(s.nodes.find(n=>n.id===child.id).projectId,'preset:USVDS2')
 assert.equal((await c.call('/api/nodes/'+child.id,'PATCH',{priority:'high'},c.user)).status,200)
})

test('alias unlink retains historical records and marks previous approval stale',async()=>{
 const c=setup(),data=fixture();data.tasks[0].project='Original';await c.call('/api/ingest','POST',data,c.service)
 await c.call('/api/project-links','POST',{sourceProjectId:'source-project:Original',targetProjectId:'preset:USVDS2',reason:'Fixture'},c.user)
 const approval=await create(c,'/api/approvals',{projectId:'preset:USVDS2',nodeId:'src:'+data.tasks[0].id,report:'Bound version',artifactIds:[]})
 await create(c,'/api/artifacts',{...artifactInput,nodeId:approval.nodeId})
 await create(c,'/api/decisions',{projectId:approval.projectId,nodeId:approval.nodeId,title:'Fixture',choice:'A',reason:'Evidence',alternatives:[]})
 assert.equal((await c.call('/api/project-links','POST',{sourceProjectId:'source-project:Original',targetProjectId:null,reason:'Undo'},c.user)).status,200)
 const s=await read(c);assert.equal(s.approvals[0].isStale,true);assert.equal(s.artifacts[0].projectId,'preset:USVDS2');assert.equal(s.decisions[0].nodeId,approval.nodeId)
 const response=await c.call('/mcp','POST',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'get_task',arguments:{taskId:data.tasks[0].id}}},c.service)
 const detail=(await response.json()).result.structuredContent;assert.equal(detail.approvals[0].id,approval.id);assert.equal(detail.artifacts.length,1)
})

test('record capacity and oversized payloads refuse further writes without losing existing data',async()=>{
 const c=setup()
 for(let i=0;i<1000;i++)c.sqlite.prepare('INSERT INTO cp_decisions(id,project_id,node_id,payload) VALUES(?,?,?,?)').run('fixture:'+i,'preset:USVDS2',null,JSON.stringify({id:'fixture:'+i,projectId:'preset:USVDS2',nodeId:null,title:'Fixture',createdAt:'2026-01-01',actorId:'fixture'}))
 assert.equal((await c.call('/api/decisions','POST',{projectId:'preset:USVDS2',nodeId:null,title:'Capacity',choice:'A',reason:'Evidence',alternatives:[]},c.user)).status,409)
 assert.equal((await c.call('/api/artifacts','POST',{...artifactInput,description:'x'.repeat(17000)},c.user)).status,413)
 assert.equal((await read(c)).decisions.length,1000)
})

test('concurrent alias and source changes invalidate older validation without partial links or records',async()=>{
 const c=setup(),data=fixture();data.tasks[0].project='Original';await c.call('/api/ingest','POST',data,c.service)
 const original=c.env.DB.batch.bind(c.env.DB)
 let callback=async()=>{
   const child=await create(c,'/api/nodes',{projectId:'source-project:Original',parentId:'src:'+data.tasks[0].id,kind:'subtask',title:'Concurrent child'})
   assert.ok(child.id)
 }
 c.env.DB.batch=async statements=>{const fn=callback;callback=null;if(fn)await fn();return original(statements)}
 assert.equal((await c.call('/api/project-links','POST',{sourceProjectId:'source-project:Original',targetProjectId:'preset:USVDS2',reason:'Concurrent'},c.user)).status,409)
 assert.equal((await read(c)).projectLinks.length,0)
 const next={...data,capturedAt:new Date(Date.parse(data.capturedAt)+1000).toISOString(),tasks:[{...data.tasks[0],status:'blocked'}]}
 callback=async()=>assert.equal((await c.call('/api/projects/source-project%3AOriginal','PATCH',{phase:'Changed'},c.user)).status,200)
 assert.equal((await c.call('/api/ingest','POST',next,c.service)).status,409)
 assert.equal((await read(c)).tasks[0].status,'active')
})

test('record writes trim history to the documented bound in the same transaction',async()=>{
 const c=setup()
 for(let i=0;i<1000;i++)c.sqlite.prepare('INSERT INTO cp_events(id,kind,node_id,summary,created_at) VALUES(?,?,?,?,?)').run('event:'+i,'fixture',null,'Old','2026-01-01')
 await create(c,'/api/artifacts',artifactInput)
 assert.equal(c.sqlite.prepare('SELECT COUNT(*) AS count FROM cp_events').get().count,1000)
 assert.equal((await read(c)).history[0].kind,'artifact')
})

test('ingest refuses a previously corrupt management graph and preserves last source facts',async()=>{
 const c=setup(),data=fixture();await c.call('/api/ingest','POST',data,c.service)
 c.sqlite.prepare('INSERT INTO cp_nodes(id,payload) VALUES(?,?)').run('local:corrupt',JSON.stringify({...nodeInput,id:'local:corrupt',origin:'local',priority:'medium',status:'pending',parentId:null,dependencies:['local:nonexistent']}))
 const next={...data,capturedAt:new Date(Date.parse(data.capturedAt)+1000).toISOString(),tasks:[{...data.tasks[0],title:'Must not commit'}]}
 assert.equal((await c.call('/api/ingest','POST',next,c.service)).status,400)
 assert.equal((await read(c)).tasks[0].title,'Synthetic source')
})

test('revoking an absent alias still records the acknowledged action',async()=>{
 const c=setup(),data=fixture();data.tasks[0].project='Original';await c.call('/api/ingest','POST',data,c.service)
 assert.equal((await c.call('/api/project-links','POST',{sourceProjectId:'source-project:Original',targetProjectId:null,reason:'Explicit revoke'},c.user)).status,200)
 assert.ok((await read(c)).history.some(h=>h.kind==='project_link'&&h.summary==='Explicit revoke'))
})

test('project profiles enforce their record bound and existing profiles remain editable',async()=>{
 const c=setup()
 for(let i=0;i<1000;i++)c.sqlite.prepare('INSERT INTO cp_project_profiles(id,payload) VALUES(?,?)').run('source-project:fixture'+i,JSON.stringify({owner:'Fixture',goal:'',phase:'',status:'active',archived:false}))
 assert.equal((await c.call('/api/projects/preset%3AUSVDS2','PATCH',{phase:'Full'},c.user)).status,409)
 assert.equal((await c.call('/api/projects/source-project%3Afixture0','PATCH',{phase:'Existing'},c.user)).status,200)
})

test('editing priority alone does not make an inherited alias into an explicit project override',async()=>{
 const c=setup(),data=fixture();data.tasks[0].project='Original';await c.call('/api/ingest','POST',data,c.service)
 const link={sourceProjectId:'source-project:Original',targetProjectId:'preset:USVDS2',reason:'Fixture'}
 await c.call('/api/project-links','POST',link,c.user)
 assert.equal((await c.call('/api/nodes/'+encodeURIComponent('src:'+data.tasks[0].id),'PATCH',{priority:'urgent'},c.user)).status,200)
 assert.equal((await c.call('/api/project-links','POST',{...link,targetProjectId:null},c.user)).status,200)
 let s=await read(c);assert.equal(s.nodes[0].projectId,'source-project:Original');assert.equal(s.nodes[0].priority,'urgent')
 const response=await c.call('/mcp','POST',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'get_task',arguments:{taskId:data.tasks[0].id}}},c.service)
 assert.equal((await response.json()).result.structuredContent.task.project,'Original')
})

test('readonly API context uses normal Site auth and pins exact effective source and local node digest',async()=>{
 const c=setup(),data=fixture();data.tasks[0].project='Original';await c.call('/api/ingest','POST',data,c.service)
 await c.call('/api/project-links','POST',{sourceProjectId:'source-project:Original',targetProjectId:'preset:USVDS2',reason:'Fixture'},c.user)
 const sourceId='src:'+data.tasks[0].id,path='/api/nodes/'+encodeURIComponent(sourceId)+'/context'
 assert.equal((await c.call(path)).status,401)
 assert.equal((await c.call(path,'GET',undefined,c.service)).status,200)
 const response=await c.call(path,'GET',undefined,{'oai-authenticated-user-id':'fixture-user'});assert.equal(response.status,200)
 const context=await response.json();assert.equal(context.nodeId,sourceId);assert.equal(context.projectId,'preset:USVDS2');assert.match(context.contextDigest,/^[a-f0-9]{64}$/)
 const approval=await create(c,'/api/approvals',{projectId:context.projectId,nodeId:context.nodeId,report:'Pinned API context',artifactIds:[],contextDigest:context.contextDigest});assert.equal(approval.contextDigest,context.contextDigest)
 const node=await create(c,'/api/nodes',nodeInput)
 const local=await (await c.call('/api/nodes/'+encodeURIComponent(node.id)+'/context','GET',undefined,c.user)).json();assert.equal(local.nodeId,node.id);assert.match(local.contextDigest,/^[a-f0-9]{64}$/)
 assert.equal((await c.call('/api/nodes/local%3Amissing/context','GET',undefined,c.user)).status,404)
})

test('a newly received old capture remains stale and cannot create an approval',async()=>{
 const c=setup(),data=fixture();data.capturedAt=new Date(Date.now()-600000).toISOString()
 assert.equal((await c.call('/api/ingest','POST',data,c.service)).status,200)
 const s=await read(c);assert.equal(s.source.stale,true)
 assert.equal((await c.call('/api/ingest','POST',data,c.service)).status,200)
 assert.equal((await read(c)).source.stale,true)
 assert.equal((await c.call('/api/approvals','POST',{projectId:'unassigned',nodeId:'src:'+data.tasks[0].id,report:'Old capture',artifactIds:[]},c.user)).status,409)
})

test('renewed delivery time cannot make a ten-minute old captured approval reviewable',async t=>{
 const c=setup(),data=fixture();await c.call('/api/ingest','POST',data,c.service)
 const approval=await create(c,'/api/approvals',{projectId:'unassigned',nodeId:'src:'+data.tasks[0].id,report:'Fresh before time passed',artifactIds:[]})
 const later=Date.now()+600000;t.mock.method(Date,'now',()=>later)
 c.sqlite.prepare('UPDATE cp_snapshots SET received_at=?').run(new Date(later).toISOString())
 assert.equal((await c.call('/api/approvals/'+approval.id+'/review','POST',{decision:'approved',comment:'Delayed delivery'},c.user)).status,409)
 assert.equal((await read(c)).approvals[0].isStale,true)
 assert.equal((await read(c)).approvals[0].status,'pending')
})

test('source task queries retain disappeared step governance and history without cross-task leakage',async()=>{
 const c=setup(),data=fixture(),foreignId='tsk_0123456789abcdee';data.tasks.push({...data.tasks[0],id:foreignId,title:'Foreign source'})
 await c.call('/api/ingest','POST',data,c.service)
 const sourceId=data.tasks[0].id,stepId='step:'+sourceId+':s1',foreignStep='step:'+foreignId+':s1'
 const approval=await create(c,'/api/approvals',{projectId:'unassigned',nodeId:stepId,report:'Historical step',artifactIds:[]})
 const decision=await create(c,'/api/decisions',{projectId:'unassigned',nodeId:stepId,title:'Historical step',choice:'A',reason:'Evidence',alternatives:[]})
 const artifact=await create(c,'/api/artifacts',{...artifactInput,projectId:'unassigned',nodeId:stepId})
 await create(c,'/api/decisions',{projectId:'unassigned',nodeId:foreignStep,title:'Foreign',choice:'B',reason:'Evidence',alternatives:[]})
 data.tasks[0].steps=[];data.capturedAt=new Date(Date.parse(data.capturedAt)+1000).toISOString()
 assert.equal((await c.call('/api/ingest','POST',data,c.service)).status,200)
 assert.equal((await read(c)).nodes.some(n=>n.id===stepId),false)
 const rpc=async(name,args)=>{const r=await c.call('/mcp','POST',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}},c.service);assert.equal(r.status,200);return (await r.json()).result.structuredContent}
 const detail=await rpc('get_task',{taskId:sourceId});assert.deepEqual(detail.approvals.map(r=>r.id),[approval.id]);assert.equal(detail.approvals[0].isStale,true);assert.deepEqual(detail.decisions.map(r=>r.id),[decision.id]);assert.deepEqual(detail.artifacts.map(r=>r.id),[artifact.id])
 const oldStep=await rpc('get_task',{taskId:stepId});assert.equal(oldStep.task,null);assert.equal(oldStep.contextDigest,null);assert.deepEqual(oldStep.decisions.map(r=>r.id),[decision.id])
 for(const [name,key,id] of [['list_approvals','approvals',approval.id],['list_decisions','decisions',decision.id],['list_artifacts','artifacts',artifact.id]]){
   assert.deepEqual((await rpc(name,{taskId:sourceId,projectId:'unassigned'}))[key].map(r=>r.id),[id])
   assert.deepEqual((await rpc(name,{taskId:stepId,projectId:'unassigned'}))[key].map(r=>r.id),[id])
   assert.deepEqual((await rpc(name,{taskId:sourceId,projectId:'preset:BMAD'}))[key],[])
 }
 const history=(await rpc('get_execution_history',{taskId:sourceId,projectId:'unassigned'})).history
 assert.equal(history.filter(h=>h.nodeId===stepId).length,3);assert.ok(history.every(h=>h.nodeId!==foreignStep))
 assert.deepEqual((await rpc('get_execution_history',{taskId:sourceId,projectId:'preset:BMAD'})).history,[])
})
