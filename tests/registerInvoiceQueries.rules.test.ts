import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc, type Firestore } from 'firebase/firestore'
import { readFileSync } from 'node:fs'
vi.mock('@/shared/lib/firebase', () => ({ db: null }))
import { loadPaymentInvoicePage, loadPaymentInvoiceTarget } from '@/features/register/data/registerInvoiceQueries'

let environment: RulesTestEnvironment
let database: Firestore
beforeAll(async () => {
  environment = await initializeTestEnvironment({ projectId: 'demo-register-invoice-picker', firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync('firestore.rules', 'utf8') } })
  await environment.clearFirestore()
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore()
    await setDoc(doc(db, 'users', 'billing'), { name: 'Invoice test staff', role: 'billing', disabled: false, approvalStatus: 'approved' })
    await setDoc(doc(db, 'appMetadata', 'vendorLedgerV2Config'), { enabled: true, activationDate: '2026-10-01' })
    for (let index = 0; index < 32; index += 1) {
      const id = `invoice-${String(index).padStart(2, '0')}`
      await setDoc(doc(db, 'invoiceStatesV2', id), { id, invoiceId: id, vendorId: 'vendor-a', openAmountPaise: 10000 + Math.floor(index / 3) * 100, reservedAmountPaise: 0, revision: 1 })
    }
    await setDoc(doc(db, 'invoiceStatesV2', 'closed'), { id: 'closed', invoiceId: 'closed', vendorId: 'vendor-a', openAmountPaise: 0, reservedAmountPaise: 0 })
    await setDoc(doc(db, 'invoiceStatesV2', 'other-vendor'), { id: 'other-vendor', invoiceId: 'other-vendor', vendorId: 'vendor-b', openAmountPaise: 5000, reservedAmountPaise: 0 })
  })
  database = environment.authenticatedContext('billing').firestore() as unknown as Firestore
})
afterAll(async () => environment.cleanup())
describe('bounded Register invoice reads against real emulator Rules', () => {
  it('reads 25 then 7 open invoices in stable amount/ID order without duplicates', async () => {
    const first = await loadPaymentInvoicePage('vendor-a', null, database)
    const second = await loadPaymentInvoicePage('vendor-a', first.cursor, database)
    expect(first.items).toHaveLength(25)
    expect(first.hasMore).toBe(true)
    expect(second.items).toHaveLength(7)
    expect(second.hasMore).toBe(false)
    const ids = [...first.items, ...second.items].map(invoice => invoice.id)
    expect(ids).toEqual(Array.from({ length: 32 }, (_, index) => `invoice-${String(index).padStart(2, '0')}`))
    expect(new Set(ids).size).toBe(32)
  })
  it('point-loads a Pay-link target beyond the first page', async () => {
    const first = await loadPaymentInvoicePage('vendor-a', null, database)
    expect(first.items.some(invoice => invoice.id === 'invoice-31')).toBe(false)
    expect(await loadPaymentInvoiceTarget('vendor-a', 'invoice-31', database)).toMatchObject({ id: 'invoice-31', vendorId: 'vendor-a', openAmountPaise: 11000 })
  })
  it.each(['closed', 'other-vendor', 'missing'])('rejects an invalid linked invoice: %s', async id => {
    await expect(loadPaymentInvoiceTarget('vendor-a', id, database)).rejects.toThrow('no longer open for this vendor')
  })
  it('does not expose invoices to an unauthenticated caller', async () => {
    const anonymous = environment.unauthenticatedContext().firestore() as unknown as Firestore
    await expect(loadPaymentInvoicePage('vendor-a', null, anonymous)).rejects.toMatchObject({ code: 'permission-denied' })
  })
})
