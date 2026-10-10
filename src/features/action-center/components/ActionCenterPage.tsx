import { useMemo, useRef, useState } from 'react'
import { Clock3, Inbox } from 'lucide-react'
import { formatDisplayDate, formatDisplayDateTime, money } from '@/app/uiHelpers'
import type { ApprovalActionItem, ApprovalQueue } from '../domain/approvalItems'
import { OUTDATED_CORRECTION_REASON } from '../domain/approvalItems'
import type { ResolveVendorReturnV2Input } from '@/domain/vendorLedgerV2'
import type { AppUser } from '@/domain/financeTypes'
import type { UserAccount } from '@/domain/appTypes'
import { approvePosRequest, rejectPosApproval } from '@/features/pos/data/posRepository'
import { acknowledgeReconciliation } from '@/features/pos/data/cashierHandoverRepository'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { StatusPanel } from '@/shared/ui/status-panel'
import { FieldLabel } from '@/shared/ui/field-label'
import { Input } from '@/shared/ui/input'
import { PageHeader, PageHeaderTab, PageHeaderTabsList } from '@/shared/ui/page-header'
import { Tabs, TabsContent } from '@/shared/ui/tabs'
import { NativeSelect } from '@/shared/ui/native-select'
import { SelectField } from '@/shared/ui/select-field'
import { PageLayout } from '@/shared/ui/page-layout'
import { useActionCentreSources } from '../hooks/useActionCentreSources'
import { usePosReviewSource } from '../hooks/usePosReviewSource'
import { actionCentreEntries, actionStatusLabel, actionTypes, filterActionCentreEntries, type ActionCentreEntry } from '../domain/actionCentreEntries'
import { entryReference, entryStatus, paymentLabel, posSourceProblem, type PosReviewSource, type ReviewDecision } from '../domain/actionCentreReview'
import { ActionCentreDetailsPanel } from './ActionCentreDetailsPanel'

type ActionCenterPageProps = {
  currentUser: AppUser
  users: UserAccount[]
  showToast: (message: string) => void
  error: string | null
  isLoading: boolean
  vendorError: string | null
  vendorLoading: boolean
  queue: ApprovalQueue
  onApprove: (item: ApprovalActionItem) => Promise<void>
  onReject: (item: ApprovalActionItem, reason: string) => Promise<void>
  onResolveReturn: (item: Extract<ApprovalActionItem, { kind: 'vendor-return' }>, decision: Omit<ResolveVendorReturnV2Input, 'actor' | 'timestamp'>) => Promise<void>
}

function requestSummary(entry: ActionCentreEntry) {
  if (entry.source === 'handover') return `Difference: Cash ${money(entry.item.delta.cash / 100)} · UPI ${money(entry.item.delta.upi / 100)} · Card ${money(entry.item.delta.card / 100)}`
  if (entry.source === 'pos') return entry.item.type === 'return' ? `Requested Refund: ${entry.item.refundAmountPaise === undefined ? 'Not Recorded' : money(entry.item.refundAmountPaise / 100)} · ${paymentLabel(entry.item.refundMethod)}` : 'Bill Cancellation · Review Payments And Stock Effect'
  const item = entry.item
  return item.kind === 'cashout-correction' ? `Drawer: ${money(item.beforeDrawer)} → ${money(item.proposedDrawer)} · Cash Adjustment: ${money(item.cashMovementImpact)}` : item.kind === 'vendor-settlement-correction' ? `Payment: ${money(item.before.amountPaise / 100)} → ${money(item.proposed.amountPaise / 100)} · Outstanding Adjustment: ${money(item.outstandingImpactPaise / 100)}` : `${item.sourceReturn.quantity} ${item.sourceReturn.unit} · ${money(item.sourceReturn.valuePaise / 100)} · ${item.sourceReturn.description}`
}

