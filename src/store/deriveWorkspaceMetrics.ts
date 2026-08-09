import { IST_TIMEZONE, activeWorkspaceUsers, daysBetweenInclusive, legacyCashHolderLabel, normalizeName, shiftDate, today, uniqNames } from '@/app/uiHelpers'
import type { CashTransfer, DailyCashoutEntry, LoanEntry, MonthlyReportMeta, UserAccount, VendorRecord } from '@/domain/appTypes'
import type { Cashout, FinanceData, Payment } from '@/domain/financeTypes'
import type {
  DashboardRangeSummary,
  LabelAmountRow,
  MonthlyReportDetailSnapshot,
  MonthlyReportSummarySnapshot,
  PendingCashSnapshot,
  PlannerScheduleGroupSnapshot,
  WorkspaceMetrics,
} from '@/domain/workspaceMetrics'
import type { AppSettings } from '@/store/storeShared'
import { defaultMarginPercentage, defaultMonthlyOperationalExpense, normalizeLoanRecord } from '@/store/storeShared'

function daysInMonth(date: string) {
  const [year, month] = date.split('-').map(Number)
  return new Date(year, month, 0).getDate()
}

function sumByMonth<T extends { date: string }>(items: T[], month: string, selector: (item: T) => number) {
  return items
    .filter((item) => item.date.slice(0, 7) === month)
    .reduce((total, item) => total + selector(item), 0)
}

function formatMonthLabel(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  if (!year || !monthNumber) return month
  return new Intl.DateTimeFormat('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: IST_TIMEZONE,
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)))
}

function deriveDashboardRangeSummary(financeData: FinanceData, from: string, to: string): DashboardRangeSummary {
  const salesEntries = financeData.sales.filter((sale) => sale.date >= from && sale.date <= to)
  const expenseEntries = financeData.cashouts.filter((entry) => entry.date >= from && entry.date <= to)

  return {
    from,
    to,
    sales: salesEntries.reduce((total, sale) => total + sale.totalSales, 0),
    expenses: expenseEntries.reduce((total, entry) => total + entry.amount, 0),
    salesLastUpdated: salesEntries.map((entry) => entry.updatedAt).sort((a, b) => b.localeCompare(a))[0] ?? null,
    expensesLastUpdated: expenseEntries.map((entry) => entry.updatedAt).sort((a, b) => b.localeCompare(a))[0] ?? null,
  }
}

