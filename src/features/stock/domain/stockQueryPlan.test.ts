import { describe, expect, it } from 'vitest'
import { stockQueryPlan, type StockQueryFilters } from './stockQueryPlan'
const filters: StockQueryFilters = { search: '', searchMode: 'barcode', vendor: '', stockStatus: '' }
describe('stock query ordering constraints', () => {
  it('keeps derived price sorts local with a stable server ordering', () => {
    for (const sort of ['mrpPaise', 'costPaise', 'marginPercent'] as const) expect(stockQueryPlan(filters, sort, true)).toMatchObject({ field: 'searchName', direction: 'asc', pageOnly: true })
  })
  it('orders quantity-range filters by quantity and prefix queries by name', () => {
    expect(stockQueryPlan({ ...filters, stockStatus: 'negative' }, 'sellingPricePaise', false).field).toBe('currentQuantity')
    expect(stockQueryPlan({ ...filters, search: 'soap', searchMode: 'name', stockStatus: 'negative' }, 'currentQuantity', false).field).toBe('searchName')
  })
  it('allows global selling-price sorting with a zero-stock equality filter', () => {
    expect(stockQueryPlan({ ...filters, stockStatus: 'zero' }, 'sellingPricePaise', true)).toMatchObject({ field: 'sellingPricePaise', direction: 'desc', pageOnly: false })
  })
})
