import type { UserAccount } from '@/domain/appTypes'
import type { CashierReconciliation } from '@/features/pos/domain/cashierHandover'
import type { PosApprovalRequest } from '@/features/pos/domain/types'
import type { ApprovalActionItem, ApprovalQueue } from './approvalItems'

export const actionTypes = [
  { value: 'cashout-correction', label: 'Cashout Correction' },
  { value: 'vendor-settlement-correction', label: 'Vendor Payment Correction' },
  { value: 'vendor-return', label: 'Vendor Return' },
  { value: 'pos-void', label: 'POS Void' },
  { value: 'pos-return', label: 'POS Return' },
  { value: 'handover', label: 'Handover Review' },
] as const

export type ActionType = typeof actionTypes[number]['value']
type EntrySummary = { key: string; type: ActionType; requester: string; submittedAt: string; historyAt: string; pending: boolean; searchText: string }
export type ActionCentreEntry = EntrySummary & (
  | { source: 'approval'; item: ApprovalActionItem }
  | { source: 'pos'; item: PosApprovalRequest }
  | { source: 'handover'; item: CashierReconciliation }
)

const statusLabels: Record<string, string> = {
  pending: 'Pending', approved: 'Approved', rejected: 'Rejected', withdrawn: 'Withdrawn', stale: 'Outdated',
  reviewed: 'Reviewed', matched: 'Matched', 'vendor-credit': 'Vendor Credit', replacement: 'Replacement Received',
}
export const actionStatusLabel = (status: string) => statusLabels[status] ?? status

export function actionCentreEntries(queue: ApprovalQueue, pos: PosApprovalRequest[], handovers: CashierReconciliation[], users: UserAccount[]): ActionCentreEntry[] {
  const names = new Map(users.map((user) => [user.id, user.name]))
  const name = (value: string) => names.get(value) ?? value
  const approvals: ActionCentreEntry[] = [...queue.pending, ...queue.recent].map((item) => ({
    key: `approval:${item.kind}:${item.id}`, type: item.kind, source: 'approval', item,
    requester: name(item.requester), submittedAt: item.submittedAt, historyAt: item.reviewedAt ?? item.submittedAt,
    pending: item.status === 'pending',
    searchText: [name(item.requester), item.reason, item.reviewReason, item.id, item.kind === 'cashout-correction' ? `${item.cashoutDate} ${item.recordedBy}` : item.vendorName].join(' '),
  }))
  const posEntries: ActionCentreEntry[] = pos.map((item) => ({
    key: `pos:${item.id}`, type: item.type === 'void' ? 'pos-void' : 'pos-return', source: 'pos', item,
    requester: item.requestedByName, submittedAt: item.requestedAt, historyAt: item.reviewedAt ?? item.requestedAt,
    pending: item.status === 'pending', searchText: [item.receiptNumber, item.requestedByName, item.reason, item.reviewReason].join(' '),
  }))
  const handoverEntries: ActionCentreEntry[] = handovers.map((item) => ({
    key: `handover:${item.id}`, type: 'handover', source: 'handover', item,
    requester: item.name, submittedAt: item.createdAt, historyAt: item.reviewedAt ?? item.createdAt,
    pending: item.reviewStatus === 'pending', searchText: [item.name, item.date, item.kind, item.note].join(' '),
  }))
  return [...approvals, ...posEntries, ...handoverEntries]
}

export function filterActionCentreEntries(entries: ActionCentreEntry[], tab: 'pending' | 'history', type: string, requester: string, search: string) {
  const terms = search.trim().toLocaleLowerCase('en-IN').split(/\s+/).filter(Boolean)
  return entries.filter((entry) => entry.pending === (tab === 'pending')
    && (!type || entry.type === type) && (!requester || entry.requester === requester)
    && terms.every((term) => entry.searchText.toLocaleLowerCase('en-IN').includes(term)))
    .sort((left, right) => (tab === 'pending'
      ? left.submittedAt.localeCompare(right.submittedAt)
      : right.historyAt.localeCompare(left.historyAt)) || left.key.localeCompare(right.key))
}
