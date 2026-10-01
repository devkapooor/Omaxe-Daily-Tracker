import type { CashoutCorrectionRequest, CashoutCorrectionValues, DailyCashoutEntry } from '@/domain/appTypes'
import {
  cashoutCorrectionValuesEqual,
  correctionValuesFromEntry,
  drawerTotalFromDenominations,
} from '@/domain/cashoutCorrections'
import {
  settlementCorrectionValuesEqualV2,
  settlementCorrectionValuesV2,
  type VendorLedgerCorrectionRequestV2,
  type VendorReturnV2,
  type VendorSettlementStateV2,
} from '@/domain/vendorLedgerV2'

export const OUTDATED_CORRECTION_REASON = 'Closed as outdated because the source cashout changed after submission.'
export const RECENT_APPROVAL_LIMIT = 20

export type CashoutCorrectionApprovalItem = {
  kind: 'cashout-correction'
  id: string
  status: CashoutCorrectionRequest['status']
  submittedAt: string
  requester: string
  reason: string
  cashoutDate: string
  recordedBy: string
  before: CashoutCorrectionValues
  proposed: CashoutCorrectionValues
  beforeDrawer: number
  proposedDrawer: number
  cashMovementImpact: number
  isStale: boolean
  staleReason?: string
  reviewedAt?: string
  reviewedBy?: string
  reviewReason?: string
  sourceRequest: CashoutCorrectionRequest
  sourceCashout?: DailyCashoutEntry
}

export type VendorSettlementCorrectionApprovalItem = {
  kind: 'vendor-settlement-correction'
  id: string
  status: VendorLedgerCorrectionRequestV2['status']
  submittedAt: string
  requester: string
  reason: string
  vendorId: string
  vendorName: string
  before: VendorLedgerCorrectionRequestV2['before']
  proposed: VendorLedgerCorrectionRequestV2['proposed']
  outstandingImpactPaise: number
  isStale: boolean
  staleReason?: string
  reviewedAt?: string
  reviewedBy?: string
  reviewReason?: string
  sourceRequest: VendorLedgerCorrectionRequestV2
}

export type VendorReturnApprovalItem = {
  kind: 'vendor-return'
  id: string
  status: VendorReturnV2['outcome']
  submittedAt: string
  requester: string
  reason: string
  vendorId: string
  vendorName: string
  sourceReturn: VendorReturnV2
  isStale: boolean
  staleReason?: string
  reviewedAt?: string
  reviewedBy?: string
  reviewReason?: string
}

export type ApprovalActionItem = CashoutCorrectionApprovalItem | VendorSettlementCorrectionApprovalItem | VendorReturnApprovalItem

export type ApprovalQueue = {
  pending: ApprovalActionItem[]
  recent: ApprovalActionItem[]
  pendingCount: number
}

export type CashoutApprovalQueue = {
  pending: CashoutCorrectionApprovalItem[]
  recent: CashoutCorrectionApprovalItem[]
  pendingCount: number
}

function cashoutStaleness(request: CashoutCorrectionRequest, cashout?: DailyCashoutEntry) {
  if (!cashout) return { isStale: true, staleReason: 'The source cashout no longer exists.' }
  if ((cashout.revision ?? 1) !== request.sourceRevision) {
    return { isStale: true, staleReason: 'The cashout revision changed after this request was submitted.' }
  }
  if (!cashoutCorrectionValuesEqual(correctionValuesFromEntry(cashout), request.before)) {
    return { isStale: true, staleReason: 'The saved cashout values changed after this request was submitted.' }
  }
  return { isStale: false }
}

function toCashoutCorrectionItem(
  request: CashoutCorrectionRequest,
  cashoutsById: Map<string, DailyCashoutEntry>,
): CashoutCorrectionApprovalItem {
  const sourceCashout = cashoutsById.get(request.cashoutId)
  const beforeDrawer = drawerTotalFromDenominations(request.before.drawerDenominations)
  const proposedDrawer = drawerTotalFromDenominations(request.proposed.drawerDenominations)
  const stale = request.status === 'pending' ? cashoutStaleness(request, sourceCashout) : { isStale: false }

  return {
    kind: 'cashout-correction',
    id: request.id,
    status: request.status,
    submittedAt: request.createdAt,
    requester: request.requestedBy,
    reason: request.reason,
    cashoutDate: request.cashoutDate,
    recordedBy: request.recordedBy,
    before: request.before,
    proposed: request.proposed,
    beforeDrawer,
    proposedDrawer,
    cashMovementImpact: proposedDrawer - beforeDrawer,
    ...stale,
    ...(request.reviewedAt ? { reviewedAt: request.reviewedAt } : {}),
    ...(request.reviewedBy ? { reviewedBy: request.reviewedBy } : {}),
    ...(request.reviewReason ? { reviewReason: request.reviewReason } : {}),
    sourceRequest: request,
    ...(sourceCashout ? { sourceCashout } : {}),
  }
}

