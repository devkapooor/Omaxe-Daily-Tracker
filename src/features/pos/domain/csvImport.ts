import { rupeesToPaise, validateImportRows } from './posDomain'
import type { PosImportRow } from './types'

const aliases = {
  productId: ['product id', 'productid', 'item id', 'itemid', 'sku', 'code'],
  barcode: ['barcode', 'bar code', 'ean', 'upc'],
  name: ['product name', 'product', 'item name', 'item', 'description'],
  category: ['category', 'group'],
  brand: ['brand', 'company'],
  vendor: ['vendor', 'supplier', 'party'],
  sellingPrice: ['selling price', 'sale price', 'retail price', 'mrp', 'price'],
  openingQuantity: ['opening quantity', 'opening qty', 'quantity', 'qty', 'stock'],
  cost: ['cost', 'cost price', 'purchase price', 'buying price'],
} as const

function parseCsvRows(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1 }
      else if (char === '"') quoted = false
      else field += char
    } else if (char === '"') quoted = true
    else if (char === ',') { row.push(field); field = '' }
    else if (char === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (char !== '\r') field += char
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }
  return rows.filter((values) => values.some((value) => value.trim() !== ''))
}

function normalizedHeader(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
}

function columnIndex(headers: string[], choices: readonly string[], required = true) {
  const index = headers.findIndex((header) => choices.includes(header))
  if (index < 0 && required) throw new Error(`CSV is missing column: ${choices[0]}.`)
  return index
}

function integer(value: string, label: string, rowNumber: number) {
  const parsed = Number(value.trim())
  if (!Number.isInteger(parsed)) throw new Error(`Row ${rowNumber}: ${label} must be a whole number.`)
  return parsed
}

function money(value: string, label: string, rowNumber: number, allowBlank = false) {
  if (allowBlank && value.trim() === '') return null
  const parsed = Number(value.replace(/[₹,]/g, '').trim())
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Row ${rowNumber}: ${label} is invalid.`)
  return rupeesToPaise(parsed)
}

export function parseApprovedPosCsv(text: string) {
  const rows = parseCsvRows(text.replace(/^\uFEFF/, ''))
  if (rows.length < 2) throw new Error('CSV must contain a header and at least one product row.')
  const sourceHeaders = rows[0].map((header) => header.trim())
  const headers = sourceHeaders.map(normalizedHeader)
  const indexes = {
    productId: columnIndex(headers, aliases.productId),
    barcode: columnIndex(headers, aliases.barcode),
    name: columnIndex(headers, aliases.name),
    category: columnIndex(headers, aliases.category),
    brand: columnIndex(headers, aliases.brand),
    vendor: columnIndex(headers, aliases.vendor),
    sellingPrice: columnIndex(headers, aliases.sellingPrice),
    openingQuantity: columnIndex(headers, aliases.openingQuantity),
    cost: columnIndex(headers, aliases.cost, false),
  }
  const products: PosImportRow[] = rows.slice(1).map((values, index) => {
    const rowNumber = index + 2
    const sourceValues = Object.fromEntries(sourceHeaders.map((header, column) => [header, values[column] ?? '']))
    const raw = (column: number) => column < 0 ? '' : values[column] ?? ''
    return {
      productId: raw(indexes.productId).trim(),
      barcode: raw(indexes.barcode).trim(),
      name: raw(indexes.name).trim().replace(/\s+/g, ' '),
      category: raw(indexes.category).trim().replace(/\s+/g, ' '),
      brand: raw(indexes.brand).trim().replace(/\s+/g, ' '),
      vendor: raw(indexes.vendor).trim().replace(/\s+/g, ' '),
      sellingPricePaise: money(raw(indexes.sellingPrice), 'selling price', rowNumber) ?? 0,
      openingQuantity: integer(raw(indexes.openingQuantity), 'opening quantity', rowNumber),
      costPaise: money(raw(indexes.cost), 'cost', rowNumber, true),
      sourceValues,
    }
  })
  return { products, validation: validateImportRows(products), sourceHeaders }
}

export async function sha256Hex(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, '0')).join('')
}
