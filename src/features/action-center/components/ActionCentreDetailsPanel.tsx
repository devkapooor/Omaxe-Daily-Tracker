import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatDisplayDate, formatDisplayDateTime, money } from '@/app/uiHelpers'
import type { UserAccount } from '@/domain/appTypes'
import { settlementCorrectionValuesEqualV2, settlementCorrectionValuesV2, type VendorSettlementStateV2 } from '@/domain/vendorLedgerV2'
import { HANDOVER_START } from '@/features/pos/domain/cashierHandover'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { FieldLabel } from '@/shared/ui/field-label'
import { Input } from '@/shared/ui/input'
import { NativeSelect } from '@/shared/ui/native-select'
import { StatusPanel } from '@/shared/ui/status-panel'
import { Textarea } from '@/shared/ui/textarea'
import { actionStatusLabel, actionTypes, type ActionCentreEntry } from '../domain/actionCentreEntries'
import { entryReference, entryStatus, paymentLabel, posSourceProblem, type PosReviewSource, type ReviewDecision } from '../domain/actionCentreReview'

type Props = {
  entry: Exclude<ActionCentreEntry, { source: 'stock-price' }>
  users: UserAccount[]
  busy: boolean
  unavailable: boolean
  decisionError: string | null
  requestLoading: boolean
  requestError: string | null
  loadPosSource: (billId: string, refresh?: boolean, expectedRevision?: number) => Promise<PosReviewSource>
  loadVendorSource: (id: string, refresh?: boolean, expectedRevision?: number) => Promise<VendorSettlementStateV2 | null>
  onClose: () => void
  onDecide: (entry: ActionCentreEntry, decision: ReviewDecision, source: PosReviewSource | null) => Promise<boolean>
}

function Field({ label, value }: { label: string; value?: string | number | null }) {
  return <div className="min-w-0 space-y-1"><dt className="text-xs font-semibold text-muted-foreground">{label}</dt><dd className="whitespace-pre-wrap break-words text-sm">{value === undefined || value === null || value === '' ? 'Not Recorded' : value}</dd></div>
}

type ComparisonRow = { label: string; before: string; proposed: string }
function Comparison({ rows }: { rows: ComparisonRow[] }) {
  return <div className="overflow-x-auto rounded-md border border-border"><table className="w-full text-left text-sm"><thead className="bg-muted"><tr><th className="p-2">Field</th><th className="p-2">Saved At Request</th><th className="p-2">Proposed</th></tr></thead><tbody>{rows.map((row) => <tr key={row.label} className={row.before !== row.proposed ? 'border-t border-border bg-amber-50 text-slate-900' : 'border-t border-border'}><th scope="row" className="p-2 font-medium">{row.label}{row.before !== row.proposed ? <Badge variant="outline" className="ml-2">Changed</Badge> : null}</th><td className="whitespace-pre-wrap p-2">{row.before}</td><td className="whitespace-pre-wrap p-2">{row.proposed}</td></tr>)}</tbody></table></div>
}

