const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process')
const out=path.resolve('output/playwright',process.env.DRILL_RUN_ID,'checks')
fs.mkdirSync(out,{recursive:true})
const env={...process.env,NODE_OPTIONS:(process.env.NODE_OPTIONS||'')+' --require="'+path.resolve('tests/drill/server-guard.cjs').replaceAll('\\','/')+'"',VITE_LOCAL_AUTH_EMAIL:'',VITE_LOCAL_AUTH_PASSWORD:'',VITE_LOCAL_AUTH_BYPASS:'false',VITE_USE_FIREBASE_EMULATORS:'false'}
// Exclude the four historical Rules scenarios that write loan fixtures/payments.
const noLoans='^(?!.*(?:activates an empty clean start|activates the reviewed clean start|preserving owner loan payments|without touching loans)).*$'
const steps=[
 ['domain',['node_modules/vitest/vitest.mjs','run','src','--exclude','**/*loan*.test.ts']],
 ['rules',['node_modules/vitest/vitest.mjs','run','tests/firestore.rules.test.ts','tests/pos.repository.rules.test.ts','tests/stockPrice.rules.test.ts','tests/stockWorkspace.rules.test.ts','-t',noLoans]],
 ['functions',['--test'],path.resolve('functions')],
 ['lint-src',['node_modules/eslint/bin/eslint.js','src']],
 ['lint-drill',['node_modules/eslint/bin/eslint.js','--config','tests/drill/eslint.config.mjs','tests/drill']],
 ['typescript',['node_modules/typescript/bin/tsc','-b']],
 ['vite-build',['node_modules/vite/bin/vite.js','build']],
]
const results=[]
for(const [name,args,cwd] of steps){const started=new Date().toISOString();const r=spawnSync(process.execPath,args,{cwd:cwd||process.cwd(),env,encoding:'utf8',windowsHide:true,maxBuffer:25*1024*1024,timeout:300000});fs.writeFileSync(path.join(out,name+'.log'),(r.stdout||'')+(r.stderr||'')+(r.error?.message||''));results.push({name,started,finished:new Date().toISOString(),exitCode:r.status,error:r.error?.message,command:[process.execPath,...args],log:'output/playwright/'+process.env.DRILL_RUN_ID+'/checks/'+name+'.log'});fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(name+': '+r.status)}
const diff=spawnSync('git',['diff','--check'],{encoding:'utf8',windowsHide:true});fs.writeFileSync(path.join(out,'diff-check.log'),diff.stdout+diff.stderr);results.push({name:'git-diff-check',exitCode:diff.status})
const protectedDiff=spawnSync('git',['diff','--name-only','HEAD','--','src','functions','firestore.rules','firestore.indexes.json','firebase.json','.firebaserc','package.json','package-lock.json'],{encoding:'utf8',windowsHide:true});fs.writeFileSync(path.join(out,'protected-files.log'),protectedDiff.stdout+protectedDiff.stderr);results.push({name:'application-config-unchanged',exitCode:protectedDiff.status===0&&!protectedDiff.stdout.trim()?0:1})
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));process.exitCode=results.some(r=>r.exitCode!==0)?1:0
