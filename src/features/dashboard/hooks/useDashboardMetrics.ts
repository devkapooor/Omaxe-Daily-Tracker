import { useMemo } from 'react'
import type { LoanEntry, UserAccount, VendorRecord } from '@/domain/appTypes'
import type { FinanceData } from '@/domain/financeTypes'
import type { WorkspaceMetrics } from '@/domain/workspaceMetrics'
import type { DashboardRange } from '@/app/uiHelpers'
import { deriveDirectoryOptions } from '@/store/deriveWorkspaceMetrics'

type UseDashboardMetricsArgs = {
  dashboardRange: DashboardRange
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

export function useDashboardMetrics({
  dashboardRange,
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

  const rangeSummary = workspaceMetrics.dashboardRanges[dashboardRange]

  return {
    dashboardExpenseTotal: rangeSummary.expenses,
    dashboardLastUpdated: {
      sales: rangeSummary.salesLastUpdated,
      expenses: rangeSummary.expensesLastUpdated,
      loans: workspaceMetrics.updatedAt,
      fixed: workspaceMetrics.updatedAt,
    },
    dashboardSales: rangeSummary.sales,
    averageDailySales: workspaceMetrics.projections.averageDailySales,
    dashboardTables: workspaceMetrics.dashboardTables,
    directoryOptions,
    latestClosedDay: workspaceMetrics.latestClosedDaySummary.date,
    latestClosedDaySummary: workspaceMetrics.latestClosedDaySummary,
    monthlyOperationalExpense: workspaceMetrics.projections.monthlyOperationalExpense,
    monthlyReportMetrics: workspaceMetrics.monthlyReports,
    marginPercentage: workspaceMetrics.projections.marginPercentage,
    normalizedLoans: loans,
    openLoanCount: workspaceMetrics.liabilities.openLoanCount,
    pendingCashNow: workspaceMetrics.pendingCash,
    plannerMetrics: workspaceMetrics.planner,
    projectedMonthlySales: workspaceMetrics.projections.projectedMonthlySales,
    projectedProfit: workspaceMetrics.projections.projectedProfit,
    projectedLoss: workspaceMetrics.projections.projectedLoss,
    totalVendorOutstanding: workspaceMetrics.liabilities.totalVendorOutstanding,
    todayCashout: workspaceMetrics.registerToday.cashout,
    todayPaymentNet: workspaceMetrics.registerToday.paymentNet,
    todayPaymentPaid: workspaceMetrics.registerToday.paymentPaid,
    todayPaymentReceived: workspaceMetrics.registerToday.paymentReceived,
    totalLoans: workspaceMetrics.liabilities.totalLoans,
    vendorOutstandingByName: new Map(Object.entries(workspaceMetrics.vendorOutstandingByName)),
  }
}
