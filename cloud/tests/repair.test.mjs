import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { setup, fixture } from './helpers.mjs'
import { contextDigest } from '../worker/governance.mjs'

function configure(env, plan) {
  const raw=JSON.stringify(plan)
  env.CP_OWNER_REPAIR_SHA256=createHash('sha256').update(raw).digest('hex')
  env.CP_OWNER_REPAIR_PART_1=raw
}
const plan=()=>({id:'fixture-repair-01',expiresAt:new Date(Date.now()+3600000).toISOString(),reason:'User confirmed this isolated fixture mapping',mappings:[{taskId:'tsk_0123456789abcdef',expectedProjectId:'unassigned',targetProjectId:'preset:Toonflow'}],artifacts:[],approval:null})
async function seed() { const h=setup(), input=fixture(); assert.equal((await h.call('/api/ingest','POST',input,h.service)).status,200); return {...h,input} }
const state=async h=>(await h.call('/api/state','GET',undefined,h.service)).json()

test('owner-config repair is applied only by ingest; source and other management fields survive; later sync is idempotent',async()=>{
  const h=await seed(),id='src:tsk_0123456789abcdef'
  await h.call('/api/nodes/'+encodeURIComponent(id),'PATCH',{priority:'urgent',owner:'original owner'},h.user)
  const before=await state(h);configure(h.env,plan())
  assert.equal((await state(h)).nodes.find(n=>n.id===id).projectId,'unassigned')
  const result=await (await h.call('/api/ingest','POST',h.input,h.service)).json()
  assert.ok(result.repair,'the new owner-config repair must return an explicit outcome')
  assert.equal(result.repair.status,'applied')
  const after=await state(h),root=after.nodes.find(n=>n.id===id)
  assert.equal(root.projectId,'preset:Toonflow');assert.equal(root.priority,'urgent');assert.equal(root.owner,'original owner')
  assert.equal(after.nodes.find(n=>n.id.startsWith('step:')).projectId,'preset:Toonflow')
  assert.deepEqual(after.tasks,before.tasks)
  const count=after.history.filter(e=>e.kind==='owner_repair').length
  assert.equal(count,1);assert.equal(after.history.find(e=>e.kind==='owner_repair').actorId,'site-owner-config-repair')
  const repeated=await (await h.call('/api/ingest','POST',h.input,h.service)).json()
  assert.equal(repeated.repair.status,'already_applied')
  assert.equal((await state(h)).history.filter(e=>e.kind==='owner_repair').length,count)
  assert.equal(h.sqlite.prepare('SELECT COUNT(*) AS n FROM cp_repairs').get().n,1)
})

test('the whole repair validates before any mapping or approval is written',async()=>{
  const h=await seed(),p=plan();p.mappings.push({taskId:'tsk_1111111111111111',expectedProjectId:'unassigned',targetProjectId:'preset:Toonflow'})
  configure(h.env,p);const res=await h.call('/api/ingest','POST',h.input,h.service)
  assert.equal(res.status,200);assert.equal((await res.json()).repair.status,'blocked')
  const s=await state(h);assert.equal(s.nodes[0].projectId,'unassigned');assert.equal(s.approvals.length,0)
})

test('changed metadata, wrong digest, and expired plans are blocked without interrupting source freshness',async()=>{
  for(const kind of ['changed','digest','expired']){
    const h=await seed(),p=plan()
    if(kind==='changed')await h.call('/api/nodes/src%3Atsk_0123456789abcdef','PATCH',{projectId:'preset:BMAD'},h.user)
    if(kind==='expired')p.expiresAt=new Date(Date.now()-1000).toISOString()
    configure(h.env,p);if(kind==='digest')h.env.CP_OWNER_REPAIR_SHA256='0'.repeat(64)
    const r=await h.call('/api/ingest','POST',h.input,h.service);assert.equal(r.status,200);assert.equal((await r.json()).repair.status,'blocked')
    assert.equal((await state(h)).source.stale,false)
    assert.equal(h.sqlite.prepare('SELECT COUNT(*) AS n FROM cp_repairs').get().n,0)
  }
})

