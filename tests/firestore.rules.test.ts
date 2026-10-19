import { trustedFinanceSupport } from './trustedFinanceSupport'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, Timestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore'
import {
  activateVendorLedgerV2,
  applyOwnerSettlementCorrectionV2,
  applySettlementCorrectionV2,
  createSettlementCorrectionRequestV2,
  createPurchaseV2,
  createSettlementV2,
  createVendorChequeV2,
  createVendorV2,
  createVendorReturnV2,
  resolveVendorReturnV2,
  transitionVendorChequeV2,
  withdrawSettlementCorrectionRequestV2,
} from '../src/store/vendorLedgerV2Repository'
import {
  createPayrollTerm,
  finalizeSalarySlip,
  recordSalaryPayment,
  reviseSalarySlip,
  savePayrollMonth,
  savePayrollProfile,
  savePayrollSettings,
  saveSalaryDraft,
  salaryRevisionId,
  salarySlipId,
} from '../src/features/payroll/data/payrollRepository'

let testEnvironment: RulesTestEnvironment
const trusted = trustedFinanceSupport('demo-alphahub')

const projectId = 'demo-alphahub'
const timestamp = '2026-10-01T00:00:00.000Z'

function userDb(userId: string) {
  return testEnvironment.authenticatedContext(userId).firestore()
}

async function seedUser(
  id: string,
  role: 'owner' | 'manager' | 'billing',
  disabled = false,
  purchasingCapabilities: Record<string, boolean> = {},
) {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users', id), {
      name: id,
      email: `${id}@example.com`,
      role,
      createdAt: timestamp,
      disabled,
      purchasingCapabilities,
    })
  })
}

beforeAll(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })
}, 30_000)

beforeEach(async () => {
  await testEnvironment.clearFirestore()
  await Promise.all([
    seedUser('owner-user', 'owner'),
    seedUser('manager-user', 'manager'),
    seedUser('billing-user', 'billing'),
    seedUser('disabled-user', 'billing', true),
    seedUser('purchasing-user', 'manager', false, {
      'vendor.manage': true,
      'purchase.create': true,
      'settlement.create': true,
      'vendorLedger.view': true,
    }),
    seedUser('cheque-user', 'manager', false, {
      'cheque.prepare': true,
      'cheque.issue': true,
      'cheque.present': true,
      'cheque.debit': true,
      'cheque.cancel': true,
    }),
  ])
})

afterAll(async () => {
  if (testEnvironment) await testEnvironment.cleanup()
  await trusted.close()
})

describe('Firestore role enforcement', () => {
  it('allows active staff reads and blocks disabled or unauthenticated reads', async () => {
    const owner = userDb('owner-user')
    await setDoc(doc(owner, 'stores', 'single-store'), { name: 'AlphaHub' })

    await assertSucceeds(getDoc(doc(userDb('billing-user'), 'stores', 'single-store')))
    await assertFails(getDoc(doc(userDb('disabled-user'), 'stores', 'single-store')))
    await assertFails(getDoc(doc(testEnvironment.unauthenticatedContext().firestore(), 'stores', 'single-store')))
  })

  it('allows only owners to mutate users and protected finance records', async () => {
    const owner = userDb('owner-user')
    const billing = userDb('billing-user')
    await assertSucceeds(setDoc(doc(owner, 'users', 'new-user'), { name: 'New', role: 'billing', createdAt: timestamp }))

    await assertFails(setDoc(doc(billing, 'cashouts', 'expense-1'), {
      storeId: 'single-store', date: '2026-10-01', paidTo: 'Vendor', amount: 100,
      category: 'Other', paymentMode: 'Cash', approvedBy: 'Pending approval', notes: '',
      createdAt: timestamp, updatedAt: timestamp,
    }))
    await assertFails(updateDoc(doc(billing, 'cashouts', 'expense-1'), { amount: 200 }))
    await assertFails(deleteDoc(doc(billing, 'cashouts', 'expense-1')))
    await assertFails(deleteDoc(doc(owner, 'cashouts', 'expense-1')))
  })

  it('requires all cash transfer writes to pass through the server balance guard', async () => {
    const billing = userDb('billing-user')
    const baseTransfer = {
      id: 'transfer-1', date: '2026-10-01', toType: 'bank', bankDepositMethod: 'bank', amount: 100,
      reason: 'Deposit', createdBy: 'billing-user', createdAt: timestamp,
    }

    await assertFails(setDoc(doc(billing, 'cashTransfers', 'transfer-1'), { ...baseTransfer, fromUserId: 'billing-user' }))
    await assertFails(setDoc(doc(billing, 'cashTransfers', 'transfer-2'), { ...baseTransfer, id: 'transfer-2', fromUserId: 'manager-user' }))
    await assertFails(setDoc(doc(userDb('manager-user'), 'cashTransfers', 'transfer-3'), { ...baseTransfer, id: 'transfer-3', fromUserId: 'billing-user' }))
    const bankTransferWithoutMethod = {
      id: 'transfer-4', date: '2026-10-01', toType: 'bank', amount: 100,
      reason: 'Deposit', createdBy: 'billing-user', createdAt: timestamp, fromUserId: 'billing-user',
    }
    await assertFails(setDoc(doc(billing, 'cashTransfers', 'transfer-4'), bankTransferWithoutMethod))
    await assertFails(setDoc(doc(billing, 'cashTransfers', 'transfer-invalid-method'), {
      ...baseTransfer, id: 'transfer-invalid-method', fromUserId: 'billing-user', bankDepositMethod: 'unknown',
    }))
    await assertFails(setDoc(doc(billing, 'cashTransfers', 'transfer-5'), {
      id: 'transfer-5', date: '2026-10-01', fromUserId: 'billing-user', toType: 'person', toUserId: 'manager-user',
      amount: 100, reason: 'Cash handover', createdBy: 'billing-user', createdAt: timestamp,
    }))
  })

  it('keeps audit history owner-readable and append-only', async () => {
    const manager = userDb('manager-user')
    const owner = userDb('owner-user')
    const auditRef = doc(manager, 'settingsAudit', 'audit-1')

    await assertSucceeds(setDoc(auditRef, { actor: 'manager-user', action: 'Bank balance updated', createdAt: timestamp }))
    await assertFails(getDoc(auditRef))
    await assertSucceeds(getDoc(doc(owner, 'settingsAudit', 'audit-1')))
    await assertFails(updateDoc(doc(owner, 'settingsAudit', 'audit-1'), { action: 'Changed' }))
    await assertFails(deleteDoc(doc(owner, 'settingsAudit', 'audit-1')))
  })

  it('denies all browser bank/settings changes after trusted publication cutover', async () => {
    const owner = userDb('owner-user')
    const manager = userDb('manager-user')
    const settingsRef = doc(owner, 'appMetadata', 'appSettings')
    await testEnvironment.withSecurityRulesDisabled(async c => setDoc(doc(c.firestore(), 'appMetadata', 'appSettings'), { currentBankBalance: 1000, marginPercentage: 25 }))

    await assertFails(updateDoc(doc(manager, 'appMetadata', 'appSettings'), { currentBankBalance: 1200 }))
    await assertFails(updateDoc(doc(manager, 'appMetadata', 'appSettings'), { marginPercentage: 30 }))
    await assertFails(updateDoc(settingsRef, { marginPercentage: 30 }))
  })

  it('denies direct legacy allocations and arbitrary purchase edits', async () => {
    const billing = userDb('billing-user')
    await testEnvironment.withSecurityRulesDisabled(async c => setDoc(doc(c.firestore(), 'purchases', 'purchase-1'), {
      storeId: 'single-store', date: '2026-10-01', supplierName: 'Vendor', billNumber: '1',
      purchaseAmount: 1000, paidAmount: 0, unpaidAmount: 1000, paymentMode: 'Credit',
      category: 'Stock', notes: '', createdAt: timestamp, updatedAt: timestamp,
    }))

    await assertFails(updateDoc(doc(billing, 'purchases', 'purchase-1'), { paidAmount: 200, unpaidAmount: 800, updatedAt: timestamp }))
    await assertFails(updateDoc(doc(billing, 'purchases', 'purchase-1'), { purchaseAmount: 500 }))
  })

  it('denies old browser cashout and linked sales posting', async () => {
    const billing = userDb('billing-user')
    const owner = userDb('owner-user')
    const cashout = {
      date: '2026-10-01', recordedBy: 'billing-user', recordedByUserId: 'billing-user',
      cashSales: 500, upiSales: 300, creditSales: 100, returns: 0, cashAudit: 500,
      actualCashParticulars: '500 x 1 = 500', pendingCashParticulars: '', remainingBalance: 500,
      createdAt: timestamp,
    }
    await assertFails(setDoc(doc(owner, 'dailyCashouts', 'cashout-1'), cashout))
    await assertFails(setDoc(doc(billing, 'dailyCashouts', 'cashout-2'), { ...cashout, recordedByUserId: 'manager-user' }))
    // A cashout must now include its matching drawer closure and per-holder balance snapshot.
    await assertFails(setDoc(doc(billing, 'dailyCashouts', 'cashout-3'), cashout))

    const sales = {
      storeId: 'single-store', date: '2026-10-01', totalSales: 900, cashSales: 500,
      upiSales: 300, cardSales: 0, bankTransferSales: 0, creditSales: 100,
      returnsDiscounts: 0, notes: 'Auto-synced from cashout register.',
      createdAt: timestamp, updatedAt: timestamp,
    }
    await assertFails(setDoc(doc(billing, 'sales', 'single-store-2026-10-01'), sales))
    await assertFails(setDoc(doc(billing, 'sales', 'invalid-sales'), { ...sales, totalSales: 999 }))
    await assertFails(updateDoc(doc(billing, 'sales', 'single-store-2026-10-01'), { date: '2026-10-02' }))
  })

  it('allows managers but not billing users to manage planned payments', async () => {
    const plannedPayment = {
      title: 'Rent', date: '2026-10-05', amount: 5000, notes: '',
      createdBy: 'manager-user', createdAt: timestamp, updatedAt: timestamp,
    }
    await assertSucceeds(setDoc(doc(userDb('manager-user'), 'plannedPayments', 'planned-1'), plannedPayment))
    await assertFails(setDoc(doc(userDb('billing-user'), 'plannedPayments', 'planned-2'), plannedPayment))
  })

  it('keeps cashout correction review owner-only while staff can read only their own request', async () => {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const database = context.firestore()
      await setDoc(doc(database, 'dailyCashouts', 'cashout-approval-1'), {
        date: '2026-10-01', recordedBy: 'billing-user', recordedByUserId: 'billing-user',
        cashSales: 500, upiSales: 300, creditSales: 100, returns: 0, cashAudit: 500,
        actualCashParticulars: '500 x 1 = 500', pendingCashParticulars: '', remainingBalance: 500,
        createdAt: timestamp, revision: 1,
      })
      await setDoc(doc(database, 'cashoutCorrectionRequests', 'correction-approval-1'), {
        cashoutId: 'cashout-approval-1', cashoutDate: '2026-10-01', recordedBy: 'billing-user',
        recordedByUserId: 'billing-user', sourceRevision: 1, requestedByUserId: 'billing-user',
        requestedBy: 'billing-user', reason: 'Correct drawer count', requestType: 'staff-request',
        status: 'pending', createdAt: timestamp,
      })
    })

    const requestPath = 'cashoutCorrectionRequests/correction-approval-1'
    await assertSucceeds(getDoc(doc(userDb('owner-user'), requestPath)))
    await assertSucceeds(getDoc(doc(userDb('billing-user'), requestPath)))
    await assertFails(getDoc(doc(userDb('manager-user'), requestPath)))
    await assertFails(getDoc(doc(userDb('disabled-user'), requestPath)))
    await assertFails(getDoc(doc(testEnvironment.unauthenticatedContext().firestore(), requestPath)))

    await assertFails(updateDoc(doc(userDb('owner-user'), requestPath), { status: 'approved' }))

    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), requestPath), { status: 'pending' })
    })
    await assertFails(updateDoc(doc(userDb('manager-user'), requestPath), { status: 'approved' }))
    await assertFails(updateDoc(doc(userDb('billing-user'), requestPath), { status: 'approved' }))
    await assertFails(updateDoc(doc(userDb('disabled-user'), requestPath), { status: 'approved' }))
  })
})

