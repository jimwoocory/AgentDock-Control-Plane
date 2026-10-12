import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { fetchHandler } from '../worker/server.mjs'

function setup() {
  const sqlite = new DatabaseSync(':memory:')
  for (const file of readdirSync('drizzle').filter(x => x.endsWith('.sql'))) sqlite.exec(readFileSync(`drizzle/${file}`, 'utf8'))
  const DB = { prepare(sql) { let args = []; return { bind(...value) { args = value; return this }, async all() { return { results: sqlite.prepare(sql).all(...args) } }, async first() { return sqlite.prepare(sql).get(...args) ?? null }, async run() { const r = sqlite.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } } } } }, async batch(statements) { sqlite.exec('BEGIN'); try { const results = []; for (const s of statements) results.push(await s.run()); sqlite.exec('COMMIT'); return results } catch (e) { sqlite.exec('ROLLBACK'); throw e } } }
  const env = { DB, COLLECTOR_KEY: 'test-key-0123456789-0123456789', SOURCE_KEY: 'company:PC-20251130TKZA' }
  const call = (path, method = 'GET', body, headers = {}) => fetchHandler(new Request(`https://example.test${path}`, { method, headers: { 'Content-Type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), env)
  const user = { 'oai-authenticated-user-id': 'fixture-user', Origin: 'https://example.test' }
  const service = { 'X-CP-Collector-Key': env.COLLECTOR_KEY }
  return { env, call, user, service, sqlite }
}
const fixture = () => ({ sourceKey: 'company:PC-20251130TKZA', machine: 'PC-20251130TKZA', capturedAt: new Date().toISOString(), taskReadOK: true, tasks: [{ id: 'tsk_0123456789abcdef', title: 'Synthetic source', status: 'active', phase: 'work', project: null, updated_at: '2026-10-12T00:00:00Z', conditions: [], steps: [{ id: 's1', title: 'Synthetic step', status: 'pending' }], events: [] }], agents: [], capabilities: [], warnings: [] })

test('anonymous data queries and missing ingest key are denied', async () => {
  const { call } = setup()
  assert.equal((await call('/api/state')).status, 401)
  assert.equal((await call('/api/ingest', 'POST', fixture())).status, 401)
})
test('real ingress contract persists readonly source projection and rejects foreign or old source', async () => {
  const { call, service, user } = setup(); const data = fixture()
  assert.equal((await call('/api/ingest', 'POST', { ...data, machine: 'other' }, service)).status, 400)
  assert.equal((await call('/api/ingest', 'POST', data, service)).status, 200)
  const state = await (await call('/api/state', 'GET', undefined, user)).json()
  assert.equal(state.tasks.length, 1); assert.equal(state.nodes.length, 2); assert.equal(state.source.machine, data.machine)
  assert.equal((await call('/api/ingest', 'POST', { ...data, capturedAt: '2026-01-01T00:00:00Z' }, service)).status, 409)
  assert.equal((await call('/api/nodes/src%3Atsk_0123456789abcdef', 'PATCH', { status: 'done' }, user)).status, 400)
  assert.equal((await call('/api/nodes/step%3Atsk_0123456789abcdef%3As1', 'PATCH', { parentId: null }, user)).status, 400)
})
test('failed task capture retains prior facts and reports stale', async () => {
  const { call, service, user } = setup(); const data = fixture()
  await call('/api/ingest', 'POST', data, service)
  await call('/api/ingest', 'POST', { ...data, capturedAt: new Date(Date.now()+100).toISOString(), taskReadOK: false, tasks: [], warnings: ['capture failed'] }, service)
  const state = await (await call('/api/state', 'GET', undefined, user)).json()
  assert.equal(state.tasks.length, 1); assert.equal(state.source.stale, true)
})
test('mutations require browser identity and same origin; keys cannot impersonate a user', async () => {
  const { call, service, user } = setup()
  assert.equal((await call('/api/projects', 'POST', { name: 'fixture' }, service)).status, 401)
  assert.equal((await call('/api/projects', 'POST', { name: 'fixture' }, { ...user, Origin: 'https://foreign.test' })).status, 403)
})
test('hierarchy and dependency persistence reject cycles, cross-project links and invalid parents', async () => {
  const { call, user } = setup()
  const create = async input => { const r = await call('/api/nodes', 'POST', input, user); assert.equal(r.status, 201); return r.json() }
  const epic = await create({ projectId:'preset:USVDS2', kind:'epic', title:'Epic' })
  const feature = await create({ projectId:epic.projectId, kind:'feature', title:'Feature', parentId:epic.id })
  const a = await create({ projectId:epic.projectId, kind:'task', title:'A', parentId:feature.id })
  const b = await create({ projectId:epic.projectId, kind:'task', title:'B', parentId:feature.id, dependencies:[a.id] })
  await create({ projectId:epic.projectId, kind:'subtask', title:'Subtask', parentId:a.id })
  assert.equal((await call(`/api/nodes/${a.id}`, 'PATCH', { dependencies:[b.id] }, user)).status, 400)
  assert.equal((await call('/api/nodes', 'POST', { projectId:'preset:BMAD', kind:'task',title:'foreign',dependencies:[a.id] }, user)).status, 400)
  assert.equal((await call('/api/nodes', 'POST', { projectId:epic.projectId, kind:'epic', title:'bad',parentId:a.id }, user)).status, 400)
  const state = await (await call('/api/state','GET',undefined,user)).json()
  assert.equal(state.nodes.length, 5); assert.equal(state.history.filter(x=>x.kind==='management').length, 5)
})
test('MCP discovery works without private data; authenticated readonly calls work and execution calls fail', async () => {
  const { call, service } = setup()
  const rpc = (method, params, headers={}) => call('/mcp','POST',{jsonrpc:'2.0',id:1,method,params},headers)
  assert.equal((await (await rpc('initialize',{})).json()).result.serverInfo.name, 'AgentDock Control Plane')
  const tools = (await (await rpc('tools/list',{})).json()).result.tools
  assert.equal(tools.length, 5); assert.ok(tools.every(x=>x.annotations.readOnlyHint))
  assert.equal((await rpc('tools/call',{name:'list_projects',arguments:{}})).status,401)
  assert.ok((await (await rpc('tools/call',{name:'list_projects',arguments:{}},service)).json()).result.structuredContent.projects.length>=5)
  assert.equal((await (await rpc('tools/call',{name:'start_task',arguments:{}},service)).json()).error.code,-32601)
})

test('source evidence fields survive projection and ambiguous step IDs are rejected', async () => {
  const { call, service, user } = setup(); const data = fixture()
  data.tasks[0].conditions = [{ id:'c1', text:'Acceptance evidence' }]
  Object.assign(data.tasks[0].steps[0], { phase:'review', updated_at:'2026-10-12T00:00:00Z' })
  data.tasks[0].final_review = { status:'passed', summary:'Reviewed', verified_facts:['Build passed'] }
  data.capabilities = [{ id:'claude',status:'unavailable',description:'Not installed' }]
  assert.equal((await call('/api/ingest','POST',data,service)).status,200)
  const state = await (await call('/api/state','GET',undefined,user)).json()
  assert.deepEqual(state.nodes[0].acceptanceCriteria,['Acceptance evidence'])
  assert.equal(state.tasks[0].steps[0].phase,'review')
  assert.deepEqual(state.tasks[0].final_review.verified_facts,['Build passed'])
  assert.equal(state.capabilities[0].message,'Not installed')
  data.tasks[0].steps.push({...data.tasks[0].steps[0]})
  assert.equal((await call('/api/ingest','POST',data,service)).status,400)
  data.tasks[0].steps = [{id:'',title:'Empty'}]
  assert.equal((await call('/api/ingest','POST',data,service)).status,400)
})

test('offset capture timestamps canonicalize before snapshot persistence', async () => {
  const { call,service,user } = setup(); const data = fixture()
  await call('/api/ingest','POST',data,service)
  const next = new Date(Date.parse(data.capturedAt)+1000)
  data.capturedAt = new Date(next.getTime()+8*3600000).toISOString().replace('Z','+08:00')
  data.tasks[0].title = 'Newer offset snapshot'
  assert.equal((await call('/api/ingest','POST',data,service)).status,200)
  const state = await (await call('/api/state','GET',undefined,user)).json()
  assert.equal(state.source.capturedAt,next.toISOString())
  assert.equal(state.tasks[0].title,'Newer offset snapshot')
})

test('source project changes and removed referenced steps preserve editable management graph', async () => {
  const { call,service,user } = setup(); const data=fixture(); data.tasks[0].project='Original'
  await call('/api/ingest','POST',data,service)
  const projectId='source-project:Original', parentId=`src:${data.tasks[0].id}`
  let response=await call('/api/nodes','POST',{projectId,parentId,kind:'subtask',title:'Local child',dependencies:[`step:${data.tasks[0].id}:s1`]},user)
  assert.equal(response.status,201); const child=await response.json()
  data.tasks[0].project='Moved'; data.tasks[0].steps=[]; data.capturedAt=new Date(Date.parse(data.capturedAt)+1000).toISOString()
  assert.equal((await call('/api/ingest','POST',data,service)).status,200)
  const state=await (await call('/api/state','GET',undefined,user)).json()
  assert.equal(state.nodes.find(n=>n.id===parentId).projectId,projectId)
  assert.equal(state.nodes.find(n=>n.id.endsWith(':s1')).missing,true)
  assert.ok(state.projects.some(p=>p.id===projectId))
  assert.equal((await call(`/api/nodes/${child.id}`,'PATCH',{priority:'high'},user)).status,200)
})

test('five project containers isolate fifty tasks and dependencies persist', async () => {
  const { call,user }=setup()
  for(const name of ['USVDS2','BMAD','Toonflow','Google-TTS','Research Lab']) {
    let previous
    for(let i=0;i<10;i++) {
      const r=await call('/api/nodes','POST',{projectId:`preset:${name}`,kind:'task',title:`${name} ${i}`,dependencies:previous?[previous]:[],acceptanceCriteria:['Verified']},user)
      assert.equal(r.status,201); previous=(await r.json()).id
    }
  }
  const state=await (await call('/api/state','GET',undefined,user)).json()
  assert.equal(state.nodes.length,50)
  for(const project of state.projects.filter(p=>p.id.startsWith('preset:')))assert.equal(state.nodes.filter(n=>n.projectId===project.id).length,10)
})

test('concurrent ingestion and browser edits preserve acknowledged metadata and reject stale validation', async () => {
  const { env,call,service,user }=setup(); const data=fixture(); data.tasks[0].project='Original'
  assert.equal((await call('/api/ingest','POST',data,service)).status,200)
  const id=`src:${data.tasks[0].id}`, path=`/api/nodes/${encodeURIComponent(id)}`
  assert.equal((await call(path,'PATCH',{priority:'low'},user)).status,200)
  const incoming={...data,capturedAt:new Date(Date.parse(data.capturedAt)+1000).toISOString(),tasks:[{...data.tasks[0],project:'Moved',status:'blocked'}]}
  const originalBatch=env.DB.batch.bind(env.DB)
  // Interleave a complete browser write after ingress read/validation, before its commit.
  let beforeBatch=async()=>assert.equal((await call(path,'PATCH',{priority:'urgent'},user)).status,200)
  env.DB.batch=async statements=>{
    const callback=beforeBatch; beforeBatch=null
    if(callback)await callback()
    return originalBatch(statements)
  }
  assert.equal((await call('/api/ingest','POST',incoming,service)).status,409)
  let state=await (await call('/api/state','GET',undefined,user)).json()
  assert.equal(state.nodes.find(n=>n.id===id).priority,'urgent')
  assert.equal(state.source.capturedAt,data.capturedAt)
  assert.equal(state.tasks[0].project,'Original')
  assert.equal(state.history.some(h=>h.kind==='source'&&h.summary.includes('blocked')),false)
  assert.equal((await call('/api/ingest','POST',incoming,service)).status,200)
  state=await (await call('/api/state','GET',undefined,user)).json()
  assert.equal(state.nodes.find(n=>n.id===id).priority,'urgent')
  assert.equal(state.nodes.find(n=>n.id===id).projectId,'source-project:Original')
  assert.equal(state.tasks[0].project,'Moved')
  // In the reverse ordering, an ingress commit invalidates a browser's graph validation.
  const later={...incoming,capturedAt:new Date(Date.parse(incoming.capturedAt)+1000).toISOString(),tasks:[{...incoming.tasks[0],status:'completed'}]}
  beforeBatch=async()=>assert.equal((await call('/api/ingest','POST',later,service)).status,200)
  assert.equal((await call(path,'PATCH',{priority:'low'},user)).status,409)
  state=await (await call('/api/state','GET',undefined,user)).json()
  assert.equal(state.nodes.find(n=>n.id===id).priority,'urgent')
  assert.equal(state.tasks[0].status,'completed')
})
