import { collection, doc, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore'
import { db } from '@/shared/lib/firebase'
import { POS_SANDBOX_ID, type PosProduct, type PosProductCost } from '@/features/pos/domain/types'

const stockCollection = (name: string) => collection(doc(db, 'posSandboxes', POS_SANDBOX_ID), name)

/** Full catalogue listeners belong to the stock page, never the shared app store. */
export function subscribeStockProducts(callback: (products: PosProduct[]) => void, onError: (error: Error) => void): Unsubscribe {
  return onSnapshot(stockCollection('products'), { includeMetadataChanges: true }, (snapshot) => {
    // A cache populated by POS's limited queries may contain only part of the catalogue.
    if (snapshot.metadata.fromCache) return
    callback(snapshot.docs.map((entry) => ({ ...entry.data(), id: entry.id } as PosProduct)))
  }, onError)
}
export function subscribeStockCosts(callback: (costs: PosProductCost[]) => void, onError: (error: Error) => void): Unsubscribe {
  return onSnapshot(stockCollection('productCosts'), { includeMetadataChanges: true }, (snapshot) => {
    if (snapshot.metadata.fromCache) return
    callback(snapshot.docs.map((entry) => ({ ...entry.data(), productId: entry.id } as PosProductCost)))
  }, onError)
}

export type StockMovement = {
  id: string; productId: string; type: string; quantityDelta: number; beforeQuantity?: number; afterQuantity?: number
  createdAt: string; businessDate?: string; actorName?: string; reason?: string
  goodsReceiptId?: string; billId?: string; stockAuditId?: string; approvalId?: string
  beforeMrpPaise?: number | null; afterMrpPaise?: number | null
}

export function subscribeStockMovements(productId: string, callback: (movements: StockMovement[]) => void, onError: (error: Error) => void): Unsubscribe {
  // Filtering by product only also retains legacy movements without a createdAt field.
  return onSnapshot(query(stockCollection('stockMovements'), where('productId', '==', productId)), { includeMetadataChanges: true }, (snapshot) => {
    if (snapshot.metadata.fromCache) return
    const movements = snapshot.docs.map((entry) => ({ ...entry.data(), id: entry.id } as StockMovement))
    callback(movements.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')) || a.id.localeCompare(b.id)))
  }, onError)
}