describe('POS test sandbox isolation', () => {
  const product = {
    barcode: '890000000001', name: 'Test Product', searchName: 'test product', category: 'Test', brand: 'Brand', vendor: 'Vendor',
    sellingPricePaise: 1000, currentQuantity: -2, revision: 1, active: true,
    createdAt: timestamp, createdByUid: 'owner-user', createdByName: 'owner-user',
    updatedAt: timestamp, updatedByUid: 'owner-user', updatedByName: 'owner-user',
  }

  it('lets staff read products and audit valuation costs while protecting owner configuration', async () => {
    const owner = userDb('owner-user')
    await testEnvironment.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'posSandboxes', 'test', 'products', 'p-1'), product))
    await testEnvironment.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'posSandboxes', 'test', 'productCosts', 'p-1'), { productId: 'p-1', costPaise: 600, sourceValue: '6', importRunId: 'run', updatedAt: timestamp, updatedByUid: 'owner-user', updatedByName: 'owner-user' }))
    await setDoc(doc(owner, 'posSandboxes', 'test', 'configuration', 'admin'), { importPolicy: 'owner-only' })
    await setDoc(doc(owner, 'posSandboxes', 'test', 'configuration', 'checkout'), { billingMaxDiscountPercentage: 5 })

    await assertSucceeds(getDoc(doc(userDb('billing-user'), 'posSandboxes', 'test', 'products', 'p-1')))
    await assertSucceeds(getDoc(doc(userDb('billing-user'), 'posSandboxes', 'test', 'productCosts', 'p-1')))
    await assertSucceeds(getDoc(doc(userDb('manager-user'), 'posSandboxes', 'test', 'productCosts', 'p-1')))
    await assertFails(getDoc(doc(userDb('billing-user'), 'posSandboxes', 'test', 'configuration', 'admin')))
    await assertSucceeds(getDoc(doc(userDb('billing-user'), 'posSandboxes', 'test', 'configuration', 'checkout')))
  })

  it('rejects browser audit posting even with a linked fabricated movement', async () => {
    const owner = userDb('owner-user')
    await testEnvironment.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'posSandboxes', 'test', 'products', 'p-1'), product))
    const billing = userDb('billing-user')
    await assertFails(updateDoc(doc(billing, 'posSandboxes', 'test', 'products', 'p-1'), { currentQuantity: -3, revision: 2, lastMovementId: 'missing', updatedAt: timestamp, updatedByUid: 'billing-user', updatedByName: 'billing-user' }))

    const batch = writeBatch(billing)
    batch.update(doc(billing, 'posSandboxes', 'test', 'products', 'p-1'), { currentQuantity: -3, revision: 2, lastMovementId: 'move-1', updatedAt: timestamp, updatedByUid: 'billing-user', updatedByName: 'billing-user' })
    batch.set(doc(billing, 'posSandboxes', 'test', 'stockMovements', 'move-1'), { id: 'move-1', productId: 'p-1', actorUid: 'billing-user', actorName: 'billing-user', actorRole: 'billing', type: 'stock-audit', quantityDelta: -1, beforeQuantity: -2, afterQuantity: -3, productRevisionBefore: 1, productRevisionAfter: 2, businessDate: '2026-10-03', createdAt: timestamp })
    await assertFails(batch.commit())
    expect((await getDoc(doc(billing, 'posSandboxes', 'test', 'products', 'p-1'))).data()?.currentQuantity).toBe(-2)
    await assertFails(updateDoc(doc(owner, 'posSandboxes', 'test', 'stockMovements', 'move-1'), { quantityDelta: 99 }))
    await assertFails(setDoc(doc(billing, 'posSandboxes', 'test', 'stockMovements', 'client-sale'), { id: 'client-sale', productId: 'p-1', actorUid: 'billing-user', actorName: 'billing-user', actorRole: 'billing', type: 'sale', quantityDelta: -1, beforeQuantity: -3, afterQuantity: -4, productRevisionBefore: 2, productRevisionAfter: 3, businessDate: '2026-10-03', createdAt: timestamp }))
    await testEnvironment.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), 'posSandboxes', 'test', 'stockMovements', 'server-sale'), { type: 'sale', quantityDelta: -1 })
    })
    await assertFails(deleteDoc(doc(owner, 'posSandboxes', 'test', 'stockMovements', 'server-sale')))
  })

  it('denies browser bill posting and keeps server bills immutable while approvals are owner-only', async () => {
    const billing = userDb('billing-user')
    const owner = userDb('owner-user')
    const billPath = ['posSandboxes', 'test', 'bills', 'bill-1'] as const
    const finalizeBatch = writeBatch(billing)
    finalizeBatch.set(doc(billing, 'posSandboxes', 'test', 'sequences', '2026-27'), { financialYear: '2026-27', lastNumber: 1, updatedByUid: 'billing-user' })
    finalizeBatch.set(doc(billing, 'posSandboxes', 'test', 'billStates', 'bill-1'), { billId: 'bill-1', state: 'active', revision: 1, updatedByUid: 'billing-user' })
    finalizeBatch.set(doc(billing, ...billPath), { id: 'bill-1', receiptNumber: 'TEST-2026-27-000001', financialYear: '2026-27', sequenceNumber: 1, testOnly: true, status: 'finalized', createdByUid: 'billing-user', subtotalPaise: 1000, totalPaise: 1000, lines: [{ id: 'l1' }], payments: [{ method: 'cash', amountPaise: 1000 }] })
    await assertFails(finalizeBatch.commit())
    await testEnvironment.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), ...billPath), { id: 'bill-1', createdByUid: 'billing-user', totalPaise: 1000 })
    })
    await assertFails(updateDoc(doc(owner, ...billPath), { totalPaise: 0 }))
    await assertFails(setDoc(doc(billing, 'posSandboxes', 'test', 'approvals', 'a-1'), { type: 'void', billId: 'bill-1', reason: 'Wrong scan', status: 'pending', requestedByUid: 'billing-user', requestedByName: 'billing-user', requestedAt: timestamp }))
    await testEnvironment.withSecurityRulesDisabled(async context => { await setDoc(doc(context.firestore(), 'posSandboxes', 'test', 'approvals', 'a-1'), { type: 'void', billId: 'bill-1', reason: 'Historical pending source', status: 'pending', requestedByUid: 'billing-user', requestedByName: 'billing-user', requestedAt: timestamp }) })
    await assertFails(updateDoc(doc(billing, 'posSandboxes', 'test', 'approvals', 'a-1'), { status: 'approved' }))
    await assertFails(updateDoc(doc(owner, 'posSandboxes', 'test', 'approvals', 'a-1'), { status: 'rejected', reviewedAt: timestamp, reviewedByUid: 'owner-user', reviewedByName: 'owner-user', reviewReason: 'Not supported' }))
  })

  it('blocks staff imports, reset state, and every non-test sandbox', async () => {
    const billing = userDb('billing-user')
    await assertFails(setDoc(doc(billing, 'posSandboxes', 'test', 'importRuns', 'run-1'), { status: 'running' }))
    await assertFails(setDoc(doc(billing, 'posSandboxes', 'test', 'resetRuns', 'active'), { status: 'running' }))
    await assertFails(setDoc(doc(userDb('owner-user'), 'posSandboxes', 'production', 'products', 'p-1'), product))
  })
})

