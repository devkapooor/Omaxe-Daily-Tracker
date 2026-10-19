import type { Cashout, DailySales } from './financeTypes'
import type { DailyCashoutEntry } from './appTypes'

export const isPosRefundExpense = (entry: Cashout) => entry.sourceKind === 'pos-return'
/** Legacy sales keep their recorded meaning; only new closing snapshots carry net. */
export const recordedNetSales = (entry: DailySales) => entry.refundAccountingVersion === 1 && typeof entry.netSalesAmount === 'number' ? entry.netSalesAmount : entry.totalSales
export const ordinaryExpenseAmount = (entry: Cashout) => isPosRefundExpense(entry) || entry.sourceKind === 'vendor-payment' || ['cancelled','bounced'].includes(entry.paymentStatus ?? '') ? 0 : entry.amount
export function refundCashoutSnapshot(entry: DailyCashoutEntry) {
  return entry.refundAccountingVersion === 1 ? { refundAccountingVersion: 1 as const, posCashRefundPaise: entry.posCashRefundPaise ?? 0, posRefundDayRevision: entry.posRefundDayRevision ?? 0, posRefundDayTotalPaise: entry.posRefundDayTotalPaise ?? 0, posSourceHandoverRevision: entry.posSourceHandoverRevision ?? 0 } : {}
}
