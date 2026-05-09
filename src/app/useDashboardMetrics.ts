import { useMemo } from 'react'
import type { FinanceData } from '@/domain/financeTypes'
import type { CashTransfer, DailyCashoutEntry, LoanEntry, UserAccount, VendorRecord } from '@/domain/appTypes'
import {
  buildCashHolderAssignments,
  type DashboardRange,
  daysBetweenInclusive,
  daysInMonth,
  monthlyFixedExpense,
  resolveCashHolderForUser,
  shiftDate,
  today,
  uniqNames,
} from '@/app/uiHelpers'

type UseDashboardMetricsArgs = {
  cashTransfers: CashTransfer[]
  cashoutFilterDate: string
  dailyCashouts: DailyCashoutEntry[]
  dashboardRange: DashboardRange
  data: FinanceData
  loans: LoanEntry[]
  nameDirectory: {
    people: string[]
    vendors: string[]
  }
  users: UserAccount[]
  vendors: VendorRecord[]
  currentUserId?: string
}

export function useDashboardMetrics({
  cashTransfers,
  cashoutFilterDate,
  currentUserId,
  dailyCashouts,
  dashboardRange,
  data,
  loans,
  nameDirectory,
  users,
  vendors,
}: UseDashboardMetricsArgs) {
  const holderAssignments = useMemo(() => buildCashHolderAssignments(users), [users])

  const currentHolder = useMemo(
    () => (currentUserId ? resolveCashHolderForUser(currentUserId, users) : null),
    [currentUserId, users],
  )

  const directoryOptions = useMemo(() => {
    const derivedPeople = data.cashouts.map((cashout) => cashout.paidTo)
    const derivedVendors = data.purchases.map((purchase) => purchase.supplierName)
    const userNames = users.map((user) => user.name)
    return {
      people: uniqNames([...nameDirectory.people, ...derivedPeople, ...userNames]),
      vendors: uniqNames([...vendors.map((vendor) => vendor.name), ...nameDirectory.vendors, ...derivedVendors]),
    }
  }, [data.cashouts, data.purchases, nameDirectory.people, nameDirectory.vendors, users, vendors])

  const filteredCashouts = useMemo(
    () =>
      [...data.cashouts]
        .filter((cashout) => cashout.date === cashoutFilterDate)
        .sort((a, b) => `${b.date}${b.createdAt}`.localeCompare(`${a.date}${a.createdAt}`))
        .slice(0, 6),
    [cashoutFilterDate, data.cashouts],
  )

  const todayCashout = useMemo(
    () =>
      data.cashouts
        .filter((cashout) => cashout.date === today())
        .reduce((total, cashout) => total + cashout.amount, 0),
    [data.cashouts],
  )

  const todayPaymentPaid = useMemo(
    () =>
      data.payments
        .filter((payment) => payment.date === today() && payment.type === 'Paid')
        .reduce((total, payment) => total + payment.amount, 0),
    [data.payments],
  )

  const todayPaymentReceived = useMemo(
    () =>
      data.payments
        .filter((payment) => payment.date === today() && payment.type === 'Received')
        .reduce((total, payment) => total + payment.amount, 0),
    [data.payments],
  )

  const dashboardRangeBounds = useMemo(() => {
    const now = today()
    if (dashboardRange === 'yesterday') {
      const y = shiftDate(now, -1)
      return { from: y, to: y }
    }
    if (dashboardRange === 'mtd') {
      return { from: `${now.slice(0, 7)}-01`, to: now }
    }
    return { from: now, to: now }
  }, [dashboardRange])

  const dashboardSales = useMemo(
    () =>
      data.sales
        .filter((sale) => sale.date >= dashboardRangeBounds.from && sale.date <= dashboardRangeBounds.to)
        .reduce((total, sale) => total + sale.totalSales, 0),
    [data.sales, dashboardRangeBounds],
  )

  const dashboardExpenseEntries = useMemo(
    () => data.cashouts.filter((item) => item.date >= dashboardRangeBounds.from && item.date <= dashboardRangeBounds.to).length,
    [data.cashouts, dashboardRangeBounds],
  )

  const dashboardExpenseTotal = useMemo(
    () =>
      data.cashouts
        .filter((item) => item.date >= dashboardRangeBounds.from && item.date <= dashboardRangeBounds.to)
        .reduce((total, item) => total + item.amount, 0),
    [data.cashouts, dashboardRangeBounds],
  )

  const projectedMonthlySales = useMemo(() => {
    const now = today()
    const monthStart = `${now.slice(0, 7)}-01`
    const mtdSales = data.sales
      .filter((sale) => sale.date >= monthStart && sale.date <= now)
      .reduce((total, sale) => total + sale.totalSales, 0)
    const completedDays = daysBetweenInclusive(monthStart, now)
    const averageDailySales = completedDays > 0 ? mtdSales / completedDays : 0
    return averageDailySales * daysInMonth(now)
  }, [data.sales])

  const totalLoans = useMemo(() => loans.reduce((total, loan) => total + loan.amount, 0), [loans])

  const latestPendingCashBalances = useMemo(() => {
    const latest = dailyCashouts[0]
    if (latest?.pendingCashBalances) return latest.pendingCashBalances
    return { dev: 0, arsh: 0, farhan: 0 }
  }, [dailyCashouts])

  const pendingCashNow = useMemo(() => {
    const balances = {
      Dev: latestPendingCashBalances.dev,
      Arsh: latestPendingCashBalances.arsh,
      Farhan: latestPendingCashBalances.farhan,
    }
    let bankTotal = 0
    cashTransfers.forEach((entry) => {
      balances[entry.from] -= entry.amount
      if (entry.toType === 'person' && entry.toPerson) {
        balances[entry.toPerson] += entry.amount
      } else {
        bankTotal += entry.amount
      }
    })
    return { balances, bankTotal }
  }, [cashTransfers, latestPendingCashBalances])

  const dailyFinalSummary = useMemo(() => {
    const todayDate = today()
    const todayCashoutEntries = dailyCashouts.filter((entry) => entry.date === todayDate)
    const cashSales = todayCashoutEntries.reduce((total, entry) => total + entry.cashSales, 0)
    const upiSales = todayCashoutEntries.reduce((total, entry) => total + entry.upiSales, 0)
    const creditSales = todayCashoutEntries.reduce((total, entry) => total + entry.creditSales, 0)
    const returns = todayCashoutEntries.reduce((total, entry) => total + entry.returns, 0)
    const totalSales = cashSales + upiSales + creditSales - returns
    const cashExpenses = data.cashouts.filter((entry) => entry.date === todayDate).reduce((total, entry) => total + entry.amount, 0)
    const cashToHand = cashSales - cashExpenses
    const transfersToday = cashTransfers.filter((entry) => entry.date === todayDate).reduce((total, entry) => total + entry.amount, 0)

    return {
      totalSales,
      cashSales,
      upiSales,
      creditSales,
      returns,
      cashExpenses,
      cashToHand,
      transfersToday,
    }
  }, [cashTransfers, dailyCashouts, data.cashouts])

  const dashboardLastUpdated = useMemo(() => {
    const salesLastUpdated = data.sales
      .filter((sale) => sale.date >= dashboardRangeBounds.from && sale.date <= dashboardRangeBounds.to)
      .map((sale) => sale.updatedAt)
      .sort((a, b) => b.localeCompare(a))[0] ?? null
    const expenseLastUpdated = data.cashouts
      .filter((entry) => entry.date >= dashboardRangeBounds.from && entry.date <= dashboardRangeBounds.to)
      .map((entry) => entry.updatedAt)
      .sort((a, b) => b.localeCompare(a))[0] ?? null
    const loansLastUpdated = loans.map((loan) => loan.createdAt).sort((a, b) => b.localeCompare(a))[0] ?? null
    return {
      sales: salesLastUpdated,
      expenses: expenseLastUpdated,
      loans: loansLastUpdated,
      fixed: null,
    }
  }, [dashboardRangeBounds.from, dashboardRangeBounds.to, data.cashouts, data.sales, loans])

  return {
    currentHolder,
    dailyFinalSummary,
    dashboardExpenseEntries,
    dashboardExpenseTotal,
    dashboardLastUpdated,
    dashboardSales,
    dashboardRangeBounds,
    directoryOptions,
    filteredCashouts,
    holderAssignments,
    monthlyFixedExpense,
    pendingCashNow,
    projectedMonthlySales,
    todayCashout,
    todayPaymentPaid,
    todayPaymentReceived,
    totalLoans,
  }
}
