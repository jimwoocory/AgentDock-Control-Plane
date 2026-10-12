import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, link } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
const bridge = await import('../bridge/collector.mjs').catch(() => ({}));
const configuration = await import('../bridge/configure.mjs').catch(() => ({}));
const now = '2026-10-12T01:00:00.000Z';
const id = 'tsk_0123456789abcdef';
const config = home => ({sourceHome:home,sourceKey:'company:PC-20251130TKZA',machine:'PC-20251130TKZA',siteUrl:'https://agentdock-control-plane.jimwoo-cory.chatgpt.site',collectorKey:'synthetic-collector-key-value',siteToken:'synthetic-service-token'});
const task = () => ({schema_version:1,id,title:'Synthetic task',status:'active',phase:'execute',project:'Fixture',updated_at:now,summary:'Bounded summary',conditions:[{id:'c1',text:'pass',password:'never'}],steps:[{id:'s1',title:'Synthetic step',status:'done',phase:'execute',updated_at:now,prompt:'private'}],events:[{type:'done',summary:'Verified',created_at:now,token:'private'}],final_review:{status:'passed',summary:'Verified fixture',verified_facts:['Build succeeded'],secret:'private'},credentials:{token:'never'},prompt:'never'});
const execute=promisify(execFile);
async function fixture(t) {
  const base=path.join(path.dirname(fileURLToPath(import.meta.url)),'.data'); await mkdir(base,{recursive:true});
  const home = await mkdtemp(path.join(base,'cp-collector-'));
  t.after(() => {assert.ok(home.startsWith(base+path.sep)); return rm(home,{recursive:true,force:true});});
  await mkdir(path.join(home,'.agentdock','tasks'),{recursive:true});
  await mkdir(path.join(home,'.codex','sessions'),{recursive:true});
  await writeFile(path.join(home,'.agentdock','tasks',`${id}.json`),JSON.stringify(task()));
  return home;
}
test('task capture removes unrelated nested fields and fingerprints unchanged source',async t => {
  assert.equal(typeof bridge.capture,'function','capture implementation required');
  const home = await fixture(t);
  const source = path.join(home,'.agentdock','tasks',`${id}.json`);
  const before = await readFile(source);
  await writeFile(path.join(home,'.agentdock','config.json'),'private config');
  await writeFile(path.join(home,'.agentdock','tasks','ignored.json'),'invalid json');
  const {payload,fingerprints} = await bridge.capture(config(home),now);
  assert.equal(payload.taskReadOK,true);
  assert.equal(payload.tasks.length,1);
  assert.deepEqual(Object.keys(payload.tasks[0]).sort(),['id','title','status','phase','project','updated_at','summary','conditions','steps','events','final_review'].sort());
  assert.equal(JSON.stringify(payload).includes('never'),false);
  assert.equal(JSON.stringify(payload).includes('private'),false);
  assert.deepEqual(await readFile(source),before);
  assert.match(fingerprints[id],/^[a-f0-9]{64}$/);
  assert.equal(payload.capabilities.find(c=>c.id==='claude').status,'unavailable');
});
test('one malformed task fails entire task snapshot without partial success',async t => {
  const home = await fixture(t);
  await writeFile(path.join(home,'.agentdock','tasks','tsk_1111111111111111.json'),'{');
  const {payload,fingerprints} = await bridge.capture(config(home),now);
  assert.equal(payload.taskReadOK,false); assert.deepEqual(payload.tasks,[]); assert.deepEqual(fingerprints,{});
  assert.equal(JSON.stringify(payload.warnings).includes(home),false);
});
test('hardlinked task source is rejected and oversized total projection never becomes a partial snapshot',async t=>{
  const home=await fixture(t); const source=path.join(home,'.agentdock','tasks',`${id}.json`); const other=path.join(home,'hardlink.json');
  await link(source,other);
  let result=await bridge.capture(config(home),now); assert.equal(result.payload.taskReadOK,false);
  await rm(other);
  const value=task(); value.steps=Array.from({length:200},(_,i)=>({...task().steps[0],id:`s${i}`,title:'x'.repeat(1000)}));
  for(let n=0;n<25;n++){value.id=`tsk_${n.toString(16).padStart(16,'0')}`; await writeFile(path.join(home,'.agentdock','tasks',value.id+'.json'),JSON.stringify(value));}
  result=await bridge.capture(config(home),now); assert.equal(result.payload.taskReadOK,false); assert.deepEqual(result.payload.tasks,[]); assert.deepEqual(result.fingerprints,{});
});
test('oversized task fails source and bounded lists/text are projected',async t => {
  const home = await fixture(t); const source = path.join(home,'.agentdock','tasks',`${id}.json`);
  const value=task(); value.title='a'.repeat(1500); value.summary='b'.repeat(3000); value.steps=Array.from({length:201},(_,i)=>({...task().steps[0],id:`s${i}`,status:'x'.repeat(100)})); value.events=Array.from({length:11},()=>({...task().events[0],type:'t'.repeat(120),summary:'e'.repeat(2000)}));
  await writeFile(source,JSON.stringify(value));
  let result = await bridge.capture(config(home),now);
  assert.equal(result.payload.tasks[0].title.length,1000); assert.equal(result.payload.tasks[0].summary.length,2000);
  assert.equal(result.payload.tasks[0].steps.length,200); assert.equal(result.payload.tasks[0].events.length,10);
  assert.equal(result.payload.tasks[0].steps[0].status.length,64); assert.equal(result.payload.tasks[0].events[0].type.length,100); assert.equal(result.payload.tasks[0].events[0].summary.length,1000);
  await writeFile(source,' '.repeat(512*1024+1));
  result=await bridge.capture(config(home),now); assert.equal(result.payload.taskReadOK,false);
});
test('readonly sqlite threads yield only real fresh lifecycle statuses, no title/prompt/heartbeat',async t => {
  const home=await fixture(t); const sessions=path.join(home,'.codex','sessions');
  const db=new DatabaseSync(path.join(home,'.codex','state_5.sqlite'));
  db.exec('CREATE TABLE threads(id TEXT, rollout_path TEXT, updated_at INTEGER, source TEXT, archived INTEGER, title TEXT)');
  const insert=db.prepare('INSERT INTO threads VALUES(?,?,?,?,?,?)');
  for (const [name,event,time] of [['running','task_started',now],['done','task_complete',now],['stale','task_started','2026-10-12T00:58:59Z'],['aborted','turn_aborted',now],['unknown',null,now]]) {
    const file=path.join(sessions,`${name}.jsonl`);
    await writeFile(file,JSON.stringify({type:'event_msg',timestamp:time,payload:{type:event,prompt:'private prompt'}})+'\n'+JSON.stringify({type:'response_item',payload:{type:'message',content:'private title'}})+'\n');
    insert.run(name,file,Date.parse(now)/1000,'synthetic',0,'private title');
  }
  insert.run('archived',path.join(sessions,'running.jsonl'),Date.parse(now)/1000,'synthetic',1,'private title'); db.close();
  const {payload}=await bridge.capture(config(home),now);
  assert.equal(payload.agents.length,5);
  const agents=Object.fromEntries(payload.agents.map(a=>[a.id,a]));
  assert.equal(agents['codex:running'].status,'Running'); assert.equal(agents['codex:done'].status,'Completed');
  assert.equal(agents['codex:stale'].status,'Unknown'); assert.equal(agents['codex:stale'].stale,true);
  assert.equal(agents['codex:aborted'].status,'Unknown'); assert.equal(agents['codex:unknown'].status,'Unknown');
  assert.equal(payload.agents.every(a=>a.lastHeartbeatAt===null && a.currentAction===null),true);
  assert.equal(JSON.stringify(payload).includes('private'),false);
});
test('session outside canonical root never supplies lifecycle and unsupported schema is unavailable',async t => {
  const home=await fixture(t); const outside=path.join(home,'outside.jsonl');
  await writeFile(outside,JSON.stringify({type:'event_msg',timestamp:now,payload:{type:'task_started'}}));
  let db=new DatabaseSync(path.join(home,'.codex','state_5.sqlite'));
  db.exec('CREATE TABLE threads(id TEXT, rollout_path TEXT, updated_at INTEGER, source TEXT, archived INTEGER)');
  db.prepare('INSERT INTO threads VALUES(?,?,?,?,?)').run('escape',outside,Date.parse(now)/1000,'fixture',0); db.close();
  let {payload}=await bridge.capture(config(home),now); assert.equal(payload.agents.length,1); assert.equal(payload.agents[0].status,'Unknown'); assert.equal(payload.agents[0].lastActivityAt,null);
  db=new DatabaseSync(path.join(home,'.codex','state_5.sqlite')); db.exec('DROP TABLE threads; CREATE TABLE threads(id TEXT)'); db.close();
  ({payload}=await bridge.capture(config(home),now)); assert.equal(payload.capabilities.find(c=>c.id==='codex').status,'unavailable');
});
test('cycle sends auth with bounded payload, persists counts only and reports HTTP failure',async t => {
  const home=await fixture(t); const dataDir=path.join(home,'bridge-data');
  const sent=[]; const fetchImpl=async (url,options)=>{sent.push({url,options}); return {ok:true,status:200,body:{cancel:async()=>{}}};};
  const result=await bridge.syncOnce(config(home),{dataDir,now,fetchImpl});
  assert.equal(result.uploadOK,true); assert.equal(sent[0].url,config(home).siteUrl+'/api/ingest');
  assert.equal(sent[0].options.headers['X-CP-Collector-Key'],'synthetic-collector-key-value');
  assert.equal(sent[0].options.headers['OAI-Sites-Authorization'],'Bearer synthetic-service-token');
  assert.equal(sent[0].options.redirect,'error'); assert.ok(sent[0].options.signal);
  const status=JSON.parse(await readFile(path.join(dataDir,'status.json'),'utf8'));
  assert.equal(status.taskCount,1); assert.equal(status.uploadOK,true); assert.match(status.fingerprints[id],/^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(status).includes('Synthetic task'),false); assert.equal(JSON.stringify(status).includes('synthetic-service-token'),false);
  const failure=await bridge.syncOnce(config(home),{dataDir,now,fetchImpl:async()=>({ok:false,status:401,body:{cancel:async()=>{}}})}); assert.equal(failure.uploadOK,false);
});
test('DPAPI config roundtrip stores ciphertext only and rejects wrong source and unsafe origins', {skip:process.platform!=='win32'},async t => {
  assert.equal(typeof configuration.configureBridge,'function'); const home=await fixture(t); const dataDir=path.join(home,'bridge-data');
  await configuration.configureBridge(config(home),dataDir);
  const file=await readFile(path.join(dataDir,'config.json'),'utf8');
  assert.equal(file.includes('synthetic-collector-key-value'),false); assert.equal(file.includes('synthetic-service-token'),false);
  const decoded=await configuration.loadConfig(dataDir); assert.equal(decoded.collectorKey,'synthetic-collector-key-value'); assert.equal(decoded.siteToken,'synthetic-service-token');
  await assert.rejects(configuration.configureBridge({...config(home),sourceKey:'other'},dataDir));
  await assert.rejects(configuration.configureBridge({...config(home),collectorKey:'short-key'},dataDir));
  await assert.rejects(configuration.configureBridge({...config(home),siteUrl:'http://localhost'},dataDir));
  await assert.rejects(configuration.configureBridge({...config(home),siteUrl:config(home).siteUrl+'/arbitrary'},dataDir));
  await assert.rejects(configuration.configureBridge(config(home),path.join(home,'.agentdock','bridge-data')));
});
test('linked task directory and more than 2000 task files fail the complete source',async t=>{
  const home=await fixture(t); const tasks=path.join(home,'.agentdock','tasks'); const moved=path.join(home,'moved-tasks');
  const {rename}=await import('node:fs/promises'); await rename(tasks,moved); await symlink(moved,tasks,'junction');
  assert.equal((await bridge.capture(config(home),now)).payload.taskReadOK,false);
  await rm(tasks,{force:true}); await rename(moved,tasks);
  for(let n=0;n<2001;n++) await writeFile(path.join(tasks,`tsk_${n.toString(16).padStart(16,'0')}.json`),'{}');
  const {payload}=await bridge.capture(config(home),now); assert.equal(payload.taskReadOK,false); assert.deepEqual(payload.tasks,[]);
});
test('CLI summary decrypts config without stdout task bodies, credentials or source path', {skip:process.platform!=='win32'},async t=>{
  const home=await fixture(t); const dataDir=path.join(home,'bridge-data'); await configuration.configureBridge(config(home),dataDir);
  const {stdout}=await execute(process.execPath,[fileURLToPath(new URL('../bridge/collector.mjs',import.meta.url)),'--summary','--data-dir',dataDir],{windowsHide:true});
  const summary=JSON.parse(stdout); assert.equal(summary.taskCount,1); assert.equal(summary.sourceKey,'company:PC-20251130TKZA');
  assert.equal(stdout.includes(home),false); assert.equal(stdout.includes('Synthetic task'),false); assert.equal(stdout.includes('synthetic-service-token'),false);
  await assert.rejects(readFile(path.join(dataDir,'status.json')),{code:'ENOENT'});
});
test('stop refuses unowned helper even with its real PID and start ticks', {skip:process.platform!=='win32'},async t=>{
  const home=await fixture(t); const dataDir=path.join(home,'bridge-data'); await mkdir(dataDir);
  const helper=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true});
  t.after(()=>helper.kill());
  await new Promise((resolve,reject)=>{helper.once('spawn',resolve);helper.once('error',reject);});
  const {stdout}=await execute('powershell.exe',['-NoProfile','-NonInteractive','-Command',`(Get-Process -Id ${helper.pid}).StartTime.ToUniversalTime().Ticks.ToString()`],{windowsHide:true});
  const collectorPath=fileURLToPath(new URL('../bridge/collector.mjs',import.meta.url));
  await writeFile(path.join(dataDir,'process.json'),JSON.stringify({pid:helper.pid,startTicks:stdout.trim(),nodePath:process.execPath,collectorPath,dataDir}));
  await assert.rejects(execute('powershell.exe',['-NoProfile','-NonInteractive','-File',fileURLToPath(new URL('../bridge/stop.ps1',import.meta.url)),'-DataDir',dataDir],{windowsHide:true}));
  assert.equal(helper.exitCode,null); assert.equal(helper.signalCode,null); assert.ok(await readFile(path.join(dataDir,'process.json')));
});
test('hidden start records ownership, prevents duplicate launch and stop checks start-time before termination', {skip:process.platform!=='win32'},async t=>{
  const home=await fixture(t); const installed=path.join(home,'installed-bridge'); const dataDir=path.join(installed,'.data'); await mkdir(dataDir,{recursive:true});
  for(const name of ['start.ps1','stop.ps1','launch.mjs','configure.mjs']) await writeFile(path.join(installed,name),await readFile(fileURLToPath(new URL(`../bridge/${name}`,import.meta.url))));
  await writeFile(path.join(installed,'collector.mjs'),'setInterval(()=>{},1000);'); await writeFile(path.join(dataDir,'config.json'),JSON.stringify({sourceHome:home}));
  const runScript=name=>new Promise((resolve,reject)=>{
    const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(installed,name),'-DataDir',dataDir,...(name==='start.ps1' ? ['-NodePath',process.execPath] : [])],{windowsHide:true,stdio:['ignore','pipe','pipe']});
    let error=''; child.stderr.on('data',chunk=>error+=String(chunk)); child.stdout.resume();
    child.once('error',reject); child.once('exit',code=>code===0 ? resolve() : reject(new Error(`Fixture script rejected: ${error}`)));
  });
  let ownedRecord;
  t.after(async()=>{if(ownedRecord){await writeFile(path.join(dataDir,'process.json'),JSON.stringify(ownedRecord)); await runScript('stop.ps1');}});
  await runScript('start.ps1');
  ownedRecord=JSON.parse((await readFile(path.join(dataDir,'process.json'),'utf8')).replace(/^\uFEFF/,'')); assert.ok(ownedRecord.pid>0); assert.match(ownedRecord.startTicks,/^\d+$/);
  await runScript('start.ps1');
  assert.equal(JSON.parse((await readFile(path.join(dataDir,'process.json'),'utf8')).replace(/^\uFEFF/,'')).pid,ownedRecord.pid);
  await writeFile(path.join(dataDir,'process.json'),JSON.stringify({...ownedRecord,startTicks:'0'})); await assert.rejects(runScript('stop.ps1'));
  await writeFile(path.join(dataDir,'process.json'),JSON.stringify(ownedRecord)); await runScript('stop.ps1'); ownedRecord=undefined;
  await assert.rejects(readFile(path.join(dataDir,'process.json')),{code:'ENOENT'});
});
