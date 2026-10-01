import { collection, doc, runTransaction, type Firestore, type Transaction } from 'firebase/firestore'
import type { VendorLedgerV2Config } from '@/domain/appTypes'
import { reviewVendorLedgerCutover, type CutoverVendorDraft } from '@/domain/vendorLedgerCutover'
import {
  buildPurchasePostingV2,
  buildSettlementPostingV2,
  buildSettlementCorrectionV2,
  buildVendorChequeV2,
  buildVendorV2,
  assertChequeTransition,
  assertExpectedRevision,
  deterministicEventId,
  isV2BusinessDate,
  settlementCorrectionValuesV2,
  type CreateVendorV2Input,
  type CreateVendorChequeV2Input,
  type ChequeBookV2,
  type ChequeStatus,
  type ChequeV2,
  type CreatePurchaseV2Input,
  type CreateSettlementV2Input,
  type InvoiceReservationV2,
  type PurchaseV2,
  type VendorLedgerEntryV2,
  type VendorAccountStateV2,
  type VendorV2,
  type InvoiceStateV2,
  type InvoiceAllocationV2,
  type VendorSettlementV2,
  type VendorSettlementStateV2,
  type VendorLedgerCorrectionRequestV2,
} from '@/domain/vendorLedgerV2'
import { db } from '@/shared/lib/firebase'

export const vendorLedgerV2Collections = {
  vendors: 'vendorsV2',
  purchases: 'purchasesV2',
  invoiceReservations: 'invoiceReservationsV2',
  vendorAccountStates: 'vendorAccountStatesV2',
  invoiceStates: 'invoiceStatesV2',
  settlements: 'vendorSettlementsV2',
  settlementStates: 'vendorSettlementStatesV2',
  returns: 'vendorReturnsV2',
  chequeBooks: 'chequeBooksV2',
  cheques: 'chequesV2',
  ledgerEntries: 'vendorLedgerEntriesV2',
  allocations: 'invoiceAllocationsV2',
  correctionRequests: 'vendorLedgerCorrectionRequestsV2',
} as const

export function vendorLedgerV2Refs(database: Firestore = db) {
  return {
    config: doc(database, 'appMetadata', 'vendorLedgerV2Config'),
    vendors: collection(database, vendorLedgerV2Collections.vendors),
    purchases: collection(database, vendorLedgerV2Collections.purchases),
    invoiceReservations: collection(database, vendorLedgerV2Collections.invoiceReservations),
    vendorAccountStates: collection(database, vendorLedgerV2Collections.vendorAccountStates),
    invoiceStates: collection(database, vendorLedgerV2Collections.invoiceStates),
    settlements: collection(database, vendorLedgerV2Collections.settlements),
    settlementStates: collection(database, vendorLedgerV2Collections.settlementStates),
    returns: collection(database, vendorLedgerV2Collections.returns),
    chequeBooks: collection(database, vendorLedgerV2Collections.chequeBooks),
    cheques: collection(database, vendorLedgerV2Collections.cheques),
    ledgerEntries: collection(database, vendorLedgerV2Collections.ledgerEntries),
    allocations: collection(database, vendorLedgerV2Collections.allocations),
    correctionRequests: collection(database, vendorLedgerV2Collections.correctionRequests),
  }
}

export async function runVendorLedgerV2Transaction<T>(
  operation: (
    transaction: Transaction,
    refs: ReturnType<typeof vendorLedgerV2Refs>,
    config: VendorLedgerV2Config,
  ) => Promise<T>,
  database: Firestore = db,
) {
  const refs = vendorLedgerV2Refs(database)
  return runTransaction(database, async (transaction) => {
    const configSnapshot = await transaction.get(refs.config)
    const config = configSnapshot.data() as VendorLedgerV2Config | undefined
    if (config?.enabled !== true) throw new Error('The V2 vendor ledger is not enabled.')
    return operation(transaction, refs, config)
  })
}

export type ActivateVendorLedgerV2Input = {
  activationDate: string
  vendors: CutoverVendorDraft[]
  actor: { id: string; name: string }
  timestamp: string
}

