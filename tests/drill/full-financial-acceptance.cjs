const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
if(!process.versions.node.startsWith('20.'))throw Error('Node20 acceptance runtime required');
if(process.env.DRILL_RUN_ID!=='2026-10-16-full-financial')throw Error('Exact acceptance evidence directory required');
const root=path.resolve('.'),out=path.resolve('output/playwright',process.env.DRILL_RUN_ID),mode=process.argv[2],results=[];
const guard=' --require="'+path.resolve('tests/drill/server-guard.cjs').replaceAll('\\','/')+'"';
const env={...process.env,NODE_OPTIONS:(process.env.NODE_OPTIONS||'')+guard,GCLOUD_PROJECT:'demo-alphahub-drill',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIREBASE_EMULATOR_HUB:'127.0.0.1:4400',DRILL_GUARD_LOG:path.join(out,'server-guard.jsonl'),METADATA_SERVER_DETECTION:'none',VITE_LOCAL_AUTH_BYPASS:'false'};
Object.assign(process.env,env);
require('./server-guard.cjs');
const noLoans='^(?!.*(?:activates an empty clean start|activates the reviewed clean start|preserving owner loan payments|without touching loans)).*$';
const steps=mode==='static'?[
 ['domain',['node_modules/vitest/vitest.mjs','run','src','--exclude','**/*loan*.test.ts']],
 ['lint-src',['node_modules/eslint/bin/eslint.js','src']],
 ['lint-drill',['node_modules/eslint/bin/eslint.js','--config','tests/drill/eslint.config.mjs','tests/drill']],
 ['typescript',['node_modules/typescript/bin/tsc','-b']],
 ['build',['node_modules/vite/bin/vite.js','build']],
]:mode==='support'?[
 ['functions',['--test'],path.join(root,'functions')],
 ['rules-current',['node_modules/vitest/vitest.mjs','run','tests/finance.rules.test.ts','tests/refund.rules.test.ts','tests/registerInvoiceQueries.rules.test.ts','tests/vendorLogQueries.rules.test.ts']],
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
]:mode==='browser'?[...['smoke','finance','checkout','stock','stock-residual','refund','concurrency','financial','closure','advanced','resilience','remaining'].map(name=>[name,['tests/drill/run.cjs',name]])]:null;
if(!steps)throw Error('Expected static/support/browser mode');
async function main(){if(mode!=='static')await require('./safe-admin.cjs').health();for(const [name,args,cwd]of steps){const started=new Date().toISOString(),log=path.join(out,mode+'-'+name+'.log'),fd=fs.openSync(log,'w');const result=spawnSync(process.execPath,args,{cwd:cwd||root,env,windowsHide:true,stdio:['ignore',fd,fd],timeout:mode==='browser'?1800000:600000});fs.closeSync(fd);results.push({name,args,started,finished:new Date().toISOString(),exitCode:result.status,signal:result.signal,error:result.error?.message,log});fs.writeFileSync(path.join(out,mode+'-results.json'),JSON.stringify(results,null,2));console.log(name+': '+result.status)}process.exitCode=results.some(r=>r.exitCode!==0)?1:0}
main().catch(e=>{console.error(e.stack);process.exitCode=1});
