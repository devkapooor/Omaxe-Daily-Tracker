import { collection, doc, getDocFromServer, getDocsFromServer, onSnapshot, orderBy, query, runTransaction, setDoc, updateDoc, where, limit } from 'firebase/firestore'
import type { AppUser } from '@/domain/financeTypes'
import { auth, db } from '@/shared/lib/firebase'
import { serverNowIso } from '@/shared/lib/serverClock'
import { HANDOVER_START, countCash, expectedHandover, handoverDate, seedHandoverTotals, type CashierReconciliation, type CashierState, type HandoverLedger } from '../domain/cashierHandover'
import type { PosBill, PosBillState, PosRefundEvent } from '../domain/types'

export const handoverRef = () => doc(db, 'posSandboxes', 'test', 'handover', 'main')
export const cashierRef = (uid: string) => doc(db, 'posSandboxes', 'test', 'cashierStates', uid)
const records = () => collection(db, 'posSandboxes', 'test', 'reconciliations')

export async function cashierAuthTime() {
  if (!auth.currentUser) throw new Error('Please sign in again.')
  const token = await auth.currentUser.getIdTokenResult()
  return Number(token.claims.auth_time)
}
export function subscribeHandover(callback: (ledger: HandoverLedger | null) => void, error: (error: Error) => void) {
  return onSnapshot(handoverRef(), (snapshot) => callback(snapshot.exists() ? snapshot.data() as HandoverLedger : null), error)
}
export function subscribeCashier(uid: string, callback: (state: CashierState | null) => void, error: (error: Error) => void) {
  return onSnapshot(cashierRef(uid), (snapshot) => callback(snapshot.exists() ? snapshot.data() as CashierState : null), error)
}
export async function hasHistoricalBills(uid: string) {
  const snapshot = await getDocsFromServer(query(collection(db, 'posSandboxes', 'test', 'bills'), where('createdByUid', '==', uid)))
  return snapshot.docs.some((item) => String(item.data().createdAt ?? '') >= HANDOVER_START)
}

export async function initializeHandover(actor: AppUser) {
  if (actor.role !== 'owner') throw new Error('The owner must initialize the shared drawer first.')
  const ref = handoverRef()
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref)
    if (snapshot.data()?.initialized) throw new Error('The shared drawer is already initialized.')
    if (snapshot.exists()) return
    transaction.set(ref, { initialized: false, revision: 0, cashNetPaise: 0, dailyTotals: {}, lastOperation: 'initialize', lastOperationId: '', updatedByUid: actor.id })
  })
  // The initializing record pauses new checkout; retries can safely resume this read-only migration.
  const [billsSnapshot, statesSnapshot, eventsSnapshot] = await Promise.all([
    getDocsFromServer(query(collection(db, 'posSandboxes', 'test', 'bills'), where('createdAt', '>=', HANDOVER_START))),
    getDocsFromServer(collection(db, 'posSandboxes', 'test', 'billStates')),
    getDocsFromServer(collection(db, 'posSandboxes', 'test', 'events')),
  ])
  const bills = billsSnapshot.docs.map((item) => item.data() as PosBill)
  const ledger = seedHandoverTotals(bills, statesSnapshot.docs.map((item) => item.data() as PosBillState), eventsSnapshot.docs.map((item) => item.data() as PosRefundEvent & { createdAt?: string }))
  const lastByUser = new Map<string, PosBill>()
  for (const bill of bills.sort((a, b) => a.createdAt.localeCompare(b.createdAt))) lastByUser.set(bill.createdByUid, bill)
  for (const [uid, bill] of lastByUser) {
    const ref = cashierRef(uid)
    const existing = await getDocFromServer(ref)
    if (!existing.exists()) await setDoc(ref, { uid, authTime: 0, needsLogoutCheck: true, lastBillId: bill.id, lastReconciliationId: '', updatedAt: serverNowIso() } satisfies CashierState)
  }
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref)
    if (snapshot.data()?.initialized) throw new Error('Another owner already completed setup. Reload.')
    transaction.set(ref, { ...ledger, revision: 1, updatedByUid: actor.id })
  })
}

