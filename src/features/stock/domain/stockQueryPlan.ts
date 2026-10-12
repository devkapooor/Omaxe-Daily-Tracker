import type { StockSort } from './currentStock'
export type StockQueryFilters = { search: string; stockStatus: string }
export const stockQueryEnabled = (filters: StockQueryFilters) => Boolean(filters.search.trim() || filters.stockStatus)
export const pageSorts: StockSort[] = ['mrpPaise', 'costPaise', 'marginPercent']
export function stockQueryPlan(filters: StockQueryFilters, sort: StockSort, descending: boolean) {
  const range = ['positive', 'negative'].includes(filters.stockStatus)
  const requested = pageSorts.includes(sort) ? 'name' : sort
  const effectiveSort = range ? 'currentQuantity' : requested
  return { field: effectiveSort === 'name' ? 'searchName' : effectiveSort, effectiveSort, direction: descending && !pageSorts.includes(sort) ? 'desc' as const : 'asc' as const, pageOnly: pageSorts.includes(sort) }
}
