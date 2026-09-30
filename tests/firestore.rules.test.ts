import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'

let testEnvironment: RulesTestEnvironment

const projectId = 'demo-alphahub'
const timestamp = '2026-10-01T00:00:00.000Z'

function userDb(userId: string) {
  return testEnvironment.authenticatedContext(userId).firestore()
}

async function seedUser(id: string, role: 'owner' | 'manager' | 'billing', disabled = false) {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users', id), {
      name: id,
      email: `${id}@example.com`,
      role,
      createdAt: timestamp,
      disabled,
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
})
