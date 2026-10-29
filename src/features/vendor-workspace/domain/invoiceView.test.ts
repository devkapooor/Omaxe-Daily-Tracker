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
})
