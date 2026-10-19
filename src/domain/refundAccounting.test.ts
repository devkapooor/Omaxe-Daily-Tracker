import { describe, expect, it } from 'vitest'
import type { Cashout, DailySales } from './financeTypes'
import type { DailyCashoutEntry } from './appTypes'
import { isPosRefundExpense, ordinaryExpenseAmount, recordedNetSales } from './refundAccounting'
import { cashoutEntryFromCorrection, correctionValuesFromEntry, drawerTotalFromDenominations } from './cashoutCorrections'
import { deriveMonthlyPerformance } from '@/features/dashboard/domain/deriveMonthlyPerformance'
import type { FinanceData } from './financeTypes'

describe('refund-specific financial consumer compatibility', () => {
  it('shows refund cash outflow but excludes it from operating expense, retaining old sources', () => {
    const refund = { id: 'pos-refund-fixture', sourceKind: 'pos-return', amount: 90 } as Cashout
    expect(isPosRefundExpense(refund)).toBe(true); expect(ordinaryExpenseAmount(refund)).toBe(0)
    expect(ordinaryExpenseAmount({ amount: 30 } as Cashout)).toBe(30)
    expect(recordedNetSales({ totalSales: 180, returnsDiscounts: 90 } as DailySales)).toBe(180)
    expect(recordedNetSales({ totalSales: 180, returnsDiscounts: 90, refundAccountingVersion: 1, netSalesAmount: 90 } as DailySales)).toBe(90)
  })
  it('preserves199-paise refund/coin evidence through legitimate ordinary-expense corrections', () => {
    const entry = { id: 'new-close', date: '2026-10-14', cashSales: 3, upiSales: 0, cardSales: 0, creditSales: 0, returns: 1.99, cashExpense: 1.99, cashAudit: 1001.01, drawerTotal: 1001.01, remainingBalance: 1001.01, drawerDenominations: { denom500: 2, denom200: 0, denom100: 0, denom50: 0, denom20: 0, denom10: 0, change: 1.01 }, refundAccountingVersion: 1, posCashRefundPaise: 199, posRefundDayTotalPaise: 199, posRefundDayRevision: 1, posSourceHandoverRevision: 3, posRefundQuoteId: 'fixture-proof', recordedBy: 'Synthetic billing', actualCashParticulars: '', pendingCashParticulars: '', createdAt: '2026-10-13T23:30:00Z', revision: 1 } as DailyCashoutEntry
    const values = correctionValuesFromEntry(entry)
    expect(values.returns).toBe(1.99); expect(values.cashExpense).toBe(1.99); expect(values.drawerDenominations.change).toBe(1.01)
    expect(drawerTotalFromDenominations(values.drawerDenominations, true)).toBe(1001.01)
    const changed = cashoutEntryFromCorrection(entry, { ...values, cashExpense: 2.99 }, 'Synthetic owner', '2026-10-14T01:00:00Z')
    expect(changed.returns).toBe(1.99); expect(changed.posCashRefundPaise).toBe(199); expect(changed.posRefundQuoteId).toBe('fixture-proof'); expect(changed.cashExpense).toBe(2.99)
    expect(() => cashoutEntryFromCorrection(entry, { ...values, returns: 0 }, 'owner', 'now')).toThrow(/refund totals/)
    expect(() => cashoutEntryFromCorrection(entry, { ...values, cashExpense: 1 }, 'owner', 'now')).toThrow(/refund totals/)
  })
  it('monthly operating results use net90 and zero operating expense while retaining1090 physical closing cash', () => {
    const data = { stores: [], purchases: [], payments: [], sales: [{ id: 'new', storeId: 'single-store', date: '2026-10-14', cashSales: 180, upiSales: 0, cardSales: 0, bankTransferSales: 0, creditSales: 0, notes: '', createdAt: '2026-10-14T00:00:00Z', updatedAt: '2026-10-14T00:00:00Z', totalSales: 180, refundAccountingVersion: 1, netSalesAmount: 90, returnsDiscounts: 90 }], cashouts: [{ id: 'linked', storeId: 'single-store', date: '2026-10-14', paidTo: 'Synthetic customer', category: 'POS Refund', paymentMode: 'Cash', approvedBy: '', notes: '', createdAt: '2026-10-14T00:00:00Z', updatedAt: '2026-10-14T00:00:00Z', sourceKind: 'pos-return', amount: 90 }] } as FinanceData
    const result = deriveMonthlyPerformance({ data, dailyCashouts: [{ date: '2026-10-14', drawerTotal: 1090, cashSales: 180, upiSales: 0, cardSales: 0, creditSales: 0, returns: 90 } as DailyCashoutEntry], currentDate: '2026-10-14', dashboardMonthOffset: 0, marginPercentage: 25, monthlyOperationalExpense: 0 })
    expect(result.sales).toBe(90); expect(result.expenses).toBe(0); expect(result.operatingBalance).toBe(90); expect(result.cashCollected).toBe(1090); expect(result.salesMix).toEqual({ cash: 180, upi: 0, card: 0, credit: 0, returns: 90 }); expect(result.dailySalesTrend[13].selected).toBe(90)
  })
})
