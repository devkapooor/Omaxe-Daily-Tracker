import { collection, doc, runTransaction, type Firestore, type Transaction } from 'firebase/firestore'
import type { VendorLedgerV2Config } from '@/domain/appTypes'
import {
  buildPurchasePostingV2,
  isV2BusinessDate,
  type CreatePurchaseV2Input,
  type InvoiceReservationV2,
  type PurchaseV2,
  type VendorLedgerEntryV2,
  type VendorV2,
} from '@/domain/vendorLedgerV2'
import { db } from '@/shared/lib/firebase'

export const vendorLedgerV2Collections = {
  vendors: 'vendorsV2',
  purchases: 'purchasesV2',
  invoiceReservations: 'invoiceReservationsV2',
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
    const [vendorSnapshot, purchaseSnapshot, reservationSnapshot, ledgerEntrySnapshot] = await Promise.all([
      transaction.get(vendorRef),
      transaction.get(purchaseRef),
      transaction.get(reservationRef),
      transaction.get(ledgerEntryRef),
    ])
    const vendor = vendorSnapshot.data() as VendorV2 | undefined
    if (!vendorSnapshot.exists() || !vendor?.active) throw new Error('Choose an active V2 vendor.')

    const existingCount = [purchaseSnapshot, reservationSnapshot, ledgerEntrySnapshot].filter((snapshot) => snapshot.exists()).length
    if (existingCount > 0) {
      if (existingCount === 3 && purchasePostingMatches(
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
    return { created: true, ...posting }
  }, database)
}
