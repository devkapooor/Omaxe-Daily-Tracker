import { collection, doc, documentId, getDocFromServer, getDocsFromServer, limit, orderBy, query, startAfter, where, type Firestore, type QueryDocumentSnapshot } from 'firebase/firestore'
import { db } from '@/shared/lib/firebase'
import { vendorPaymentLogRow, vendorPurchaseLogRow, type VendorLogRow } from '../domain/vendorLogRows'

export type VendorLogKind = 'purchase' | 'payment'
export type VendorLogPage = { rows: VendorLogRow[]; cursor: QueryDocumentSnapshot | null; more: boolean }
export async function loadVendorLogPage(kind: VendorLogKind, start: string, end: string, cursor: QueryDocumentSnapshot | null = null, database: Firestore = db): Promise<VendorLogPage> {
  const name = kind === 'purchase' ? 'purchasesV2' : 'vendorSettlementStatesV2', field = kind === 'purchase' ? 'invoiceDate' : 'date'
  const snapshot = await getDocsFromServer(query(collection(database, name), where(field, '>=', start), where(field, '<=', end), orderBy(field, 'desc'), orderBy(documentId(), 'desc'), ...(cursor ? [startAfter(cursor)] : []), limit(26)))
  const documents = snapshot.docs.slice(0, 25)
  const vendors = new Map<string, Promise<string>>()
  function vendorName(id: string) {
    if (!id) return Promise.resolve('Vendor not recorded')
    if (!vendors.has(id)) vendors.set(id, getDocFromServer(doc(database, 'vendorsV2', id)).then(s => s.exists() ? String(s.get('canonicalName') || id) : 'Vendor unavailable · ' + id).catch(() => 'Vendor name unavailable · ' + id))
    return vendors.get(id)!
  }
  const rows = await Promise.all(documents.map(async item => {
    const source = item.data(), id = item.id, vendorId = typeof source.vendorId === 'string' ? source.vendorId : ''
    const [party, related] = await Promise.all([vendorName(vendorId), getDocFromServer(doc(database, kind === 'purchase' ? 'invoiceStatesV2' : 'vendorSettlementsV2', id))])
    const data = related.exists() ? related.data() : null
    return kind === 'purchase' ? vendorPurchaseLogRow(id, source, data, party) : vendorPaymentLogRow(id, source, data, party)
  }))
  return { rows, cursor: documents.at(-1) || null, more: snapshot.size > 25 }
}
