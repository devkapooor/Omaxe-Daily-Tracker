import { collection, doc, runTransaction, type Firestore, type Transaction } from 'firebase/firestore'
import type { VendorLedgerV2Config } from '@/domain/appTypes'
import { db } from '@/shared/lib/firebase'

export const vendorLedgerV2Collections = {
  vendors: 'vendorsV2',
  purchases: 'purchasesV2',
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
  operation: (transaction: Transaction, refs: ReturnType<typeof vendorLedgerV2Refs>) => Promise<T>,
  database: Firestore = db,
) {
  const refs = vendorLedgerV2Refs(database)
  return runTransaction(database, async (transaction) => {
    const configSnapshot = await transaction.get(refs.config)
    const config = configSnapshot.data() as VendorLedgerV2Config | undefined
    if (config?.enabled !== true) throw new Error('The V2 vendor ledger is not enabled.')
    return operation(transaction, refs)
  })
}
