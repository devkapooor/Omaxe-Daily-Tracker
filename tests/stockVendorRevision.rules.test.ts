import { readFileSync } from 'node:fs'
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest'
import { initializeTestEnvironment, assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc, updateDoc, writeBatch, type Firestore } from 'firebase/firestore'
const state = vi.hoisted(() => ({ db: undefined as Firestore | undefined }))
vi.mock('@/shared/lib/firebase', () => ({ get db() { return state.db }, auth: { currentUser: { uid: 'billing' } }, functions: {} }))
import { loadVendorDirectory } from '../src/features/stock/data/receiveStockRepository'
import { dateConstraints, readPage } from '../src/features/stock/data/stockQueries'
import { where } from 'firebase/firestore'
import type { PosGoodsReceipt } from '../src/features/pos/domain/types'

const enabled = process.env.RUN_STOCK_VENDOR_TESTS === 'true'
describe.skipIf(!enabled)('approved Stock/Vendor query and direct-write contracts', () => {
  let env: RulesTestEnvironment
  beforeAll(async () => {
    if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') throw new Error('Exact loopback emulator required')
    env = await initializeTestEnvironment({ projectId: 'demo-stock-vendor-rules', firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync('firestore.rules', 'utf8') } })
    await env.clearFirestore()
    await env.withSecurityRulesDisabled(async ctx => {
      const db = ctx.firestore(), batch = writeBatch(db)
      for (const role of ['owner', 'billing']) batch.set(doc(db, 'users', role), { name: 'Synthetic ' + role, role, disabled: false, approvalStatus: 'approved' })
      batch.set(doc(db, 'appMetadata/vendorLedgerV2Config'), { enabled: true, activationDate: '2026-01-01' })
      for (let index = 0; index < 276; index++) batch.set(doc(db, 'vendorsV2', 'v' + String(index).padStart(3, '0')), { id: 'v' + String(index).padStart(3, '0'), canonicalName: index === 274 ? 'Mixed CASE Supplier' : 'Supplier ' + index, aliases: index === 274 ? ['ACME Brand'] : [], suppliedBrands: [], active: index !== 275, openingBalancePaise: 0, revision: 1 })
      batch.set(doc(db, 'vendorAccountStatesV2/v000'), { vendorId: 'v000', outstandingPaise: 1000, revision: 1 })
      batch.set(doc(db, 'purchasesV2/invoice'), { vendorId: 'v000', invoiceTotalPaise: 1000, revision: 1 })
      batch.set(doc(db, 'posSandboxes/test/goodsReceipts/old-draft'), { id: 'old-draft', status: 'draft', vendorId: 'v000', createdAt: '2020-01-01T00:00:00Z', updatedAt: '2020-01-01T12:00:00+05:30', revision: 1 })
      await batch.commit()
    })
    state.db = env.authenticatedContext('billing').firestore()
  }, 90000)
  afterAll(async () => { await env?.cleanup() })
  it('search catalogue includes vendors beyond the first 250 rows and preserves aliases/case', async () => {
    const items = await loadVendorDirectory()
    expect(items).toHaveLength(275)
    expect(items.find(item => item.id === 'v274')?.aliases).toEqual(['ACME Brand'])
    expect(items.some(item => item.id === 'v275')).toBe(false)
  })
  it('history can choose inactive vendors rather than losing historical GRNs', async () => {
    const items = await loadVendorDirectory(true)
    expect(items).toHaveLength(276)
    expect(items.find(item => item.id === 'v275')?.active).toBe(false)
  })
  it('saved draft query finds old drafts without recent-date constraints', async () => {
    const page = await readPage<PosGoodsReceipt>('goodsReceipts', [where('status', '==', 'draft')], null, 25, 'all-drafts', '__name__', 'asc')
    expect(page.items.map(item => item.id)).toEqual(['old-draft'])
    const dated = await readPage<PosGoodsReceipt>('goodsReceipts', [...dateConstraints('2020-01-01', '2020-01-01', 'updatedAt'), where('status', '==', 'draft')], null, 25, 'draft-last-saved', 'updatedAt')
    expect(dated.items.map(item => item.id)).toEqual(['old-draft'])
  })
  it('owner and staff clients cannot bypass server posting for balances, receipts, or credit notes', async () => {
    for (const uid of ['owner', 'billing']) {
      const db = env.authenticatedContext(uid).firestore()
      await assertFails(updateDoc(doc(db, 'vendorsV2/v000'), { openingBalancePaise: 999999 }))
      await assertFails(updateDoc(doc(db, 'vendorAccountStatesV2/v000'), { outstandingPaise: 0 }))
      await assertFails(updateDoc(doc(db, 'purchasesV2/invoice'), { invoiceTotalPaise: 1 }))
      await assertFails(updateDoc(doc(db, 'posSandboxes/test/goodsReceipts/old-draft'), { shortage: { state: 'received' } }))
      await assertFails(setDoc(doc(db, 'vendorCreditNoteReservationsV2/forged'), { amountPaise: 999999 }))
      await assertFails(setDoc(doc(db, 'vendorLedgerEntriesV2/forged'), { signedAmountPaise: -999999 }))
      await assertFails(setDoc(doc(db, 'businessReferences/forged'), { prefix: 'GRN', sourceId: 'forged', reference: 'GRN0001' }))
      await assertFails(setDoc(doc(db, 'businessReferenceCounters/GRN'), { lastNumber: 999999 }))
      await assertFails(setDoc(doc(db, 'vendorReturnsV2/forged'), { outcome: 'pending', valuePaise: 1 }))
      await assertFails(setDoc(doc(db, 'posSandboxes/test/vendorReturnReceiptStates/forged'), { returnedQuantity: 999999 }))
    }
  })
})
