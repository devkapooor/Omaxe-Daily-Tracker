const { randomUUID, createHash, timingSafeEqual } = require('node:crypto')
const reports = require('./telegramReports')

const BASE = 'posSandboxes/test'
const CONTROL = 'telegramControl/main'
const MAX_ROWS = 5000
const hash = text => createHash('sha256').update(text).digest('hex')
const validOwner = p => p?.role === 'owner' && p.disabled !== true && p.approvalStatus !== 'rejected'

function settings(value) {
  if (!value || !/^\d+:[A-Za-z0-9_-]+$/.test(value.token) || !/^[1-9]\d*$/.test(String(value.chatId)) || !/^[A-Za-z0-9_-]{32,256}$/.test(value.webhookSecret)) throw new Error('Telegram server configuration is unavailable')
  return { token: value.token, chatId: String(value.chatId), webhookSecret: value.webhookSecret }
}
function secureEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const left = Buffer.from(a), right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}
// No upstream error bodies or URLs escape this boundary: they can contain tokens.
function createTelegramApi(getSettings, transport = fetch) {
  return async (method, body) => {
    const config = settings(getSettings())
    try {
      const response = await transport('https://api.telegram.org/bot' + config.token + '/' + method, {
        method: 'POST', redirect: 'error', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
      })
      const data = await response.json()
      if (data.ok === true) return { kind: 'sent', result: data.result }
      // A valid Bot API rejection confirms non-delivery; a proxy/invalid response does not.
      if (data.ok !== false || !Number.isInteger(data.error_code)) return { kind: 'uncertain' }
      if (data.error_code === 429 || data.error_code >= 500) return { kind: 'retry', code: data.error_code, retryAfter: Math.min(3600, Math.max(1, Number(data.parameters?.retry_after) || 30)) }
      return { kind: 'failed', code: data.error_code }
    } catch { return { kind: 'uncertain' } }
  }
}