export async function submitHandover(actor: AppUser, kind: 'login' | 'logout', counts: Record<string, number>, coinPaise: number, upi: number, card: number, revision: number, date: string, note: string) {
  if (!navigator.onLine) throw new Error('Reconnect before submitting the handover.')
  if (date !== handoverDate()) throw new Error('The day changed. Reload the count for the new day.')
  for (const value of [upi, card]) if (!Number.isSafeInteger(value) || value < 0) throw new Error('Machine totals must be non-negative amounts.')
  const actual = { cash: countCash(counts, coinPaise), upi, card }
  const authTime = await cashierAuthTime()
  const id = crypto.randomUUID()
  return runTransaction(db, async (transaction) => {
    const [ledgerSnapshot, cashierSnapshot] = await Promise.all([transaction.get(handoverRef()), transaction.get(cashierRef(actor.id))])
    const ledger = ledgerSnapshot.data() as HandoverLedger | undefined
    if (!ledger?.initialized) throw new Error('The owner must finish drawer setup first.')
    if (ledger.revision !== revision) throw new Error('Billing or another handover changed the totals. Check the updated amounts and submit again.')
    const expected = expectedHandover(ledger, date)
    const delta = { cash: actual.cash - expected.cash, upi: upi - expected.upi, card: card - expected.card }
    const hasDiscrepancy = Object.values(delta).some((value) => value !== 0)
  const createdAt = serverNowIso()
    const record: CashierReconciliation = { id, uid: actor.id, name: actor.name, authTime, kind, date, denominations: counts, coinPaise, actual, expected, delta, hasDiscrepancy, createdAt, note: note.trim(), reviewStatus: hasDiscrepancy ? 'pending' : 'matched' }
    transaction.set(doc(records(), id), record)
    const previous = cashierSnapshot.data() as CashierState | undefined
    transaction.set(cashierRef(actor.id), { uid: actor.id, authTime, needsLogoutCheck: false, closed: kind === 'logout', lastBillId: previous?.lastBillId ?? '', lastReconciliationId: id, updatedAt: createdAt } satisfies CashierState)
    const day = ledger.dailyTotals[date] ?? { upi: 0, card: 0 }
    transaction.set(handoverRef(), { ...ledger, revision: ledger.revision + 1, lastOperation: 'reconciliation', lastOperationId: id, updatedByUid: actor.id, checkpoint: { cashActualPaise: actual.cash, cashNetPaise: ledger.cashNetPaise, date, upiActualPaise: upi, cardActualPaise: card, upiNetPaise: day.upi, cardNetPaise: day.card, reconciliationId: id } })
    return record
  })
}

export function subscribeReconciliations(callback: (records: CashierReconciliation[]) => void, error: (error: Error) => void) {
  let recent: CashierReconciliation[] = []
  let pending: CashierReconciliation[] = []
  const publish = () => callback([...new Map([...recent, ...pending].map((item) => [item.id, item])).values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
  const stopRecent = onSnapshot(query(records(), orderBy('createdAt', 'desc'), limit(100)), (snapshot) => { recent = snapshot.docs.map((item) => item.data() as CashierReconciliation); publish() }, error)
  const stopPending = onSnapshot(query(records(), where('reviewStatus', '==', 'pending')), (snapshot) => { pending = snapshot.docs.map((item) => item.data() as CashierReconciliation); publish() }, error)
  return () => { stopRecent(); stopPending() }
}
export async function acknowledgeReconciliation(id: string, uid: string) {
  await updateDoc(doc(records(), id), { reviewStatus: 'reviewed', reviewedByUid: uid, reviewedAt: serverNowIso() })
}
