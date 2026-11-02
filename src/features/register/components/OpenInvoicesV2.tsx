import { useState } from 'react'
import type { InvoiceBalanceV2, PurchaseV2 } from '@/domain/vendorLedgerV2'
import { stockMoney } from '@/features/stock/domain/currentStock'
import { Button } from '@/shared/ui/button'
import { Badge } from '@/shared/ui/badge'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'
import { FieldLabel } from '@/shared/ui/field-label'
import { NativeSelect } from '@/shared/ui/native-select'
import { invoiceView, isHistoricalInvoice, type InvoicePeriod, type InvoiceSort } from '@/features/vendor-workspace/domain/invoiceView'

type InvoiceRow = InvoiceBalanceV2 & { paidAmountPaise?: number }
type Props = {
  balances: InvoiceRow[]
  vendorNameById: Record<string, string>
  onRecordPayment: (purchaseId: string, vendorId: string) => void
  onViewInvoice?: (purchase: PurchaseV2) => void
}

function InvoiceActions({ row, onRecordPayment, onViewInvoice }: Pick<Props, 'onRecordPayment' | 'onViewInvoice'> & { row: InvoiceRow }) {
  return <div className="flex justify-end gap-1">
    <Button size="sm" variant="outline" className="h-8 px-2 text-xs" disabled={isHistoricalInvoice(row) || row.availableToAllocatePaise <= 0} onClick={event => { event.stopPropagation(); onRecordPayment(row.purchase.id, row.purchase.vendorId) }}>Make Payment</Button>
    {onViewInvoice ? <Button size="sm" variant="outline" className="h-8 px-2 text-xs" onClick={event => { event.stopPropagation(); onViewInvoice(row.purchase) }}>View GRN</Button> : null}
  </div>
}

