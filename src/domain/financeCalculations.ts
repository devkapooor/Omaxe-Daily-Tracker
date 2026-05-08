import type { Cashout, DailySales, FinanceData, Payment, PaymentMode, Purchase } from './financeTypes'

export type Summary = {
  collectedSales: number
  netEnteredSales: number
  creditSales: number
  purchaseAmount: number
  purchasePaid: number
  purchaseUnpaid: number
  cashout: number
  paymentReceived: number
  paymentPaid: number
  netMovement: number
  cashMovement: number
  digitalMovement: number
}

export type Projection = {
  projectedCollectedSales: number
  projectedPurchases: number
  projectedPurchasePaid: number
  projectedCashout: number
  projectedNetMovement: number
}

const digitalModes: PaymentMode[] = ['UPI', 'Card', 'Bank Transfer']

export function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0)
}

export function collectedSales(sales: DailySales) {
  return sales.cashSales + sales.upiSales + sales.cardSales + sales.bankTransferSales
}

export function summarize(
  sales: DailySales[],
  purchases: Purchase[],
  cashouts: Cashout[],
  payments: Payment[] = [],
): Summary {
  const collected = sum(sales.map(collectedSales))
  const netEnteredSales = sum(sales.map((item) => item.totalSales - item.returnsDiscounts))
  const creditSales = sum(sales.map((item) => item.creditSales))
  const purchaseAmount = sum(purchases.map((item) => item.purchaseAmount))
  const purchasePaid = sum(purchases.map((item) => item.paidAmount))
  const purchaseUnpaid = sum(purchases.map((item) => item.unpaidAmount))
  const cashout = sum(cashouts.map((item) => item.amount))
  const paymentReceived = sum(payments.filter((item) => item.type === 'Received').map((item) => item.amount))
  const paymentPaid = sum(payments.filter((item) => item.type === 'Paid').map((item) => item.amount))
  const cashPurchasePaid = sum(
    purchases.filter((item) => item.paymentMode === 'Cash').map((item) => item.paidAmount),
  )
  const cashCashout = sum(
    cashouts.filter((item) => item.paymentMode === 'Cash').map((item) => item.amount),
  )
  const digitalPurchasePaid = sum(
    purchases.filter((item) => digitalModes.includes(item.paymentMode)).map((item) => item.paidAmount),
  )
  const digitalCashout = sum(
    cashouts.filter((item) => digitalModes.includes(item.paymentMode)).map((item) => item.amount),
  )

  return {
    collectedSales: collected,
    netEnteredSales,
    creditSales,
    purchaseAmount,
    purchasePaid,
    purchaseUnpaid,
    cashout,
    paymentReceived,
    paymentPaid,
    netMovement: collected + paymentReceived - purchasePaid - cashout - paymentPaid,
    cashMovement:
      sum(sales.map((item) => item.cashSales)) +
      sum(payments.filter((item) => item.type === 'Received' && item.paymentMode === 'Cash').map((item) => item.amount)) -
      cashPurchasePaid -
      cashCashout -
      sum(payments.filter((item) => item.type === 'Paid' && item.paymentMode === 'Cash').map((item) => item.amount)),
    digitalMovement:
      sum(sales.map((item) => item.upiSales + item.cardSales + item.bankTransferSales)) -
      digitalPurchasePaid -
      digitalCashout +
      sum(
        payments
          .filter((item) => item.type === 'Received' && digitalModes.includes(item.paymentMode))
          .map((item) => item.amount),
      ) -
      sum(
        payments
          .filter((item) => item.type === 'Paid' && digitalModes.includes(item.paymentMode))
          .map((item) => item.amount),
      ),
  }
}

export function filterByDateAndStore<T extends { date: string; storeId: string }>(
  records: T[],
  from: string,
  to: string,
  storeId: string,
) {
  return records.filter((record) => {
    const matchesStore = storeId === 'all' || record.storeId === storeId
    return matchesStore && record.date >= from && record.date <= to
  })
}

export function getRangeSummary(data: FinanceData, from: string, to: string, storeId = 'all') {
  return summarize(
    filterByDateAndStore(data.sales, from, to, storeId),
    filterByDateAndStore(data.purchases, from, to, storeId),
    filterByDateAndStore(data.cashouts, from, to, storeId),
    filterByDateAndStore(data.payments, from, to, storeId),
  )
}

export function projectMonth(summary: Summary, completedDays: number, daysInMonth: number): Projection {
  const factor = completedDays > 0 ? daysInMonth / completedDays : 0

  return {
    projectedCollectedSales: summary.collectedSales * factor,
    projectedPurchases: summary.purchaseAmount * factor,
    projectedPurchasePaid: summary.purchasePaid * factor,
    projectedCashout: summary.cashout * factor,
    projectedNetMovement: summary.netMovement * factor,
  }
}

export function monthBounds(date: string) {
  const [year, month] = date.split('-').map(Number)
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const daysInMonth = new Date(year, month, 0).getDate()
  const end = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`
  return { start, end, daysInMonth }
}