export function deriveApprovalQueue(
  requests: CashoutCorrectionRequest[],
  dailyCashouts: DailyCashoutEntry[],
): CashoutApprovalQueue
export function deriveApprovalQueue(
  requests: CashoutCorrectionRequest[],
  dailyCashouts: DailyCashoutEntry[],
  vendor: {
    correctionRequests: VendorLedgerCorrectionRequestV2[]
    returns: VendorReturnV2[]
    settlementStates: VendorSettlementStateV2[]
    vendorNames: Record<string, string>
  },
): ApprovalQueue
export function deriveApprovalQueue(
  requests: CashoutCorrectionRequest[],
  dailyCashouts: DailyCashoutEntry[],
  vendor?: {
    correctionRequests: VendorLedgerCorrectionRequestV2[]
    returns: VendorReturnV2[]
    settlementStates: VendorSettlementStateV2[]
    vendorNames: Record<string, string>
  },
): ApprovalQueue | CashoutApprovalQueue {
  const cashoutsById = new Map(dailyCashouts.map((entry) => [entry.id, entry]))
  const cashoutItems = requests.map((request) => toCashoutCorrectionItem(request, cashoutsById))
  const stateById = new Map((vendor?.settlementStates ?? []).map((state) => [state.id, state]))
  const correctionItems: VendorSettlementCorrectionApprovalItem[] = (vendor?.correctionRequests ?? []).map((request) => {
    const state = stateById.get(request.sourceRecordId)
    const staleReason = !state
      ? 'The source vendor payment no longer exists.'
      : state.revision !== request.sourceRevision
        ? 'The vendor payment revision changed after this request was submitted.'
        : !settlementCorrectionValuesEqualV2(settlementCorrectionValuesV2(state), request.before)
          ? 'The saved vendor payment values changed after this request was submitted.'
          : undefined
    return {
      kind: 'vendor-settlement-correction',
      id: request.id,
      status: request.status,
      submittedAt: request.createdAt,
      requester: request.requestedBy,
      reason: request.reason,
      vendorId: request.vendorId,
      vendorName: vendor?.vendorNames[request.vendorId] ?? request.vendorId,
      before: request.before,
      proposed: request.proposed,
      outstandingImpactPaise: request.before.amountPaise - request.proposed.amountPaise,
      isStale: request.status === 'pending' && Boolean(staleReason),
      ...(staleReason ? { staleReason } : {}),
      ...(request.reviewedAt ? { reviewedAt: request.reviewedAt } : {}),
      ...(request.reviewedBy ? { reviewedBy: request.reviewedBy } : {}),
      ...(request.reviewReason ? { reviewReason: request.reviewReason } : {}),
      sourceRequest: request,
    }
  })
  const returnItems: VendorReturnApprovalItem[] = (vendor?.returns ?? []).map((vendorReturn) => ({
    kind: 'vendor-return',
    id: vendorReturn.id,
    status: vendorReturn.outcome,
    submittedAt: vendorReturn.createdAt,
    requester: vendorReturn.createdByUserId,
    reason: vendorReturn.reason,
    vendorId: vendorReturn.vendorId,
    vendorName: vendor?.vendorNames[vendorReturn.vendorId] ?? vendorReturn.vendorId,
    sourceReturn: vendorReturn,
    isStale: false,
    ...(vendorReturn.reviewedAt ? { reviewedAt: vendorReturn.reviewedAt } : {}),
    ...(vendorReturn.reviewedBy ? { reviewedBy: vendorReturn.reviewedBy } : {}),
    ...(vendorReturn.outcomeReason ? { reviewReason: vendorReturn.outcomeReason } : {}),
  }))
  const items: ApprovalActionItem[] = [...cashoutItems, ...correctionItems, ...returnItems]
  const pending = items
    .filter((item) => item.status === 'pending')
    .sort((left, right) => left.submittedAt.localeCompare(right.submittedAt))
  const recent = items
    .filter((item) => item.status !== 'pending')
    .sort((left, right) => (right.reviewedAt ?? right.submittedAt).localeCompare(left.reviewedAt ?? left.submittedAt))
    .slice(0, RECENT_APPROVAL_LIMIT)

  return { pending, recent, pendingCount: pending.length }
}
