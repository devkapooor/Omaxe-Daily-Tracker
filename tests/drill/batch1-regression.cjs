// Preserve the exact45-case Batch1 acceptance contract, with serial resets.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process')
const suite=require('./batch1-regression.json')
if(!process.versions.node.startsWith('20.'))throw Error('Node20 is required')
const runId=process.env.DRILL_RUN_ID
if(!runId||runId==='2026-10-12-drill-01'||runId==='2026-10-13-checkout-batch1')throw Error('Use a new run directory; original evidence must remain unchanged')
const out=path.resolve('output/playwright',runId);fs.mkdirSync(out,{recursive:true})
const escaped=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
const results=[]
for(const [batch,titles] of [['checkout',null],...Object.entries(suite.batches)]){
 // Playwright greps fully qualified titles (including the file prefix).
 const args=['tests/drill/run.cjs',batch,...(titles?['-g','(?:'+titles.map(escaped).join('|')+')$']:[])]
 const result=spawnSync(process.execPath,args,{windowsHide:true,env:process.env,encoding:'utf8',maxBuffer:25*1024*1024,timeout:600000})
 fs.writeFileSync(path.join(out,`batch1-regression-${batch}.log`),(result.stdout||'')+(result.stderr||'')+(result.error?.message||''))
 results.push({batch,expected:titles?.length??16,exitCode:result.status,finishedAt:new Date().toISOString()});fs.writeFileSync(path.join(out,'batch1-regression-results.json'),JSON.stringify(results,null,2));console.log(batch+': '+result.status)
}
process.exitCode=results.some(row=>row.exitCode!==0)?1:0
