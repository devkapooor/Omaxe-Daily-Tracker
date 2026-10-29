import { collection, doc, documentId, getDocFromServer, getDocsFromServer, limit, orderBy, query, startAfter, where, type QuerySnapshot, type DocumentData } from 'firebase/firestore'
import { db } from '@/shared/lib/firebase'
import { invoiceReservationId, type VendorV2 } from '@/domain/vendorLedgerV2'
import { vendorLedgerV2Collections } from '@/store/vendorLedgerV2Repository'
import type { PosGoodsReceipt } from '@/features/pos/domain/types'
import { readSource, singleFlight, type Cursor, type ServerPage } from './stockQueries'
/** Complete search catalogue; shared only while in flight, never across visits. */
export function loadVendorDirectory(includeInactive = false): Promise<VendorV2[]> {
  return singleFlight(`vendor-directory:${includeInactive}`, async () => {
    const items: VendorV2[] = []
    let cursor: Cursor = null
    for (;;) {
      const page: QuerySnapshot<DocumentData> = await getDocsFromServer(query(collection(db, vendorLedgerV2Collections.vendors), ...(!includeInactive ? [where('active', '==', true)] : []), orderBy(documentId()), ...(cursor ? [startAfter(cursor)] : []), limit(250)))
      items.push(...page.docs.map(entry => ({ ...entry.data(), id: entry.id }) as VendorV2))
      if (items.length > 10000) throw new Error('Vendor directory exceeds the search bound; results were not truncated. Ask the owner to review it.')
      if (page.size < 250) return items.sort((a, b) => a.canonicalName.localeCompare(b.canonicalName, 'en-IN', { sensitivity: 'base' }))
      cursor = page.docs.at(-1) ?? null
    }
  })
}
export async function loadVendors(prefix: string, cursor: Cursor): Promise<ServerPage<VendorV2>> {
  return singleFlight(`vendors:${prefix}:${cursor?.id ?? ''}`, async () => {
    const snapshot = await getDocsFromServer(query(collection(db, vendorLedgerV2Collections.vendors), where('active', '==', true), ...(prefix.trim() ? [where('canonicalName', '>=', prefix.trim()), where('canonicalName', '<=', `${prefix.trim()}\uf8ff`)] : []), orderBy('canonicalName'), orderBy(documentId()), ...(cursor ? [startAfter(cursor)] : []), limit(25)))
    return { items: snapshot.docs.map((entry) => ({ ...entry.data(), id: entry.id } as VendorV2)), cursor: snapshot.docs.at(-1) ?? cursor, hasMore: snapshot.size === 25 }
  })
}
export function loadVendor(id: string) {
  return singleFlight(`vendor:${id}`, async () => { const snapshot = await getDocFromServer(doc(db, vendorLedgerV2Collections.vendors, id)); return snapshot.exists() ? { ...snapshot.data(), id } as VendorV2 : null })
}
/** UI hint reads the same invoice reservation used by submission, never the current history page. */
export function lookupReceiptInvoice(vendorId: string, number: string): Promise<PosGoodsReceipt | null> {
  return singleFlight(`invoice:${vendorId}:${number}`, async () => {
    const reservation = await getDocFromServer(doc(db, vendorLedgerV2Collections.invoiceReservations, invoiceReservationId(vendorId, number)))
    if (!reservation.exists()) return null
    const purchase = await getDocFromServer(doc(db, vendorLedgerV2Collections.purchases, String(reservation.data().purchaseId)))
    return purchase.exists() && purchase.data().grnId ? readSource<PosGoodsReceipt>('goodsReceipts', String(purchase.data().grnId)) : null
  })
}
