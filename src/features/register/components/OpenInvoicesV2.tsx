import { useState } from 'react'
import type { InvoiceBalanceV2, PurchaseV2 } from '@/domain/vendorLedgerV2'
import { stockMoney } from '@/features/stock/domain/currentStock'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'
import { FieldLabel } from '@/shared/ui/field-label'
import { invoiceView, type InvoiceSort } from '@/features/vendor-workspace/domain/invoiceView'

export function OpenInvoicesV2({ balances, onRecordPayment, vendorNameById, onViewInvoice }: {
  balances: (InvoiceBalanceV2 & { paidAmountPaise?: number })[]; vendorNameById: Record<string, string>
  onRecordPayment: (purchaseId: string, vendorId: string) => void; onViewInvoice?: (purchase: PurchaseV2) => void
}) {
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [sort, setSort] = useState<InvoiceSort>('date-desc')
  const invalidDates = Boolean(from && to && from > to)
  const visible = invalidDates ? [] : invoiceView(balances, vendorNameById, { search, from, to, sort })
  return <Card><CardHeader className="gap-2 sm:flex-row sm:items-center sm:justify-between"><h2 className="font-semibold">Invoices</h2><Input className="sm:max-w-xs" aria-label="Search invoices" placeholder="Vendor name or invoice number" value={search} onChange={event => setSearch(event.target.value)} /></CardHeader><CardContent className="pt-0"><div className="mb-2 flex flex-wrap items-end gap-2"><FieldLabel label="Invoice date from"><Input type="date" value={from} onChange={event => setFrom(event.target.value)} /></FieldLabel><FieldLabel label="Invoice date to"><Input type="date" value={to} onChange={event => setTo(event.target.value)} /></FieldLabel><FieldLabel label="Sort invoices"><select className="h-9 rounded-md border bg-card px-3 text-sm" value={sort} onChange={event => setSort(event.target.value as InvoiceSort)}><option value="date-desc">Date · newest first</option><option value="date-asc">Date · oldest first</option><option value="name-asc">Vendor name · A–Z</option><option value="name-desc">Vendor name · Z–A</option><option value="total-desc">Invoice total · high to low</option><option value="total-asc">Invoice total · low to high</option><option value="due-desc">Amount due · high to low</option><option value="due-asc">Amount due · low to high</option></select></FieldLabel><Button type="button" size="sm" variant="ghost" onClick={() => { setFrom(''); setTo(''); setSearch(''); setSort('date-desc') }}>Clear filters</Button><span className="pb-2 text-xs text-muted-foreground">{visible.length} invoices</span></div>{invalidDates ? <p role="alert" className="text-sm text-destructive">From date must be on or before To date.</p> : null}<div className="divide-y">
    {!visible.length ? <p className="py-4 text-sm text-muted-foreground">No matching invoices.</p> : visible.map(({ purchase, openAmountPaise, reservedAmountPaise, availableToAllocatePaise, paidAmountPaise }) => <article key={purchase.id} role="button" tabIndex={0} aria-label={`View invoice ${purchase.invoiceNumber}`} className="flex min-h-12 cursor-pointer flex-wrap items-center justify-between gap-2 py-2 text-sm hover:bg-secondary/40 focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onViewInvoice?.(purchase)} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onViewInvoice?.(purchase) } }}>
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"><strong>{vendorNameById[purchase.vendorId] ?? 'Unknown vendor'}</strong><span className="text-muted-foreground">| {purchase.invoiceNumber} | {purchase.invoiceDate} | Total {stockMoney(purchase.invoiceTotalPaise)} | Paid {stockMoney(paidAmountPaise ?? purchase.invoiceTotalPaise - openAmountPaise)} |</span><strong>Due {stockMoney(openAmountPaise)}</strong>{reservedAmountPaise > 0 ? <small>Reserved {stockMoney(reservedAmountPaise)}</small> : null}{purchase.shortage?.state === 'pending' ? <small className="text-amber-700">Credit note awaited</small> : null}</span>
      <span className="flex shrink-0 gap-1"><Button size="sm" variant="outline" disabled={availableToAllocatePaise <= 0} onClick={event => { event.stopPropagation(); onRecordPayment(purchase.id, purchase.vendorId) }}>Make Payment</Button><Button size="sm" variant="outline" onClick={event => { event.stopPropagation(); onViewInvoice?.(purchase) }}>View GRN</Button></span>
    </article>)}
  </div></CardContent></Card>
}
