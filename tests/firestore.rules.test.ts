import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { deleteDoc, doc, getDoc, setDoc, updateDoc, writeBatch } from 'firebase/firestore'
import {
  applyOwnerSettlementCorrectionV2,
  applySettlementCorrectionV2,
  createPurchaseV2,
  createSettlementV2,
  createVendorChequeV2,
  createVendorV2,
  transitionVendorChequeV2,
} from '../src/store/vendorLedgerV2Repository'

let testEnvironment: RulesTestEnvironment

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
})

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

    await assertSucceeds(setDoc(doc(billing, 'cashouts', 'expense-1'), {
      storeId: 'single-store', date: '2026-10-01', paidTo: 'Vendor', amount: 100,
      category: 'Other', paymentMode: 'Cash', approvedBy: 'Pending approval', notes: '',
      createdAt: timestamp, updatedAt: timestamp,
    }))
    await assertFails(updateDoc(doc(billing, 'cashouts', 'expense-1'), { amount: 200 }))
    await assertFails(deleteDoc(doc(billing, 'cashouts', 'expense-1')))
    await assertSucceeds(deleteDoc(doc(owner, 'cashouts', 'expense-1')))
  })

  it('restricts billing cash movement to the signed-in user', async () => {
    const billing = userDb('billing-user')
    const baseTransfer = {
      id: 'transfer-1', date: '2026-10-01', toType: 'bank', amount: 100,
      reason: 'Deposit', createdBy: 'billing-user', createdAt: timestamp,
    }

    await assertSucceeds(setDoc(doc(billing, 'cashTransfers', 'transfer-1'), { ...baseTransfer, fromUserId: 'billing-user' }))
    await assertFails(setDoc(doc(billing, 'cashTransfers', 'transfer-2'), { ...baseTransfer, id: 'transfer-2', fromUserId: 'manager-user' }))
    await assertSucceeds(setDoc(doc(userDb('manager-user'), 'cashTransfers', 'transfer-3'), { ...baseTransfer, id: 'transfer-3', fromUserId: 'billing-user' }))
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

  it('allows manager planner changes but protects operational settings', async () => {
    const owner = userDb('owner-user')
    const manager = userDb('manager-user')
    const settingsRef = doc(owner, 'appMetadata', 'appSettings')
    await setDoc(settingsRef, { currentBankBalance: 1000, marginPercentage: 25 })

    await assertSucceeds(updateDoc(doc(manager, 'appMetadata', 'appSettings'), { currentBankBalance: 1200 }))
    await assertFails(updateDoc(doc(manager, 'appMetadata', 'appSettings'), { marginPercentage: 30 }))
    await assertSucceeds(updateDoc(settingsRef, { marginPercentage: 30 }))
  })

  it('permits allocation-only vendor updates and rejects arbitrary staff edits', async () => {
    const owner = userDb('owner-user')
    const billing = userDb('billing-user')
    await setDoc(doc(owner, 'purchases', 'purchase-1'), {
      storeId: 'single-store', date: '2026-10-01', supplierName: 'Vendor', billNumber: '1',
      purchaseAmount: 1000, paidAmount: 0, unpaidAmount: 1000, paymentMode: 'Credit',
      category: 'Stock', notes: '', createdAt: timestamp, updatedAt: timestamp,
    })

    await assertSucceeds(updateDoc(doc(billing, 'purchases', 'purchase-1'), { paidAmount: 200, unpaidAmount: 800, updatedAt: timestamp }))
    await assertFails(updateDoc(doc(billing, 'purchases', 'purchase-1'), { purchaseAmount: 500 }))
  })

  it('enforces cashout ownership while allowing the linked sales synchronization', async () => {
    const billing = userDb('billing-user')
    const cashout = {
      date: '2026-10-01', recordedBy: 'billing-user', recordedByUserId: 'billing-user',
      cashSales: 500, upiSales: 300, creditSales: 100, returns: 0, cashAudit: 500,
      actualCashParticulars: '500 x 1 = 500', pendingCashParticulars: '', remainingBalance: 500,
      createdAt: timestamp,
    }
    await assertSucceeds(setDoc(doc(billing, 'dailyCashouts', 'cashout-1'), cashout))
    await assertFails(setDoc(doc(billing, 'dailyCashouts', 'cashout-2'), { ...cashout, recordedByUserId: 'manager-user' }))

    const sales = {
      storeId: 'single-store', date: '2026-10-01', totalSales: 900, cashSales: 500,
      upiSales: 300, cardSales: 0, bankTransferSales: 0, creditSales: 100,
      returnsDiscounts: 0, notes: 'Auto-synced from cashout register.',
      createdAt: timestamp, updatedAt: timestamp,
    }
    await assertSucceeds(setDoc(doc(billing, 'sales', 'single-store-2026-10-01'), sales))
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

    await assertSucceeds(updateDoc(doc(userDb('owner-user'), requestPath), { status: 'approved' }))

    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), requestPath), { status: 'pending' })
    })
    await assertFails(updateDoc(doc(userDb('manager-user'), requestPath), { status: 'approved' }))
    await assertFails(updateDoc(doc(userDb('billing-user'), requestPath), { status: 'approved' }))
    await assertFails(updateDoc(doc(userDb('disabled-user'), requestPath), { status: 'approved' }))
  })
})

