import { where, or, type QueryConstraint, type QueryCompositeFilterConstraint } from 'firebase/firestore'
import { serverNowIso } from '@/shared/lib/serverClock'
import { mergeHistory, type HistoryStream } from '../domain/mergeHistory'
import type { StockMovement } from './stockRepository'
import { dateConstraints, readPage, type Cursor } from './stockQueries'

export type HistoryFilters = { from: string; to: string; identifier: string; identifierMode: 'barcode' | 'productId'; event: string; undated: boolean }
export type StockHistoryEntry = StockMovement & { sourceKind: 'movement' | 'damaged-return' | 'unmapped-return' }
export const historyTypes: Record<string, string[]> = {
  receipts: ['goods-receipt'], sales: ['sale', 'temporary-item-mapped-sale'], returns: ['sellable-return'],
  adjustments: ['stock-audit', 'manual-inward', 'manual-adjustment'], reversals: ['goods-receipt-reversal', 'void-reversal'],
  prices: ['stock-price-correction', 'goods-receipt-mrp-correction'],
}
export function historyKey(entry: StockHistoryEntry) { return `${entry.sourceKind}:${entry.id}` }
export function historyCompare(a: StockHistoryEntry, b: StockHistoryEntry) { return String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')) || historyKey(b).localeCompare(historyKey(a)) }
export function createStockHistoryPager(filters: HistoryFilters, refreshNonce = 0) {
  const asOf = serverNowIso()
  const identity = JSON.stringify([filters, asOf, refreshNonce])
  if (filters.undated && (!filters.identifier.trim() || filters.identifierMode !== 'productId')) throw new Error('Choose an exact product ID to inspect undated legacy movements.')
  const sources: HistoryStream<StockHistoryEntry, NonNullable<Cursor>>[] = []
  if (filters.event !== 'damaged') sources.push({ id: 'movement', load: async (cursor) => {
    const constraints: (QueryConstraint | QueryCompositeFilterConstraint)[] = filters.undated ? [] : [...dateConstraints(filters.from, filters.to), where('createdAt', '<=', asOf)]
    if (filters.identifier.trim()) constraints.push(where(filters.identifierMode, '==', filters.identifier.trim()))
    if (filters.event === 'prices') constraints.push(or(where('type', 'in', historyTypes.prices), where('priceChanged', '==', true)))
    else if (historyTypes[filters.event]) constraints.push(where('type', 'in', historyTypes[filters.event]))
    const page = await readPage<StockMovement>('stockMovements', constraints, cursor, 25, identity, filters.undated ? '__name__' : 'createdAt')
    return { ...page, items: page.items.filter((item) => !filters.undated || !item.createdAt || !Number.isFinite(Date.parse(item.createdAt))).map((item) => ({ ...item, sourceKind: 'movement' as const })) }
  } })
  if (!filters.identifier.trim() && !filters.undated && ['', 'returns', 'damaged'].includes(filters.event)) sources.push({ id: 'damaged-return', load: async (cursor) => {
    const condition = filters.event === 'damaged' ? where('returnCondition', '==', 'damaged') : or(where('returnCondition', '==', 'damaged'), where('nonStockReturn', '==', true))
    const page = await readPage<StockMovement>('events', [...dateConstraints(filters.from, filters.to), where('createdAt', '<=', asOf), where('type', '==', 'bill-return-approved'), condition], cursor, 25, identity)
    return { ...page, items: page.items.map((item) => ({ ...item, sourceKind: item.returnCondition === 'damaged' ? 'damaged-return' as const : 'unmapped-return' as const, quantityDelta: 0 })) }
  } })
  return { ...mergeHistory(sources, historyKey, historyCompare), asOf }
}