export async function activateVendorLedgerV2(
  input: ActivateVendorLedgerV2Input,
  database: Firestore = db,
) {
  const review = reviewVendorLedgerCutover(input.activationDate, input.vendors)
  if (!review.ready) throw new Error(review.errors.join(' '))
  if (review.vendorCount > 100) throw new Error('A single controlled cutover supports at most 100 reviewed vendors.')
  const actorUserId = input.actor.id.trim()
  if (!actorUserId || !input.actor.name.trim()) throw new Error('Owner identity is required for activation.')

  const refs = vendorLedgerV2Refs(database)
  return runTransaction(database, async (transaction) => {
    const configSnapshot = await transaction.get(refs.config)
    const currentConfig = configSnapshot.data() as VendorLedgerV2Config | undefined
    if (currentConfig?.enabled === true) throw new Error('The V2 vendor ledger is already active.')

    for (const candidate of review.vendors) {
      const baseVendor = buildVendorV2({
        id: candidate.id,
        canonicalName: candidate.canonicalName,
        actorUserId,
        timestamp: input.timestamp,
      })
      const openingLedgerEntryId = candidate.openingBalancePaise > 0
        ? deterministicEventId('vendor', candidate.id, 1, 'opening-balance')
        : undefined
      const vendor: VendorV2 = {
        ...baseVendor,
        openingBalancePaise: candidate.openingBalancePaise,
        ...(openingLedgerEntryId ? { openingLedgerEntryId } : {}),
      }
      transaction.set(doc(refs.vendors, vendor.id), vendor)

      if (openingLedgerEntryId) {
        const ledgerEntry: VendorLedgerEntryV2 = {
          id: openingLedgerEntryId,
          vendorId: vendor.id,
          eventType: 'opening-balance',
          posting: 'financial',
          signedAmountPaise: candidate.openingBalancePaise,
          sourceType: 'vendor',
          sourceRecordId: vendor.id,
          sourceRevision: 1,
          reason: candidate.openingReason,
          occurredOn: review.activationDate,
          createdAt: input.timestamp,
          createdByUserId: actorUserId,
        }
        const accountState: VendorAccountStateV2 = {
          id: vendor.id,
          vendorId: vendor.id,
          outstandingPaise: candidate.openingBalancePaise,
          revision: 1,
          lastLedgerEntryId: ledgerEntry.id,
          updatedAt: input.timestamp,
          updatedByUserId: actorUserId,
        }
        transaction.set(doc(refs.ledgerEntries, ledgerEntry.id), ledgerEntry)
        transaction.set(doc(refs.vendorAccountStates, accountState.id), accountState)
      }
    }

    const chequeBook: ChequeBookV2 = {
      id: review.chequeBook.id,
      bankAccountLabel: 'Primary Bank',
      startNumber: review.chequeBook.startNumber,
      endNumber: review.chequeBook.endNumber,
      active: true,
      revision: 1,
      createdAt: input.timestamp,
      createdByUserId: actorUserId,
      updatedAt: input.timestamp,
      updatedByUserId: actorUserId,
    }
    transaction.set(doc(refs.chequeBooks, chequeBook.id), chequeBook)
    transaction.set(refs.config, {
      enabled: true,
      activationDate: review.activationDate,
      updatedAt: input.timestamp,
      updatedByUserId: actorUserId,
    } satisfies VendorLedgerV2Config)
    return { review, chequeBook }
  })
}

function purchasePostingMatches(
  purchase: PurchaseV2,
  reservation: InvoiceReservationV2,
  ledgerEntry: VendorLedgerEntryV2,
  expected: ReturnType<typeof buildPurchasePostingV2>,
) {
  return purchase.id === expected.purchase.id &&
    purchase.vendorId === expected.purchase.vendorId &&
    purchase.invoiceNumber === expected.purchase.invoiceNumber &&
    purchase.normalizedInvoiceNumber === expected.purchase.normalizedInvoiceNumber &&
    purchase.invoiceDate === expected.purchase.invoiceDate &&
    purchase.invoiceReservationId === expected.purchase.invoiceReservationId &&
    purchase.ledgerEntryId === expected.purchase.ledgerEntryId &&
    purchase.invoiceTotalPaise === expected.purchase.invoiceTotalPaise &&
    reservation.purchaseId === expected.purchase.id &&
    reservation.vendorId === expected.purchase.vendorId &&
    reservation.normalizedInvoiceNumber === expected.purchase.normalizedInvoiceNumber &&
    ledgerEntry.sourceRecordId === expected.purchase.id &&
    ledgerEntry.vendorId === expected.purchase.vendorId &&
    ledgerEntry.signedAmountPaise === expected.purchase.invoiceTotalPaise
}

