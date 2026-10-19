// Serial, resumable final checks. Each attempt has its own immutable log.
const fs = require('node:fs'), path = require('node:path'), { spawnSync } = require('node:child_process')
if (process.env.DRILL_RUN_ID !== '2026-10-14-refund-batch3' || !process.versions.node.startsWith('20.')) throw Error('Exact isolated B3 run and Node20 required')
require('./server-guard.cjs')
const out = path.resolve('output/playwright', process.env.DRILL_RUN_ID), results = [], attempt = Date.now()
const steps = [['isolation', 'smoke', 'ENV-01'], ['history-paise', 'refund', 'B3-18|B3-19'], ['damaged-history', 'advanced', 'STK-09'], ['price-history', 'stock', 'B2-08']]
for (const [name, batch, grep] of steps) {
  const result = spawnSync(process.execPath, ['tests/drill/run.cjs', batch, '-g', grep], { env: process.env, windowsHide: true, encoding: 'utf8', maxBuffer: 30 * 1024 * 1024, timeout: 300000 })
  const log = `resume-${attempt}-${name}.log`
  fs.writeFileSync(path.join(out, log), (result.stdout || '') + (result.stderr || '') + (result.error?.message || ''))
  results.push({ name, batch, exitCode: result.status, finishedAt: new Date().toISOString(), log })
  fs.writeFileSync(path.join(out, `resume-${attempt}-results.json`), JSON.stringify(results, null, 2))
  console.log(name + ': ' + result.status)
  if (name === 'isolation' && result.status !== 0) break
}
process.exitCode = results.some(r => r.exitCode !== 0) ? 1 : 0
