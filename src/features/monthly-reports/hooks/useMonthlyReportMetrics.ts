import { useMemo } from 'react'
import { IST_TIMEZONE } from '@/app/uiHelpers'
import type { MonthlyReportMeta, LoanEntry, CashTransfer, DailyCashoutEntry, VendorRecord } from '@/domain/appTypes'
import type { FinanceData } from '@/domain/financeTypes'

export type MonthlyReportSummary = {
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

export type MonthlyReportDetail = MonthlyReportSummary & {
  salesMix: {
    cashSales: number
    upiSales: number
    cardSales: number
    bankTransferSales: number
    creditSales: number
    returnsDiscounts: number
  }
  expenseByCategory: Array<{ category: string; amount: number }>
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

type UseMonthlyReportMetricsArgs = {
  data: FinanceData
  dailyCashouts: DailyCashoutEntry[]
  cashTransfers: CashTransfer[]
  loans: LoanEntry[]
  monthlyReports: MonthlyReportMeta[]
  defaultMarginPercentage: number
  totalVendorOutstanding: number
  totalLoans: number
  vendors: VendorRecord[]
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

function sumByMonth<T extends { date: string }>(items: T[], month: string, selector: (item: T) => number) {
  return items
    .filter((item) => item.date.slice(0, 7) === month)
    .reduce((total, item) => total + selector(item), 0)
}

export function useMonthlyReportMetrics({
  cashTransfers,
  dailyCashouts,
  data,
  defaultMarginPercentage,
  loans,
  monthlyReports,
  totalLoans,
  totalVendorOutstanding,
}: UseMonthlyReportMetricsArgs) {
  return useMemo(() => {
    const monthSet = new Set<string>()
    const metaByMonth = new Map(monthlyReports.map((entry) => [entry.month, entry]))

    data.sales.forEach((entry) => monthSet.add(entry.date.slice(0, 7)))
    data.cashouts.forEach((entry) => monthSet.add(entry.date.slice(0, 7)))
    data.purchases.forEach((entry) => monthSet.add(entry.date.slice(0, 7)))
    data.payments.forEach((entry) => monthSet.add(entry.date.slice(0, 7)))
    dailyCashouts.forEach((entry) => monthSet.add(entry.date.slice(0, 7)))
    cashTransfers.forEach((entry) => monthSet.add(entry.date.slice(0, 7)))
    monthlyReports.forEach((entry) => monthSet.add(entry.month))

    const months = Array.from(monthSet).sort((left, right) => right.localeCompare(left))

    const summaries = months.map<MonthlyReportSummary>((month) => {
      const marginPercentage = metaByMonth.get(month)?.marginPercentage ?? defaultMarginPercentage
      const totalSales = sumByMonth(data.sales, month, (entry) => entry.totalSales)
      const totalCashoutExpenses = sumByMonth(data.cashouts, month, (entry) => entry.amount)
      const totalPurchases = sumByMonth(data.purchases, month, (entry) => entry.purchaseAmount)
      const vendorPaymentTotal = data.payments
        .filter((entry) => entry.date.slice(0, 7) === month && entry.type === 'Paid' && (entry.entryType ?? 'vendor-payment') === 'vendor-payment')
        .reduce((total, entry) => total + entry.amount, 0)
      const totalReturns = sumByMonth(data.sales, month, (entry) => entry.returnsDiscounts)
      const updatedAt = [
        ...data.sales.filter((entry) => entry.date.slice(0, 7) === month).map((entry) => entry.updatedAt),
        ...data.cashouts.filter((entry) => entry.date.slice(0, 7) === month).map((entry) => entry.updatedAt),
        ...data.purchases.filter((entry) => entry.date.slice(0, 7) === month).map((entry) => entry.updatedAt),
        ...data.payments.filter((entry) => entry.date.slice(0, 7) === month).map((entry) => entry.updatedAt),
        ...monthlyReports.filter((entry) => entry.month === month).map((entry) => entry.updatedAt),
      ].sort((left, right) => right.localeCompare(left))[0] ?? null

      return {
        month,
        label: formatMonthLabel(month),
        marginPercentage,
        totalSales,
        totalCashoutExpenses,
        grossProfitEstimate: totalSales * (marginPercentage / 100),
        totalPurchases,
        vendorPaymentTotal,
        totalReturns,
        updatedAt,
      }
    })

    const detailsByMonth = new Map<string, MonthlyReportDetail>()

    summaries.forEach((summary) => {
      const sales = data.sales.filter((entry) => entry.date.slice(0, 7) === summary.month)
      const cashouts = data.cashouts.filter((entry) => entry.date.slice(0, 7) === summary.month)
      const purchases = data.purchases.filter((entry) => entry.date.slice(0, 7) === summary.month)
      const payments = data.payments.filter((entry) => entry.date.slice(0, 7) === summary.month)
      const monthlyDailyCashouts = dailyCashouts.filter((entry) => entry.date.slice(0, 7) === summary.month)
      const transfers = cashTransfers.filter((entry) => entry.date.slice(0, 7) === summary.month)

      const expenseByCategoryMap = new Map<string, number>()
      cashouts.forEach((entry) => {
        expenseByCategoryMap.set(entry.category, (expenseByCategoryMap.get(entry.category) ?? 0) + entry.amount)
      })

      const salesMix = {
        cashSales: sales.reduce((total, entry) => total + entry.cashSales, 0),
        upiSales: sales.reduce((total, entry) => total + entry.upiSales, 0),
        cardSales: sales.reduce((total, entry) => total + entry.cardSales, 0),
        bankTransferSales: sales.reduce((total, entry) => total + entry.bankTransferSales, 0),
        creditSales: sales.reduce((total, entry) => total + entry.creditSales, 0),
        returnsDiscounts: sales.reduce((total, entry) => total + entry.returnsDiscounts, 0),
      }

      const transferredToBank = transfers
        .filter((entry) => entry.toType === 'bank')
        .reduce((total, entry) => total + entry.amount, 0)
      const transferredToPeople = transfers
        .filter((entry) => entry.toType === 'person')
        .reduce((total, entry) => total + entry.amount, 0)
      const drawerTotalRecorded = monthlyDailyCashouts.reduce((total, entry) => total + (entry.drawerTotal ?? entry.remainingBalance), 0)

      detailsByMonth.set(summary.month, {
        ...summary,
        salesMix,
        expenseByCategory: Array.from(expenseByCategoryMap.entries())
          .map(([category, amount]) => ({ category, amount }))
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
      })
    })

    return {
      months,
      summaries,
      detailsByMonth,
      defaultSelectedMonth: months[0] ?? null,
      openLoanCount: loans.filter((entry) => entry.remainingAmount > 0).length,
    }
  }, [cashTransfers, dailyCashouts, data.cashouts, data.payments, data.purchases, data.sales, defaultMarginPercentage, loans, monthlyReports, totalLoans, totalVendorOutstanding])
}
