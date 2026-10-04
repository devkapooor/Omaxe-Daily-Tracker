import type { PosBill, PosBillState, PosPaymentMethod, PosProduct, PosRefundEvent } from './types'

const dashboardMethods: Array<{ value: PosPaymentMethod; label: string }> = [
  { value: 'cash', label: 'Cash' }, { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' }, { value: 'bank-transfer', label: 'Legacy Bank Transfer (historical)' },
]

export function calculatePosDashboard(bills: PosBill[], states: PosBillState[], refunds: PosRefundEvent[], from: string, to: string, products: PosProduct[] = []) {
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
  const unitsSold = active.reduce((sum, bill) => sum + bill.lines.reduce((lineSum, line) => lineSum + line.quantity, 0), 0)
  const productSales = new Map<string, { id: string; name: string; quantity: number; revenuePaise: number }>()
  active.forEach((bill) => bill.lines.forEach((line) => {
    if (line.kind !== 'product' || !line.productId) return
    const current = productSales.get(line.productId) ?? { id: line.productId, name: line.description, quantity: 0, revenuePaise: 0 }
    current.quantity += line.quantity
    current.revenuePaise += line.quantity * line.unitPricePaise
    productSales.set(line.productId, current)
  }))
  const activeProducts = products.filter((product) => product.active)
  const negativeStock = activeProducts.filter((product) => product.currentQuantity < 0).sort((a, b) => a.currentQuantity - b.currentQuantity)
  const zeroStock = activeProducts.filter((product) => product.currentQuantity === 0).sort((a, b) => a.name.localeCompare(b.name))
  return {
    salesPaise, refundsPaise, netPaise: salesPaise - refundsPaise,
    billCount: active.length,
    unitsSold,
    averageBillPaise: active.length === 0 ? 0 : Math.round(salesPaise / active.length),
    splitBillCount: active.filter((bill) => bill.payments.filter((payment) => payment.amountPaise > 0).length > 1).length,
    discountedBillCount: active.filter((bill) => bill.discount.amountPaise > 0).length,
    unresolvedItemCount: active.reduce((sum, bill) => sum + bill.lines.filter((line) => line.kind === 'temporary').reduce((lineSum, line) => lineSum + line.quantity, 0), 0),
    discountPaise: active.reduce((sum, bill) => sum + bill.discount.amountPaise, 0),
    refundCount: approvedRefunds.length,
    voidedCount: periodBills.length - active.length,
    voidedPaise: periodBills.filter((bill) => voided.has(bill.id)).reduce((sum, bill) => sum + bill.totalPaise, 0),
    unassignedRefundsPaise: approvedRefunds.filter((event) => !dashboardMethods.some((method) => method.value === event.refundMethod)).reduce((sum, event) => sum + (event.refundAmountPaise ?? 0), 0),
    methods,
    topProducts: [...productSales.values()].sort((a, b) => b.revenuePaise - a.revenuePaise || b.quantity - a.quantity).slice(0, 5),
    negativeStockCount: negativeStock.length,
    zeroStockCount: zeroStock.length,
    stockAttention: [...negativeStock, ...zeroStock].slice(0, 5),
    recentBills: [...active].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5),
  }
}
