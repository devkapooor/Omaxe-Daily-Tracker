import type { PosBill, PosBillState, PosPaymentMethod, PosRefundEvent } from './types'

const dashboardMethods: Array<{ value: PosPaymentMethod; label: string }> = [
  { value: 'cash', label: 'Cash' }, { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' }, { value: 'bank-transfer', label: 'Bank Transfer' },
]

export function calculatePosDashboard(bills: PosBill[], states: PosBillState[], refunds: PosRefundEvent[], from: string, to: string) {
  const voided = new Set(states.filter((state) => state.state === 'voided').map((state) => state.billId))
  const periodBills = bills.filter((bill) => bill.businessDate >= from && bill.businessDate <= to)
  const active = periodBills.filter((bill) => !voided.has(bill.id))
  const approvedRefunds = refunds.filter((event) => event.type === 'bill-return-approved' && event.refundDate && event.refundDate >= from && event.refundDate <= to)
  const methods = dashboardMethods.map((method) => {
    const collectedPaise = active.reduce((sum, bill) => sum + bill.payments.filter((payment) => payment.method === method.value).reduce((paid, payment) => paid + payment.amountPaise, 0), 0)
    const refundedPaise = approvedRefunds.filter((event) => event.refundMethod === method.value).reduce((sum, event) => sum + (event.refundAmountPaise ?? 0), 0)
    return { ...method, collectedPaise, refundedPaise, netPaise: collectedPaise - refundedPaise }
  })
  const salesPaise = active.reduce((sum, bill) => sum + bill.totalPaise, 0)
  const refundsPaise = approvedRefunds.reduce((sum, event) => sum + (event.refundAmountPaise ?? 0), 0)
  return {
    salesPaise, refundsPaise, netPaise: salesPaise - refundsPaise,
    billCount: active.length,
    splitBillCount: active.filter((bill) => bill.payments.filter((payment) => payment.amountPaise > 0).length > 1).length,
    discountPaise: active.reduce((sum, bill) => sum + bill.discount.amountPaise, 0),
    voidedCount: periodBills.length - active.length,
    voidedPaise: periodBills.filter((bill) => voided.has(bill.id)).reduce((sum, bill) => sum + bill.totalPaise, 0),
    unassignedRefundsPaise: approvedRefunds.filter((event) => !dashboardMethods.some((method) => method.value === event.refundMethod)).reduce((sum, event) => sum + (event.refundAmountPaise ?? 0), 0),
    methods,
  }
}