export function OpenInvoicesV2({ balances, onRecordPayment, vendorNameById, onViewInvoice }: Props) {
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [sort, setSort] = useState<InvoiceSort>('date-desc')
  const [period, setPeriod] = useState<InvoicePeriod>('current')
  const invalidDates = Boolean(from && to && from > to)
  const visible = invalidDates ? [] : invoiceView(balances, vendorNameById, { search, from, to, sort, period })
  const historicalCount = balances.filter(isHistoricalInvoice).length
  const noCurrentInvoices = period === 'current' && !search && !from && !to && historicalCount > 0

  function changePeriod(value: InvoicePeriod) {
    setPeriod(value)
    if (value === 'historical' && sort.startsWith('due-')) setSort('date-desc')
  }

  return <Card className="w-full min-w-0">
    <CardHeader className="gap-2 p-3">
      <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">Invoices</h2><span role="status" className="text-xs text-muted-foreground">{visible.length} {visible.length === 1 ? 'invoice' : 'invoices'}</span></div>
      <div className="grid grid-cols-2 items-end gap-2 xl:grid-cols-[minmax(180px,1fr)_140px_140px_140px_180px_auto]">
        <FieldLabel className="col-span-2 xl:col-span-1" label="Search"><Input aria-label="Search invoices" placeholder="Vendor or invoice number" value={search} onChange={event => setSearch(event.target.value)} /></FieldLabel>
        <FieldLabel label="Show"><NativeSelect aria-label="Invoice period" value={period} onChange={event => changePeriod(event.target.value as InvoicePeriod)}><option value="current">Current period</option><option value="historical">Before reset</option><option value="all">All invoices</option></NativeSelect></FieldLabel>
        <FieldLabel label="From"><Input aria-label="Invoice date from" type="date" value={from} onChange={event => setFrom(event.target.value)} /></FieldLabel>
        <FieldLabel label="To"><Input aria-label="Invoice date to" type="date" value={to} onChange={event => setTo(event.target.value)} /></FieldLabel>
        <FieldLabel label="Sort"><NativeSelect aria-label="Sort invoices" value={sort} onChange={event => setSort(event.target.value as InvoiceSort)}><option value="date-desc">Date: newest first</option><option value="date-asc">Date: oldest first</option><option value="name-asc">Vendor: A-Z</option><option value="name-desc">Vendor: Z-A</option><option value="total-desc">Total: high to low</option><option value="total-asc">Total: low to high</option>{period !== 'historical' ? <option value="due-desc">Due: high to low</option> : null}{period !== 'historical' ? <option value="due-asc">Due: low to high</option> : null}</NativeSelect></FieldLabel>
        <Button type="button" size="sm" variant="ghost" className="h-9" onClick={() => { setFrom(''); setTo(''); setSearch(''); setSort('date-desc'); setPeriod('current') }}>Clear filters</Button>
      </div>
    </CardHeader>
    <CardContent className="min-w-0 px-3 pb-3 pt-0">
      {invalidDates ? <p role="alert" className="pb-2 text-sm text-destructive">From date must be on or before To date.</p> : null}
      {period !== 'current' && historicalCount > 0 ? <p className="mb-2 text-xs text-muted-foreground">Before-reset invoices are retained for reference and excluded from current payables.</p> : null}
      <div className="max-w-full overflow-x-auto rounded border border-border">
        <table aria-label="Vendor invoices" className="w-full min-w-[860px] text-left text-sm">
          <thead className="border-b bg-secondary/40 text-xs text-muted-foreground"><tr><th scope="col" className="px-3 py-2 font-medium">Vendor</th><th scope="col" className="px-2 py-2 font-medium">Invoice</th><th scope="col" className="px-2 py-2 font-medium">Date</th><th scope="col" className="px-2 py-2 text-right font-medium">Total</th><th scope="col" className="px-2 py-2 text-right font-medium">Paid</th><th scope="col" className="px-2 py-2 text-right font-medium">{period === 'historical' ? 'Balance at reset' : 'Due'}</th><th scope="col" className="px-3 py-2 text-right font-medium">Actions</th></tr></thead>
          <tbody className="divide-y divide-border">{visible.map(row => {
            const { purchase, openAmountPaise, reservedAmountPaise } = row
            const historical = isHistoricalInvoice(row)
            // Reset does not mean paid. Never infer historical payments from the reset-to-zero current balance.
            const paid = row.paidAmountPaise ?? (historical ? undefined : purchase.invoiceTotalPaise - openAmountPaise)
            const due = historical ? period === 'historical' ? row.cutoverOpenAmountPaise : undefined : openAmountPaise
            return <tr key={purchase.id} className={onViewInvoice ? 'cursor-pointer hover:bg-secondary/30' : ''} onClick={() => onViewInvoice?.(purchase)}>
              <td className="min-w-40 max-w-64 break-words px-3 py-2 font-medium">{vendorNameById[purchase.vendorId] ?? 'Unknown vendor'}</td>
              <td className="px-2 py-2"><div className="flex flex-wrap items-center gap-1.5">{onViewInvoice ? <button type="button" aria-label={`View invoice ${purchase.invoiceNumber}`} className="font-medium text-primary underline-offset-2 hover:underline focus-visible:rounded focus-visible:outline-2 focus-visible:outline-ring" onClick={event => { event.stopPropagation(); onViewInvoice(purchase) }}>{purchase.invoiceNumber}</button> : <span>{purchase.invoiceNumber}</span>}{historical ? <Badge variant="secondary" className="px-1 py-0 text-[10px]" title={row.balanceCutoverDate ? `Reset on ${row.balanceCutoverDate}` : 'Excluded from current payable'}>Historical</Badge> : null}</div>{purchase.shortage?.state === 'pending' ? <span className="mt-0.5 block text-[11px] text-amber-700 dark:text-amber-300">Credit note awaited</span> : null}</td>
              <td className="whitespace-nowrap px-2 py-2 text-xs text-muted-foreground">{purchase.invoiceDate}</td>
              <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{stockMoney(purchase.invoiceTotalPaise)}</td>
              <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{paid === undefined ? '—' : stockMoney(paid)}</td>
              <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums"><strong>{due === undefined ? '—' : stockMoney(due)}</strong>{!historical && reservedAmountPaise > 0 ? <span className="block text-[11px] text-muted-foreground">Reserved {stockMoney(reservedAmountPaise)}</span> : null}</td>
              <td className="px-3 py-2"><InvoiceActions row={row} onRecordPayment={onRecordPayment} onViewInvoice={onViewInvoice} /></td>
            </tr>
          })}</tbody>
        </table>
        {!visible.length ? <div className="p-5 text-sm text-muted-foreground"><p>{noCurrentInvoices ? 'No current-period invoices.' : 'No matching invoices.'}</p>{noCurrentInvoices ? <p className="mt-1 text-xs">Choose Before reset to view older invoices.</p> : null}</div> : null}
      </div>
      {visible.length ? <p className="mt-1.5 text-[11px] text-muted-foreground sm:hidden">Swipe to view amounts and actions.</p> : null}
    </CardContent>
  </Card>
}
