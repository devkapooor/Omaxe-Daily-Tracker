import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc, updateDoc, deleteDoc, getDoc, writeBatch } from 'firebase/firestore'

if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') throw new Error('Refund Rules tests require the loopback emulator; no production fallback.')
let env: RulesTestEnvironment
const base = 'posSandboxes/test'
beforeAll(async () => { env = await initializeTestEnvironment({ projectId: 'demo-refund-rules-batch3', firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync('firestore.rules', 'utf8') } }) }, 30_000)
beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore(), b = writeBatch(db)
    for (const role of ['owner', 'manager', 'billing']) b.set(doc(db, 'users', role), { name: role, role, approvalStatus: 'approved', disabled: false })
    b.set(doc(db, base, 'products', 'a'), { id: 'a', currentQuantity: 18, revision: 2, sellingPricePaise: 9000 })
    b.set(doc(db, base, 'bills', 'bill'), { id: 'bill', totalPaise: 18000, status: 'finalized' })
    b.set(doc(db, base, 'billStates', 'bill'), { billId: 'bill', state: 'partially-returned', revision: 2 })
    b.set(doc(db, base, 'approvals', 'posted'), { type: 'return', status: 'posted', ownerReviewStatus: 'pending', billId: 'bill', requestedByUid: 'billing', requestedByName: 'billing' })
    b.set(doc(db, base, 'events', 'refund'), { type: 'bill-return-approved', actorUid: 'billing' })
    b.set(doc(db, base, 'refundDays', '2026-10-14'), { date: '2026-10-14', cashRefundPaise: 9000, revision: 1 })
    b.set(doc(db, 'cashouts', 'pos-refund-posted'), { sourceKind: 'pos-return', amount: 90, amountPaise: 9000, category: 'POS Refund', paymentMode: 'Cash', billId: 'bill', approvalId: 'posted' })
    b.set(doc(db, 'cashouts', 'ordinary'), { amount: 10, category: 'Rent', paymentMode: 'Cash' })
    await b.commit()
  })
})
afterAll(async () => env?.cleanup())
describe('B3 final business write fence', () => {
  for (const role of ['owner', 'manager', 'billing']) {
    it(`${role} cannot forge stock, source, state, void or financial events`, async () => {
      const db = env.authenticatedContext(role).firestore()
      await assertFails(updateDoc(doc(db, base, 'products', 'a'), { currentQuantity: 118, revision: 3, lastMovementId: 'fake', updatedByUid: role }))
      await assertFails(setDoc(doc(db, base, 'stockMovements', 'fake'), { id: 'fake', type: 'void-reversal', productId: 'a', quantityDelta: 100, beforeQuantity: 18, afterQuantity: 118, productRevisionBefore: 2, productRevisionAfter: 3, actorUid: role }))
      await assertFails(setDoc(doc(db, base, 'approvals', 'fake'), { type: 'return', status: 'posted', requestedByUid: role }))
      await assertFails(setDoc(doc(db, base, 'approvals', 'fake-void'), { type: 'void', status: 'pending', requestedByUid: role }))
      await assertFails(updateDoc(doc(db, base, 'approvals', 'posted'), { ownerReviewStatus: 'reviewed' }))
      await assertFails(updateDoc(doc(db, base, 'billStates', 'bill'), { state: 'voided', revision: 3 }))
      for (const type of ['bill-return-approved', 'bill-voided']) await assertFails(setDoc(doc(db, base, 'events', type), { type, actorUid: role, refundAmountPaise: 9000 }))
    })
    it(`${role} cannot create/change/delete/convert linked expense or recovery controls`, async () => {
      const db = env.authenticatedContext(role).firestore()
      await assertFails(setDoc(doc(db, 'cashouts', 'pos-refund-forged'), { amount: 90, paymentMode: 'Cash' }))
      await assertFails(setDoc(doc(db, 'cashouts', 'forged-source'), { amount: 90, sourceKind: 'pos-return', paymentMode: 'Cash' }))
      await assertFails(updateDoc(doc(db, 'cashouts', 'pos-refund-posted'), { amount: 1 }))
      await assertFails(deleteDoc(doc(db, 'cashouts', 'pos-refund-posted')))
      await assertFails(updateDoc(doc(db, 'cashouts', 'ordinary'), { sourceKind: 'pos-return', amount: 90 }))
      for (const collection of ['refundOperations', 'refundStates', 'refundDays', 'refundCashoutQuotes']) await assertFails(setDoc(doc(db, base, collection, 'forged'), { revision: 1 }))
      await assertFails(getDoc(doc(db, base, 'refundOperations', 'forged')))
      await assertFails(getDoc(doc(db, base, 'refundStates', 'bill')))
    })
    it(`${role} keeps existing bill/day/expense reads but requires trusted ordinary expense posting`, async () => {
      const db = env.authenticatedContext(role).firestore()
      await assertSucceeds(getDoc(doc(db, base, 'bills', 'bill')))
      await assertSucceeds(getDoc(doc(db, base, 'refundDays', '2026-10-14')))
      await assertSucceeds(getDoc(doc(db, 'cashouts', 'pos-refund-posted')))
      await assertFails(setDoc(doc(db, 'cashouts', 'ordinary-' + role), { amount: 10, category: 'Rent', paymentMode: 'Cash' }))
    })
  }
  it('owner and original staff read return evidence, other staff and anonymous do not', async () => {
    for (const role of ['owner', 'billing']) await assertSucceeds(getDoc(doc(env.authenticatedContext(role).firestore(), base, 'approvals', 'posted')))
    await assertFails(getDoc(doc(env.authenticatedContext('manager').firestore(), base, 'approvals', 'posted')))
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), base, 'bills', 'bill')))
  })
  it('mixed forged expense/restoration batch leaves source records unchanged', async () => {
    const db = env.authenticatedContext('owner').firestore(), b = writeBatch(db)
    b.update(doc(db, base, 'products', 'a'), { currentQuantity: 19 }); b.set(doc(db, 'cashouts', 'pos-refund-forged'), { amount: 90 })
    await assertFails(b.commit())
    await env.withSecurityRulesDisabled(async ctx => { expect((await getDoc(doc(ctx.firestore(), base, 'products', 'a'))).data()?.currentQuantity).toBe(18); expect((await getDoc(doc(ctx.firestore(), 'cashouts', 'pos-refund-forged'))).exists()).toBe(false) })
  })
})