function derivePendingCash(users: UserAccount[], dailyCashouts: DailyCashoutEntry[], cashTransfers: CashTransfer[]): PendingCashSnapshot {
  const activeUsers = activeWorkspaceUsers(users)
  const activeUserIds = new Set(activeUsers.map((user) => user.id))
  const activeUsersByNormalizedName = new Map<string, UserAccount[]>()
  activeUsers.forEach((user) => {
    const key = normalizeName(user.name).toLowerCase()
    if (!key) return
    activeUsersByNormalizedName.set(key, [...(activeUsersByNormalizedName.get(key) ?? []), user])
  })

  const userBalanceMap = new Map<string, number>(activeUsers.map((user) => [user.id, 0]))
  const legacyBalanceMap = new Map<string, PendingCashSnapshot['legacyBalances'][number]>()
  const legacyCashoutEntries: PendingCashSnapshot['legacyCashoutEntries'] = []
  const legacyTransferEntries: PendingCashSnapshot['legacyTransferEntries'] = []
  const migratedCashoutEntries: PendingCashSnapshot['migratedCashoutEntries'] = []
  let bankTotal = 0

  function ensureLegacyBalance(holder?: PendingCashSnapshot['legacyBalances'][number]['holder']) {
    const resolvedHolder = holder ?? 'unassigned'
    const existing = legacyBalanceMap.get(resolvedHolder)
    if (existing) return existing
    const next = {
      holder: resolvedHolder,
      label: legacyCashHolderLabel(resolvedHolder),
      amount: 0,
      cashoutCount: 0,
      transferInCount: 0,
      transferOutCount: 0,
    }
    legacyBalanceMap.set(resolvedHolder, next)
    return next
  }

  function ensureActiveUserBalance(userId: string, amount: number) {
    if (!activeUserIds.has(userId)) return false
    userBalanceMap.set(userId, (userBalanceMap.get(userId) ?? 0) + amount)
    return true
  }

  function exactMatchedUserId(rawName: string) {
    const normalized = normalizeName(rawName).toLowerCase()
    if (!normalized) return null
    const matches = activeUsersByNormalizedName.get(normalized) ?? []
    if (matches.length !== 1) return null
    return matches[0]?.id ?? null
  }

  dailyCashouts.forEach((entry) => {
    const drawerTotal = entry.drawerTotal ?? entry.remainingBalance
    if (entry.recordedByUserId && ensureActiveUserBalance(entry.recordedByUserId, drawerTotal)) return

    const migratedUserId = exactMatchedUserId(entry.recordedBy)
    if (migratedUserId && ensureActiveUserBalance(migratedUserId, drawerTotal)) {
      migratedCashoutEntries.push(entry)
      return
    }

    const legacyBalance = ensureLegacyBalance(entry.recordedByHolder)
    legacyBalance.amount += drawerTotal
    legacyBalance.cashoutCount += 1
    legacyCashoutEntries.push(entry)
  })

  cashTransfers.forEach((entry) => {
    if (entry.fromUserId && ensureActiveUserBalance(entry.fromUserId, -entry.amount)) {
      // tracked live source
    } else {
      const legacySource = ensureLegacyBalance(entry.from)
      legacySource.amount -= entry.amount
      legacySource.transferOutCount += 1
      legacyTransferEntries.push(entry)
    }

    if (entry.toType === 'person') {
      if (entry.toUserId && ensureActiveUserBalance(entry.toUserId, entry.amount)) return

      const legacyDestination = ensureLegacyBalance(entry.toPerson)
      legacyDestination.amount += entry.amount
      legacyDestination.transferInCount += 1
      if (!legacyTransferEntries.some((candidate) => candidate.id === entry.id)) {
        legacyTransferEntries.push(entry)
      }
      return
    }

    bankTotal += entry.amount
  })

  const userBalances = activeUsers
    .map((user) => ({
      userId: user.id,
      name: user.name,
      amount: userBalanceMap.get(user.id) ?? 0,
    }))
    .sort((left, right) => left.name.localeCompare(right.name))

  const legacyBalances = Array.from(legacyBalanceMap.values()).sort((left, right) => left.label.localeCompare(right.label))

  return {
    bankTotal,
    legacyBalances,
    legacyCashoutEntries,
    legacyTransferEntries,
    migratedCashoutEntries,
    userBalances,
    totalCounterCash: userBalances.reduce((total, entry) => total + entry.amount, 0),
  }
}

function deriveVendorOutstanding(financeData: FinanceData, vendors: VendorRecord[]) {
  const totals = new Map<string, number>()
  vendors.forEach((vendor) => {
    const key = vendor.name.trim().toLowerCase()
    if (!key) return
    totals.set(key, vendor.openingOutstandingRemaining ?? 0)
  })
  financeData.purchases.forEach((purchase) => {
    const key = purchase.supplierName.trim().toLowerCase()
    if (!key) return
    totals.set(key, (totals.get(key) ?? 0) + purchase.unpaidAmount)
  })
  return totals
}

function derivePlanner(currentBankBalance: number, expenses: Cashout[], payments: Payment[], plannedPayments: WorkspaceMetrics['monthlyReports']['summaries'] extends never ? never : { id: string; title: string; date: string; amount: number; notes: string }[]) {
  const chequeExpenses = expenses
    .filter((entry) => entry.paymentMode === 'Cheque' && entry.chequePayDate)
    .map((entry) => ({
      id: `expense-${entry.id}`,
      amount: entry.amount,
      date: entry.chequePayDate!,
      note: entry.notes,
      source: 'expense-cheque' as const,
      title: entry.paidTo,
      chequeNumber: entry.chequeNumber,
    }))

  const vendorCheques = payments
    .filter((entry) => entry.paymentMode === 'Cheque' && entry.type === 'Paid' && entry.entryType === 'vendor-payment' && entry.chequePayDate)
    .map((entry) => ({
      id: `payment-${entry.id}`,
      amount: entry.amount,
      date: entry.chequePayDate!,
      note: entry.notes,
      source: 'vendor-cheque' as const,
      title: entry.partyName,
      chequeNumber: entry.chequeNumber,
    }))

  const manualPlans = plannedPayments.map((entry) => ({
    id: entry.id,
    amount: entry.amount,
    date: entry.date,
    note: entry.notes,
    source: 'manual-plan' as const,
    title: entry.title,
  }))

  const plannerItems = [...chequeExpenses, ...vendorCheques, ...manualPlans].sort((a, b) => {
    const dateSort = a.date.localeCompare(b.date)
    if (dateSort !== 0) return dateSort
    return a.title.localeCompare(b.title)
  })

  let runningBalance = currentBankBalance
  const groupedSchedule: PlannerScheduleGroupSnapshot[] = []

  plannerItems.forEach((item) => {
    runningBalance -= item.amount
    const enriched = {
      ...item,
      runningBalanceAfter: runningBalance,
      status: runningBalance >= 0 ? 'available' as const : 'deficit' as const,
    }
    const lastGroup = groupedSchedule[groupedSchedule.length - 1]
    if (lastGroup && lastGroup.date === item.date) {
      lastGroup.items.push(enriched)
      lastGroup.totalAmount += item.amount
      return
    }
    groupedSchedule.push({
      date: item.date,
      totalAmount: item.amount,
      items: [enriched],
    })
  })

  return groupedSchedule
}

