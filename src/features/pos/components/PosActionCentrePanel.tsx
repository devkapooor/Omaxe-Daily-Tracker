import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, TestTube2, XCircle } from 'lucide-react'
import type { AppUser } from '@/domain/financeTypes'
import { formatDisplayDateTime } from '@/app/uiHelpers'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'
import { SectionHeading } from '@/shared/ui/section-heading'
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
    <CardHeader className="flex-row items-start justify-between"><SectionHeading eyebrow="Isolated sandbox approvals" title="POS (Test) Requests" description="Approvals below change only posSandboxes/test records." /><Badge variant={pending.length ? 'warning' : 'success'}>{pending.length} pending</Badge></CardHeader>
    <CardContent className="grid gap-2.5">
      {error ? <p className="text-sm text-destructive"><AlertTriangle className="mr-1 inline size-4" />{error}</p> : null}
      {pending.length === 0 ? <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground"><TestTube2 className="mr-1 inline size-4" />No POS test requests are waiting.</p> : pending.map((request) => <article key={request.id} className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:bg-amber-950/10"><div className="flex flex-wrap items-start justify-between gap-2"><div><Badge variant="warning">TEST {request.type.toUpperCase()}</Badge><h3 className="mt-1 font-black">{request.receiptNumber}</h3><p className="text-xs text-muted-foreground">Requested by {request.requestedByName} · {formatDisplayDateTime(request.requestedAt)}</p><p className="mt-1 text-xs"><strong>Reason:</strong> {request.reason}</p>{request.type === 'return' ? <p className="text-xs">Condition: {request.returnCondition} · Refund: ₹{((request.refundAmountPaise ?? 0) / 100).toLocaleString('en-IN')} via {request.refundMethod}</p> : null}</div><div className="flex min-w-64 flex-1 gap-2 sm:max-w-xl"><Input value={reason[request.id] ?? ''} onChange={(event) => setReason((current) => ({ ...current, [request.id]: event.target.value }))} placeholder="Mandatory rejection reason" /><Button size="sm" variant="outline" disabled={busyId !== null || !(reason[request.id] ?? '').trim()} onClick={() => void run(request.id, () => rejectPosApproval(request.id, reason[request.id], currentUser), `TEST request rejected: ${request.receiptNumber}`)}><XCircle />Reject</Button><Button size="sm" disabled={busyId !== null} onClick={() => void run(request.id, () => approvePosRequest(request.id, currentUser), `TEST request approved: ${request.receiptNumber}`)}><CheckCircle2 />Approve</Button></div></div></article>)}
      {recent.length > 0 ? <div><strong className="text-xs uppercase tracking-wide text-muted-foreground">Recent POS test decisions</strong><div className="mt-2 grid gap-2 sm:grid-cols-2">{recent.map((request) => <div key={request.id} className="rounded-xl border p-2 text-xs"><Badge variant={request.status === 'approved' ? 'success' : 'secondary'}>{request.status}</Badge> <strong>{request.receiptNumber}</strong><p className="text-muted-foreground">{request.type} · {request.reviewedByName} · {request.reviewReason}</p></div>)}</div></div> : null}
    </CardContent>
  </Card>
}
