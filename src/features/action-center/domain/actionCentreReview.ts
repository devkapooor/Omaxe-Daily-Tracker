import type { PosApprovalRequest, PosBill, PosBillState } from '@/features/pos/domain/types'
import type { ActionCentreEntry } from './actionCentreEntries'
import { OUTDATED_CORRECTION_REASON, OUTDATED_VENDOR_CORRECTION_REASON } from './approvalItems'

export type PosReviewSource = { bill: PosBill; state: PosBillState; loadedAt: string }
export type ReturnDecision = { outcome: 'vendor-credit' | 'replacement' | 'rejected'; outcomeReason: string; creditedValuePaise?: number; replacementReceivedAt?: string }
export type ReviewDecision = { action: 'approve' | 'reject' | 'close-outdated' | 'mark-reviewed' | 'resolve-return'; reason?: string; outdatedReason?: string; returnDecision?: ReturnDecision }

export function paymentLabel(method?: string) {
  return ({ cash: 'Cash', upi: 'UPI', card: 'Card', 'bank-transfer': 'Bank Transfer' } as Record<string, string>)[method ?? ''] ?? (method || 'Not Recorded')
}

export function entryStatus(entry: ActionCentreEntry) {
  if (entry.source === 'approval' && entry.item.status === 'rejected' && (entry.item.reviewReason === OUTDATED_CORRECTION_REASON || entry.item.reviewReason === OUTDATED_VENDOR_CORRECTION_REASON)) return 'stale'
  return entry.source === 'handover' ? entry.item.reviewStatus : entry.item.status
}

export function entryReference(entry: ActionCentreEntry) {
  return entry.source === 'pos' ? entry.item.receiptNumber : entry.source === 'handover' ? `${entry.item.name} · ${entry.item.kind === 'login' ? 'Login' : 'Logout'}` : entry.item.kind === 'cashout-correction' ? entry.item.cashoutDate : entry.item.vendorName
}

export function posSourceProblem(request: PosApprovalRequest, source: PosReviewSource) {
  if (source.bill.id !== request.billId || source.state.billId !== request.billId || source.bill.createdAt !== request.sourceBillCreatedAt) return 'The source bill does not match this request.'
  if (source.state.revision !== request.sourceBillRevision || source.state.state === 'voided') return 'The bill changed after this request was submitted. Reject this outdated request and ask staff to submit a new one.'
  const quantities = new Map((request.returnLines ?? []).map((line) => [line.lineId, line.quantity]))
  const lines = source.bill.lines.filter((line) => request.type === 'void' || quantities.has(line.id))
  if (!lines.length || (request.type === 'return' && lines.length !== quantities.size)) return 'The requested items are missing from the source bill.'
  if (lines.some((line) => {
    const quantity = request.type === 'void' ? line.quantity : quantities.get(line.id) ?? 0
    return !Number.isSafeInteger(quantity) || quantity <= 0 || quantity + (source.state.returnedQuantities?.[line.id] ?? 0) > line.quantity
  })) return 'The requested quantities are no longer available on this bill.'
  return null
}
