import type { PosProduct, PosProductCost } from '@/features/pos/domain/types'

export const NOT_RECORDED = 'Not Recorded'
export const MISSING_VALUE = '__not_recorded__'
export const normalizeStockText = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-IN')
const acronyms = new Set(['MRP', 'GST', 'HSN', 'SKU', 'UPC', 'EAN', 'UPI', 'USB', 'LED', 'LCD', 'TV', 'LG', 'HP', 'ITC', 'P&G', '3M', 'UV', 'SPF', 'HD', 'HDMI', 'PET', 'PVC'])
const units = new Map([['ml', 'ml'], ['kg', 'kg'], ['mg', 'mg'], ['gm', 'gm'], ['g', 'g'], ['cm', 'cm'], ['mm', 'mm'], ['l', 'L'], ['litre', 'Litre']])

/** Presentation only: never use this to rewrite names, identifiers or source evidence. */
export function stockTitleCase(value: string) {
  return value.trim().replace(/\s+/g, ' ').replace(/[\p{L}\p{N}]+(?:['’&][\p{L}\p{N}]+)*/gu, (word) => {
    if (acronyms.has(word.toUpperCase())) return word.toUpperCase()
    const measuredUnit = word.match(/^(\d+)(ml|kg|mg|gm|g|cm|mm|l)$/i)
    if (measuredUnit) return measuredUnit[1] + units.get(measuredUnit[2].toLowerCase())
    const unit = units.get(word.toLowerCase())
    if (unit) return unit
    // Preserve deliberate brand spelling such as iPhone, Dettol and McVitie's.
    if (/[a-z][A-Z]/.test(word)) return word
    if (/\d/.test(word)) return word
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  }) || NOT_RECORDED
}

function sourceValue(product: PosProduct, keys: string[]) {
  for (const key of keys) {
    const entry = Object.entries(product.sourceValues ?? {}).find(([name]) => normalizeStockText(name) === normalizeStockText(key))
    if (entry && entry[1].trim()) return entry[1].trim()
  }
  return ''
}

function recordedNumber(value: string) {
  if (!value.trim()) return null
  const parsed = Number(value.replace(/[₹,\s]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

export type StockRow = PosProduct & { subcategory: string; openingQuantity: number | null; mrpPaise: number | null; costPaise: number | null }

export function deriveStockRows(products: PosProduct[], costs: PosProductCost[]): StockRow[] {
  const costMap = new Map(costs.map((cost) => [cost.productId, cost]))
  return products.map((product) => {
    // The original workbook MRP is historical evidence, not a fallback after a correction.
    const mrp = recordedNumber(sourceValue(product, ['Printed MRP']))
    const cost = costMap.get(product.id)
    return {
      ...product,
      subcategory: sourceValue(product, ['Subcategory', 'Source subCategoryOf']),
      openingQuantity: recordedNumber(sourceValue(product, ['Opening Quantity', 'Source quantity'])),
      mrpPaise: mrp === null ? null : Math.round(mrp * 100),
      costPaise: cost?.costPaise ?? null,
      updatedAt: cost?.updatedAt && Date.parse(cost.updatedAt) > Date.parse(product.updatedAt) ? cost.updatedAt : product.updatedAt,
    }
  })
}

export type Facet = 'category' | 'subcategory' | 'brand' | 'vendor'
export type StockFilters = Record<Facet, string> & {
  search: string; stockStatus: string; minQuantity: string; maxQuantity: string; active: string
}
export const defaultStockFilters: StockFilters = {
  search: '', category: '', subcategory: '', brand: '', vendor: '', stockStatus: '', minQuantity: '', maxQuantity: '', active: 'active',
}
const facetKey = (value: string) => normalizeStockText(value) || MISSING_VALUE

export function stockFacetOptions(rows: StockRow[], facet: Facet) {
  const values = new Map<string, string>()
  for (const row of rows) {
    const key = facetKey(row[facet])
    const label = stockTitleCase(row[facet])
    // Prefer intentional mixed case spelling over an all-capital variant.
    if (!values.has(key) || /[a-z][A-Z]/.test(row[facet])) values.set(key, label)
  }
  return [{ value: '', label: 'All' }, ...Array.from(values, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))]
}

export function stockFilterError(filters: StockFilters) {
  const min = filters.minQuantity.trim() ? Number(filters.minQuantity) : null
  const max = filters.maxQuantity.trim() ? Number(filters.maxQuantity) : null
  if ((min !== null && !Number.isFinite(min)) || (max !== null && !Number.isFinite(max))) return 'Enter A Valid Quantity.'
  if (min !== null && max !== null && min > max) return 'Minimum Quantity Must Not Exceed Maximum Quantity.'
  return null
}

export function filterStockRows(rows: StockRow[], filters: StockFilters) {
  if (stockFilterError(filters)) return []
  const search = normalizeStockText(filters.search)
  const terms = search.split(' ').filter(Boolean)
  const exactIdentifiers = search ? new Set(rows.filter((row) => normalizeStockText(row.barcode) === search || normalizeStockText(row.id) === search).map((row) => row.id)) : new Set<string>()
  return rows.filter((row) => {
    if (filters.active === 'active' && !row.active) return false
    if (filters.active === 'inactive' && row.active) return false
    if (filters.stockStatus === 'positive' && row.currentQuantity <= 0) return false
    if (filters.stockStatus === 'zero' && row.currentQuantity !== 0) return false
    if (filters.stockStatus === 'negative' && row.currentQuantity >= 0) return false
    if (filters.minQuantity.trim() && row.currentQuantity < Number(filters.minQuantity)) return false
    if (filters.maxQuantity.trim() && row.currentQuantity > Number(filters.maxQuantity)) return false
    for (const facet of ['category', 'subcategory', 'brand', 'vendor'] as const) {
      if (filters[facet] && facetKey(row[facet]) !== filters[facet]) return false
    }
    if (!search) return true
    if (exactIdentifiers.size) return exactIdentifiers.has(row.id)
    // Barcode scans are exact, keeping leading zeros and avoiding partial matches.
    if (/^\d+$/.test(search)) return row.barcode.trim() === filters.search.trim() || row.id === filters.search.trim()
    const haystack = normalizeStockText([row.name, row.id, row.barcode, row.category, row.subcategory, row.brand, row.vendor].join(' '))
    return terms.every((term) => haystack.includes(term))
  })
}

export type StockSort = 'name' | 'currentQuantity' | 'mrpPaise' | 'sellingPricePaise' | 'costPaise'
export function sortStockRows(rows: StockRow[], sort: StockSort, descending: boolean) {
  return [...rows].sort((a, b) => {
    const left = a[sort], right = b[sort]
    if (left === null && right !== null) return 1
    if (right === null && left !== null) return -1
    const result = typeof left === 'number' && typeof right === 'number'
      ? left - right
      : String(left ?? '').localeCompare(String(right ?? ''), 'en-IN', { sensitivity: 'base', numeric: true })
    return (descending ? -result : result) || a.id.localeCompare(b.id)
  })
}

export const stockMoney = (paise: number | null) => paise === null ? NOT_RECORDED : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(paise / 100)
export const stockQuantity = (value: number | null) => value === null ? NOT_RECORDED : value.toLocaleString('en-IN', { maximumFractionDigits: 3 })
export function stockDate(value: string) {
  const date = new Date(value)
  return value && Number.isFinite(date.getTime()) ? date.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : NOT_RECORDED
}
