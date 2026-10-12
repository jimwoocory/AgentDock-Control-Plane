import { spawn } from 'node:child_process';
import { lstat, realpath, mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

export const defaultDataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '.data');
export function validateConfig(input) {
  if (!input || typeof input !== 'object' || input.sourceKey !== 'company:PC-20251130TKZA' || input.machine !== 'PC-20251130TKZA') throw new Error('Invalid fixed company source');
  if (typeof input.sourceHome !== 'string' || !path.isAbsolute(input.sourceHome)) throw new Error('Absolute sourceHome required');
  const url = new URL(input.siteUrl);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.chatgpt.site') || url.username || url.password || url.port || url.search || url.hash || url.pathname !== '/') throw new Error('Private Sites origin required');
  for (const key of ['collectorKey','siteToken']) if (typeof input[key] !== 'string' || input[key].length < 8 || input[key].length > 8192 || /[\r\n\x00]/.test(input[key])) throw new Error('Invalid credentials');
  if(input.collectorKey.length<24) throw new Error('Collector key must contain at least 24 characters');
  return {siteUrl:url.origin,sourceHome:path.resolve(input.sourceHome),sourceKey:input.sourceKey,machine:input.machine,collectorKey:input.collectorKey,siteToken:input.siteToken};
}
export function inside(root, candidate) { const relative = path.relative(root,candidate); return !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`); }
async function canonical(candidate) {
  const missing=[]; let current=path.resolve(candidate);
  while (true) {
    try { const st=await lstat(current); if(st.isSymbolicLink()) throw new Error('Linked bridge path rejected'); return path.join(await realpath(current),...missing.reverse()); }
    catch(error) { if(error.code!=='ENOENT') throw error; const parent=path.dirname(current); if(parent===current) throw error; missing.push(path.basename(current)); current=parent; }
  }
}
export async function validateDataDir(sourceHome,dataDir) {
  const own = await canonical(dataDir);
  for (const source of ['.agentdock','.codex']) if (inside(await canonical(path.join(sourceHome,source)),own)) throw new Error('Bridge data must remain outside source directories');
  return own;
}
// Secrets cross only anonymous stdin/stdout pipes; child arguments contain fixed code.
function dpapi(value,mode) {
  if(process.platform!=='win32') throw new Error('Windows user DPAPI is required');
  const operation = mode==='protect'
    ? '$bytes=[Text.Encoding]::UTF8.GetBytes($value); $result=[Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($result))'
    : '$bytes=[Convert]::FromBase64String($value); $result=[Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Text.Encoding]::UTF8.GetString($result))';
  const script=`$ErrorActionPreference='Stop'; try { Add-Type -AssemblyName System.Security; $value=[Console]::In.ReadToEnd(); ${operation} } catch { exit 1 }`;
  return new Promise((resolve,reject)=>{
    const child=spawn('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',script],{stdio:['pipe','pipe','ignore'],windowsHide:true});
    let output=''; const timer=setTimeout(()=>{child.kill(); reject(new Error('DPAPI timed out'));},15000);
    child.stdout.on('data',chunk=>{output+=chunk.toString('utf8'); if(output.length>32768){child.kill();reject(new Error('DPAPI exceeded limit'));}});
    child.on('error',()=>{clearTimeout(timer);reject(new Error('DPAPI unavailable'));});
    child.on('close',code=>{clearTimeout(timer); if(code===0 && output) resolve(output); else reject(new Error('DPAPI operation failed'));});
    child.stdin.on('error',()=>{}); child.stdin.end(value);
  });
}
export async function writeOwnJson(dataDir,name,value) {
  await mkdir(dataDir,{recursive:true});
  if((await lstat(dataDir)).isSymbolicLink()) throw new Error('Linked bridge data rejected');
  const target=path.join(dataDir,name); const temporary=path.join(dataDir,`.${name}.${randomUUID()}.tmp`);
  await writeFile(temporary,JSON.stringify(value),{flag:'wx',mode:0o600}); await rename(temporary,target);
}
export async function configureBridge(input,dataDir=defaultDataDir) {
  const config=validateConfig(input); const own=await validateDataDir(config.sourceHome,dataDir);
  const collectorKeyEncrypted=await dpapi(config.collectorKey,'protect'); const siteTokenEncrypted=await dpapi(config.siteToken,'protect');
  await writeOwnJson(own,'config.json',{version:1,siteUrl:config.siteUrl,sourceHome:config.sourceHome,sourceKey:config.sourceKey,machine:config.machine,collectorKeyEncrypted,siteTokenEncrypted});
}
export async function loadConfig(dataDir=defaultDataDir) {
  const file=path.join(dataDir,'config.json'); const stat=await lstat(file);
  if(!stat.isFile() || stat.isSymbolicLink() || stat.size>65536) throw new Error('Invalid bridge configuration');
  const saved=JSON.parse(await readFile(file,'utf8'));
  if(saved.version!==1 || typeof saved.collectorKeyEncrypted!=='string' || typeof saved.siteTokenEncrypted!=='string') throw new Error('Invalid encrypted configuration');
  await validateDataDir(saved.sourceHome,dataDir);
  return validateConfig({...saved,collectorKey:await dpapi(saved.collectorKeyEncrypted,'unprotect'),siteToken:await dpapi(saved.siteTokenEncrypted,'unprotect')});
}
export function parseArgs(argv) {
  let dataDir=defaultDataDir; let mode='loop';
  for(let i=0;i<argv.length;i++) { if(argv[i]==='--data-dir' && argv[i+1]) dataDir=path.resolve(argv[++i]); else if(['--once','--summary','--snapshot'].includes(argv[i]) && mode==='loop') mode=argv[i].slice(2); else throw new Error('Invalid arguments'); }
  return {dataDir,mode};
}
async function main() {
  const {dataDir,mode}=parseArgs(process.argv.slice(2)); if(mode!=='loop') throw new Error('configure only accepts --data-dir');
  let input=''; for await(const chunk of process.stdin) { input+=chunk.toString('utf8'); if(Buffer.byteLength(input)>65536) throw new Error('Configuration input exceeded limit'); }
  await configureBridge(JSON.parse(input.replace(/^\uFEFF/,'')),dataDir); console.log(JSON.stringify({configured:true}));
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) main().catch(()=>{console.error('Bridge configuration failed');process.exitCode=1;});