test('repair can register evidence and create a digest-bound pending request but never approve',async()=>{
  const h=await seed(),p=plan();p.artifacts=[{id:'fixture-artifact',projectId:'preset:Toonflow',nodeId:'src:tsk_0123456789abcdef',name:'Real report reference',version:'v1',description:'NOT_VERIFIED; owner must review',referenceType:'path',reference:'C:/isolated/report.md',sha256:'a'.repeat(64),agentId:''}]
  p.approval={id:'fixture-approval',projectId:'preset:Toonflow',nodeId:'src:tsk_0123456789abcdef',report:'NOT_VERIFIED / NO-GO. Real online write evidence remains missing.',artifactIds:['fixture-artifact']}
  const s0=await state(h);p.approval.expectedContextDigest=await contextDigest(s0,{...s0.nodes[0],projectId:'preset:Toonflow'})
  configure(h.env,p);assert.equal((await (await h.call('/api/ingest','POST',h.input,h.service)).json()).repair.status,'applied')
  const s=await state(h);assert.equal(s.artifacts.length,1);assert.equal(s.approvals.length,1)
  assert.equal(s.approvals[0].status,'pending');assert.equal(s.approvals[0].reviewerId,null);assert.equal(s.approvals[0].isStale,false)
  assert.match(s.approvals[0].contextDigest,/^[a-f0-9]{64}$/)
  assert.equal((await h.call('/api/approvals/fixture-approval/review','POST',{decision:'approved',comment:'cannot approve with service'},h.service)).status,401)
  assert.equal((await h.call('/api/nodes/src%3Atsk_0123456789abcdef','PATCH',{projectId:'preset:BMAD'},h.service)).status,401)
})

test('rollback evidence is durable and a repair ID cannot be reused with different content',async()=>{
  const h=await seed(),p=plan();configure(h.env,p)
  await h.call('/api/ingest','POST',h.input,h.service)
  const stored=h.sqlite.prepare('SELECT payload FROM cp_repairs').get()
  assert.equal(JSON.parse(stored.payload).originalMetadata[0].payload,null)
  p.reason='different instructions';configure(h.env,p)
  const r=await (await h.call('/api/ingest','POST',h.input,h.service)).json();assert.equal(r.repair.status,'blocked')
  assert.equal((await state(h)).nodes[0].projectId,'preset:Toonflow')
})

test('a concurrent acknowledged management edit makes the entire repair defer without a partial journal or mapping',async()=>{
  const h=await seed();configure(h.env,plan())
  const originalBatch=h.env.DB.batch;let batches=0
  h.env.DB.batch=async statements=>{
    if(++batches===2){
      h.sqlite.prepare('INSERT INTO cp_nodes(id,payload) VALUES(?,?)').run('src:tsk_0123456789abcdef',JSON.stringify({id:'src:tsk_0123456789abcdef',origin:'agentdock',priority:'urgent'}))
      h.sqlite.exec('UPDATE cp_control SET revision=revision+1 WHERE id=1')
    }
    return originalBatch(statements)
  }
  const result=await (await h.call('/api/ingest','POST',h.input,h.service)).json()
  assert.equal(result.repair.status,'blocked')
  const s=await state(h);assert.equal(s.nodes[0].projectId,'unassigned');assert.equal(s.nodes[0].priority,'urgent')
  assert.equal(h.sqlite.prepare('SELECT COUNT(*) AS n FROM cp_repairs').get().n,0)
})

test('collector request fields and MCP calls cannot supply an owner repair plan or trigger a read-side mutation',async()=>{
  const h=await seed()
  await h.call('/api/ingest','POST',{...h.input,ownerRepair:plan()},h.service)
  assert.equal((await state(h)).nodes[0].projectId,'unassigned')
  configure(h.env,plan())
  const discovery=await (await h.call('/mcp','POST',{jsonrpc:'2.0',id:1,method:'tools/list'})).json()
  assert.equal(discovery.result.tools.length,8);assert.ok(discovery.result.tools.every(t=>t.annotations.readOnlyHint))
  const bad=await (await h.call('/mcp','POST',{jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'apply_owner_repair',arguments:plan()}},h.service)).json()
  assert.equal(bad.error.code,-32601)
  assert.equal((await state(h)).nodes[0].projectId,'unassigned')
})