describe('POS shared cashier handover integrity', () => {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const authTime = 1791072000
  const ledger = { initialized: true, revision: 1, cashNetPaise: 10000, dailyTotals: { [date]: { upi: 20000, card: 30000 } }, lastOperation: 'initialize', lastOperationId: 'initial', updatedByUid: 'owner-user' }
  const cashierDb = (uid = 'billing-user', time = authTime) => testEnvironment.authenticatedContext(uid, { auth_time: time }).firestore()
  const ref = (db: ReturnType<typeof cashierDb>, name: string, id: string) => doc(db, 'posSandboxes', 'test', name, id)
  let previousCashier: Record<string, unknown>
  const session = { status: 'open', date, openingReconciliationId: 'prior', openedByUid: 'owner-user' }
  async function seedLedger(state?: Record<string, unknown>, mode: 'open' | 'count' = 'count') {
    previousCashier = { uid: 'billing-user', authTime, needsLogoutCheck: false, closed: false, joinedCounterId: 'prior', joinedAt: Timestamp.fromMillis(1000), lastBillId: '', lastReconciliationId: '', updatedAt: timestamp, ...state }
    await testEnvironment.withSecurityRulesDisabled(async context => {
      await setDoc(ref(context.firestore(), 'handover', 'main'), { ...ledger, checkpoint: { date, cashActualPaise: 0, cashNetPaise: 0, upiActualPaise: 0, cardActualPaise: 0, upiNetPaise: 0, cardNetPaise: 0, reconciliationId: 'prior' }, counterSession: { ...session, status: mode === 'open' ? 'open' : 'closed' }, ...(mode === 'count' ? { countReservation: { id: 'count-1', uid: 'billing-user', name: 'billing-user', authTime, kind: 'login', date, revision: 1, startedAt: Timestamp.now() } } : {}) })
      await setDoc(ref(context.firestore(), 'cashierStates', 'billing-user'), previousCashier)
    })
  }
  function reconciliationBatch(overrides: Record<string, unknown> = {}, checkpointOverrides: Record<string, unknown> = {}, uid = 'billing-user') {
    const db = cashierDb(uid)
    const id = 'recon-1'
    const actual = { cash: 10000, upi: 20000, card: 30000 }
    const batch = writeBatch(db)
    batch.set(ref(db, 'reconciliations', id), { id, uid, name: uid, authTime, kind: 'login', date, recordedAt: serverTimestamp(), reservationId: 'count-1', denominations: { '100': 1 }, coinPaise: 0, actual, expected: actual, delta: { cash: 0, upi: 0, card: 0 }, hasDiscrepancy: false, createdAt: timestamp, reviewStatus: 'matched', ...overrides })
    batch.update(ref(db, 'handover', 'main'), { revision: 2, countReservation: null, counterSession: { status: 'open', date, openingReconciliationId: id, openedByUid: uid }, lastOperation: 'reconciliation', lastOperationId: id, updatedByUid: uid, checkpoint: { cashActualPaise: 10000, cashNetPaise: 10000, date, upiActualPaise: 20000, cardActualPaise: 30000, upiNetPaise: 20000, cardNetPaise: 30000, reconciliationId: id, ...checkpointOverrides } })
    batch.set(ref(db, 'cashierStates', uid), { uid, authTime, needsLogoutCheck: false, closed: false, joinedCounterId: id, joinedAt: serverTimestamp(), lastBillId: previousCashier.lastBillId, lastReconciliationId: id, updatedAt: timestamp })
    return batch
  }
  function billingBatch(time = authTime, includeLedger = true, cash = 11000, revision = 2, lastReconciliationId = '') {
    const db = cashierDb('billing-user', time)
    const batch = writeBatch(db)
    batch.set(ref(db, 'sequences', '2026-27'), { financialYear: '2026-27', lastNumber: 1, updatedByUid: 'billing-user' })
    batch.set(ref(db, 'billStates', 'new-bill'), { billId: 'new-bill', state: 'active', revision: 1, updatedByUid: 'billing-user' })
    batch.set(ref(db, 'bills', 'new-bill'), { id: 'new-bill', financialYear: '2026-27', sequenceNumber: 1, testOnly: true, status: 'finalized', createdByUid: 'billing-user', subtotalPaise: 1000, totalPaise: 1000, lines: [{ id: 'l1' }], payments: [{ method: 'cash', amountPaise: 1000 }], handoverDate: date, cashierAuthTime: time })
    batch.set(ref(db, 'cashierStates', 'billing-user'), { uid: 'billing-user', authTime: time, needsLogoutCheck: true, closed: false, joinedCounterId: previousCashier.joinedCounterId, joinedAt: previousCashier.joinedAt, lastBillId: 'new-bill', lastReconciliationId, updatedAt: timestamp })
    if (includeLedger) batch.update(ref(db, 'handover', 'main'), { revision, cashNetPaise: cash, lastOperation: 'bill', lastOperationId: 'new-bill', updatedByUid: 'billing-user' })
    return batch
  }
  function drawerClosureBatch(overrides: Record<string, unknown> = {}) {
    const db = userDb('owner-user')
    const id = 'daily-cashout-close-1'
    const checkpoint = { cashActualPaise: 10000, cashNetPaise: 10000, date, upiActualPaise: 20000, cardActualPaise: 30000, upiNetPaise: 20000, cardNetPaise: 30000, reconciliationId: 'prior' }
    const closure = {
      id, cashoutId: id, businessDate: date, kind: 'daily-cashout', expectedBeforePaise: 10000,
      countedPaise: 10000, differencePaise: 0, removedPaise: 10000, closingBalancePaise: 0,
      subsequentNetCashPaise: 0, resultingBalancePaise: 0, ledgerRevisionBefore: 1,
      recordedByUid: 'owner-user', recordedByName: 'Owner', createdAt: timestamp, ...overrides,
    }
    const batch = writeBatch(db)
    batch.set(doc(db, 'dailyCashouts', id), {
      id, date, recordedBy: 'Owner', recordedByUserId: 'owner-user', cashSales: 100, upiSales: 0, cardSales: 0,
      creditSales: 0, returns: 0, cashExpense: 0, cashAudit: 100, drawerTotal: 100, remainingBalance: 100,
      drawerDenominations: { denom500: 0, denom200: 0, denom100: 1, denom50: 0, denom20: 0, denom10: 0, change: 0 },
      actualCashParticulars: '100 x 1', pendingCashParticulars: '', drawerClosureId: id,
      holderBalancesAtClose: [{ userId: 'owner-user', name: 'Owner', amountPaise: 10000 }], holderBalancesRevision: 1,
      cashRemovedPaise: 10000, closingDrawerPaise: 0, createdAt: timestamp, revision: 1,
    })
    batch.set(doc(db, 'cashMovementControl', 'main'), { revision: 1, lastOperation: 'daily-close', lastOperationId: id, updatedAt: timestamp })
    batch.set(ref(db, 'drawerClosures', id), closure)
    batch.update(ref(db, 'handover', 'main'), {
      revision: 2, counterSession: { ...session, status: 'closed' }, lastOperation: 'cashout-close', lastOperationId: id, updatedByUid: 'owner-user',
      checkpoint: { ...checkpoint, cashActualPaise: 0 },
    })
    return batch
  }
  it('denies all browser billing batches including previously linked shapes', async () => {
    await seedLedger(undefined, 'open')
    await assertFails(billingBatch(authTime, false).commit())
    await assertFails(billingBatch(authTime, true, 999999).commit())
    await assertFails(billingBatch().commit())
  })
  it('denies old-token billing after logout and unrelated owner refund edits', async () => {
    await seedLedger({ uid: 'billing-user', authTime, needsLogoutCheck: false, closed: true, lastBillId: 'historical', lastReconciliationId: '', updatedAt: timestamp })
    await assertFails(billingBatch().commit())
    await assertFails(updateDoc(ref(userDb('owner-user'), 'handover', 'main'), { revision: 2, cashNetPaise: 0, lastOperation: 'refund', lastOperationId: 'invented-refund', updatedByUid: 'owner-user' }))
  })
  it('requires a real opening reservation before billing a closed counter', async () => {
    await seedLedger({ uid: 'billing-user', authTime: 0, needsLogoutCheck: true, lastBillId: 'historical', lastReconciliationId: '', updatedAt: timestamp })
    await assertFails(billingBatch().commit())
    await assertSucceeds(reconciliationBatch().commit())
    previousCashier = (await getDoc(ref(cashierDb(), 'cashierStates', 'billing-user'))).data()!
    await assertFails(billingBatch(authTime + 1, true, 11000, 3, 'recon-1').commit())
    await assertFails(billingBatch(authTime, true, 11000, 3, 'recon-1').commit())
  })
  it('saves truthful reconciliation atomically and prevents replay or rewriting financial evidence', async () => {
    await seedLedger()
    await assertSucceeds(reconciliationBatch().commit())
    const db = cashierDb()
    await assertFails(updateDoc(ref(db, 'cashierStates', 'billing-user'), { authTime: authTime + 1 }))
    await assertFails(updateDoc(ref(userDb('owner-user'), 'reconciliations', 'recon-1'), { actual: { cash: 0, upi: 0, card: 0 } }))
    await assertFails(deleteDoc(ref(userDb('owner-user'), 'reconciliations', 'recon-1')))
    await assertFails(getDoc(ref(cashierDb('manager-user'), 'reconciliations', 'recon-1')))
    await assertSucceeds(getDoc(ref(userDb('owner-user'), 'reconciliations', 'recon-1')))
  })
  it('denies forged expected/delta/counts/checkpoint and another cashier attribution', async () => {
    await seedLedger()
    await assertFails(reconciliationBatch({ expected: { cash: 0, upi: 0, card: 0 } }).commit())
    await assertFails(reconciliationBatch({ delta: { cash: 1, upi: 0, card: 0 } }).commit())
    await assertFails(reconciliationBatch({ denominations: { '100': -1 } }).commit())
    await assertFails(reconciliationBatch({}, { cashActualPaise: 0 }).commit())
    await assertFails(reconciliationBatch({ uid: 'manager-user' }).commit())
    await assertFails(reconciliationBatch({ date: '2000-01-01' }).commit())
    await assertFails(reconciliationBatch({ reviewedByUid: 'owner-user' }).commit())
  })
  it('stores discrepancy then permits owner acknowledgment without changing amounts', async () => {
    await seedLedger()
    await assertSucceeds(reconciliationBatch({ actual: { cash: 9000, upi: 20000, card: 30000 }, denominations: { '50': 1, '20': 2 }, delta: { cash: -1000, upi: 0, card: 0 }, hasDiscrepancy: true, reviewStatus: 'pending' }, { cashActualPaise: 9000 }).commit())
    await assertFails(updateDoc(ref(cashierDb(), 'reconciliations', 'recon-1'), { reviewStatus: 'reviewed', reviewedByUid: 'billing-user', reviewedAt: timestamp }))
    await assertSucceeds(updateDoc(ref(userDb('owner-user'), 'reconciliations', 'recon-1'), { reviewStatus: 'reviewed', reviewedByUid: 'owner-user', reviewedAt: timestamp }))
  })
  it('uses last physical count and daily machine readings plus ledger deltas, not raw session totals', async () => {
    await seedLedger()
    await testEnvironment.withSecurityRulesDisabled(async context => {
      await updateDoc(ref(context.firestore(), 'handover', 'main'), { checkpoint: { cashActualPaise: 9000, cashNetPaise: 8000, date, upiActualPaise: 19000, cardActualPaise: 28000, upiNetPaise: 18000, cardNetPaise: 27000, reconciliationId: 'prior' } })
    })
    await assertFails(reconciliationBatch().commit())
    const amounts = { cash: 11000, upi: 21000, card: 31000 }
    await assertSucceeds(reconciliationBatch({ actual: amounts, expected: amounts, denominations: { '100': 1, '10': 1 } }, { cashActualPaise: 11000, upiActualPaise: 21000, cardActualPaise: 31000 }).commit())
  })
  it('denies old browser drawer closure and preserves the physical count', async () => {
    await seedLedger(undefined, 'open')
    await testEnvironment.withSecurityRulesDisabled(async context => {
      await updateDoc(ref(context.firestore(), 'handover', 'main'), { checkpoint: { cashActualPaise: 10000, cashNetPaise: 10000, date, upiActualPaise: 20000, cardActualPaise: 30000, upiNetPaise: 20000, cardNetPaise: 30000, reconciliationId: 'prior' } })
    })
    await assertFails(drawerClosureBatch().commit())
    const db = userDb('owner-user')
    expect((await getDoc(ref(db, 'handover', 'main'))).data()?.checkpoint.cashActualPaise).toBe(10000)
    await assertFails(updateDoc(ref(db, 'drawerClosures', 'daily-cashout-close-1'), { removedPaise: 1 }))
    await assertFails(deleteDoc(ref(db, 'drawerClosures', 'daily-cashout-close-1')))
  })
  it('rejects a forged cashout removal amount', async () => {
    await seedLedger(undefined, 'open')
    await testEnvironment.withSecurityRulesDisabled(async context => {
      await updateDoc(ref(context.firestore(), 'handover', 'main'), { checkpoint: { cashActualPaise: 10000, cashNetPaise: 10000, date, upiActualPaise: 20000, cardActualPaise: 30000, upiNetPaise: 20000, cardNetPaise: 30000, reconciliationId: 'prior' } })
    })
    await assertFails(drawerClosureBatch({ removedPaise: 9000 }).commit())
  })
  it('allows owner-only initialization while freezing legacy billing and protects history from reset', async () => {
    const owner = userDb('owner-user')
    const initializing = { ...ledger, initialized: false, revision: 0, cashNetPaise: 0, dailyTotals: {} }
    await assertFails(setDoc(ref(cashierDb(), 'handover', 'main'), initializing))
    await assertSucceeds(setDoc(ref(owner, 'handover', 'main'), initializing))
    await assertFails(billingBatch().commit())
    await testEnvironment.withSecurityRulesDisabled(async context => {
      await setDoc(ref(context.firestore(), 'bills', 'history'), { totalPaise: 100, createdByUid: 'billing-user' })
      await setDoc(ref(context.firestore(), 'billStates', 'history'), { billId: 'history', revision: 1, state: 'active' })
    })
    await assertSucceeds(setDoc(ref(owner, 'cashierStates', 'billing-user'), { uid: 'billing-user', authTime: 0, needsLogoutCheck: true, lastBillId: 'history', lastReconciliationId: '', updatedAt: timestamp }))
    await assertFails(setDoc(ref(owner, 'cashierStates', 'manager-user'), { uid: 'manager-user', authTime: 0, needsLogoutCheck: true, lastBillId: 'history', lastReconciliationId: '', updatedAt: timestamp }))
    await assertFails(updateDoc(ref(owner, 'billStates', 'history'), { revision: 2, state: 'voided' }))
    await assertSucceeds(setDoc(ref(owner, 'handover', 'main'), ledger))
    await assertFails(updateDoc(ref(owner, 'billStates', 'history'), { revision: 2, state: 'voided' }))
    await assertFails(deleteDoc(ref(owner, 'handover', 'main')))
    await testEnvironment.withSecurityRulesDisabled(async context => {
      await setDoc(ref(context.firestore(), 'bills', 'history'), { totalPaise: 100 })
      await setDoc(ref(context.firestore(), 'events', 'history'), { type: 'bill-finalized' })
    })
    await assertFails(deleteDoc(ref(owner, 'bills', 'history')))
    await assertFails(deleteDoc(ref(owner, 'events', 'history')))
  })
})