function ApprovalDetails({ entry }: { entry: Extract<ActionCentreEntry, { source: 'approval' }> }) {
  const item = entry.item
  if (item.kind === 'cashout-correction') {
    const rows: ComparisonRow[] = ([['Cash Sales', 'cashSales'], ['UPI Sales', 'upiSales'], ['Card Sales', 'cardSales'], ['Credit Sales', 'creditSales'], ['Returns', 'returns'], ['Cash Expense', 'cashExpense'], ['System Audit', 'cashAudit']] as const).map(([label, key]) => ({ label, before: item.before[key] === undefined ? 'Not Recorded' : money(item.before[key]!), proposed: item.proposed[key] === undefined ? 'Not Recorded' : money(item.proposed[key]!) }))
    for (const denomination of [500, 200, 100, 50, 20, 10] as const) {
      const key = `denom${denomination}` as keyof typeof item.before.drawerDenominations
      rows.push({ label: `₹${denomination} Notes`, before: String(item.before.drawerDenominations[key]), proposed: String(item.proposed.drawerDenominations[key]) })
    }
    rows.push({ label: 'Loose Change', before: money(item.before.drawerDenominations.change), proposed: money(item.proposed.drawerDenominations.change) }, { label: 'Drawer Total', before: money(item.beforeDrawer), proposed: money(item.proposedDrawer) })
    return <><dl className="grid gap-3 sm:grid-cols-2"><Field label="Cashout Date" value={formatDisplayDate(item.cashoutDate)} /><Field label="Recorded By" value={item.recordedBy} /><Field label="Source Reference" value={item.sourceRequest.cashoutId} /><Field label="Cash Balance Adjustment" value={`${item.cashMovementImpact > 0 ? '+' : ''}${money(item.cashMovementImpact)}`} /></dl><Comparison rows={rows} />{item.sourceCashout ? <details className="rounded-md border border-border p-3"><summary className="cursor-pointer text-sm font-semibold">Current Cashout Details</summary><dl className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Current Revision" value={item.sourceCashout.revision ?? 1} /><Field label="Remaining Balance" value={money(item.sourceCashout.remainingBalance)} /><Field label="Cash Drawer Particulars" value={item.sourceCashout.actualCashParticulars} /><Field label="Pending Cash Particulars" value={item.sourceCashout.pendingCashParticulars} /><Field label="Staff Balances At Close" value={item.sourceCashout.holderBalancesAtClose?.map((balance) => `${balance.name}: ${money(balance.amountPaise / 100)}`).join('\n')} /></dl></details> : <StatusPanel variant="warning">The current source cashout is unavailable. The comparison uses the saved request snapshots.</StatusPanel>}</>
  }
  if (item.kind === 'vendor-settlement-correction') {
    const rows = ([['Payment Amount', 'amountPaise'], ['Payment Date', 'date'], ['Payment Mode', 'mode'], ['Notes', 'notes'], ['Invoice Reference', 'invoiceId']] as const).map(([label, key]) => {
      const display = (side: 'before' | 'proposed') => key === 'amountPaise' ? money(item[side].amountPaise / 100) : key === 'date' ? formatDisplayDate(item[side].date) : item[side][key] || 'Not Recorded'
      return { label, before: display('before'), proposed: display('proposed') }
    })
    return <><dl className="grid gap-3 sm:grid-cols-2"><Field label="Vendor" value={item.vendorName} /><Field label="Payment Reference" value={item.sourceRequest.sourceRecordId} /><Field label="Outstanding Adjustment" value={`${item.outstandingImpactPaise > 0 ? '+' : ''}${money(item.outstandingImpactPaise / 100)}`} /></dl><Comparison rows={rows} /><p className="text-sm text-muted-foreground">A negative adjustment reduces the vendor outstanding. A positive adjustment increases it.</p></>
  }
  const record = item.sourceReturn
  return <dl className="grid gap-3 sm:grid-cols-2"><Field label="Vendor" value={item.vendorName} /><Field label="Return Date" value={formatDisplayDate(record.date)} /><Field label="Product Description" value={record.description} /><Field label="Quantity" value={`${record.quantity} ${record.unit}`} /><Field label="Return Value" value={money(record.valuePaise / 100)} /><Field label="Purchase Reference" value={record.sourcePurchaseId} /><Field label="Outcome" value={actionStatusLabel(record.outcome)} /><Field label="Credit Recorded" value={record.creditedValuePaise === undefined ? undefined : money(record.creditedValuePaise / 100)} /><Field label="Replacement Received" value={record.replacementReceivedAt ? formatDisplayDate(record.replacementReceivedAt) : undefined} /></dl>
}

function PosDetails({ entry, source }: { entry: Extract<ActionCentreEntry, { source: 'pos' }>; source: PosReviewSource }) {
  const request = entry.item
  const bill = source.bill
  const requested = new Map((request.returnLines ?? []).map((line) => [line.lineId, line.quantity]))
  const lines = bill.lines.filter((line) => request.type === 'void' || requested.has(line.id))
  const restores = request.type === 'void' || request.returnCondition === 'sellable'
  return <><dl className="grid gap-3 sm:grid-cols-2"><Field label="Source Preview Loaded" value={formatDisplayDateTime(source.loadedAt)} /><Field label="Bill Date" value={formatDisplayDate(bill.businessDate)} /><Field label="Billed By" value={bill.createdByName} /><Field label="Customer" value={bill.customerName} /><Field label="Bill Total" value={money(bill.totalPaise / 100)} /><Field label="Discount" value={bill.discount?.amountPaise === undefined ? undefined : money(bill.discount.amountPaise / 100)} /><Field label="Bill State At Preview" value={source.state.state === 'voided' ? 'Voided' : source.state.state === 'partially-returned' ? 'Partially Returned' : 'Active'} /><Field label="Original Payments" value={bill.payments.map((payment) => `${paymentLabel(payment.method)}: ${money(payment.amountPaise / 100)}${payment.reference ? ` (${payment.reference})` : ''}`).join('\n')} />{request.type === 'return' ? <><Field label="Return Condition" value={request.returnCondition === 'sellable' ? 'Sellable' : request.returnCondition === 'damaged' ? 'Damaged' : undefined} /><Field label="Refund Amount" value={request.refundAmountPaise === undefined ? undefined : money(request.refundAmountPaise / 100)} /><Field label="Refund Method" value={paymentLabel(request.refundMethod)} /><Field label="Refund Date" value={request.refundDate ? formatDisplayDate(request.refundDate) : undefined} /><Field label="Refund Reference" value={request.refundReference} /></> : null}</dl>
    <div className="overflow-x-auto rounded-md border border-border"><table className="w-full text-left text-sm"><thead className="bg-muted"><tr><th className="p-2">Barcode / Item</th><th className="p-2">Billed</th><th className="p-2">Requested</th><th className="p-2">Unit Price</th><th className="p-2">Requested Stock Restore</th></tr></thead><tbody>{lines.map((line) => { const quantity = request.type === 'void' ? line.quantity : requested.get(line.id) ?? 0; return <tr key={line.id} className="border-t border-border"><td className="p-2"><span className="block text-xs text-muted-foreground">{line.barcode || 'Not Recorded'}</span>{line.description}</td><td className="p-2">{line.quantity}</td><td className="p-2">{quantity}</td><td className="p-2">{money(line.unitPricePaise / 100)}</td><td className="p-2">{line.kind === 'product' && line.productId ? restores ? `+${quantity}` : '0 — Damaged' : 'No Stock Record'}</td></tr> })}</tbody></table></div>
    <p className="text-sm text-muted-foreground">{request.type === 'void' ? 'Approval voids this bill and restores its mapped product quantities.' : restores ? 'Approval records the requested refund and restores the sellable mapped product quantities.' : 'Approval records the requested refund. Damaged items do not increase sellable stock.'} {request.type === 'void' && bill.createdAt < HANDOVER_START ? 'This historical bill does not reverse the current handover totals.' : request.type === 'return' && request.refundMethod === 'bank-transfer' ? 'A Bank Transfer refund does not adjust Cash, UPI or Card handover totals.' : `Handover totals decrease by ${request.type === 'void' ? 'the original Cash, UPI and Card payments' : 'the refund amount for its payment method'}.`}</p>
    {!entry.pending ? <p className="text-xs text-muted-foreground">These are the requested effects. Stock effects apply only to approved requests. The bill state shown is current as of the source preview.</p> : <p className="text-xs text-muted-foreground">This is a historical pending request. New void posting and owner refund approval are retired. Close it without financial changes; complete eligible cash returns from Bills.</p>}
  </>
}

function HandoverDetails({ entry }: { entry: Extract<ActionCentreEntry, { source: 'handover' }> }) {
  const record = entry.item
  return <><dl className="grid gap-3 sm:grid-cols-2"><Field label="Business Date" value={formatDisplayDate(record.date)} /><Field label="Handover" value={record.kind === 'login' ? record.reservationId ? 'Counter Opening' : 'Login' : 'Logout Count'} /><Field label="Saved At" value={record.recordedAt ? formatDisplayDateTime(record.recordedAt.toDate().toISOString()) : undefined} /><Field label="Staff Note" value={record.note} /><Field label="Cash Denominations" value={Object.entries(record.denominations).map(([denomination, count]) => `₹${denomination} × ${count}`).join('\n')} /><Field label="Loose Coins" value={money(record.coinPaise / 100)} /></dl><div className="overflow-x-auto rounded-md border border-border"><table className="w-full text-left text-sm"><thead className="bg-muted"><tr><th className="p-2">Payment</th><th className="p-2">Expected</th><th className="p-2">Actual</th><th className="p-2">Difference</th></tr></thead><tbody>{(['cash', 'upi', 'card'] as const).map((method) => <tr key={method} className="border-t border-border"><th className="p-2">{paymentLabel(method)}</th><td className="p-2">{money(record.expected[method] / 100)}</td><td className="p-2">{money(record.actual[method] / 100)}</td><td className={`p-2 ${record.delta[method] ? 'text-destructive' : ''}`}>{money(record.delta[method] / 100)}</td></tr>)}</tbody></table></div><p className="text-sm text-muted-foreground">Mark Reviewed records owner acknowledgement. It does not adjust cash, payment totals or stock.</p></>
}

export function ActionCentreDetailsPanel({ entry, users, busy, unavailable, decisionError, requestLoading, requestError, loadPosSource, loadVendorSource, onClose, onDecide }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const paymentSourceId = entry.pending && entry.source === 'approval' && entry.item.kind === 'vendor-settlement-correction' ? entry.item.sourceRequest.sourceRecordId : null
  const [source, setSource] = useState<PosReviewSource | null>(null)
  const [vendorSource, setVendorSource] = useState<VendorSettlementStateV2 | null>(null)
  const [vendorSourceReady, setVendorSourceReady] = useState(false)
  const [sourceError, setSourceError] = useState<string | null>(null)
  const [sourceLoading, setSourceLoading] = useState(entry.source === 'pos' || Boolean(paymentSourceId))
  const [refresh, setRefresh] = useState(0)
  const [reason, setReason] = useState('')
  const [outcome, setOutcome] = useState<'vendor-credit' | 'replacement' | 'rejected'>('vendor-credit')
  const [credit, setCredit] = useState(entry.source === 'approval' && entry.item.kind === 'vendor-return' ? String(entry.item.sourceReturn.valuePaise / 100) : '')
  const [replacementDate, setReplacementDate] = useState(entry.source === 'approval' && entry.item.kind === 'vendor-return' ? entry.item.sourceReturn.date : '')
  const [confirmation, setConfirmation] = useState<ReviewDecision | null>(null)
  const [decisionEntry, setDecisionEntry] = useState(entry)
  const [validationError, setValidationError] = useState<string | null>(null)
  const billId = entry.source === 'pos' ? entry.item.billId : null
  const sourceRevision = entry.source === 'pos' ? entry.item.sourceBillRevision : entry.source === 'approval' && entry.item.kind === 'vendor-settlement-correction' ? entry.item.sourceRequest.sourceRevision : undefined
  useEffect(() => {
    const node = dialog.current
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    node?.showModal()
    return () => { node?.close(); previous?.focus() }
  }, [])
  useEffect(() => {
    if (!billId) return
    let active = true
    void loadPosSource(billId, refresh > 0, sourceRevision).then((result) => { if (active) { setSource(result); setSourceLoading(false); setSourceError(null) } }, (error: unknown) => { if (active) { setSourceError(error instanceof Error ? error.message : 'Unable to load the source bill.'); setSourceLoading(false) } })
    return () => { active = false }
  }, [billId, loadPosSource, refresh, sourceRevision])
  useEffect(() => {
    if (!paymentSourceId) return
    let active = true
    void loadVendorSource(paymentSourceId, refresh > 0, sourceRevision).then((result) => { if (active) { setVendorSource(result); setVendorSourceReady(true); setSourceLoading(false); setSourceError(null) } }, (cause: unknown) => { if (active) { setSourceError(cause instanceof Error ? cause.message : 'Unable to load the source payment.'); setSourceLoading(false) } })
    return () => { active = false }
  }, [paymentSourceId, loadVendorSource, refresh, sourceRevision])
  const resolveName = (id?: string) => id ? users.find((user) => user.id === id)?.name ?? id : undefined
  let sourceProblem = entry.source === 'pos' && entry.pending && source ? posSourceProblem(entry.item, source) : entry.source === 'approval' && entry.item.isStale ? entry.item.staleReason ?? 'The source record changed after submission.' : null
  if (paymentSourceId && vendorSourceReady && entry.source === 'approval' && entry.item.kind === 'vendor-settlement-correction') {
    sourceProblem = !vendorSource ? 'The source vendor payment no longer exists.' : vendorSource.vendorId !== entry.item.vendorId || vendorSource.revision !== entry.item.sourceRequest.sourceRevision || !settlementCorrectionValuesEqualV2(settlementCorrectionValuesV2(vendorSource), entry.item.before) ? 'The source vendor payment changed after submission. Ask staff to submit a new correction.' : null
  }
  const actionsBlocked = busy || unavailable || sourceLoading || requestLoading || Boolean(requestError)
  const approvalBlocked = actionsBlocked || Boolean(sourceProblem || sourceError)
  const isVendorReturn = entry.source === 'approval' && entry.item.kind === 'vendor-return'
  const reviewedBy = entry.source === 'pos' ? entry.item.reviewedByName ?? resolveName(entry.item.reviewedByUid) : entry.source === 'handover' ? resolveName(entry.item.reviewedByUid) : resolveName(entry.item.reviewedBy)
  const reviewedAt = entry.item.reviewedAt
  const originalReason = entry.source === 'handover' ? entry.item.note : entry.item.reason
  const decisionReason = entry.source === 'handover' ? undefined : entry.item.reviewReason

  function prepare(action: ReviewDecision['action']) {
    setDecisionEntry(entry)
    setValidationError(null)
    if ((action === 'reject' || action === 'resolve-return') && reason.trim().length < 5) { setValidationError('Enter a decision reason of at least 5 characters.'); return }
    if (action === 'resolve-return') {
      if (entry.source !== 'approval' || entry.item.kind !== 'vendor-return') return
      const amount = Number(credit)
      const paise = Math.round(amount * 100)
      if (outcome === 'vendor-credit' && (!Number.isFinite(amount) || !Number.isSafeInteger(paise) || paise <= 0 || paise > entry.item.sourceReturn.valuePaise)) { setValidationError('Credit must be greater than zero and cannot exceed the return value.'); return }
      if (outcome === 'replacement' && (!/^\d{4}-\d{2}-\d{2}$/.test(replacementDate) || !Number.isFinite(Date.parse(replacementDate)))) { setValidationError('Enter the replacement received date.'); return }
      setConfirmation({ action, returnDecision: { outcome, outcomeReason: reason.trim(), ...(outcome === 'vendor-credit' ? { creditedValuePaise: paise } : {}), ...(outcome === 'replacement' ? { replacementReceivedAt: replacementDate } : {}) } })
    } else setConfirmation({ action, ...(action === 'reject' ? { reason: reason.trim() } : {}), ...(action === 'close-outdated' && sourceProblem ? { outdatedReason: sourceProblem } : {}) })
  }

  function confirmationEffect(decision: ReviewDecision) {
    if (decision.action === 'reject' || decision.action === 'close-outdated') return 'Close this request without changing financial values or stock.'
    if (decision.action === 'mark-reviewed') return 'Record owner acknowledgement. No balances or stock will change.'
    if (decision.action === 'resolve-return') {
      const result = decision.returnDecision!
      return result.outcome === 'vendor-credit' ? `Reduce vendor outstanding by ${money(result.creditedValuePaise! / 100)}. This decision does not adjust POS stock.` : result.outcome === 'replacement' ? `Record replacement received on ${formatDisplayDate(result.replacementReceivedAt!)}. This decision does not automatically receive POS stock or change vendor outstanding.` : 'Reject the vendor return without changing outstanding or POS stock.'
    }
    if (entry.source === 'approval') return entry.item.kind === 'cashout-correction' ? `Apply the proposed cashout values. Cash balance adjustment: ${money(entry.item.cashMovementImpact)}.` : entry.item.kind === 'vendor-settlement-correction' ? `Apply the proposed payment values. Vendor outstanding adjustment: ${money(entry.item.outstandingImpactPaise / 100)}.` : ''
    if (entry.source === 'pos') return entry.item.type === 'void' ? `Historical void request (new posting retired): bill ${entry.item.receiptNumber} (${source ? money(source.bill.totalPaise / 100) : 'Not Recorded'}). Restore mapped product quantities and reverse applicable original payment totals.` : `Record refund ${entry.item.refundAmountPaise === undefined ? 'Not Recorded' : money(entry.item.refundAmountPaise / 100)} via ${paymentLabel(entry.item.refundMethod)}. ${entry.item.returnCondition === 'sellable' ? 'Restore mapped sellable quantities.' : 'Do not restore damaged quantities.'}`
    return ''
  }
  const confirmLabel = confirmation?.action === 'approve' ? 'Confirm Approval' : confirmation?.action === 'reject' ? 'Confirm Rejection' : confirmation?.action === 'close-outdated' ? 'Close Outdated Request' : confirmation?.action === 'mark-reviewed' ? 'Confirm Reviewed' : 'Confirm Return Decision'

  return createPortal(<dialog ref={dialog} onCancel={(event) => { event.preventDefault(); if (!busy) onClose() }} aria-labelledby="action-review-title" className="m-auto max-h-[90dvh] w-[calc(100%_-_1.5rem)] max-w-4xl overflow-hidden rounded-lg border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-slate-950/40">
    <div className="flex max-h-[90dvh] flex-col">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border p-4"><div className="space-y-1"><h2 id="action-review-title" className="text-lg font-bold">{confirmation ? 'Confirm Decision' : actionTypes.find((type) => type.value === entry.type)?.label}</h2><p className="text-sm text-muted-foreground">{entryReference(entry)}</p><Badge variant="outline">{actionStatusLabel(entryStatus(entry))}</Badge></div><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Close</Button></header>
      <div className="min-h-0 space-y-4 overflow-y-auto p-4">
        {unavailable ? <StatusPanel variant="warning">This request is no longer in the loaded queue. Reopen its latest record before making a decision.</StatusPanel> : null}
        {requestLoading ? <p role="status" className="text-sm text-muted-foreground">Loading Required Request Data…</p> : null}
        {requestError ? <StatusPanel variant="destructive" role="alert">{requestError}</StatusPanel> : null}
        {decisionError ? <StatusPanel variant="destructive" role="alert">{decisionError}</StatusPanel> : null}
        {sourceProblem ? <StatusPanel variant="warning">Approval Blocked: {sourceProblem}</StatusPanel> : null}
        {confirmation ? <><dl className="grid gap-3 sm:grid-cols-2"><Field label="Request" value={entryReference(entry)} /><Field label="Requested By" value={entry.requester} /><Field label="Decision" value={confirmation.action === 'resolve-return' ? actionStatusLabel(confirmation.returnDecision!.outcome) : confirmLabel} /><Field label="Decision Reason" value={confirmation.reason ?? confirmation.returnDecision?.outcomeReason} /></dl><StatusPanel variant="warning">{confirmationEffect(confirmation)}</StatusPanel><p className="text-sm text-muted-foreground">Confirm to record this decision using the existing audited workflow.</p></> : <>
          <dl className="grid gap-3 sm:grid-cols-2"><Field label="Requested By" value={entry.requester} /><Field label="Requested At" value={formatDisplayDateTime(entry.submittedAt)} /><Field label="Request Reference" value={entry.item.id} /><Field label="Request Reason" value={originalReason} />{!entry.pending ? <><Field label="Reviewed By" value={reviewedBy} /><Field label="Reviewed At" value={reviewedAt ? formatDisplayDateTime(reviewedAt) : undefined} /><Field label="Decision Reason" value={decisionReason} /></> : null}</dl>
          {entry.source === 'approval' ? <><ApprovalDetails entry={entry} />{paymentSourceId ? <>{sourceLoading ? <p role="status" className="text-sm text-muted-foreground">Loading Source Payment...</p> : null}{sourceError ? <StatusPanel variant="destructive" role="alert">{sourceError}</StatusPanel> : null}<Button size="sm" variant="outline" disabled={busy || sourceLoading} onClick={() => { setSourceLoading(true); setSourceError(null); setVendorSourceReady(false); setRefresh((value) => value + 1) }}>{sourceError ? 'Retry Source' : 'Refresh Source'}</Button></> : null}</> : entry.source === 'handover' ? <HandoverDetails entry={entry} /> : <>{sourceLoading ? <p role="status" className="text-sm text-muted-foreground">Loading Source Bill…</p> : null}{sourceError ? <StatusPanel variant="destructive" role="alert">{sourceError}</StatusPanel> : null}{source && !sourceLoading && !sourceError ? <PosDetails entry={entry} source={source} /> : null}<Button variant="outline" size="sm" disabled={busy || sourceLoading} onClick={() => { setSourceLoading(true); setSourceError(null); setRefresh((value) => value + 1) }}>{sourceError ? 'Retry Source' : 'Refresh Source'}</Button></>}
          {entry.pending && isVendorReturn ? <fieldset disabled={actionsBlocked} className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-2"><legend className="px-1 text-sm font-semibold">Return Decision</legend><FieldLabel label="Outcome"><NativeSelect value={outcome} onChange={(event) => setOutcome(event.target.value as typeof outcome)}><option value="vendor-credit">Vendor Credit</option><option value="replacement">Replacement Received</option><option value="rejected">Reject Return</option></NativeSelect></FieldLabel>{outcome === 'vendor-credit' ? <FieldLabel label="Credit Amount"><Input type="number" min="0.01" step="0.01" value={credit} onChange={(event) => setCredit(event.target.value)} /></FieldLabel> : outcome === 'replacement' ? <FieldLabel label="Replacement Received Date"><Input type="date" value={replacementDate} onChange={(event) => setReplacementDate(event.target.value)} /></FieldLabel> : null}<FieldLabel className="sm:col-span-2" label="Mandatory Decision Reason"><Textarea value={reason} onChange={(event) => setReason(event.target.value)} /></FieldLabel><p className="text-sm text-muted-foreground sm:col-span-2">{outcome === 'vendor-credit' ? `Proposed outstanding reduction: ${Number.isFinite(Number(credit)) ? money(Number(credit)) : 'Enter A Valid Amount'}. No POS stock adjustment.` : outcome === 'replacement' ? 'Records replacement receipt only. Receive stock through GRN when required.' : 'Rejects this return. No outstanding or stock adjustment.'}</p></fieldset> : entry.pending && entry.source !== 'handover' ? <FieldLabel label="Rejection Reason"><Textarea disabled={actionsBlocked} placeholder="Required When Rejecting" value={reason} onChange={(event) => setReason(event.target.value)} /></FieldLabel> : null}
          {validationError ? <StatusPanel variant="destructive" role="alert">{validationError}</StatusPanel> : null}
        </>}
      </div>
      <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border p-4">
        {confirmation ? <><Button variant="outline" disabled={busy} onClick={() => setConfirmation(null)}>Back To Details</Button><Button disabled={!entry.pending || (confirmation.action === 'reject' || confirmation.action === 'close-outdated' ? actionsBlocked : approvalBlocked)} onClick={async () => { const success = await onDecide(decisionEntry, confirmation, source); if (!success) setConfirmation(null) }}>{busy ? 'Processing…' : confirmLabel}</Button></> : entry.pending ? isVendorReturn ? <Button disabled={approvalBlocked} onClick={() => prepare('resolve-return')}>Review Return Decision</Button> : entry.source === 'handover' ? <Button disabled={actionsBlocked} onClick={() => prepare('mark-reviewed')}>Mark Reviewed</Button> : entry.source === 'pos' ? <Button disabled={actionsBlocked} variant="outline" onClick={() => prepare('reject')}>Close legacy request</Button> : <>{entry.source === 'approval' && sourceProblem ? <Button disabled={actionsBlocked} variant="destructive" onClick={() => prepare('close-outdated')}>Close Outdated</Button> : <Button disabled={actionsBlocked} variant="outline" onClick={() => prepare('reject')}>Reject</Button>}<Button disabled={approvalBlocked} onClick={() => prepare('approve')}>Approve</Button></> : <Button variant="outline" onClick={onClose}>Done</Button>}
      </footer>
    </div>
  </dialog>, document.body)
}
