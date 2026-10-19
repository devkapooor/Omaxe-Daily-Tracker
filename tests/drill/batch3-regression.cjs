// Two positive void contracts are explicitly superseded by the user's B3 policy.
// Original files/results/manifest remain preserved, never counted as B3 passes.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process')
const suite=require('./batch1-regression.json'),runId=process.env.DRILL_RUN_ID
if(runId!=='2026-10-14-refund-batch3'||!process.versions.node.startsWith('20.'))throw Error('B3 run and Node20 required')
const retired=['B1-14 canonical repeated-SKU bill stays compatible with existing owner void','POS-10 POS-11 ACT-02 damaged return, void and stale decisions exactly once']
const out=path.resolve('output/playwright',runId),escaped=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),results=[]
fs.writeFileSync(path.join(out,'regression-contract.json'),JSON.stringify({baseline:suite.baseline,original:45,retained:43,superseded:retired,replacements:['B3-06 new void creation and old APIs denied','B3-01 immediate capped returns','B3-02 owner acknowledgement','B3-03 concurrency']},null,2))
for(const [batch,titles] of [['checkout',suite.checkoutTitles],...Object.entries(suite.batches)]){
 const selected=titles.filter(t=>!retired.includes(t)),result=spawnSync(process.execPath,['tests/drill/run.cjs',batch,'-g','(?:'+selected.map(escaped).join('|')+')$'],{windowsHide:true,env:process.env,encoding:'utf8',maxBuffer:25*1024*1024,timeout:900000})
 fs.writeFileSync(path.join(out,`regression-${batch}.log`),(result.stdout||'')+(result.stderr||'')+(result.error?.message||''));results.push({batch,expected:selected.length,exitCode:result.status,finishedAt:new Date().toISOString()});fs.writeFileSync(path.join(out,'regression-results.json'),JSON.stringify(results,null,2));console.log(batch+': '+result.status)
}
process.exitCode=results.some(r=>r.exitCode!==0)?1:0
