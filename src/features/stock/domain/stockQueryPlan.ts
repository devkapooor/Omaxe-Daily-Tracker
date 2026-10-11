import type { StockSort } from './currentStock'
export type StockQueryFilters = { search: string; searchMode: 'barcode' | 'name'; stockStatus: string; vendor: string }
export const pageSorts: StockSort[] = ['mrpPaise', 'costPaise', 'marginPercent']
export function stockQueryPlan(filters: StockQueryFilters, sort: StockSort, descending: boolean) {
  const prefix = filters.searchMode === 'name' && Boolean(filters.search.trim())
  const range = ['positive', 'negative'].includes(filters.stockStatus)
  const requested = pageSorts.includes(sort) ? 'name' : sort
  const effectiveSort = prefix ? 'name' : range ? 'currentQuantity' : requested
  return { field: effectiveSort === 'name' ? 'searchName' : effectiveSort, effectiveSort, direction: descending && !pageSorts.includes(sort) ? 'desc' as const : 'asc' as const, pageOnly: pageSorts.includes(sort) }
}