export async function createPurchaseV2(input: CreatePurchaseV2Input, database: Firestore = db) {
  const posting = buildPurchasePostingV2(input)
  return runVendorLedgerV2Transaction(async (transaction, refs, config) => {
    if (!config.activationDate || !isV2BusinessDate(posting.purchase.invoiceDate, config.activationDate)) {
      throw new Error('Purchase date is before the approved V2 activation date.')
    }

    const vendorRef = doc(refs.vendors, posting.purchase.vendorId)
    const purchaseRef = doc(refs.purchases, posting.purchase.id)
    const reservationRef = doc(refs.invoiceReservations, posting.reservation.id)
    const ledgerEntryRef = doc(refs.ledgerEntries, posting.ledgerEntry.id)
    const accountStateRef = doc(refs.vendorAccountStates, posting.purchase.vendorId)
    const invoiceStateRef = doc(refs.invoiceStates, posting.purchase.id)
    const [vendorSnapshot, purchaseSnapshot, reservationSnapshot, ledgerEntrySnapshot, accountStateSnapshot, invoiceStateSnapshot] = await Promise.all([
      transaction.get(vendorRef),
      transaction.get(purchaseRef),
      transaction.get(reservationRef),
      transaction.get(ledgerEntryRef),
      transaction.get(accountStateRef),
      transaction.get(invoiceStateRef),
    ])
    const vendor = vendorSnapshot.data() as VendorV2 | undefined
    if (!vendorSnapshot.exists() || !vendor?.active) throw new Error('Choose an active V2 vendor.')

    const existingCount = [purchaseSnapshot, reservationSnapshot, ledgerEntrySnapshot, invoiceStateSnapshot].filter((snapshot) => snapshot.exists()).length
    if (existingCount > 0) {
      if (existingCount === 4 && purchasePostingMatches(
        purchaseSnapshot.data() as PurchaseV2,
        reservationSnapshot.data() as InvoiceReservationV2,
        ledgerEntrySnapshot.data() as VendorLedgerEntryV2,
        posting,
      )) {
        return { created: false, ...posting }
      }
      if (reservationSnapshot.exists()) throw new Error('This invoice number is already registered for the vendor.')
      throw new Error('The purchase posting is incomplete or conflicts with an existing record.')
    }

    transaction.set(purchaseRef, posting.purchase)
    transaction.set(reservationRef, posting.reservation)
    transaction.set(ledgerEntryRef, posting.ledgerEntry)
    transaction.set(invoiceStateRef, posting.invoiceState)
    const currentAccountState = accountStateSnapshot.data() as VendorAccountStateV2 | undefined
    const nextAccountState: VendorAccountStateV2 = currentAccountState ? {
      ...currentAccountState,
      outstandingPaise: currentAccountState.outstandingPaise + posting.purchase.invoiceTotalPaise,
      revision: currentAccountState.revision + 1,
      lastLedgerEntryId: posting.ledgerEntry.id,
      updatedAt: posting.purchase.createdAt,
      updatedByUserId: posting.purchase.createdByUserId,
    } : {
      id: posting.purchase.vendorId,
      vendorId: posting.purchase.vendorId,
      outstandingPaise: posting.purchase.invoiceTotalPaise,
      revision: 1,
      lastLedgerEntryId: posting.ledgerEntry.id,
      updatedAt: posting.purchase.createdAt,
      updatedByUserId: posting.purchase.createdByUserId,
    }
    transaction.set(accountStateRef, nextAccountState)
    return { created: true, ...posting }
  }, database)
}

