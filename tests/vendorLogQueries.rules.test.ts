import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, doc, getDocs, limit, query, setDoc, type Firestore } from 'firebase/firestore'
import { readFileSync } from 'node:fs'
vi.mock('@/shared/lib/firebase', () => ({ db: null }))
import { loadVendorLogPage } from '@/features/logs/data/vendorLogQueries'

let environment: RulesTestEnvironment, database: Firestore
beforeAll(async () => {
  environment = await initializeTestEnvironment({ projectId: 'demo-vendor-logs', firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync('firestore.rules', 'utf8') } })
  await environment.withSecurityRulesDisabled(async context => {
    expect((await getDocs(query(collection(context.firestore(), 'loans'), limit(1)))).size).toBe(0)
  })
  await environment.clearFirestore()
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore()
    await setDoc(doc(db, 'users', 'owner'), { name: 'Synthetic owner', role: 'owner', disabled: false, approvalStatus: 'approved' })
    await setDoc(doc(db, 'appMetadata', 'vendorLedgerV2Config'), { enabled: true, activationDate: '2026-10-01' })
    await setDoc(doc(db, 'vendorsV2', 'vendor'), { canonicalName: 'Synthetic vendor', active: true })
    for (let index = 0; index < 32; index += 1) {
      const id = 'purchase-' + String(index).padStart(2, '0')
      await setDoc(doc(db, 'purchasesV2', id), { invoiceDate: '2026-10-15', vendorId: 'vendor', invoiceNumber: 'INV-' + index, invoiceTotalPaise: 100000, createdByUserId: 'owner' })
      await setDoc(doc(db, 'invoiceStatesV2', id), { vendorId: 'vendor', invoiceId: id, openAmountPaise: 2000 })
    }
    await setDoc(doc(db, 'purchasesV2', 'no-state'), { invoiceDate: '2026-10-16', vendorId: 'vendor', invoiceTotalPaise: 5000 })
    await setDoc(doc(db, 'vendorSettlementStatesV2', 'corrected'), { vendorId: 'vendor', date: '2026-10-16', amountPaise: 7500, mode: 'bank-transfer' })
    await setDoc(doc(db, 'vendorSettlementsV2', 'corrected'), { vendorId: 'vendor', date: '2026-10-15', amountPaise: 10000, createdByUserId: 'owner' })
  })
  database = environment.authenticatedContext('owner').firestore() as unknown as Firestore
}, 30000)
afterAll(async () => environment?.cleanup())
describe('filtered current vendor Logs source queries', () => {
  it('pages 25+7 invoices with stable document order and no duplicate rows', async () => {
    const first = await loadVendorLogPage('purchase', '2026-10-15', '2026-10-15', null, database)
    const second = await loadVendorLogPage('purchase', '2026-10-15', '2026-10-15', first.cursor, database)
    expect(first.rows).toHaveLength(25); expect(first.more).toBe(true)
    expect(second.rows).toHaveLength(7); expect(second.more).toBe(false)
    expect([...first.rows, ...second.rows].map(row => row.id)).toEqual(Array.from({ length: 32 }, (_, index) => 'purchasesV2/purchase-' + String(31 - index).padStart(2, '0')))
    expect(first.rows[0]).toMatchObject({ party: 'Synthetic vendor', amount: 1000, open: 20, paid: null })
  })
  it('filters payment history by corrected effective date and preserves original actor', async () => {
    expect((await loadVendorLogPage('payment', '2026-10-15', '2026-10-15', null, database)).rows).toHaveLength(0)
    expect((await loadVendorLogPage('payment', '2026-10-16', '2026-10-16', null, database)).rows).toEqual([expect.objectContaining({ amount: 75, method: 'Bank Transfer', actor: 'owner', party: 'Synthetic vendor' })])
  })
  it('reports an unavailable invoice state without inventing paid/open values', async () => {
    expect((await loadVendorLogPage('purchase', '2026-10-16', '2026-10-16', null, database)).rows[0]).toMatchObject({ amount: 50, open: null, paid: null })
  })
  it('rejects unauthenticated reads under actual Rules', async () => {
    await expect(loadVendorLogPage('purchase', '2026-10-15', '2026-10-15', null, environment.unauthenticatedContext().firestore() as unknown as Firestore)).rejects.toMatchObject({ code: 'permission-denied' })
  })
})
