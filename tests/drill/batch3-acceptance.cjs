// Serial fixture ownership; every failed attempt remains in results.jsonl.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process')
if(process.env.DRILL_RUN_ID!=='2026-10-14-refund-batch3'||!process.versions.node.startsWith('20.'))throw Error('Exact isolated B3 run and configured Node20 required')
const out=path.resolve('output/playwright',process.env.DRILL_RUN_ID),results=[]
const steps=[['checkout-rerun','checkout','B1-02'],['concurrency-rerun','concurrency','POS-07 AUD-03'],['grn-rerun','financial','GRN-01 GRN-02'],['stock','stock',null],['final-stock-fence','stock-residual',null],['preserved-refund-attacks','financial','POS-09|SEC-02|SEC-03'],['damaged-history','advanced','STK-09'],['refund-final','refund',null]]
for(const [name,batch,grep] of steps){const result=spawnSync(process.execPath,['tests/drill/run.cjs',batch,...(grep?['-g',grep]:[])],{env:process.env,windowsHide:true,encoding:'utf8',maxBuffer:30*1024*1024,timeout:900000});fs.writeFileSync(path.join(out,name+'.log'),(result.stdout||'')+(result.stderr||'')+(result.error?.message||''));results.push({name,batch,exitCode:result.status,finishedAt:new Date().toISOString()});fs.writeFileSync(path.join(out,'acceptance-results.json'),JSON.stringify(results,null,2));console.log(name+': '+result.status)}
process.exitCode=results.some(r=>r.exitCode!==0)?1:0