describe('B3 refund-aware closing proof', () => {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const checkpoint = { cashActualPaise: 100000, cashNetPaise: 0, date, upiActualPaise: 0, cardActualPaise: 0, upiNetPaise: 0, cardNetPaise: 0, reconciliationId: 'opening' }
  const ledger = { initialized: true, revision: 2, cashNetPaise: 9000, dailyTotals: { [date]: { upi: 0, card: 0 } }, checkpoint, counterSession: { status: 'open', date, openingReconciliationId: 'opening', openedByUid: 'owner' }, countReservation: null, lastOperation: 'refund', lastOperationId: 'posted', updatedByUid: 'owner' }
  async function seedClosing() {
    await env.withSecurityRulesDisabled(async ctx => {
      const db = ctx.firestore()
      await setDoc(doc(db, base, 'handover', 'main'), ledger)
      await setDoc(doc(db, base, 'refundDays', date), { revision: 1, cashRefundPaise: 9000 })
      await setDoc(doc(db, base, 'refundCashoutQuotes', 'proof'), { actorUid: 'owner', date, posCashRefundPaise: 9000, windowRefundPaise: 9000, posRefundDayRevision: 1, posRefundDayTotalPaise: 9000, posSourceHandoverRevision: 2 })
    })
  }
  function closing(overrides: Record<string, unknown> = {}) {
    const db = env.authenticatedContext('owner').firestore(), b = writeBatch(db), stamp = new Date().toISOString(), id = 'closing'
    b.set(doc(db, 'dailyCashouts', id), { id, date, drawerClosureId: id, recordedByUserId: 'owner', recordedBy: 'owner', drawerTotal: 1090, cashRemovedPaise: 109000, closingDrawerPaise: 0, holderBalancesAtClose: [], holderBalancesRevision: 1, cashExpense: 90, returns: 90, refundAccountingVersion: 1, posCashRefundPaise: 9000, posRefundDayRevision: 1, posRefundDayTotalPaise: 9000, posSourceHandoverRevision: 2, posRefundQuoteId: 'proof', createdAt: stamp, ...overrides })
    b.set(doc(db, 'cashMovementControl', 'main'), { revision: 1, lastOperation: 'daily-close', lastOperationId: id, updatedAt: stamp })
    b.set(doc(db, base, 'drawerClosures', id), { id, cashoutId: id, businessDate: date, kind: 'daily-cashout', expectedBeforePaise: 109000, countedPaise: 109000, differencePaise: 0, removedPaise: 109000, closingBalancePaise: 0, subsequentNetCashPaise: 0, resultingBalancePaise: 0, ledgerRevisionBefore: 2, recordedByUid: 'owner', recordedByName: 'owner', createdAt: stamp })
    b.set(doc(db, base, 'handover', 'main'), { ...ledger, revision: 3, lastOperation: 'cashout-close', lastOperationId: id, counterSession: { ...ledger.counterSession, status: 'closed' }, checkpoint: { ...checkpoint, cashActualPaise: 0, cashNetPaise: 9000 } })
    return b
  }
  it('denies an old browser linked-refund closing batch without changing the drawer', async () => {
    await seedClosing(); await assertFails(closing().commit())
    expect((await getDoc(doc(env.authenticatedContext('owner').firestore(), base, 'handover', 'main'))).data()?.checkpoint.cashActualPaise).toBe(100000)
  })
  for (const [name, changes] of Object.entries({ 'missing version': { refundAccountingVersion: 0 }, 'omitted refund expense': { cashExpense: 0 }, 'changed cash refund': { posCashRefundPaise: 0 }, 'omitted returns': { returns: 0 }, 'stale day revision': { posRefundDayRevision: 0 }, 'stale counter revision': { posSourceHandoverRevision: 1 }, 'fabricated proof': { posRefundQuoteId: 'fake' } })) it(`rejects ${name} without closing or modifying the drawer`, async () => {
    await seedClosing(); await assertFails(closing(changes).commit())
    const db = env.authenticatedContext('owner').firestore()
    expect((await getDoc(doc(db, 'dailyCashouts', 'closing'))).exists()).toBe(false)
    expect((await getDoc(doc(db, base, 'handover', 'main'))).data()).toEqual(ledger)
  })
})
