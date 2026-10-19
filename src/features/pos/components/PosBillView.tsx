import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatDisplayDateTime } from '@/app/uiHelpers'
import { Button } from '@/shared/ui/button'
import { StatusPanel } from '@/shared/ui/status-panel'
import { loadPosApprovalSource } from '../data/posRepository'
import type { PosBill, PosBillState } from '../domain/types'
import { printPosReceipt } from './receipt'
import { useReceiptDialog } from './useReceiptDialog'

const money = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) ? `₹${(value / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Not recorded'
export function PosBillView({ bill, onClose }: { bill: PosBill; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), [state, setState] = useState<PosBillState | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [refresh, setRefresh] = useState(0)
  useReceiptDialog(dialog, `View bill ${bill.receiptNumber}`)
  useEffect(() => {
    let live = true
    void loadPosApprovalSource(bill.id, bill).then(result => { if (live) { setState(result.state); setLoading(false) } }, cause => { if (live) { setLoading(false); setError(cause instanceof Error ? cause.message : 'Unable to load current return state.') } })
    return () => { live = false }
  }, [bill, refresh])
  return createPortal(<dialog ref={dialog} aria-labelledby="bill-view-title" onCancel={event => { event.preventDefault(); onClose() }} className="m-auto max-h-[92dvh] w-[calc(100%_-_1.5rem)] max-w-3xl overflow-hidden rounded-lg border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-slate-950/40"><div className="flex max-h-[92dvh] flex-col">
    <header className="flex shrink-0 items-start justify-between gap-3 border-b p-4"><div><h2 id="bill-view-title" className="text-lg font-bold">View bill · {bill.receiptNumber}</h2><p className="text-xs text-muted-foreground">Read-only saved receipt</p></div><Button variant="outline" onClick={onClose}>Close</Button></header>
    <div className="grid min-h-0 gap-4 overflow-y-auto p-4">
      <dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">Date</dt><dd>{bill.createdAt ? formatDisplayDateTime(bill.createdAt) : 'Not recorded'}</dd></div><div><dt className="text-muted-foreground">Billed by</dt><dd>{bill.createdByName || 'Not recorded'}<span className="block text-xs text-muted-foreground">{bill.createdByUid || 'UID not recorded'}</span></dd></div>{bill.customerName ? <div><dt className="text-muted-foreground">Customer</dt><dd>{bill.customerName}</dd></div> : null}<div><dt className="text-muted-foreground">Current state</dt><dd>{loading ? 'Loading…' : state?.state === 'voided' ? 'Voided (historical)' : state?.state === 'partially-returned' ? 'Returned items recorded' : state ? 'Active' : 'Unavailable'}</dd></div></dl>
      {error ? <StatusPanel variant="destructive"><p role="alert">{error}</p><Button size="sm" variant="outline" onClick={() => { setLoading(true); setError(''); setRefresh(value => value + 1) }}>Retry bill state</Button></StatusPanel> : null}
      <div className="overflow-x-auto rounded border"><table className="w-full text-left text-sm"><thead className="bg-secondary/30"><tr><th className="p-2">Item</th><th className="p-2 text-right">Billed</th><th className="p-2 text-right">Returned</th><th className="p-2 text-right">Price</th><th className="p-2 text-right">Gross</th></tr></thead><tbody>{bill.lines.map(line => <tr key={line.id} className="border-t"><td className="p-2"><strong className="block break-words">{line.description}</strong><span className="font-mono text-xs text-muted-foreground">{line.barcode || 'Barcode not recorded'}</span></td><td className="p-2 text-right">{line.quantity}</td><td className="p-2 text-right">{loading ? '…' : state ? state.returnedQuantities?.[line.id] ?? 0 : 'Unavailable'}</td><td className="p-2 text-right">{money(line.unitPricePaise)}</td><td className="p-2 text-right">{money(line.quantity * line.unitPricePaise)}</td></tr>)}</tbody></table></div>
      <dl className="grid grid-cols-2 gap-2 text-sm"><dt>Subtotal</dt><dd className="text-right">{money(bill.subtotalPaise)}</dd><dt>Discount</dt><dd className="text-right">{money(bill.discount?.amountPaise)}</dd><dt className="font-bold">Original bill total</dt><dd className="text-right font-bold">{money(bill.totalPaise)}</dd></dl>
      <div className="grid gap-1 rounded border p-3 text-sm"><strong>Original payments</strong>{bill.payments.map((payment, index) => <p key={index}>{({ cash: 'Cash', upi: 'UPI', card: 'Card', 'bank-transfer': 'Bank transfer' })[payment.method]}: {money(payment.amountPaise)}{payment.reference ? ` · ${payment.reference}` : ''}</p>)}{bill.cashTenderedPaise !== undefined ? <p>Cash tendered: {money(bill.cashTenderedPaise)} · Change: {money(bill.cashChangePaise)}</p> : null}</div>
    </div><footer className="flex shrink-0 justify-end gap-2 border-t p-4"><Button variant="outline" onClick={() => printPosReceipt(bill, 'thermal')}>Reprint</Button><Button onClick={onClose}>Done</Button></footer>
  </div></dialog>, document.body)
}
