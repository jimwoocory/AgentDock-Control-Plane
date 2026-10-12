import { build } from 'esbuild'
import { mkdir, readFile, writeFile, cp } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
const ui=await build({entryPoints:['ui/app.jsx'],bundle:true,write:false,outdir:'ui-dist',format:'esm',minify:true,target:['es2022'],jsx:'automatic'})
const html='<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AgentDock Control Plane</title><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>'
const css=await readFile('ui/styles.css','utf8')
await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true})
const moduleSource="import {fetchHandler} from './server.mjs'; export default {fetch(request,env){return fetchHandler(request,env,{html:PAGE_HTML,js:CLIENT_JS,css:STYLE_CSS})}}"
await build({stdin:{contents:moduleSource,resolveDir:fileURLToPath(new URL('../worker/',import.meta.url)),sourcefile:'index.mjs'},bundle:true,platform:'neutral',format:'esm',minify:false,target:['es2022'],outfile:'dist/server/index.js',define:{PAGE_HTML:JSON.stringify(html),CLIENT_JS:JSON.stringify(ui.outputFiles.find(file=>file.path.endsWith('.js')).text),STYLE_CSS:JSON.stringify(css)}})
await cp('.openai/hosting.json','dist/.openai/hosting.json');await cp('drizzle','dist/.openai/drizzle',{recursive:true})
console.log('Built private React Worker with D1 migrations and no external assets.')
