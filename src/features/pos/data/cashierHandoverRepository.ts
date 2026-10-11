import { collection, doc, getDocFromServer, getDocsFromServer, onSnapshot, query, runTransaction, serverTimestamp, setDoc, Timestamp, updateDoc, where } from 'firebase/firestore'
import type { AppUser } from '@/domain/financeTypes'
import { auth, db } from '@/shared/lib/firebase'
import { serverNowIso, serverNowMs } from '@/shared/lib/serverClock'
import { HANDOVER_START, activeCountReservation, countCash, expectedHandover, handoverDate, isCounterOpen, seedHandoverTotals, type CashierReconciliation, type CashierState, type CountReservation, type HandoverLedger } from '../domain/cashierHandover'
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
/** Server Rules independently reject writes while a reservation is live. */
export class DrawerCountInProgressError extends Error {
  constructor(name: string) { super(`${name} is counting the shared drawer. Wait until the count is saved or cancelled.`) }
}
export function assertDrawerAvailable(ledger: HandoverLedger) {
  const reservation = activeCountReservation(ledger, serverNowMs())
  if (reservation) throw new DrawerCountInProgressError(reservation.name)
}

export async function joinCounter(actor: AppUser) {
  const authTime = await cashierAuthTime()
  await runTransaction(db, async (transaction) => {
    const [ledgerSnapshot, cashierSnapshot] = await Promise.all([transaction.get(handoverRef()), transaction.get(cashierRef(actor.id))])
    const ledger = ledgerSnapshot.data() as HandoverLedger | undefined
    if (!isCounterOpen(ledger)) throw new Error('An opening count is required before joining the shared counter.')
    assertDrawerAvailable(ledger!)
    const previous = cashierSnapshot.data() as CashierState | undefined
    if (previous && previous.authTime > authTime) throw new Error('A newer login is using this staff account. Sign out and sign in again to resume here.')
    const joinedCounterId = ledger!.counterSession!.openingReconciliationId
    if (previous?.authTime === authTime && !previous.closed && previous.joinedCounterId === joinedCounterId) return
    transaction.set(cashierRef(actor.id), {
      uid: actor.id, authTime, needsLogoutCheck: previous?.needsLogoutCheck ?? false, closed: false,
      lastBillId: previous?.lastBillId ?? '', lastReconciliationId: previous?.lastReconciliationId ?? '',
      updatedAt: serverNowIso(), joinedCounterId, joinedAt: serverTimestamp(),
    })
  })
}

export async function reserveCount(actor: AppUser, kind: 'login' | 'logout'): Promise<CountReservation> {
  const authTime = await cashierAuthTime()
  const id = crypto.randomUUID()
  return runTransaction(db, async (transaction) => {
    const [snapshot, cashierSnapshot] = await Promise.all([transaction.get(handoverRef()), transaction.get(cashierRef(actor.id))])
    const ledger = snapshot.data() as HandoverLedger | undefined
    if (!ledger?.initialized) throw new Error('The owner must finish shared drawer setup first.')
    assertDrawerAvailable(ledger)
    const date = handoverDate()
    const cashier = cashierSnapshot.data() as CashierState | undefined
    if (cashier && cashier.authTime > authTime) throw new Error('A newer login is using this staff account. Sign out and sign in again to resume here.')
    if (kind === 'login' && isCounterOpen(ledger, date)) throw new Error('The counter is already open. Join it without another count.')
    if (kind === 'logout' && (!cashier || cashier.closed || cashier.authTime !== authTime || cashier.joinedCounterId !== ledger.counterSession?.openingReconciliationId)) throw new Error('Join the shared counter before starting a logout count.')
    const reservation: CountReservation = { id, uid: actor.id, name: actor.name, authTime, kind, date, revision: ledger.revision + 1, startedAt: Timestamp.fromMillis(serverNowMs()) }
    transaction.set(handoverRef(), { ...ledger, revision: reservation.revision, countReservation: { ...reservation, startedAt: serverTimestamp() }, lastOperation: 'count-reserve', lastOperationId: id, updatedByUid: actor.id })
    return reservation
  })
}

