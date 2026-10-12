import { lstat, realpath, readdir, open } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { loadConfig, parseArgs, validateConfig, validateDataDir, writeOwnJson, inside } from './configure.mjs';

const taskFile=/^tsk_[a-f0-9]{16}\.json$/;
const MAX_TASK_BYTES=512*1024, MAX_PAYLOAD_BYTES=4*1024*1024;
const obj=value=>value && typeof value==='object' && !Array.isArray(value) ? value : {};
const text=(value,max=2000,fallback='')=>typeof value==='string' ? value.slice(0,max) : fallback;
const list=(value,count)=>Array.isArray(value) ? value.slice(0,count) : [];
function timestamp(value) {
  const ms=typeof value==='number' ? (value>10_000_000_000 ? value : value*1000) : typeof value==='string' ? Date.parse(value) : NaN;
  return Number.isFinite(ms) && ms>0 && ms<=8640000000000000 ? new Date(ms).toISOString() : null;
}
function projectTask(value,filename) {
  const task=obj(value); const id=filename.slice(0,-5);
  if(task.id!==id || task.schema_version!==1 || typeof task.title!=='string' || !task.title.trim() || !timestamp(task.updated_at)) throw new Error('Invalid task');
  const review=task.final_review==null ? null : obj(task.final_review);
  return {id,title:text(task.title,1000),status:text(task.status,64,'unknown'),phase:text(task.phase,128,'unknown'),project:text(task.project,200)||null,updated_at:timestamp(task.updated_at),summary:text(task.summary),
    conditions:list(task.conditions,100).map(c=>({id:text(obj(c).id,200),text:text(obj(c).text,1000)})),
    steps:list(task.steps,200).map(s=>({id:text(obj(s).id,200),title:text(obj(s).title,1000),phase:text(obj(s).phase,128,'unknown'),status:text(obj(s).status,64,'unknown'),updated_at:timestamp(obj(s).updated_at)||timestamp(task.updated_at)})),
    events:list(task.events,10).map(e=>({type:text(obj(e).type,100,'unknown'),summary:text(obj(e).summary,1000),created_at:timestamp(obj(e).created_at)})),
    final_review:review ? {status:text(review.status,64,'unknown'),summary:text(review.summary),verified_facts:list(review.verified_facts,100).map(f=>text(f,1000))} : null};
}
async function directory(candidate) { const st=await lstat(candidate); if(!st.isDirectory() || st.isSymbolicLink()) throw new Error('Unsafe source directory'); return realpath(candidate); }
function same(a,b) { return a.ino===b.ino && a.dev===b.dev && a.size===b.size && a.mtimeMs===b.mtimeMs; }
async function safeRead(file,root,maxBytes,tail=false) {
  const before=await lstat(file);
  if(!before.isFile() || before.isSymbolicLink() || before.nlink!==1 || (!tail && before.size>maxBytes)) throw new Error('Unsafe source file');
  const actual=await realpath(file); if(!inside(root,actual) || actual===root) throw new Error('Source path escaped');
  const handle=await open(file,'r');
  try {
    const opened=await handle.stat(); const named=await lstat(file);
    if(!opened.isFile() || named.isSymbolicLink() || !same(before,opened) || !same(opened,named) || await realpath(file)!==actual) throw new Error('Source changed');
    const offset=tail ? Math.max(0,opened.size-maxBytes) : 0;
    const buffer=Buffer.alloc(tail ? Math.min(opened.size,maxBytes) : opened.size);
    const {bytesRead}=await handle.read(buffer,0,buffer.length,offset);
    const after=await handle.stat(); const afterNamed=await lstat(file);
    if(bytesRead!==buffer.length || !same(opened,after) || afterNamed.isSymbolicLink() || !same(after,afterNamed) || await realpath(file)!==actual) throw new Error('Source changed');
    return {buffer,offset};
  } finally { await handle.close(); }
}
async function readTasks(home) {
  const dock=await directory(path.join(home,'.agentdock')); const root=await directory(path.join(dock,'tasks'));
  const names=(await readdir(root)).filter(n=>taskFile.test(n)).sort(); if(names.length>2000) throw new Error('Task count limit');
  const tasks=[], fingerprints={}; let projectedBytes=2;
  for(const name of names) {
    const {buffer}=await safeRead(path.join(root,name),root,MAX_TASK_BYTES);
    const task=projectTask(JSON.parse(buffer.toString('utf8').replace(/^\uFEFF/,'')),name);
    projectedBytes+=Buffer.byteLength(JSON.stringify(task))+1;
    if(projectedBytes>MAX_PAYLOAD_BYTES) throw new Error('Task projection size limit');
    tasks.push(task); fingerprints[task.id]=createHash('sha256').update(buffer).digest('hex');
  }
  const after=(await readdir(root)).filter(n=>taskFile.test(n)).sort(); if(JSON.stringify(names)!==JSON.stringify(after)) throw new Error('Task directory changed');
  return {tasks,fingerprints};
}
async function lifecycle(file,root) {
  const {buffer,offset}=await safeRead(file,root,1024*1024,true); let lines=buffer.toString('utf8').split('\n'); if(offset>0) lines=lines.slice(1);
  let latest=null;
  for(const line of lines) {
    try {const row=obj(JSON.parse(line)); const type=obj(row.payload).type;
      if(row.type==='event_msg' && ['task_started','task_complete','turn_aborted'].includes(type)) latest={type,at:timestamp(row.timestamp??row.created_at??row.time)};
    } catch { /* Partial JSONL and unrelated rows supply no evidence. */ }
  }
  return latest;
}
async function readAgents(home,observedAt,warnings) {
  const codex=await directory(path.join(home,'.codex')); const root=await directory(path.join(codex,'sessions'));
  const dbPath=path.join(codex,'state_5.sqlite'); const st=await lstat(dbPath);
  if(!st.isFile() || st.isSymbolicLink() || !inside(codex,await realpath(dbPath))) throw new Error('Unsafe SQLite path');
  const {DatabaseSync}=await import('node:sqlite'); const database=new DatabaseSync(dbPath,{readOnly:true});
  try {
    const columns=database.prepare('PRAGMA table_info(threads)').all();
    if(!['id','rollout_path','updated_at','source','archived'].every(name=>columns.some(c=>c.name===name))) throw new Error('Unsupported SQLite schema');
    const rows=database.prepare('SELECT id,rollout_path,updated_at,source FROM threads WHERE archived=0 ORDER BY updated_at DESC LIMIT 50').all();
    const agents=[];
    for(const row of rows) {
      if(typeof row.id!=='string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(row.id)) {warnings.push('codex_invalid_thread_id');continue;}
      let event=null; try {if(typeof row.rollout_path!=='string' || !path.isAbsolute(row.rollout_path)) throw new Error('Invalid rollout'); event=await lifecycle(row.rollout_path,root);} catch {warnings.push('codex_lifecycle_unavailable');}
      const age=event?.at ? Date.parse(observedAt)-Date.parse(event.at) : NaN; const stale=!Number.isFinite(age)||age<0||age>60000;
      const status=!stale && event.type==='task_started' ? 'Running' : !stale && event.type==='task_complete' ? 'Completed' : 'Unknown';
      agents.push({id:`codex:${row.id}`,label:`Codex thread ${row.id}`,runtime:'codex',source:'Codex local readonly lifecycle',status,rawStatus:event?.type||'unknown',taskId:null,currentAction:null,lastActivityAt:event?.at||null,lastHeartbeatAt:null,observedAt,stale,present:true});
    }
    return agents;
  } finally {database.close();}
}
export async function capture(input,capturedAt=new Date().toISOString()) {
  const config=validateConfig(input); if(!timestamp(capturedAt)) throw new Error('Invalid capture time');
  const warnings=[]; let tasks=[],fingerprints={},taskReadOK=false,agents=[];
  try {({tasks,fingerprints}=await readTasks(config.sourceHome));taskReadOK=true;} catch {warnings.push('task_source_read_failed');}
  const capabilities=[{id:'agentdock',label:'AgentDock runtime telemetry',status:'unavailable',description:'No readonly runtime lifecycle source. Task status is not Agent status.',observedAt:null}];
  try {agents=await readAgents(config.sourceHome,capturedAt,warnings);capabilities.push({id:'codex',label:'Codex local lifecycle',status:'ok',description:'Readonly SQLite metadata and bounded lifecycle records; heartbeat unavailable.',observedAt:capturedAt});}
  catch {capabilities.push({id:'codex',label:'Codex local lifecycle',status:'unavailable',description:'Readonly session index unavailable or unsupported.',observedAt:null});warnings.push('codex_source_unavailable');}
  capabilities.push({id:'claude',label:'Claude Code agents',status:'unavailable',description:'Claude agent source unavailable on configured company machine.',observedAt:null});
  const payload={sourceKey:config.sourceKey,machine:config.machine,capturedAt,taskReadOK,tasks,agents,capabilities,warnings:[...new Set(warnings)]};
  if(Buffer.byteLength(JSON.stringify(payload))>MAX_PAYLOAD_BYTES) {payload.tasks=[];payload.taskReadOK=false;payload.warnings.push('snapshot_size_limit');fingerprints={};}
  return {payload,fingerprints};
}
export function summarize({payload,fingerprints},uploadOK) {
  return {sourceKey:payload.sourceKey,machine:payload.machine,capturedAt:payload.capturedAt,taskReadOK:payload.taskReadOK,taskCount:payload.tasks.length,agentCount:payload.agents.length,agentStates:payload.agents.reduce((counts,a)=>(counts[a.status]=(counts[a.status]||0)+1,counts),{}),capabilities:payload.capabilities.map(c=>({id:c.id,status:c.status})),warnings:payload.warnings,fingerprints,...(uploadOK===undefined ? {} : {uploadOK})};
}
export async function syncOnce(config,{dataDir,now=new Date().toISOString(),fetchImpl=fetch}={}) {
  config=validateConfig(config);
  const result=await capture(config,now); let uploadOK=false;
  try {
    const response=await fetchImpl(`${config.siteUrl}/api/ingest`,{method:'POST',headers:{'Content-Type':'application/json','OAI-Sites-Authorization':`Bearer ${config.siteToken}`,'X-CP-Collector-Key':config.collectorKey},body:JSON.stringify(result.payload),signal:AbortSignal.timeout(20000),redirect:'error',cache:'no-store'});
    uploadOK=response.ok; await response.body?.cancel();
  } catch { /* Never log response bodies, credentials, paths or task content. */ }
  const summary=summarize(result,uploadOK);
  if(dataDir) await writeOwnJson(await validateDataDir(config.sourceHome,dataDir),'status.json',summary);
  return summary;
}
async function main() {
  const {dataDir,mode}=parseArgs(process.argv.slice(2)); const config=await loadConfig(dataDir);
  if(mode==='snapshot') {console.log(JSON.stringify((await capture(config)).payload));return;}
  if(mode==='summary') {console.log(JSON.stringify(summarize(await capture(config))));return;}
  do {
    const summary=await syncOnce(config,{dataDir}); console.log(JSON.stringify({...summary,fingerprints:undefined}));
    if(mode==='once') {if(!summary.uploadOK)process.exitCode=1;return;}
    await delay(20000);
  } while(true);
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) main().catch(()=>{console.error('Readonly bridge failed');process.exitCode=1;});
