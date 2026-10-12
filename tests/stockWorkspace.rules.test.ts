import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc, writeBatch, type Firestore } from 'firebase/firestore'
const state = vi.hoisted(() => ({ db: undefined as Firestore | undefined, uid: 'billing', reads: [] as Array<{ path: string; size: number }>, listeners: 0, snapshots: [] as Array<{ path: string; size: number }> }))
vi.mock('@/shared/lib/firebase', () => ({ get db() { return state.db }, auth: { currentUser: { get uid() { return state.uid } } }, functions: {} }))
vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>()
  return { ...actual,
    getDocsFromServer: vi.fn(async (...args: Parameters<typeof actual.getDocsFromServer>) => { const result = await actual.getDocsFromServer(...args); state.reads.push({ path: (args[0] as unknown as { _query: { path: { canonicalString(): string } } })._query.path.canonicalString(), size: result.size }); return result }),
    onSnapshot: vi.fn((...args: unknown[]) => {
      state.listeners++
      const index = typeof args[1] === 'function' ? 1 : 2
      const callback = args[index] as (snapshot: { metadata: { fromCache: boolean }; size: number }) => void
      const path = (args[0] as { _query?: { path: { canonicalString(): string } } })._query?.path.canonicalString() ?? 'document'
      args[index] = (snapshot: { metadata: { fromCache: boolean }; size: number }) => { if (!snapshot.metadata.fromCache) state.snapshots.push({ path, size: snapshot.size }); callback(snapshot) }
      const stop = (actual.onSnapshot as (...args: unknown[]) => () => void)(...args)
      let active = true
      return () => { if (active) { active = false; state.listeners--; stop() } }
    }),
  }
})
import { loadStockPage } from '../src/features/stock/data/stockRepository'
import { createStockHistoryPager, historyCompare, type HistoryFilters, type StockHistoryEntry } from '../src/features/stock/data/stockHistoryRepository'
import { dateConstraints, readPage, readSource } from '../src/features/stock/data/stockQueries'
import { subscribeDashboardBills, subscribeDashboardStates, loadStockAttention } from '../src/features/pos/data/posDashboardRepository'
import { loadVendor, loadVendors, lookupReceiptInvoice } from '../src/features/stock/data/receiveStockRepository'
import { setServerClockSample } from '../src/shared/lib/serverClock'
import type { PosBill } from '../src/features/pos/domain/types'