describe('V2 vendor ledger capability enforcement', () => {
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

  it('denies every V2 write while the protected feature flag is disabled', async () => {
    await assertFails(setDoc(doc(userDb('owner-user'), 'vendorsV2', 'vendor-v2-1'), {
      ...vendor,
      createdByUserId: 'owner-user',
      updatedByUserId: 'owner-user',
    }))
  })

  it('allows explicit capabilities and denies ungranted, disabled, and unauthenticated users', async () => {
    await enableV2()
    await assertSucceeds(setDoc(doc(userDb('purchasing-user'), 'vendorsV2', 'vendor-v2-1'), vendor))
    await assertFails(setDoc(doc(userDb('manager-user'), 'vendorsV2', 'vendor-v2-2'), {
      ...vendor,
      id: 'vendor-v2-2',
      createdByUserId: 'manager-user',
      updatedByUserId: 'manager-user',
    }))
    await assertFails(setDoc(doc(userDb('disabled-user'), 'vendorsV2', 'vendor-v2-3'), {
      ...vendor,
      id: 'vendor-v2-3',
      createdByUserId: 'disabled-user',
      updatedByUserId: 'disabled-user',
    }))
    await assertFails(getDoc(doc(testEnvironment.unauthenticatedContext().firestore(), 'vendorsV2', 'vendor-v2-1')))
  })

  it('prevents users from granting themselves purchasing capabilities', async () => {
    await assertFails(updateDoc(doc(userDb('purchasing-user'), 'users', 'purchasing-user'), {
      purchasingCapabilities: { 'migration.execute': true },
    }))
  })

  it('keeps ledger history append-only and limits reading to the ledger capability', async () => {
    await enableV2()
    const purchasingDb = userDb('purchasing-user')
    await setDoc(doc(purchasingDb, 'vendorsV2', 'vendor-v2-1'), vendor)
    const purchase = {
      id: 'purchase-v2-1', vendorId: 'vendor-v2-1', invoiceNumber: 'INV-1', normalizedInvoiceNumber: 'INV-1', invoiceDate: '2026-10-01',
      invoiceTotalPaise: 100000, invoiceReservationId: 'vendor-v2-1:INV-1',
      ledgerEntryId: 'purchase:purchase-v2-1:1:purchase', notes: '', revision: 1,
      createdAt: timestamp, createdByUserId: 'purchasing-user', updatedAt: timestamp, updatedByUserId: 'purchasing-user',
    }
    const reservation = {
      id: 'vendor-v2-1:INV-1', vendorId: 'vendor-v2-1', normalizedInvoiceNumber: 'INV-1',
      purchaseId: 'purchase-v2-1', createdAt: timestamp, createdByUserId: 'purchasing-user',
    }
    const entry = {
      id: 'purchase:purchase-v2-1:1:purchase',
      vendorId: 'vendor-v2-1',
      eventType: 'purchase',
      posting: 'financial',
      signedAmountPaise: 100000,
      sourceType: 'purchase',
      sourceRecordId: 'purchase-v2-1',
      sourceRevision: 1,
      occurredOn: '2026-10-01',
      createdAt: timestamp,
      createdByUserId: 'purchasing-user',
    }
    const entryPath = 'vendorLedgerEntriesV2/purchase:purchase-v2-1:1:purchase'
    const postingBatch = writeBatch(purchasingDb)
    postingBatch.set(doc(purchasingDb, 'purchasesV2', 'purchase-v2-1'), purchase)
    postingBatch.set(doc(purchasingDb, 'invoiceReservationsV2', 'vendor-v2-1:INV-1'), reservation)
    postingBatch.set(doc(purchasingDb, entryPath), entry)
    postingBatch.set(doc(purchasingDb, 'vendorAccountStatesV2', 'vendor-v2-1'), {
      id: 'vendor-v2-1', vendorId: 'vendor-v2-1', outstandingPaise: 100000, revision: 1,
      lastLedgerEntryId: entry.id, updatedAt: timestamp, updatedByUserId: 'purchasing-user',
    })
    postingBatch.set(doc(purchasingDb, 'invoiceStatesV2', 'purchase-v2-1'), {
      id: 'purchase-v2-1', vendorId: 'vendor-v2-1', invoiceId: 'purchase-v2-1', openAmountPaise: 100000,
      reservedAmountPaise: 0, revision: 1, updatedAt: timestamp, updatedByUserId: 'purchasing-user',
    })
    await assertSucceeds(postingBatch.commit())
    await assertSucceeds(getDoc(doc(userDb('purchasing-user'), entryPath)))
    await assertFails(getDoc(doc(userDb('manager-user'), entryPath)))
    await assertFails(updateDoc(doc(userDb('owner-user'), entryPath), { signedAmountPaise: 1 }))
    await assertFails(deleteDoc(doc(userDb('owner-user'), entryPath)))
  })

  it('requires atomic purchase posting and rejects duplicate vendor invoice numbers', async () => {
    await enableV2()
    const purchasingDb = userDb('purchasing-user')
    await setDoc(doc(purchasingDb, 'vendorsV2', 'vendor-v2-1'), vendor)
    await assertFails(setDoc(doc(purchasingDb, 'purchasesV2', 'incomplete-purchase'), {
      id: 'incomplete-purchase', vendorId: 'vendor-v2-1', invoiceNumber: 'INV-2', normalizedInvoiceNumber: 'INV-2', invoiceDate: '2026-10-01',
      invoiceTotalPaise: 100000, invoiceReservationId: 'vendor-v2-1:INV-2',
      ledgerEntryId: 'purchase:incomplete-purchase:1:purchase', notes: '', revision: 1,
      createdAt: timestamp, createdByUserId: 'purchasing-user', updatedAt: timestamp, updatedByUserId: 'purchasing-user',
    }))

    const firstBatch = writeBatch(purchasingDb)
    firstBatch.set(doc(purchasingDb, 'purchasesV2', 'purchase-first'), {
      id: 'purchase-first', vendorId: 'vendor-v2-1', invoiceNumber: 'INV-2', normalizedInvoiceNumber: 'INV-2', invoiceDate: '2026-10-01',
      invoiceTotalPaise: 100000, invoiceReservationId: 'vendor-v2-1:INV-2', ledgerEntryId: 'purchase:purchase-first:1:purchase',
      notes: '', revision: 1, createdAt: timestamp, createdByUserId: 'purchasing-user', updatedAt: timestamp, updatedByUserId: 'purchasing-user',
    })
    firstBatch.set(doc(purchasingDb, 'invoiceReservationsV2', 'vendor-v2-1:INV-2'), {
      id: 'vendor-v2-1:INV-2', vendorId: 'vendor-v2-1', normalizedInvoiceNumber: 'INV-2',
      purchaseId: 'purchase-first', createdAt: timestamp, createdByUserId: 'purchasing-user',
    })
    firstBatch.set(doc(purchasingDb, 'vendorLedgerEntriesV2', 'purchase:purchase-first:1:purchase'), {
      id: 'purchase:purchase-first:1:purchase', vendorId: 'vendor-v2-1', eventType: 'purchase', posting: 'financial',
      signedAmountPaise: 100000, sourceType: 'purchase', sourceRecordId: 'purchase-first', sourceRevision: 1,
      occurredOn: '2026-10-01', createdAt: timestamp, createdByUserId: 'purchasing-user',
    })
    firstBatch.set(doc(purchasingDb, 'vendorAccountStatesV2', 'vendor-v2-1'), {
      id: 'vendor-v2-1', vendorId: 'vendor-v2-1', outstandingPaise: 100000, revision: 1,
      lastLedgerEntryId: 'purchase:purchase-first:1:purchase', updatedAt: timestamp, updatedByUserId: 'purchasing-user',
    })
    firstBatch.set(doc(purchasingDb, 'invoiceStatesV2', 'purchase-first'), {
      id: 'purchase-first', vendorId: 'vendor-v2-1', invoiceId: 'purchase-first', openAmountPaise: 100000,
      reservedAmountPaise: 0, revision: 1, updatedAt: timestamp, updatedByUserId: 'purchasing-user',
    })
    await assertSucceeds(firstBatch.commit())

    const duplicateBatch = writeBatch(purchasingDb)
    duplicateBatch.set(doc(purchasingDb, 'purchasesV2', 'purchase-duplicate'), {
      id: 'purchase-duplicate', vendorId: 'vendor-v2-1', invoiceNumber: 'inv-2', normalizedInvoiceNumber: 'INV-2', invoiceDate: '2026-10-01',
      invoiceTotalPaise: 200000, invoiceReservationId: 'vendor-v2-1:INV-2', ledgerEntryId: 'purchase:purchase-duplicate:1:purchase',
      notes: '', revision: 1, createdAt: timestamp, createdByUserId: 'purchasing-user', updatedAt: timestamp, updatedByUserId: 'purchasing-user',
    })
    duplicateBatch.set(doc(purchasingDb, 'invoiceReservationsV2', 'vendor-v2-1:INV-2'), {
      id: 'vendor-v2-1:INV-2', vendorId: 'vendor-v2-1', normalizedInvoiceNumber: 'INV-2',
      purchaseId: 'purchase-duplicate', createdAt: timestamp, createdByUserId: 'purchasing-user',
    })
    duplicateBatch.set(doc(purchasingDb, 'vendorLedgerEntriesV2', 'purchase:purchase-duplicate:1:purchase'), {
      id: 'purchase:purchase-duplicate:1:purchase', vendorId: 'vendor-v2-1', eventType: 'purchase', posting: 'financial',
      signedAmountPaise: 200000, sourceType: 'purchase', sourceRecordId: 'purchase-duplicate', sourceRevision: 1,
      occurredOn: '2026-10-01', createdAt: timestamp, createdByUserId: 'purchasing-user',
    })
    await assertFails(duplicateBatch.commit())
  })

  it('makes repository purchase retries idempotent and rejects a second purchase for the same invoice', async () => {
    await enableV2()
    const purchasingDb = userDb('purchasing-user')
    await setDoc(doc(purchasingDb, 'vendorsV2', 'vendor-v2-1'), vendor)
    const input = {
      id: 'purchase-repository-1',
      vendorId: 'vendor-v2-1',
      invoiceNumber: ' inv 3 ',
      invoiceDate: '2026-10-01',
      invoiceTotalPaise: 125000,
      actorUserId: 'purchasing-user',
      timestamp,
    }

    await expect(createPurchaseV2(input, purchasingDb)).resolves.toMatchObject({ created: true })
    await expect(createPurchaseV2(input, purchasingDb)).resolves.toMatchObject({ created: false })
    await expect(createPurchaseV2({ ...input, id: 'purchase-repository-2' }, purchasingDb))
      .rejects.toThrow(/already registered/)
  })

  it('creates owner-managed V2 vendors at zero and keeps retries idempotent', async () => {
    await enableV2()
    const input = {
      id: 'vendor-created-1', canonicalName: 'New Vendor', aliases: ['NV'], actorUserId: 'owner-user', timestamp,
    }
    await expect(createVendorV2(input, userDb('owner-user'))).resolves.toMatchObject({
      created: true, vendor: { openingBalancePaise: 0 },
    })
    await expect(createVendorV2(input, userDb('owner-user'))).resolves.toMatchObject({ created: false })
    await expect(createVendorV2({ ...input, canonicalName: 'Different Vendor' }, userDb('owner-user')))
      .rejects.toThrow(/already uses this ID/)
  })

  it('posts invoice-linked and custom settlements atomically without exceeding balances', async () => {
    await enableV2()
    const purchasingDb = userDb('purchasing-user')
    await setDoc(doc(purchasingDb, 'vendorsV2', 'vendor-v2-1'), vendor)
    await createPurchaseV2({
      id: 'purchase-settlement-1', vendorId: 'vendor-v2-1', invoiceNumber: 'INV-SETTLE',
      invoiceDate: '2026-10-01', invoiceTotalPaise: 100000, actorUserId: 'purchasing-user', timestamp,
    }, purchasingDb)

    const linked = {
      id: 'settlement-linked-1', vendorId: 'vendor-v2-1', date: '2026-10-01', amountPaise: 40000,
      mode: 'upi' as const, invoiceId: 'purchase-settlement-1', actorUserId: 'purchasing-user', timestamp,
    }
    await expect(createSettlementV2(linked, purchasingDb)).resolves.toMatchObject({ created: true })
    await expect(createSettlementV2(linked, purchasingDb)).resolves.toMatchObject({ created: false })
    await expect(createSettlementV2({ ...linked, amountPaise: 41000 }, purchasingDb)).rejects.toThrow(/conflicts/)
    await expect(createSettlementV2({
      id: 'settlement-custom-1', vendorId: 'vendor-v2-1', date: '2026-10-01', amountPaise: 60000,
      mode: 'bank-transfer', actorUserId: 'purchasing-user', timestamp,
    }, purchasingDb)).resolves.toMatchObject({ created: true })
    await expect(createSettlementV2({
      id: 'settlement-excess-1', vendorId: 'vendor-v2-1', date: '2026-10-01', amountPaise: 1,
      mode: 'cash', actorUserId: 'purchasing-user', timestamp,
    }, purchasingDb)).rejects.toThrow(/positive outstanding/)

    const correction = {
      id: 'settlement-correction-1', kind: 'settlement-correction', sourceRecordId: 'settlement-custom-1',
      vendorId: 'vendor-v2-1', sourceRevision: 1,
      before: { date: '2026-10-01', amountPaise: 60000, mode: 'bank-transfer', notes: '' },
      proposed: { date: '2026-10-01', amountPaise: 50000, mode: 'bank-transfer', notes: 'Corrected amount' },
      reason: 'Amount entered incorrectly', requestedByUserId: 'purchasing-user', requestedBy: 'Purchasing User',
      requestType: 'staff-request', status: 'pending', createdAt: timestamp,
    }
    await assertSucceeds(setDoc(doc(purchasingDb, 'vendorLedgerCorrectionRequestsV2', correction.id), correction))
    await expect(applySettlementCorrectionV2(correction.id, { id: 'owner-user', name: 'Owner' }, '2026-10-01T01:00:00.000Z', userDb('owner-user')))
      .resolves.toMatchObject({ adjustmentPaise: 10000 })
    const accountAfterCorrection = await getDoc(doc(userDb('owner-user'), 'vendorAccountStatesV2', 'vendor-v2-1'))
    expect(accountAfterCorrection.data()?.outstandingPaise).toBe(10000)
    await assertFails(updateDoc(doc(userDb('owner-user'), 'vendorSettlementsV2', 'settlement-custom-1'), { amountPaise: 50000 }))

    await expect(applyOwnerSettlementCorrectionV2({
      id: 'owner-correction-linked-1', sourceRecordId: 'settlement-linked-1',
      proposed: { date: '2026-10-01', amountPaise: 30000, mode: 'upi', notes: 'Owner corrected linked amount' },
      reason: 'Invoice-linked amount entered incorrectly', actor: { id: 'owner-user', name: 'Owner' },
      timestamp: '2026-10-01T02:00:00.000Z',
    }, userDb('owner-user'))).resolves.toMatchObject({ adjustmentPaise: 10000 })
    const linkedAccount = await getDoc(doc(userDb('owner-user'), 'vendorAccountStatesV2', 'vendor-v2-1'))
    const linkedInvoice = await getDoc(doc(userDb('owner-user'), 'invoiceStatesV2', 'purchase-settlement-1'))
    expect(linkedAccount.data()?.outstandingPaise).toBe(20000)
    expect(linkedInvoice.data()?.openAmountPaise).toBe(70000)
  })

  it('keeps V2 vendor cheques unique and reduces outstanding only on debit', async () => {
    await enableV2()
    const purchasingDb = userDb('purchasing-user')
    const chequeDb = userDb('cheque-user')
    await setDoc(doc(purchasingDb, 'vendorsV2', 'vendor-v2-1'), vendor)
    await createPurchaseV2({
      id: 'purchase-cheque-1', vendorId: 'vendor-v2-1', invoiceNumber: 'INV-CHEQUE',
      invoiceDate: '2026-10-01', invoiceTotalPaise: 100000, actorUserId: 'purchasing-user', timestamp,
    }, purchasingDb)
    await assertSucceeds(setDoc(doc(userDb('owner-user'), 'chequeBooksV2', 'book-1120-1199'), {
      id: 'book-1120-1199', bankAccountLabel: 'Primary Bank', startNumber: 1120, endNumber: 1199,
      active: true, revision: 1, createdAt: timestamp, createdByUserId: 'owner-user',
      updatedAt: timestamp, updatedByUserId: 'owner-user',
    }))
    const input = {
      chequeBookId: 'book-1120-1199', chequeNumber: '00 11-20', vendorId: 'vendor-v2-1',
      date: '2026-10-02', amountPaise: 40000, actorUserId: 'cheque-user', timestamp,
    }
    await expect(createVendorChequeV2(input, chequeDb)).resolves.toMatchObject({ created: true })
    await expect(createVendorChequeV2(input, chequeDb)).resolves.toMatchObject({ created: false })
    await expect(createVendorChequeV2({ ...input, amountPaise: 41000 }, chequeDb)).rejects.toThrow(/already registered/)
    await expect(createVendorChequeV2({ ...input, chequeNumber: '1200' }, chequeDb)).rejects.toThrow(/active leaf/)

    await expect(transitionVendorChequeV2({
      chequeNumber: '1120', expectedRevision: 1, toStatus: 'issued', actorUserId: 'cheque-user',
      timestamp: '2026-10-01T01:00:00.000Z',
    }, chequeDb)).resolves.toMatchObject({ cheque: { status: 'issued', revision: 2 } })
    expect((await getDoc(doc(chequeDb, 'vendorAccountStatesV2', 'vendor-v2-1'))).data()?.outstandingPaise).toBe(100000)
    await expect(transitionVendorChequeV2({
      chequeNumber: '1120', expectedRevision: 2, toStatus: 'presented', actorUserId: 'cheque-user',
      timestamp: '2026-10-01T02:00:00.000Z',
    }, chequeDb)).resolves.toMatchObject({ cheque: { status: 'presented', revision: 3 } })
    expect((await getDoc(doc(chequeDb, 'vendorAccountStatesV2', 'vendor-v2-1'))).data()?.outstandingPaise).toBe(100000)
    await expect(transitionVendorChequeV2({
      chequeNumber: '1120', expectedRevision: 3, toStatus: 'debited', actorUserId: 'cheque-user',
      timestamp: '2026-10-01T03:00:00.000Z',
    }, chequeDb)).resolves.toMatchObject({ cheque: { status: 'debited', revision: 4 } })
    expect((await getDoc(doc(chequeDb, 'vendorAccountStatesV2', 'vendor-v2-1'))).data()?.outstandingPaise).toBe(60000)
    await expect(transitionVendorChequeV2({
      chequeNumber: '1120', expectedRevision: 3, toStatus: 'debited', actorUserId: 'cheque-user',
      timestamp: '2026-10-01T03:00:00.000Z',
    }, chequeDb)).rejects.toThrow(/stale/)
    await assertFails(updateDoc(doc(userDb('owner-user'), 'chequesV2', '1120'), { chequeNumber: '1121' }))
  })
})
