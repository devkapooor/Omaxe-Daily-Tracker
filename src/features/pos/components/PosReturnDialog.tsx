import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AppUser } from '@/domain/financeTypes'
import type { PosBill } from '../domain/types'
import { pendingRefund, postPosReturn, quotePosReturn, type ReturnQuote, type ReturnSelection } from '../data/refundRepository'
import { Button } from '@/shared/ui/button'
import { FieldLabel } from '@/shared/ui/field-label'
import { Input } from '@/shared/ui/input'
import { NativeSelect } from '@/shared/ui/native-select'
import { StatusPanel } from '@/shared/ui/status-panel'
import { useReceiptDialog } from './useReceiptDialog'

const money = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
export function PosReturnDialog({ bill, actor, onClose, showToast }: { bill: PosBill; actor: AppUser; onClose: () => void; showToast: (message: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [source, setSource] = useState<ReturnQuote | null>(null), [quote, setQuote] = useState<ReturnQuote | null>(null)
  const [quantities, setQuantities] = useState<Record<string, string>>({}), [condition, setCondition] = useState<'sellable' | 'damaged'>('sellable')
  const [reason, setReason] = useState(''), [error, setError] = useState(''), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [confirming, setConfirming] = useState(false), [refresh, setRefresh] = useState(0)
  const [quoteKey, setQuoteKey] = useState('')
  useReceiptDialog(dialog)
  const serialized = JSON.stringify(quantities)
  const requestKey = JSON.stringify([actor.id, bill.id, condition, serialized, refresh])
  const isLoading = loading || quoteKey !== requestKey
  useEffect(() => {
    let live = true
    const values = JSON.parse(serialized) as Record<string, string>
    const invalid = Object.values(values).some(raw => raw !== '' && (!Number.isSafeInteger(Number(raw)) || Number(raw) < 0))
    const selection: ReturnSelection = { billId: bill.id, returnCondition: condition, returnLines: Object.entries(values).filter(([, raw]) => Number(raw) > 0).map(([lineId, raw]) => ({ lineId, quantity: Number(raw) })) }
    const timer = window.setTimeout(() => {
      setQuote(null); setConfirming(false)
      if (invalid) { setQuoteKey(requestKey); setLoading(false); setError('Return quantities must be non-negative whole numbers.'); return }
      setLoading(true); setError('')
      void quotePosReturn(selection, { id: actor.id }).then(result => { if (live) { setSource(result); setQuote(result); setQuoteKey(requestKey); setLoading(false) } }, cause => { if (live) { setQuoteKey(requestKey); setError(cause instanceof Error ? cause.message : 'Unable to calculate the return.'); setLoading(false) } })
    }, Object.keys(values).length ? 180 : 0)
    return () => { live = false; clearTimeout(timer) }
  }, [actor.id, bill.id, condition, serialized, requestKey])
  async function complete() {
    if (!quote?.selected.length || isLoading || busy) return
    setBusy(true); setError('')
    try {
      const result = await postPosReturn({ operationId: crypto.randomUUID(), billId: bill.id, returnCondition: condition, returnLines: quote.selected.map(item => ({ lineId: item.lineId, quantity: item.quantity })), reason, refundMethod: 'cash', refundAmountPaise: quote.refundPaise, sourceBillRevision: quote.sourceBillRevision, businessDate: quote.businessDate, confirmationHash: quote.confirmationHash }, actor)
      showToast(`Return completed. ${money(result.refundAmountPaise ?? 0)} cash refund recorded; owner notified.`)
      onClose()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Unable to confirm the refund. Preserve this tab.'
      setError(message); setConfirming(false)
      try { if (pendingRefund(actor.id)) { showToast('Refund result is uncertain. Recover the same operation before continuing.'); onClose() } }
      catch { window.dispatchEvent(new Event('refund-operation-change')); onClose() }
    } finally { setBusy(false) }
  }
  const canPost = !isLoading && !!quote?.selected.length && !!reason.trim() && !error && !busy
  const mappedQuantity = quote?.selected.reduce((sum, line) => sum + (bill.lines.find(item => item.id === line.lineId)?.kind === 'product' ? line.quantity : 0), 0) ?? 0
  return createPortal(<dialog ref={dialog} aria-labelledby="pos-return-title" onCancel={event => { event.preventDefault(); if (!busy) onClose() }} className="m-auto max-h-[92dvh] w-[calc(100%_-_1.5rem)] max-w-3xl overflow-hidden rounded-lg border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-slate-950/40">
    <div className="flex max-h-[92dvh] flex-col">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b p-4"><div><h2 id="pos-return-title" className="text-lg font-bold">Return items · {bill.receiptNumber}</h2><p className="text-xs text-muted-foreground">Cash refunds post immediately. Owner review is informational.</p></div><Button variant="outline" disabled={busy} onClick={onClose}>Close</Button></header>
      <div className="grid min-h-0 gap-3 overflow-y-auto p-4">
        {error ? <StatusPanel variant="destructive"><p role="alert">{error}</p><Button size="sm" variant="outline" disabled={busy || isLoading} onClick={() => setRefresh(value => value + 1)}>Refresh return quote</Button></StatusPanel> : null}
        {isLoading ? <p role="status" className="text-sm text-muted-foreground">Calculating original bill refund…</p> : null}
        <fieldset disabled={busy || confirming} className="grid gap-3">
          {source?.lines.map(line => <div key={line.lineId} className="flex items-center justify-between gap-3 rounded border p-3 text-sm"><div className="min-w-0"><strong className="block break-words">{line.description}</strong><span className="block font-mono text-xs text-muted-foreground">{line.barcode || 'Barcode not recorded'}</span>{bill.lines.find(item => item.id === line.lineId)?.kind === 'temporary' ? <span className="block text-xs text-amber-700">Historical unmapped item: No stock record</span> : null}<span className="text-xs text-muted-foreground">Billed {line.billedQuantity} · Returned {line.returnedQuantity} · Available {line.remainingQuantity}</span></div><FieldLabel className="shrink-0" label="Return qty"><Input aria-label={`Return quantity for ${line.description}`} className="w-20" type="number" min="0" max={line.remainingQuantity} step="1" disabled={line.remainingQuantity === 0 || busy} value={quantities[line.lineId] ?? ''} placeholder="0" onChange={event => setQuantities(current => ({ ...current, [line.lineId]: event.target.value }))} /></FieldLabel></div>)}
          {source && source.lines.every(line => line.remainingQuantity === 0) ? <StatusPanel>All billed items have already been returned.</StatusPanel> : null}
          <div className="grid gap-3 rounded border bg-secondary/25 p-3 sm:grid-cols-2">
            <FieldLabel label="Return condition"><NativeSelect value={condition} onChange={event => setCondition(event.target.value as typeof condition)}><option value="sellable">Sellable (restore mapped stock)</option><option value="damaged">Damaged (no stock)</option></NativeSelect></FieldLabel>
            <FieldLabel label="Refund amount"><Input aria-label="Refund amount" readOnly value={isLoading ? 'Calculating…' : quote ? (quote.refundPaise / 100).toFixed(2) : 'Unavailable'} /></FieldLabel>
            <div className="text-sm"><strong>Payment method: Cash</strong><p className="text-xs text-muted-foreground">Original bill prices after discounts · {quote?.businessDate ?? source?.businessDate ?? 'Posting date loading'}</p></div>
            <FieldLabel label="Mandatory return reason"><Input value={reason} onChange={event => setReason(event.target.value)} /></FieldLabel>
          </div>
        </fieldset>
        {confirming && quote ? <StatusPanel variant="warning"><p>Confirm {money(quote.refundPaise)} cash paid back for {quote.selected.reduce((sum, line) => sum + line.quantity, 0)} items. {condition === 'sellable' ? `${mappedQuantity} mapped units will be restored. Historical unmapped items have no stock record.` : 'Damaged items do not restore stock.'} {quote.refundPaise ? 'One linked cash expense will be recorded.' : 'No cash paid.'} Owner approval is not required.</p></StatusPanel> : null}
      </div>
      <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t p-4">{confirming ? <><Button variant="outline" disabled={busy} onClick={() => setConfirming(false)}>Back</Button><Button disabled={busy || !canPost} onClick={() => void complete()}>{busy ? 'Posting return…' : 'Confirm cash return'}</Button></> : <Button disabled={!canPost} onClick={() => setConfirming(true)}>Complete return</Button>}</footer>
    </div>
  </dialog>, document.body)
}
