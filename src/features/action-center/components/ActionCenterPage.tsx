import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock3, Inbox, XCircle } from 'lucide-react'
import { formatDisplayDate, formatDisplayDateTime, money } from '@/app/uiHelpers'
import { DailyCashoutDetailsModal } from '@/features/cashout/components/DailyCashoutDetailsModal'
import type { ApprovalActionItem, ApprovalQueue } from '@/features/action-center/domain/approvalItems'
import type { ResolveVendorReturnV2Input } from '@/domain/vendorLedgerV2'
import { OUTDATED_CORRECTION_REASON } from '@/features/action-center/domain/approvalItems'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { SectionHeading } from '@/shared/ui/section-heading'
import { StatusPanel } from '@/shared/ui/status-panel'
import { FieldLabel } from '@/shared/ui/field-label'
import { Input } from '@/shared/ui/input'
import { SelectField } from '@/shared/ui/select-field'
import { Textarea } from '@/shared/ui/textarea'
import { useConfirmationDialog } from '@/shared/ui/confirmation-dialog'

type ActionCenterPageProps = {
  error: string | null
  isLoading: boolean
  queue: ApprovalQueue
  onApprove: (item: ApprovalActionItem) => Promise<void>
  onReject: (item: ApprovalActionItem, reason: string) => Promise<void>
  onResolveReturn: (item: Extract<ApprovalActionItem, { kind: 'vendor-return' }>, decision: Omit<ResolveVendorReturnV2Input, 'actor' | 'timestamp'>) => Promise<void>
}

const valueRows = [
  ['Cash Sales', 'cashSales'],
  ['UPI Sales', 'upiSales'],
  ['Credit Sales', 'creditSales'],
  ['Returns', 'returns'],
  ['Cash Expense', 'cashExpense'],
  ['System Audit', 'cashAudit'],
] as const

function denominationSummary(item: Extract<ApprovalActionItem, { kind: 'cashout-correction' }>, side: 'before' | 'proposed') {
  const values = item[side].drawerDenominations
  return `500 x ${values.denom500} | 200 x ${values.denom200} | 100 x ${values.denom100} | 50 x ${values.denom50} | 20 x ${values.denom20} | 10 x ${values.denom10} | Change ${money(values.change)}`
}

function statusVariant(status: ApprovalActionItem['status']) {
  if (status === 'approved') return 'success' as const
  if (status === 'rejected') return 'destructive' as const
  if (status === 'pending') return 'warning' as const
  return 'secondary' as const
}

