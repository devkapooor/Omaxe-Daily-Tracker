import type { CashoutCorrectionRequest, CashoutCorrectionValues, DailyCashoutEntry } from '@/domain/appTypes'
import {
  cashoutCorrectionValuesEqual,
  correctionValuesFromEntry,
  drawerTotalFromDenominations,
} from '@/domain/cashoutCorrections'

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

export type ApprovalActionItem = CashoutCorrectionApprovalItem

export type ApprovalQueue = {
  pending: ApprovalActionItem[]
  recent: ApprovalActionItem[]
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
): ApprovalQueue {
  const cashoutsById = new Map(dailyCashouts.map((entry) => [entry.id, entry]))
  const items = requests.map((request) => toCashoutCorrectionItem(request, cashoutsById))
  const pending = items
    .filter((item) => item.status === 'pending')
    .sort((left, right) => left.submittedAt.localeCompare(right.submittedAt))
  const recent = items
    .filter((item) => item.status !== 'pending')
    .sort((left, right) => (right.reviewedAt ?? right.submittedAt).localeCompare(left.reviewedAt ?? left.submittedAt))
    .slice(0, RECENT_APPROVAL_LIMIT)

  return { pending, recent, pendingCount: pending.length }
}
