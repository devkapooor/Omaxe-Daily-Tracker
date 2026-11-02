const fs=require('node:fs'),path=require('node:path'),{spawn,spawnSync}=require('node:child_process');
if(!process.versions.node.startsWith('22.'))throw Error('Node22 acceptance runtime required');
const root=path.resolve('.'),runRoot=path.resolve('output/playwright'),requestedRunId=process.env.DRILL_RUN_ID;
let runId=requestedRunId||`acceptance-${new Date().toISOString().replace(/[-:.TZ]/g,'')}`;
if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(runId))throw Error('DRILL_ISOLATION: DRILL_RUN_ID must be a simple 1-80 character folder name.');
const out=path.resolve(runRoot,runId);
if(!out.startsWith(runRoot+path.sep))throw Error('DRILL_ISOLATION: evidence path must remain inside output/playwright.');
fs.mkdirSync(out,{recursive:true});
const mode=process.argv[2],results=[];
if(mode&&fs.existsSync(path.join(out,`${mode}-results.json`)))throw Error('DRILL_ISOLATION: this run already has '+mode+' results; choose a new DRILL_RUN_ID to preserve prior evidence.');
const guard=' --require="'+path.resolve('tests/drill/server-guard.cjs').replaceAll('\\','/')+'"';
const env={...process.env,NODE_OPTIONS:(process.env.NODE_OPTIONS||'')+guard,GCLOUD_PROJECT:'demo-alphahub-drill',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIREBASE_EMULATOR_HUB:'127.0.0.1:4400',DRILL_GUARD_LOG:path.join(out,'server-guard.jsonl'),METADATA_SERVER_DETECTION:'none',VITE_LOCAL_AUTH_BYPASS:'false',RUN_APPROVED_CATALOGUE_EVIDENCE:'false',RUN_TELEGRAM_EMULATOR_TESTS:'false'};
Object.assign(process.env,env);
// This existing suite is opt-in for ad hoc use, but belongs in full Rules coverage.
env.RUN_STOCK_VENDOR_TESTS='true';
process.env.RUN_STOCK_VENDOR_TESTS='true';
env.RUN_OPERATIONS_REVISION_TESTS='true';
process.env.RUN_OPERATIONS_REVISION_TESTS='true';
require('./server-guard.cjs');
const noLoans='^(?!.*(?:activates an empty clean start|activates the reviewed clean start|preserving owner loan payments|without touching loans)).*$';
let steps=mode==='rules'?[['rules',['node_modules/vitest/vitest.mjs','run','tests','-t',noLoans,'--maxWorkers','1','--hookTimeout','60000']]]:mode==='static'?[
 ['domain',['node_modules/vitest/vitest.mjs','run','src','--exclude','**/*loan*.test.ts']],
 ['lint-src',['node_modules/eslint/bin/eslint.js','src']],
 ['lint-drill',['node_modules/eslint/bin/eslint.js','--config','tests/drill/eslint.config.mjs','tests/drill']],
 ['typescript',['node_modules/typescript/bin/tsc','-b']],
 ['build',['node_modules/vite/bin/vite.js','build']],
]:mode==='support'?[
 ['functions',['--test'],path.join(root,'functions')],
 ['rules-current',['node_modules/vitest/vitest.mjs','run','tests/finance.rules.test.ts','tests/refund.rules.test.ts','tests/registerInvoiceQueries.rules.test.ts','tests/vendorLogQueries.rules.test.ts']],
 ['rules-current-inventory',['node_modules/vitest/vitest.mjs','run','tests/sharedViews.rules.test.ts','tests/stockVendorRevision.rules.test.ts','tests/financeMetrics.test.ts']],
 ['rules-historical',['node_modules/vitest/vitest.mjs','run','tests/firestore.rules.test.ts','tests/pos.repository.rules.test.ts','tests/stockPrice.rules.test.ts','tests/stockWorkspace.rules.test.ts','-t',noLoans]],
]:mode==='completion'?[
 ['future-cheque-cancellation',['tests/drill/run.cjs','closure','--grep','FIN-02']],
 ['cashout-excess-sign',['tests/drill/run.cjs','remaining','--grep','FIN-05 FIN-06']],
 ['lint-final-drill',['node_modules/eslint/bin/eslint.js','--config','tests/drill/eslint.config.mjs','tests/drill']],
]:mode==='final'?[
 ['correction-cheque-final',['tests/drill/run.cjs','closure','--grep','FIN-07|FIN-02']],
 ['remaining-current-ui-final',['tests/drill/run.cjs','remaining','--grep','VEN-09|FIN-05 FIN-06|LOG-01 LOG-02 SET-01']],
 ['deposit-recovery-final',['tests/drill/run.cjs','finance-followup','--grep','F45-11']],
 ['bank-privacy-final',['tests/drill/run.cjs','finance-followup','--grep','F45-12']],
 ['lint-final-drill',['node_modules/eslint/bin/eslint.js','--config','tests/drill/eslint.config.mjs','tests/drill']],
]:mode==='followup'?[
 ['smoke-retry',['tests/drill/run.cjs','smoke']],
 ['finance-count-recovery-retry',['tests/drill/run.cjs','finance','--grep','F45-05']],
 ['refund-cashout-retry',['tests/drill/run.cjs','refund','--grep','B3-08|B3-20']],
 ['financial-legacy-navigation-retry',['tests/drill/run.cjs','financial','--grep','purchase/payment caps|cash expense saved']],
 ['cashout-correction-confirmation-retry',['tests/drill/run.cjs','closure','--grep','FIN-07|FIN-02']],
 ['logs-column-retry',['tests/drill/run.cjs','resilience','--grep','LOG-02']],
 ['access-cheque-retry',['tests/drill/run.cjs','remaining','--grep','AUTH-04|VEN-09|FIN-05 FIN-06|LOG-01 LOG-02 SET-01']],
 ['financial-followup',['tests/drill/run.cjs','finance-followup']],
 ['rules-setup-retry',['node_modules/vitest/vitest.mjs','run','tests/finance.rules.test.ts','tests/registerInvoiceQueries.rules.test.ts','tests/vendorLogQueries.rules.test.ts','--maxWorkers','1','--hookTimeout','60000']],
 ['linked-payout-metrics',['node_modules/vitest/vitest.mjs','run','tests/financeMetrics.test.ts']],
 ['lint-final-drill',['node_modules/eslint/bin/eslint.js','--config','tests/drill/eslint.config.mjs','tests/drill']],
]:mode==='browser'?[['browser-all',['tests/drill/run.cjs','all']]]:null;
if(mode==='full')steps=['static','support','telegram','browser'].map(phase=>['phase-'+phase,['tests/drill/full-financial-acceptance.cjs',phase]]);
if(mode==='concurrency')steps=[
 ['isolation',['tests/drill/run.cjs','smoke','--grep','ENV-01']],
 ['counter-races',['tests/drill/run.cjs','concurrency']],
 ['checkout-races',['tests/drill/run.cjs','checkout','--grep','B1-02|B1-03|B1-15']],
 ['drawer-race',['tests/drill/run.cjs','finance','--grep','F45-06']],
 ['vendor-allocation-race',['tests/drill/run.cjs','advanced','--grep','VEN-06 simultaneous']],
 ['refund-race',['tests/drill/run.cjs','refund','--grep','B3-03']],
 ['stock-races',['tests/drill/run.cjs','stock','--grep','B2-12|B2-15 stale']],
];
if(!steps&&mode!=='telegram')throw Error('Expected full/static/support/telegram/browser/rules/concurrency mode; historical focused modes remain supported.');
async function telegram(){
 // Reuse the existing suite's exact isolated emulator contract. Never download a jar.
 const jar=path.join(process.env.USERPROFILE,'.cache/firebase/emulators/cloud-firestore-emulator-v1.22.0.jar');
 if(!fs.existsSync(jar))throw Error('Cached Firestore1.22.0 jar required; no download attempted.');
 const net=require('node:net');
 for(const port of [8189,9159])await new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',()=>reject(Error('Dedicated Telegram emulator port occupied '+port+'; existing service preserved')));server.listen(port,'127.0.0.1',()=>server.close(resolve));});
 const fd=fs.openSync(path.join(out,'telegram-emulator.log'),'wx');
 const emulator=spawn('java',['-jar',jar,'--host','127.0.0.1','--port','8189','--websocket_port','9159','--project_id','demo-telegram-alerts','--single_project_mode','true','--single_project_mode_error','true'],{cwd:root,windowsHide:true,stdio:['ignore',fd,fd]});
 fs.closeSync(fd);
 let launchError;emulator.on('error',error=>{launchError=error;});
 fs.writeFileSync(path.join(out,'telegram-emulator-ownership.json'),JSON.stringify({pid:emulator.pid,jar,project:'demo-telegram-alerts',ports:[8189,9159]},null,2));
 try{
  const deadline=Date.now()+60000;let ready=false;
  while(Date.now()<deadline){
   if(launchError)throw launchError;
   if(emulator.exitCode!==null)throw Error('Dedicated Telegram emulator exited before readiness.');
   try{await fetch('http://127.0.0.1:8189/',{signal:AbortSignal.timeout(1000)});ready=true;break;}catch{/* Only the owned loopback endpoint may be retried. */}
   await new Promise(resolve=>setTimeout(resolve,500));
  }
  if(!ready)throw Error('Dedicated Telegram emulator unavailable; no tests may proceed.');
  const log=path.join(out,'telegram-integration.log'),testFd=fs.openSync(log,'wx'),started=new Date().toISOString();
  const result=spawnSync(process.execPath,['--test','--test-force-exit','--test-timeout=90000','functions/telegramSalesAlerts.integration.test.js'],{cwd:root,env:{...env,GCLOUD_PROJECT:'demo-telegram-alerts',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8189',RUN_TELEGRAM_EMULATOR_TESTS:'true'},windowsHide:true,stdio:['ignore',testFd,testFd],timeout:180000});
  fs.closeSync(testFd);results.push({name:'telegram-integration',started,finished:new Date().toISOString(),exitCode:result.status,signal:result.signal,error:result.error?.message,log,project:'demo-telegram-alerts',transport:'test collector; nonlocal Node sockets denied'});
  fs.writeFileSync(path.join(out,'telegram-results.json'),JSON.stringify(results,null,2));process.exitCode=result.status===0?0:1;console.log('telegram-integration: '+result.status);
 }finally{
  if(emulator.pid&&emulator.exitCode===null){emulator.kill();await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Owned Telegram emulator did not exit')),10000);emulator.once('exit',()=>{clearTimeout(timer);resolve();});});}
 }
}
async function main(){
 if(mode==='telegram'){await telegram();return;}
 if(mode==='rules'&&process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080')throw Error('DRILL_ISOLATION: Rules require the local Firestore emulator.');
 if(!['static','rules'].includes(mode))await require('./safe-admin.cjs').health();
 for(const [name,args,cwd]of steps){
  const started=new Date().toISOString(),log=path.join(out,mode+'-'+name+'.log'),fd=fs.openSync(log,'w');
  const timeout=mode==='browser'?1800000:mode==='full'&&name==='phase-browser'?1860000:600000;
  const result=spawnSync(process.execPath,args,{cwd:cwd||root,env,windowsHide:true,stdio:['ignore',fd,fd],timeout});
  fs.closeSync(fd);results.push({name,args,started,finished:new Date().toISOString(),exitCode:result.status,signal:result.signal,error:result.error?.message,log});
  fs.writeFileSync(path.join(out,mode+'-results.json'),JSON.stringify(results,null,2));console.log(name+': '+result.status);
  if(result.status!==0&&(mode==='full'||mode==='concurrency'&&name==='isolation'))break;
 }
 process.exitCode=results.some(r=>r.exitCode!==0)?1:0;
}
main().catch(e=>{console.error(e.stack);process.exitCode=1});