function createTelegramAlerts({ db, getSettings, now = Date.now, api = createTelegramApi(getSettings) }) {
  const controlRef = db.doc(CONTROL)
  const dayRef = (config, date) => db.doc('telegramDays/' + config.activationId + '_' + date)
  const outRef = key => db.doc('telegramOutbox/' + key)
  const rows = snapshot => snapshot.docs.map(d => ({ ...d.data(), id: d.id }))

  async function owner(tx, uid) {
    return uid && validOwner((await tx.get(db.doc('users/' + uid))).data())
  }
  async function enabled(tx) {
    const config = (await tx.get(controlRef)).data()
    if (!config?.enabled || !/^[0-9a-f-]{36}$/.test(config.activationId) || !Number.isFinite(Date.parse(config.enabledAt)) || !await owner(tx, config.ownerUid)) return null
    return config
  }
  async function readDay(tx, date) {
    const [bills, events, cashouts] = await Promise.all([
      tx.get(db.collection(BASE + '/bills').where('businessDate', '==', date).limit(MAX_ROWS + 1)),
      tx.get(db.collection(BASE + '/events').where('refundDate', '==', date).limit(MAX_ROWS + 1)),
      tx.get(db.collection('dailyCashouts').where('date', '==', date).limit(MAX_ROWS + 1)),
    ])
    if ([bills, events, cashouts].some(s => s.size > MAX_ROWS)) throw new Error('Daily reporting source limit exceeded; no truncated totals sent')
    const states = []
    // Keep RPC sizes bounded; all reads remain inside the same transaction snapshot.
    for (let i = 0; i < bills.docs.length; i += 100) {
      const batch = await tx.getAll(...bills.docs.slice(i, i + 100).map(d => db.doc(BASE + '/billStates/' + d.id)))
      states.push(...batch.filter(s => s.exists).map(s => ({ ...s.data(), billId: s.id })))
    }
    return reports.summarize(date, rows(bills), states, rows(events), rows(cashouts))
  }
  function queued(config, kind, text, timestamp) {
    return { activationId: config.activationId, kind, text, status: 'queued', attempts: 0, createdAt: new Date(timestamp).toISOString() }
  }

  async function configure(uid, action) {
    if (!['status', 'enable', 'pause'].includes(action)) throw new Error('Invalid Telegram action')
    if (!uid || !validOwner((await db.doc('users/' + uid).get()).data())) return { denied: true }
    if (action === 'status') {
      const config = (await controlRef.get()).data()
      const issues = await db.collection('telegramOutbox').where('status', 'in', ['failed', 'uncertain']).limit(50).get()
      return { enabled: config?.enabled === true, botUsername: 'StoreSalesAlertBot', enabledAt: config?.enabledAt || null, deliveryIssues: issues.size, deliveryIssuesCapped: issues.size === 50 }
    }
    if (action === 'pause') {
      return db.runTransaction(async tx => {
        if (!await owner(tx, uid)) return { denied: true }
        tx.set(controlRef, { enabled: false, pausedAt: new Date(now()).toISOString(), pausedBy: uid }, { merge: true })
        return { enabled: false }
      })
    }
    // Verify bot identity before registering commands or our own fixed webhook URL.
    const config = settings(getSettings())
    const me = await api('getMe', {})
    if (me.kind !== 'sent' || me.result?.username?.toLowerCase() !== 'storesalesalertbot') throw new Error('Bot identity could not be verified')
    const project = db.projectId
    if (!/^[a-z][a-z0-9-]{4,62}$/.test(project)) throw new Error('Invalid Firebase project')
    const webhook = await api('setWebhook', { url: 'https://asia-south1-' + project + '.cloudfunctions.net/telegramSalesWebhook', secret_token: config.webhookSecret, allowed_updates: ['message'], max_connections: 5 })
    if (webhook.kind !== 'sent' || webhook.result !== true) throw new Error('Telegram webhook could not be configured')
    const commands = await api('setMyCommands', { scope: { type: 'chat', chat_id: config.chatId }, commands: [{ command: 'today', description: 'Today’s POS sales and payment summary' }, { command: 'help', description: 'Available AlphaHub bot commands' }] })
    if (commands.kind !== 'sent' || commands.result !== true) throw new Error('Telegram command menu could not be configured')
    return db.runTransaction(async tx => {
      if (!await owner(tx, uid)) return { denied: true }
      const existing = (await tx.get(controlRef)).data()
      if (existing?.enabled && await owner(tx, existing.ownerUid)) return { enabled: true, alreadyEnabled: true }
      const timestamp = now(), date = reports.istDate(timestamp)
      const summary = await readDay(tx, date)
      const next = { enabled: true, activationId: randomUUID(), enabledAt: new Date(timestamp).toISOString(), ownerUid: uid }
      tx.set(controlRef, next)
      tx.set(dayRef(next, date), { date, highestMilestone: Math.max(0, Math.floor(summary.netPaise / reports.STEP_PAISE)), baseline: true, updatedAt: next.enabledAt })
      return { enabled: true, baselineNetPaise: summary.netPaise }
    })
  }

  async function queueMilestone(date) {
    if (date !== reports.istDate(now())) return
    return db.runTransaction(async tx => {
      const config = await enabled(tx)
      if (!config) return
      const ref = dayRef(config, date), saved = (await tx.get(ref)).data()
      const summary = await readDay(tx, date), reached = Math.max(0, Math.floor(summary.netPaise / reports.STEP_PAISE))
      const previous = saved ? reports.integer(saved.highestMilestone, 'milestone') : 0
      if (reached <= previous) return
      const timestamp = now()
      if (date !== reports.istDate(timestamp)) return
      tx.create(outRef('milestone-' + config.activationId + '-' + date + '-' + reached), queued(config, 'milestone', reports.milestoneText(summary, previous, timestamp), timestamp))
      tx.set(ref, { date, highestMilestone: reached, baseline: false, updatedAt: new Date(timestamp).toISOString() })
    })
  }

  async function queueCashout(id) {
    if (typeof id !== 'string' || id.includes('/')) return
    return db.runTransaction(async tx => {
      const config = await enabled(tx)
      if (!config) return
      const entry = (await tx.get(db.doc('dailyCashouts/' + id))).data()
      if (!entry || !Number.isFinite(Date.parse(entry.createdAt)) || Date.parse(entry.createdAt) < Date.parse(config.enabledAt)) return
      if (entry.drawerClosureId !== id || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) throw new Error('Cashout closure evidence is missing')
      const closure = (await tx.get(db.doc(BASE + '/drawerClosures/' + id))).data()
      if (closure?.cashoutId !== id || closure.businessDate !== entry.date || !['daily-cashout', 'late-cashout', 'historical-cashout'].includes(closure.kind)) throw new Error('Cashout closure evidence is invalid')
      const revision = reports.integer(entry.revision ?? 1, 'cashout revision', 1)
      const target = outRef('cashout-' + config.activationId + '-' + hash(id) + '-' + revision)
      if ((await tx.get(target)).exists) return
      const timestamp = now()
      tx.create(target, queued(config, 'cashout', reports.cashoutText(entry, timestamp), timestamp))
    })
  }

  async function webhook({ method, secret, body }) {
    if (method !== 'POST') return 405
    const credentials = settings(getSettings())
    if (!secureEqual(secret, credentials.webhookSecret)) return 403
    if (!body || !Number.isSafeInteger(body.update_id) || body.update_id < 0) return 400
    const message = body.message
    if (!message || message.chat?.type !== 'private' || String(message.chat.id) !== credentials.chatId || String(message.from?.id) !== credentials.chatId || message.from?.is_bot !== false) return 200
    const command = /^\/(today|start|help)(?:@StoreSalesAlertBot)?\s*$/i.exec(message.text || '')?.[1]?.toLowerCase()
    if (!command) return 200
    await db.runTransaction(async tx => {
      const config = await enabled(tx)
      if (!config || !Number.isSafeInteger(message.date) || message.date < Math.floor(Date.parse(config.enabledAt) / 1000)) return
      const target = outRef('command-' + config.activationId + '-' + body.update_id)
      if ((await tx.get(target)).exists) return
      const timestamp = now()
      const text = command === 'today' ? reports.todayText(await readDay(tx, reports.istDate(timestamp)), timestamp) : 'AlphaHub sales alerts\n\n/today — today’s POS sales, bills and payment split.\n\nAutomatic reports: every ₹5,000 sales milestone and each completed daily cashout. Business dates use IST.'
      tx.create(target, queued(config, 'command', text, timestamp))
    })
    return 200
  }

  async function deliver(id) {
    const ref = outRef(id), timestamp = now(), lease = randomUUID()
    const work = await db.runTransaction(async tx => {
      const config = await enabled(tx), snapshot = await tx.get(ref), item = snapshot.data()
      if (!item || ['sent', 'failed', 'uncertain', 'cancelled'].includes(item.status)) return null
      if (!config || item.activationId !== config.activationId) { tx.update(ref, { status: 'cancelled' }); return null }
      if (item.status === 'sending') {
        if (timestamp - item.startedAtMs < 60000) return { retry: true }
        tx.update(ref, { status: 'uncertain', errorCode: 'interrupted-send' })
        return null
      }
      if (!['queued', 'retry'].includes(item.status)) return null
      if (item.nextAttemptMs > timestamp) return { retry: true }
      if (item.attempts >= 8) { tx.update(ref, { status: 'failed', errorCode: 'retry-limit' }); return null }
      if (typeof item.text !== 'string' || item.text.length > 4000) { tx.update(ref, { status: 'failed', errorCode: 'invalid-message' }); return null }
      tx.update(ref, { status: 'sending', lease, startedAtMs: timestamp, attempts: item.attempts + 1 })
      return { text: item.text }
    })
    if (!work) return
    if (work.retry) throw new Error('Telegram delivery pending retry')
    const outcome = await api('sendMessage', { chat_id: settings(getSettings()).chatId, text: work.text })
    let retry = false
    await db.runTransaction(async tx => {
      const item = (await tx.get(ref)).data()
      if (item?.lease !== lease || item.status !== 'sending') return
      const patch = { status: outcome.kind, updatedAt: new Date(now()).toISOString() }
      if (outcome.kind === 'sent') patch.messageId = reports.integer(outcome.result?.message_id, 'Telegram message ID', 1)
      else if (outcome.kind === 'retry') {
        patch.nextAttemptMs = now() + Math.max(30, Number(outcome.retryAfter) || 30) * 1000
        patch.errorCode = outcome.code || 'rejected'
        retry = true
      } else patch.errorCode = outcome.code || 'delivery-unconfirmed'
      tx.update(ref, patch)
    })
    if (retry) throw new Error('Telegram delivery pending retry')
  }
  return { configure, queueMilestone, queueCashout, webhook, deliver, readDay }
}

module.exports = { BASE, CONTROL, MAX_ROWS, settings, secureEqual, createTelegramApi, createTelegramAlerts }
