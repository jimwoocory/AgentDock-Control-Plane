// Independent management records. Nothing here executes tasks or reads artifact files.
const TABLES={approvals:'cp_approvals',decisions:'cp_decisions',artifacts:'cp_artifacts'}
export async function loadGovernance(db) {
  const records={}
  for(const [key,table] of Object.entries(TABLES))records[key]=(await db.prepare(`SELECT payload FROM ${table} ORDER BY rowid DESC LIMIT 1000`).all()).results.map(r=>JSON.parse(r.payload))
  return records
}
export async function loadProjectManagement(db) {
  const projectLinks=(await db.prepare('SELECT * FROM cp_project_links ORDER BY source_project_id').all()).results.map(r=>({sourceProjectId:r.source_project_id,targetProjectId:r.target_project_id,reason:r.reason}))
  const profiles=(await db.prepare('SELECT * FROM cp_project_profiles').all()).results.map(r=>({id:r.id,...JSON.parse(r.payload)}))
  return {projectLinks,profiles}
}
export async function contextDigest(data,node) {
  if(!node)return null
  // Collection time and history are observation metadata; source business versions are not.
  const source=node.origin==='agentdock'?data.tasks.find(t=>t.id===node.sourceTaskId):null
  const task=source?{...source,events:undefined}:null
  const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,canonical(value[k])])):value
  const bytes=new TextEncoder().encode(JSON.stringify(canonical({node,task,taskReadOK:source?data.source.taskReadOK:undefined})))
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('')
}
export async function approvalIsStale(data,approval,digests=new Map()) {
  const node=data.nodes.find(n=>n.id===approval.nodeId)
  if(!node||node.projectId!==approval.projectId||node.missing||(node.origin==='agentdock'&&data.source.stale))return true
  if(!digests.has(node.id))digests.set(node.id,contextDigest(data,node))
  return await digests.get(node.id)!==approval.contextDigest
}
export async function handleGovernance(req,env,path,api) {
  const {assert,text,list,body,writeAccess,state,first,run,now,json,validateGraph}=api
  const projectPatch=path.startsWith('/api/projects/')&&req.method==='PATCH'
  const alias=path==='/api/project-links'&&req.method==='POST'
  const reviewMatch=path.match(/^\/api\/approvals\/([^/]+)\/review$/)
  const review=reviewMatch&&req.method==='POST'
  const artifactMatch=path.match(/^\/api\/artifacts\/([^/]+)$/)
  const archive=artifactMatch&&req.method==='PATCH'
  const type=Object.keys(TABLES).find(key=>path===`/api/${key}`&&req.method==='POST')
  if(!projectPatch&&!alias&&!review&&!archive&&!type)return null
  writeAccess(req)
  const input=await body(req),db=env.DB
  await run(db,'INSERT OR IGNORE INTO cp_control(id,revision) VALUES(1,0)')
  const revision=(await first(db,'SELECT revision FROM cp_control WHERE id=1')).revision
  const data=await state(db)
  const actorId=text(req.headers.get('oai-authenticated-user-id'),300);assert(actorId.trim(),'用户身份无效',401)
  const keys=allowed=>assert(Object.keys(input).every(k=>allowed.includes(k)),'未知字段或审计身份不可指定')
  const required=(v,max)=>{const s=text(v,max);assert(s.trim(),'必填文本为空');return s.trim()}
  const identifier=v=>required(v,500)
  const scope=mandatory=>{
    const projectId=identifier(input.projectId);assert(data.projects.some(p=>p.id===projectId),'项目不存在')
    assert(input.nodeId===null||typeof input.nodeId==='string','任务关联必须明确指定')
    const nodeId=input.nodeId===null?null:identifier(input.nodeId)
    assert(!mandatory||nodeId,'任务节点必填')
    const node=nodeId?data.nodes.find(n=>n.id===nodeId):null
    if(nodeId)assert(node&&node.projectId===projectId,'任务不存在或跨项目')
    return {projectId,nodeId,node}
  }
  // Every mutation and its event use the same global CAS, shared with source ingest.
  const commit=async(statement,event)=>{
    const audit={...event,actorId}
    const e=db.prepare('INSERT INTO cp_events(id,kind,node_id,summary,created_at) SELECT ?,?,?,?,? WHERE (SELECT revision FROM cp_control WHERE id=1)=?').bind(crypto.randomUUID(),event.kind,event.nodeId??null,JSON.stringify(audit),now(),revision)
    const trim=db.prepare('DELETE FROM cp_events WHERE (SELECT revision FROM cp_control WHERE id=1)=? AND id NOT IN (SELECT id FROM cp_events ORDER BY created_at DESC,rowid DESC LIMIT 1000)').bind(revision)
    const result=await db.batch([statement,e,trim,db.prepare('UPDATE cp_control SET revision=revision+1 WHERE id=1 AND revision=?').bind(revision)])
    assert(result[0].meta.changes===1,'数据已更新，请刷新后重试',409)
  }
  const guarded=(sql,...params)=>db.prepare(sql).bind(...params,revision)
  if(projectPatch){
    keys(['owner','goal','phase','status','archived']);assert(Object.keys(input).length,'没有更新字段')
    const id=identifier(decodeURIComponent(path.slice('/api/projects/'.length))),project=data.projects.find(p=>p.id===id);assert(project,'项目不存在',404)
    const saved=await first(db,'SELECT id FROM cp_project_profiles WHERE id=?',id)
    if(!saved)assert((await first(db,'SELECT COUNT(*) AS count FROM cp_project_profiles')).count<1000,'项目资料数量达到上限',409)
    const profile={owner:project.owner,goal:project.goal,phase:project.phase,status:project.status,archived:project.archived}
    for(const key of ['owner','goal','phase'])if(key in input)profile[key]=text(input[key],key==='goal'?2000:300)
    if('status'in input){assert(['active','paused','completed'].includes(input.status),'项目状态无效');profile.status=input.status}
    if('archived'in input){assert(typeof input.archived==='boolean','归档字段必须为布尔值');profile.archived=input.archived}
    await commit(guarded('INSERT INTO cp_project_profiles(id,payload) SELECT ?,? WHERE (SELECT revision FROM cp_control WHERE id=1)=? ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',id,JSON.stringify(profile)),{kind:'project_profile',projectId:id,summary:'更新项目管理资料'})
    return json({...project,...profile})
  }
  if(alias){
    keys(['sourceProjectId','targetProjectId','reason'])
    const sourceProjectId=identifier(input.sourceProjectId),reason=required(input.reason,1000)
    assert(sourceProjectId.startsWith('source-project:')&&data.projects.some(p=>p.id===sourceProjectId),'来源项目无效')
    assert(input.targetProjectId===null||typeof input.targetProjectId==='string','目标项目无效')
    const targetProjectId=input.targetProjectId===null?null:identifier(input.targetProjectId)
    if(targetProjectId)assert(data.projects.some(p=>p.id===targetProjectId)&&(targetProjectId.startsWith('preset:')||targetProjectId.startsWith('project:')),'别名目标只能为预置或本地项目')
    const links=data.projectLinks.filter(p=>p.sourceProjectId!==sourceProjectId)
    if(targetProjectId){assert(links.length<1000,'项目别名数量达到上限',409);links.push({sourceProjectId,targetProjectId,reason})}
    const proposed=await state(db,{projectLinks:links})
    validateGraph(proposed.nodes,proposed.projects)
    let statement=targetProjectId?guarded('INSERT INTO cp_project_links(source_project_id,target_project_id,reason) SELECT ?,?,? WHERE (SELECT revision FROM cp_control WHERE id=1)=? ON CONFLICT(source_project_id) DO UPDATE SET target_project_id=excluded.target_project_id,reason=excluded.reason',sourceProjectId,targetProjectId,reason):guarded('DELETE FROM cp_project_links WHERE source_project_id=? AND (SELECT revision FROM cp_control WHERE id=1)=?',sourceProjectId)
    // An absent relation still needs CAS: a concurrent creation must not survive an acknowledged revoke.
    if(!targetProjectId&&!data.projectLinks.some(l=>l.sourceProjectId===sourceProjectId))statement=guarded('UPDATE cp_control SET revision=revision WHERE id=1 AND revision=?')
    await commit(statement,{kind:'project_link',projectId:targetProjectId??sourceProjectId,summary:reason,sourceProjectId,targetProjectId})
    return json({sourceProjectId,targetProjectId,reason})
  }
  if(review){
    keys(['decision','comment']);assert(['approved','rejected','changes_requested'].includes(input.decision),'审批决定无效')
    const comment=required(input.comment,4000),id=identifier(decodeURIComponent(reviewMatch[1])),old=data.approvals.find(a=>a.id===id)
    assert(old,'审批记录不存在',404);assert(old.status==='pending','审批请求已审查',409);assert(!old.isStale,'请求内容已过期，请创建新请求',409)
    const record={...old,status:input.decision,reviewedAt:now(),reviewComment:comment,reviewerId:actorId};delete record.isStale
    await commit(guarded('UPDATE cp_approvals SET payload=? WHERE id=? AND (SELECT revision FROM cp_control WHERE id=1)=?',JSON.stringify(record),id),{kind:'approval_review',projectId:old.projectId,nodeId:old.nodeId,approvalId:id,decision:input.decision,summary:comment})
    return json({...record,isStale:false})
  }
  if(archive){
    keys(['archived']);assert(typeof input.archived==='boolean','归档字段必须为布尔值')
    const id=identifier(decodeURIComponent(artifactMatch[1])),old=data.artifacts.find(a=>a.id===id);assert(old,'产物不存在',404)
    const record={...old,archived:input.archived}
    await commit(guarded('UPDATE cp_artifacts SET payload=? WHERE id=? AND (SELECT revision FROM cp_control WHERE id=1)=?',JSON.stringify(record),id),{kind:'artifact_archive',projectId:old.projectId,nodeId:old.nodeId,artifactId:id,summary:input.archived?'归档产物':'恢复产物'})
    return json(record)
  }
  assert(data[type].length<1000,'记录数量达到上限',409)
  const allowed={approvals:['projectId','nodeId','report','artifactIds','contextDigest'],decisions:['projectId','nodeId','title','choice','reason','alternatives'],artifacts:['projectId','nodeId','name','version','description','referenceType','reference','sha256','agentId']}
  keys(allowed[type]);const {projectId,nodeId,node}=scope(type==='approvals')
  const record={id:crypto.randomUUID(),projectId,nodeId,createdAt:now(),actorId}
  if(type==='approvals'){
    assert(Array.isArray(input.artifactIds),'证据产物列表必填');record.artifactIds=[...new Set(list(input.artifactIds,50).map(identifier))]
    for(const id of record.artifactIds)assert(data.artifacts.some(a=>a.id===id&&a.projectId===projectId&&!a.archived),'证据产物不存在、已归档或跨项目')
    record.report=required(input.report,8000);record.contextDigest=await contextDigest(data,node)
    if('contextDigest'in input)assert(input.contextDigest===record.contextDigest,'任务内容已更新',409)
    assert(!node.missing&&(node.origin!=='agentdock'||!data.source.stale),'来源内容缺失或过期，不能请求验收',409)
    Object.assign(record,{status:'pending',reviewedAt:null,reviewComment:'',reviewerId:null})
  }else if(type==='decisions'){
    record.title=required(input.title,500);record.choice=required(input.choice,2000);record.reason=required(input.reason,4000)
    assert(Array.isArray(input.alternatives),'备选列表必填');record.alternatives=list(input.alternatives,50).map(v=>required(v,1000))
  }else{
    record.name=required(input.name,300);record.version=required(input.version,100);record.description=text(input.description,4000)
    assert(['url','path'].includes(input.referenceType),'引用类型无效');record.referenceType=input.referenceType;record.reference=required(input.reference,2000)
    assert(!/[\u0000-\u001f\u007f]/.test(record.reference),'引用含控制字符')
    if(record.referenceType==='url'){
      let url;try{url=new URL(record.reference)}catch{assert(false,'引用 URL 无效')}
      assert(/^https:\/\//i.test(record.reference)&&url.protocol==='https:'&&!url.username&&!url.password,'只允许无凭据的 HTTPS 引用')
    }else assert(!/^[a-z][a-z0-9+.-]*:/i.test(record.reference)||/^[a-z]:[\\/]/i.test(record.reference),'本地路径不能是 URL 或危险 scheme')
    record.sha256=text(input.sha256,64);assert(!record.sha256||/^[a-f0-9]{64}$/i.test(record.sha256),'SHA256 无效')
    record.agentId=text(input.agentId,250);record.archived=false
    assert(!data.artifacts.some(a=>a.projectId===projectId&&a.nodeId===nodeId&&a.name===record.name&&a.version===record.version),'产物名称及版本已存在',409)
  }
  let statement
  if(type==='artifacts')statement=guarded('INSERT INTO cp_artifacts(id,project_id,node_id,name,version,payload) SELECT ?,?,?,?,?,? WHERE (SELECT revision FROM cp_control WHERE id=1)=?',record.id,projectId,nodeId??'',record.name,record.version,JSON.stringify(record))
  else statement=guarded(`INSERT INTO ${TABLES[type]}(id,project_id,node_id,payload) SELECT ?,?,?,? WHERE (SELECT revision FROM cp_control WHERE id=1)=?`,record.id,projectId,nodeId,JSON.stringify(record))
  await commit(statement,{kind:type==='approvals'?'approval':type==='decisions'?'decision':'artifact',projectId,nodeId,recordId:record.id,summary:record.title??record.name??'创建验收请求'})
  return json(type==='approvals'?{...record,isStale:false}:record,201)
}
