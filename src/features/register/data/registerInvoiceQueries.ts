import { collection, doc, documentId, getDocFromServer, getDocsFromServer, limit, orderBy, query, startAfter, where, type Firestore, type QueryDocumentSnapshot } from 'firebase/firestore'
import type { InvoiceStateV2 } from '@/domain/vendorLedgerV2'
import { db } from '@/shared/lib/firebase'

export type PaymentInvoicePage = {
  items: InvoiceStateV2[]
  cursor: QueryDocumentSnapshot | null
  hasMore: boolean
}

export async function loadPaymentInvoicePage(vendorId: string, cursor: QueryDocumentSnapshot | null = null, database: Firestore = db): Promise<PaymentInvoicePage> {
  const snapshot = await getDocsFromServer(query(collection(database, 'invoiceStatesV2'),
    where('vendorId', '==', vendorId), where('openAmountPaise', '>', 0),
    orderBy('openAmountPaise'), orderBy(documentId()), ...(cursor ? [startAfter(cursor)] : []), limit(26)))
  const page = snapshot.docs.slice(0, 25)
  return { items: page.map(item => ({ ...item.data(), id: item.id }) as InvoiceStateV2), cursor: page.at(-1) ?? null, hasMore: snapshot.size > 25 }
}

export async function loadPaymentInvoiceTarget(vendorId: string, invoiceId: string, database: Firestore = db) {
  const snapshot = await getDocFromServer(doc(database, 'invoiceStatesV2', invoiceId))
  if (!snapshot.exists() || snapshot.get('vendorId') !== vendorId || Number(snapshot.get('openAmountPaise')) <= 0) {
    throw new Error('The linked invoice is no longer open for this vendor. Select another invoice or use a vendor account payment.')
  }
  return { ...snapshot.data(), id: snapshot.id } as InvoiceStateV2
}
