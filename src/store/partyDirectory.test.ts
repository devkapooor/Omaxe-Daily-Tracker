import { describe, expect, it, vi } from 'vitest'
vi.mock('@/shared/lib/serverClock', () => ({ serverNowIso: () => '2026-10-29T09:00:00Z', serverNowDate: () => new Date('2026-10-29T09:00:00Z') }))
import { deriveDirectoryOptions } from './deriveWorkspaceMetrics'
import type { Cashout, Payment } from '@/domain/financeTypes'
import type { LoanEntry, UserAccount, VendorRecord } from '@/domain/appTypes'

describe('directory cleanup protects real identities without rewriting records', () => {
  it('preserves saved, loan, payment and user names, including supplier-name collisions', () => {
    const source = {
      financeData: { stores: [], sales: [], purchases: [], payments: [{ partyName: 'Payment Person' } as Payment], cashouts: [
        { paidTo: 'Airtel Recharge', sourceKind: 'expense' }, { paidTo: 'Farhan Porter', sourceKind: 'expense' },
        { paidTo: 'Tally India', sourceKind: 'expense' }, { paidTo: 'Customer refund TNS-123', sourceKind: 'pos-return' },
      ] as Cashout[] },
      loans: [{ personName: 'Loan Person' } as LoanEntry], users: [{ name: 'User Person' } as UserAccount],
      vendors: [{ id: 'vendor', name: 'Shared Name' } as VendorRecord],
      nameDirectory: { people: ['Real Party', 'Shared Name', 'Salary'], vendors: [] },
    }
    const before = JSON.stringify(source), result = deriveDirectoryOptions(source)
    for (const name of ['Real Party', 'Shared Name', 'Salary', 'Loan Person', 'Payment Person', 'User Person']) {
      expect(result.party).toContain(name); expect(result.realParties).toContain(name)
    }
    expect(result.vendors).toContain('Shared Name')
    expect(result.party).not.toContain('Airtel Recharge'); expect(result.party).not.toContain('Farhan Porter')
    expect(result.party).not.toContain('Customer refund TNS-123')
    expect(result.references).toEqual(['Tally India'])
    expect(result.realParties).not.toContain('Tally India')
    expect(JSON.stringify(source)).toBe(before)
  })
})
