import { describe, expect, it } from 'vitest'
import type { CashoutCorrectionRequest, DailyCashoutEntry } from '@/domain/appTypes'
import { correctionValuesFromEntry } from '@/domain/cashoutCorrections'
import { deriveApprovalQueue, RECENT_APPROVAL_LIMIT } from './approvalItems'

function cashout(id: string, revision = 1): DailyCashoutEntry {
  return {
    id,
    date: '2026-10-01',
    recordedBy: 'Staff',
    recordedByUserId: 'staff-user',
    cashSales: 1000,
    upiSales: 500,
    creditSales: 100,
    returns: 0,
    cashAudit: 1000,
    cashExpense: 0,
    drawerDenominations: { denom500: 2, denom200: 0, denom100: 0, denom50: 0, denom20: 0, denom10: 0, change: 0 },
    drawerTotal: 1000,
    remainingBalance: 1000,
    actualCashParticulars: '500 x 2 = 1000',
    pendingCashParticulars: '',
    createdAt: '2026-10-01T00:00:00.000Z',
    revision,
  }
}

function request(id: string, entry: DailyCashoutEntry, createdAt: string, status: CashoutCorrectionRequest['status'] = 'pending'): CashoutCorrectionRequest {
  const before = correctionValuesFromEntry(entry)
  return {
    id,
    cashoutId: entry.id,
    cashoutDate: entry.date,
    recordedBy: entry.recordedBy,
    recordedByUserId: entry.recordedByUserId,
    sourceRevision: entry.revision ?? 1,
    before,
    proposed: {
      ...before,
      drawerDenominations: { ...before.drawerDenominations, denom500: 3 },
    },
    reason: 'Correct drawer count',
    requestedByUserId: 'staff-user',
    requestedBy: 'Staff',
    requestType: 'staff-request',
    status,
    createdAt,
    ...(status !== 'pending' ? { reviewedAt: createdAt, reviewedBy: 'Owner', reviewReason: 'Reviewed.' } : {}),
  }
}

describe('deriveApprovalQueue', () => {
  it('orders pending requests oldest first and calculates drawer impact', () => {
    const entry = cashout('cashout-1')
    const queue = deriveApprovalQueue([
      request('newer', entry, '2026-10-02T00:00:00.000Z'),
      request('older', entry, '2026-10-01T00:00:00.000Z'),
    ], [entry])

    expect(queue.pending.map((item) => item.id)).toEqual(['older', 'newer'])
    expect(queue.pendingCount).toBe(2)
    expect(queue.pending[0].beforeDrawer).toBe(1000)
    expect(queue.pending[0].proposedDrawer).toBe(1500)
    expect(queue.pending[0].cashMovementImpact).toBe(500)
    expect(queue.pending[0].isStale).toBe(false)
  })

  it('marks missing, revised, and changed source cashouts as stale', () => {
    const original = cashout('cashout-1')
    const pending = request('request-1', original, '2026-10-01T00:00:00.000Z')
    const revised = cashout('cashout-1', 2)
    const changed = { ...original, cashSales: 1200 }

    expect(deriveApprovalQueue([pending], []).pending[0].isStale).toBe(true)
    expect(deriveApprovalQueue([pending], [revised]).pending[0].staleReason).toContain('revision')
    expect(deriveApprovalQueue([pending], [changed]).pending[0].staleReason).toContain('values')
  })

  it('keeps only the latest 20 completed decisions', () => {
    const entry = cashout('cashout-1')
    const reviewed = Array.from({ length: RECENT_APPROVAL_LIMIT + 5 }, (_, index) =>
      request(`reviewed-${index}`, entry, `2026-10-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`, 'approved'))
    const queue = deriveApprovalQueue(reviewed, [entry])

    expect(queue.recent).toHaveLength(RECENT_APPROVAL_LIMIT)
    expect(queue.recent[0].id).toBe('reviewed-24')
    expect(queue.recent.at(-1)?.id).toBe('reviewed-5')
  })
})