describe('V2 vendor ledger capability enforcement', () => {
  it('activates an empty clean start without changing protected legacy records', async () => {
    const ownerDb = userDb('owner-user')
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'loans', 'protected-loan'), { remainingAmount: 98765 })
      await setDoc(doc(context.firestore(), 'vendors', 'legacy-vendor'), { name: 'Legacy Evidence', openingOutstandingRemaining: 12345 })
    })

    await expect(activateVendorLedgerV2({
      activationDate: '2026-10-01',
      vendors: [],
      actor: { id: 'owner-user', name: 'Owner' },
      timestamp,
    }, ownerDb)).resolves.toMatchObject({
      review: { ready: true, vendorCount: 0, totalOpeningPaise: 0 },
      chequeBook: { startNumber: 1120, endNumber: 1199, active: true },
    })
    expect((await getDoc(doc(ownerDb, 'appMetadata', 'vendorLedgerV2Config'))).data()).toMatchObject({
      enabled: true, activationDate: '2026-10-01',
    })
    expect((await getDoc(doc(ownerDb, 'loans', 'protected-loan'))).data()?.remainingAmount).toBe(98765)
    expect((await getDoc(doc(ownerDb, 'vendors', 'legacy-vendor'))).data()?.openingOutstandingRemaining).toBe(12345)
  })

  it('activates the reviewed clean start atomically for the owner only', async () => {
    const ownerDb = userDb('owner-user')
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'loans', 'protected-loan'), { remainingAmount: 98765 })
      await setDoc(doc(context.firestore(), 'vendors', 'legacy-vendor'), { name: 'Legacy Evidence', openingOutstandingRemaining: 12345 })
    })
    const input = {
      activationDate: '2026-10-05',
      vendors: [
        { id: 'clean-vendor-zero', canonicalName: 'Clean Zero Vendor', openingBalancePaise: 0, openingReason: '' },
        { id: 'clean-vendor-open', canonicalName: 'Verified Opening Vendor', openingBalancePaise: 125050, openingReason: 'Verified owner statement' },
      ],
      actor: { id: 'owner-user', name: 'Owner' },
      timestamp,
    }

    await expect(activateVendorLedgerV2(input, ownerDb)).resolves.toMatchObject({
      review: { ready: true, vendorCount: 2, totalOpeningPaise: 125050 },
      chequeBook: { startNumber: 1120, endNumber: 1199, active: true },
    })
    expect((await getDoc(doc(ownerDb, 'appMetadata', 'vendorLedgerV2Config'))).data()).toMatchObject({
      enabled: true, activationDate: '2026-10-05',
    })
    expect((await getDoc(doc(ownerDb, 'vendorAccountStatesV2', 'clean-vendor-open'))).data()?.outstandingPaise).toBe(125050)
    expect((await getDoc(doc(ownerDb, 'vendorAccountStatesV2', 'clean-vendor-zero'))).exists()).toBe(false)
    expect((await getDoc(doc(ownerDb, 'loans', 'protected-loan'))).data()?.remainingAmount).toBe(98765)
    expect((await getDoc(doc(ownerDb, 'vendors', 'legacy-vendor'))).data()?.openingOutstandingRemaining).toBe(12345)
    await expect(activateVendorLedgerV2(input, ownerDb)).rejects.toThrow(/already initialized/)
    await assertSucceeds(updateDoc(doc(ownerDb, 'appMetadata', 'vendorLedgerV2Config'), {
      enabled: false, updatedAt: '2026-10-01T01:00:00.000Z', updatedByUserId: 'owner-user',
    }))
    await expect(activateVendorLedgerV2(input, ownerDb)).rejects.toThrow(/already initialized/)
    await assertFails(getDoc(doc(ownerDb, 'vendorLedgerEntriesV2', 'vendor:clean-vendor-open:1:opening-balance')))
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      expect((await getDoc(doc(context.firestore(), 'vendorLedgerEntriesV2', 'vendor:clean-vendor-open:1:opening-balance'))).exists()).toBe(true)
    })
  })

  it('rejects the retired browser activation/import adapter for every actor without records', async () => {
    for (const role of ['owner-user', 'manager-user']) await expect(activateVendorLedgerV2({ activationDate: '2026-10-05', vendors: [], actor: { id: role, name: role }, timestamp }, userDb(role))).rejects.toThrow('Historical vendor activation/import requires a separately approved trusted migration. No records were changed.')
    expect((await getDoc(doc(userDb('owner-user'), 'appMetadata', 'vendorLedgerV2Config'))).exists()).toBe(false)
  })

  const vendor = {
    id: 'vendor-v2-1',
    canonicalName: 'New Vendor',
    aliases: [],
    contact: '',
    address: '',
    suppliedBrands: [],
    active: true,
    openingBalancePaise: 0,
    revision: 1,
    createdAt: timestamp,
    createdByUserId: 'purchasing-user',
    updatedAt: timestamp,
    updatedByUserId: 'purchasing-user',
  }

  async function enableV2() {
    await setDoc(doc(userDb('owner-user'), 'appMetadata', 'vendorLedgerV2Config'), {
      enabled: true,
      activationDate: '2026-10-01',
      updatedAt: timestamp,
      updatedByUserId: 'owner-user',
    })
  }

  async function funding() {
    await enableV2()
    await trusted.seedFunding(['owner-user', 'purchasing-user', 'manager-user', 'billing-user', 'cheque-user'])
  }
  async function vendorAndInvoice() {
    await funding()
    await trusted.call('vendor-create', { id: 'vendor-v2-1', canonicalName: 'New Vendor' })
    return trusted.call('vendor-purchase', { id: 'purchase-v2-1', vendorId: 'vendor-v2-1', invoiceNumber: 'INV-1', invoiceDate: '2026-10-01', invoiceTotalPaise: 100000 })
  }

  it('denies every V2 write while the protected feature flag is disabled', async () => {
    await assertFails(setDoc(doc(userDb('owner-user'), 'vendorsV2', 'vendor-v2-1'), {
      ...vendor,
      createdByUserId: 'owner-user',
      updatedByUserId: 'owner-user',
    }))
  })

  it('allows trusted staff vendor entry but denies direct writes and disabled actors', async () => {
    await funding()
    for (const uid of ['purchasing-user', 'manager-user', 'billing-user']) {
      const id = 'vendor-' + uid
      const result = await trusted.call('vendor-create', { id, canonicalName: uid }, uid)
      expect(result).toMatchObject({ created: true, vendor: { id, createdByUserId: uid, openingBalancePaise: 0 } })
      await assertFails(setDoc(doc(userDb(uid), 'vendorsV2', 'forged-' + uid), vendor))
    }
    await expect(trusted.call('vendor-create', { id: 'disabled', canonicalName: 'Disabled' }, 'disabled-user')).rejects.toMatchObject({ code: 'permission-denied' })
    expect((await getDoc(doc(userDb('owner-user'), 'vendorsV2', 'disabled'))).exists()).toBe(false)
    await assertFails(getDoc(doc(testEnvironment.unauthenticatedContext().firestore(), 'vendorsV2', 'vendor-purchasing-user')))
  })

  it('prevents users from granting themselves purchasing capabilities', async () => {
    await assertFails(updateDoc(doc(userDb('purchasing-user'), 'users', 'purchasing-user'), {
      purchasingCapabilities: { 'migration.execute': true },
    }))
  })

  it('keeps trusted ledger history readable by permitted staff and immutable to all clients', async () => {
    await vendorAndInvoice()
    const path = 'vendorLedgerEntriesV2/purchase:purchase-v2-1:1:purchase'
    for (const uid of ['purchasing-user', 'manager-user', 'billing-user']) await assertSucceeds(getDoc(doc(userDb(uid), path)))
    for (const uid of ['owner-user', 'purchasing-user']) { await assertFails(updateDoc(doc(userDb(uid), path), { signedAmountPaise: 1 })); await assertFails(deleteDoc(doc(userDb(uid), path))) }
    expect((await getDoc(doc(userDb('owner-user'), path))).data()?.signedAmountPaise).toBe(100000)
  })

  it('requires trusted atomic purchase posting and rejects duplicate vendor invoice numbers', async () => {
    await vendorAndInvoice()
    const owner = userDb('owner-user')
    expect((await getDoc(doc(owner, 'vendorAccountStatesV2', 'vendor-v2-1'))).data()?.outstandingPaise).toBe(100000)
    expect((await getDoc(doc(owner, 'invoiceStatesV2', 'purchase-v2-1'))).data()?.openAmountPaise).toBe(100000)
    const before = (await getDocs(collection(owner, 'vendorLedgerEntriesV2'))).size
    await expect(trusted.call('vendor-purchase', { id: 'duplicate', vendorId: 'vendor-v2-1', invoiceNumber: 'INV-1', invoiceDate: '2026-10-01', invoiceTotalPaise: 100000 })).rejects.toMatchObject({ code: 'already-exists' })
    expect((await getDoc(doc(owner, 'purchasesV2', 'duplicate'))).exists()).toBe(false)
    expect((await getDocs(collection(owner, 'vendorLedgerEntriesV2'))).size).toBe(before)
    await assertFails(setDoc(doc(userDb('purchasing-user'), 'purchasesV2', 'forged'), { invoiceTotalPaise: 100000 }))
  })

  it('recovers the original trusted purchase result and rejects changed-payload or duplicate invoice replay', async () => {
    await funding(); await trusted.call('vendor-create', { id: 'vendor-v2-1', canonicalName: 'Vendor' })
    const input = { operationId: 'purchase-operation', id: 'purchase-v2-1', vendorId: 'vendor-v2-1', invoiceNumber: 'INV-1', invoiceDate: '2026-10-01', invoiceTotalPaise: 100000 }
    const first = await trusted.call('vendor-purchase', input)
    expect(await trusted.call('vendor-purchase', input)).toEqual(first)
    await expect(trusted.call('vendor-purchase', { ...input, invoiceTotalPaise: 100001 })).rejects.toMatchObject({ code: 'already-exists' })
    await expect(trusted.call('vendor-purchase', { ...input, operationId: 'another', id: 'another' })).rejects.toMatchObject({ code: 'already-exists' })
    expect((await getDoc(doc(userDb('owner-user'), 'vendorAccountStatesV2', 'vendor-v2-1'))).data()?.outstandingPaise).toBe(100000)
  })

  it('creates trusted V2 vendors with retained contact details and idempotent zero opening', async () => {
    await funding()
    const input = { operationId: 'new-vendor', id: 'vendor-created-1', canonicalName: 'New Vendor', ownerName: 'Vendor Owner', aliases: ['NV'], contact: '9999999999', address: 'Main Road', suppliedBrands: ['Brand One'], notes: 'Net 15' }
    const first = await trusted.call('vendor-create', input, 'owner-user')
    expect(first).toMatchObject({ created: true, vendor: { ownerName: 'Vendor Owner', contact: '9999999999', address: 'Main Road', suppliedBrands: ['Brand One'], notes: 'Net 15', openingBalancePaise: 0 } })
    expect(await trusted.call('vendor-create', input, 'owner-user')).toEqual(first)
    await expect(trusted.call('vendor-create', { ...input, canonicalName: 'Different' }, 'owner-user')).rejects.toMatchObject({ code: 'already-exists' })
  })

  it('creates an audited trusted opening once and pays it without replaying the opening', async () => {
    await funding()
    const input = { operationId: 'opening-once', id: 'vendor-opening-1', canonicalName: 'Vendor With Opening', openingBalancePaise: 125050, openingDate: '2026-10-11', openingReason: 'Verified statement' }
    const first = await trusted.call('vendor-create', input, 'owner-user')
    expect(await trusted.call('vendor-create', input, 'owner-user')).toEqual(first)
    const db = userDb('owner-user'), openingPath = 'vendorLedgerEntriesV2/vendor:vendor-opening-1:1:opening-balance'
    expect((await getDoc(doc(db, openingPath))).data()).toMatchObject({ signedAmountPaise: 125050, reason: 'Verified statement', occurredOn: '2026-10-11' })
    for (const patch of [{ openingBalancePaise: 125051 }, { openingReason: 'Different statement' }, { openingDate: '2026-10-12' }]) await expect(trusted.call('vendor-create', { ...input, ...patch }, 'owner-user')).rejects.toMatchObject({ code: 'already-exists' })
    await trusted.call('vendor-payment', { id: 'opening-payment', vendorId: input.id, date: '2026-10-11', amountPaise: 25050, mode: 'bank-transfer' }, 'owner-user')
    expect((await getDoc(doc(db, 'vendorAccountStatesV2', input.id))).data()).toMatchObject({ outstandingPaise: 100000, revision: 2 })
    expect(await trusted.call('vendor-create', input, 'owner-user')).toEqual(first)
    expect((await getDoc(doc(db, 'vendorAccountStatesV2', input.id))).data()?.outstandingPaise).toBe(100000)
    expect((await getDoc(doc(db, openingPath))).data()?.signedAmountPaise).toBe(125050)
    expect((await getDoc(doc(db, 'bankBalanceControl', 'main'))).data()?.balancePaise).toBe(474950)
  })

  it('rejects trusted staff nonzero opening without partial writes while allowing zero opening', async () => {
    await funding()
    const input = { id: 'staff-opening', canonicalName: 'Staff Opening', openingBalancePaise: 10000, openingDate: '2026-10-11', openingReason: 'Statement' }
    await expect(trusted.call('vendor-create', input)).rejects.toMatchObject({ code: 'permission-denied' })
    const db = userDb('owner-user')
    for (const p of ['vendorsV2/staff-opening','vendorAccountStatesV2/staff-opening','vendorLedgerEntriesV2/vendor:staff-opening:1:opening-balance']) expect((await getDoc(doc(db,p))).exists()).toBe(false)
    expect(await trusted.call('vendor-create', { ...input, openingBalancePaise: 0 })).toMatchObject({ created: true })
  })

  it('rejects trusted unaudited and pre-activation openings without partial sources', async () => {
    await funding()
    const input = { id: 'invalid-opening', canonicalName: 'Invalid Opening', openingBalancePaise: 10000, openingDate: '2026-10-11', openingReason: 'Statement' }
    await expect(trusted.call('vendor-create', { ...input, openingReason: '' }, 'owner-user')).rejects.toMatchObject({ code: 'failed-precondition' })
    await expect(trusted.call('vendor-create', { ...input, openingDate: '2026-09-30' }, 'owner-user')).rejects.toMatchObject({ code: 'failed-precondition' })
    const db = userDb('owner-user')
    expect((await getDoc(doc(db, 'vendorsV2', input.id))).exists()).toBe(false)
    expect((await getDoc(doc(db, 'vendorAccountStatesV2', input.id))).exists()).toBe(false)
  })

  it('blocks legacy vendor posting after V2 activation while preserving owner loan payments', async () => {
    const legacyPurchase = {
      id: 'legacy-before-cutover', storeId: 'single-store', date: '2026-09-30', supplierName: 'Legacy Vendor',
      purchaseAmount: 1000, paidAmount: 0, unpaidAmount: 1000, createdAt: timestamp, updatedAt: timestamp,
    }
    await assertSucceeds(setDoc(doc(userDb('manager-user'), 'purchases', legacyPurchase.id), legacyPurchase))
    await enableV2()
    await assertFails(setDoc(doc(userDb('manager-user'), 'purchases', 'legacy-after-cutover'), {
      ...legacyPurchase, id: 'legacy-after-cutover', date: '2026-10-01',
    }))
    await assertFails(setDoc(doc(userDb('billing-user'), 'payments', 'legacy-vendor-payment'), {
      entryType: 'vendor-payment', amount: 500,
    }))
    await assertFails(setDoc(doc(userDb('owner-user'), 'payments', 'unlinked-loan-payment'), {
      entryType: 'loan-payment', amount: 500,
    }))
    await assertSucceeds(setDoc(doc(userDb('owner-user'), 'payments', 'protected-loan-payment'), {
      entryType: 'loan-payment', loanId: 'loan-selected', amount: 500,
    }))
  })

  it('posts trusted linked/custom payments and owner corrections with independent bank and payable reconciliation', async () => {
    await vendorAndInvoice()
    const linked = { operationId: 'linked-payment', id: 'settlement-linked-1', vendorId: 'vendor-v2-1', date: '2026-10-11', amountPaise: 40000, mode: 'upi', invoiceId: 'purchase-v2-1' }
    const first = await trusted.call('vendor-payment', linked)
    expect(await trusted.call('vendor-payment', linked)).toEqual(first)
    await expect(trusted.call('vendor-payment', { ...linked, amountPaise: 41000 })).rejects.toMatchObject({ code: 'already-exists' })
    await trusted.call('vendor-payment', { id: 'settlement-custom-1', vendorId: 'vendor-v2-1', date: '2026-10-11', amountPaise: 60000, mode: 'bank-transfer' })
    await expect(trusted.call('vendor-payment', { id: 'excess', vendorId: 'vendor-v2-1', date: '2026-10-11', amountPaise: 1, mode: 'cash' })).rejects.toMatchObject({ code: 'failed-precondition' })
    const db = userDb('owner-user')
    expect((await getDoc(doc(db, 'vendorAccountStatesV2', 'vendor-v2-1'))).data()?.outstandingPaise).toBe(0)
    await trusted.call('vendor-correction', { id: 'staff-correction', sourceRecordId: 'settlement-custom-1', expectedRevision: 1, proposed: { date: '2026-10-11', amountPaise: 50000, mode: 'bank-transfer', notes: 'Corrected' }, reason: 'Amount entered incorrectly', applyImmediately: false })
    await assertFails(updateDoc(doc(db, 'vendorSettlementsV2', 'settlement-custom-1'), { amountPaise: 50000 }))
    await trusted.call('vendor-correction-decision', { requestId: 'staff-correction', decision: 'approve' }, 'owner-user')
    expect((await getDoc(doc(db, 'vendorAccountStatesV2', 'vendor-v2-1'))).data()?.outstandingPaise).toBe(10000)
    await trusted.call('vendor-correction', { id: 'owner-correction', sourceRecordId: 'settlement-linked-1', expectedRevision: 1, proposed: { date: '2026-10-11', amountPaise: 30000, mode: 'upi', notes: 'Corrected linked' }, reason: 'Invoice linked amount entered incorrectly', applyImmediately: true }, 'owner-user')
    expect((await getDoc(doc(db, 'vendorAccountStatesV2', 'vendor-v2-1'))).data()?.outstandingPaise).toBe(20000)
    expect((await getDoc(doc(db, 'invoiceStatesV2', 'purchase-v2-1'))).data()?.openAmountPaise).toBe(70000)
    expect((await getDoc(doc(db, 'bankBalanceControl', 'main'))).data()?.balancePaise).toBe(420000)
  })

  it('keeps trusted cheques unique, owner debit final and bank/payable posting exactly once', async () => {
    await vendorAndInvoice()
    const input = { operationId: 'cheque-issue', chequeNumber: '001120', vendorId: 'vendor-v2-1', purpose: 'vendor-payment', date: '2026-10-11', amountPaise: 40000 }
    const first = await trusted.call('cheque-issue', input, 'owner-user')
    expect(first).toMatchObject({ cheque: { status: 'issued', revision: 1 } })
    expect(await trusted.call('cheque-issue', input, 'owner-user')).toEqual(first)
    await expect(trusted.call('cheque-issue', { ...input, amountPaise: 41000 }, 'owner-user')).rejects.toMatchObject({ code: 'already-exists' })
    const db = userDb('owner-user')
    expect((await getDoc(doc(db, 'vendorAccountStatesV2', 'vendor-v2-1'))).data()?.outstandingPaise).toBe(100000)
    await trusted.call('cheque-decision', { chequeNumber: '1120', expectedRevision: 1, toStatus: 'presented' }, 'owner-user')
    expect((await getDoc(doc(db, 'vendorAccountStatesV2', 'vendor-v2-1'))).data()?.outstandingPaise).toBe(100000)
    await expect(trusted.call('cheque-decision', { chequeNumber: '1120', expectedRevision: 2, toStatus: 'debited' }, 'cheque-user')).rejects.toMatchObject({ code: 'permission-denied' })
    const debit = { operationId: 'cheque-debit', chequeNumber: '1120', expectedRevision: 2, toStatus: 'debited' }
    const result = await trusted.call('cheque-decision', debit, 'owner-user')
    expect(await trusted.call('cheque-decision', debit, 'owner-user')).toEqual(result)
    expect((await getDoc(doc(db, 'vendorAccountStatesV2', 'vendor-v2-1'))).data()?.outstandingPaise).toBe(60000)
    expect((await getDoc(doc(db, 'bankBalanceControl', 'main'))).data()?.balancePaise).toBe(460000)
    await expect(trusted.call('cheque-decision', { ...debit, operationId: 'another-debit' }, 'owner-user')).rejects.toMatchObject({ code: 'failed-precondition' })
    await assertFails(updateDoc(doc(db, 'chequesV2', '1120'), { chequeNumber: '1121' }))
  })

  it('enforces correction ownership and owner-only return decisions without touching loans', async () => {
    await enableV2()
    const managerDb = userDb('manager-user')
    await createVendorV2({ id: 'workflow-vendor', canonicalName: 'Workflow Vendor', actorUserId: 'manager-user', timestamp }, managerDb)
    await createPurchaseV2({ id: 'workflow-purchase', vendorId: 'workflow-vendor', invoiceNumber: 'WF-1', invoiceDate: '2026-10-01', invoiceTotalPaise: 100000, actorUserId: 'manager-user', timestamp }, managerDb)
    await createSettlementV2({ id: 'workflow-payment', vendorId: 'workflow-vendor', date: '2026-10-01', amountPaise: 20000, mode: 'upi', actorUserId: 'manager-user', timestamp }, managerDb)
    await testEnvironment.withSecurityRulesDisabled(async (context) => setDoc(doc(context.firestore(), 'loans', 'protected-loan'), { remainingAmount: 98765 }))

    const correctionInput = { id: 'workflow-correction', sourceRecordId: 'workflow-payment', proposed: { date: '2026-10-01', amountPaise: 15000, mode: 'upi' as const, notes: 'Corrected' }, reason: 'Wrong amount', actor: { id: 'manager-user', name: 'Manager' }, timestamp }
    await expect(createSettlementCorrectionRequestV2(correctionInput, managerDb)).resolves.toMatchObject({ status: 'pending' })
    await expect(createSettlementCorrectionRequestV2({ ...correctionInput, id: 'other-correction', actor: { id: 'billing-user', name: 'Billing' } }, userDb('billing-user'))).rejects.toThrow()
    await expect(withdrawSettlementCorrectionRequestV2(correctionInput.id, correctionInput.actor, '2026-10-01T01:00:00.000Z', managerDb)).resolves.toMatchObject({ status: 'withdrawn' })

    await expect(createVendorReturnV2({ id: 'workflow-return', vendorId: 'workflow-vendor', sourcePurchaseId: 'workflow-purchase', date: '2026-10-01', description: 'Damaged goods', quantity: 1, unit: 'carton', valuePaise: 10000, reason: 'Damaged', actorUserId: 'billing-user', timestamp }, userDb('billing-user'))).resolves.toMatchObject({ outcome: 'pending' })
    await expect(resolveVendorReturnV2('workflow-return', { outcome: 'vendor-credit', creditedValuePaise: 10000, outcomeReason: 'Credit note verified', actor: { id: 'billing-user', name: 'Billing' }, timestamp: '2026-10-01T02:00:00.000Z' }, userDb('billing-user'))).rejects.toThrow()
    await expect(resolveVendorReturnV2('workflow-return', { outcome: 'vendor-credit', creditedValuePaise: 10000, outcomeReason: 'Credit note verified', actor: { id: 'owner-user', name: 'Owner' }, timestamp: '2026-10-01T02:00:00.000Z' }, userDb('owner-user'))).resolves.toMatchObject({ nextAccountState: { outstandingPaise: 70000 } })
    expect((await getDoc(doc(userDb('owner-user'), 'loans', 'protected-loan'))).data()?.remainingAmount).toBe(98765)
  })
})

