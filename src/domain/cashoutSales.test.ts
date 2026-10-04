import { describe, expect, it } from 'vitest'
import type { DailyCashoutEntry } from './appTypes'
import { cardSalesAfterCashoutChange } from './cashoutSales'

const cashout = (cardSales?: number): DailyCashoutEntry => ({
  id: 'cashout', date: '2026-10-04', recordedBy: 'Owner', cashSales: 0, upiSales: 0,
  ...(cardSales === undefined ? {} : { cardSales }),
  creditSales: 0, returns: 0, cashAudit: 0, actualCashParticulars: '', pendingCashParticulars: '', remainingBalance: 0,
  createdAt: '2026-10-04T00:00:00.000Z',
})

describe('cashout Card sales aggregation', () => {
  it('leaves a legacy sales total unchanged when the record has no Card field', () => {
    expect(cardSalesAfterCashoutChange(750, [cashout()], [cashout()], '2026-10-04')).toBe(750)
  })

  it('applies only the Card difference when a cashout is corrected or removed', () => {
    expect(cardSalesAfterCashoutChange(1_160, [cashout(410)], [cashout(300)], '2026-10-04')).toBe(1_050)
    expect(cardSalesAfterCashoutChange(1_160, [cashout(410)], [], '2026-10-04')).toBe(750)
  })
})
