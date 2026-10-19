const {spawnSync}=require('node:child_process'),path=require('node:path'),fs=require('node:fs')
const root=path.resolve('.'),out=path.resolve('output/playwright/2026-10-16-financial-remediation')
if(!process.versions.node.startsWith('20.'))throw Error('Node20 required')
Object.assign(process.env,{GCLOUD_PROJECT:'demo-alphahub-drill',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIREBASE_EMULATOR_HUB:'127.0.0.1:4400',METADATA_SERVER_DETECTION:'none',DRILL_GUARD_LOG:path.join(out,'server-guard.jsonl')})
process.env.NODE_OPTIONS=(process.env.NODE_OPTIONS||'')+' --require="'+path.resolve('tests/drill/server-guard.cjs').replaceAll('\\','/')+'"'
require('./server-guard.cjs')
const noLoans='^(?!.*(?:activates an empty clean start|activates the reviewed clean start|preserving owner loan payments|without touching loans)).*$'
const mode=process.argv[2],steps=mode==='focus'?[
 ['shared-functions',['--test','sharedViews.integration.test.js'],path.join(root,'functions')],
 ['shared-rules',['node_modules/vitest/vitest.mjs','run','tests/sharedViews.rules.test.ts','tests/finance.rules.test.ts','--maxWorkers','1','--hookTimeout','60000']],
]:mode==='support'?[
 ['functions',['--test'],path.join(root,'functions')],
 ['rules',['node_modules/vitest/vitest.mjs','run','tests/finance.rules.test.ts','tests/sharedViews.rules.test.ts','tests/refund.rules.test.ts','tests/registerInvoiceQueries.rules.test.ts','tests/vendorLogQueries.rules.test.ts','tests/firestore.rules.test.ts','tests/pos.repository.rules.test.ts','tests/stockPrice.rules.test.ts','tests/stockWorkspace.rules.test.ts','--maxWorkers','1','--hookTimeout','60000','-t',noLoans]],
]:mode==='static'?[
 ['domain',['node_modules/vitest/vitest.mjs','run','src','tests/financeMetrics.test.ts','--exclude','**/*loan*.test.ts']],
 ['lint-src',['node_modules/eslint/bin/eslint.js','src']],
 ['lint-drill',['node_modules/eslint/bin/eslint.js','--config','tests/drill/eslint.config.mjs','tests/drill']],
 ['typescript',['node_modules/typescript/bin/tsc','-b']],
 ['build',['node_modules/vite/bin/vite.js','build']],
]:null
if(!steps)throw Error('Expected focus/support/static')
async function main(){if(mode!=='static')await require('./safe-admin.cjs').health();const results=[];for(const [name,args,cwd]of steps){const started=new Date().toISOString(),log=path.join(out,mode+'-'+name+'.log'),fd=fs.openSync(log,'w');const r=spawnSync(process.execPath,args,{cwd:cwd||root,env:process.env,windowsHide:true,stdio:['ignore',fd,fd],timeout:1200000});fs.closeSync(fd);results.push({name,args,started,finished:new Date().toISOString(),exitCode:r.status,error:r.error?.message,log});fs.writeFileSync(path.join(out,mode+'-results.json'),JSON.stringify(results,null,2));console.log(name+': '+r.status)}process.exitCode=results.some(r=>r.exitCode!==0)?1:0}
main().catch(e=>{console.error(e.stack);process.exitCode=1})