export async function createVendorV2(input: CreateVendorV2Input, database: Firestore = db) {
  const vendor = buildVendorV2(input)
  return runVendorLedgerV2Transaction(async (transaction, refs) => {
    const vendorRef = doc(refs.vendors, vendor.id)
    const snapshot = await transaction.get(vendorRef)
    if (snapshot.exists()) {
      const existing = snapshot.data() as VendorV2
      const exactRetry = existing.canonicalName === vendor.canonicalName &&
        existing.createdByUserId === vendor.createdByUserId && existing.createdAt === vendor.createdAt
      if (exactRetry) return { created: false, vendor: existing }
      throw new Error('A V2 vendor already uses this ID.')
    }
    transaction.set(vendorRef, vendor)
    return { created: true, vendor }
  }, database)
}

export async function createVendorChequeV2(input: CreateVendorChequeV2Input, database: Firestore = db) {
  const cheque = buildVendorChequeV2(input)
  return runVendorLedgerV2Transaction(async (transaction, refs, config) => {
    if (!config.activationDate || !isV2BusinessDate(cheque.date, config.activationDate)) {
      throw new Error('Cheque date is before the approved V2 activation date.')
    }
    const chequeRef = doc(refs.cheques, cheque.id)
    const bookRef = doc(refs.chequeBooks, cheque.chequeBookId!)
    const vendorRef = doc(refs.vendors, cheque.vendorId!)
    const accountRef = doc(refs.vendorAccountStates, cheque.vendorId!)
    const [chequeSnapshot, bookSnapshot, vendorSnapshot, accountSnapshot] = await Promise.all([
      transaction.get(chequeRef), transaction.get(bookRef), transaction.get(vendorRef), transaction.get(accountRef),
    ])
    if (chequeSnapshot.exists()) {
      const existing = chequeSnapshot.data() as ChequeV2
      const exactRetry = existing.vendorId === cheque.vendorId && existing.date === cheque.date &&
        existing.amountPaise === cheque.amountPaise && existing.chequeBookId === cheque.chequeBookId
      if (exactRetry) return { created: false, cheque: existing }
      throw new Error('This cheque number is already registered.')
    }
    const book = bookSnapshot.data() as ChequeBookV2 | undefined
    if (!bookSnapshot.exists() || !book?.active || cheque.chequeNumberValue < book.startNumber || cheque.chequeNumberValue > book.endNumber) {
      throw new Error('Choose an active cheque book containing this leaf.')
    }
    const vendor = vendorSnapshot.data() as VendorV2 | undefined
    if (!vendorSnapshot.exists() || !vendor?.active) throw new Error('Choose an active V2 vendor.')
    const account = accountSnapshot.data() as VendorAccountStateV2 | undefined
    if (!accountSnapshot.exists() || !account || cheque.amountPaise > account.outstandingPaise) {
      throw new Error('Cheque amount cannot exceed vendor outstanding.')
    }
    transaction.set(chequeRef, cheque)
    return { created: true, cheque }
  }, database)
}

export type TransitionVendorChequeV2Input = {
  chequeNumber: string | number
  expectedRevision: number
  toStatus: Exclude<ChequeStatus, 'draft'>
  actorUserId: string
  timestamp: string
}

