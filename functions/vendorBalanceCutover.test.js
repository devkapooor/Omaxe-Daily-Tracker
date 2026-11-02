const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { createVendorBalanceCutoverHandlers } = require('./vendorBalanceCutover')

function fixture() {
  const store = new Map()
  const ref = (collection, id) => ({ collection, id, path: `${collection}/${id}` })
  const put = (collection, id, value) => store.set(ref(collection, id).path, structuredClone(value))
  const docSnapshot = target => {
    const value = store.get(target.path)
    return { id: target.id, ref: target, exists: value !== undefined, data: () => value && structuredClone(value), get: key => value?.[key] }
  }
  const db = { collection: name => ({ limit: count => ({ collection: name, count }) }) }
  const tx = {
    async get(target) {
      if (target.collection && target.count) {
        const docs = [...store.entries()].filter(([path]) => path.startsWith(`${target.collection}/`)).slice(0, target.count).map(([path]) => docSnapshot({ collection: target.collection, id: path.slice(target.collection.length + 1), path }))
        return { docs, size: docs.length, empty: docs.length === 0 }
      }
      return docSnapshot(target)
    },
    set(target, value) { store.set(target.path, structuredClone(value)) },
    create(target, value) { if (store.has(target.path)) throw new Error(`already exists: ${target.path}`); store.set(target.path, structuredClone(value)) },
  }
  const ops = {
    db, ref,
    object(value, keys) { if (!value || typeof value !== 'object' || Object.keys(value).some(key => !keys.includes(key))) throw new Error('Invalid request fields'); return value },
    id(value) { if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(value)) throw new Error('Invalid ID'); return value },
    date(value) { if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new Error('Invalid date'); return value },
    text(value, label, _optional, max = 500) { if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`Invalid ${label}`); return value.trim() },
    paise(value, label = 'amount', min = 0) { if (!Number.isSafeInteger(value) || value < min) throw new Error(`Invalid ${label}`); return value },
    rupees(value) { const number = Number(value); if (!Number.isFinite(number) || number < 0) throw new Error('Invalid rupees'); return Math.round(number * 100) },
    safe(value) { if (!Number.isSafeInteger(value)) throw new Error('Unsafe integer'); return value },
    fail(message) { throw new Error(message) },
    async run(_request, _kind, _intent, roles, operation) {
      assert.ok(roles.includes('owner'))
      const ctx = { tx, writes: [], actor: { uid: 'owner-fixture', name: 'Test Owner', role: 'owner' }, timestamp: '2026-10-31T05:00:00.000Z' }
      const result = await operation(ctx)
      for (const write of ctx.writes) write()
      return result
    },
  }
  put('appMetadata', 'vendorLedgerV2Config', { enabled: true, activationDate: '2026-01-01' })
  put('vendorsV2', 'vendor-1', { id: 'vendor-1', canonicalName: 'Synthetic Vendor', active: true, openingBalancePaise: 5000, revision: 3 })
  put('vendorAccountStatesV2', 'vendor-1', { id: 'vendor-1', vendorId: 'vendor-1', outstandingPaise: 120000, vendorCreditPaise: 5000, revision: 8 })
  put('purchasesV2', 'purchase-1', { id: 'purchase-1', vendorId: 'vendor-1' })
  put('vendorSettlementsV2', 'settlement-1', { id: 'settlement-1', vendorId: 'vendor-1', amountPaise: 25000 })
  put('vendorSettlementStatesV2', 'settlement-1', { id: 'settlement-1', vendorId: 'vendor-1', revision: 1 })
  put('vendorLedgerCorrectionRequestsV2', 'correction-1', { id: 'correction-1', sourceRecordId: 'settlement-1', status: 'pending' })
  put('invoiceStatesV2', 'purchase-1', { id: 'purchase-1', vendorId: 'vendor-1', openAmountPaise: 95000, reservedAmountPaise: 25000, revision: 2 })
  put('invoiceAllocationsV2', 'allocation-1', { id: 'allocation-1', invoiceId: 'purchase-1', state: 'reserved', revision: 1 })
  put('chequesV2', 'cheque-1', { id: 'cheque-1', vendorId: 'vendor-1', status: 'issued', amountPaise: 25000, origin: 'v2', trackingOnly: false, revision: 1 })
  put('vendorReturnsV2', 'return-1', { id: 'return-1', vendorId: 'vendor-1', outcome: 'pending', revision: 1 })
  put('vendorLedgerEntriesV2', 'old-entry', { id: 'old-entry', vendorId: 'vendor-1', signedAmountPaise: 120000 })
  put('vendors', 'legacy-vendor', { id: 'legacy-vendor', openingOutstandingRemaining: 300 })
  put('purchases', 'legacy-purchase', { id: 'legacy-purchase', unpaidAmount: 200 })
  put('appMetadata', 'workspaceMetrics', { liabilities: { totalVendorOutstanding: 1234 }, vendorOutstandingByName: { 'Synthetic Vendor': 1234 } })
  const handlers = createVendorBalanceCutoverHandlers(ops)
  const request = (extra = {}) => ({ data: { operationId: `operation-${Math.random()}`, cutoverId: 'vendor-reset-20261031', cutoverDate: '2026-10-31', reason: 'Synthetic test reset', confirmation: 'RESET VENDOR BALANCES 2026-10-31', ...extra } })
  return { handlers, request, store, ref }
}

