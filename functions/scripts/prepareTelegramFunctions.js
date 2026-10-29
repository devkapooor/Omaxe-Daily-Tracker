// Build a separate deployment source so the bot never redeploys financial functions.
const fs = require('node:fs')
const path = require('node:path')

function prepareFunctions() {
  const functions = path.resolve(__dirname, '..')
  const root = path.resolve(functions, '..')
  const destination = path.join(root, 'output', 'telegram-functions')
  fs.mkdirSync(destination, { recursive: true })
  for (const name of ['telegramReports.js', 'telegramAlerts.js', 'telegramFunctions.js']) fs.copyFileSync(path.join(functions, name), path.join(destination, name))
  fs.writeFileSync(path.join(destination, 'index.js'), "const { initializeApp, getApps } = require('firebase-admin/app')\nconst { getFirestore } = require('firebase-admin/firestore')\nif (!getApps().length) initializeApp()\nObject.assign(exports, require('./telegramFunctions').registerTelegramFunctions(getFirestore()))\n", 'utf8')
  const original = JSON.parse(fs.readFileSync(path.join(functions, 'package.json'), 'utf8'))
  const pkg = { name: 'alphahub-telegram-functions', private: true, main: 'index.js', engines: { node: '22' }, dependencies: original.dependencies }
  fs.writeFileSync(path.join(destination, 'package.json'), JSON.stringify(pkg, null, 2) + '\n', 'utf8')
  const botLock = path.join(functions, 'telegram-package-lock.json')
  const lockFile = fs.existsSync(botLock) ? botLock : path.join(functions, 'package-lock.json')
  if (fs.existsSync(lockFile)) {
    const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'))
    lock.name = pkg.name
    if (lock.packages?.['']) {
      lock.packages[''].name = pkg.name
      lock.packages[''].engines = pkg.engines
    }
    fs.writeFileSync(path.join(destination, 'package-lock.json'), JSON.stringify(lock, null, 2) + '\n', 'utf8')
  }
  // Fail closed if an unexpected local file could be bundled on a later rebuild.
  const allowed = new Set(['index.js', 'telegramReports.js', 'telegramAlerts.js', 'telegramFunctions.js', 'package.json', 'package-lock.json', 'node_modules'])
  if (fs.readdirSync(destination).some(name => !allowed.has(name))) throw new Error('Unexpected file in the Telegram deployment source; review before release')
  return { source: 'output/telegram-functions', runtime: 'nodejs22', financialFunctionsIncluded: false }
}

if (require.main === module) {
  try { console.log(JSON.stringify(prepareFunctions())) }
  catch { console.error('Telegram source preparation failed; review the generated source before deployment.'); process.exitCode = 1 }
}
module.exports = { prepareFunctions }
