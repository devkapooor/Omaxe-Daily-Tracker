import type { DashboardMonthOffset } from '@/app/uiHelpers'
import { IST_TIMEZONE } from '@/app/uiHelpers'
import type { DailyCashoutEntry } from '@/domain/appTypes'
import type { FinanceData } from '@/domain/financeTypes'

export type MonthlyTotals = {
  sales: number
  expenses: number
  operatingBalance: number
  cashCollected: number
}

export type DailySalesTrendPoint = {
  day: number
  selected: number | null
  previous: number | null
}

export type RecordingCoverage = {
  recordedDays: number
  coverageDays: number
  latestDate?: string
}

export type BreakEvenMetrics = {
  breakEvenSales: number | null
  progressPercentage: number | null
  amountRemaining: number | null
  requiredDailySales: number | null
  remainingDays: number | null
  attained: boolean | null
}

export type MonthlyPerformanceMetrics = MonthlyTotals & {
  monthKey: string
  monthLabel: string
  isCurrentMonth: boolean
  previous: MonthlyTotals
  salesMix: {
    cash: number
    upi: number
    card: number
    credit: number
    returns: number
  }
  averageDailySales: number
  outlookSales: number
  estimatedMarginResult: number
  breakEven: BreakEvenMetrics
  dailySalesTrend: DailySalesTrendPoint[]
  recordingHealth: {
    sales: RecordingCoverage
    cashouts: RecordingCoverage
  }
}

type DeriveMonthlyPerformanceArgs = {
  currentDate: string
  dashboardMonthOffset: DashboardMonthOffset
  dailyCashouts: DailyCashoutEntry[]
  data: FinanceData
  marginPercentage: number
  monthlyOperationalExpense: number
}

function monthKeyForOffset(currentDate: string, offset: number) {
  const [year, month] = currentDate.split('-').map(Number)
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

function totalsByDay(entries: FinanceData['sales'], monthKey: string) {
  return entries.reduce<Map<number, number>>((totals, entry) => {
    if (entry.date.slice(0, 7) !== monthKey) return totals
    const day = dayOfMonth(entry.date)
    if (day > 0) totals.set(day, (totals.get(day) ?? 0) + entry.totalSales)
    return totals
  }, new Map())
}

function recordingCoverage(dates: string[], monthKey: string, coverageDays: number): RecordingCoverage {
  const matchingDates = dates.filter((date) => date.slice(0, 7) === monthKey)
  const uniqueDates = new Set(matchingDates.map((date) => date.slice(0, 10)))
  const latestDate = matchingDates.sort((left, right) => right.localeCompare(left))[0]

  return {
    recordedDays: uniqueDates.size,
    coverageDays,
    ...(latestDate ? { latestDate } : {}),
  }
}

function deriveBreakEven(
  sales: number,
  marginPercentage: number,
  monthlyOperationalExpense: number,
  isCurrentMonth: boolean,
  remainingDays: number,
): BreakEvenMetrics {
  if (!Number.isFinite(marginPercentage) || marginPercentage <= 0) {
    return {
      breakEvenSales: null,
      progressPercentage: null,
      amountRemaining: null,
      requiredDailySales: null,
      remainingDays: isCurrentMonth ? remainingDays : null,
      attained: null,
    }
  }

  const breakEvenSales = Math.max(monthlyOperationalExpense, 0) / (marginPercentage / 100)
  const amountRemaining = Math.max(breakEvenSales - sales, 0)
  const progressPercentage = breakEvenSales === 0 ? 100 : (sales / breakEvenSales) * 100

  return {
    breakEvenSales,
    progressPercentage,
    amountRemaining,
    requiredDailySales: isCurrentMonth ? amountRemaining / Math.max(remainingDays, 1) : null,
    remainingDays: isCurrentMonth ? remainingDays : null,
    attained: sales >= breakEvenSales,
  }
}

export function deriveMonthlyPerformance({
  currentDate,
  dashboardMonthOffset,
  dailyCashouts,
  data,
  marginPercentage,
  monthlyOperationalExpense,
}: DeriveMonthlyPerformanceArgs): MonthlyPerformanceMetrics {
  const selectedMonth = monthKeyForOffset(currentDate, dashboardMonthOffset)
  const previousMonth = monthKeyForOffset(currentDate, dashboardMonthOffset + 1)
  const totals = deriveMonthlyTotals(data, dailyCashouts, selectedMonth)
  const previous = deriveMonthlyTotals(data, dailyCashouts, previousMonth)
  const selectedSales = data.sales.filter((entry) => entry.date.slice(0, 7) === selectedMonth)
  const selectedCashouts = dailyCashouts.filter((entry) => entry.date.slice(0, 7) === selectedMonth)
  const latestSalesDate = selectedSales.map((entry) => entry.date).sort((left, right) => right.localeCompare(left))[0]
  const completedDays = latestSalesDate ? dayOfMonth(latestSalesDate) : 0
  const averageDailySales = completedDays > 0 ? totals.sales / completedDays : 0
  const isCurrentMonth = dashboardMonthOffset === 0
  const selectedMonthDays = daysInMonth(selectedMonth)
  const currentDay = Math.min(dayOfMonth(currentDate), selectedMonthDays)
  const coverageDays = isCurrentMonth ? currentDay : selectedMonthDays
  const remainingDays = isCurrentMonth ? selectedMonthDays - currentDay + 1 : 0
  const outlookSales = isCurrentMonth ? averageDailySales * selectedMonthDays : totals.sales
  const estimatedMarginResult = outlookSales * (marginPercentage / 100) - monthlyOperationalExpense
  const selectedSalesByDay = totalsByDay(data.sales, selectedMonth)
  const previousSalesByDay = totalsByDay(data.sales, previousMonth)

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
        card: mix.card + (entry.cardSales ?? 0),
        credit: mix.credit + entry.creditSales,
        returns: mix.returns + entry.returns,
      }),
      { cash: 0, upi: 0, card: 0, credit: 0, returns: 0 },
    ),
    averageDailySales,
    outlookSales,
    estimatedMarginResult,
    breakEven: deriveBreakEven(totals.sales, marginPercentage, monthlyOperationalExpense, isCurrentMonth, remainingDays),
    dailySalesTrend: Array.from({ length: coverageDays }, (_, index) => {
      const day = index + 1
      return {
        day,
        selected: selectedSalesByDay.get(day) ?? null,
        previous: previousSalesByDay.get(day) ?? null,
      }
    }),
    recordingHealth: {
      sales: recordingCoverage(data.sales.map((entry) => entry.date), selectedMonth, coverageDays),
      cashouts: recordingCoverage(dailyCashouts.map((entry) => entry.date), selectedMonth, coverageDays),
    },
  }
}
