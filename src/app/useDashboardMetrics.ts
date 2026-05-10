import { useMemo } from 'react'
import type { FinanceData } from '@/domain/financeTypes'
import type { CashTransfer, DailyCashoutEntry, LoanEntry, UserAccount, VendorRecord } from '@/domain/appTypes'
import {
  buildCashHolderAssignments,
  type DashboardRange,
  daysBetweenInclusive,
  daysInMonth,
  resolveCashHolderForUser,
  shiftDate,
  today,
  uniqNames,
} from '@/app/uiHelpers'
import { defaultMonthlyOperationalExpense, normalizeLoanRecord } from '@/data/storeShared'

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
  monthlyOperationalExpense?: number
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
  monthlyOperationalExpense = defaultMonthlyOperationalExpense,
  users,
  vendors,
}: UseDashboardMetricsArgs) {
  const holderAssignments = useMemo(() => buildCashHolderAssignments(users), [users])

  const currentHolder = useMemo(
    () => (currentUserId ? resolveCashHolderForUser(currentUserId, users) : null),
    [currentUserId, users],
  )

  const directoryOptions = useMemo(() => {
    const derivedPeople = [
      ...data.cashouts.map((cashout) => cashout.paidTo),
      ...data.payments.map((payment) => payment.partyName),
      ...loans.map((loan) => loan.personName),
    ]
    const derivedVendors = data.purchases.map((purchase) => purchase.supplierName)
    const userNames = users.map((user) => user.name)
    return {
      people: uniqNames([...nameDirectory.people, ...derivedPeople, ...userNames, ...vendors.map((vendor) => vendor.name)]),
      vendors: uniqNames([...vendors.map((vendor) => vendor.name), ...nameDirectory.vendors, ...derivedVendors]),
    }
  }, [data.cashouts, data.payments, data.purchases, loans, nameDirectory.people, nameDirectory.vendors, users, vendors])

  const filteredCashouts = useMemo(
    () =>
      [...data.cashouts]
        .filter((cashout) => cashout.date === cashoutFilterDate)
        .sort((a, b) => `${b.date}${b.createdAt}`.localeCompare(`${a.date}${a.createdAt}`)),
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
    return { from: shiftDate(now, -1), to: shiftDate(now, -1) }
  }, [dashboardRange])

  const dashboardSales = useMemo(
    () =>
      data.sales
        .filter((sale) => sale.date >= dashboardRangeBounds.from && sale.date <= dashboardRangeBounds.to)
        .reduce((total, sale) => total + sale.totalSales, 0),
    [data.sales, dashboardRangeBounds],
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

  const normalizedLoans = useMemo(() => loans.map((loan) => normalizeLoanRecord(loan)), [loans])

  const totalLoans = useMemo(
    () => normalizedLoans.reduce((total, loan) => total + loan.remainingAmount, 0),
    [normalizedLoans],
  )

  const vendorOutstandingByName = useMemo(() => {
    const totals = new Map<string, number>()
    data.purchases.forEach((purchase) => {
      const key = purchase.supplierName.trim().toLowerCase()
      if (!key) return
      totals.set(key, (totals.get(key) ?? 0) + purchase.unpaidAmount)
    })
    return totals
  }, [data.purchases])

  const totalVendorOutstanding = useMemo(
    () => Array.from(vendorOutstandingByName.values()).reduce((total, value) => total + value, 0),
    [vendorOutstandingByName],
  )

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
    const loansLastUpdated = normalizedLoans.map((loan) => loan.updatedAt ?? loan.createdAt).sort((a, b) => b.localeCompare(a))[0] ?? null
    return {
      sales: salesLastUpdated,
      expenses: expenseLastUpdated,
      loans: loansLastUpdated,
      fixed: null,
    }
  }, [dashboardRangeBounds.from, dashboardRangeBounds.to, data.cashouts, data.sales, normalizedLoans])

  return {
    currentHolder,
    dailyFinalSummary,
    dashboardExpenseTotal,
    dashboardLastUpdated,
    dashboardSales,
    dashboardRangeBounds,
    dailyCashoutUserOptions: uniqNames(dailyCashouts.map((entry) => entry.recordedBy)),
    directoryOptions,
    filteredCashouts,
    holderAssignments,
    monthlyFixedExpense: monthlyOperationalExpense,
    normalizedLoans,
    pendingCashNow,
    projectedMonthlySales,
    totalVendorOutstanding,
    todayCashout,
    todayPaymentPaid,
    todayPaymentReceived,
    totalLoans,
    vendorOutstandingByName,
  }
}
