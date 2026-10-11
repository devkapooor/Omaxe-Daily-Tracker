import { describe, expect, it } from 'vitest'
import { stockPricePaise, validateStockPrices, type StockPriceChange } from './stockPriceChange'
import { actionCentreEntries, filterActionCentreEntries } from '@/features/action-center/domain/actionCentreEntries'
import { actionHistoryEntries } from '@/features/action-center/domain/actionHistoryEntries'

describe('stock price inputs and owner review feed', () => {
  it('converts exact rupees to integer paise and rejects invalid inputs', () => {
    expect(stockPricePaise('12.34')).toBe(1234)
    expect(stockPricePaise('0')).toBe(0)
    expect(stockPricePaise('', true)).toBeNull()
    for (const input of ['', '-1', '1.001', '1e3', 'Infinity', '9007199254740991']) expect(() => stockPricePaise(input)).toThrow()
  })
  it('requires an MRP and prevents selling above it while allowing equal prices', () => {
    expect(() => validateStockPrices({ mrpPaise: null, sellingPricePaise: 900 })).toThrow('Enter MRP')
    expect(() => validateStockPrices({ mrpPaise: 1000, sellingPricePaise: 1001 })).toThrow('greater than MRP')
    expect(() => validateStockPrices({ mrpPaise: 1000, sellingPricePaise: 1000 })).not.toThrow()
    expect(() => validateStockPrices({ mrpPaise: 0, sellingPricePaise: 0 })).not.toThrow()
  })
  const change: StockPriceChange = { id: 'stock-price-change', productId: 'p', barcode: '001', productName: 'Soap', before: { mrpPaise: 1000, sellingPricePaise: 900 }, after: { mrpPaise: 1200, sellingPricePaise: 1000 }, beforeRevision: 1, afterRevision: 2, actorUid: 'billing', actorName: 'Cashier', createdAt: '2026-10-12T01:00:00.000Z', reason: 'Fix wrong MRP', reviewStatus: 'pending' }
  it('includes applied changes in the pending count and searchable filters', () => {
    const entries = actionCentreEntries({ pending: [], recent: [], pendingCount: 0 }, [], [], [], [change])
    expect(entries[0].pending).toBe(true)
    expect(filterActionCentreEntries(entries, 'pending', 'stock-price', 'Cashier', '001 soap')).toHaveLength(1)
    expect(filterActionCentreEntries(entries, 'history', '', '', '')).toHaveLength(0)
  })
  it('moves reviewed changes into history without changing applied evidence', () => {
    const entries = actionHistoryEntries([{ kind: 'stock-price', value: { ...change, reviewStatus: 'reviewed', reviewedAt: '2026-10-12T02:00:00.000Z', reviewedByUid: 'owner' } }], [], {}, [])
    expect(filterActionCentreEntries(entries, 'history', 'stock-price', '', '')).toHaveLength(1)
    expect(entries[0].item).toMatchObject({ before: change.before, after: change.after })
  })
})