function deriveMonthlyReports(args: {
  cashTransfers: CashTransfer[]
  dailyCashouts: DailyCashoutEntry[]
  financeData: FinanceData
  monthlyReports: MonthlyReportMeta[]
  totalLoans: number
  totalVendorOutstanding: number
  loans: LoanEntry[]
  marginPercentage: number
}) {
  const { cashTransfers, dailyCashouts, financeData, loans, marginPercentage, monthlyReports, totalLoans, totalVendorOutstanding } = args
  const monthSet = new Set<string>()
  const metaByMonth = new Map(monthlyReports.map((entry) => [entry.month, entry]))

  financeData.sales.forEach((entry) => monthSet.add(entry.date.slice(0, 7)))
  financeData.cashouts.forEach((entry) => monthSet.add(entry.date.slice(0, 7)))
  financeData.purchases.forEach((entry) => monthSet.add(entry.date.slice(0, 7)))
  financeData.payments.forEach((entry) => monthSet.add(entry.date.slice(0, 7)))
  dailyCashouts.forEach((entry) => monthSet.add(entry.date.slice(0, 7)))
  cashTransfers.forEach((entry) => monthSet.add(entry.date.slice(0, 7)))
  monthlyReports.forEach((entry) => monthSet.add(entry.month))

  const months = Array.from(monthSet).sort((left, right) => right.localeCompare(left))

  const summaries = months.map<MonthlyReportSummarySnapshot>((month) => {
    const monthMargin = metaByMonth.get(month)?.marginPercentage ?? marginPercentage
    const totalSales = sumByMonth(financeData.sales, month, (entry) => entry.totalSales)
    const totalCashoutExpenses = sumByMonth(financeData.cashouts, month, (entry) => entry.amount)
    const totalPurchases = sumByMonth(financeData.purchases, month, (entry) => entry.purchaseAmount)
    const vendorPaymentTotal = financeData.payments
      .filter((entry) => entry.date.slice(0, 7) === month && entry.type === 'Paid' && (entry.entryType ?? 'vendor-payment') === 'vendor-payment')
      .reduce((total, entry) => total + entry.amount, 0)
    const totalReturns = sumByMonth(financeData.sales, month, (entry) => entry.returnsDiscounts)
    const updatedAt = [
      ...financeData.sales.filter((entry) => entry.date.slice(0, 7) === month).map((entry) => entry.updatedAt),
      ...financeData.cashouts.filter((entry) => entry.date.slice(0, 7) === month).map((entry) => entry.updatedAt),
      ...financeData.purchases.filter((entry) => entry.date.slice(0, 7) === month).map((entry) => entry.updatedAt),
      ...financeData.payments.filter((entry) => entry.date.slice(0, 7) === month).map((entry) => entry.updatedAt),
      ...monthlyReports.filter((entry) => entry.month === month).map((entry) => entry.updatedAt),
    ].sort((left, right) => right.localeCompare(left))[0] ?? null

    return {
      month,
      label: formatMonthLabel(month),
      marginPercentage: monthMargin,
      totalSales,
      totalCashoutExpenses,
      grossProfitEstimate: totalSales * (monthMargin / 100),
      totalPurchases,
      vendorPaymentTotal,
      totalReturns,
      updatedAt,
    }
  })

  const detailsByMonth: Record<string, MonthlyReportDetailSnapshot> = {}

  summaries.forEach((summary) => {
    const sales = financeData.sales.filter((entry) => entry.date.slice(0, 7) === summary.month)
    const cashouts = financeData.cashouts.filter((entry) => entry.date.slice(0, 7) === summary.month)
    const purchases = financeData.purchases.filter((entry) => entry.date.slice(0, 7) === summary.month)
    const payments = financeData.payments.filter((entry) => entry.date.slice(0, 7) === summary.month)
    const monthlyDailyCashouts = dailyCashouts.filter((entry) => entry.date.slice(0, 7) === summary.month)
    const transfers = cashTransfers.filter((entry) => entry.date.slice(0, 7) === summary.month)

    const expenseByCategoryMap = new Map<string, number>()
    cashouts.forEach((entry) => {
      expenseByCategoryMap.set(entry.category, (expenseByCategoryMap.get(entry.category) ?? 0) + entry.amount)
    })

    const transferredToBank = transfers
      .filter((entry) => entry.toType === 'bank')
      .reduce((total, entry) => total + entry.amount, 0)
    const transferredToPeople = transfers
      .filter((entry) => entry.toType === 'person')
      .reduce((total, entry) => total + entry.amount, 0)
    const drawerTotalRecorded = monthlyDailyCashouts.reduce((total, entry) => total + (entry.drawerTotal ?? entry.remainingBalance), 0)

    detailsByMonth[summary.month] = {
      ...summary,
      salesMix: {
        cashSales: sales.reduce((total, entry) => total + entry.cashSales, 0),
        upiSales: sales.reduce((total, entry) => total + entry.upiSales, 0),
        cardSales: sales.reduce((total, entry) => total + entry.cardSales, 0),
        bankTransferSales: sales.reduce((total, entry) => total + entry.bankTransferSales, 0),
        creditSales: sales.reduce((total, entry) => total + entry.creditSales, 0),
        returnsDiscounts: sales.reduce((total, entry) => total + entry.returnsDiscounts, 0),
      },
      expenseByCategory: Array.from(expenseByCategoryMap.entries())
        .map(([label, amount]) => ({ label, amount }))
        .sort((left, right) => right.amount - left.amount),
      paymentTotals: {
        totalPaid: payments.filter((entry) => entry.type === 'Paid').reduce((total, entry) => total + entry.amount, 0),
        totalReceived: payments.filter((entry) => entry.type === 'Received').reduce((total, entry) => total + entry.amount, 0),
        vendorPayments: payments
          .filter((entry) => entry.type === 'Paid' && (entry.entryType ?? 'vendor-payment') === 'vendor-payment')
          .reduce((total, entry) => total + entry.amount, 0),
        loanPaymentsPaid: payments
          .filter((entry) => entry.type === 'Paid' && entry.entryType === 'loan-payment')
          .reduce((total, entry) => total + entry.amount, 0),
      },
      purchaseTotals: {
        purchaseCount: purchases.length,
        totalPurchases: purchases.reduce((total, entry) => total + entry.purchaseAmount, 0),
      },
      operationalFlow: {
        dailyCashoutCount: monthlyDailyCashouts.length,
        drawerTotalRecorded,
        transferredToBank,
        transferredToPeople,
        pendingCashSignal: drawerTotalRecorded - transferredToBank,
      },
      liabilitySnapshot: {
        currentVendorOutstanding: totalVendorOutstanding,
        currentOpenLoanBalance: totalLoans,
      },
    }
  })

  return {
    months,
    defaultSelectedMonth: months[0] ?? null,
    summaries,
    detailsByMonth,
    openLoanCount: loans.filter((entry) => normalizeLoanRecord(entry).remainingAmount > 0).length,
  }
}

