import type { CashTransfer, DailyCashoutEntry, LegacyCashHolder } from './appTypes'

export type PendingCashUserBalanceSnapshot = {
  userId: string
  name: string
  amount: number
}

export type LegacyCashBalanceSnapshot = {
  holder: LegacyCashHolder | 'unassigned'
  label: string
  amount: number
  cashoutCount: number
  transferInCount: number
  transferOutCount: number
}

export type PendingCashSnapshot = {
  bankTotal: number
  legacyBalances: LegacyCashBalanceSnapshot[]
  legacyCashoutEntries: DailyCashoutEntry[]
  legacyTransferEntries: CashTransfer[]
  migratedCashoutEntries: DailyCashoutEntry[]
  userBalances: PendingCashUserBalanceSnapshot[]
  totalCounterCash: number
}

export type DashboardRangeSummary = {
  from: string
  to: string
  sales: number
  expenses: number
  salesLastUpdated: string | null
  expensesLastUpdated: string | null
}

export type LabelAmountRow = {
  label: string
  amount: number
}

export type PlannerScheduleItemSnapshot = {
  id: string
  amount: number
  date: string
  note: string
  source: 'expense-cheque' | 'vendor-cheque' | 'manual-plan'
  title: string
  chequeNumber?: string
  runningBalanceAfter: number
  status: 'available' | 'deficit'
}

export type PlannerScheduleGroupSnapshot = {
  date: string
  totalAmount: number
  items: PlannerScheduleItemSnapshot[]
}

export type MonthlyReportSummarySnapshot = {
  month: string
  label: string
  marginPercentage: number
  totalSales: number
  totalCashoutExpenses: number
  grossProfitEstimate: number
  totalPurchases: number
  vendorPaymentTotal: number
  totalReturns: number
  updatedAt: string | null
}

export type MonthlyReportDetailSnapshot = MonthlyReportSummarySnapshot & {
  salesMix: {
    cashSales: number
    upiSales: number
    cardSales: number
    bankTransferSales: number
    creditSales: number
    returnsDiscounts: number
  }
  expenseByCategory: LabelAmountRow[]
  paymentTotals: {
    totalPaid: number
    totalReceived: number
    vendorPayments: number
    loanPaymentsPaid: number
  }
  purchaseTotals: {
    purchaseCount: number
    totalPurchases: number
  }
  operationalFlow: {
    dailyCashoutCount: number
    drawerTotalRecorded: number
    transferredToBank: number
    transferredToPeople: number
    pendingCashSignal: number
  }
  liabilitySnapshot: {
    currentVendorOutstanding: number
    currentOpenLoanBalance: number
  }
}

export type WorkspaceMetrics = {
  updatedAt: string | null
  generatedForDate: string
  dashboardRanges: {
    yesterday: DashboardRangeSummary
    mtd: DashboardRangeSummary
  }
  registerToday: {
    cashout: number
    paymentPaid: number
    paymentReceived: number
    paymentNet: number
  }
  projections: {
    averageDailySales: number
    projectedMonthlySales: number
    monthlyOperationalExpense: number
    marginPercentage: number
    projectedMarginValue: number
    projectedProfit: number
    projectedLoss: number
  }
  latestClosedDaySummary: {
    date: string | null
    totalSales: number
    cashSales: number
    upiSales: number
    creditSales: number
    returns: number
    cashExpenses: number
    cashToHand: number
    transfersToday: number
  }
  liabilities: {
    totalLoans: number
    totalVendorOutstanding: number
    openLoanCount: number
  }
  vendorOutstandingByName: Record<string, number>
  pendingCash: PendingCashSnapshot
  dashboardTables: {
    month: string
    expenseByCategory: LabelAmountRow[]
    monthlyPurchaseTotal: number
    vendorPaymentTotal: number
    paymentByMode: LabelAmountRow[]
  }
  planner: {
    totalCounterCash: number
    groupedSchedule: PlannerScheduleGroupSnapshot[]
  }
  monthlyReports: {
    months: string[]
    defaultSelectedMonth: string | null
    summaries: MonthlyReportSummarySnapshot[]
    detailsByMonth: Record<string, MonthlyReportDetailSnapshot>
  }
}
