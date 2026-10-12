import { loadGovernance, loadProjectManagement, contextDigest, approvalIsStale, handleGovernance } from './governance.mjs'
import { applyOwnerRepair } from './repair.mjs'
import { taskRuntime, scopedAgents } from '../shared/task-runtime.mjs'
const SOURCE = 'company:PC-20251130TKZA'
const KINDS = ['epic','feature','task','subtask']
const PRIORITIES = ['low','medium','high','urgent']
const STATUSES = ['pending','active','blocked','failed','completed','canceled']
const PRESETS = ['USVDS2','BMAD','Toonflow','Google-TTS','Research Lab']
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const now = () => new Date().toISOString()
class ApiError extends Error { constructor(message, status=400) { super(message); this.status=status } }
const assert = (condition,message,status) => { if(!condition) throw new ApiError(message,status) }
const text = (value,max=1000,fallback='') => { if(value===undefined||value===null) return fallback; assert(typeof value==='string'&&value.length<=max,'文本字段无效或过长'); return value }
const list = (value,max=2000) => { if(value===undefined) return []; assert(Array.isArray(value)&&value.length<=max,'列表无效或过长'); return value }
const time = value => { const v=text(value,128); assert(v&&Number.isFinite(Date.parse(v)),'时间无效'); return new Date(Date.parse(v)).toISOString() }
const json = (value,status=200) => new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}})
const sameKey = (left,right) => { if(typeof left!=='string'||typeof right!=='string'||right.length<24||left.length!==right.length)return false; let diff=0; for(let i=0;i<left.length;i++)diff|=left.charCodeAt(i)^right.charCodeAt(i); return diff===0 }
const service = (req,env) => sameKey(req.headers.get('X-CP-Collector-Key'),env.COLLECTOR_KEY)
const visitor = req => !!req.headers.get('oai-authenticated-user-id')
const readAccess = (req,env) => assert(visitor(req)||service(req,env),'需要私有 Site 登录或有效服务访问',401)
function writeAccess(req) { assert(visitor(req),'需要 Site 用户身份',401); assert(req.headers.get('Origin')===new URL(req.url).origin,'跨来源写入被拒绝',403) }
async function body(req,limit=16384) { const declared=Number(req.headers.get('Content-Length')); assert(!declared||declared<=limit,'请求过大',413); const value=await req.text(); assert(new TextEncoder().encode(value).length<=limit,'请求过大',413); try { const parsed=JSON.parse(value); assert(plain(parsed),'需要 JSON 对象'); return parsed } catch(error){if(error instanceof ApiError)throw error; throw new ApiError('JSON 无效')} }
const rows = async (db,sql,...args) => (await db.prepare(sql).bind(...args).all()).results
const first = (db,sql,...args) => db.prepare(sql).bind(...args).first()
const run = (db,sql,...args) => db.prepare(sql).bind(...args).run()
const eventStatement = (db,kind,nodeId,summary) => db.prepare('INSERT INTO cp_events (id,kind,node_id,summary,created_at) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),kind,nodeId,summary,now())
async function record(db,kind,nodeId,summary) { await eventStatement(db,kind,nodeId,summary).run(); await run(db,'DELETE FROM cp_events WHERE id NOT IN (SELECT id FROM cp_events ORDER BY created_at DESC LIMIT 1000)') }
async function snapshot(db) { const row=await first(db,'SELECT * FROM cp_snapshots WHERE source_key=?',SOURCE); return row?{...JSON.parse(row.payload),receivedAt:row.received_at}:null }

function sanitizeTask(value) {
  assert(plain(value)&&/^tsk_[a-f0-9]{16}$/.test(value.id),'来源任务 ID 无效')
  const title=text(value.title,1000); assert(title.trim(),'来源任务标题为空')
  const steps=list(value.steps,200).map((s,i)=>{assert(plain(s),'步骤无效');const id=text(s.id,200,`index-${i}`);assert(id.trim(),'步骤 ID 为空');return {id,title:text(s.title,1000),status:text(s.status,64),phase:text(s.phase,128),updated_at:text(s.updated_at,128),summary:text(s.summary,1000),missing:!!s.missing}})
  assert(new Set(steps.map(s=>s.id)).size===steps.length,'重复步骤 ID')
  return {id:value.id,title,status:text(value.status,64),phase:text(value.phase,128),project:text(value.project,200)||null,updated_at:time(value.updated_at),summary:text(value.summary,2000),conditions:list(value.conditions,100).map(x=>text(typeof x==='string'?x:plain(x)?x.text??x.description??x.title:'',1000)),steps,events:list(value.events,10).map(e=>{assert(plain(e),'事件无效');return {type:text(e.type,100),summary:text(e.summary??e.message,1000),created_at:text(e.created_at,128)}}),final_review:plain(value.final_review)?{status:text(value.final_review.status,64),summary:text(value.final_review.summary,2000),verified_facts:list(value.final_review.verified_facts,100).map(v=>text(v,1000))}:null,missing:!!value.missing}
}
function sanitizeAgent(value) {
  assert(plain(value),'Agent 无效'); const id=text(value.id,250);assert(id&&['codex','claude','agentdock'].includes(value.runtime),'Agent 标识无效')
  assert(['Idle','Planning','Running','Waiting Approval','Blocked','Failed','Completed','Unknown'].includes(value.status),'Agent 状态无效')
  return {id,label:text(value.label,300),runtime:value.runtime,source:text(value.source,200),status:value.status,rawStatus:text(value.rawStatus,100),taskId:text(value.taskId,200)||null,currentAction:text(value.currentAction,500)||null,lastActivityAt:text(value.lastActivityAt,128)||null,lastHeartbeatAt:text(value.lastHeartbeatAt,128)||null,observedAt:time(value.observedAt),stale:!!value.stale,present:value.present!==false}
}
async function ingest(req,env) {
  assert(service(req,env),'采集器身份无效',401);assert(!req.headers.has('Origin'),'采集入口不接受浏览器请求',403)
  const input=await body(req,4*1024*1024)
  assert(input.sourceKey===SOURCE&&input.machine==='PC-20251130TKZA','公司来源不匹配')
  await run(env.DB,'INSERT OR IGNORE INTO cp_control(id,revision) VALUES(1,0)')
  const revision=(await first(env.DB,'SELECT revision FROM cp_control WHERE id=1')).revision
  const capturedAt=time(input.capturedAt);assert(Date.parse(capturedAt)<=Date.now()+300000,'采集时间超前')
  const previous=await snapshot(env.DB);assert(!previous||Date.parse(capturedAt)>=Date.parse(previous.capturedAt),'旧快照被拒绝',409)
  const taskReadOK=input.taskReadOK===true
  const incoming=list(input.tasks,2000).map(sanitizeTask)
  assert(new Set(incoming.map(t=>t.id)).size===incoming.length,'重复来源任务')
  const missing=(previous?.tasks??[]).filter(t=>!incoming.some(n=>n.id===t.id)).map(t=>({...t,missing:true}))
  const tasks=taskReadOK?[...incoming,...missing].slice(0,2000):(previous?.tasks??[])
  const capabilities=list(input.capabilities,20).map(v=>{assert(plain(v),'能力无效'); return {id:text(v.id,100),status:text(v.status,100),message:text(v.message??v.reason??v.description,1000)}})
  const agents=list(input.agents,100).map(sanitizeAgent)
  for(const old of previous?.agents??[])if(!agents.some(a=>a.id===old.id))agents.push({...old,status:'Unknown',stale:true,present:capabilities.some(c=>c.id===old.runtime&&c.status==='ok')?false:old.present})
  const warnings=list(input.warnings,30).map(w=>text(w,1000))
  const data={sourceKey:SOURCE,machine:input.machine,capturedAt,taskReadOK,tasks,agents:agents.slice(0,100),capabilities,warnings}
  const saved=(await rows(env.DB,'SELECT * FROM cp_nodes')).map(n=>JSON.parse(n.payload))
  const current=await state(env.DB,{skipApprovals:true})
  const pins=[]
  for(const task of tasks){const old=previous?.tasks.find(t=>t.id===task.id);if(!old)continue;const sourceId=`src:${task.id}`;const related=id=>id===sourceId||id?.startsWith(`step:${task.id}:`)
    const oldMeta=saved.find(n=>n.id===sourceId)
    if(taskReadOK&&old.project!==task.project&&saved.some(n=>related(n.id)||related(n.parentId)||(n.dependencies??[]).some(related))){
      const projectId=oldMeta?.projectId??current.nodes.find(n=>n.id===sourceId)?.projectId??(old.project?sourceProject(old.project):'unassigned')
      const pin={...oldMeta,id:sourceId,origin:'agentdock',projectId}
      pins.push(env.DB.prepare('INSERT INTO cp_nodes(id,payload) SELECT ?,? WHERE (SELECT revision FROM cp_control WHERE id=1)=? AND (SELECT captured_at FROM cp_snapshots WHERE source_key=?)=? ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').bind(sourceId,JSON.stringify(pin),revision,SOURCE,capturedAt))
      const index=saved.findIndex(n=>n.id===sourceId);if(index>=0)saved[index]=pin;else saved.push(pin)
    }
    for(const step of old.steps??[]){const sid=`step:${task.id}:${step.id}`;if(!task.steps.some(s=>s.id===step.id)&&saved.some(n=>n.id===sid||n.parentId===sid||(n.dependencies??[]).includes(sid)))task.steps.push({...step,missing:true})}
  }
  const proposed=await state(env.DB,{snapshot:{...data,receivedAt:now()},metadata:saved.map(n=>({id:n.id,payload:JSON.stringify(n)})),skipApprovals:true})
  validateGraph(proposed.nodes,proposed.projects)
  const statements=[env.DB.prepare("INSERT INTO cp_snapshots (source_key,captured_at,received_at,payload) SELECT ?,?,?,? WHERE (SELECT revision FROM cp_control WHERE id=1)=? AND COALESCE((SELECT captured_at FROM cp_snapshots WHERE source_key=?),'')=? ON CONFLICT(source_key) DO UPDATE SET captured_at=excluded.captured_at,received_at=excluded.received_at,payload=excluded.payload").bind(SOURCE,capturedAt,now(),JSON.stringify(data),revision,SOURCE,previous?.capturedAt??'')]
  const sourceEvent=(kind,id,summary)=>env.DB.prepare('INSERT INTO cp_events(id,kind,node_id,summary,created_at) SELECT ?,?,?,?,? WHERE (SELECT revision FROM cp_control WHERE id=1)=? AND (SELECT captured_at FROM cp_snapshots WHERE source_key=?)=?').bind(crypto.randomUUID(),kind,id,summary,now(),revision,SOURCE,capturedAt)
  if(!previous)statements.push(sourceEvent('source',null,`首次只读同步 ${tasks.length} 个任务`))
  else {
    for(const t of tasks){const old=previous.tasks.find(x=>x.id===t.id);if(!old||old.status!==t.status||old.phase!==t.phase||!!old.missing!==!!t.missing)statements.push(sourceEvent('source',`src:${t.id}`,`${t.id} · ${t.status}/${t.phase}${t.missing?' · 来源缺失':''}`))}
    for(const a of agents){const old=previous.agents.find(x=>x.id===a.id);if(!old||old.status!==a.status||old.present!==a.present)statements.push(sourceEvent('agent',a.id,`${a.label} · ${a.status}${a.stale?' · 过期':''}`))}
  }
  const persisted=await env.DB.batch([...statements.slice(0,250),...pins,env.DB.prepare('UPDATE cp_control SET revision=revision+1 WHERE id=1 AND revision=? AND (SELECT captured_at FROM cp_snapshots WHERE source_key=?)=?').bind(revision,SOURCE,capturedAt)]);assert(persisted[0].meta.changes===1,'任务图或来源已更新，稍后重试同步',409);await run(env.DB,'DELETE FROM cp_events WHERE id NOT IN (SELECT id FROM cp_events ORDER BY created_at DESC LIMIT 1000)')
  const repair=await applyOwnerRepair(env.DB,env,{state,validateGraph,rows,first,now})
  return json({accepted:true,capturedAt,taskCount:tasks.length,agentCount:agents.length,taskReadOK,...(repair?{repair}:{})})
}

function sourceProject(name) { return `source-project:${encodeURIComponent(name)}` }
async function state(db, options={}) {
  const snap=options.snapshot??await snapshot(db), storedProjects=await rows(db,'SELECT * FROM cp_projects ORDER BY name'), metadata=options.metadata??await rows(db,'SELECT * FROM cp_nodes')
  const overlays=new Map(metadata.map(row=>[row.id,JSON.parse(row.payload)]))
  const management=await loadProjectManagement(db), records=await loadGovernance(db)
  const projectLinks=options.projectLinks??management.projectLinks
  const aliases=new Map(projectLinks.map(l=>[l.sourceProjectId,l.targetProjectId]))
  const projects=[...PRESETS.map(name=>({id:`preset:${name}`,name,owner:'',goal:'预置管理容器',archived:false})),...storedProjects.map(p=>({...p,archived:!!p.archived})),{id:'unassigned',name:'未归属',owner:'',goal:'来源未明确提供项目',archived:false}]
  for(const task of snap?.tasks??[])if(task.project&&!projects.some(p=>p.id===sourceProject(task.project)))projects.push({id:sourceProject(task.project),name:task.project,owner:'',goal:'来源明确项目字段',archived:false})
  for(const meta of overlays.values())if(meta.projectId?.startsWith('source-project:')&&!projects.some(p=>p.id===meta.projectId)){projects.push({id:meta.projectId,name:decodeURIComponent(meta.projectId.slice('source-project:'.length)),owner:'',goal:'保留的历史管理归属',archived:false})}
  for(const id of [...management.profiles.map(p=>p.id),...projectLinks.map(l=>l.sourceProjectId),...Object.values(records).flat().map(r=>r.projectId)])if(!projects.some(p=>p.id===id)&&id.startsWith('source-project:'))projects.push({id,name:decodeURIComponent(id.slice('source-project:'.length)),owner:'',goal:'保留的历史管理归属',archived:false})
  for(const project of projects)Object.assign(project,{phase:'',status:'active'},management.profiles.find(p=>p.id===project.id)??{})
  const nodes=[]
  for(const t of snap?.tasks??[]){
    const id=`src:${t.id}`, overlay=overlays.get(id)??{}, projectId=overlay.projectId??(t.project?(aliases.get(sourceProject(t.project))??sourceProject(t.project)):'unassigned')
    nodes.push({...overlay,id,projectId,parentId:overlay.parentId??null,kind:'task',title:t.title,status:t.status,priority:overlay.priority??'medium',owner:overlay.owner??'',agentId:overlay.agentId??'',acceptanceCriteria:t.conditions,dependencies:overlay.dependencies??[],origin:'agentdock',sourceTaskId:t.id,missing:t.missing})
    for(const s of t.steps){if(nodes.length>=10000)break;const sid=`step:${t.id}:${s.id}`, meta=overlays.get(sid)??{};nodes.push({...meta,id:sid,projectId,parentId:id,kind:'subtask',title:s.title,status:s.status,priority:meta.priority??'medium',owner:meta.owner??'',agentId:meta.agentId??'',acceptanceCriteria:[],dependencies:meta.dependencies??[],origin:'agentdock',sourceTaskId:t.id,missing:t.missing||s.missing})}
  }
  for(const value of overlays.values())if(value.origin==='local')nodes.push(value)
  const stale=!snap||!snap.taskReadOK||[snap.capturedAt,snap.receivedAt].some(value=>!Number.isFinite(Date.parse(value))||Date.now()-Date.parse(value)>90000)
  const agents=(snap?.agents??[]).map(a=>({...a,stale:a.stale||Date.now()-Date.parse(a.observedAt)>60000,status:a.stale||Date.now()-Date.parse(a.observedAt)>60000?'Unknown':a.status})).sort((a,b)=>Number(a.stale)-Number(b.stale)||String(b.lastActivityAt).localeCompare(String(a.lastActivityAt)))
  const data={projects,nodes,tasks:snap?.tasks??[],projectLinks,...records,agents,capabilities:snap?.capabilities??[],history:(await rows(db,'SELECT * FROM cp_events ORDER BY created_at DESC LIMIT 1000')).map(e=>({id:e.id,kind:e.kind,nodeId:e.node_id,summary:e.summary,createdAt:e.created_at,projectId:nodes.find(n=>n.id===e.node_id)?.projectId??null})),source:{machine:snap?.machine??'PC-20251130TKZA',sourceKey:SOURCE,capturedAt:snap?.capturedAt??null,receivedAt:snap?.receivedAt??null,stale,taskReadOK:snap?.taskReadOK??false,taskCount:snap?.tasks.filter(t=>!t.missing).length??0,warnings:snap?.warnings??[]}}
  for(const event of data.history){try{const audit=JSON.parse(event.summary);if(audit&&typeof audit==='object'&&audit.actorId)Object.assign(event,audit)}catch{}}
  const digests=new Map()
  if(!options.skipApprovals)data.approvals=await Promise.all(data.approvals.map(async a=>({...a,isStale:await approvalIsStale(data,a,digests)})))
  return data
}

function validateGraph(nodes,projects) {
  const map=new Map(nodes.map(n=>[n.id,n]))
  for(const n of nodes){assert(projects.some(p=>p.id===n.projectId),'项目不存在');assert(KINDS.includes(n.kind)&&PRIORITIES.includes(n.priority),'类型或优先级无效')
    if(n.parentId){const parent=map.get(n.parentId);assert(parent&&parent.projectId===n.projectId&&KINDS.indexOf(parent.kind)<KINDS.indexOf(n.kind),'父节点无效或跨项目')}
    for(const id of n.dependencies){const other=map.get(id);assert(other&&id!==n.id&&other.projectId===n.projectId,'依赖无效或跨项目')}
  }
  const active=new Set(),finished=new Set();const visit=id=>{assert(!active.has(id),'循环依赖');if(finished.has(id))return;active.add(id);for(const dep of map.get(id).dependencies)visit(dep);active.delete(id);finished.add(id)};for(const id of map.keys())visit(id)
}
async function manageNode(req,env,id) {
  writeAccess(req);const input=await body(req)
  await run(env.DB,'INSERT OR IGNORE INTO cp_control (id,revision) VALUES (1,0)')
  const revision=(await first(env.DB,'SELECT revision FROM cp_control WHERE id=1')).revision
  const current=await state(env.DB), old=id?current.nodes.find(n=>n.id===id):null
  if(id)assert(old,'节点不存在',404)
  const allowed=old?.origin==='agentdock'?['projectId','parentId','priority','owner','agentId','dependencies']:['projectId','parentId','kind','title','status','priority','owner','agentId','acceptanceCriteria','dependencies']
  assert(Object.keys(input).every(key=>allowed.includes(key)),'来源业务字段或未知字段不可修改')
  if(id?.startsWith('step:'))assert(!('parentId'in input)&&(!('projectId'in input)||input.projectId===old.projectId),'来源步骤父级与归属固定')
  const node={id:id??`local:${crypto.randomUUID()}`,projectId:input.projectId??old?.projectId,parentId:input.parentId===undefined?old?.parentId??null:input.parentId,kind:input.kind??old?.kind??'task',title:input.title??old?.title??'',status:input.status??old?.status??'pending',priority:input.priority??old?.priority??'medium',owner:input.owner??old?.owner??'',agentId:input.agentId??old?.agentId??'',acceptanceCriteria:input.acceptanceCriteria??old?.acceptanceCriteria??[],dependencies:input.dependencies??old?.dependencies??[],origin:old?.origin??'local',sourceTaskId:old?.sourceTaskId??null,missing:old?.missing??false}
  node.projectId=text(node.projectId,500);node.parentId=node.parentId===null?null:text(node.parentId,500);node.title=text(node.title,1000);assert(node.title.trim(),'标题为空');node.owner=text(node.owner,300);node.agentId=text(node.agentId,250);node.acceptanceCriteria=list(node.acceptanceCriteria,100).map(x=>text(x,1000));node.dependencies=[...new Set(list(node.dependencies,100).map(x=>text(x,500)))];assert(node.origin==='agentdock'||STATUSES.includes(node.status),'本地状态无效')
  const nodes=current.nodes.filter(n=>n.id!==node.id);nodes.push(node)
  if(node.origin==='agentdock'&&!node.id.startsWith('step:'))for(const step of nodes.filter(n=>n.id.startsWith(`step:${node.sourceTaskId}:`)))step.projectId=node.projectId
  validateGraph(nodes,current.projects)
  const persisted={...node},prior=await first(env.DB,'SELECT payload FROM cp_nodes WHERE id=?',node.id)
  // Presence of a stored projectId denotes an explicit override (including legacy records and graph pins).
  // A priority/owner-only edit keeps an inherited alias reversible.
  if(node.origin==='agentdock'&&!('projectId'in input)&&!JSON.parse(prior?.payload??'{}').projectId)delete persisted.projectId
  const statements=[env.DB.prepare('INSERT INTO cp_nodes (id,payload) SELECT ?,? WHERE (SELECT revision FROM cp_control WHERE id=1)=? ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').bind(node.id,JSON.stringify(persisted),revision),env.DB.prepare('UPDATE cp_control SET revision=revision+1 WHERE id=1 AND revision=?').bind(revision)]
  const result=await env.DB.batch(statements);assert(result[0].meta.changes===1,'任务图已更新，请刷新后重试',409)
  await record(env.DB,'management',node.id,`${old?'更新':'创建'} ${node.kind}：${node.title}`)
  return json(node,old?200:201)
}

const TOOL_NAMES=['list_projects','get_task_graph','get_task','list_agents','get_execution_history','list_approvals','list_decisions','list_artifacts']
const TOOL_DESCRIPTIONS=['查看私有项目列表','查看项目任务层级与依赖图','查看来源任务详情与执行事件','查看 Agent 真实证据、未知与过期状态','查看执行观察与管理历史','查看人工验收请求与版本过期状态','查看项目决策记录','查看版本化产物引用']
async function mcp(req,env) {
  assert(req.method==='POST','MCP 使用 POST',405);const message=await body(req)
  assert(message.jsonrpc==='2.0'&&typeof message.method==='string','JSON-RPC 无效')
  if(message.id===undefined)return new Response(null,{status:202})
  const reply=result=>json({jsonrpc:'2.0',id:message.id,result})
  if(message.method==='initialize')return reply({protocolVersion:['2024-11-05','2025-03-26','2025-06-18','2025-11-25'].includes(message.params?.protocolVersion)?message.params.protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'AgentDock Control Plane',version:'0.1.0'}})
  if(message.method==='ping')return reply({})
  if(message.method==='tools/list')return reply({tools:TOOL_NAMES.map((name,i)=>({name,description:TOOL_DESCRIPTIONS[i],inputSchema:{type:'object',properties:{projectId:{type:'string'},taskId:{type:'string'},limit:{type:'integer',minimum:1,maximum:100}},additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},securitySchemes:[{type:'oauth2',scopes:[]}]}))})
  if(message.method!=='tools/call'||!TOOL_NAMES.includes(message.params?.name))return json({jsonrpc:'2.0',id:message.id,error:{code:-32601,message:'仅支持已注册的只读工具'}})
  readAccess(req,env);const args=message.params.arguments??{};assert(plain(args)&&Object.keys(args).every(k=>['projectId','taskId','limit'].includes(k)),'工具参数无效');const limit=args.limit??100;assert(Number.isInteger(limit)&&limit>0&&limit<=100,'limit 无效');const data=await state(env.DB)
  for(const key of ['projectId','taskId'])if(key in args)assert(typeof args[key]==='string'&&args[key].length<=500,'工具筛选参数无效')
  const taskNodes=args.taskId?new Set(data.nodes.filter(n=>n.id===args.taskId||n.sourceTaskId===args.taskId).map(n=>n.id)):null
  const sourceTaskId=/^tsk_[a-f0-9]{16}$/.test(args.taskId??'')?args.taskId:null
  // A historical source step keeps its encoded task anchor even after leaving the current graph.
  const matchesTask=nodeId=>!taskNodes||nodeId===args.taskId||taskNodes.has(nodeId)||(sourceTaskId&&(nodeId===`src:${sourceTaskId}`||nodeId?.startsWith(`step:${sourceTaskId}:`)))
  const filter=items=>items.filter(item=>(!args.projectId||item.projectId===args.projectId)&&matchesTask(item.nodeId)).slice(0,limit)
  const associated=key=>filter(data[key])
  let result
  switch(message.params.name){
    case 'list_projects':result={projects:data.projects};break
    case 'get_task_graph':result={nodes:args.projectId?data.nodes.filter(n=>n.projectId===args.projectId):data.nodes,source:data.source};break
    case 'get_task':{
      assert(typeof args.taskId==='string','taskId 必填')
      const node=data.nodes.find(n=>n.id===args.taskId||n.id===`src:${args.taskId}`)
      const inProject=node&&(!args.projectId||node.projectId===args.projectId)
      result={task:inProject?(data.tasks.find(t=>node.kind==='task'&&t.id===node.sourceTaskId)??node):null,runtime:inProject?taskRuntime(data,node.id):null,contextDigest:inProject?await contextDigest(data,node):null,approvals:associated('approvals'),decisions:associated('decisions'),artifacts:associated('artifacts'),source:data.source};break
    }
    case 'list_agents':result={agents:scopedAgents(data,args).slice(0,limit),capabilities:data.capabilities,source:data.source};break
    case 'list_approvals':result={approvals:filter(data.approvals)};break
    case 'list_decisions':result={decisions:filter(data.decisions)};break
    case 'list_artifacts':result={artifacts:filter(data.artifacts)};break
    default:result={history:filter(data.history),source:data.source}
  }
  return reply({content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result,isError:false})
}

