const { describe, it, beforeEach, after } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { createTelegramAlerts, BASE } = require('./telegramAlerts')

if (process.env.RUN_TELEGRAM_EMULATOR_TESTS !== 'true') {
  describe('Telegram isolated Firestore integration (opt in with RUN_TELEGRAM_EMULATOR_TESTS)', { skip: true }, () => {})
} else {
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8189') throw new Error('Telegram tests require the dedicated loopback emulator on port 8189')
  const { initializeApp, deleteApp } = require('firebase-admin/app')
  const { getFirestore } = require('firebase-admin/firestore')
  const projectId = 'demo-telegram-alerts'
  const admin = initializeApp({ projectId }, 'telegram-alert-tests')
  const db = getFirestore(admin)
  const credentials = { token: '123456:synthetic_test_token', chatId: '123456', webhookSecret: 's'.repeat(32) }
  const date = '2026-10-24'
  let timestamp, sent, outcome, app
  const bill = (id, totalPaise, businessDate = date) => ({ id, businessDate, totalPaise, payments: [{ method: 'cash', amountPaise: totalPaise }] })
  const putBill = async (id, amount, businessDate = date) => {
    await db.doc(BASE + '/bills/' + id).set(bill(id, amount, businessDate))
    await db.doc(BASE + '/billStates/' + id).set({ billId: id, state: 'active' })
  }
  const outbox = async () => (await db.collection('telegramOutbox').get()).docs.map(d => ({ ...d.data(), id: d.id }))
  const update = (id = 1, extra = {}) => ({ method: 'POST', secret: credentials.webhookSecret, body: { update_id: id, message: { chat: { id: 123456, type: 'private' }, from: { id: 123456, is_bot: false }, text: '/today', date: Math.floor(timestamp / 1000), ...extra } } })
  const cashout = async (id = 'close', revision = 1) => {
    const createdAt = new Date(timestamp).toISOString()
    await db.doc('dailyCashouts/' + id).set({ id, drawerClosureId: id, date, revision, createdAt, cashSales: 1000, upiSales: 200, cardSales: 50, creditSales: 0, returns: 20, cashExpense: 50, cashAudit: 950, drawerTotal: 925, recordedBy: 'Synthetic staff', reviewStatus: 'pending' })
    await db.doc(BASE + '/drawerClosures/' + id).set({ cashoutId: id, businessDate: date, kind: 'daily-cashout' })
  }
  describe('Telegram milestones, commands, cashouts and delivery in an isolated emulator', { concurrency: false }, () => {
    beforeEach(async () => {
      const result = await fetch('http://127.0.0.1:8189/emulator/v1/projects/' + projectId + '/databases/(default)/documents', { method: 'DELETE' })
      assert.equal(result.ok, true)
      timestamp = Date.parse('2026-10-24T08:00:00Z'); sent = []; outcome = null
      await db.doc('users/owner').set({ role: 'owner', approvalStatus: 'approved', disabled: false })
      await db.doc('users/billing').set({ role: 'billing' })
      app = createTelegramAlerts({ db, getSettings: () => credentials, now: () => timestamp, api: async (method, body) => {
        if (method === 'getMe') return { kind: 'sent', result: { username: 'StoreSalesAlertBot' } }
        if (method !== 'sendMessage') return { kind: 'sent', result: true }
        sent.push(body)
        return outcome || { kind: 'sent', result: { message_id: sent.length } }
      } })
    })
    after(async () => { await db.terminate(); await deleteApp(admin) })

    it('owner authorization and baseline avoid historical alert spam', async () => {
      assert.deepEqual(await app.configure('billing', 'enable'), { denied: true })
      await putBill('earlier', 1600000)
      const result = await app.configure('owner', 'enable')
      assert.equal(result.baselineNetPaise, 1600000)
      await app.queueMilestone(date)
      assert.equal((await outbox()).length, 0)
      await putBill('next', 400000)
      await app.queueMilestone(date)
      const rows = await outbox()
      assert.equal(rows.length, 1)
      assert.ok(rows[0].text.includes('20,000'))
      assert.ok(!rows[0].text.includes('Reached: ₹5,000'))
    })
    it('concurrent duplicate events queue exactly one threshold message', async () => {
      await app.configure('owner', 'enable')
      await putBill('one', 500000)
      await Promise.all(Array.from({ length: 6 }, () => app.queueMilestone(date)))
      assert.equal((await outbox()).length, 1)
      const original = (await db.doc(BASE + '/bills/one').get()).data()
      assert.deepEqual(original, bill('one', 500000))
    })
    it('combines jumps, suppresses refund recrossings, and resumes at a new high', async () => {
      await app.configure('owner', 'enable'); await putBill('one', 1100000)
      await app.queueMilestone(date)
      assert.ok((await outbox())[0].text.includes('5,000, ₹10,000'))
      await db.doc(BASE + '/events/refund').set({ type: 'bill-return-approved', refundDate: date, refundAmountPaise: 200000, refundMethod: 'cash' })
      await app.queueMilestone(date)
      await putBill('two', 150000); await app.queueMilestone(date)
      assert.equal((await outbox()).length, 1)
      await putBill('three', 450000); await app.queueMilestone(date)
      assert.equal((await outbox()).length, 2)
    })
    it('resets milestones by IST date and ignores late prior-day events', async () => {
      await app.configure('owner', 'enable'); await putBill('one', 500000); await app.queueMilestone(date)
      timestamp = Date.parse('2026-10-24T18:30:00Z')
      await app.queueMilestone(date)
      await putBill('tomorrow', 500000, '2026-10-25'); await app.queueMilestone('2026-10-25')
      assert.equal((await outbox()).length, 2)
    })
    it('authenticated /today is current, private, replay-safe, and does not alter milestones', async () => {
      await app.configure('owner', 'enable'); await putBill('one', 625075)
      await Promise.all([app.webhook(update()), app.webhook(update())])
      const rows = await outbox()
      assert.equal(rows.length, 1)
      assert.ok(rows[0].text.includes('6,250.75'))
      assert.ok(rows[0].text.includes('Source: POS'))
      await app.queueMilestone(date)
      assert.equal((await outbox()).length, 2)
    })
    it('rejects forged webhook headers, other users, groups and stale commands', async () => {
      await app.configure('owner', 'enable')
      assert.equal(await app.webhook({ ...update(), secret: 'forged' }), 403)
      assert.equal(await app.webhook({ ...update(), method: 'GET' }), 405)
      await app.webhook(update(2, { from: { id: 654321, is_bot: false } }))
      await app.webhook(update(3, { chat: { id: 123456, type: 'group' } }))
      await app.webhook(update(4, { date: Math.floor(timestamp / 1000) - 60 }))
      assert.equal((await outbox()).length, 0)
    })
    it('a disabled Firebase owner stops commands and delivery', async () => {
      await app.configure('owner', 'enable'); await putBill('one', 500000); await app.queueMilestone(date)
      await db.doc('users/owner').update({ disabled: true })
      await app.webhook(update()); await app.deliver((await outbox())[0].id)
      assert.equal(sent.length, 0)
      assert.equal((await outbox())[0].status, 'cancelled')
    })
    it('cashout event replay is deduplicated; a correction gets an explicitly revised report', async () => {
      await app.configure('owner', 'enable'); await cashout()
      await Promise.all([app.queueCashout('close'), app.queueCashout('close')])
      assert.equal((await outbox()).length, 1)
      assert.ok((await outbox())[0].text.includes('Short by ₹25'))
      await db.doc('dailyCashouts/close').update({ revision: 2, drawerTotal: 950 })
      await app.queueCashout('close')
      assert.equal((await outbox()).length, 2)
      assert.ok((await outbox()).some(d => d.text.includes('Revised') && d.text.includes('Cash check: Matched')))
    })
    it('does not report pre-activation cashouts or a cashout without closing evidence', async () => {
      await cashout(); timestamp += 1000; await app.configure('owner', 'enable')
      await app.queueCashout('close'); assert.equal((await outbox()).length, 0)
      await cashout('forged'); await db.doc(BASE + '/drawerClosures/forged').delete()
      await assert.rejects(app.queueCashout('forged'), /evidence/)
      assert.equal((await outbox()).length, 0)
    })
    it('parallel delivery attempts send once and later replay is inert', async () => {
      await app.configure('owner', 'enable'); await app.webhook(update())
      const id = (await outbox())[0].id
      await Promise.allSettled(Array.from({ length: 5 }, () => app.deliver(id)))
      await app.deliver(id)
      assert.equal(sent.length, 1)
      assert.equal((await outbox())[0].status, 'sent')
    })
    it('retries confirmed rate limits after backoff without resending successful messages', async () => {
      await app.configure('owner', 'enable'); await app.webhook(update())
      const id = (await outbox())[0].id
      outcome = { kind: 'retry', code: 429, retryAfter: 60 }
      await assert.rejects(app.deliver(id), /retry/)
      await assert.rejects(app.deliver(id), /retry/)
      assert.equal(sent.length, 1)
      timestamp += 61000; outcome = null; await app.deliver(id); await app.deliver(id)
      assert.equal(sent.length, 2)
      assert.equal((await outbox())[0].status, 'sent')
    })
    it('ambiguous network delivery and interrupted sends are not blindly retried', async () => {
      await app.configure('owner', 'enable'); await app.webhook(update())
      const id = (await outbox())[0].id
      outcome = { kind: 'uncertain' }; await app.deliver(id); await app.deliver(id)
      assert.equal(sent.length, 1); assert.equal((await outbox())[0].status, 'uncertain')
      await db.doc('telegramOutbox/' + id).update({ status: 'sending', startedAtMs: timestamp - 61000 })
      await app.deliver(id)
      assert.equal(sent.length, 1); assert.equal((await outbox())[0].status, 'uncertain')
    })
    it('pausing cancels queued messages and reenabling starts a new baseline', async () => {
      await app.configure('owner', 'enable'); await putBill('one', 500000); await app.queueMilestone(date)
      const id = (await outbox())[0].id
      await app.configure('owner', 'pause'); await app.deliver(id)
      assert.equal(sent.length, 0)
      await app.configure('owner', 'enable'); await app.queueMilestone(date)
      assert.equal((await outbox()).length, 1)
    })
    it('invalid source arithmetic fails closed without a milestone write', async () => {
      await app.configure('owner', 'enable'); await putBill('one', 500000)
      await db.doc(BASE + '/bills/one').update({ totalPaise: 900000 })
      await assert.rejects(app.queueMilestone(date), /reconcile/)
      assert.equal((await outbox()).length, 0)
    })
    it('a replacement owner can reactivate after the previous owner loses access', async () => {
      await app.configure('owner', 'enable')
      const previous = (await db.doc('telegramControl/main').get()).data().activationId
      await db.doc('users/owner').update({ disabled: true })
      await db.doc('users/new-owner').set({ role: 'owner', disabled: false, approvalStatus: 'approved' })
      assert.equal((await app.configure('new-owner', 'enable')).enabled, true)
      const current = (await db.doc('telegramControl/main').get()).data()
      assert.notEqual(current.activationId, previous)
      assert.equal(current.ownerUid, 'new-owner')
    })
    it('permanent Telegram failures and exhausted retries stop without another send', async () => {
      await app.configure('owner', 'enable'); await app.webhook(update())
      const id = (await outbox())[0].id
      outcome = { kind: 'failed', code: 403 }
      await app.deliver(id); await app.deliver(id)
      assert.equal(sent.length, 1)
      assert.equal((await outbox())[0].status, 'failed')
      await db.doc('telegramOutbox/' + id).update({ status: 'retry', attempts: 8 })
      await app.deliver(id)
      assert.equal(sent.length, 1)
      assert.equal((await outbox())[0].errorCode, 'retry-limit')
    })
    it('late cashouts retain their business date after IST midnight', async () => {
      await app.configure('owner', 'enable')
      timestamp = Date.parse('2026-10-24T18:35:00Z')
      await cashout('late')
      await db.doc('dailyCashouts/late').update({ lateCashoutVersion: 1 })
      await db.doc(BASE + '/drawerClosures/late').update({ kind: 'late-cashout' })
      await app.queueCashout('late')
      const message = (await outbox())[0].text
      assert.ok(message.includes('Business date: 2026-10-24'))
      assert.ok(message.includes('Late cashout'))
    })
    it('all bot control, baseline and delivery documents deny client access, including owners', async () => {
      const { initializeTestEnvironment, assertFails } = require('@firebase/rules-unit-testing')
      const { doc, getDoc, setDoc, collection, getDocs } = require('firebase/firestore')
      const env = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8189, rules: readFileSync(join(__dirname, '..', 'firestore.rules'), 'utf8') } })
      try {
        for (const role of ['owner', 'billing', 'outsider', null]) {
          const client = role ? env.authenticatedContext(role).firestore() : env.unauthenticatedContext().firestore()
          for (const name of ['telegramControl', 'telegramDays', 'telegramOutbox']) {
            await assertFails(getDoc(doc(client, name, 'main')))
            await assertFails(setDoc(doc(client, name, 'forged'), { enabled: true, text: 'forged alert' }))
            await assertFails(getDocs(collection(client, name)))
          }
        }
      } finally { await env.cleanup() }
    })
  })
}
