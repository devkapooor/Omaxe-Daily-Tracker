const { describe, it, beforeEach, after } = require('node:test')
const assert = require('node:assert/strict'), { randomUUID } = require('node:crypto')
const { createPosRefundHandlers } = require('./posRefunds')
describe('trusted immediate cash returns on dedicated demo emulator', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, () => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') throw Error('Loopback emulator required')
  const { initializeApp, deleteApp } = require('firebase-admin/app'), { getFirestore, Timestamp } = require('firebase-admin/firestore')
  const project = 'demo-refund-batch3', app = initializeApp({ projectId: project }, 'refund-batch3'), db = getFirestore(app), base = 'posSandboxes/test'
  let nowMs
  const handlers = createPosRefundHandlers(db, () => nowMs), auth = uid => ({ uid, token: { auth_time: 1 } })
  const call = (handler, data, uid = 'billing') => handler({ data, auth: auth(uid) })
  const selection = (quantity = 1, overrides = {}) => ({ billId: 'bill', returnCondition: 'sellable', returnLines: [{ lineId: 'A', quantity }], ...overrides })
  async function input(options = {}, uid = 'billing') { const d = selection(1, options), q = await call(handlers.quote, d, uid); return { ...d, operationId: randomUUID(), reason: 'Synthetic cash paid for selected original item', refundMethod: 'cash', refundAmountPaise: q.refundPaise, businessDate: q.businessDate, sourceBillRevision: q.sourceBillRevision, confirmationHash: q.confirmationHash } }
  async function read(path) { return (await db.doc(path).get()).data() }
  async function effects() {
    const sources = ['approvals', 'events', 'stockMovements', 'refundOperations', 'refundDays', 'refundStates']
    return { ...Object.fromEntries(await Promise.all(sources.map(async c => [c, (await db.collection(`${base}/${c}`).get()).docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.id.localeCompare(b.id))]))), expenses: (await db.collection('cashouts').get()).docs.map(d => ({ id: d.id, ...d.data() })), stock: await read(`${base}/products/a`), state: await read(`${base}/billStates/bill`), ledger: await read(`${base}/handover/main`) }
  }
  async function unchanged(action, pattern) { const before = await effects(); await assert.rejects(action(), pattern); assert.deepEqual(await effects(), before) }
  beforeEach(async () => {
    assert.equal((await db.collection('loans').limit(1).get()).size, 0)
    assert.equal((await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${project}/databases/(default)/documents`, { method: 'DELETE' })).ok, true)
    nowMs = Date.parse('2026-10-13T23:30:00.000Z')
    const b = db.batch(), stamp = new Date(nowMs).toISOString()
    for (const role of ['billing', 'manager', 'owner']) {
      b.set(db.doc(`users/${role}`), { name: `Synthetic ${role}`, role, approvalStatus: 'approved', disabled: false })
      b.set(db.doc(`${base}/cashierStates/${role}`), { uid: role, authTime: 1, closed: false, joinedCounterId: 'opening', needsLogoutCheck: false, lastBillId: 'bill', updatedAt: stamp })
    }
    b.set(db.doc(`${base}/bills/bill`), { id: 'bill', receiptNumber: 'SYNTHETIC-001', lines: [{ id: 'A', kind: 'product', productId: 'a', barcode: '00001', description: 'Original A', quantity: 2, unitPricePaise: 9000 }], subtotalPaise: 18000, discount: { mode: 'none', amountPaise: 0 }, totalPaise: 18000, payments: [{ method: 'cash', amountPaise: 18000 }], status: 'finalized', testOnly: true, businessDate: '2026-10-14', createdAt: stamp, createdByUid: 'billing', createdByName: 'Synthetic billing' })
    b.set(db.doc(`${base}/billStates/bill`), { billId: 'bill', state: 'active', revision: 1 })
    b.set(db.doc(`${base}/products/a`), { id: 'a', name: 'Current A', barcode: '00001', currentQuantity: 18, revision: 2, sellingPricePaise: 9500, sourceValues: { 'Printed MRP': '100' } })
    b.set(db.doc(`${base}/handover/main`), { initialized: true, revision: 1, cashNetPaise: 18000, dailyTotals: { '2026-10-14': { upi: 0, card: 0 } }, checkpoint: { date: '2026-10-14', cashActualPaise: 100000, cashNetPaise: 0 }, counterSession: { status: 'open', date: '2026-10-14', openingReconciliationId: 'opening' }, countReservation: null })
    await b.commit()
  })
  after(async () => deleteApp(app))
  for (const role of ['billing', 'manager', 'owner']) it(`${role} immediately posts original-price9000, stock19, cash9000, one expense/source without owner approval`, async () => {
    const originalBill = await read(`${base}/bills/bill`), intent = await input({}, role), result = await call(handlers.post, intent, role)
    assert.equal(result.status, 'posted'); assert.equal(result.ownerReviewStatus, 'pending'); assert.equal(result.postedByUid, role)
    const after = await effects(); assert.equal(after.stock.currentQuantity, 19); assert.equal(after.stock.sellingPricePaise, 9500); assert.equal(after.stock.revision, 3); assert.equal(after.ledger.cashNetPaise, 9000)
    assert.equal(after.expenses.length, 1); assert.equal(after.expenses[0].amount, 90); assert.equal(after.expenses[0].approvedBy, ''); assert.equal(after.expenses[0].postedByUid, role)
    assert.equal(after.events.length, 1); assert.equal(after.stockMovements.length, 1); assert.deepEqual(await read(`${base}/bills/bill`), originalBill)
    assert.equal((await read(`${base}/cashierStates/${role}`)).needsLogoutCheck, true)
  })
  it('replays after changed counter/stock and rejects changed actor/intent exactly once', async () => {
    const intent = await input(), original = await call(handlers.post, intent)
    await db.doc(`${base}/handover/main`).update({ 'counterSession.status': 'closed' })
    await db.doc(`${base}/products/a`).update({ currentQuantity: 30, revision: 4 })
    assert.deepEqual(await call(handlers.post, intent), original)
    await unchanged(async () => call(handlers.post, { ...intent, reason: 'changed reason' }), /different actor or intent/)
    await unchanged(async () => call(handlers.post, intent, 'manager'), /different actor or intent/)
    assert.equal((await effects()).expenses.length, 1)
  })
  it('owner acknowledgement affects no business records and review replay is idempotent', async () => {
    const record = await call(handlers.post, await input()), before = await effects(), intent = { operationId: randomUUID(), returnId: record.id }
    await unchanged(async () => call(handlers.review, intent, 'billing'), /account cannot/)
    const result = await call(handlers.review, intent, 'owner')
    assert.deepEqual(await call(handlers.review, intent, 'owner'), result)
    const after = await effects()
    for (const key of ['stock', 'state', 'ledger', 'stockMovements', 'events', 'expenses', 'refundStates', 'refundDays']) assert.deepEqual(after[key], before[key])
    assert.equal(after.approvals[0].ownerReviewStatus, 'reviewed')
  })
  it('caps quantities/shared conditions, rejects forged18000 quote and a stale second terminal unchanged', async () => {
    const intent = await input(), competing = await input({}, 'manager')
    await unchanged(async () => call(handlers.post, { ...intent, refundAmountPaise: 18000 }), /quote or counter changed/)
    await unchanged(async () => call(handlers.post, { ...intent, refundMethod: 'upi' }), /Cash only/)
    await call(handlers.post, intent)
    await unchanged(async () => call(handlers.post, competing, 'manager'), /quote or counter changed/)
    await unchanged(async () => call(handlers.quote, selection(2)), /remaining billed/)
    const second = await input({ returnCondition: 'damaged' }, 'manager'); await call(handlers.post, second, 'manager')
    const after = await effects(); assert.equal(after.stock.currentQuantity, 19); assert.equal(after.ledger.cashNetPaise, 0); assert.equal(after.events.length, 2); assert.equal(after.expenses.length, 2)
    await unchanged(async () => call(handlers.quote, selection(1)), /remaining billed/)
  })
  it('two full-return terminals commit at most one and reconcile state/cash/stock', async () => {
    const a = await input({ returnLines: [{ lineId: 'A', quantity: 2 }] }), b = await input({ returnLines: [{ lineId: 'A', quantity: 2 }] }, 'manager')
    const results = await Promise.allSettled([call(handlers.post, a), call(handlers.post, b, 'manager')]); assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
    const after = await effects(); assert.equal(after.stock.currentQuantity, 20); assert.equal(after.ledger.cashNetPaise, 0); assert.equal(after.expenses.length, 1); assert.deepEqual(after.state.returnedQuantities, { A: 2 })
  })
  it('supports original UPI/card/split/bank but pays Cash from drawer, never reverses those collections', async () => {
    await db.doc(`${base}/bills/bill`).update({ payments: [{ method: 'upi', amountPaise: 10000 }, { method: 'card', amountPaise: 8000 }] })
    await db.doc(`${base}/handover/main`).update({ cashNetPaise: 0, dailyTotals: { '2026-10-14': { upi: 10000, card: 8000 } } })
    const d = await input(); await call(handlers.post, d)
    const after = await effects(); assert.equal(after.ledger.cashNetPaise, -9000); assert.deepEqual(after.ledger.dailyTotals, { '2026-10-14': { upi: 10000, card: 8000 } }); assert.equal(after.expenses[0].paymentMode, 'Cash')
  })
  it('count lock and expiry/membership/closed-counter/insufficient-cash fail safely', async () => {
    await db.doc(`${base}/handover/main`).update({ countReservation: { uid: 'owner', name: 'Synthetic count', startedAt: Timestamp.fromMillis(nowMs) } })
    await unchanged(async () => call(handlers.post, await input()), /counting/)
    await db.doc(`${base}/handover/main`).update({ countReservation: { startedAt: Timestamp.fromMillis(nowMs - 300001) } })
    await db.doc(`${base}/cashierStates/billing`).update({ joinedCounterId: 'other' })
    await unchanged(async () => call(handlers.post, await input()), /Join/)
    await db.doc(`${base}/cashierStates/billing`).update({ joinedCounterId: 'opening' })
    await db.doc(`${base}/handover/main`).update({ 'counterSession.status': 'closed' })
    await unchanged(async () => call(handlers.post, await input()), /Open the current/)
    await db.doc(`${base}/handover/main`).update({ 'counterSession.status': 'open', 'checkpoint.cashActualPaise': 0, cashNetPaise: 0 })
    await unchanged(async () => call(handlers.post, await input()), /Insufficient/)
    await db.doc(`${base}/handover/main`).update({ 'checkpoint.cashActualPaise': 9000 })
    await call(handlers.post, await input()); assert.equal((await effects()).ledger.cashNetPaise, -9000)
  })
  it('anonymous/disabled/missing profiles reject and identity failure cannot discard a committed operation', async () => {
    const intent = await input(); await assert.rejects(handlers.post({ data: intent }), /Sign in/)
    await unchanged(async () => call(handlers.post, intent, 'absent'), /account cannot/)
    const result = await call(handlers.post, intent)
    await db.doc('users/billing').update({ disabled: true })
    try { await call(handlers.post, intent); assert.fail('Disabled recovery accepted') } catch (error) { assert.equal(error.details.refundUnposted, undefined) }
    await db.doc('users/billing').update({ disabled: false }); assert.deepEqual(await call(handlers.post, intent), result)
  })
  it('zero price and damaged returns create no fake cash expense/product movement', async () => {
    await db.doc(`${base}/bills/bill`).update({ discount: { mode: 'amount', amountPaise: 18000 }, totalPaise: 0, payments: [{ method: 'cash', amountPaise: 0 }] })
    const record = await call(handlers.post, await input({ returnCondition: 'damaged' }))
    const after = await effects(); assert.equal(record.refundAmountPaise, 0); assert.equal(record.expenseId, null); assert.equal(after.expenses.length, 0); assert.equal(after.stockMovements.length, 0); assert.equal(after.stock.currentQuantity, 18)
  })
  it('legacy repeated SKU lines restore one aggregated delta/revision/movement', async () => {
    await db.doc(`${base}/bills/bill`).update({ lines: [{ id: 'A', kind: 'product', productId: 'a', quantity: 2, unitPricePaise: 9000 }, { id: 'B', kind: 'product', productId: 'a', quantity: 1, unitPricePaise: 9000 }], subtotalPaise: 27000, totalPaise: 27000, payments: [{ method: 'cash', amountPaise: 27000 }] })
    await db.doc(`${base}/products/a`).update({ currentQuantity: 17 })
    await db.doc(`${base}/handover/main`).update({ cashNetPaise: 27000 })
    await call(handlers.post, await input({ returnLines: [{ lineId: 'A', quantity: 2 }, { lineId: 'B', quantity: 1 }] }))
    const after = await effects(); assert.equal(after.stock.currentQuantity, 20); assert.equal(after.stock.revision, 3); assert.equal(after.stockMovements.length, 1); assert.equal(after.stockMovements[0].quantityDelta, 3)
  })
  it('clear legacy returns initialise controls without rewriting history; ambiguous/orphan evidence blocks', async () => {
    const old = { type: 'return', billId: 'bill', status: 'approved', returnLines: [{ lineId: 'A', quantity: 1 }], returnCondition: 'sellable', refundMethod: 'cash', refundAmountPaise: 9000, reviewedAt: '2026-10-13T23:00:00Z', reviewedByUid: 'owner' }
    await db.doc(`${base}/approvals/old`).set(old)
    await db.doc(`${base}/events/old`).set({ type: 'bill-return-approved', billId: 'bill', approvalId: 'old', refundAmountPaise: 9000, refundMethod: 'cash', returnCondition: 'sellable', actorUid: 'owner' })
    await db.doc(`${base}/billStates/bill`).update({ state: 'partially-returned', returnedQuantities: { A: 1 }, revision: 2 })
    await db.doc(`${base}/products/a`).update({ currentQuantity: 19, revision: 3 })
    await call(handlers.post, await input()); assert.deepEqual(await read(`${base}/approvals/old`), old); assert.equal((await effects()).stock.currentQuantity, 20)
    await db.doc(`${base}/refundStates/bill`).delete()
    await unchanged(async () => call(handlers.quote, selection()), /Legacy|legacy|quantities/)
  })
  it('ambiguous legacy partial amounts and absent mapped products block without repair', async () => {
    await db.doc(`${base}/events/orphan`).set({ type: 'bill-return-approved', billId: 'bill', approvalId: 'missing', refundAmountPaise: 9000 })
    await unchanged(async () => call(handlers.quote, selection()), /quantities/)
    await db.doc(`${base}/events/orphan`).delete(); await db.doc(`${base}/products/a`).delete()
    await unchanged(async () => call(handlers.quote, selection()), /mapped product/)
    await call(handlers.post, await input({ returnCondition: 'damaged' })); assert.equal((await effects()).stockMovements.length, 0)
  })
  it('void creation/approval is retired; historical voids reject refunds and pending records close without effects', async () => {
    await unchanged(async () => call(handlers.post, { operationId: randomUUID(), type: 'void' }), /void.*retired/)
    await db.doc(`${base}/approvals/pending-void`).set({ type: 'void', billId: 'bill', status: 'pending', reason: 'Old pending void' })
    const before = await effects(); await call(handlers.closeLegacy, { operationId: randomUUID(), requestId: 'pending-void', reason: 'Void retired; no cancellation posted.' }, 'owner')
    const after = await effects(); for (const key of ['state', 'stock', 'ledger', 'events', 'stockMovements', 'expenses']) assert.deepEqual(after[key], before[key])
    await db.doc(`${base}/billStates/bill`).update({ state: 'voided' }); await unchanged(async () => call(handlers.quote, selection()), /voided/)
  })
  it('server IST rollover rejects stale confirmation without posting, then current counter can continue', async () => {
    nowMs = Date.parse('2026-10-14T18:29:59Z'); const intent = await input(); assert.equal(intent.businessDate, '2026-10-14')
    nowMs += 2000; await unchanged(async () => call(handlers.post, intent), /quote or counter changed/)
    await db.doc(`${base}/handover/main`).update({ 'counterSession.date': '2026-10-15', 'checkpoint.date': '2026-10-15' })
    const current = await input(); await call(handlers.post, current); assert.equal((await effects()).events[0].refundDate, '2026-10-15')
  })
  it('prepares immutable server refund closing proof with canonical remaining amount and stale context', async () => {
    await call(handlers.post, await input())
    const data = { operationId: randomUUID(), date: '2026-10-14' }, proof = await call(handlers.prepareCashout, data)
    assert.equal(proof.posCashRefundPaise, 9000); assert.equal(proof.posRefundDayTotalPaise, 9000); assert.equal(proof.posSourceHandoverRevision, 2)
    assert.deepEqual(await call(handlers.prepareCashout, data), proof)
    // Dedicated handler fixture simulates a completed legitimate closing; real
    // Auth/UI acceptance separately exercises the actual SDK/Rules closure.
    await db.doc('dailyCashouts/close').set({ date: '2026-10-14', refundAccountingVersion: 1, posRefundDayTotalPaise: 9000, createdAt: '2026-10-13T23:31:00Z' })
    await call(handlers.post, await input())
    const next = await call(handlers.prepareCashout, { operationId: randomUUID(), date: '2026-10-14' })
    assert.equal(next.posCashRefundPaise, 9000); assert.equal(next.posRefundDayTotalPaise, 18000)
  })
  it('atomically handles200 genuine source lines and200 product restorations;201 unsupported', async () => {
    const lines = [], b = db.batch()
    for (let i = 0; i < 200; i++) { const productId = `p-${i}`; lines.push({ id: `line-${i}`, kind: 'product', productId, quantity: 1, unitPricePaise: 100 }); b.set(db.doc(`${base}/products/${productId}`), { id: productId, currentQuantity: 0, revision: 1, sellingPricePaise: 100 }) }
    b.update(db.doc(`${base}/bills/bill`), { lines, subtotalPaise: 20000, totalPaise: 20000, payments: [{ method: 'cash', amountPaise: 20000 }] }); await b.commit()
    const d = await input({ returnLines: lines.map(l => ({ lineId: l.id, quantity: 1 })) }); await call(handlers.post, d)
    const after = await effects(); assert.equal(after.stockMovements.length, 200); assert.equal(after.expenses.length, 1); assert.equal(after.expenses[0].amountPaise, 20000)
    assert.equal((await read(`${base}/products/p-199`)).currentQuantity, 1)
    await db.doc(`${base}/bills/bill`).update({ lines: [...lines, { ...lines[0], id: 'line-201' }] })
    await unchanged(async () => call(handlers.quote, selection()), /cannot be safely quoted/)
  })
  it('historical bank payment refunds current cash, leaving the original payment and date untouched', async () => {
    await db.doc(`${base}/bills/bill`).update({ payments: [{ method: 'bank-transfer', amountPaise: 18000 }], businessDate: '2026-09-30', createdAt: '2026-09-30T17:30:00Z' })
    await db.doc(`${base}/handover/main`).update({ cashNetPaise: 0 })
    const original = await read(`${base}/bills/bill`), record = await call(handlers.post, await input())
    assert.equal(record.refundDate, '2026-10-14'); assert.equal(record.refundMethod, 'cash'); assert.equal(record.refundAmountPaise, 9000)
    assert.deepEqual(await read(`${base}/bills/bill`), original); assert.equal((await effects()).ledger.cashNetPaise, -9000)
  })
  it('unsafe next bill/counter/day revisions reject the complete transaction without effects', async () => {
    await db.doc(`${base}/billStates/bill`).update({ revision: Number.MAX_SAFE_INTEGER })
    await unchanged(async () => call(handlers.post, await input()), /safe integer range/)
    await db.doc(`${base}/billStates/bill`).update({ revision: 1 }); await db.doc(`${base}/handover/main`).update({ revision: Number.MAX_SAFE_INTEGER })
    await unchanged(async () => call(handlers.post, await input()), /safe integer range/)
    await db.doc(`${base}/handover/main`).update({ revision: 1 }); await db.doc(`${base}/refundDays/2026-10-14`).set({ revision: Number.MAX_SAFE_INTEGER, cashRefundPaise: 0, returnCount: 0 })
    await unchanged(async () => call(handlers.post, await input()), /safe integer range/)
  })
})
