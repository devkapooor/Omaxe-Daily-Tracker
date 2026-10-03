import { useMemo } from 'react'
import type { DailyCashoutEntry, LoanEntry, UserAccount, VendorRecord } from '@/domain/appTypes'
import type { FinanceData } from '@/domain/financeTypes'
import type { WorkspaceMetrics } from '@/domain/workspaceMetrics'
import { today, type DashboardMonthOffset } from '@/app/uiHelpers'
import {
  deriveMonthlyPerformance,
  type MonthlyPerformanceMetrics,
} from '@/features/dashboard/domain/deriveMonthlyPerformance'
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

export type { MonthlyPerformanceMetrics } from '@/features/dashboard/domain/deriveMonthlyPerformance'

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
    return deriveMonthlyPerformance({
      currentDate: today(),
      dashboardMonthOffset,
      dailyCashouts,
      data,
      marginPercentage: workspaceMetrics.projections.marginPercentage,
      monthlyOperationalExpense: workspaceMetrics.projections.monthlyOperationalExpense,
    })
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
    legacyChequeItems: workspaceMetrics.planner.groupedSchedule
      .flatMap((group) => group.items)
      .filter((item) => item.source !== 'manual-plan'),
    totalVendorOutstanding: workspaceMetrics.liabilities.totalVendorOutstanding,
    todayCashout: workspaceMetrics.registerToday.cashout,
    todayPaymentNet: workspaceMetrics.registerToday.paymentNet,
    todayPaymentPaid: workspaceMetrics.registerToday.paymentPaid,
    todayPaymentReceived: workspaceMetrics.registerToday.paymentReceived,
    totalLoans: workspaceMetrics.liabilities.totalLoans,
    vendorOutstandingByName: new Map(Object.entries(workspaceMetrics.vendorOutstandingByName)),
  }
}