export async function transitionVendorChequeV2(input: TransitionVendorChequeV2Input, database: Firestore = db) {
  const chequeId = String(input.chequeNumber).trim().replace(/[\s-]/g, '').replace(/^0+(?=\d)/, '')
  return runVendorLedgerV2Transaction(async (transaction, refs) => {
    const chequeRef = doc(refs.cheques, chequeId)
    const chequeSnapshot = await transaction.get(chequeRef)
    const cheque = chequeSnapshot.data() as ChequeV2 | undefined
    if (!chequeSnapshot.exists() || !cheque) throw new Error('Cheque was not found.')
    if (cheque.trackingOnly || cheque.origin !== 'v2' || cheque.purpose !== 'vendor-payment' || !cheque.vendorId) {
      throw new Error('Only new V2 vendor cheques use this lifecycle.')
    }
    assertExpectedRevision(cheque.revision, input.expectedRevision)
    assertChequeTransition(cheque.status, input.toStatus)

    const nextRevision = cheque.revision + 1
    const isIssue = input.toStatus === 'issued'
    const isDebit = input.toStatus === 'debited'
    const ledgerEntryId = isIssue
      ? deterministicEventId('cheque', cheque.id, nextRevision, 'pending-cheque')
      : isDebit ? deterministicEventId('cheque', cheque.id, nextRevision, 'cheque-debit') : undefined
    const ledgerEntryRef = ledgerEntryId ? doc(refs.ledgerEntries, ledgerEntryId) : null
    const accountRef = isDebit ? doc(refs.vendorAccountStates, cheque.vendorId) : null
    const accountSnapshot = accountRef ? await transaction.get(accountRef) : null

    const nextCheque: ChequeV2 = {
      ...cheque,
      status: input.toStatus,
      revision: nextRevision,
      ...(isIssue && ledgerEntryId ? { pendingLedgerEntryId: ledgerEntryId } : {}),
      ...(isDebit && ledgerEntryId ? { debitLedgerEntryId: ledgerEntryId } : {}),
      updatedAt: input.timestamp,
      updatedByUserId: input.actorUserId,
    }
    transaction.set(chequeRef, nextCheque)
    if (ledgerEntryRef && ledgerEntryId) {
      const ledgerEntry: VendorLedgerEntryV2 = {
        id: ledgerEntryId,
        vendorId: cheque.vendorId,
        eventType: isDebit ? 'cheque-debit' : 'pending-cheque',
        posting: isDebit ? 'financial' : 'informational',
        signedAmountPaise: -cheque.amountPaise,
        sourceType: 'cheque',
        sourceRecordId: cheque.id,
        sourceRevision: nextRevision,
        occurredOn: cheque.date,
        createdAt: input.timestamp,
        createdByUserId: input.actorUserId,
      }
      transaction.set(ledgerEntryRef, ledgerEntry)
      if (isDebit && accountRef) {
        const account = accountSnapshot?.data() as VendorAccountStateV2 | undefined
        if (!accountSnapshot?.exists() || !account || cheque.amountPaise > account.outstandingPaise) {
          throw new Error('Cheque amount cannot exceed current vendor outstanding.')
        }
        transaction.set(accountRef, {
          ...account,
          outstandingPaise: account.outstandingPaise - cheque.amountPaise,
          revision: account.revision + 1,
          lastLedgerEntryId: ledgerEntryId,
          updatedAt: input.timestamp,
          updatedByUserId: input.actorUserId,
        })
      }
    }
    return { cheque: nextCheque }
  }, database)
}

