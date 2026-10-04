import { useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Clock3, Inbox, XCircle } from 'lucide-react'
import { formatDisplayDate, formatDisplayDateTime, money } from '@/app/uiHelpers'
import { DailyCashoutDetailsModal } from '@/features/cashout/components/DailyCashoutDetailsModal'
import type { ApprovalActionItem, ApprovalQueue } from '@/features/action-center/domain/approvalItems'
import type { ResolveVendorReturnV2Input } from '@/domain/vendorLedgerV2'
import { OUTDATED_CORRECTION_REASON } from '@/features/action-center/domain/approvalItems'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { StatusPanel } from '@/shared/ui/status-panel'
import { FieldLabel } from '@/shared/ui/field-label'
import { Input } from '@/shared/ui/input'
import { PageCardStack } from '@/shared/ui/page-card-stack'
import { PageHeader } from '@/shared/ui/page-header'
import { PageLayout } from '@/shared/ui/page-layout'
import { Textarea } from '@/shared/ui/textarea'
import { useConfirmationDialog } from '@/shared/ui/confirmation-dialog'
import type { ScheduledNotification } from '@/domain/appTypes'

type ActionCenterPageProps = {
  scheduledNotifications: ScheduledNotification[]
  onSaveScheduledNotifications: (notices: ScheduledNotification[]) => Promise<void>
  testPosPanel?: ReactNode
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
  ['Card Sales', 'cardSales'],
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
        <div key={side} className="rounded-md border border-border bg-background p-2.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            {side === 'before' ? 'Saved Values' : 'Proposed Values'}
          </span>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            {valueRows.map(([label, key]) => (
              <p key={key} className="flex justify-between gap-2 text-muted-foreground">
                <span>{label}</span><strong className="text-foreground">{money(item[side][key] ?? 0)}</strong>
              </p>
            ))}
            <p className="col-span-2 mt-1 flex justify-between gap-2 border-t border-border/60 pt-1.5 text-muted-foreground">
              <span>Drawer Total</span><strong className="text-foreground">{money(side === 'before' ? item.beforeDrawer : item.proposedDrawer)}</strong>
            </p>
          </div>
          <p className="mt-2 border-t border-border pt-1.5 text-[10px] leading-relaxed text-muted-foreground">Drawer denominations · {denominationSummary(item, side)}</p>
        </div>
      ))}
    </div>
  )
}