export async function releaseCount(actor: AppUser, reservationId: string) {
  const authTime = await cashierAuthTime()
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(handoverRef())
    const ledger = snapshot.data() as HandoverLedger | undefined
    const reservation = ledger?.countReservation
    if (!ledger || !reservation || reservation.id !== reservationId) return
    if (activeCountReservation(ledger, serverNowMs()) && actor.role !== 'owner' && (reservation.uid !== actor.id || reservation.authTime !== authTime)) throw new Error('Only the counting cashier or owner can cancel this count.')
    transaction.set(handoverRef(), { ...ledger, revision: ledger.revision + 1, countReservation: null, lastOperation: 'count-release', lastOperationId: reservationId, updatedByUid: actor.id })
  })
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

export async function submitHandover(actor: AppUser, kind: 'login' | 'logout', counts: Record<string, number>, coinPaise: number, upi: number, card: number, revision: number, date: string, note: string, reservationId: string) {
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
    const reservation = activeCountReservation(ledger, serverNowMs())
    if (!reservation || reservation.id !== reservationId || reservation.uid !== actor.id || reservation.authTime !== authTime || reservation.kind !== kind || reservation.date !== date) throw new Error('Your counting reservation expired or changed. Restart the count before saving.')
    if (ledger.revision !== revision) throw new Error('Billing or another handover changed the totals. Check the updated amounts and submit again.')
    const expected = expectedHandover(ledger, date)
    const delta = { cash: actual.cash - expected.cash, upi: upi - expected.upi, card: card - expected.card }
    const hasDiscrepancy = Object.values(delta).some((value) => value !== 0)
    const createdAt = serverNowIso()
    const record: CashierReconciliation = { id, uid: actor.id, name: actor.name, authTime, kind, date, denominations: counts, coinPaise, actual, expected, delta, hasDiscrepancy, createdAt, note: note.trim(), reviewStatus: hasDiscrepancy ? 'pending' : 'matched', reservationId }
    transaction.set(doc(records(), id), { ...record, recordedAt: serverTimestamp() })
    const previous = cashierSnapshot.data() as CashierState | undefined
    transaction.set(cashierRef(actor.id), { uid: actor.id, authTime, needsLogoutCheck: false, closed: kind === 'logout', lastBillId: previous?.lastBillId ?? '', lastReconciliationId: id, updatedAt: createdAt, joinedCounterId: kind === 'login' ? id : ledger.counterSession!.openingReconciliationId, joinedAt: kind === 'login' ? serverTimestamp() : previous!.joinedAt })
    const day = ledger.dailyTotals[date] ?? { upi: 0, card: 0 }
    transaction.set(handoverRef(), {
      ...ledger,
      revision: ledger.revision + 1,
      lastOperation: 'reconciliation',
      lastOperationId: id,
      updatedByUid: actor.id,
      countReservation: null,
      ...(kind === 'login' ? { counterSession: { status: 'open', date, openingReconciliationId: id, openedByUid: actor.id } } : {}),
      checkpoint: { cashActualPaise: actual.cash, cashNetPaise: ledger.cashNetPaise, date, upiActualPaise: upi, cardActualPaise: card, upiNetPaise: day.upi, cardNetPaise: day.card, reconciliationId: id },
    })
    return record
  })
}

export function subscribeReconciliations(callback: (records: CashierReconciliation[]) => void, error: (error: Error) => void) {
  return onSnapshot(query(records(), where('reviewStatus', '==', 'pending')), (snapshot) => {
    callback(snapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as CashierReconciliation))
  }, error)
}
export async function acknowledgeReconciliation(id: string, uid: string) {
  await updateDoc(doc(records(), id), { reviewStatus: 'reviewed', reviewedByUid: uid, reviewedAt: serverNowIso() })
}
