import type { StockSort } from '../domain/currentStock'
import type { StockQueryFilters } from '../domain/stockQueryPlan'
import { loadStockPage } from '../data/stockRepository'
import { useServerPage } from './useServerPage'
export function useCurrentStock(filters: StockQueryFilters, sort: StockSort, descending: boolean) {
  const enabled = Boolean(filters.search.trim() || filters.stockStatus || filters.vendor.trim())
  return { ...useServerPage(JSON.stringify([filters, sort, descending]), (cursor) => loadStockPage(filters, sort, descending, cursor), enabled), enabled }
}