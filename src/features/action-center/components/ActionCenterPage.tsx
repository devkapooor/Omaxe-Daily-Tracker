import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock3, Inbox, XCircle } from 'lucide-react'
import { formatDisplayDate, formatDisplayDateTime, money } from '@/app/uiHelpers'
import { DailyCashoutDetailsModal } from '@/features/cashout/components/DailyCashoutDetailsModal'
import type { ApprovalActionItem, ApprovalQueue } from '@/features/action-center/domain/approvalItems'
import { OUTDATED_CORRECTION_REASON } from '@/features/action-center/domain/approvalItems'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { SectionHeading } from '@/shared/ui/section-heading'
import { useConfirmationDialog } from '@/shared/ui/confirmation-dialog'

type ActionCenterPageProps = {
  error: string | null
  isLoading: boolean
  queue: ApprovalQueue
  onApprove: (item: ApprovalActionItem) => Promise<void>
  onReject: (item: ApprovalActionItem, reason: string) => Promise<void>
}

const valueRows = [
  ['Cash Sales', 'cashSales'],
  ['UPI Sales', 'upiSales'],
  ['Credit Sales', 'creditSales'],
  ['Returns', 'returns'],
  ['Cash Expense', 'cashExpense'],
  ['System Audit', 'cashAudit'],
] as const

function denominationSummary(item: ApprovalActionItem, side: 'before' | 'proposed') {
  const values = item[side].drawerDenominations
  return `500 x ${values.denom500} | 200 x ${values.denom200} | 100 x ${values.denom100} | 50 x ${values.denom50} | 20 x ${values.denom20} | 10 x ${values.denom10} | Change ${money(values.change)}`
}

function statusVariant(status: ApprovalActionItem['status']) {
  if (status === 'approved') return 'success' as const
  if (status === 'rejected') return 'destructive' as const
  if (status === 'pending') return 'warning' as const
  return 'secondary' as const
}

function ChangeGrid({ item }: { item: ApprovalActionItem }) {
  return (
    <div className="grid gap-2 lg:grid-cols-2">
      {(['before', 'proposed'] as const).map((side) => (
        <div key={side} className="rounded-xl border border-border/70 bg-background/45 p-2.5">
          <span className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
            {side === 'before' ? 'Saved Values' : 'Proposed Values'}
          </span>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            {valueRows.map(([label, key]) => (
              <p key={key} className="flex justify-between gap-2 text-muted-foreground">
                <span>{label}</span><strong className="text-foreground">{money(item[side][key])}</strong>
              </p>
            ))}
            <p className="col-span-2 mt-1 flex justify-between gap-2 border-t border-border/60 pt-1.5 text-muted-foreground">
              <span>Drawer Total</span><strong className="text-foreground">{money(side === 'before' ? item.beforeDrawer : item.proposedDrawer)}</strong>
            </p>
          </div>
          <p className="mt-2 text-[9px] leading-relaxed text-muted-foreground">{denominationSummary(item, side)}</p>
        </div>
      ))}
    </div>
  )
}

function RecentDecision({ item }: { item: ApprovalActionItem }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/40 p-2.5 text-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-bold text-foreground">Cashout correction | {formatDisplayDate(item.cashoutDate)}</p>
          <p className="mt-1 text-muted-foreground">{item.recordedBy} | Requested by {item.requester}</p>
        </div>
        <Badge variant={statusVariant(item.status)}>{item.status}</Badge>
      </div>
      <p className="mt-2 text-muted-foreground">{item.reason}</p>
      <p className="mt-1 text-muted-foreground">
        Reviewed by {item.reviewedBy ?? '-'}{item.reviewedAt ? ` at ${formatDisplayDateTime(item.reviewedAt)}` : ''}
      </p>
      {item.reviewReason ? <p className="mt-1 text-muted-foreground">Decision: {item.reviewReason}</p> : null}
    </div>
  )
}

