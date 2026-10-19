export type StockPrices = { mrpPaise: number | null; sellingPricePaise: number }
export function validateStockPrices({ mrpPaise, sellingPricePaise }: StockPrices): void {
  if (mrpPaise === null) throw new Error('Enter MRP before saving stock prices.')
  if (sellingPricePaise > mrpPaise) throw new Error('Selling price cannot be greater than MRP.')
}
export type StockPriceChange = {
  id: string; productId: string; barcode: string; productName: string
  before: { mrpPaise: number | null; sellingPricePaise: number | null }; after: StockPrices; beforeRevision: number; afterRevision: number
  reason: string; actorUid: string; actorName: string; createdAt: string
  reviewStatus: 'pending' | 'reviewed'; reviewedAt?: string; reviewedByUid?: string; reviewedByName?: string
  reviewReason?: string
  sourceKind?: 'goods-receipt' | 'goods-receipt-reversal'
  sourceRecordId?: string
  movementId?: string
  beforeRecordedValues?: { mrp: string | null; selling: string | null }
}

export function stockPricePaise(value: string, optional = false): number | null {
  const text = value.trim()
  if (!text && optional) return null
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error('Enter prices of zero or greater, with up to two decimal places.')
  const [whole, decimal = ''] = text.split('.')
  const paise = Number(whole) * 100 + Number(decimal.padEnd(2, '0'))
  if (!Number.isSafeInteger(paise)) throw new Error('This price is too large.')
  return paise
}