let environment: RulesTestEnvironment
const base = 'posSandboxes/test'
const at = '2026-10-03T08:00:00.000Z'
const filters: HistoryFilters = { from: '2026-10-03', to: '2026-10-03', identifier: '', identifierMode: 'barcode', event: '', undated: false }
beforeAll(async () => {
  if (!/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST ?? '')) throw new Error('Loopback emulator required; production tests are prohibited.')
  environment = await initializeTestEnvironment({ projectId: 'demo-stock-workspace', firestore: { rules: readFileSync('firestore.rules', 'utf8') } })
  await environment.clearFirestore()
  await environment.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore()
    const records: Array<[string, Record<string, unknown>]> = []
    for (const role of ['owner', 'manager', 'billing', 'disabled']) records.push([`users/${role}`, { name: role, role: role === 'disabled' ? 'billing' : role, disabled: role === 'disabled' }])
    for (let index = 0; index < 120; index++) {
      const id = `p-${String(index).padStart(3, '0')}`
      records.push([`${base}/products/${id}`, { id, name: `Product ${id}`, searchName: `product ${id}`, barcode: String(index).padStart(5, '0'), vendor: 'Supplier', category: 'QA', brand: 'QA', currentQuantity: index < 3 ? index - 3 : index < 10 ? 0 : 2, sellingPricePaise: 900, sourceValues: { 'Printed MRP': '10.00' }, active: true, revision: 1, createdAt: at, updatedAt: at }])
      records.push([`${base}/productCosts/${id}`, { productId: id, costPaise: 500, updatedAt: at }])
    }
    records.push([`${base}/products/inactive`, { id: 'inactive', name: 'Inactive', searchName: 'inactive', barcode: '99999', vendor: 'Other', currentQuantity: -999, sellingPricePaise: 1, active: false, revision: 1, createdAt: at, updatedAt: at }])
    records.push([`${base}/productCosts/unrelated`, { productId: 'unrelated', costPaise: 123 }])
    for (let index = 0; index < 70; index++) records.push([`${base}/stockMovements/m-${String(index).padStart(3, '0')}`, { productId: 'p-010', barcode: '00010', type: index % 3 === 0 ? 'sale' : index % 3 === 1 ? 'goods-receipt' : 'stock-price-correction', quantityDelta: index % 3 === 0 ? -1 : index % 3 === 1 ? 2 : 0, createdAt: new Date(Date.parse(at) + index * 1000).toISOString(), actorUid: 'billing', actorName: 'Billing' }])
    records.push([`${base}/stockMovements/undated`, { productId: 'p-010', barcode: '00010', type: 'manual-inward', quantityDelta: 1 }])
    for (let index = 0; index < 20; index++) {
      records.push([`${base}/events/d-${index}`, { type: 'bill-return-approved', returnCondition: 'damaged', billId: 'bill-0', approvalId: 'approval', createdAt: new Date(Date.parse(at) + index * 2200).toISOString(), actorUid: 'owner' }])
      records.push([`${base}/events/overlap-${index}`, { type: 'bill-return-approved', returnCondition: 'sellable', billId: 'bill-0', createdAt: at }])
    }
    for (let index = 0; index < 220; index++) {
      records.push([`${base}/bills/bill-${String(index).padStart(3, '0')}`, { id: `bill-${String(index).padStart(3, '0')}`, businessDate: '2026-10-03', createdAt: at, totalPaise: 100, lines: [], payments: [] }])
      records.push([`${base}/billStates/bill-${String(index).padStart(3, '0')}`, { billId: `bill-${String(index).padStart(3, '0')}`, state: 'active', revision: 1 }])
    }
    records.push([`${base}/billStates/outside`, { billId: 'outside', state: 'voided', revision: 1 }])
    records.push([`${base}/stockPriceChanges/private`, { id: 'private', productId: 'p-010', reviewStatus: 'pending' }])
    records.push([`${base}/approvals/private`, { requestedByUid: 'manager', status: 'approved' }])
    for (let index = 0; index < 61; index++) { const id = `vendor-${String(index).padStart(3, '0')}`; records.push([`vendorsV2/${id}`, { id, canonicalName: `Supplier ${String(index).padStart(3, '0')}`, active: true, aliases: [] }]) }
    records.push(['vendorsV2/inactive', { id: 'inactive', canonicalName: 'Supplier inactive', active: false }])
    records.push(['appMetadata/vendorLedgerV2Config', { enabled: true, activationDate: '2026-10-01' }])
    records.push(['invoiceReservationsV2/vendor:INV-OLD', { purchaseId: 'purchase-old' }])
    records.push(['purchasesV2/purchase-old', { grnId: 'receipt-old' }])
    records.push([`${base}/goodsReceipts/receipt-old`, { id: 'receipt-old', vendorId: 'vendor', invoiceNumber: 'INV-OLD', status: 'submitted', createdAt: '2026-10-01T00:00:00.000Z', createdByUid: 'owner', revision: 1, lines: [], mrpCorrections: [{ reason: 'Historical evidence', lines: [] }] }])
    for (let offset = 0; offset < records.length; offset += 400) { const batch = writeBatch(database); for (const [path, value] of records.slice(offset, offset + 400)) batch.set(doc(database, path), value); await batch.commit() }
  })
}, 60_000)
beforeEach(() => { setServerClockSample(Date.now(), performance.now(), performance.now()); state.uid = 'billing'; state.db = environment.authenticatedContext(state.uid).firestore(); state.reads = []; state.snapshots = [] })
afterAll(async () => { await environment.cleanup() })
describe('Stock workspace bounded queries and permissions', () => {
  it('pages matching products and reads only their costs', async () => {
    const query = { search: '', stockStatus: 'positive' }
    const first = await loadStockPage(query, 'name', false, null)
    expect(first.items).toHaveLength(50)
    expect(state.reads.filter((read) => read.path.endsWith('/products')).map((read) => read.size)).toEqual([50])
    expect(state.reads.filter((read) => read.path.endsWith('/productCosts')).map((read) => read.size)).toEqual([30, 20])
    const second = await loadStockPage(query, 'name', false, first.cursor)
    const third = await loadStockPage(query, 'name', false, second.cursor)
    expect(new Set([...first.items, ...second.items, ...third.items].map((item) => item.id)).size).toBe(110)
    expect(third.hasMore).toBe(false)
  })
  it('preserves leading zeros and combines exact barcode and quantity filters', async () => {
    const exact = await loadStockPage({ search: ' 00010 ', stockStatus: '' }, 'name', false, null)
    expect(exact.items.map((item) => item.id)).toEqual(['p-010'])
    for (const [search, stockStatus, id] of [['00000', 'negative', 'p-000'], ['00003', 'zero', 'p-003'], ['00010', 'positive', 'p-010']]) {
      const page = await loadStockPage({ search, stockStatus }, 'name', false, null)
      expect(page.items.map((item) => item.id)).toEqual([id])
    }
    for (const search of ['10', 'Product p-', 'Supplier']) {
      const page = await loadStockPage({ search, stockStatus: '' }, 'name', false, null)
      expect(page.items).toEqual([])
    }
    expect((await loadStockPage({ search: '00010', stockStatus: 'negative' }, 'name', false, null)).items).toEqual([])
    expect(state.reads.every((read) => read.size <= 50)).toBe(true)
  })
  it('performs no product or cost query for blank barcode and All stock status', async () => {
    const page = await loadStockPage({ search: '   ', stockStatus: '' }, 'name', false, null)
    expect(page).toEqual({ items: [], cursor: null, hasMore: false })
    expect(state.reads).toEqual([])
    expect(state.listeners).toBe(0)
  })
  it('merges paged movement and damaged-return history without duplicate source events', async () => {
    const pager = createStockHistoryPager(filters)
    const records: StockHistoryEntry[] = []; let hasMore = true
    while (hasMore) { const page = await pager.next(); records.push(...page.items); hasMore = page.hasMore }
    expect(records).toHaveLength(90)
    expect(records).toEqual([...records].sort(historyCompare))
    expect(records.filter((record) => record.sourceKind === 'damaged-return')).toHaveLength(20)
    expect(records.some((record) => record.id.startsWith('overlap-'))).toBe(false)
    expect(state.reads.every((read) => read.size <= 25)).toBe(true)
    expect(new Set(records.map((record) => `${record.sourceKind}:${record.id}`)).size).toBe(90)
  })
  it('filters returns by product without attributing bill-level damaged events to that product', async () => {
    const pager = createStockHistoryPager({ ...filters, identifier: '00010', event: 'prices' })
    const page = await pager.next()
    expect(page.items).toHaveLength(23)
    expect(page.items.every((item) => item.type === 'stock-price-correction')).toBe(true)
    expect(state.reads.some((read) => read.path.endsWith('/events'))).toBe(false)
  })
  it('keeps undated evidence accessible through bounded product-specific scans', async () => {
    const pager = createStockHistoryPager({ ...filters, identifier: 'p-010', identifierMode: 'productId', undated: true })
    const page = await pager.next()
    expect(page.items.map((item) => item.id)).toEqual(['undated'])
    expect(state.reads.every((read) => read.size <= 25)).toBe(true)
    expect(() => createStockHistoryPager({ ...filters, undated: true })).toThrow(/exact product ID/)
  })
  it('pages active vendors and searches beyond the first page without a catalogue download', async () => {
    const first = await loadVendors('', null)
    const second = await loadVendors('', first.cursor)
    const third = await loadVendors('', second.cursor)
    expect([first.items.length, second.items.length, third.items.length]).toEqual([25, 25, 11])
    const ids = [...first.items, ...second.items, ...third.items].map((vendor) => vendor.id)
    expect(new Set(ids).size).toBe(61)
    expect(third.hasMore).toBe(false)
    expect(ids).not.toContain('inactive')
    const search = await loadVendors('Supplier 050', null)
    expect(search.items.map((vendor) => vendor.id)).toEqual(['vendor-050'])
    expect((await loadVendor('vendor-050'))?.canonicalName).toBe('Supplier 050')
    expect((await loadVendors('supplier', null)).items).toEqual([])
    expect(state.reads.map((read) => read.size)).toEqual([25, 25, 11, 1, 0])
    expect(state.listeners).toBe(0)
  })
  it('looks up an invoice older than the selected history window without loading history', async () => {
    expect((await lookupReceiptInvoice('vendor', ' inv-old '))?.id).toBe('receipt-old')
    expect(state.reads).toHaveLength(0)
  })
  for (const role of ['owner', 'manager', 'billing']) it(`${role} reads stock while owner-review and request restrictions remain enforced`, async () => {
    state.uid = role; state.db = environment.authenticatedContext(role).firestore()
    expect((await readSource('products', 'p-010'))).toBeTruthy()
    if (role !== 'owner') await expect(readSource('stockPriceChanges', 'private')).rejects.toThrow()
    else expect(await readSource('stockPriceChanges', 'private')).toBeTruthy()
    if (role === 'billing') await expect(readSource('approvals', 'private')).rejects.toThrow()
    else expect(await readSource('approvals', 'private')).toBeTruthy()
  })
  it('rejects disabled and unauthenticated stock readers', async () => {
    for (const role of ['disabled', '']) { state.uid = role; state.db = role ? environment.authenticatedContext(role).firestore() : environment.unauthenticatedContext().firestore(); await expect(readSource('products', 'p-010')).rejects.toThrow() }
  })
  it('retains historical receipt corrections but rejects new correction writes', async () => {
    state.uid = 'owner'; state.db = environment.authenticatedContext('owner').firestore()
    const receipt = doc(state.db, `${base}/goodsReceipts/receipt-old`)
    expect((await getDoc(receipt)).data()?.mrpCorrections).toHaveLength(1)
    await assertFails(updateDoc(receipt, { mrpCorrections: [{ reason: 'Historical evidence' }, { reason: 'Retired correction' }], revision: 2, updatedByUid: 'owner' }))
    await assertFails(setDoc(doc(state.db, `${base}/stockMovements/retired`), { id: 'retired', type: 'goods-receipt-mrp-correction', actorUid: 'owner', quantityDelta: 0, beforeQuantity: 2, afterQuantity: 2, productRevisionBefore: 1, productRevisionAfter: 2 }))
    await assertFails(setDoc(doc(state.db, `${base}/events/retired`), { type: 'goods-receipt-mrp-corrected', actorUid: 'owner' }))
  })
  it('loads complete dashboard totals through bounded listeners and detaches every page', async () => {
    let stop: (() => void) | undefined
    const bills = await new Promise<PosBill[]>((resolve, reject) => { stop = subscribeDashboardBills('2026-10-03', '2026-10-03', resolve, reject, () => {}) })
    expect(bills).toHaveLength(220)
    expect(state.snapshots.every((snapshot) => snapshot.size <= 100)).toBe(true)
    stop?.(); expect(state.listeners).toBe(0)
    let stopStates: (() => void) | undefined
    const states = await new Promise<unknown[]>((resolve, reject) => { stopStates = subscribeDashboardStates(bills.map((bill) => bill.id), resolve, reject) })
    expect(states).toHaveLength(220)
    expect(state.snapshots.filter((snapshot) => snapshot.path.endsWith('/billStates')).every((snapshot) => snapshot.size <= 30)).toBe(true)
    stopStates?.(); expect(state.listeners).toBe(0)
  }, 20_000)
  it('counts stock attention across the catalogue without fetching its products', async () => {
    const result = await loadStockAttention()
    expect(result.items[0]).toMatchObject({ negativeStockCount: 3, zeroStockCount: 7 })
    expect(state.reads.every((read) => read.size <= 5)).toBe(true)
  })
  it('applies inclusive IST dates and rejects reversed ranges', async () => {
    const page = await readPage('stockMovements', dateConstraints('2026-10-03', '2026-10-03'), null, 25, 'date-check')
    expect(page.items).toHaveLength(25)
    expect(() => dateConstraints('2026-10-04', '2026-10-03')).toThrow(/valid date/)
  })
})
