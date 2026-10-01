import { describe, expect, it } from 'vitest'
import type { DailyCashoutEntry } from '@/domain/appTypes'
import type { DailySales, FinanceData } from '@/domain/financeTypes'
import { deriveMonthlyPerformance } from './deriveMonthlyPerformance'

function sale(id: string, date: string, totalSales: number): DailySales {
  return {
    id,
    storeId: 'single-store',
    date,
    totalSales,
    cashSales: totalSales,
    upiSales: 0,
    cardSales: 0,
    bankTransferSales: 0,
    creditSales: 0,
    returnsDiscounts: 0,
    notes: '',
    createdAt: `${date}T00:00:00.000Z`,
    updatedAt: `${date}T00:00:00.000Z`,
  }
}

function dailyCashout(id: string, date: string, drawerTotal: number): DailyCashoutEntry {
  return {
    id,
    date,
    recordedBy: 'Staff',
    cashSales: drawerTotal,
    upiSales: 0,
    creditSales: 0,
    returns: 0,
    cashAudit: drawerTotal,
    drawerTotal,
    remainingBalance: drawerTotal,
    actualCashParticulars: '',
    pendingCashParticulars: '',
    createdAt: `${date}T00:00:00.000Z`,
  }
}

const data: FinanceData = {
  stores: [],
  purchases: [],
  payments: [],
  cashouts: [
    {
      id: 'expense-oct',
      storeId: 'single-store',
      date: '2026-10-02',
      paidTo: 'Supplier',
      amount: 20_000,
      category: 'Maintenance',
      paymentMode: 'Cash',
      approvedBy: 'Owner',
      notes: '',
      createdAt: '2026-10-02T00:00:00.000Z',
      updatedAt: '2026-10-02T00:00:00.000Z',
    },
  ],
  sales: [
    sale('oct-1', '2026-10-01', 100_000),
    sale('oct-3-a', '2026-10-03', 100_000),
    sale('oct-3-b', '2026-10-03', 50_000),
    sale('sep-1', '2026-09-01', 75_000),
    sale('sep-3', '2026-09-03', 125_000),
  ],
}

const cashouts = [
  dailyCashout('cashout-oct-1', '2026-10-01', 80_000),
  dailyCashout('cashout-oct-3-a', '2026-10-03', 90_000),
  dailyCashout('cashout-oct-3-b', '2026-10-03', 10_000),
  dailyCashout('cashout-sep-1', '2026-09-01', 70_000),
]

describe('deriveMonthlyPerformance', () => {
  it('derives current-month break-even, daily trends, and neutral record coverage', () => {
    const result = deriveMonthlyPerformance({
      currentDate: '2026-10-10',
      dashboardMonthOffset: 0,
      dailyCashouts: cashouts,
      data,
      marginPercentage: 20,
      monthlyOperationalExpense: 100_000,
    })

    expect(result.sales).toBe(250_000)
    expect(result.breakEven).toEqual({
      breakEvenSales: 500_000,
      progressPercentage: 50,
      amountRemaining: 250_000,
      requiredDailySales: 250_000 / 22,
      remainingDays: 22,
      attained: false,
    })
    expect(result.dailySalesTrend).toHaveLength(10)
    expect(result.dailySalesTrend[0]).toEqual({ day: 1, selected: 100_000, previous: 75_000 })
    expect(result.dailySalesTrend[1]).toEqual({ day: 2, selected: null, previous: null })
    expect(result.dailySalesTrend[2]).toEqual({ day: 3, selected: 150_000, previous: 125_000 })
    expect(result.recordingHealth.sales).toEqual({ recordedDays: 2, coverageDays: 10, latestDate: '2026-10-03' })
    expect(result.recordingHealth.cashouts).toEqual({ recordedDays: 2, coverageDays: 10, latestDate: '2026-10-03' })
  })

  it('uses the full calendar month and removes daily requirements for completed months', () => {
    const result = deriveMonthlyPerformance({
      currentDate: '2026-10-10',
      dashboardMonthOffset: 1,
      dailyCashouts: cashouts,
      data,
      marginPercentage: 20,
      monthlyOperationalExpense: 100_000,
    })

    expect(result.monthKey).toBe('2026-09')
    expect(result.isCurrentMonth).toBe(false)
    expect(result.dailySalesTrend).toHaveLength(30)
    expect(result.recordingHealth.sales.coverageDays).toBe(30)
    expect(result.breakEven.requiredDailySales).toBeNull()
    expect(result.breakEven.remainingDays).toBeNull()
  })

  it('returns an unavailable break-even state when margin is zero', () => {
    const result = deriveMonthlyPerformance({
      currentDate: '2026-10-10',
      dashboardMonthOffset: 0,
      dailyCashouts: [],
      data: { stores: [], purchases: [], payments: [], cashouts: [], sales: [] },
      marginPercentage: 0,
      monthlyOperationalExpense: 100_000,
    })

    expect(result.breakEven).toEqual({
      breakEvenSales: null,
      progressPercentage: null,
      amountRemaining: null,
      requiredDailySales: null,
      remainingDays: 22,
      attained: null,
    })
    expect(result.recordingHealth.sales).toEqual({ recordedDays: 0, coverageDays: 10 })
  })
})