export async function createSettlementV2(input: CreateSettlementV2Input, database: Firestore = db) {
  return runVendorLedgerV2Transaction(async (transaction, refs, config) => {
    if (!config.activationDate || !isV2BusinessDate(input.date, config.activationDate)) {
      throw new Error('Settlement date is before the approved V2 activation date.')
    }
    const vendorRef = doc(refs.vendors, input.vendorId)
    const accountStateRef = doc(refs.vendorAccountStates, input.vendorId)
    const settlementRef = doc(refs.settlements, input.id)
    const settlementStateRef = doc(refs.settlementStates, input.id)
    const ledgerEntryId = `settlement:${encodeURIComponent(input.id.trim())}:1:settlement`
    const ledgerEntryRef = doc(refs.ledgerEntries, ledgerEntryId)
    const invoiceStateRef = input.invoiceId ? doc(refs.invoiceStates, input.invoiceId) : null
    const allocationId = input.invoiceId
      ? ['settlement', input.id.trim(), input.invoiceId].map((part) => encodeURIComponent(part)).join(':')
      : null
    const allocationRef = allocationId ? doc(refs.allocations, allocationId) : null
    const reads = await Promise.all([
      transaction.get(vendorRef),
      transaction.get(accountStateRef),
      transaction.get(settlementRef),
      transaction.get(ledgerEntryRef),
      transaction.get(settlementStateRef),
      ...(invoiceStateRef ? [transaction.get(invoiceStateRef)] : []),
      ...(allocationRef ? [transaction.get(allocationRef)] : []),
    ])
    const [vendorSnapshot, accountStateSnapshot, settlementSnapshot, ledgerEntrySnapshot, settlementStateSnapshot] = reads
    const invoiceStateSnapshot = input.invoiceId ? reads[5] : undefined
    const allocationSnapshot = input.invoiceId ? reads[6] : undefined
    const vendor = vendorSnapshot.data() as VendorV2 | undefined
    if (!vendorSnapshot.exists() || !vendor?.active) throw new Error('Choose an active V2 vendor.')
    if (!accountStateSnapshot.exists()) throw new Error('Vendor has no V2 outstanding balance.')

    const existingSourceCount = [settlementSnapshot, ledgerEntrySnapshot, settlementStateSnapshot, allocationSnapshot]
      .filter((snapshot) => snapshot?.exists()).length
    const expectedSourceCount = input.invoiceId ? 4 : 3
    if (existingSourceCount > 0) {
      const existingSettlement = settlementSnapshot.data() as VendorSettlementV2 | undefined
      const existingLedgerEntry = ledgerEntrySnapshot.data() as VendorLedgerEntryV2 | undefined
      const existingAllocation = allocationSnapshot?.data() as InvoiceAllocationV2 | undefined
      const exactRetry = existingSourceCount === expectedSourceCount &&
        existingSettlement?.vendorId === input.vendorId.trim() &&
        existingSettlement.date === input.date &&
        existingSettlement.amountPaise === input.amountPaise &&
        existingSettlement.mode === input.mode &&
        existingSettlement.invoiceId === input.invoiceId &&
        existingLedgerEntry?.signedAmountPaise === -input.amountPaise &&
        (!input.invoiceId || (
          existingAllocation?.invoiceId === input.invoiceId &&
          existingAllocation.amountPaise === input.amountPaise
        ))
      if (exactRetry) return { created: false }
      throw new Error('The settlement posting is incomplete or conflicts with an existing record.')
    }

    const posting = buildSettlementPostingV2(
      input,
      accountStateSnapshot.data() as VendorAccountStateV2,
      invoiceStateSnapshot?.data() as InvoiceStateV2 | undefined,
    )
    transaction.set(settlementRef, posting.settlement)
    transaction.set(settlementStateRef, posting.settlementState)
    transaction.set(ledgerEntryRef, posting.ledgerEntry)
    transaction.set(accountStateRef, posting.nextAccountState)
    if (allocationRef && posting.allocation) transaction.set(allocationRef, posting.allocation)
    if (invoiceStateRef && posting.nextInvoiceState) transaction.set(invoiceStateRef, posting.nextInvoiceState)
    return { created: true, ...posting }
  }, database)
}

