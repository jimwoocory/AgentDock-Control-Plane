import { spawn } from 'node:child_process';
import { open, lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, validateDataDir } from './configure.mjs';

async function logFile(filename) {
  try { const stat=await lstat(filename); if(!stat.isFile() || stat.isSymbolicLink()) throw new Error('Unsafe bridge log'); }
  catch(error) {if(error.code!=='ENOENT') throw error;}
  return open(filename,'a',0o600);
}
async function main() {
  const {dataDir,mode}=parseArgs(process.argv.slice(2)); if(mode!=='loop') throw new Error('Invalid launch mode');
  const saved=JSON.parse((await readFile(path.join(dataDir,'config.json'),'utf8')).replace(/^\uFEFF/,''));
  const own=await validateDataDir(saved.sourceHome,dataDir);
  const collectorPath=path.join(path.dirname(fileURLToPath(import.meta.url)),'collector.mjs');
  const output=await logFile(path.join(own,'collector.log')); const errors=await logFile(path.join(own,'collector-error.log'));
  try {
    const child=spawn(process.execPath,[collectorPath,'--data-dir',own],{cwd:path.dirname(collectorPath),detached:true,windowsHide:true,stdio:['ignore',output.fd,errors.fd]});
    await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
    child.unref(); console.log(JSON.stringify({pid:child.pid}));
  } finally {await output.close();await errors.close();}
}
main().catch(()=>{console.error('Readonly bridge launch failed');process.exitCode=1;});