describe('Payroll access and audit enforcement', () => {
  const ownerActor = { uid: 'owner-user', name: 'Owner' }
  const payrollMonth = '2026-09'

  async function finalizeManagerSalary() {
    const owner = userDb('owner-user')
    await savePayrollSettings({
      issuer: { name: 'AlphaHub' },
      defaultPaidWeeklyOffDays: 4,
      actor: ownerActor,
    }, owner)
    await savePayrollProfile({ employeeUserId: 'manager-user', enabled: true, actor: ownerActor }, owner)
    const termId = await createPayrollTerm({
      employeeUserId: 'manager-user',
      effectiveFromMonth: payrollMonth,
      monthlySalaryPaise: 3000000,
      requiredDailyMinutes: 480,
      actor: ownerActor,
    }, owner)
    await savePayrollMonth({ payrollMonth, paidWeeklyOffDays: 4, actor: ownerActor }, owner)
    const draftId = await saveSalaryDraft({
      employeeUserId: 'manager-user',
      employeeName: 'Manager',
      employeeRole: 'manager',
      payrollMonth,
      termId,
      paidWeeklyOffDays: 4,
      workedMinutes: 12480,
      paidLeaveMinutes: 0,
      earnings: [],
      deductions: [],
      actor: ownerActor,
    }, owner)
    await finalizeSalarySlip(draftId, ownerActor, owner)
    return { owner, termId, slipId: salarySlipId('manager-user', payrollMonth) }
  }

  it('finalizes atomically and keeps payroll setup owner-only', async () => {
    const { slipId } = await finalizeManagerSalary()
    const manager = userDb('manager-user')
    const billing = userDb('billing-user')

    await assertSucceeds(getDoc(doc(manager, 'salarySlips', slipId)))
    await assertSucceeds(getDoc(doc(manager, 'salarySlipRevisions', salaryRevisionId(slipId, 1))))
    await assertSucceeds(getDocs(query(collection(manager, 'salarySlipRevisions'), where('slipId', '==', slipId), where('employeeUserId', '==', 'manager-user'))))
    await assertSucceeds(getDocs(query(collection(manager, 'payrollEvents'), where('slipId', '==', slipId), where('employeeUserId', '==', 'manager-user'))))
    await assertFails(getDoc(doc(billing, 'salarySlips', slipId)))
    await assertFails(getDoc(doc(manager, 'payrollSettings', 'config')))
    await assertFails(getDoc(doc(manager, 'payrollProfiles', 'manager-user')))
    await assertFails(getDoc(doc(manager, 'payrollMonths', payrollMonth)))
    await assertFails(getDoc(doc(manager, 'payrollDrafts', slipId)))
  })

  it('allows audited payment and revision while preserving immutable evidence', async () => {
    const { owner, termId, slipId } = await finalizeManagerSalary()
    await recordSalaryPayment({
      slipId,
      expectedRevision: 1,
      paymentDate: '2026-10-01',
      paymentMethod: 'Bank Transfer',
      paymentReference: 'PAY-1',
      actor: ownerActor,
    }, owner)
    await reviseSalarySlip({
      slipId,
      expectedRevision: 1,
      termId,
      paidWeeklyOffDays: 4,
      workedMinutes: 12540,
      paidLeaveMinutes: 0,
      earnings: [],
      deductions: [],
      reason: 'Corrected one hour of worked time.',
      actor: ownerActor,
    }, owner)

    const slip = await getDoc(doc(owner, 'salarySlips', slipId))
    expect(slip.data()).toMatchObject({ currentRevision: 2, paymentState: 'additional-due' })
    await assertFails(updateDoc(doc(owner, 'salarySlipRevisions', salaryRevisionId(slipId, 1)), { reason: 'Changed' }))
    await assertFails(deleteDoc(doc(owner, 'salarySlipRevisions', salaryRevisionId(slipId, 2))))
    await assertFails(updateDoc(doc(owner, 'payrollEvents', slip.data()?.lastEventId), { reason: 'Changed' }))
  })

  it('blocks staff writes and protects users referenced by payroll', async () => {
    const { slipId } = await finalizeManagerSalary()
    const manager = userDb('manager-user')
    const owner = userDb('owner-user')

    await expect(saveSalaryDraft({
      employeeUserId: 'manager-user',
      employeeName: 'Manager',
      employeeRole: 'manager',
      payrollMonth: '2026-10',
      termId: 'not-authorized',
      paidWeeklyOffDays: 4,
      workedMinutes: 0,
      paidLeaveMinutes: 0,
      earnings: [],
      deductions: [],
      actor: { uid: 'manager-user', name: 'Manager' },
    }, manager)).rejects.toThrow()
    await assertFails(updateDoc(doc(manager, 'salarySlips', slipId), { outstandingPaise: 0 }))
    await assertFails(deleteDoc(doc(owner, 'users', 'manager-user')))
  })
})
