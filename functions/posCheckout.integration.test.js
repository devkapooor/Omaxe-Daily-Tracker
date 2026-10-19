const { describe, it, beforeEach, after } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { createCheckoutHandler, percentageDiscount, receiptNumber, istDate, normalize } = require('./posCheckout')

describe('checkout paise and receipt contracts', () => {
  it('independently calculates discount fixtures including rounding and maximum safe paise', () => {
    assert.equal(percentageDiscount(22500, 5), 1125)
    assert.equal(percentageDiscount(1, 50), 1)
    assert.equal(percentageDiscount(10001, 12.5), 1250)
    assert.equal(percentageDiscount(Number.MAX_SAFE_INTEGER, 100), Number.MAX_SAFE_INTEGER)
    assert.equal(percentageDiscount(1000000000, 1e-7), 1)
    assert.throws(() => percentageDiscount(100, 101), /between 0 and 100/)
  })
  it('retains TNS receipt shape and IST/FY boundary date', () => {
    assert.equal(istDate(new Date('2026-10-12T18:29:59.999Z')), '2026-10-12')
    assert.equal(istDate(new Date('2026-10-12T18:30:00.000Z')), '2026-10-13')
    assert.equal(receiptNumber('2026-10-13', '2026-10-13T05:00:00.000Z', 1), 'TNS-20261013-103000000-000001')
  })
  it('requires stable IDs and rejects unsupported authority fields', () => {
    assert.throws(() => normalize({ operationId: 'random', actor: { role: 'owner' } }), /unsupported fields/)
    assert.throws(() => normalize({ operationId: 'random' }), /stable checkout/)
  })
})

describe('checkout server transaction in dedicated emulator project', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, () => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') throw Error('Checkout acceptance requires the loopback emulator.')
  const { initializeApp, deleteApp } = require('firebase-admin/app')
  const { getFirestore, Timestamp } = require('firebase-admin/firestore')
  const project = 'demo-pos-checkout', base = 'posSandboxes/test'
  const app = initializeApp({ projectId: project }, 'checkout-server-test'), db = getFirestore(app)
  let now = Date.parse('2026-10-13T05:00:00.000Z')
  const handler = createCheckoutHandler(db, () => now)
  const auth = { uid: 'billing', token: { auth_time: 123 } }
  const draft = extra => ({ operationId: randomUUID(), businessDate: '2026-10-13', lines: [{ id: 'a', kind: 'product', productId: 'a', barcode: '00001', description: 'A', quantity: 2, unitPricePaise: 9000, expectedProductRevision: 1, stockAtScan: 20 }], discount: { mode: 'none', amountPaise: 0 }, payments: [{ method: 'cash', amountPaise: 18000 }], ...extra })
  beforeEach(async () => {
    now = Date.parse('2026-10-13T05:00:00.000Z')
    assert.equal((await db.collection('loans').limit(1).get()).size, 0, 'Loan data must never be reset')
    const reset = await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${project}/databases/(default)/documents`, { method: 'DELETE' })
    assert.equal(reset.ok, true)
    const batch = db.batch()
    batch.set(db.doc('users/billing'), { name: 'Fixture billing', role: 'billing', disabled: false })
    batch.set(db.doc(`${base}/products/a`), { name: 'A', barcode: '00001', sellingPricePaise: 9000, currentQuantity: 20, revision: 1 })
    batch.set(db.doc(`${base}/configuration/checkout`), { billingMaxDiscountPercentage: 5 })
    batch.set(db.doc(`${base}/handover/main`), { initialized: true, revision: 1, cashNetPaise: 0, dailyTotals: {}, checkpoint: { date: '2026-10-13', cashActualPaise: 100000, cashNetPaise: 0 }, counterSession: { status: 'open', openingReconciliationId: 'opening' }, countReservation: null })
    batch.set(db.doc(`${base}/cashierStates/billing`), { uid: 'billing', authTime: 123, closed: false, joinedCounterId: 'opening', joinedAt: Timestamp.fromMillis(now), lastReconciliationId: '' })
    batch.set(db.doc(`${base}/bills/legacy`), { id: 'legacy', lines: [{ unitPricePaise: 7500 }], totalPaise: 7500, createdByUid: 'billing' })
    await batch.commit()
  })
  after(async () => { await deleteApp(app) })
  it('reads profile truth and canonical prices; preserves historical bill', async () => {
    await assert.rejects(handler({ auth, data: draft({ lines: [{ ...draft().lines[0], unitPricePaise: 1 }], payments: [{ method: 'cash', amountPaise: 2 }] }) }), /updated since scan/)
    const bill = await handler({ auth, data: draft() })
    assert.equal(bill.createdByRole, 'billing'); assert.equal(bill.totalPaise, 18000)
    assert.equal((await db.doc(`${base}/products/a`).get()).get('currentQuantity'), 18)
    assert.equal((await db.doc(`${base}/bills/legacy`).get()).get('totalPaise'), 7500)
  })
  it('replays original result after closed counter, revision/date change and new login', async () => {
    const data = draft(), bill = await handler({ auth, data })
    now += 86400000
    await db.doc(`${base}/handover/main`).update({ 'counterSession.status': 'closed' })
    assert.deepEqual(await handler({ auth: { uid: 'billing', token: { auth_time: 456 } }, data }), bill)
    await assert.rejects(handler({ auth, data: { ...data, customerName: 'Changed' } }), /different intent/)
    assert.equal((await db.doc(`${base}/products/a`).get()).get('currentQuantity'), 18)
  })
  it('rejects disabled/missing profiles and false auth_time with no source creation', async () => {
    await assert.rejects(handler({ auth: null, data: draft() }), /Sign in/)
    await assert.rejects(handler({ auth: { uid: 'missing', token: { auth_time: 123 } }, data: draft() }), /account cannot/)
    await assert.rejects(handler({ auth: { ...auth, token: { auth_time: 456 } }, data: draft() }), /Join the open/)
    await db.doc('users/billing').update({ disabled: true })
    await assert.rejects(handler({ auth, data: draft() }), /account cannot/)
    assert.equal((await db.collection(`${base}/bills`).get()).size, 1)
    assert.equal((await db.doc(`${base}/handover/main`).get()).get('cashNetPaise'), 0)
  })
  it('enforces five-minute reservation boundary on trusted time', async () => {
    await db.doc(`${base}/handover/main`).update({ countReservation: { name: 'Counter fixture', startedAt: Timestamp.fromMillis(now - 299999) } })
    await assert.rejects(handler({ auth, data: draft() }), /counting the shared drawer/)
    now += 1
    assert.equal((await handler({ auth, data: draft() })).totalPaise, 18000)
  })
  it('rejects overflow, foreign duplicate line IDs and invalid allocations atomically', async () => {
    const cases = [draft({ lines: [{ ...draft().lines[0], quantity: Number.MAX_SAFE_INTEGER }] }), draft({ lines: [draft().lines[0], draft().lines[0]] }), draft({ payments: [{ method: 'cash', amountPaise: -1 }] })]
    for (const data of cases) await assert.rejects(handler({ auth, data }))
    assert.equal((await db.collection(`${base}/bills`).get()).size, 1)
    assert.equal((await db.collection(`${base}/stockMovements`).get()).size, 0)
    assert.equal((await db.doc(`${base}/products/a`).get()).get('revision'), 1)
  })
})