export function ActionCenterPage({ error, isLoading, vendorError, vendorLoading, queue, onApprove, onReject, onResolveReturn, currentUser, users, showToast }: ActionCenterPageProps) {
  const [busy, setBusy] = useState(false)
  const processing = useRef(false)
  const [selected, setSelected] = useState<ActionCentreEntry | null>(null)
  const [decisionError, setDecisionError] = useState<string | null>(null)
  const [tab, setTab] = useState<'pending' | 'history'>('pending')
  const [type, setType] = useState('')
  const [requester, setRequester] = useState('')
  const [search, setSearch] = useState('')
  const sources = useActionCentreSources(currentUser)
  const loadPosSource = usePosReviewSource()
  const entries = useMemo(() => actionCentreEntries(queue, sources.posRequests, sources.handovers, users), [queue, sources.posRequests, sources.handovers, users])
  const visible = useMemo(() => filterActionCentreEntries(entries, tab, type, requester, search), [entries, tab, type, requester, search])
  const requesterOptions = useMemo(() => [{ value: '', label: 'All' }, ...[...new Set(entries.map((entry) => entry.requester))].sort((a, b) => a.localeCompare(b)).map((name) => ({ value: name, label: name }))], [entries])
  const selectedLive = selected ? entries.find((entry) => entry.key === selected.key) : undefined
  const selectedRequestLoading = selected?.source === 'approval' ? selected.item.kind === 'cashout-correction' ? isLoading && !error : vendorLoading : selected?.source === 'pos' ? sources.posLoading : sources.handoverLoading
  const selectedRequestError = selected?.source === 'approval' ? selected.item.kind === 'cashout-correction' ? error : vendorError : selected?.source === 'pos' ? sources.posError : sources.handoverError
  const loading = (isLoading && !error) || vendorLoading || sources.loading
  const errors = [error ? 'Cashout Corrections: ' + error : null, vendorError ? 'Vendor Requests: ' + vendorError : null, sources.posError ? 'POS Requests: ' + sources.posError : null, sources.handoverError ? 'Handover Reviews: ' + sources.handoverError : null].filter(Boolean)

  async function decide(snapshot: ActionCentreEntry, decision: ReviewDecision, source: PosReviewSource | null): Promise<boolean> {
    if (processing.current) return false
    setDecisionError(null)
    const latest = entries.find((entry) => entry.key === snapshot.key)
    const fail = (message: string) => { setDecisionError(message); return false }
    if (!latest?.pending) return fail('This request is no longer pending. Review its latest history entry.')
    if (JSON.stringify(latest.item) !== JSON.stringify(snapshot.item)) return fail('This request or its source changed while you were reviewing it. Review the updated details and confirm again.')
    const sourceLoading = latest.source === 'approval' ? latest.item.kind === 'cashout-correction' ? isLoading || Boolean(error) : vendorLoading || Boolean(vendorError) : latest.source === 'pos' ? Boolean(sources.posError) : Boolean(sources.handoverError)
    if (sourceLoading) return fail('The required request data is still loading or unavailable. Wait for it to load before deciding.')
    if (decision.action === 'approve') {
      if (latest.source === 'approval' && latest.item.isStale) return fail(latest.item.staleReason ?? 'This request is outdated.')
      if (latest.source === 'pos') {
        if (!source) return fail('Load the source bill before approving.')
        const problem = posSourceProblem(latest.item, source)
        if (problem) return fail(problem)
      }
    }
    processing.current = true
    setBusy(true)
    try {
      if (latest.source === 'approval') {
        if (decision.action === 'resolve-return' && latest.item.kind === 'vendor-return' && decision.returnDecision) await onResolveReturn(latest.item, decision.returnDecision)
        else if (decision.action === 'approve' && latest.item.kind !== 'vendor-return') await onApprove(latest.item)
        else if (decision.action === 'reject' && decision.reason && latest.item.kind !== 'vendor-return') await onReject(latest.item, decision.reason)
        else if (decision.action === 'close-outdated' && latest.item.isStale && latest.item.kind !== 'vendor-return') await onReject(latest.item, OUTDATED_CORRECTION_REASON)
        else throw new Error('This decision is not available for this request.')
      } else if (latest.source === 'pos') {
        if (decision.action === 'approve') {
          const result = await approvePosRequest(latest.item.id, currentUser)
          if (result === 'stale') { showToast('Request closed as outdated because the bill state changed.'); return fail('The bill changed. This request was closed as outdated without applying the requested financial or stock changes.') }
          showToast(`Request approved: ${latest.item.receiptNumber}`)
        } else if (decision.action === 'reject' && decision.reason) { await rejectPosApproval(latest.item.id, decision.reason, currentUser); showToast(`Request rejected: ${latest.item.receiptNumber}`) }
        else throw new Error('This decision is not available for this POS request.')
      } else if (decision.action === 'mark-reviewed') { await acknowledgeReconciliation(latest.item.id, currentUser.id); showToast('Handover marked reviewed. No balances changed.') }
      else throw new Error('Handovers can only be marked reviewed.')
      setSelected(null)
      return true
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Unable to record this decision. Your entered details have been kept.'
      showToast(message)
      return fail(message)
    } finally { processing.current = false; setBusy(false) }
  }

  return <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)} className="flex min-h-0 flex-1 flex-col overflow-hidden">
    <PageLayout className="min-h-0 flex-1 overflow-hidden" header={<PageHeader title="Action Centre" className="shrink-0" tools={<PageHeaderTabsList aria-label="Action Centre Sections"><PageHeaderTab value="pending">Pending {loading ? '…' : '(' + entries.filter((entry) => entry.pending).length + ')'}</PageHeaderTab><PageHeaderTab value="history">History</PageHeaderTab></PageHeaderTabsList>} />}>
      <Card className="shrink-0 p-3" role="region" aria-label="Action Centre Filters"><div className="grid grid-cols-2 items-end gap-2 lg:grid-cols-[minmax(14rem,2fr)_repeat(2,minmax(0,1fr))_auto]"><FieldLabel className="col-span-2 lg:col-span-1" label="Search"><Input value={search} placeholder="Bill Number, Vendor Or Person" onChange={(event) => setSearch(event.target.value)} /></FieldLabel><FieldLabel label="Request Type"><NativeSelect value={type} onChange={(event) => setType(event.target.value)}><option value="">All</option>{actionTypes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</NativeSelect></FieldLabel><FieldLabel label="Requested By"><SelectField value={requester} options={requesterOptions} onValueChange={setRequester} /></FieldLabel><Button variant="outline" className="col-span-2 lg:col-span-1" onClick={() => { setType(''); setRequester(''); setSearch('') }}>Clear Filters</Button></div></Card>
      <TabsContent value={tab} className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {loading ? <Card className="flex items-center gap-2 p-3 text-sm text-muted-foreground" role="status"><Clock3 className="size-4 animate-pulse" />Loading Requests…</Card> : null}
        {errors.map((message) => <StatusPanel key={message} variant="destructive" role="alert">{message}</StatusPanel>)}
        <p className="text-xs text-muted-foreground">{tab === 'pending' ? 'Oldest First · Open Details To Review And Decide' : 'Recent History · Newest Decisions First'}</p>
        {!loading && !visible.length ? <Card className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Inbox className="size-4" />{errors.length ? 'Some Requests Could Not Be Loaded.' : type || requester || search.trim() ? 'No Requests Match These Filters.' : tab === 'pending' ? 'No Requests Are Waiting.' : 'No Recent History To Show.'}</Card> : null}
        {visible.map((entry) => { const status = entryStatus(entry); return <article key={entry.key} className="space-y-2 rounded-md border border-border bg-card p-3"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{actionTypes.find((option) => option.value === entry.type)?.label}</Badge><strong className="min-w-0 break-words text-sm">{entry.source === 'approval' && entry.item.kind === 'cashout-correction' ? formatDisplayDate(entry.item.cashoutDate) : entryReference(entry)}</strong><Badge variant={status === 'pending' ? 'warning' : status === 'rejected' ? 'destructive' : status === 'approved' || status === 'reviewed' || status === 'matched' ? 'success' : 'secondary'}>{actionStatusLabel(status)}</Badge>{entry.source === 'approval' && entry.item.isStale ? <Badge variant="destructive">Outdated</Badge> : null}</div><p className="text-xs text-muted-foreground">Requested By {entry.requester} · {formatDisplayDateTime(entry.pending ? entry.submittedAt : entry.historyAt)}</p><p className="text-sm">{requestSummary(entry)}</p><div className="flex flex-wrap items-end justify-between gap-2"><p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">{entry.source === 'handover' ? entry.item.note : !entry.pending && entry.item.reviewReason ? entry.item.reviewReason : entry.item.reason}</p><Button size="sm" variant="outline" disabled={busy} onClick={() => { setDecisionError(null); setSelected(entry) }}>View Details</Button></div></article> })}
      </TabsContent>
      {selected ? <ActionCentreDetailsPanel key={selected.key} entry={selectedLive ?? selected} users={users} busy={busy} unavailable={!selectedLive} decisionError={decisionError} requestLoading={selectedRequestLoading} requestError={selectedRequestError} loadPosSource={loadPosSource} onClose={() => { if (!processing.current) setSelected(null) }} onDecide={decide} /> : null}
    </PageLayout>
  </Tabs>
}
