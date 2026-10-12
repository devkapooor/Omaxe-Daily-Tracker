import { describe, expect, it } from 'vitest'
import { stockQueryEnabled, stockQueryPlan, type StockQueryFilters } from './stockQueryPlan'
const filters: StockQueryFilters = { search: '', stockStatus: '' }
describe('stock query ordering constraints', () => {
  it('keeps derived price sorts local with a stable server ordering', () => {
    for (const sort of ['mrpPaise', 'costPaise', 'marginPercent'] as const) expect(stockQueryPlan(filters, sort, true)).toMatchObject({ field: 'searchName', direction: 'asc', pageOnly: true })
  })
  it('orders quantity-range filters by quantity even with an exact barcode', () => {
    expect(stockQueryPlan({ ...filters, stockStatus: 'negative' }, 'sellingPricePaise', false).field).toBe('currentQuantity')
    expect(stockQueryPlan({ ...filters, search: '00010', stockStatus: 'negative' }, 'name', false).field).toBe('currentQuantity')
  })
  it('allows global selling-price sorting with a zero-stock equality filter', () => {
    expect(stockQueryPlan({ ...filters, stockStatus: 'zero' }, 'sellingPricePaise', true)).toMatchObject({ field: 'sellingPricePaise', direction: 'desc', pageOnly: false })
  })
  it('requires a barcode or specific stock status before loading', () => {
    expect(stockQueryEnabled(filters)).toBe(false)
    expect(stockQueryEnabled({ ...filters, search: '  ' })).toBe(false)
    expect(stockQueryEnabled({ ...filters, search: '00000' })).toBe(true)
    for (const stockStatus of ['positive', 'zero', 'negative']) expect(stockQueryEnabled({ ...filters, stockStatus })).toBe(true)
  })
})
