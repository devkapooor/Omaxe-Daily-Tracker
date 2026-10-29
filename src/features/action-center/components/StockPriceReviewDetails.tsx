import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/shared/ui/button'
import { stockDate, stockMoney } from '@/features/stock/domain/currentStock'
import type { ActionCentreEntry } from '../domain/actionCentreEntries'
import { readSource } from '@/features/stock/data/stockQueries'
import { SourceRecord } from '@/features/stock/components/StockSourceDetails'
import { BusinessReference } from '@/shared/businessReferences'
import { AuditDetails } from '@/shared/ui/audit-details'

export function StockPriceReviewDetails({ entry, busy, error, unavailable, onClose, onReview }: { entry: Extract<ActionCentreEntry, { source: 'stock-price' }>; busy: boolean; error: string | null; unavailable: boolean; onClose: () => void; onReview: () => Promise<boolean> }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [confirming, setConfirming] = useState(false)
  const [source, setSource] = useState<Record<string, unknown> | null>(null)
  const [sourceError, setSourceError] = useState('')
  const [sourceBusy, setSourceBusy] = useState(false)
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close() }, [])
  const record = entry.item
  async function openSource() {
    if (!record.sourceRecordId) return
    setSourceBusy(true); setSourceError('')
    try { const value = await readSource<Record<string, unknown>>('goodsReceipts', record.sourceRecordId); if (!value) throw new Error('GRN source unavailable.'); setSource(value) }
    catch (error) { setSourceError(error instanceof Error ? error.message : 'Unable to open source.') }
    finally { setSourceBusy(false) }
  }
  return createPortal(<dialog ref={dialog} aria-labelledby="stock-price-review-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose() }} className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-2xl overflow-y-auto rounded-lg border border-border bg-card p-4 text-foreground shadow-xl backdrop:bg-black/50">
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3"><div><h2 id="stock-price-review-title" className="text-lg font-semibold">Stock Price Change · <BusinessReference prefix="PRICE" id={record.id}/></h2><p className="text-sm text-muted-foreground">{record.barcode} · {record.productName}</p></div><Button variant="outline" disabled={busy} onClick={onClose}>Close</Button></div>
      <p className="text-sm font-medium">{entry.pending ? 'Applied · Awaiting Your Review' : 'Applied · Reviewed'}</p>
      {record.beforeRecordedValues ? <div className="text-xs text-muted-foreground"><p>Some previous prices were unavailable or invalid.</p>{record.before.mrpPaise === null ? <p>Saved MRP value: {record.beforeRecordedValues.mrp ?? 'Not recorded'}</p> : null}{record.before.sellingPricePaise === null ? <p>Saved selling value (paise): {record.beforeRecordedValues.selling ?? 'Not recorded'}</p> : null}</div> : null}
      {record.sourceRecordId ? <div className="grid gap-2 text-sm"><p>{record.sourceKind === 'goods-receipt-reversal' ? 'GRN reversal' : 'Receive Stock'} · <BusinessReference prefix="GRN" id={record.sourceRecordId}/></p><Button variant="outline" disabled={sourceBusy} onClick={() => void openSource()}>{sourceBusy ? 'Opening source…' : 'Open GRN source'}</Button>{sourceError ? <p role="alert">{sourceError}</p> : null}{source ? <SourceRecord title="Goods receipt source" value={source} /> : null}</div> : null}
      <dl className="grid gap-3 sm:grid-cols-2"><div><dt className="text-xs text-muted-foreground">Changed By</dt><dd>{record.actorName}</dd></div><div><dt className="text-xs text-muted-foreground">Changed At</dt><dd>{stockDate(record.createdAt)}</dd></div><div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Reason</dt><dd className="whitespace-pre-wrap break-words">{record.reason}</dd></div></dl>
      <table className="w-full text-left text-sm"><thead><tr className="border-b border-border"><th className="p-2">Field</th><th className="p-2">Before</th><th className="p-2">Applied</th></tr></thead><tbody>{(['mrpPaise', 'sellingPricePaise'] as const).map((field) => <tr key={field} className="border-b border-border"><th className="p-2 font-medium">{field === 'mrpPaise' ? 'MRP' : 'Selling Price'}</th><td className="p-2">{stockMoney(record.before[field])}</td><td className={`p-2 ${record.before[field] !== record.after[field] ? 'font-semibold text-primary' : ''}`}>{stockMoney(record.after[field])}</td></tr>)}</tbody></table>
      <p className="text-xs text-muted-foreground">These prices were applied when saved. Reviewing acknowledges this change and keeps the product's current prices.</p>
      {record.reviewedAt ? <p className="text-sm">Reviewed by {record.reviewedByName || 'Owner'} · {stockDate(record.reviewedAt)}</p> : null}
      <AuditDetails><dl className="grid gap-3 sm:grid-cols-2"><div><dt className="text-xs text-muted-foreground">Changed by user ID</dt><dd className="break-all font-mono text-xs">{record.actorUid}</dd></div>{record.reviewedByUid ? <div><dt className="text-xs text-muted-foreground">Reviewer user ID</dt><dd className="break-all font-mono text-xs">{record.reviewedByUid}</dd></div> : null}</dl></AuditDetails>
      {error || unavailable ? <p role="alert" className="text-sm text-destructive">{error || 'This record is no longer in the pending queue. Reopen its history entry.'}</p> : null}
      {confirming ? <p className="text-sm">Confirm that you have reviewed the recorded change.</p> : null}
      <div className="flex justify-end gap-2">{entry.pending ? confirming ? <><Button disabled={busy} variant="outline" onClick={() => setConfirming(false)}>Back</Button><Button disabled={busy || unavailable} onClick={() => void onReview()}>{busy ? 'Saving…' : 'Confirm Reviewed'}</Button></> : <Button disabled={busy || unavailable} onClick={() => setConfirming(true)}>Mark Reviewed</Button> : <Button variant="outline" onClick={onClose}>Done</Button>}</div>
    </div>
  </dialog>, document.body)
}
