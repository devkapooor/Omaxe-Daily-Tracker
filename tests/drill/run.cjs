const fs=require('node:fs'),path=require('node:path'),{spawn,spawnSync}=require('node:child_process')
const root=path.resolve('.'),runId=process.env.DRILL_RUN_ID||'2026-10-12-drill-01',out=path.join(root,'output/playwright',runId)
fs.mkdirSync(out,{recursive:true})
Object.assign(process.env,{DRILL_RUN_ID:runId,GCLOUD_PROJECT:'demo-alphahub-drill',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIREBASE_EMULATOR_HUB:'127.0.0.1:4400',DRILL_GUARD_LOG:path.join(out,'server-guard.jsonl'),CI:'true',FIREBASE_CLI_DISABLE_UPDATE_CHECK:'true',FUNCTIONS_DISCOVERY_TIMEOUT:'60',METADATA_SERVER_DETECTION:'none'})
const cache=path.join(process.env.LOCALAPPDATA,'npm-cache/_npx')
let tool
for(const folder of fs.readdirSync(cache)){const p=path.join(cache,folder,'node_modules/playwright/package.json');if(fs.existsSync(p)&&JSON.parse(fs.readFileSync(p)).version==='1.63.0')tool=path.dirname(p)}
if(!tool)throw Error('Cached Playwright1.63.0 prerequisite missing; no automatic dependency upgrade')
process.env.DRILL_PLAYWRIGHT_ROOT=tool
const command=process.argv[2]||'smoke'
function background(name,args,extraEnv={}){const fd=fs.openSync(path.join(out,name+'.log'),'a');const child=spawn(process.execPath,args,{cwd:root,detached:true,windowsHide:true,stdio:['ignore',fd,fd],env:{...process.env,...extraEnv}});child.unref();fs.closeSync(fd);return child.pid}
async function ready(){
 const deadline=Date.now()+180000
 while(Date.now()<deadline){try{
  const hub=await fetch('http://127.0.0.1:4400/emulators',{signal:AbortSignal.timeout(2000)});if(!hub.ok)throw Error('hub unavailable')
  const services=await hub.json();for(const [name,port] of Object.entries({auth:9099,firestore:8080,functions:5001}))if(services[name]?.port!==port)throw Error('service unavailable')
  const ui=await fetch('http://127.0.0.1:5178/',{signal:AbortSignal.timeout(2000)});if(!ui.ok)throw Error('Vite unavailable')
  // Allow one cold runtime to finish instead of leaving a growing queue of
  // aborted callable requests while the Windows emulator initializes.
  const time=await fetch('http://127.0.0.1:5001/demo-alphahub-drill/asia-south1/getServerTime',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:{}}),signal:AbortSignal.timeout(45000)})
  if(time.status===401||time.status===403)return
 }catch{/* Startup only: retry local services, never another endpoint. */}
 await new Promise(resolve=>setTimeout(resolve,2000))
 }
 throw Error('DRILL_ISOLATION: local services not ready; no business tests may proceed.')
}
async function main(){
 if(command==='start'||command==='start-emulators'){
  const net=require('node:net');for(const port of command==='start'?[8080,9099,5001,4400,4500,5178]:[8080,9099,5001,4400,4500])await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',()=>reject(Error('Port occupied '+port+'; existing services preserved')));s.listen(port,'127.0.0.1',()=>s.close(resolve))})
  const firebase=path.join(process.env.APPDATA,'npm/node_modules/firebase-tools/lib/bin/firebase.js')
  const nodeOptions=(process.env.NODE_OPTIONS||'')+' --require="'+path.join(root,'tests/drill/windows-functions-launch.cjs').replaceAll('\\','/')+'"'
  const pids={emulators:background('emulators',[firebase,'emulators:start','--config','firebase.drill.json','--project','demo-alphahub-drill','--only','auth,firestore,functions'],{NODE_OPTIONS:nodeOptions}),vite:command==='start'?background('vite',[path.join(root,'node_modules/vite/bin/vite.js'),'--config','tests/drill/vite.config.ts','--mode','drill']):JSON.parse(fs.readFileSync(path.join(out,'pids.json'))).vite}
  fs.writeFileSync(path.join(out,'pids.json'),JSON.stringify(pids,null,2));console.log({runId,pids});await ready();console.log('Local emulator exports and Vite ready; run ENV-01 before business scenarios.');return
 }
 if(command==='preview'){require('./server-guard.cjs');await require('./safe-admin.cjs').health();await require('./checkout-preview.cjs').open(tool,out);return}
 if(command==='logs-review-inspect'){require('./server-guard.cjs');await require('./safe-admin.cjs').health();await require('./inspect-logs-review.cjs').inspect(tool,out);return}
 if(command==='cheque-ui-review'){require('./server-guard.cjs');await require('./safe-admin.cjs').health();await require('./cheque-ui-review.cjs').check(tool,out);return}
 if(command==='cheque-review-fixtures'){require('./server-guard.cjs');await require('./safe-admin.cjs').health();await require('./add-cheque-review-fixtures.cjs').add(out);return}
 if(command==='finance-ui-feedback'){require('./server-guard.cjs');await require('./safe-admin.cjs').health();await require('./finance-ui-feedback.cjs').check(tool,out);return}
 if(command==='finance-preview'){require('./server-guard.cjs');await require('./safe-admin.cjs').health();await require('./finance-preview.cjs').open(tool,out);return}
 if(command==='refund-preview'){require('./server-guard.cjs');await require('./safe-admin.cjs').health();await require('./refund-preview.cjs').open(tool,out);return}
 if(command==='stock-preview'){require('./server-guard.cjs');await require('./safe-admin.cjs').health();await require('./stock-preview.cjs').open(tool,out);return}
 if(command==='reset'){require('./server-guard.cjs');const proof=await require('./safe-admin.cjs').seed();fs.writeFileSync(path.join(out,'fixture.json'),JSON.stringify(proof,null,2));console.log({project:proof.proof.project,date:proof.date,records:proof.records});return}
 if(command==='report'){require('./report.cjs');return}
 if(command==='stop'){
  const pids=JSON.parse(fs.readFileSync(path.join(out,'pids.json')))
  for(const [name,pid] of Object.entries(pids)){
   if(!Number.isSafeInteger(pid)||pid<1)throw Error('Invalid stored process ID')
   const inspected=spawnSync('powershell.exe',['-NoProfile','-Command',`(Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}').CommandLine`],{encoding:'utf8',windowsHide:true})
   const line=inspected.stdout.trim();if(!line)continue
   const owns=name==='emulators'?line.includes('firebase.drill.json')&&line.includes('--project demo-alphahub-drill'):line.includes('tests/drill/vite.config.ts')
   if(!owns)throw Error('Refusing to stop an unrelated/reused PID '+pid)
   spawnSync('taskkill.exe',['/PID',String(pid),'/T','/F'],{stdio:'inherit',windowsHide:true})
  }return
 }
 const batches={remediation:'remediation.spec.cjs','finance-followup':'financeFollowup.spec.cjs',finance:'finance.spec.cjs',refund:'refund.spec.cjs',stock:'stock.spec.cjs','stock-residual':'stockResidual.spec.cjs',checkout:'checkout.spec.cjs',smoke:'smoke.spec.cjs',financial:'financial.spec.cjs',concurrency:'concurrency.spec.cjs',remaining:'remaining.spec.cjs',advanced:'advanced.spec.cjs',closure:'closure.spec.cjs',resilience:'resilience.spec.cjs',all:['smoke.spec.cjs','financial.spec.cjs','concurrency.spec.cjs','remaining.spec.cjs','advanced.spec.cjs','closure.spec.cjs','resilience.spec.cjs']}
 if(command==='checks'){require('./server-guard.cjs');await require('./safe-admin.cjs').health();require('./checks.cjs');return}
 if(!batches[command])throw Error('Unknown batch '+command)
 // All browser batches reset the same demo dataset. Never run two runners
 // concurrently; independent contexts inside one scenario remain supported.
 const lock=path.resolve('output/playwright/.drill-browser-run.lock')
 if(fs.existsSync(lock)){
  const previous=JSON.parse(fs.readFileSync(lock,'utf8'))
  let alive=false
  try{process.kill(previous.pid,0);alive=true}catch(error){if(error.code!=='ESRCH')throw error}
  if(alive)throw Error('DRILL_ISOLATION: another browser batch owns the demo fixtures; wait for it to finish.')
  fs.unlinkSync(lock)
 }
 fs.writeFileSync(lock,JSON.stringify({pid:process.pid,runId,batch:command}),{flag:'wx'})
 process.once('exit',()=>{if(fs.existsSync(lock)&&JSON.parse(fs.readFileSync(lock,'utf8')).pid===process.pid)fs.unlinkSync(lock)})
 require('./server-guard.cjs');await require('./safe-admin.cjs').health()
 process.env.DRILL_BATCH=command
 process.env.DRILL_ATTEMPT=String(Date.now())
 const result=spawnSync(process.execPath,[path.join(tool,'cli.js'),'test','--config','tests/drill/playwright.config.cjs',...[].concat(batches[command]),...process.argv.slice(3)],{cwd:root,stdio:'inherit',env:process.env,windowsHide:true})
 process.exitCode=result.status??1
}
main().catch(e=>{console.error(e.message);process.exitCode=1})
