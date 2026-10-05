import { collection, doc, getDocFromServer, getDocsFromServer, runTransaction } from 'firebase/firestore'
import type { AppUser } from '@/domain/financeTypes'
import type { DailyCashoutEntry } from '@/domain/appTypes'
import { db } from '@/shared/lib/firebase'
import { serverNowIso } from '@/shared/lib/serverClock'
import { expectedHandover, type HandoverLedger } from '../domain/cashierHandover'
import type { PosBill, PosRefundEvent } from '../domain/types'
import type { PosDrawerClosure } from '../domain/drawerClosure'
import { rupeesToPaise } from '../domain/posDomain'
import { handoverRef } from './cashierHandoverRepository'

export type HistoricalDrawerClosurePreview = {
  cashoutId: string
  businessDate: string
  cashoutCreatedAt: string
  countedPaise: number
  expectedAtClosurePaise: number
  differencePaise: number
  subsequentCashBillPaise: number
  subsequentCashRefundPaise: number
  subsequentNetCashPaise: number
  resultingBalancePaise: number
  ledgerRevision: number
  currentExpectedPaise: number
}

function cashFromPayments(payments: Array<{ method: string; amountPaise: number }> | undefined) {
  return (payments ?? []).filter((payment) => payment.method === 'cash').reduce((total, payment) => total + payment.amountPaise, 0)
}

export function deriveHistoricalDrawerClosurePreview(
  cashout: DailyCashoutEntry,
  ledger: HandoverLedger,
  bills: PosBill[],
  events: Array<PosRefundEvent & { createdAt?: string }>,
): HistoricalDrawerClosurePreview {
  if (cashout.drawerClosureId) throw new Error('This cashout already has a drawer closure.')
  const cutoff = cashout.createdAt
  const billsById = new Map(bills.map((bill) => [bill.id, bill]))
  const subsequentCashBillPaise = bills
    .filter((bill) => bill.createdAt > cutoff)
    .reduce((total, bill) => total + cashFromPayments(bill.payments), 0)
  let subsequentCashRefundPaise = 0
  for (const event of events) {
    if (!event.createdAt || event.createdAt <= cutoff) continue
    if (event.type === 'bill-voided') subsequentCashRefundPaise += cashFromPayments(billsById.get(event.billId ?? '')?.payments)
    if (event.type === 'bill-return-approved' && event.refundMethod === 'cash') subsequentCashRefundPaise += event.refundAmountPaise ?? 0
  }
  const subsequentNetCashPaise = subsequentCashBillPaise - subsequentCashRefundPaise
  // Cash expectation is cumulative rather than business-date scoped. Reuse the
  // checkpoint date so this historical calculation stays pure and does not
  // depend on the live trusted clock.
  const currentExpectedPaise = expectedHandover(ledger, ledger.checkpoint!.date).cash
  const expectedAtClosurePaise = currentExpectedPaise - subsequentNetCashPaise
  const countedPaise = rupeesToPaise(cashout.drawerTotal ?? cashout.remainingBalance)
  return {
    cashoutId: cashout.id,
    businessDate: cashout.date,
    cashoutCreatedAt: cashout.createdAt,
    countedPaise,
    expectedAtClosurePaise,
    differencePaise: countedPaise - expectedAtClosurePaise,
    subsequentCashBillPaise,
    subsequentCashRefundPaise,
    subsequentNetCashPaise,
    resultingBalancePaise: subsequentNetCashPaise,
    ledgerRevision: ledger.revision,
    currentExpectedPaise,
  }
}

export async function previewHistoricalDrawerClosure(cashoutId: string) {
  const cashoutRef = doc(db, 'dailyCashouts', cashoutId)
  const [cashoutSnapshot, ledgerSnapshot, billsSnapshot, eventsSnapshot] = await Promise.all([
    getDocFromServer(cashoutRef),
    getDocFromServer(handoverRef()),
    getDocsFromServer(collection(db, 'posSandboxes', 'test', 'bills')),
    getDocsFromServer(collection(db, 'posSandboxes', 'test', 'events')),
  ])
  if (!cashoutSnapshot.exists()) throw new Error('The selected daily cashout does not exist.')
  const ledger = ledgerSnapshot.data() as HandoverLedger | undefined
  if (!ledger?.initialized || !ledger.checkpoint) throw new Error('The shared POS drawer has no completed handover checkpoint.')
  return deriveHistoricalDrawerClosurePreview(
    cashoutSnapshot.data() as DailyCashoutEntry,
    ledger,
    billsSnapshot.docs.map((item) => item.data() as PosBill),
    eventsSnapshot.docs.map((item) => item.data() as PosRefundEvent & { createdAt?: string }),
  )
}

export async function applyHistoricalDrawerClosure(preview: HistoricalDrawerClosurePreview, actor: AppUser) {
  if (actor.role !== 'owner') throw new Error('Only the owner can apply a historical drawer closure.')
  const cashoutRef = doc(db, 'dailyCashouts', preview.cashoutId)
  const closureRef = doc(db, 'posSandboxes', 'test', 'drawerClosures', preview.cashoutId)
  const createdAt = serverNowIso()
  await runTransaction(db, async (transaction) => {
    const [cashoutSnapshot, ledgerSnapshot, closureSnapshot] = await Promise.all([
      transaction.get(cashoutRef),
      transaction.get(handoverRef()),
      transaction.get(closureRef),
    ])
    if (!cashoutSnapshot.exists()) throw new Error('The selected daily cashout no longer exists.')
    if (closureSnapshot.exists()) throw new Error('This cashout already has a drawer closure.')
    const cashout = cashoutSnapshot.data() as DailyCashoutEntry
    const ledger = ledgerSnapshot.data() as HandoverLedger | undefined
    if (!ledger?.initialized || !ledger.checkpoint) throw new Error('The shared POS drawer has no completed handover checkpoint.')
    if (cashout.createdAt !== preview.cashoutCreatedAt || ledger.revision !== preview.ledgerRevision) {
      throw new Error('Cashout or POS activity changed after preview. Refresh the repair preview before applying it.')
    }
    if (expectedHandover(ledger, ledger.checkpoint.date).cash !== preview.currentExpectedPaise) {
      throw new Error('The current drawer expectation changed after preview. Refresh before applying the repair.')
    }
    const closure: PosDrawerClosure = {
      id: preview.cashoutId,
      cashoutId: preview.cashoutId,
      businessDate: preview.businessDate,
      kind: 'historical-repair',
      expectedBeforePaise: preview.expectedAtClosurePaise,
      countedPaise: preview.countedPaise,
      differencePaise: preview.differencePaise,
      removedPaise: preview.countedPaise,
      closingBalancePaise: 0,
      subsequentNetCashPaise: preview.subsequentNetCashPaise,
      resultingBalancePaise: preview.resultingBalancePaise,
      ledgerRevisionBefore: ledger.revision,
      recordedByUid: actor.id,
      recordedByName: actor.name,
      createdAt,
    }
    transaction.update(cashoutRef, {
      drawerClosureId: preview.cashoutId,
      cashRemovedPaise: preview.countedPaise,
      closingDrawerPaise: 0,
    })
    transaction.set(closureRef, closure)
    transaction.set(handoverRef(), {
      ...ledger,
      revision: ledger.revision + 1,
      lastOperation: 'cashout-close',
      lastOperationId: preview.cashoutId,
      updatedByUid: actor.id,
      checkpoint: {
        ...ledger.checkpoint,
        cashActualPaise: preview.resultingBalancePaise,
        cashNetPaise: ledger.cashNetPaise,
      },
    })
  })
}