export async function applySettlementCorrectionV2(
  requestId: string,
  actor: { id: string; name: string },
  timestamp: string,
  database: Firestore = db,
) {
  return runVendorLedgerV2Transaction(async (transaction, refs) => {
    const requestRef = doc(refs.correctionRequests, requestId)
    const requestSnapshot = await transaction.get(requestRef)
    const request = requestSnapshot.data() as VendorLedgerCorrectionRequestV2 | undefined
    if (!requestSnapshot.exists() || !request || request.kind !== 'settlement-correction' || request.status !== 'pending') {
      throw new Error('This settlement correction request is no longer pending.')
    }
    const settlementStateRef = doc(refs.settlementStates, request.sourceRecordId)
    const accountStateRef = doc(refs.vendorAccountStates, request.vendorId)
    const invoiceStateRef = request.before.invoiceId ? doc(refs.invoiceStates, request.before.invoiceId) : null
    const [stateSnapshot, accountSnapshot, invoiceSnapshot] = await Promise.all([
      transaction.get(settlementStateRef),
      transaction.get(accountStateRef),
      ...(invoiceStateRef ? [transaction.get(invoiceStateRef)] : []),
    ])
    if (!stateSnapshot.exists() || !accountSnapshot.exists()) throw new Error('Settlement correction source state is missing.')
    const correction = buildSettlementCorrectionV2(
      request,
      stateSnapshot.data() as VendorSettlementStateV2,
      accountSnapshot.data() as VendorAccountStateV2,
      invoiceSnapshot?.data() as InvoiceStateV2 | undefined,
      actor.id,
      timestamp,
    )
    const ledgerEntryRef = correction.ledgerEntry ? doc(refs.ledgerEntries, correction.ledgerEntry.id) : null
    const allocationRef = correction.allocationAdjustment ? doc(refs.allocations, correction.allocationAdjustment.id) : null
    if (ledgerEntryRef && (await transaction.get(ledgerEntryRef)).exists()) throw new Error('This correction was already posted.')
    if (allocationRef && (await transaction.get(allocationRef)).exists()) throw new Error('This correction allocation was already posted.')

    transaction.set(settlementStateRef, correction.nextState)
    if (ledgerEntryRef && correction.ledgerEntry && correction.nextAccountState) {
      transaction.set(ledgerEntryRef, correction.ledgerEntry)
      transaction.set(accountStateRef, correction.nextAccountState)
    }
    if (allocationRef && correction.allocationAdjustment && invoiceStateRef && correction.nextInvoiceState) {
      transaction.set(allocationRef, correction.allocationAdjustment)
      transaction.set(invoiceStateRef, correction.nextInvoiceState)
    }
    transaction.update(requestRef, {
      status: 'approved', reviewedAt: timestamp, reviewedByUserId: actor.id, reviewedBy: actor.name,
      reviewReason: 'Approved by owner.',
    })
    return correction
  }, database)
}

export type ApplyOwnerSettlementCorrectionV2Input = {
  id: string
  sourceRecordId: string
  proposed: Omit<VendorLedgerCorrectionRequestV2['proposed'], 'invoiceId'>
  reason: string
  actor: { id: string; name: string }
  timestamp: string
}

export async function applyOwnerSettlementCorrectionV2(
  input: ApplyOwnerSettlementCorrectionV2Input,
  database: Firestore = db,
) {
  const request = await runVendorLedgerV2Transaction(async (transaction, refs) => {
    const requestId = input.id.trim()
    const sourceRecordId = input.sourceRecordId.trim()
    if (!requestId || !sourceRecordId || !input.actor.id.trim() || !input.reason.trim()) {
      throw new Error('Correction ID, settlement, owner, and reason are required.')
    }
    const requestRef = doc(refs.correctionRequests, requestId)
    const stateRef = doc(refs.settlementStates, sourceRecordId)
    const [requestSnapshot, stateSnapshot] = await Promise.all([
      transaction.get(requestRef),
      transaction.get(stateRef),
    ])
    if (requestSnapshot.exists()) {
      const existing = requestSnapshot.data() as VendorLedgerCorrectionRequestV2
      if (existing.requestType === 'owner-edit' && existing.sourceRecordId === sourceRecordId) return existing
      throw new Error('A different correction already uses this ID.')
    }
    const state = stateSnapshot.data() as VendorSettlementStateV2 | undefined
    if (!stateSnapshot.exists() || !state) throw new Error('Settlement correction source state is missing.')
    const before = settlementCorrectionValuesV2(state)
    const correctionRequest: VendorLedgerCorrectionRequestV2 = {
      id: requestId,
      kind: 'settlement-correction',
      sourceRecordId,
      vendorId: state.vendorId,
      sourceRevision: state.revision,
      before,
      proposed: { ...input.proposed, ...(state.invoiceId ? { invoiceId: state.invoiceId } : {}) },
      reason: input.reason.trim(),
      requestedByUserId: input.actor.id.trim(),
      requestedBy: input.actor.name.trim(),
      requestType: 'owner-edit',
      status: 'pending',
      createdAt: input.timestamp,
    }
    transaction.set(requestRef, correctionRequest)
    return correctionRequest
  }, database)

  if (request.status === 'approved') return { alreadyApplied: true }
  return applySettlementCorrectionV2(request.id, input.actor, input.timestamp, database)
}