export function deriveWorkspaceMetrics(args: {
  appSettings: AppSettings
  cashTransfers: CashTransfer[]
  dailyCashouts: DailyCashoutEntry[]
  financeData: FinanceData
  loans: LoanEntry[]
  monthlyReports: MonthlyReportMeta[]
  plannedPayments: Array<{ id: string; title: string; date: string; amount: number; notes: string }>
  users: UserAccount[]
  vendors: VendorRecord[]
}): Omit<WorkspaceMetrics, 'updatedAt'> {
  const {
    appSettings,
    cashTransfers,
    dailyCashouts,
    financeData,
    loans,
    monthlyReports,
    plannedPayments,
    users,
    vendors,
  } = args

  const generatedForDate = today()
  const yesterday = shiftDate(generatedForDate, -1)
  const monthStart = `${generatedForDate.slice(0, 7)}-01`
  const dashboardRanges = {
    yesterday: deriveDashboardRangeSummary(financeData, yesterday, yesterday),
    mtd: deriveDashboardRangeSummary(financeData, monthStart, generatedForDate),
  }

  const registerToday = {
    cashout: financeData.cashouts.filter((cashout) => cashout.date === generatedForDate).reduce((total, cashout) => total + cashout.amount, 0),
    paymentPaid: financeData.payments.filter((payment) => payment.date === generatedForDate && payment.type === 'Paid').reduce((total, payment) => total + payment.amount, 0),
    paymentReceived: financeData.payments.filter((payment) => payment.date === generatedForDate && payment.type === 'Received').reduce((total, payment) => total + payment.amount, 0),
    paymentNet: 0,
  }
  registerToday.paymentNet = registerToday.paymentReceived - registerToday.paymentPaid

  const currentMonthSales = financeData.sales.filter((sale) => sale.date >= monthStart && sale.date <= generatedForDate)
  const latestRecordedSalesDate = currentMonthSales.map((sale) => sale.date).sort((a, b) => b.localeCompare(a))[0]
  const mtdSales = currentMonthSales.reduce((total, sale) => total + sale.totalSales, 0)
  const completedDays = latestRecordedSalesDate ? daysBetweenInclusive(monthStart, latestRecordedSalesDate) : 0
  const averageDailySales = completedDays > 0 ? mtdSales / completedDays : 0
  const projectedMonthlySales = latestRecordedSalesDate ? averageDailySales * daysInMonth(latestRecordedSalesDate) : 0
  const projectedMarginValue = projectedMonthlySales * ((appSettings.marginPercentage ?? defaultMarginPercentage) / 100)
  const breakEvenDelta = projectedMarginValue - (appSettings.monthlyOperationalExpense ?? defaultMonthlyOperationalExpense)

  const normalizedLoans = loans.map((loan) => normalizeLoanRecord(loan))
  const totalLoans = normalizedLoans.reduce((total, loan) => total + loan.remainingAmount, 0)
  const openLoanCount = normalizedLoans.filter((loan) => loan.remainingAmount > 0).length

  const vendorOutstandingByNameMap = deriveVendorOutstanding(financeData, vendors)
  const vendorOutstandingByName = Object.fromEntries(Array.from(vendorOutstandingByNameMap.entries()).sort((left, right) => left[0].localeCompare(right[0])))
  const totalVendorOutstanding = Object.values(vendorOutstandingByName).reduce((total, amount) => total + amount, 0)

  const pendingCash = derivePendingCash(users, dailyCashouts, cashTransfers)

  const latestClosedDay = dailyCashouts[0]?.date ?? null
  const latestCashoutEntries = latestClosedDay ? dailyCashouts.filter((entry) => entry.date === latestClosedDay) : []
  const latestClosedDaySummary = latestClosedDay
    ? {
        date: latestClosedDay,
        cashSales: latestCashoutEntries.reduce((total, entry) => total + entry.cashSales, 0),
        upiSales: latestCashoutEntries.reduce((total, entry) => total + entry.upiSales, 0),
        creditSales: latestCashoutEntries.reduce((total, entry) => total + entry.creditSales, 0),
        returns: latestCashoutEntries.reduce((total, entry) => total + entry.returns, 0),
        totalSales: 0,
        cashExpenses: financeData.cashouts.filter((entry) => entry.date === latestClosedDay).reduce((total, entry) => total + entry.amount, 0),
        cashToHand: 0,
        transfersToday: cashTransfers.filter((entry) => entry.date === latestClosedDay).reduce((total, entry) => total + entry.amount, 0),
      }
    : {
        date: null,
        totalSales: 0,
        cashSales: 0,
        upiSales: 0,
        creditSales: 0,
        returns: 0,
        cashExpenses: 0,
        cashToHand: 0,
        transfersToday: 0,
      }

  latestClosedDaySummary.totalSales =
    latestClosedDaySummary.cashSales +
    latestClosedDaySummary.upiSales +
    latestClosedDaySummary.creditSales -
    latestClosedDaySummary.returns
  latestClosedDaySummary.cashToHand = latestClosedDaySummary.cashSales - latestClosedDaySummary.cashExpenses

  const dashboardMonth = generatedForDate.slice(0, 7)
  const expenseByCategoryMap = new Map<string, number>()
  financeData.cashouts
    .filter((entry) => entry.date.slice(0, 7) === dashboardMonth)
    .forEach((entry) => {
      expenseByCategoryMap.set(entry.category, (expenseByCategoryMap.get(entry.category) ?? 0) + entry.amount)
    })
  const expenseByCategory: LabelAmountRow[] = Array.from(expenseByCategoryMap.entries())
    .map(([label, amount]) => ({ label, amount }))
    .sort((left, right) => right.amount - left.amount)
  const vendorPaymentsThisMonth = financeData.payments.filter(
    (entry) => entry.date.slice(0, 7) === dashboardMonth && entry.type === 'Paid' && (entry.entryType ?? 'vendor-payment') === 'vendor-payment',
  )
  const paymentByModeMap = new Map<string, number>()
  vendorPaymentsThisMonth.forEach((entry) => {
    paymentByModeMap.set(entry.paymentMode, (paymentByModeMap.get(entry.paymentMode) ?? 0) + entry.amount)
  })

  const monthlyReportsSnapshot = deriveMonthlyReports({
    cashTransfers,
    dailyCashouts,
    financeData,
    loans: normalizedLoans,
    marginPercentage: appSettings.marginPercentage || defaultMarginPercentage,
    monthlyReports,
    totalLoans,
    totalVendorOutstanding,
  })

  return {
    generatedForDate,
    dashboardRanges,
    registerToday,
    projections: {
      averageDailySales,
      projectedMonthlySales,
      monthlyOperationalExpense: appSettings.monthlyOperationalExpense ?? defaultMonthlyOperationalExpense,
      marginPercentage: appSettings.marginPercentage ?? defaultMarginPercentage,
      projectedMarginValue,
      projectedProfit: breakEvenDelta > 0 ? breakEvenDelta : 0,
      projectedLoss: breakEvenDelta < 0 ? Math.abs(breakEvenDelta) : 0,
    },
    latestClosedDaySummary,
    liabilities: {
      totalLoans,
      totalVendorOutstanding,
      openLoanCount,
    },
    vendorOutstandingByName,
    pendingCash,
    dashboardTables: {
      month: dashboardMonth,
      expenseByCategory,
      monthlyPurchaseTotal: financeData.purchases
        .filter((entry) => entry.date.slice(0, 7) === dashboardMonth)
        .reduce((total, entry) => total + entry.purchaseAmount, 0),
      vendorPaymentTotal: vendorPaymentsThisMonth.reduce((total, entry) => total + entry.amount, 0),
      paymentByMode: Array.from(paymentByModeMap.entries())
        .map(([label, amount]) => ({ label, amount }))
        .sort((left, right) => right.amount - left.amount),
    },
    planner: {
      totalCounterCash: pendingCash.totalCounterCash,
      groupedSchedule: derivePlanner(appSettings.currentBankBalance, financeData.cashouts, financeData.payments, plannedPayments),
    },
    monthlyReports: monthlyReportsSnapshot,
  }
}

export function deriveDirectoryOptions(args: {
  financeData: FinanceData
  loans: LoanEntry[]
  nameDirectory: {
    people: string[]
    vendors: string[]
  }
  users: UserAccount[]
  vendors: VendorRecord[]
}) {
  const { financeData, loans, nameDirectory, users, vendors } = args
  const derivedPartyNames = [
    ...financeData.cashouts.map((cashout) => cashout.paidTo),
    ...financeData.payments.map((payment) => payment.partyName),
    ...loans.map((loan) => loan.personName),
  ]
  const derivedVendors = financeData.purchases.map((purchase) => purchase.supplierName)
  const userNames = users.map((user) => user.name)
  const vendorNames = vendors.map((vendor) => vendor.name)
  const vendorNameKeys = new Set(vendorNames.map((vendor) => vendor.trim().toLowerCase()))
  const party = uniqNames([...nameDirectory.people, ...derivedPartyNames, ...userNames]).filter(
    (name) => !vendorNameKeys.has(name.trim().toLowerCase()),
  )

  return {
    party,
    vendors: uniqNames([...vendorNames, ...nameDirectory.vendors, ...derivedVendors]),
  }
}