function ChangeGrid({ item }: { item: Extract<ApprovalActionItem, { kind: 'cashout-correction' }> }) {
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
  const title = item.kind === 'cashout-correction'
    ? `Cashout correction | ${formatDisplayDate(item.cashoutDate)}`
    : item.kind === 'vendor-settlement-correction'
      ? `Vendor payment correction | ${item.vendorName}`
      : `Vendor return | ${item.vendorName}`
  return (
    <div className="rounded-xl border border-border/70 bg-background/40 p-2.5 text-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-bold text-foreground">{title}</p>
          <p className="mt-1 text-muted-foreground">Requested by {item.requester}</p>
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

function VendorReturnDecision({
  busy,
  item,
  onResolve,
}: {
  busy: boolean
  item: Extract<ApprovalActionItem, { kind: 'vendor-return' }>
  onResolve: (decision: Omit<ResolveVendorReturnV2Input, 'actor' | 'timestamp'>) => Promise<void>
}) {
  const [outcome, setOutcome] = useState<'vendor-credit' | 'replacement' | 'rejected'>('vendor-credit')
  const [creditedRupees, setCreditedRupees] = useState(String(item.sourceReturn.valuePaise / 100))
  const [replacementReceivedAt, setReplacementReceivedAt] = useState(item.sourceReturn.date)
  const [reason, setReason] = useState('')
  return (
    <div className="mt-3 grid gap-2 rounded-xl border border-border/70 bg-background/45 p-3 sm:grid-cols-2 lg:grid-cols-4">
      <FieldLabel label="Decision">
        <SelectField
          options={[
            { label: 'Vendor credit', value: 'vendor-credit' },
            { label: 'Replacement received', value: 'replacement' },
            { label: 'Reject return', value: 'rejected' },
          ]}
          value={outcome}
          onValueChange={(value) => setOutcome(value as typeof outcome)}
        />
      </FieldLabel>
      {outcome === 'vendor-credit' ? <FieldLabel label="Credit Amount">
        <Input type="number" min="0.01" max={item.sourceReturn.valuePaise / 100} step="0.01" value={creditedRupees} onChange={(event) => setCreditedRupees(event.target.value)} />
      </FieldLabel> : null}
      {outcome === 'replacement' ? <FieldLabel label="Replacement Received">
        <Input type="date" value={replacementReceivedAt} onChange={(event) => setReplacementReceivedAt(event.target.value)} />
      </FieldLabel> : null}
      <FieldLabel className="sm:col-span-2 lg:col-span-2" label="Mandatory Decision Reason">
        <Textarea rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
      </FieldLabel>
      <div className="flex items-end justify-end sm:col-span-2 lg:col-span-4">
        <Button
          disabled={busy || !reason.trim() || (outcome === 'vendor-credit' && Number(creditedRupees) <= 0)}
          variant={outcome === 'rejected' ? 'destructive' : 'default'}
          onClick={() => void onResolve({
            outcome,
            outcomeReason: reason,
            ...(outcome === 'vendor-credit' ? { creditedValuePaise: Math.round(Number(creditedRupees) * 100) } : {}),
            ...(outcome === 'replacement' ? { replacementReceivedAt } : {}),
          })}
        >
          {busy ? 'Processing...' : 'Record Decision'}
        </Button>
      </div>
    </div>
  )
}

export function ActionCenterPage({ error, isLoading, queue, onApprove, onReject, onResolveReturn }: ActionCenterPageProps) {
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
    if (item.kind === 'vendor-return') return
    const details = item.kind === 'cashout-correction'
      ? [`Requested by: ${item.requester}`, `Cashout date: ${formatDisplayDate(item.cashoutDate)}`, `Cash Movement balance impact: ${money(item.cashMovementImpact)}`]
      : [`Requested by: ${item.requester}`, `Vendor: ${item.vendorName}`, `Outstanding impact: ${money(item.outstandingImpactPaise / 100)}`]
    const confirmed = await confirmation.confirm({
      title: item.kind === 'cashout-correction' ? 'Approve this cashout correction?' : 'Approve this vendor payment correction?',
      details,
      warning: 'The financial adjustment and audit history will be recorded atomically.',
      confirmLabel: 'Approve Correction',
    })
    if (!confirmed) return
    await run(item, () => onApprove(item))
  }

  async function reject(item: ApprovalActionItem) {
    if (item.kind === 'vendor-return') return
    const reason = await confirmation.confirm({
      title: item.kind === 'cashout-correction' ? 'Reject this cashout correction?' : 'Reject this vendor payment correction?',
      details: item.kind === 'cashout-correction'
        ? [`Requested by: ${item.requester}`, `Cashout date: ${formatDisplayDate(item.cashoutDate)}`]
        : [`Requested by: ${item.requester}`, `Vendor: ${item.vendorName}`],
      requireReason: true,
      confirmLabel: 'Reject Correction',
    })
    if (typeof reason !== 'string') return
    await run(item, () => onReject(item, reason))
  }

  async function closeOutdated(item: ApprovalActionItem) {
    if (item.kind === 'vendor-return') return
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
              description="Financial records change only after approval."
            />
            <Badge variant={queue.pendingCount > 0 ? 'warning' : 'success'}>
              {queue.pendingCount} pending
            </Badge>
          </CardHeader>
        </Card>

        {isLoading && !error ? (
          <Card>
            <CardContent className="flex items-center gap-3 py-4 text-sm font-semibold text-muted-foreground">
              <Clock3 className="h-5 w-5 animate-pulse text-primary" /> Loading approval requests...
            </CardContent>
          </Card>
        ) : null}

        {error ? (
          <StatusPanel variant="destructive" className="flex items-start gap-3 py-5">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-none" />
            <div><strong className="block">Approval requests could not be loaded</strong><span className="text-xs text-muted-foreground">{error}</span></div>
          </StatusPanel>
        ) : null}

        {!isLoading && !error ? <Card>
          <CardHeader>
            <SectionHeading eyebrow="Needs Review" title="Pending Approvals" />
          </CardHeader>
          <CardContent className="space-y-2.5">
            {queue.pending.length === 0 ? (
              <div className="grid place-items-center rounded-2xl border border-dashed border-border/80 bg-background/25 px-4 py-5 text-center">
                <Inbox className="h-7 w-7 text-emerald-600" />
                <p className="mt-2 text-sm font-bold text-foreground">No approvals are waiting</p>
              </div>
            ) : null}

            {queue.pending.map((item) => (
              <article key={item.id} className="rounded-2xl border border-border/75 bg-secondary/20 p-3">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="warning">{item.kind === 'cashout-correction' ? 'Cashout correction' : item.kind === 'vendor-settlement-correction' ? 'Vendor payment correction' : 'Vendor return'}</Badge>
                      {item.isStale ? <Badge variant="destructive">Outdated</Badge> : <Badge variant="outline">Ready to review</Badge>}
                    </div>
                    <h3 className="text-base font-black text-foreground">
                      {item.kind === 'cashout-correction'
                        ? `${formatDisplayDate(item.cashoutDate)} | ${item.recordedBy}`
                        : item.kind === 'vendor-settlement-correction'
                          ? `${item.vendorName} | ${formatDisplayDate(item.proposed.date)}`
                          : `${item.vendorName} | ${formatDisplayDate(item.sourceReturn.date)}`}
                    </h3>
                    <p className="text-xs text-muted-foreground">Requested by {item.requester} at {formatDisplayDateTime(item.submittedAt)}</p>
                    <p className="text-xs font-semibold text-foreground">Reason: {item.reason}</p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-background/45 px-3 py-2 text-left xl:text-right">
                    <span className="block text-[9px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">{item.kind === 'cashout-correction' ? 'Cash Movement Impact' : item.kind === 'vendor-settlement-correction' ? 'Outstanding Impact' : 'Requested Return Value'}</span>
                    <strong className="mt-1 block text-base font-black text-cyan-700">
                      {money(item.kind === 'cashout-correction' ? item.cashMovementImpact : item.kind === 'vendor-settlement-correction' ? item.outstandingImpactPaise / 100 : item.sourceReturn.valuePaise / 100)}
                    </strong>
                  </div>
                </div>

                {item.isStale ? (
                  <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
                    <p><strong>Approval blocked.</strong> {item.staleReason}</p>
                  </div>
                ) : null}

                {item.kind === 'cashout-correction' ? <div className="mt-3"><ChangeGrid item={item} /></div> : null}
                {item.kind === 'vendor-settlement-correction' ? <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl border border-border/70 bg-background/45 p-3 text-xs"><strong>Saved payment</strong><p className="mt-1 text-muted-foreground">{formatDisplayDate(item.before.date)} | {item.before.mode} | {money(item.before.amountPaise / 100)}</p></div>
                  <div className="rounded-xl border border-border/70 bg-background/45 p-3 text-xs"><strong>Proposed payment</strong><p className="mt-1 text-muted-foreground">{formatDisplayDate(item.proposed.date)} | {item.proposed.mode} | {money(item.proposed.amountPaise / 100)}</p></div>
                </div> : null}
                {item.kind === 'vendor-return' ? <div className="mt-3 text-xs text-muted-foreground">{item.sourceReturn.description} | {item.sourceReturn.quantity} {item.sourceReturn.unit}</div> : null}

                {item.kind === 'vendor-return' ? <VendorReturnDecision busy={busyItemId !== null} item={item} onResolve={(decision) => run(item, () => onResolveReturn(item, decision))} /> : <div className="mt-3 flex flex-wrap justify-end gap-2">
                  {item.kind === 'cashout-correction' && item.sourceCashout ? <Button type="button" size="sm" variant="outline" onClick={() => setSelectedItem(item)}>View Cashout</Button> : null}
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
                </div>}
              </article>
            ))}
          </CardContent>
        </Card> : null}

        {!isLoading && !error ? <Card>
          <CardHeader>
            <SectionHeading eyebrow="Audit Snapshot" title="Recent Decisions" description="Latest 20 · Full history in Logs" />
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

      <DailyCashoutDetailsModal entry={selectedItem?.kind === 'cashout-correction' ? selectedItem.sourceCashout ?? null : null} onClose={() => setSelectedItem(null)} />
      {confirmation.dialog}
    </section>
  )
}
