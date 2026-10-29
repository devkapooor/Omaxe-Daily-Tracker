import type { InvoiceBalanceV2 } from '@/domain/vendorLedgerV2'
export type InvoiceSort = 'date-desc' | 'date-asc' | 'name-asc' | 'name-desc' | 'total-desc' | 'total-asc' | 'due-desc' | 'due-asc'
export function invoiceView<T extends InvoiceBalanceV2>(rows: T[], names: Record<string, string>, filters: { search: string; from: string; to: string; sort: InvoiceSort }): T[] {
  const terms = filters.search.trim().toLocaleLowerCase('en-IN').split(/\s+/).filter(Boolean)
  return rows.filter(row => (!filters.from || row.purchase.invoiceDate >= filters.from) && (!filters.to || row.purchase.invoiceDate <= filters.to) && terms.every(term => [names[row.purchase.vendorId], row.purchase.invoiceNumber].join(' ').toLocaleLowerCase('en-IN').includes(term))).sort((a, b) => {
    const name = () => (names[a.purchase.vendorId] ?? '').localeCompare(names[b.purchase.vendorId] ?? '', 'en-IN', { sensitivity: 'base' })
    const value = filters.sort === 'name-asc' ? name() : filters.sort === 'name-desc' ? -name() : filters.sort === 'date-asc' ? a.purchase.invoiceDate.localeCompare(b.purchase.invoiceDate) : filters.sort === 'date-desc' ? b.purchase.invoiceDate.localeCompare(a.purchase.invoiceDate) : filters.sort === 'total-asc' ? a.purchase.invoiceTotalPaise - b.purchase.invoiceTotalPaise : filters.sort === 'total-desc' ? b.purchase.invoiceTotalPaise - a.purchase.invoiceTotalPaise : filters.sort === 'due-asc' ? a.openAmountPaise - b.openAmountPaise : b.openAmountPaise - a.openAmountPaise
    return value || a.purchase.id.localeCompare(b.purchase.id)
  })
}
