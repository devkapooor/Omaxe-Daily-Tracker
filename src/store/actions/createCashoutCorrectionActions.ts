import { doc, setDoc, writeBatch, type WriteBatch } from 'firebase/firestore'
import { shiftDate, today } from '@/app/uiHelpers'
import { cashoutCorrectionValuesEqual, cashoutEntryFromCorrection, correctionValuesFromEntry, normalizeCorrectionValues } from '@/domain/cashoutCorrections'
import type { CashoutCorrectionRequest, CashoutCorrectionValues, DailyCashoutEntry } from '@/domain/appTypes'
import type { AppUser, FinanceData } from '@/domain/financeTypes'
import { db } from '@/shared/lib/firebase'
import { normalizeName, nowIso, type StoreCollectionState } from '@/store/storeShared'
import { CASHOUT_CORRECTION_WINDOW_DAYS } from '@/config/appConfig'

type CashoutCorrectionActionArgs = {
  getState: () => StoreCollectionState
  writeSalesSyncToBatch: (batch: WriteBatch, date: string, entries: DailyCashoutEntry[], financeData: FinanceData) => void
}

export function createCashoutCorrectionActions({ getState, writeSalesSyncToBatch }: CashoutCorrectionActionArgs) {
  function findCashout(cashoutId: string) {
    const entry = getState().dailyCashouts.find((candidate) => candidate.id === cashoutId)
    if (!entry) throw new Error('This daily cashout record could not be found.')
    return entry
  }

  function validateReason(reason: string) {
    const normalizedReason = normalizeName(reason)
    if (normalizedReason.length < 5) throw new Error('Please enter a correction reason of at least 5 characters.')
    return normalizedReason
  }

  function validateOwner(actor: AppUser) {
    if (actor.role !== 'owner') throw new Error('Only the owner can change a saved cashout.')
  }

  function validateChanges(entry: DailyCashoutEntry, proposed: CashoutCorrectionValues) {
    const before = correctionValuesFromEntry(entry)
    const normalizedProposed = normalizeCorrectionValues(proposed)
    if (cashoutCorrectionValuesEqual(before, normalizedProposed)) throw new Error('No financial values were changed.')
    return { before, proposed: normalizedProposed }
  }

  async function submitCashoutCorrectionRequest(cashoutId: string, proposed: CashoutCorrectionValues, reason: string, actor: AppUser) {
    const state = getState()
    const entry = findCashout(cashoutId)
    if (entry.recordedByUserId !== actor.id) throw new Error('You can request corrections only for your own cashouts.')
    if (entry.date < shiftDate(today(), -(CASHOUT_CORRECTION_WINDOW_DAYS - 1)) || entry.date > today()) {
      throw new Error(`Staff correction requests are limited to cashouts from the last ${CASHOUT_CORRECTION_WINDOW_DAYS} calendar days.`)
    }
    if (state.cashoutCorrectionRequests.some((request) => request.cashoutId === cashoutId && request.status === 'pending')) throw new Error('A correction request is already pending for this cashout.')

    const values = validateChanges(entry, proposed)
    const timestamp = nowIso()
    const id = `cashout-correction-${crypto.randomUUID()}`
    const request: CashoutCorrectionRequest = {
      id,
      cashoutId: entry.id,
      cashoutDate: entry.date,
      recordedBy: entry.recordedBy,
      ...(entry.recordedByUserId ? { recordedByUserId: entry.recordedByUserId } : {}),
      sourceRevision: entry.revision ?? 1,
      before: values.before,
      proposed: values.proposed,
      reason: validateReason(reason),
      requestedByUserId: actor.id,
      requestedBy: actor.name,
      requestType: 'staff-request',
      status: 'pending',
      createdAt: timestamp,
    }
    await setDoc(doc(db, 'cashoutCorrectionRequests', id), request)
  }

  async function approveCashoutCorrectionRequest(requestId: string, actor: AppUser) {
    validateOwner(actor)
    const state = getState()
    const request = state.cashoutCorrectionRequests.find((candidate) => candidate.id === requestId)
    if (!request || request.status !== 'pending') throw new Error('This correction request is no longer pending.')
    const entry = findCashout(request.cashoutId)
    if ((entry.revision ?? 1) !== request.sourceRevision || !cashoutCorrectionValuesEqual(correctionValuesFromEntry(entry), request.before)) {
      throw new Error('This cashout changed after the request was submitted. Ask staff to submit a new correction request.')
    }

    const timestamp = nowIso()
    const correctedEntry = cashoutEntryFromCorrection(entry, request.proposed, actor.name, timestamp)
    const nextEntries = state.dailyCashouts.map((candidate) => candidate.id === entry.id ? correctedEntry : candidate)
    const batch = writeBatch(db)
    batch.set(doc(db, 'dailyCashouts', entry.id), correctedEntry)
    writeSalesSyncToBatch(batch, entry.date, nextEntries, state.financeData)
    batch.update(doc(db, 'cashoutCorrectionRequests', request.id), {
      status: 'approved', reviewedAt: timestamp, reviewedByUserId: actor.id, reviewedBy: actor.name, reviewReason: 'Approved by owner.',
    })
    await batch.commit()
  }

  async function rejectCashoutCorrectionRequest(requestId: string, reason: string, actor: AppUser) {
    validateOwner(actor)
    const request = getState().cashoutCorrectionRequests.find((candidate) => candidate.id === requestId)
    if (!request || request.status !== 'pending') throw new Error('This correction request is no longer pending.')
    await setDoc(doc(db, 'cashoutCorrectionRequests', request.id), {
      status: 'rejected', reviewedAt: nowIso(), reviewedByUserId: actor.id, reviewedBy: actor.name, reviewReason: validateReason(reason),
    }, { merge: true })
  }

  async function withdrawCashoutCorrectionRequest(requestId: string, actor: AppUser) {
    const request = getState().cashoutCorrectionRequests.find((candidate) => candidate.id === requestId)
    if (!request || request.status !== 'pending') throw new Error('This correction request is no longer pending.')
    if (request.requestedByUserId !== actor.id) throw new Error('You can withdraw only your own correction request.')
    await setDoc(doc(db, 'cashoutCorrectionRequests', request.id), {
      status: 'withdrawn', reviewedAt: nowIso(), reviewedByUserId: actor.id, reviewedBy: actor.name, reviewReason: 'Withdrawn by requester.',
    }, { merge: true })
  }

  async function editDailyCashoutEntry(cashoutId: string, proposed: CashoutCorrectionValues, reason: string, actor: AppUser) {
    validateOwner(actor)
    const state = getState()
    const entry = findCashout(cashoutId)
    const values = validateChanges(entry, proposed)
    const timestamp = nowIso()
    const requestId = `cashout-correction-${crypto.randomUUID()}`
    const request: CashoutCorrectionRequest = {
      id: requestId,
      cashoutId: entry.id,
      cashoutDate: entry.date,
      recordedBy: entry.recordedBy,
      ...(entry.recordedByUserId ? { recordedByUserId: entry.recordedByUserId } : {}),
      sourceRevision: entry.revision ?? 1,
      before: values.before,
      proposed: values.proposed,
      reason: validateReason(reason),
      requestedByUserId: actor.id,
      requestedBy: actor.name,
      requestType: 'owner-edit',
      status: 'approved',
      createdAt: timestamp,
      reviewedAt: timestamp,
      reviewedByUserId: actor.id,
      reviewedBy: actor.name,
      reviewReason: 'Direct owner correction.',
    }
    const correctedEntry = cashoutEntryFromCorrection(entry, request.proposed, actor.name, timestamp)
    const nextEntries = state.dailyCashouts.map((candidate) => candidate.id === entry.id ? correctedEntry : candidate)
    const batch = writeBatch(db)
    batch.set(doc(db, 'dailyCashouts', entry.id), correctedEntry)
    batch.set(doc(db, 'cashoutCorrectionRequests', requestId), request)
    writeSalesSyncToBatch(batch, entry.date, nextEntries, state.financeData)
    await batch.commit()
  }

  return { approveCashoutCorrectionRequest, editDailyCashoutEntry, rejectCashoutCorrectionRequest, submitCashoutCorrectionRequest, withdrawCashoutCorrectionRequest }
}
