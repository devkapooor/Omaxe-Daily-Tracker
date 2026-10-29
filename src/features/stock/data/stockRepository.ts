import { doc, documentId, getDocsFromServer, limit, onSnapshot, orderBy, query, where, type QueryConstraint } from 'firebase/firestore'
import { db } from '@/shared/lib/firebase'
import { POS_SANDBOX_ID, type PosProduct, type PosProductCost } from '@/features/pos/domain/types'
import { deriveStockRows, type StockSort } from '../domain/currentStock'
import { stockQueryEnabled, stockQueryPlan, type StockQueryFilters } from '../domain/stockQueryPlan'
import { readPage, singleFlight, stockCollection, type Cursor } from './stockQueries'

export async function loadStockPage(filters: StockQueryFilters, sort: StockSort, descending: boolean, cursor: Cursor) {
  if (!stockQueryEnabled(filters)) return { items: [], cursor: null, hasMore: false }
  const identity = JSON.stringify([filters, sort, descending])
  const constraints: QueryConstraint[] = []
  if (filters.stockStatus) constraints.push(where('currentQuantity', filters.stockStatus === 'zero' ? '==' : filters.stockStatus === 'positive' ? '>' : '<', 0))
  if (filters.search.trim()) constraints.push(where('barcode', '==', filters.search.trim()))
  const plan = stockQueryPlan(filters, sort, descending)
  const page = await readPage<PosProduct>('products', constraints, cursor, 50, identity, plan.field, plan.direction)
  const ids = page.items.map((item) => item.id)
  const costs: PosProductCost[] = []
  for (let offset = 0; offset < ids.length; offset += 30) {
    const chunk = ids.slice(offset, offset + 30)
    const result = await singleFlight(`costs:${JSON.stringify(chunk)}`, () => getDocsFromServer(query(stockCollection('productCosts'), where(documentId(), 'in', chunk), orderBy(documentId()), limit(chunk.length))))
    costs.push(...result.docs.map((entry) => ({ ...entry.data(), productId: entry.id } as PosProductCost)))
  }
  return { ...page, items: deriveStockRows(page.items, costs) }
}
export function subscribeStockProduct(id: string, next: (product: ReturnType<typeof deriveStockRows>[number]) => void, fail: (cause: Error) => void) {
  let product: PosProduct | null = null, cost: PosProductCost | null = null, productReady = false, costReady = false, active = true
  const publish = () => { if (active && productReady && costReady && product) next(deriveStockRows([product], cost ? [cost] : [])[0]) }
  const stops = [
    onSnapshot(doc(db, 'posSandboxes', POS_SANDBOX_ID, 'products', id), { includeMetadataChanges: true }, (snapshot) => {
      if (!active || snapshot.metadata.fromCache) return
      if (!snapshot.exists()) { fail(new Error('This product no longer exists.')); return }
      product = { ...snapshot.data(), id } as PosProduct; productReady = true; publish()
    }, fail),
    onSnapshot(doc(db, 'posSandboxes', POS_SANDBOX_ID, 'productCosts', id), { includeMetadataChanges: true }, (snapshot) => {
      if (!active || snapshot.metadata.fromCache) return
      cost = snapshot.exists() ? { ...snapshot.data(), productId: id } as PosProductCost : null; costReady = true; publish()
    }, fail),
  ]
  return () => { active = false; stops.forEach((stop) => stop()) }
}
export type StockMovement = {
  id: string; productId?: string; barcode?: string; productName?: string; type: string; quantityDelta: number; beforeQuantity?: number; afterQuantity?: number
  createdAt?: string; businessDate?: string; actorName?: string; actorUid?: string; reason?: string; sourceReference?: string
    goodsReceiptId?: string; billId?: string; stockAuditId?: string; approvalId?: string; correctionId?: string; vendorReturnId?: string; reference?: string
  returnCondition?: 'sellable' | 'damaged'; nonStockReturn?: boolean
  beforeMrpPaise?: number | null; afterMrpPaise?: number | null; beforeSellingPricePaise?: number | null; afterSellingPricePaise?: number
  priceChanged?: boolean; priceBefore?: { mrpPaise: number | null; sellingPricePaise: number }; priceAfter?: { mrpPaise: number | null; sellingPricePaise: number }
}
