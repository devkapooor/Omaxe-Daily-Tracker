import { describe, expect, it } from 'vitest'
import type { DailyCashoutEntry } from '@/domain/appTypes'
import { dailyCashoutSearchText, normalizeLogSearchText } from './logTableSearch'

describe('normalizeLogSearchText', () => {
  it('makes staff names case-insensitive and whitespace-tolerant', () => {
    expect(normalizeLogSearchText('  Pawan   Kumar ')).toBe('pawan kumar')
    expect(normalizeLogSearchText('PAWAN')).toContain('pawan')
  })

  it('keeps dates searchable while normalizing accented names', () => {
    expect(normalizeLogSearchText('28/09/2026 Farhán')).toBe('28/09/2026 farhan')
  })

  it('indexes a cashout recorder so partial name searches match', () => {
    const entry: DailyCashoutEntry = {
      id: 'cashout-1',
      date: '2026-09-28',
      recordedBy: 'Pawan Kumar',
      cashSales: 1000,
      upiSales: 0,
      creditSales: 0,
      returns: 0,
      cashAudit: 1000,
      remainingBalance: 1000,
      actualCashParticulars: '500 x 2',
      pendingCashParticulars: '',
      createdAt: '2026-09-28T18:30:00.000Z',
    }

    expect(normalizeLogSearchText(dailyCashoutSearchText(entry))).toContain('pawan kumar')
    expect(normalizeLogSearchText(dailyCashoutSearchText(entry))).toContain('28/09/2026')
  })
})
