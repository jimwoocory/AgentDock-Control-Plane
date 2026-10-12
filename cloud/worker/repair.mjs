import { contextDigest } from './governance.mjs'

// Administrative one-time backfill supplied ONLY by the Site owner's runtime
// configuration. No HTTP/MCP input can request a repair or choose its contents.
const ACTOR='site-owner-config-repair'
class RepairError extends Error {}
const check=(ok,message)=>{if(!ok)throw new RepairError(message)}
const object=v=>v&&typeof v==='object'&&!Array.isArray(v)
const keys=(v,allowed)=>check(object(v)&&Object.keys(v).every(k=>allowed.includes(k)),'修复计划含未允许字段')
const string=(v,max,optional=false)=>{check(typeof v==='string'&&v.length<=max&&(optional||v.trim()),'修复文本无效');return v}
const id=v=>{string(v,100);check(/^[a-zA-Z0-9_-]+$/.test(v),'修复记录ID无效');return v}
const digest=async raw=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw))),b=>b.toString(16).padStart(2,'0')).join('')

export async function applyOwnerRepair(db,env,{state,validateGraph,rows,first,now}) {
  const parts=Array.from({length:8},(_,i)=>env[`CP_OWNER_REPAIR_PART_${i+1}`])
  if(!env.CP_OWNER_REPAIR_SHA256&&!parts.some(p=>p!==undefined))return undefined
  try {
    check(/^[a-f0-9]{64}$/.test(env.CP_OWNER_REPAIR_SHA256||''),'修复配置指纹无效')
    let stopped=false,raw=''
    for(const part of parts){if(part===undefined){stopped=true;continue}check(!stopped&&typeof part==='string','修复配置分段缺失');raw+=part}
    check(raw.length>0&&new TextEncoder().encode(raw).length<=64000,'修复配置大小无效')
    const hash=await digest(raw);check(hash===env.CP_OWNER_REPAIR_SHA256,'修复配置指纹不匹配')
    let plan;try{plan=JSON.parse(raw)}catch{throw new RepairError('修复配置JSON无效')}
    keys(plan,['id','expiresAt','reason','mappings','artifacts','approval']);id(plan.id);string(plan.reason,1000)
    const existing=await first(db,'SELECT payload FROM cp_repairs WHERE id=?',plan.id)
    if(existing){check(JSON.parse(existing.payload).planDigest===hash,'修复ID已用于其他内容');return {status:'already_applied',id:plan.id}}
    check(typeof plan.expiresAt==='string'&&Number.isFinite(Date.parse(plan.expiresAt))&&Date.parse(plan.expiresAt)>Date.now(),'修复计划已过期')
    check(Array.isArray(plan.mappings)&&plan.mappings.length>0&&plan.mappings.length<=27,'修复归属数量无效')
    check(Array.isArray(plan.artifacts)&&plan.artifacts.length<=5,'修复产物数量无效')
    const revision=(await first(db,'SELECT revision FROM cp_control WHERE id=1')).revision
    const current=await state(db,{skipApprovals:true});check(!current.source.stale,'来源不新鲜，修复暂缓')
    const saved=await rows(db,'SELECT * FROM cp_nodes'),metadata=new Map(saved.map(row=>[row.id,{...row}]))
    const originalMetadata=[],seen=new Set()
    for(const m of plan.mappings){
      keys(m,['taskId','expectedProjectId','targetProjectId']);check(/^tsk_[a-f0-9]{16}$/.test(m.taskId),'只能修复来源Task根节点')
      check(!seen.has(m.taskId),'修复任务重复');seen.add(m.taskId)
      string(m.expectedProjectId,500);string(m.targetProjectId,500)
      const node=current.nodes.find(n=>n.id===`src:${m.taskId}`),project=current.projects.find(p=>p.id===m.targetProjectId)
      check(node&&node.origin==='agentdock'&&!node.missing&&node.projectId===m.expectedProjectId,'任务归属已变化或来源缺失')
      check(project&&!project.archived&&/^(preset:|project:)/.test(project.id),'目标管理项目无效')
      const old=metadata.get(node.id);originalMetadata.push({id:node.id,payload:old?.payload??null})
      // Persist only management metadata, never source title/status/criteria.
      metadata.set(node.id,{id:node.id,payload:JSON.stringify({...JSON.parse(old?.payload??'{}'),id:node.id,origin:'agentdock',projectId:m.targetProjectId})})
    }
    const proposed=await state(db,{metadata:[...metadata.values()],skipApprovals:true});validateGraph(proposed.nodes,proposed.projects)
    const at=now(),artifacts=[]
    for(const a of plan.artifacts){
      keys(a,['id','projectId','nodeId','name','version','description','referenceType','reference','sha256','agentId']);id(a.id)
      check(proposed.projects.some(p=>p.id===a.projectId),'产物项目不存在')
      check(a.nodeId===null||proposed.nodes.some(n=>n.id===a.nodeId&&n.projectId===a.projectId),'产物任务不存在或跨项目')
      string(a.name,300);string(a.version,100);string(a.description,4000,true);string(a.reference,2000);string(a.agentId,250,true)
      check(a.referenceType==='path'&&!/[\u0000-\u001f\u007f]/.test(a.reference)&&(/^[a-z]:[\\/]/i.test(a.reference)||a.reference.startsWith('/')),'修复只登记绝对本地路径，不读取或上传文件')
      check(/^[a-f0-9]{64}$/.test(a.sha256),'必须提供已核对的实际产物SHA256')
      check(![...current.artifacts,...artifacts].some(v=>v.id===a.id||(v.projectId===a.projectId&&v.nodeId===a.nodeId&&v.name===a.name&&v.version===a.version)),'产物ID或版本已存在')
      artifacts.push({...a,actorId:ACTOR,createdAt:at,archived:false})
    }
    let approval=null
    if(plan.approval!==null){
      const a=plan.approval;keys(a,['id','projectId','nodeId','report','artifactIds','expectedContextDigest']);id(a.id);string(a.report,8000)
      const node=proposed.nodes.find(n=>n.id===a.nodeId&&n.projectId===a.projectId)
      check(node&&!node.missing&&!current.approvals.some(r=>r.id===a.id),'验收任务或请求ID无效')
      check(Array.isArray(a.artifactIds)&&a.artifactIds.length<=5&&new Set(a.artifactIds).size===a.artifactIds.length,'验收产物列表无效')
      for(const artifactId of a.artifactIds)check([...current.artifacts,...artifacts].some(r=>r.id===artifactId&&r.projectId===a.projectId&&!r.archived),'验收产物缺失或跨项目')
      const context=await contextDigest(proposed,node);check(context===a.expectedContextDigest,'验收任务指纹已变化')
      approval={id:a.id,projectId:a.projectId,nodeId:a.nodeId,report:a.report,artifactIds:a.artifactIds,contextDigest:context,actorId:ACTOR,createdAt:at,status:'pending',reviewedAt:null,reviewComment:'',reviewerId:null}
    }
    check(current.artifacts.length+artifacts.length<=1000&&current.approvals.length+(approval?1:0)<=1000,'治理记录数量达到上限')
    const guarded=(sql,...args)=>db.prepare(sql).bind(...args,revision)
    const event=(kind,nodeId,record)=>guarded('INSERT INTO cp_events(id,kind,node_id,summary,created_at) SELECT ?,?,?,?,? WHERE (SELECT revision FROM cp_control WHERE id=1)=?',crypto.randomUUID(),kind,nodeId,JSON.stringify({...record,actorId:ACTOR,repairId:plan.id}),at)
    const statements=[]
    for(const m of plan.mappings){const nodeId=`src:${m.taskId}`;statements.push(guarded('INSERT INTO cp_nodes(id,payload) SELECT ?,? WHERE (SELECT revision FROM cp_control WHERE id=1)=? ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',nodeId,metadata.get(nodeId).payload));statements.push(event('owner_repair',nodeId,{projectId:m.targetProjectId,previousProjectId:m.expectedProjectId,summary:plan.reason}))}
    for(const a of artifacts){statements.push(guarded('INSERT INTO cp_artifacts(id,project_id,node_id,name,version,payload) SELECT ?,?,?,?,?,? WHERE (SELECT revision FROM cp_control WHERE id=1)=?',a.id,a.projectId,a.nodeId??'',a.name,a.version,JSON.stringify(a)));statements.push(event('artifact',a.nodeId,{projectId:a.projectId,recordId:a.id,summary:'登记已核对的实际报告引用'}))}
    if(approval){statements.push(guarded('INSERT INTO cp_approvals(id,project_id,node_id,payload) SELECT ?,?,?,? WHERE (SELECT revision FROM cp_control WHERE id=1)=?',approval.id,approval.projectId,approval.nodeId,JSON.stringify(approval)));statements.push(event('approval',approval.nodeId,{projectId:approval.projectId,recordId:approval.id,summary:'提交真实验收缺口报告；等待人工审批'}))}
    const journal={id:plan.id,planDigest:hash,appliedAt:at,actorId:ACTOR,originalMetadata,mappings:plan.mappings,artifactIds:artifacts.map(a=>a.id),approvalId:approval?.id??null}
    statements.push(guarded('INSERT INTO cp_repairs(id,payload) SELECT ?,? WHERE (SELECT revision FROM cp_control WHERE id=1)=?',plan.id,JSON.stringify(journal)))
    statements.push(guarded('DELETE FROM cp_events WHERE id NOT IN (SELECT id FROM cp_events ORDER BY created_at DESC LIMIT 1000) AND (SELECT revision FROM cp_control WHERE id=1)=?'))
    statements.push(db.prepare('UPDATE cp_control SET revision=revision+1 WHERE id=1 AND revision=?').bind(revision))
    const result=await db.batch(statements);check(result[0].meta.changes===1,'管理数据并发变化，修复暂缓')
    return {status:'applied',id:plan.id,mappingCount:plan.mappings.length,artifactCount:artifacts.length,approvalId:approval?.id??null}
  } catch(error) {
    // Collection has already succeeded. A blocked repair must not make the
    // source disappear or grant the collector ordinary management permissions.
    return {status:'blocked',error:error instanceof RepairError?error.message:'修复暂不可用；正常来源同步保留'}
  }
}