export function ActionCenterPage({ error, isLoading, queue, onApprove, onReject }: ActionCenterPageProps) {
  const confirmation = useConfirmationDialog()
  const [busyItemId, setBusyItemId] = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState<ApprovalActionItem | null>(null)

  async function run(item: ApprovalActionItem, action: () => Promise<void>) {
    setBusyItemId(item.id)
    try {
      await action()
    } finally {
      setBusyItemId(null)
    }
  }

  async function approve(item: ApprovalActionItem) {
    const confirmed = await confirmation.confirm({
      title: 'Approve this cashout correction?',
      details: [
        `Requested by: ${item.requester}`,
        `Cashout date: ${formatDisplayDate(item.cashoutDate)}`,
        `Cash Movement balance impact: ${money(item.cashMovementImpact)}`,
      ],
      warning: 'The saved cashout and linked sales totals will be recalculated atomically.',
      confirmLabel: 'Approve Correction',
    })
    if (!confirmed) return
    await run(item, () => onApprove(item))
  }

  async function reject(item: ApprovalActionItem) {
    const reason = await confirmation.confirm({
      title: 'Reject this cashout correction?',
      details: [`Requested by: ${item.requester}`, `Cashout date: ${formatDisplayDate(item.cashoutDate)}`],
      requireReason: true,
      confirmLabel: 'Reject Correction',
    })
    if (typeof reason !== 'string') return
    await run(item, () => onReject(item, reason))
  }

  async function closeOutdated(item: ApprovalActionItem) {
    const confirmed = await confirmation.confirm({
      title: 'Close this outdated request?',
      details: [item.staleReason ?? 'The source cashout changed after submission.', OUTDATED_CORRECTION_REASON],
      warning: 'No financial values will change. Staff can submit a new correction after this request is closed.',
      confirmLabel: 'Close as Outdated',
    })
    if (!confirmed) return
    await run(item, () => onReject(item, OUTDATED_CORRECTION_REASON))
  }

  return (
    <section className="min-h-0 flex-1 overflow-y-auto pr-1">
      <div className="grid gap-2.5">
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3">
            <SectionHeading
              eyebrow="Owner Workspace"
              title="Action Centre"
              description="Review approval requests individually. Source financial records change only after a confirmed approval."
            />
            <Badge variant={queue.pendingCount > 0 ? 'warning' : 'success'}>
              {queue.pendingCount} pending
            </Badge>
          </CardHeader>
        </Card>

        {isLoading && !error ? (
          <Card>
            <CardContent className="flex items-center gap-3 py-6 text-sm font-semibold text-muted-foreground">
              <Clock3 className="h-5 w-5 animate-pulse text-primary" /> Loading approval requests...
            </CardContent>
          </Card>
        ) : null}

        {error ? (
          <Card>
            <CardContent className="flex items-start gap-3 py-5 text-sm text-rose-100">
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-none text-rose-300" />
              <div><strong className="block">Approval requests could not be loaded</strong><span className="text-xs text-muted-foreground">{error}</span></div>
            </CardContent>
          </Card>
        ) : null}

        {!isLoading && !error ? <Card>
          <CardHeader>
            <SectionHeading eyebrow="Needs Review" title="Pending Approvals" description="Oldest requests are shown first." />
          </CardHeader>
          <CardContent className="space-y-2.5">
            {queue.pending.length === 0 ? (
              <div className="grid place-items-center rounded-2xl border border-dashed border-border/80 bg-background/25 px-4 py-10 text-center">
                <Inbox className="h-7 w-7 text-emerald-300" />
                <p className="mt-2 text-sm font-bold text-foreground">No approvals are waiting</p>
                <p className="mt-1 text-xs text-muted-foreground">New requests will appear here automatically.</p>
              </div>
            ) : null}

            {queue.pending.map((item) => (
              <article key={item.id} className="rounded-2xl border border-border/75 bg-secondary/20 p-3">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="warning">Cashout correction</Badge>
                      {item.isStale ? <Badge variant="destructive">Outdated</Badge> : <Badge variant="outline">Ready to review</Badge>}
                    </div>
                    <h3 className="text-base font-black text-foreground">{formatDisplayDate(item.cashoutDate)} | {item.recordedBy}</h3>
                    <p className="text-xs text-muted-foreground">Requested by {item.requester} at {formatDisplayDateTime(item.submittedAt)}</p>
                    <p className="text-xs font-semibold text-foreground">Reason: {item.reason}</p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-background/45 px-3 py-2 text-left xl:text-right">
                    <span className="block text-[9px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">Cash Movement Impact</span>
                    <strong className={item.cashMovementImpact < 0 ? 'mt-1 block text-base font-black text-rose-300' : 'mt-1 block text-base font-black text-emerald-300'}>
                      {item.cashMovementImpact > 0 ? '+' : ''}{money(item.cashMovementImpact)}
                    </strong>
                  </div>
                </div>

                {item.isStale ? (
                  <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-900/60 bg-rose-950/25 p-2.5 text-xs text-rose-100">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
                    <p><strong>Approval blocked.</strong> {item.staleReason}</p>
                  </div>
                ) : null}

                <div className="mt-3"><ChangeGrid item={item} /></div>

                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  {item.sourceCashout ? <Button type="button" size="sm" variant="outline" onClick={() => setSelectedItem(item)}>View Cashout</Button> : null}
                  {item.isStale ? (
                    <Button type="button" size="sm" variant="destructive" disabled={busyItemId !== null} onClick={() => void closeOutdated(item)}>
                      <XCircle className="h-3.5 w-3.5" /> Close as Outdated
                    </Button>
                  ) : (
                    <>
                      <Button type="button" size="sm" variant="outline" disabled={busyItemId !== null} onClick={() => void reject(item)}>
                        <XCircle className="h-3.5 w-3.5" /> Reject
                      </Button>
                      <Button type="button" size="sm" disabled={busyItemId !== null} onClick={() => void approve(item)}>
                        <CheckCircle2 className="h-3.5 w-3.5" /> {busyItemId === item.id ? 'Processing...' : 'Approve'}
                      </Button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </CardContent>
        </Card> : null}

        {!isLoading && !error ? <Card>
          <CardHeader>
            <SectionHeading eyebrow="Audit Snapshot" title="Recent Decisions" description="Latest 20 decisions. Older history remains available in Logs." />
          </CardHeader>
          <CardContent>
            {queue.recent.length === 0 ? (
              <div className="flex items-center gap-2 rounded-xl border border-dashed border-border/80 p-3 text-xs text-muted-foreground">
                <Clock3 className="h-4 w-4" /> No completed approval decisions yet.
              </div>
            ) : (
              <div className="grid gap-2 lg:grid-cols-2">
                {queue.recent.map((item) => <RecentDecision key={item.id} item={item} />)}
              </div>
            )}
          </CardContent>
        </Card> : null}
      </div>

      <DailyCashoutDetailsModal entry={selectedItem?.sourceCashout ?? null} onClose={() => setSelectedItem(null)} />
      {confirmation.dialog}
    </section>
  )
}
