const fs = require('node:fs'), path = require('node:path'), { spawnSync } = require('node:child_process')
const runId = process.env.DRILL_RUN_ID || '2026-10-13-checkout-batch1'
const checkAttempt = process.env.DRILL_CHECK_ATTEMPT || 'checks'
if (!/^[A-Za-z0-9_-]+$/.test(checkAttempt)) throw Error('Invalid local check evidence folder')
const out = path.resolve('output/playwright', runId, checkAttempt)
async function main() {
  if (!process.versions.node.startsWith('20.')) throw Error('Configured Node20 acceptance runtime required')
  Object.assign(process.env, { GCLOUD_PROJECT: 'demo-alphahub-drill', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' })
  require('./server-guard.cjs')
  await require('./safe-admin.cjs').health()
  fs.mkdirSync(out, { recursive: true })
  const noLoans = '^(?!.*(?:activates an empty clean start|activates the reviewed clean start|preserving owner loan payments|without touching loans)).*$'
  const guard = ' --require="' + path.resolve('tests/drill/server-guard.cjs').replaceAll('\\', '/') + '"'
  const env = { ...process.env, NODE_OPTIONS: (process.env.NODE_OPTIONS || '') + guard, VITE_LOCAL_AUTH_BYPASS: 'false', VITE_USE_FIREBASE_EMULATORS: 'false' }
  const steps = [
    ['domain', ['node_modules/vitest/vitest.mjs', 'run', 'src', '--exclude', '**/*loan*.test.ts']],
    ['rules', ['node_modules/vitest/vitest.mjs', 'run', 'tests/firestore.rules.test.ts', 'tests/pos.repository.rules.test.ts', 'tests/stockPrice.rules.test.ts', 'tests/stockWorkspace.rules.test.ts', 'tests/refund.rules.test.ts', '-t', noLoans]],
    ['functions', ['--test'], path.resolve('functions')],
    ['lint-src', ['node_modules/eslint/bin/eslint.js', 'src']],
    ['lint-drill', ['node_modules/eslint/bin/eslint.js', '--config', 'tests/drill/eslint.config.mjs', 'tests/drill']],
    ['typescript', ['node_modules/typescript/bin/tsc', '-b']],
    ['build', ['node_modules/vite/bin/vite.js', 'build']],
  ]
  const results = []
  for (const [name, args, cwd] of steps) {
    const startedAt = new Date().toISOString()
    const result = spawnSync(process.execPath, args, { cwd: cwd || process.cwd(), env, windowsHide: true, encoding: 'utf8', maxBuffer: 25 * 1024 * 1024, timeout: 300000 })
    fs.writeFileSync(path.join(out, name + '.log'), (result.stdout || '') + (result.stderr || '') + (result.error?.message || ''))
    results.push({ name, startedAt, finishedAt: new Date().toISOString(), runtime: process.version, command: [process.execPath, ...args], exitCode: result.status, log: path.join(out, name + '.log') })
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2)); console.log(name + ': ' + result.status)
  }
  const diff = spawnSync('git', ['diff', '--check'], { windowsHide: true, encoding: 'utf8' })
  results.push({ name: 'diff-check', exitCode: diff.status }); fs.writeFileSync(path.join(out, 'diff-check.log'), diff.stdout + diff.stderr)
  // B2-A explicitly approves additive local indexes for price-bearing history.
  // Runtime/dependencies/Firebase project/env configuration remain protected.
  const protectedChanges = spawnSync('git', ['diff', '--name-only', 'HEAD', '--', 'package.json', 'package-lock.json', 'functions/package.json', 'functions/package-lock.json', 'firebase.json', '.firebaserc', ...(['2026-10-14-stock-batch2','2026-10-14-refund-batch3'].includes(runId) ? [] : ['firestore.indexes.json']), '.env*'], { windowsHide: true, encoding: 'utf8' })
  results.push({ name: 'dependencies-production-config-unchanged', exitCode: protectedChanges.status === 0 && !protectedChanges.stdout.trim() ? 0 : 1 })
  fs.writeFileSync(path.join(out, 'protected-files.log'), protectedChanges.stdout + protectedChanges.stderr)
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2))
  process.exitCode = results.some(result => result.exitCode !== 0) ? 1 : 0
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
