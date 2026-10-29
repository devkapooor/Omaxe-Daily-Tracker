// Local preparation only. This script never deploys, prints credentials or sends messages.
const fs = require('node:fs')
const path = require('node:path')
const { randomBytes } = require('node:crypto')
const { settings } = require('../telegramAlerts')

function prepare() {
  const source = path.join(__dirname, '..', '.env.telegram.local')
  const destination = path.join(__dirname, '..', '.env.telegram.secret.json')
  const raw = fs.readFileSync(source, 'utf8').replace(/^\uFEFF/, '')
  const read = key => raw.match(new RegExp('^' + key + '=(.+)$', 'm'))?.[1]?.trim()
  const token = read('TELEGRAM_BOT_TOKEN'), chatId = read('TELEGRAM_CHAT_ID')
  const previous = fs.existsSync(destination) ? JSON.parse(fs.readFileSync(destination, 'utf8')) : null
  if (previous && (previous.token !== token || String(previous.chatId) !== chatId)) throw new Error('Local Telegram destination differs from the prepared secret. Review it before rotating credentials.')
  const value = settings({ token, chatId, webhookSecret: previous?.webhookSecret || randomBytes(32).toString('hex') })
  if (!previous) {
    const temporary = destination + '.tmp'
    fs.writeFileSync(temporary, JSON.stringify(value), { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    fs.renameSync(temporary, destination)
  }
  return { prepared: true, file: 'functions/.env.telegram.secret.json', credentialsDisplayed: false }
}

if (require.main === module) {
  try { console.log(JSON.stringify(prepare())) }
  catch { console.error('Telegram secret preparation failed. Check the private local configuration; no credentials were displayed.'); process.exitCode = 1 }
}
module.exports = { prepare }
