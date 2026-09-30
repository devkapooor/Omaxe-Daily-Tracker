import { useMemo } from 'react'
import type { DailyCashoutEntry, LoanEntry, UserAccount, VendorRecord } from '@/domain/appTypes'
import type { FinanceData } from '@/domain/financeTypes'
import type { WorkspaceMetrics } from '@/domain/workspaceMetrics'
import { IST_TIMEZONE, today, type DashboardMonthOffset } from '@/app/uiHelpers'
import { deriveDirectoryOptions } from '@/store/deriveWorkspaceMetrics'

type UseDashboardMetricsArgs = {
  dashboardMonthOffset: DashboardMonthOffset
  dailyCashouts: DailyCashoutEntry[]
  data: FinanceData
  loans: LoanEntry[]
  nameDirectory: {
    people: string[]
    vendors: string[]
  }
  users: UserAccount[]
  vendors: VendorRecord[]
  workspaceMetrics: WorkspaceMetrics
}

type MonthlyTotals = {
  sales: number
  expenses: number
  operatingBalance: number
  cashCollected: number
}

export type MonthlyPerformanceMetrics = MonthlyTotals & {
  monthKey: string
  monthLabel: string
  isCurrentMonth: boolean
  previous: MonthlyTotals
  salesMix: {
    cash: number
    upi: number
    credit: number
    returns: number
  }
  averageDailySales: number
  outlookSales: number
  estimatedMarginResult: number
}

function monthKeyForOffset(offset: number) {
  const [year, month] = today().split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1 - offset, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number)
  return new Intl.DateTimeFormat('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: IST_TIMEZONE,
  }).format(new Date(Date.UTC(year, month - 1, 1)))
}

function daysInMonth(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number)
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function dayOfMonth(date: string) {
  return Number(date.slice(8, 10)) || 0
}

function deriveMonthlyTotals(data: FinanceData, dailyCashouts: DailyCashoutEntry[], monthKey: string): MonthlyTotals {
  const sales = data.sales
    .filter((entry) => entry.date.slice(0, 7) === monthKey)
    .reduce((total, entry) => total + entry.totalSales, 0)
  const expenses = data.cashouts
    .filter((entry) => entry.date.slice(0, 7) === monthKey)
    .reduce((total, entry) => total + entry.amount, 0)
  const cashCollected = dailyCashouts
    .filter((entry) => entry.date.slice(0, 7) === monthKey)
    .reduce((total, entry) => total + (entry.drawerTotal ?? entry.remainingBalance), 0)

  return {
    sales,
    expenses,
    operatingBalance: sales - expenses,
    cashCollected,
  }
}

export function useDashboardMetrics({
  dashboardMonthOffset,
  dailyCashouts,
  data,
  loans,
  nameDirectory,
  users,
  vendors,
  workspaceMetrics,
}: UseDashboardMetricsArgs) {
  const directoryOptions = useMemo(
    () => deriveDirectoryOptions({ financeData: data, loans, nameDirectory, users, vendors }),
    [data, loans, nameDirectory, users, vendors],
  )

  const monthlyPerformance = useMemo<MonthlyPerformanceMetrics>(() => {
    const selectedMonth = monthKeyForOffset(dashboardMonthOffset)
    const previousMonth = monthKeyForOffset(dashboardMonthOffset + 1)
    const totals = deriveMonthlyTotals(data, dailyCashouts, selectedMonth)
    const previous = deriveMonthlyTotals(data, dailyCashouts, previousMonth)
    const selectedSales = data.sales.filter((entry) => entry.date.slice(0, 7) === selectedMonth)
    const selectedCashouts = dailyCashouts.filter((entry) => entry.date.slice(0, 7) === selectedMonth)
    const latestSalesDate = selectedSales.map((entry) => entry.date).sort((left, right) => right.localeCompare(left))[0]
    const completedDays = latestSalesDate ? dayOfMonth(latestSalesDate) : 0
    const averageDailySales = completedDays > 0 ? totals.sales / completedDays : 0
    const isCurrentMonth = dashboardMonthOffset === 0
    const outlookSales = isCurrentMonth ? averageDailySales * daysInMonth(selectedMonth) : totals.sales
    const estimatedMarginResult = outlookSales * (workspaceMetrics.projections.marginPercentage / 100) - workspaceMetrics.projections.monthlyOperationalExpense

    return {
      ...totals,
      monthKey: selectedMonth,
      monthLabel: monthLabel(selectedMonth),
      isCurrentMonth,
      previous,
      salesMix: selectedCashouts.reduce(
        (mix, entry) => ({
          cash: mix.cash + entry.cashSales,
          upi: mix.upi + entry.upiSales,
          credit: mix.credit + entry.creditSales,
          returns: mix.returns + entry.returns,
        }),
        { cash: 0, upi: 0, credit: 0, returns: 0 },
      ),
      averageDailySales,
      outlookSales,
      estimatedMarginResult,
    }
  }, [dailyCashouts, dashboardMonthOffset, data, workspaceMetrics.projections.marginPercentage, workspaceMetrics.projections.monthlyOperationalExpense])

  return {
    monthlyPerformance,
    directoryOptions,
    latestClosedDay: workspaceMetrics.latestClosedDaySummary.date,
    latestClosedDaySummary: workspaceMetrics.latestClosedDaySummary,
    monthlyReportMetrics: workspaceMetrics.monthlyReports,
    marginPercentage: workspaceMetrics.projections.marginPercentage,
    normalizedLoans: loans,
    openLoanCount: workspaceMetrics.liabilities.openLoanCount,
    pendingCashNow: workspaceMetrics.pendingCash,
    plannerMetrics: workspaceMetrics.planner,
    totalVendorOutstanding: workspaceMetrics.liabilities.totalVendorOutstanding,
    todayCashout: workspaceMetrics.registerToday.cashout,
    todayPaymentNet: workspaceMetrics.registerToday.paymentNet,
    todayPaymentPaid: workspaceMetrics.registerToday.paymentPaid,
    todayPaymentReceived: workspaceMetrics.registerToday.paymentReceived,
    totalLoans: workspaceMetrics.liabilities.totalLoans,
    vendorOutstandingByName: new Map(Object.entries(workspaceMetrics.vendorOutstandingByName)),
  }
}
