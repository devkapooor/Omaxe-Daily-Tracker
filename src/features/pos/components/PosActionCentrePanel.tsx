import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, TestTube2, XCircle } from 'lucide-react'
import type { AppUser } from '@/domain/financeTypes'
import { formatDisplayDateTime } from '@/app/uiHelpers'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card, CardContent } from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'
import { approvePosRequest, rejectPosApproval, subscribePosApprovals } from '../data/posRepository'
import type { PosApprovalRequest } from '../domain/types'

export function PosActionCentrePanel({ currentUser, showToast }: { currentUser: AppUser; showToast: (message: string) => void }) {
  const [requests, setRequests] = useState<PosApprovalRequest[]>([])
  const [error, setError] = useState<string | null>(null)
  const [reason, setReason] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  useEffect(() => subscribePosApprovals(setRequests, (next) => setError(next.message)), [])
  const pending = requests.filter((request) => request.status === 'pending')
  const recent = requests.filter((request) => request.status !== 'pending').slice(0, 20)

  async function run(id: string, action: () => Promise<unknown>, message: string) {
    setBusyId(id)
    try { const result = await action(); showToast(result === 'stale' ? 'TEST request closed as stale because the bill state changed.' : message) }
    catch (nextError) { showToast(nextError instanceof Error ? nextError.message : 'Unable to review POS test request.') }
    finally { setBusyId(null) }
  }

  return <Card className="border-amber-300/70">
    <CardContent className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="grid size-7 shrink-0 place-items-center rounded bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"><TestTube2 className="size-4" /></span>
        <div className="min-w-0">
          <h3 className="text-xs font-semibold text-foreground">POS (Test) Sandbox Requests</h3>
          <p className="text-[10px] text-muted-foreground">Isolated test environment · Approvals affect only posSandboxes/test</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={pending.length ? 'warning' : 'secondary'} className="px-2 py-0.5 text-[10px]">{pending.length} pending</Badge>
        {pending.length === 0 ? <span className="text-[10px] text-muted-foreground">No requests waiting</span> : null}
      </div>
    </CardContent>

    {error ? <CardContent className="border-t border-border pt-2 text-xs text-destructive"><AlertTriangle className="mr-1 inline size-3.5" />{error}</CardContent> : null}
    {pending.map((request) => <CardContent key={request.id} className="border-t border-border pt-2.5">
      <article className="grid gap-2 rounded-md border border-amber-200 bg-amber-50/50 p-2.5 dark:bg-amber-950/10 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)] lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Badge variant="warning" className="px-1.5 py-0 text-[10px]">TEST {request.type.toUpperCase()}</Badge>
            <strong className="text-xs">{request.receiptNumber}</strong>
            <span className="text-[10px] text-muted-foreground">{request.requestedByName} · {formatDisplayDateTime(request.requestedAt)}</span>
          </div>
          <p className="mt-1 text-[11px]"><strong>Reason:</strong> {request.reason}</p>
          {request.type === 'return' ? <p className="text-[10px] text-muted-foreground">Condition: {request.returnCondition} · Refund: ₹{((request.refundAmountPaise ?? 0) / 100).toLocaleString('en-IN')} via {request.refundMethod}</p> : null}
        </div>
        <div className="flex min-w-0 flex-wrap gap-1.5">
          <Input className="h-8 min-w-36 flex-1 text-xs" value={reason[request.id] ?? ''} onChange={(event) => setReason((current) => ({ ...current, [request.id]: event.target.value }))} placeholder="Mandatory rejection reason" aria-label={`Rejection reason for ${request.receiptNumber}`} />
          <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs" disabled={busyId !== null || !(reason[request.id] ?? '').trim()} onClick={() => void run(request.id, () => rejectPosApproval(request.id, reason[request.id], currentUser), `TEST request rejected: ${request.receiptNumber}`)}><XCircle className="size-3.5" />Reject</Button>
          <Button size="sm" className="h-8 px-2.5 text-xs" disabled={busyId !== null} onClick={() => void run(request.id, () => approvePosRequest(request.id, currentUser), `TEST request approved: ${request.receiptNumber}`)}><CheckCircle2 className="size-3.5" />Approve</Button>
        </div>
      </article>
    </CardContent>)}

    {recent.length > 0 ? <CardContent className="border-t border-border pt-2 text-xs">
      <details>
        <summary className="w-fit cursor-pointer select-none font-semibold text-muted-foreground hover:text-foreground">Recent POS test decisions ({recent.length})</summary>
        <div className="mt-2 divide-y divide-border">
          {recent.map((request) => <div key={request.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-1.5">
            <span><Badge variant={request.status === 'approved' ? 'success' : 'secondary'}>{request.status}</Badge> <strong>{request.receiptNumber}</strong> <span className="text-muted-foreground">{request.type}</span></span>
            <span className="text-muted-foreground">{request.reviewedByName} · {request.reviewReason}</span>
          </div>)}
        </div>
      </details>
    </CardContent> : null}
  </Card>
}
