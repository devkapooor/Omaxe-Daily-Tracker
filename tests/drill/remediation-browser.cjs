const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process')
if(!process.versions.node.startsWith('20.'))throw Error('Node20 acceptance runtime required')
const root=path.resolve('.'),out=path.resolve('output/playwright/2026-10-16-financial-remediation')
fs.mkdirSync(out,{recursive:true})
const steps=[...['smoke','finance-followup','finance','checkout','stock','stock-residual','refund','concurrency','financial','closure','advanced','resilience','remaining'].map(name=>[name,[]]),['remediation',[]]]
const results=[]
for(const [name,args]of steps){const started=new Date().toISOString(),log=path.join(out,'browser-'+name+'.log'),fd=fs.openSync(log,'w');const r=spawnSync(process.execPath,['tests/drill/remediation-run.cjs',name,...args],{cwd:root,windowsHide:true,stdio:['ignore',fd,fd],timeout:1800000});fs.closeSync(fd);results.push({name,args,started,finished:new Date().toISOString(),exitCode:r.status,error:r.error?.message,log});fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify(results,null,2));console.log(name+': '+r.status)}
process.exitCode=results.some(r=>r.exitCode!==0)?1:0
