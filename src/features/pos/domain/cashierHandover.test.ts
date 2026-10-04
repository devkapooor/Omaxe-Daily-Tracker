import { describe, expect, it } from 'vitest'
import { applyPayments, countCash, expectedHandover, handoverDate, requiresLoginHandover, seedHandoverTotals, type HandoverLedger } from './cashierHandover'
import type { PosBill } from './types'

const ledger = (): HandoverLedger => ({ initialized: true, revision: 1, cashNetPaise: 10000, dailyTotals: { '2026-10-04': { upi: 20000, card: 30000 } }, lastOperation: 'initialize', lastOperationId: '', updatedByUid: 'owner' })
const bill = (id: string, createdAt: string, payments = [{ method: 'cash' as const, amountPaise: 10000 }]) => ({ id, createdAt, payments } as PosBill)
describe('Shared cashier handover accounting', () => {
  const cashier = { uid: 'billing', authTime: 123, needsLogoutCheck: true, lastBillId: 'bill', lastReconciliationId: '', updatedAt: '' }
  it('does not gate a dashboard-only account', () => expect(requiresLoginHandover(null, false, 123, null)).toBe(false))
  it('requires counts for historical participants and new authentication', () => {
    expect(requiresLoginHandover(null, true, 123, null)).toBe(true)
    expect(requiresLoginHandover(cashier, true, 456, 123)).toBe(true)
  })
  it('preserves a refresh but requires recovery count in a new browser session', () => {
    expect(requiresLoginHandover(cashier, true, 123, 123)).toBe(false)
    expect(requiresLoginHandover(cashier, true, 123, null)).toBe(true)
  })
  it('requires a new opening count after a completed logout even with the old token', () => {
    expect(requiresLoginHandover({ ...cashier, needsLogoutCheck: false, closed: true }, true, 123, 123)).toBe(true)
  })
  it('uses IST midnight rather than UTC midnight', () => {
    expect(handoverDate('2026-10-03T18:29:59.000Z')).toBe('2026-10-03')
    expect(handoverDate('2026-10-03T18:30:00.000Z')).toBe('2026-10-04')
  })
  it('counts denominations and loose coins in integer paise', () => expect(countCash({ '500': 2, '10': 3, '1': 2 }, 50)).toBe(103250))
  it.each([-1, 0.5, NaN])('rejects invalid denomination count %s', (value) => expect(() => countCash({ '500': value }, 0)).toThrow())
  it('rejects fractional paise and overflowing amounts', () => {
    expect(() => countCash({}, 0.5)).toThrow()
    expect(() => countCash({ '500': Number.MAX_SAFE_INTEGER }, 0)).toThrow()
  })
  it('starts at zero cash and machine baseline', () => expect(expectedHandover(ledger(), '2026-10-04')).toEqual({ cash: 10000, upi: 20000, card: 30000 }))
  it('carries accepted actual readings forward without altering the sales ledger', () => {
    const state = ledger()
    state.checkpoint = { cashActualPaise: 9000, cashNetPaise: 10000, date: '2026-10-04', upiActualPaise: 19000, cardActualPaise: 30000, upiNetPaise: 20000, cardNetPaise: 30000, reconciliationId: 'r1' }
    applyPayments(state, [{ method: 'cash', amountPaise: 500 }, { method: 'upi', amountPaise: 1000 }], '2026-10-04', 1)
    expect(expectedHandover(state, '2026-10-04')).toEqual({ cash: 9500, upi: 20000, card: 30000 })
    expect(state.cashNetPaise).toBe(10500)
  })
  it('resets terminal expected readings daily but carries physical cash', () => {
    const state = ledger()
    state.checkpoint = { cashActualPaise: 9000, cashNetPaise: 10000, date: '2026-10-04', upiActualPaise: 19000, cardActualPaise: 30000, upiNetPaise: 20000, cardNetPaise: 30000, reconciliationId: 'r1' }
    applyPayments(state, [{ method: 'cash', amountPaise: 500 }, { method: 'upi', amountPaise: 1000 }], '2026-10-05', 1)
    expect(expectedHandover(state, '2026-10-05')).toEqual({ cash: 9500, upi: 1000, card: 0 })
  })
  it('excludes pre-midnight trial bills without editing input', () => {
    const bills = [bill('old', '2026-10-03T18:29:59.000Z'), bill('new', '2026-10-03T18:30:00.000Z')]
    expect(seedHandoverTotals(bills, [], []).cashNetPaise).toBe(10000)
    expect(bills).toHaveLength(2)
  })
  it('refunds reduce shared balances by the actual approval day', () => {
    const seeded = seedHandoverTotals([bill('b1', '2026-10-03T18:30:00.000Z')], [], [{ id: 'refund', type: 'bill-return-approved', createdAt: '2026-10-04T20:00:00.000Z', refundMethod: 'cash', refundAmountPaise: 2500 }])
    expect(seeded.cashNetPaise).toBe(7500)
  })
  it('void reversals reduce the void day rather than rewriting receipt dates', () => {
    const seeded = seedHandoverTotals([bill('b1', '2026-10-03T18:30:00.000Z', [{ method: 'upi', amountPaise: 10000 }] as never)], [{ billId: 'b1', state: 'voided', revision: 2 }], [{ id: 'v1', billId: 'b1', type: 'bill-voided', createdAt: '2026-10-04T20:00:00.000Z' }])
    expect(seeded.dailyTotals['2026-10-04'].upi).toBe(10000)
    expect(seeded.dailyTotals['2026-10-05'].upi).toBe(-10000)
  })
})
