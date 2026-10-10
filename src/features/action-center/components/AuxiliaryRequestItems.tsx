import { useState } from 'react'
import type { AppUser } from '@/domain/financeTypes'
import { formatDisplayDate, formatDisplayDateTime } from '@/app/uiHelpers'
import type { PosApprovalRequest } from '@/features/pos/domain/types'
import type { CashierReconciliation } from '@/features/pos/domain/cashierHandover'
import { approvePosRequest, rejectPosApproval } from '@/features/pos/data/posRepository'
import { acknowledgeReconciliation } from '@/features/pos/data/cashierHandoverRepository'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { actionStatusLabel } from '../domain/actionCentreEntries'

type DecisionProps = { currentUser: AppUser; busy: boolean; run: (key: string, action: () => Promise<unknown>, message: string) => Promise<void> }

export function PosRequestItem({ request, currentUser, busy, run }: DecisionProps & { request: PosApprovalRequest }) {
  const [reason, setReason] = useState('')
  return <article className="space-y-2 rounded-md border border-border bg-card p-3">
    <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{request.type === 'void' ? 'POS Void' : 'POS Return'}</Badge><Badge variant="warning">Pending</Badge><strong className="text-sm">{request.receiptNumber}</strong></div>
    <p className="text-xs text-muted-foreground">Requested By {request.requestedByName} · {formatDisplayDateTime(request.requestedAt)}</p>
    <p className="text-sm"><strong>Reason:</strong> {request.reason}</p>
    {request.type === 'return' ? <p className="text-xs text-muted-foreground">Condition: {request.returnCondition} · Refund: ₹{((request.refundAmountPaise ?? 0) / 100).toLocaleString('en-IN')} Via {request.refundMethod}</p> : null}
    <div className="flex flex-wrap gap-2"><Input className="min-w-36 flex-1" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Mandatory Rejection Reason" aria-label={`Rejection Reason For ${request.receiptNumber}`} />
      <Button size="sm" variant="outline" disabled={busy || !reason.trim()} onClick={() => void run(`pos:${request.id}`, () => rejectPosApproval(request.id, reason, currentUser), `Request rejected: ${request.receiptNumber}`)}>Reject</Button>
      <Button size="sm" disabled={busy} onClick={() => void run(`pos:${request.id}`, () => approvePosRequest(request.id, currentUser), `Request approved: ${request.receiptNumber}`)}>Approve</Button>
    </div>
  </article>
}

export function HandoverRequestItem({ record, currentUser, busy, run }: DecisionProps & { record: CashierReconciliation }) {
  return <article className="space-y-2 rounded-md border border-border bg-card p-3">
    <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">Handover Review</Badge><Badge variant="warning">Needs Review</Badge><strong className="text-sm">{record.name} · {record.kind === 'login' ? 'Login' : 'Logout'}</strong></div>
    <p className="text-xs text-muted-foreground">{formatDisplayDateTime(record.createdAt)} · Review Only</p>
    <div className="grid grid-cols-4 gap-2 text-xs"><strong>Payment</strong><strong>Expected</strong><strong>Actual</strong><strong>Difference</strong>{(['cash', 'upi', 'card'] as const).map((method) => <div key={method} className="contents"><span>{method === 'cash' ? 'Cash' : method === 'upi' ? 'UPI' : 'Card'}</span><span>₹{(record.expected[method] / 100).toLocaleString('en-IN')}</span><span>₹{(record.actual[method] / 100).toLocaleString('en-IN')}</span><span className={record.delta[method] ? 'text-destructive' : ''}>₹{(record.delta[method] / 100).toLocaleString('en-IN')}</span></div>)}</div>
    {record.note ? <p className="text-sm">{record.note}</p> : null}
    <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(`handover:${record.id}`, () => acknowledgeReconciliation(record.id, currentUser.id), 'Handover discrepancy marked reviewed. No balances changed.')}>Mark Reviewed</Button>
  </article>
}

export function AuxiliaryHistoryItem({ item }: { item: PosApprovalRequest | CashierReconciliation }) {
  const isPos = 'receiptNumber' in item
  const status = isPos ? item.status : item.reviewStatus
  return <article className="space-y-1 rounded-md border border-border bg-card p-3 text-xs">
    <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{isPos ? item.type === 'void' ? 'POS Void' : 'POS Return' : 'Handover Review'}</Badge><strong>{isPos ? item.receiptNumber : item.name}</strong><Badge variant={status === 'approved' || status === 'reviewed' || status === 'matched' ? 'success' : status === 'rejected' ? 'destructive' : 'secondary'}>{actionStatusLabel(status)}</Badge></div>
    <p className="text-muted-foreground">{formatDisplayDateTime(item.reviewedAt ?? (isPos ? item.requestedAt : item.createdAt))}</p>
    {isPos ? <p>Requested By {item.requestedByName} · Reviewed By {item.reviewedByName ?? 'Not Recorded'}{item.reviewReason ? ` · ${item.reviewReason}` : ''}</p> : <p>{formatDisplayDate(item.date)} · {item.kind === 'login' ? 'Login' : 'Logout'}{item.note ? ` · ${item.note}` : ''}</p>}
  </article>
}
