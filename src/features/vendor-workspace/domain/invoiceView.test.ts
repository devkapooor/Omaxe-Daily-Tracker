import { describe, expect, it } from 'vitest'
import { invoiceView, type InvoiceSort } from './invoiceView'
import type { InvoiceBalanceV2 } from '@/domain/vendorLedgerV2'

const row = (id: string, vendorId: string, date: string, total: number, due: number) => ({
  purchase: { id, vendorId, invoiceDate: date, invoiceNumber: `INV-${id}`, invoiceTotalPaise: total },
  openAmountPaise: due,
} as InvoiceBalanceV2)
const rows = [row('a', 'v1', '2026-10-01', 3000, 500), row('b', 'v2', '2026-10-20', 1000, 1000), row('c', 'v1', '2026-10-10', 2000, 0)]
const names = { v1: 'Alpha Stores', v2: 'Beta Shop' }

describe('vendor invoice view filters and sorting', () => {
  it.each<[InvoiceSort, string[]]>([
    ['date-desc', ['b', 'c', 'a']], ['date-asc', ['a', 'c', 'b']],
    ['name-asc', ['a', 'c', 'b']], ['name-desc', ['b', 'a', 'c']],
    ['total-desc', ['a', 'c', 'b']], ['total-asc', ['b', 'c', 'a']],
    ['due-desc', ['b', 'a', 'c']], ['due-asc', ['c', 'a', 'b']],
  ])('sorts by %s in both directions as requested', (sort, expected) => {
    expect(invoiceView(rows, names, { search: '', from: '', to: '', sort }).map(item => item.purchase.id)).toEqual(expected)
  })
  it('uses inclusive invoice-date boundaries and searches vendor and supplier invoice number', () => {
    expect(invoiceView(rows, names, { search: 'alpha inv-c', from: '2026-10-10', to: '2026-10-10', sort: 'date-desc' }).map(item => item.purchase.id)).toEqual(['c'])
    expect(invoiceView(rows, names, { search: '', from: '2026-10-11', to: '2026-10-19', sort: 'date-desc' })).toEqual([])
  })
  it('separates current and before-reset invoices by recorded status, including invoices on the same date', () => {
    const current = row('current', 'v1', '2026-10-20', 10000, 4000)
    const historical = { ...row('historical', 'v1', '2026-10-20', 20000, 0), cutoverStatus: 'historical' as const, cutoverOpenAmountPaise: 12000 }
    const purchaseFlag = row('flagged', 'v2', '2026-10-20', 30000, 0)
    purchaseFlag.purchase.cutoverHistoricalOnly = true
    const mixed = [historical, current, purchaseFlag], original = structuredClone(mixed)
    const filters = { search: '', from: '', to: '', sort: 'date-desc' as const }
    expect(invoiceView(mixed, names, { ...filters, period: 'current' }).map(item => item.purchase.id)).toEqual(['current'])
    expect(invoiceView(mixed, names, { ...filters, period: 'historical' }).map(item => item.purchase.id)).toEqual(['flagged', 'historical'])
    expect(invoiceView(mixed, names, { ...filters, period: 'all' })).toHaveLength(3)
    expect(invoiceView(mixed, names, { ...filters, period: 'historical', search: 'alpha', from: '2026-10-20', to: '2026-10-20' }).map(item => item.purchase.id)).toEqual(['historical'])
    expect(mixed).toEqual(original)
  })
})
