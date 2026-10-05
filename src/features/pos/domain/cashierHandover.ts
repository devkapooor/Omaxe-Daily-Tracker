import type { PosBill, PosBillState, PosRefundEvent } from './types'
import { serverNowIso } from '@/shared/lib/serverClock'

export const HANDOVER_START = '2026-10-03T18:30:00.000Z'
export const denominations = [500, 200, 100, 50, 20, 10, 5, 2, 1] as const
export type CountTotals = { cash: number; upi: number; card: number }
export type HandoverCheckpoint = {
  cashActualPaise: number; cashNetPaise: number; date: string
  upiActualPaise: number; cardActualPaise: number; upiNetPaise: number; cardNetPaise: number
  reconciliationId: string
}
export type HandoverLedger = {
  initialized: boolean; revision: number; cashNetPaise: number
  dailyTotals: Record<string, { upi: number; card: number }>
  lastOperation: 'initialize' | 'bill' | 'refund' | 'reconciliation' | 'cashout-close'
  lastOperationId: string; updatedByUid: string; checkpoint?: HandoverCheckpoint
}
export type CashierState = {
  uid: string; authTime: number; needsLogoutCheck: boolean
  lastBillId: string; lastReconciliationId: string; updatedAt: string
  closed?: boolean
}
export type CashierReconciliation = {
  id: string; uid: string; name: string; authTime: number; kind: 'login' | 'logout'
  date: string; denominations: Record<string, number>; coinPaise: number
  actual: CountTotals; expected: CountTotals; delta: CountTotals
  hasDiscrepancy: boolean; createdAt: string; note: string
  reviewStatus: 'pending' | 'matched' | 'reviewed'; reviewedByUid?: string; reviewedAt?: string
}

export function requiresLoginHandover(cashier: CashierState | null, historical: boolean, authTime: number | null, sessionAuthTime: number | null) {
  if (!historical && !cashier) return false
  return !cashier || cashier.authTime !== authTime || cashier.closed === true ||
    (cashier.needsLogoutCheck && sessionAuthTime !== authTime)
}

export function handoverDate(timestamp = serverNowIso()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(timestamp))
}

export function countCash(counts: Record<string, number>, coinPaise: number) {
  if (!Number.isSafeInteger(coinPaise) || coinPaise < 0) throw new Error('Loose coins must be a non-negative amount.')
  let total = coinPaise
  for (const denomination of denominations) {
    const count = counts[String(denomination)] ?? 0
    if (!Number.isSafeInteger(count) || count < 0 || count > 1000000) throw new Error('Denomination counts must be whole numbers between 0 and 1,000,000.')
    total += denomination * 100 * count
  }
  if (!Number.isSafeInteger(total)) throw new Error('Cash count is too large.')
  return total
}

export function expectedHandover(ledger: HandoverLedger, date: string): CountTotals {
  const day = ledger.dailyTotals[date] ?? { upi: 0, card: 0 }
  const previous = ledger.checkpoint
  return {
    cash: previous ? previous.cashActualPaise + ledger.cashNetPaise - previous.cashNetPaise : ledger.cashNetPaise,
    upi: previous?.date === date ? previous.upiActualPaise + day.upi - previous.upiNetPaise : day.upi,
    card: previous?.date === date ? previous.cardActualPaise + day.card - previous.cardNetPaise : day.card,
  }
}

// Historical migration is read-only for receipts and stock. Voids follow existing POS reversal semantics.
export function seedHandoverTotals(bills: PosBill[], states: PosBillState[], events: Array<PosRefundEvent & { createdAt?: string }>) {
  const ledger: HandoverLedger = { initialized: true, revision: 0, cashNetPaise: 0, dailyTotals: {}, lastOperation: 'initialize', lastOperationId: '', updatedByUid: '' }
  const voided = new Set(states.filter((state) => state.state === 'voided').map((state) => state.billId))
  const voidEvents = new Set(events.filter((event) => event.type === 'bill-voided').map((event) => event.billId))
  const byId = new Map(bills.map((bill) => [bill.id, bill]))
  for (const bill of bills.filter((item) => item.createdAt >= HANDOVER_START)) {
    if (voided.has(bill.id) && !voidEvents.has(bill.id)) continue
    applyPayments(ledger, bill.payments, handoverDate(bill.createdAt), 1)
  }
  for (const event of events) {
    if (!event.createdAt || event.createdAt < HANDOVER_START) continue
    if (event.type === 'bill-voided') {
      const bill = byId.get(event.billId ?? '')
      if (bill?.createdAt && bill.createdAt >= HANDOVER_START) applyPayments(ledger, bill.payments, handoverDate(event.createdAt), -1)
    } else if (event.type === 'bill-return-approved') {
      applyPayments(ledger, [{ method: event.refundMethod ?? '', amountPaise: event.refundAmountPaise ?? 0 }], handoverDate(event.createdAt), -1)
    }
  }
  return ledger
}

export function applyPayments(ledger: HandoverLedger, payments: Array<{ method: string; amountPaise: number }>, date: string, sign: 1 | -1) {
  const day = { ...(ledger.dailyTotals[date] ?? { upi: 0, card: 0 }) }
  for (const payment of payments) {
    const amount = sign * payment.amountPaise
    if (!Number.isSafeInteger(amount)) throw new Error('Invalid payment amount in billing history.')
    if (payment.method === 'cash') ledger.cashNetPaise += amount
    if (payment.method === 'upi') day.upi += amount
    if (payment.method === 'card') day.card += amount
  }
  ledger.dailyTotals = { ...ledger.dailyTotals, [date]: day }
}