describe('vendor balance cutover', () => {
  it('requires the exact date confirmation and changes nothing when it is wrong', async () => {
    const { handlers, request, store } = fixture()
    const before = structuredClone([...store.entries()])
    await assert.rejects(handlers.reset(request({ confirmation: 'RESET VENDOR BALANCES' })), /exact vendor-balance reset confirmation/i)
    assert.deepEqual([...store.entries()], before)
  })

  it('zeros current V2 balances while preserving invoice, cheque, return and legacy data untouched', async () => {
    const { handlers, request, store, ref } = fixture()
    const result = await handlers.reset(request())
    assert.equal(store.get(ref('vendorAccountStatesV2', 'vendor-1').path).outstandingPaise, 0)
    assert.equal(store.get(ref('vendorAccountStatesV2', 'vendor-1').path).vendorCreditPaise, 0)
    assert.equal(store.get(ref('vendorsV2', 'vendor-1').path).openingBalancePaise, 0)
    assert.equal(store.get(ref('invoiceStatesV2', 'purchase-1').path).openAmountPaise, 0)
    assert.equal(store.get(ref('invoiceStatesV2', 'purchase-1').path).cutoverOpenAmountPaise, 95000)
    assert.equal(store.get(ref('invoiceStatesV2', 'purchase-1').path).cutoverStatus, 'historical')
    assert.equal(store.get(ref('purchasesV2', 'purchase-1').path).cutoverHistoricalOnly, true)
    assert.equal(store.get(ref('vendorSettlementsV2', 'settlement-1').path).cutoverHistoricalOnly, true)
    assert.equal(store.get(ref('vendorSettlementStatesV2', 'settlement-1').path).cutoverHistoricalOnly, true)
    assert.equal(store.get(ref('vendorLedgerCorrectionRequestsV2', 'correction-1').path).status, 'rejected')
    assert.equal(store.get(ref('invoiceAllocationsV2', 'allocation-1').path).state, 'released')
    assert.equal(store.get(ref('chequesV2', 'cheque-1').path).status, 'issued')
    assert.equal(store.get(ref('chequesV2', 'cheque-1').path).cutoverTrackingOnly, true)
    assert.equal(store.get(ref('vendorReturnsV2', 'return-1').path).cutoverHistoricalOnly, true)
    assert.equal(store.get(ref('vendors', 'legacy-vendor').path).openingOutstandingRemaining, 300)
    assert.equal(store.get(ref('purchases', 'legacy-purchase').path).unpaidAmount, 200)
    assert.equal(store.get(ref('purchases', 'legacy-purchase').path).cutoverHistoricalOnly, undefined)
    assert.equal(store.get(ref('appMetadata', 'workspaceMetrics').path).liabilities.totalVendorOutstanding, 0)
    assert.equal(store.get(ref('vendorLedgerEntriesV2', 'old-entry').path).signedAmountPaise, 120000)
    assert.equal(result.payableBeforePaise, 120000)
    assert.equal(result.creditBeforePaise, 5000)
    assert.equal(store.get(ref('appMetadata', 'vendorBalanceCutovers-vendor-reset-20261031').path).cutoverId, 'vendor-reset-20261031')
    await assert.rejects(handlers.reset(request({ operationId: 'another-operation' })), /cutover already exists/i)
  })
})