export async function fetchHandler(req,env,assets={}) {
  try {const url=new URL(req.url),path=url.pathname
    if(path==='/health')return json({ok:true,version:'P0-cloud'})
    if(path==='/mcp')return await mcp(req,env)
    if(path==='/api/ingest'&&req.method==='POST')return await ingest(req,env)
    if(path==='/api/state'&&req.method==='GET'){readAccess(req,env);return json(await state(env.DB))}
    const contextMatch=path.match(/^\/api\/nodes\/([^/]+)\/context$/)
    if(contextMatch&&req.method==='GET'){
      readAccess(req,env);const id=decodeURIComponent(contextMatch[1]);assert(id.length<=500,'节点 ID 无效')
      const data=await state(env.DB,{skipApprovals:true}),node=data.nodes.find(n=>n.id===id);assert(node,'节点不存在',404)
      return json({nodeId:node.id,projectId:node.projectId,contextDigest:await contextDigest(data,node)})
    }
    const governance=await handleGovernance(req,env,path,{assert,text,list,body,writeAccess,state,first,run,now,json,validateGraph});if(governance)return governance
    if(path==='/api/projects'&&req.method==='POST'){writeAccess(req);const input=await body(req);const name=text(input.name,200).trim();assert(name,'项目名称为空');const current=await state(env.DB);assert(!current.projects.some(p=>p.name===name),'项目名称已存在',409);const project={id:`project:${crypto.randomUUID()}`,name,owner:text(input.owner,300),goal:text(input.goal,2000),archived:false};await run(env.DB,'INSERT INTO cp_projects (id,name,owner,goal,archived) VALUES (?,?,?,?,0)',project.id,name,project.owner,project.goal);await record(env.DB,'management',null,`创建项目：${name}`);return json(project,201)}
    if(path==='/api/nodes'&&req.method==='POST')return await manageNode(req,env)
    if(path.startsWith('/api/nodes/')&&req.method==='PATCH')return await manageNode(req,env,decodeURIComponent(path.slice('/api/nodes/'.length)))
    if(req.method==='GET'&&['/','/app.js','/style.css'].includes(path)){readAccess(req,env);const content=path==='/'?assets.html:path==='/app.js'?assets.js:assets.css;return new Response(content??'',{headers:{'Content-Type':path==='/'?'text/html; charset=utf-8':path==='/app.js'?'text/javascript; charset=utf-8':'text/css; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'"}})}
    return json({error:'接口不存在或操作未开放'},404)
  }catch(error){return json({error:error instanceof ApiError?error.message:'服务暂不可用，请刷新后重试'},error instanceof ApiError?error.status:500)}
}
