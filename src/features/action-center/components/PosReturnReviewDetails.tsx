import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { doc, getDocFromServer } from 'firebase/firestore'
import { db } from '@/shared/lib/firebase'
import { formatDisplayDateTime, money } from '@/app/uiHelpers'
import { Button } from '@/shared/ui/button'
import { StatusPanel } from '@/shared/ui/status-panel'
import type { ActionCentreEntry } from '../domain/actionCentreEntries'
import type { PosReviewSource } from '../domain/actionCentreReview'
import { useReceiptDialog } from '@/features/pos/components/useReceiptDialog'

export function PosReturnReviewDetails({ entry, busy, unavailable, error, onClose, onReview, loadSource }: { entry: Extract<ActionCentreEntry, { source: 'pos' }>; busy: boolean; unavailable: boolean; error: string | null; onClose: () => void; onReview: () => Promise<boolean>; loadSource: (id: string, refresh?: boolean, revision?: number) => Promise<PosReviewSource> }) {
  const dialog = useRef<HTMLDialogElement>(null), [source, setSource] = useState<PosReviewSource | null>(null), [sourceError, setSourceError] = useState(''), [loading, setLoading] = useState(true), [refresh, setRefresh] = useState(0)
  const [expense, setExpense] = useState<Record<string, unknown> | null>(null), [expenseError, setExpenseError] = useState(''), [expenseBusy, setExpenseBusy] = useState(false)
  const record = entry.item
  useReceiptDialog(dialog)
  useEffect(() => { let live = true; void loadSource(record.billId, refresh > 0, record.postedBillRevision).then(result => { if (live) { setSource(result); setLoading(false) } }, cause => { if (live) { setSourceError(cause instanceof Error ? cause.message : 'Unable to load original bill.'); setLoading(false) } }); return () => { live = false } }, [loadSource, record.billId, record.postedBillRevision, refresh])
  async function loadExpense() {
    if (!record.expenseId || expenseBusy) return
    setExpenseBusy(true); setExpenseError('')
    try { const saved = await getDocFromServer(doc(db, 'cashouts', record.expenseId)); if (!saved.exists()) throw new Error('Linked cash expense is unavailable.'); setExpense({ id: saved.id, ...saved.data() }) }
    catch (cause) { setExpenseError(cause instanceof Error ? cause.message : 'Unable to load cash expense.') }
    finally { setExpenseBusy(false) }
  }
  return createPortal(<dialog ref={dialog} aria-labelledby="completed-return-title" onCancel={event => { event.preventDefault(); if (!busy) onClose() }} className="m-auto max-h-[92dvh] w-[calc(100%_-_1.5rem)] max-w-3xl overflow-hidden rounded-lg border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-slate-950/40"><div className="flex max-h-[92dvh] flex-col">
    <header className="flex shrink-0 items-start justify-between gap-3 border-b p-4"><div><h2 id="completed-return-title" className="text-lg font-bold">Completed cash return</h2><p className="text-sm text-muted-foreground">{record.receiptNumber} · {record.ownerReviewStatus === 'reviewed' ? 'Reviewed' : 'Awaiting your review'}</p></div><Button variant="outline" disabled={busy} onClick={onClose}>Close</Button></header>
    <div className="grid min-h-0 auto-rows-max gap-4 overflow-y-auto p-4">
      {error || sourceError ? <StatusPanel variant="destructive"><p role="alert">{error || sourceError}</p></StatusPanel> : null}
      {unavailable ? <StatusPanel variant="warning">Reopen the current return notification before reviewing.</StatusPanel> : null}
      <dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">Posted by</dt><dd>{record.postedByName || record.requestedByName}<span className="block font-mono text-xs">{record.postedByUid || record.requestedByUid}</span></dd></div><div><dt className="text-muted-foreground">Posted at</dt><dd>{formatDisplayDateTime(record.postedAt || record.requestedAt)}</dd></div><div><dt className="text-muted-foreground">Cash refund</dt><dd className="font-bold">{record.refundAmountPaise === undefined ? 'Not recorded' : money(record.refundAmountPaise / 100)}</dd></div><div><dt className="text-muted-foreground">Condition</dt><dd>{record.returnCondition === 'sellable' ? 'Sellable · mapped stock restored' : 'Damaged · no stock change'}</dd></div><div className="sm:col-span-2"><dt className="text-muted-foreground">Reason</dt><dd className="break-words">{record.reason}</dd></div>{record.ownerReviewStatus === 'reviewed' ? <div><dt className="text-muted-foreground">Reviewed by</dt><dd>{record.reviewedByName || record.reviewedByUid || 'Not recorded'}</dd></div> : null}</dl>
      {loading ? <p role="status">Loading original bill…</p> : source ? <div className="overflow-x-auto rounded border"><table className="w-full text-left text-sm"><thead className="bg-secondary/30"><tr><th className="p-2">Original bill item</th><th className="p-2 text-right">Returned</th><th className="p-2 text-right">Refund</th></tr></thead><tbody>{record.returnLines?.map(line => <tr key={line.lineId} className="border-t"><td className="p-2">{source.bill.lines.find(item => item.id === line.lineId)?.description || 'Original item unavailable'}{source.bill.lines.find(item => item.id === line.lineId)?.kind === 'temporary' ? <small className="block text-muted-foreground">Historical unmapped item: No stock record</small> : null}</td><td className="p-2 text-right">{line.quantity}</td><td className="p-2 text-right">{line.refundPaise === undefined ? 'Not recorded' : money(line.refundPaise / 100)}</td></tr>)}</tbody></table></div> : null}
      <Button size="sm" variant="outline" disabled={loading || busy} onClick={() => { setLoading(true); setSourceError(''); setRefresh(value => value + 1) }}>{sourceError ? 'Retry original bill' : 'Refresh original bill'}</Button>
      {record.expenseId ? <div className="grid gap-2 rounded border p-3 text-sm"><p className="break-all">Cash expense reference: {record.expenseId}</p><Button size="sm" variant="outline" disabled={expenseBusy} onClick={() => void loadExpense()}>{expenseBusy ? 'Loading cash expense…' : 'View cash expense'}</Button>{expenseError ? <p role="alert">{expenseError}</p> : null}{expense ? <p>{String(expense.category)} · {money(Number(expense.amount))} · {String(expense.paymentMode)} · Posted by {String(expense.postedByName || expense.postedByUid || 'Not recorded')}</p> : null}</div> : <p className="text-sm">No cash paid; no cash expense created.</p>}
      <p className="text-sm text-muted-foreground">This return was completed by staff. Reviewing only acknowledges it; cash, stock and the refund amount will not change.</p>
    </div><footer className="flex shrink-0 justify-end gap-2 border-t p-4">{record.ownerReviewStatus === 'reviewed' ? <Button onClick={onClose}>Done</Button> : <Button disabled={busy || unavailable || loading || !!sourceError} onClick={() => void onReview()}>{busy ? 'Saving review…' : 'Mark Reviewed'}</Button>}</footer>
  </div></dialog>, document.body)
}