function CashoutChangeSummary({ item }: { item: Extract<ApprovalActionItem, { kind: 'cashout-correction' }> }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border bg-muted/50 px-2.5 py-2 text-xs">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Drawer total</span>
      <span><span className="text-muted-foreground">Saved</span> <strong className="tabular-nums">{money(item.beforeDrawer)}</strong></span>
      <span aria-hidden="true" className="text-muted-foreground">→</span>
      <span><span className="text-muted-foreground">Proposed</span> <strong className="tabular-nums">{money(item.proposedDrawer)}</strong></span>
      <Badge variant={item.cashMovementImpact < 0 ? 'warning' : 'secondary'} className="tabular-nums">
        {item.cashMovementImpact > 0 ? '+' : ''}{money(item.cashMovementImpact)}
      </Badge>
      <details className="basis-full text-[11px] text-muted-foreground">
        <summary className="w-fit cursor-pointer select-none hover:text-foreground">Full cashout comparison</summary>
        <div className="mt-2"><ChangeGrid item={item} /></div>
      </details>
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
    <div className="grid gap-1.5 border-b border-border py-2 text-xs last:border-b-0 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] sm:items-center sm:gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${item.status === 'approved' ? 'bg-emerald-500' : item.status === 'rejected' ? 'bg-rose-500' : 'bg-muted-foreground'}`} />
        <p className="font-semibold text-foreground">{title}</p>
        <span className="text-muted-foreground">{formatDisplayDate(item.reviewedAt ?? item.submittedAt)}</span>
        <Badge variant={statusVariant(item.status)}>{item.status}</Badge>
      </div>
      <p className="truncate text-muted-foreground" title={item.reviewReason ?? item.reason}>{item.reviewReason || item.reason}</p>
      <details className="text-muted-foreground sm:text-right">
        <summary className="w-fit cursor-pointer select-none hover:text-foreground sm:ml-auto">Audit details</summary>
        <div className="mt-1 space-y-0.5 sm:max-w-sm sm:text-left">
          <p>Requested by {item.requester}: {item.reason}</p>
          <p>Reviewed by {item.reviewedBy ?? '-'}{item.reviewedAt ? ` at ${formatDisplayDateTime(item.reviewedAt)}` : ''}</p>
          {item.reviewReason ? <p>Decision: {item.reviewReason}</p> : null}
        </div>
      </details>
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
    <div className="mt-3 grid gap-2 rounded-md border border-border bg-background p-3 sm:grid-cols-2 lg:grid-cols-4">
      <fieldset className="sm:col-span-2 lg:col-span-4">
        <legend className="mb-1.5 text-xs font-semibold text-foreground">Return outcome</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {[
            ['vendor-credit', 'Vendor credit'],
            ['replacement', 'Replacement received'],
            ['rejected', 'Reject return'],
          ].map(([value, label]) => (
            <label key={value} className="inline-flex cursor-pointer items-center gap-2 text-xs text-foreground">
              <input
                type="radio"
                name={`return-outcome-${item.id}`}
                value={value}
                checked={outcome === value}
                onChange={() => setOutcome(value as typeof outcome)}
                className="h-4 w-4 accent-primary"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      {outcome === 'vendor-credit' ? <FieldLabel label="Credit Amount">
        <Input type="number" min="0.01" max={item.sourceReturn.valuePaise / 100} step="0.01" value={creditedRupees} onChange={(event) => setCreditedRupees(event.target.value)} />
      </FieldLabel> : null}
      {outcome === 'replacement' ? <FieldLabel label="Replacement Received">
        <Input type="date" value={replacementReceivedAt} onChange={(event) => setReplacementReceivedAt(event.target.value)} />
      </FieldLabel> : null}
      <FieldLabel className="sm:col-span-2 lg:col-span-3" label="Mandatory Decision Reason">
        <Textarea rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
      </FieldLabel>
      <div className="flex items-end justify-end sm:col-span-2 lg:col-span-1">
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

export function ActionCenterPage({ error, isLoading, queue, onApprove, onReject, onResolveReturn, testPosPanel, scheduledNotifications, onSaveScheduledNotifications }: ActionCenterPageProps) {
  const confirmation = useConfirmationDialog()
  const [busyItemId, setBusyItemId] = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState<ApprovalActionItem | null>(null)
  const [previousNotifications, setPreviousNotifications] = useState(scheduledNotifications)
  const [notices, setNotices] = useState(scheduledNotifications)
  const [savingNotices, setSavingNotices] = useState(false)
  if (previousNotifications !== scheduledNotifications) {
    setPreviousNotifications(scheduledNotifications)
    setNotices(scheduledNotifications)
  }

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
    <PageLayout className="min-h-0 flex-1 overflow-hidden" header={(
      <PageHeader title="Action Centre" tools={(
        <Badge variant={queue.pendingCount > 0 ? 'warning' : 'success'} className="shrink-0 px-3 py-1 text-xs">
          {queue.pendingCount} pending
        </Badge>
      )} />
    )}>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <PageCardStack className="w-full pb-4">
          <p className="sr-only">Owner workspace. Financial records change only after explicit approval.</p>

        <Card>
          <CardHeader className="border-b border-border px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">While browser is open</p>
            <h2 className="text-sm font-semibold tracking-tight text-foreground">Scheduled blocking notifications</h2>
            <p className="text-xs text-muted-foreground">Staff see each enabled notice at its IST trigger time and must acknowledge it before using the app.</p>
          </CardHeader>
          <CardContent className="space-y-2 p-3">
            {notices.map((notice, index) => <div key={notice.id} className="grid gap-2 rounded-md border border-border p-2 sm:grid-cols-12 sm:items-end">
              <FieldLabel className="sm:col-span-3" label="Title"><Input value={notice.title} maxLength={100} onChange={(event) => setNotices((items) => items.map((item, i) => i === index ? { ...item, title: event.target.value } : item))} /></FieldLabel>
              <FieldLabel className="sm:col-span-4" label="Message"><Input value={notice.message} maxLength={1000} onChange={(event) => setNotices((items) => items.map((item, i) => i === index ? { ...item, message: event.target.value } : item))} /></FieldLabel>
              <FieldLabel className="sm:col-span-2" label="Trigger time (IST)"><Input type="time" value={notice.triggerTime} onChange={(event) => setNotices((items) => items.map((item, i) => i === index ? { ...item, triggerTime: event.target.value } : item))} /></FieldLabel>
              <fieldset className="sm:col-span-2"><legend className="mb-1 text-xs font-medium">Show to</legend><div className="flex gap-2 text-xs">{(['billing', 'manager'] as const).map((role) => <label key={role} className="flex items-center gap-1"><input type="checkbox" checked={notice.targetRoles.includes(role)} onChange={(event) => setNotices((items) => items.map((item, i) => i === index ? { ...item, targetRoles: event.target.checked ? [...item.targetRoles, role] : item.targetRoles.filter((value) => value !== role) } : item))} />{role}</label>)}</div></fieldset>
              <div className="flex items-center gap-2 sm:col-span-1"><label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={notice.enabled} onChange={(event) => setNotices((items) => items.map((item, i) => i === index ? { ...item, enabled: event.target.checked } : item))} />On</label><Button type="button" size="sm" variant="ghost" onClick={() => setNotices((items) => items.filter((_, i) => i !== index))}>Remove</Button></div>
            </div>)}
            <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={notices.length >= 25} onClick={() => setNotices((items) => [...items, { id: crypto.randomUUID(), title: '', message: '', triggerTime: '23:50', targetRoles: ['billing', 'manager'], enabled: true }])}>Add notification</Button><Button type="button" disabled={savingNotices || notices.some((notice) => !notice.title.trim() || !notice.message.trim() || !notice.targetRoles.length)} onClick={() => { setSavingNotices(true); void onSaveScheduledNotifications(notices).finally(() => setSavingNotices(false)) }}>{savingNotices ? 'Saving…' : 'Save notifications'}</Button></div>
          </CardContent>
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
          <CardHeader className="flex-row items-end justify-between gap-3 border-b border-border px-3 py-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Needs Review</p>
              <h2 className="text-sm font-semibold tracking-tight text-foreground">Pending Approvals</h2>
            </div>
            <span className="hidden text-[10px] text-muted-foreground sm:inline">Sorted oldest first</span>
          </CardHeader>
          <CardContent className="space-y-2 px-3 pb-3 pt-2">
            {queue.pending.length === 0 ? (
              <div className="flex items-center gap-2 rounded-md border border-dashed border-border bg-background px-3 py-2.5 text-xs text-muted-foreground">
                <Inbox className="h-4 w-4 text-emerald-600" />
                <p className="font-medium text-foreground">No approvals are waiting</p>
              </div>
            ) : null}

            {queue.pending.map((item) => (
              <article key={item.id} className="rounded-md border border-border bg-card px-3 py-2.5">
                <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(190px,0.9fr)_auto] md:items-center">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="px-1.5 py-0 text-[10px]">{item.kind === 'cashout-correction' ? 'Cashout correction' : item.kind === 'vendor-settlement-correction' ? 'Vendor payment' : 'Vendor return'}</Badge>
                      {item.isStale ? <Badge variant="destructive">Outdated</Badge> : null}
                      <span className="text-[11px] font-medium text-foreground">{item.kind === 'cashout-correction' ? item.requester : item.vendorName}</span>
                      <span className="text-[11px] text-muted-foreground">{formatDisplayDate(item.kind === 'cashout-correction' ? item.cashoutDate : item.kind === 'vendor-settlement-correction' ? item.proposed.date : item.sourceReturn.date)}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">{item.kind === 'cashout-correction' ? `Recorded by ${item.recordedBy} · ` : 'Requested by '}{item.requester} · {formatDisplayDateTime(item.submittedAt)}</p>
                    <p className="text-[10px] leading-4 text-foreground"><span className="font-semibold">Reason:</span> {item.reason}</p>
                  </div>
                  <div className="min-w-0">
                    {item.kind === 'cashout-correction' ? <CashoutChangeSummary item={item} /> : null}
                    {item.kind === 'vendor-settlement-correction' ? <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border bg-muted/50 px-2.5 py-2 text-xs">
                      <span><span className="text-muted-foreground">Recorded</span> <strong className="tabular-nums">{money(item.before.amountPaise / 100)}</strong></span>
                      <span aria-hidden="true" className="text-muted-foreground">→</span>
                      <span><span className="text-muted-foreground">Proposed</span> <strong className="tabular-nums">{money(item.proposed.amountPaise / 100)}</strong></span>
                      <Badge variant="secondary" className="tabular-nums">Impact {money(item.outstandingImpactPaise / 100)}</Badge>
                      <span className="basis-full text-[10px] text-muted-foreground">{formatDisplayDate(item.before.date)} · {item.before.mode} → {formatDisplayDate(item.proposed.date)} · {item.proposed.mode}</span>
                    </div> : null}
                    {item.kind === 'vendor-return' ? <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/50 px-2.5 py-2 text-xs">
                      <strong>{item.sourceReturn.description}</strong>
                      <span className="text-muted-foreground">{item.sourceReturn.quantity} {item.sourceReturn.unit}</span>
                      <Badge variant="secondary" className="tabular-nums">{money(item.sourceReturn.valuePaise / 100)}</Badge>
                    </div> : null}
                  </div>
                  <div className="flex flex-wrap justify-end gap-1.5 md:flex-row md:items-center">
                    {item.kind === 'cashout-correction' && item.sourceCashout ? <Button type="button" size="sm" variant="outline" className="h-8 px-2.5 text-xs" onClick={() => setSelectedItem(item)}>View details</Button> : null}
                    {item.kind === 'vendor-return' ? null : item.isStale ? (
                      <Button type="button" size="sm" variant="destructive" disabled={busyItemId !== null} onClick={() => void closeOutdated(item)}>
                        <XCircle className="h-3.5 w-3.5" /> Close outdated
                      </Button>
                    ) : (
                      <>
                        <Button type="button" size="sm" variant="outline" className="h-8 px-2.5 text-xs" disabled={busyItemId !== null} onClick={() => void reject(item)}>
                          <XCircle className="h-3.5 w-3.5" /> Reject
                        </Button>
                        <Button type="button" size="sm" className="h-8 px-2.5 text-xs" disabled={busyItemId !== null} onClick={() => void approve(item)}>
                          <CheckCircle2 className="h-3.5 w-3.5" /> {busyItemId === item.id ? 'Processing...' : 'Approve'}
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {item.isStale ? (
                  <div className="mt-3 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
                    <p><strong>Approval blocked.</strong> {item.staleReason}</p>
                  </div>
                ) : null}

                {item.kind === 'vendor-return' ? <VendorReturnDecision busy={busyItemId !== null} item={item} onResolve={(decision) => run(item, () => onResolveReturn(item, decision))} /> : null}
              </article>
            ))}
          </CardContent>
        </Card> : null}

        {!isLoading && !error ? <Card>
          <CardHeader className="flex-row items-end justify-between gap-3 px-3 py-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Audit Snapshot</p>
              <h2 className="text-sm font-semibold tracking-tight text-foreground">Recent Decisions</h2>
            </div>
            <span className="text-[10px] text-muted-foreground">Latest 20 · Full history in Logs</span>
          </CardHeader>
          <CardContent className="pt-0">
            {queue.recent.length === 0 ? (
              <div className="flex items-center gap-2 rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
                <Clock3 className="h-4 w-4" /> No completed approval decisions yet.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {queue.recent.map((item) => <RecentDecision key={item.id} item={item} />)}
              </div>
            )}
          </CardContent>
        </Card> : null}

        {testPosPanel}
        </PageCardStack>
      </div>

      <DailyCashoutDetailsModal entry={selectedItem?.kind === 'cashout-correction' ? selectedItem.sourceCashout ?? null : null} onClose={() => setSelectedItem(null)} />
      {confirmation.dialog}
    </PageLayout>
  )
}
