import { collection, doc, runTransaction, type Firestore, type Transaction } from 'firebase/firestore'
import type { VendorLedgerV2Config } from '@/domain/appTypes'
import {
  buildPurchasePostingV2,
  buildSettlementPostingV2,
  isV2BusinessDate,
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
} from '@/domain/vendorLedgerV2'
import { db } from '@/shared/lib/firebase'

export const vendorLedgerV2Collections = {
  vendors: 'vendorsV2',
  purchases: 'purchasesV2',
  invoiceReservations: 'invoiceReservationsV2',
  vendorAccountStates: 'vendorAccountStatesV2',
  invoiceStates: 'invoiceStatesV2',
  settlements: 'vendorSettlementsV2',
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

export async function createSettlementV2(input: CreateSettlementV2Input, database: Firestore = db) {
  return runVendorLedgerV2Transaction(async (transaction, refs, config) => {
    if (!config.activationDate || !isV2BusinessDate(input.date, config.activationDate)) {
      throw new Error('Settlement date is before the approved V2 activation date.')
    }
    const vendorRef = doc(refs.vendors, input.vendorId)
    const accountStateRef = doc(refs.vendorAccountStates, input.vendorId)
    const settlementRef = doc(refs.settlements, input.id)
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
      ...(invoiceStateRef ? [transaction.get(invoiceStateRef)] : []),
      ...(allocationRef ? [transaction.get(allocationRef)] : []),
    ])
    const [vendorSnapshot, accountStateSnapshot, settlementSnapshot, ledgerEntrySnapshot] = reads
    const invoiceStateSnapshot = input.invoiceId ? reads[4] : undefined
    const allocationSnapshot = input.invoiceId ? reads[5] : undefined
    const vendor = vendorSnapshot.data() as VendorV2 | undefined
    if (!vendorSnapshot.exists() || !vendor?.active) throw new Error('Choose an active V2 vendor.')
    if (!accountStateSnapshot.exists()) throw new Error('Vendor has no V2 outstanding balance.')

    const existingSourceCount = [settlementSnapshot, ledgerEntrySnapshot, allocationSnapshot]
      .filter((snapshot) => snapshot?.exists()).length
    const expectedSourceCount = input.invoiceId ? 3 : 2
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
    transaction.set(ledgerEntryRef, posting.ledgerEntry)
    transaction.set(accountStateRef, posting.nextAccountState)
    if (allocationRef && posting.allocation) transaction.set(allocationRef, posting.allocation)
    if (invoiceStateRef && posting.nextInvoiceState) transaction.set(invoiceStateRef, posting.nextInvoiceState)
    return { created: true, ...posting }
  }, database)
}
