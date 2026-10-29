const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const r = require('./telegramReports')
const { createTelegramApi, secureEqual } = require('./telegramAlerts')

const date = '2026-10-24'
const bill = (id, amount, payments = [{ method: 'cash', amountPaise: amount }]) => ({ id, businessDate: date, totalPaise: amount, payments })

describe('Telegram reporting calculations', () => {
  it('independently reconciles mixed payments, voids and refund-date accounting', () => {
    const summary = r.summarize(date, [bill('one', 1000000, [{ method: 'cash', amountPaise: 200000 }, { method: 'upi', amountPaise: 500000 }, { method: 'card', amountPaise: 300000 }]), bill('void', 999999), { ...bill('prior', 25000), businessDate: '2026-10-23' }], [{ billId: 'void', state: 'voided' }], [
      { type: 'bill-return-approved', billId: 'prior', refundDate: date, refundAmountPaise: 40000, refundMethod: 'cash' },
      { type: 'bill-return-approved', refundDate: '2026-10-23', refundAmountPaise: 50000, refundMethod: 'cash' },
      { type: 'return-requested', refundDate: date, refundAmountPaise: 50000, refundMethod: 'cash' },
    ], [{ date }])
    assert.equal(summary.netPaise, 960000)
    assert.equal(summary.billCount, 1)
    assert.equal(summary.methods.cash, 160000)
    assert.equal(summary.methods.upi, 500000)
    assert.equal(summary.methods.card, 300000)
    assert.equal(summary.refundsPaise, 40000)
    assert.equal(summary.averageBillPaise, 1000000)
    assert.equal(summary.cashoutCount, 1)
  })
  it('rejects forged, malformed and unsafe bill arithmetic instead of sending totals', () => {
    for (const bad of [bill('one', 20000, [{ method: 'cash', amountPaise: 19999 }]), bill('two', 0.5), bill('three', -1), bill('four', 20, []), bill('five', 10, [{ method: 'unknown', amountPaise: 10 }])]) assert.throws(() => r.summarize(date, [bad], [], []))
    assert.throws(() => r.summarize(date, [bill('a', Number.MAX_SAFE_INTEGER), bill('b', 1)], [], []))
  })
  it('supports a negative net-sales day and a genuine zero day', () => {
    assert.equal(r.summarize(date, [], [], [{ type: 'bill-return-approved', refundDate: date, refundAmountPaise: 12345, refundMethod: 'cash' }]).netPaise, -12345)
    assert.equal(r.summarize(date, [], [], []).netPaise, 0)
  })
  it('uses IST date boundaries and exact rupee formatting', () => {
    assert.equal(r.istDate('2026-10-24T18:29:59Z'), '2026-10-24')
    assert.equal(r.istDate('2026-10-24T18:30:00Z'), '2026-10-25')
    assert.match(r.money(12345678), /1,23,456\.78/)
    assert.match(r.money(500000), /5,000/)
  })
  it('combines multiple crossed milestones without unbounded message growth', () => {
    const summary = r.summarize(date, [bill('a', 1600000)], [], [])
    const text = r.milestoneText(summary, 0, '2026-10-24T09:00:00Z')
    for (const amount of ['5,000', '10,000', '15,000', '16,000']) assert.ok(text.includes(amount))
    assert.ok(r.milestoneText({ ...summary, netPaise: 500000000000 }, 0, Date.now()).length < 1000)
  })
  it('labels cashout windows, credit, inclusive outflows and shortage consistently', () => {
    const text = r.cashoutText({ date, revision: 1, cashSales: 1000, upiSales: 2000, cardSales: 500, creditSales: 250, returns: 100, cashExpense: 150, drawerTotal: 800, cashAudit: 850, recordedBy: 'Synthetic staff', reviewStatus: 'pending', createdAt: '2026-10-24T18:20:00Z' }, Date.now())
    for (const part of ['this cashout window', '3,650', 'Declared credit sales', 'includes cash refunds', 'Short by ₹50', 'Review: pending']) assert.ok(text.includes(part), part)
    assert.ok(!text.includes('profit'))
  })
  it('does not call an unreconciled historical count matched', () => {
    const text = r.cashoutText({ date, historicalCountOnlyVersion: 1, cashAudit: null, drawerTotal: 1250, createdAt: '2026-10-24T18:20:00Z' }, Date.now())
    assert.ok(text.includes('Not reconciled'))
    assert.ok(text.includes('Historical count'))
    assert.throws(() => r.cashoutText({ date, drawerTotal: 1, cashAudit: null, createdAt: '2026-10-24T18:20:00Z' }, Date.now()))
  })
})

describe('Telegram network and secret boundary', () => {
  const secret = { token: '123456:synthetic_test_token', chatId: '123456', webhookSecret: 's'.repeat(32) }
  it('does not expose token-bearing network failures', async () => {
    const api = createTelegramApi(() => secret, async url => { throw new Error('Network failure ' + url) })
    const result = await api('sendMessage', {})
    assert.deepEqual(result, { kind: 'uncertain' })
    assert.ok(!JSON.stringify(result).includes(secret.token))
  })
  it('retries only confirmed retryable rejections; treats proxy and invalid JSON as uncertain', async () => {
    const response = value => async () => ({ json: async () => value })
    assert.equal((await createTelegramApi(() => secret, response({ ok: false, error_code: 429, parameters: { retry_after: 12 } }))('sendMessage', {})).kind, 'retry')
    assert.equal((await createTelegramApi(() => secret, response({ ok: false, error_code: 403 }))('sendMessage', {})).kind, 'failed')
    assert.equal((await createTelegramApi(() => secret, response({ error: 'proxy error' }))('sendMessage', {})).kind, 'uncertain')
  })
  it('never follows redirects and checks webhook secrets', async () => {
    let captured
    await createTelegramApi(() => secret, async (url, options) => { captured = options; return { json: async () => ({ ok: true, result: { message_id: 1 } }) } })('sendMessage', {})
    assert.equal(captured.redirect, 'error')
    assert.equal(secureEqual('abc', 'abc'), true)
    assert.equal(secureEqual('abc', 'abd'), false)
    assert.equal(secureEqual('abc', undefined), false)
  })
  it('registers plain secret names compatible with the installed Firebase deployment protocol', () => {
    const { registerTelegramFunctions } = require('./telegramFunctions')
    const exports = registerTelegramFunctions({ doc: () => ({}) })
    assert.equal(Object.keys(exports).length, 7)
    const bound = Object.values(exports).filter(fn => fn.__endpoint.secretEnvironmentVariables?.length)
    assert.equal(bound.length, 3)
    for (const fn of bound) assert.deepEqual(fn.__endpoint.secretEnvironmentVariables.map(secret => secret.key), ['ALPHAHUB_TELEGRAM'])
  })
})
