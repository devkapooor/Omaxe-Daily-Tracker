const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process')
const out=path.resolve('output/playwright/2026-10-12-drill-01')
const records=[]
function check(name,command,args){const started=new Date().toISOString(),result=spawnSync(command,args,{encoding:'utf8',windowsHide:true,maxBuffer:10*1024*1024});fs.writeFileSync(path.join(out,'checks',name+'-final.log'),(result.stdout||'')+(result.stderr||''));records.push({name,started,finished:new Date().toISOString(),exitCode:result.status,log:'output/playwright/2026-10-12-drill-01/checks/'+name+'-final.log'});return result}
check('lint-drill',process.execPath,['node_modules/eslint/bin/eslint.js','--config','tests/drill/eslint.config.mjs','tests/drill'])
check('git-diff','git',['diff','--check'])
const protectedFiles=check('protected-files','git',['diff','--name-only','HEAD','--','src','functions','firestore.rules','firestore.indexes.json','firebase.json','.firebaserc','package.json','package-lock.json'])
records.push({name:'protected-files-unchanged',exitCode:protectedFiles.status===0&&!protectedFiles.stdout.trim()?0:1})
const status=check('git-status','git',['status','--short'])
fs.writeFileSync(path.join(out,'final-checks.json'),JSON.stringify({at:new Date().toISOString(),records,changedFiles:status.stdout.trim().split('\n'),loanMutations:'None; guarded fixture reset refuses any loan document; four loan-writing Rules cases and loanMoney domain file excluded.',productionVerification:'None; no production mutation or deployment.'},null,2))
process.exitCode=records.some(r=>r.exitCode!==0)?1:0
console.log('Final checks: '+JSON.stringify(records.map(r=>({name:r.name,exitCode:r.exitCode}))))
