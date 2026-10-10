import {
  NOT_RECORDED, stockDate, stockMoney, stockQuantity, stockTitleCase,
  type StockRow, type StockSort,
} from '../domain/currentStock'

export type StockColumn = { key: string; label: string; value: (row: StockRow) => string; sort?: StockSort; numeric?: boolean }
export const stockColumns: StockColumn[] = [
  { key: 'id', label: 'Product ID', value: (row) => row.id || NOT_RECORDED },
  { key: 'barcode', label: 'Barcode', value: (row) => row.barcode || NOT_RECORDED },
  { key: 'name', label: 'Product Name', value: (row) => stockTitleCase(row.name), sort: 'name' },
  { key: 'category', label: 'Category', value: (row) => stockTitleCase(row.category) },
  { key: 'subcategory', label: 'Subcategory', value: (row) => stockTitleCase(row.subcategory) },
  { key: 'brand', label: 'Brand', value: (row) => stockTitleCase(row.brand) },
  { key: 'vendor', label: 'Vendor', value: (row) => stockTitleCase(row.vendor) },
  { key: 'currentQuantity', label: 'Current Quantity', value: (row) => stockQuantity(row.currentQuantity), sort: 'currentQuantity', numeric: true },
  { key: 'openingQuantity', label: 'Opening Quantity', value: (row) => stockQuantity(row.openingQuantity), numeric: true },
  { key: 'mrpPaise', label: 'MRP', value: (row) => stockMoney(row.mrpPaise), sort: 'mrpPaise', numeric: true },
  { key: 'sellingPricePaise', label: 'Selling Price', value: (row) => stockMoney(row.sellingPricePaise), sort: 'sellingPricePaise', numeric: true },
  { key: 'costPaise', label: 'Cost Price', value: (row) => stockMoney(row.costPaise), sort: 'costPaise', numeric: true },
  { key: 'active', label: 'Product Status', value: (row) => row.active ? 'Active' : 'Inactive' },
  { key: 'updatedAt', label: 'Last Updated', value: (row) => stockDate(row.updatedAt) },
]
