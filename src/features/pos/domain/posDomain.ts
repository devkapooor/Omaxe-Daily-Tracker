import type { AppUser } from '@/domain/financeTypes'
import type { PosCartLine, PosDiscount, PosImportRow, PosImportValidation, PosPaymentAllocation } from './types'

export function rupeesToPaise(value: number) {
  if (!Number.isFinite(value)) throw new Error('Money value must be a finite number.')
  return Math.round(value * 100)
}

export function paiseToRupees(value: number) {
  return value / 100
}

export function normalizePosProductSearch(value: string) {
  return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ')
}

export function posProductSearchTokens(name: string) {
  const words = normalizePosProductSearch(name).split(' ').filter((word) => word.length >= 2)
  return [...new Set(words.flatMap((word) => {
    const characters = Array.from(word)
    return characters.slice(1).map((_, index) => characters.slice(0, index + 2).join(''))
  }))]
}

export function upcEanEquivalentBarcode(barcode: string) {
  if (!/^\d+$/.test(barcode)) return null
  const validGtin = (value: string) => {
    const body = value.slice(0, -1)
    const expected = Number(value.at(-1))
    let sum = 0
    for (let index = body.length - 1, position = 0; index >= 0; index -= 1, position += 1) {
      sum += Number(body[index]) * (position % 2 === 0 ? 3 : 1)
    }
    return (10 - sum % 10) % 10 === expected
  }
  if (barcode.length === 12 && validGtin(barcode)) return `0${barcode}`
  if (barcode.length === 13 && barcode.startsWith('0') && validGtin(barcode)) return barcode.slice(1)
  return null
}

export function posSubtotal(lines: PosCartLine[]) {
  return lines.reduce((sum, line) => sum + line.unitPricePaise * line.quantity, 0)
}

export function calculateDiscount(subtotalPaise: number, mode: PosDiscount['mode'], value: number): PosDiscount {
  if (mode === 'none') return { mode, amountPaise: 0 }
  if (!Number.isFinite(value) || value < 0) throw new Error('Discount cannot be negative.')
  if (mode === 'percentage') {
    if (value > 100) throw new Error('Discount percentage cannot exceed 100%.')
    return { mode, percentage: value, amountPaise: Math.min(subtotalPaise, Math.round(subtotalPaise * value / 100)) }
  }
  return { mode, amountPaise: Math.min(subtotalPaise, rupeesToPaise(value)) }
}

export function validateDiscount(
  actor: AppUser,
  subtotalPaise: number,
  discount: PosDiscount,
  billingMaxDiscountPercentage: number | null,
) {
  if (!Number.isInteger(discount.amountPaise) || discount.amountPaise < 0 || discount.amountPaise > subtotalPaise) {
    throw new Error('Discount amount is invalid.')
  }
  const effectivePercentage = subtotalPaise === 0 ? 0 : discount.amountPaise * 100 / subtotalPaise
  if (actor.role === 'billing') {
    if (discount.amountPaise > 0 && billingMaxDiscountPercentage === null) {
      throw new Error('Discounts are disabled for billing users until the owner configures a limit.')
    }
    if (billingMaxDiscountPercentage !== null && effectivePercentage > billingMaxDiscountPercentage + 0.00001) {
      throw new Error(`Discount exceeds the billing limit of ${billingMaxDiscountPercentage}%.`)
    }
  } else if (billingMaxDiscountPercentage !== null && effectivePercentage > billingMaxDiscountPercentage && !discount.overrideReason?.trim()) {
    throw new Error('A reason is required when exceeding the configured discount limit.')
  }
}

export function validateSettlement(totalPaise: number, payments: PosPaymentAllocation[]) {
  if (totalPaise < 0 || !Number.isInteger(totalPaise)) throw new Error('Bill total is invalid.')
  if (payments.length === 0) throw new Error('Add at least one payment allocation.')
  if (payments.some((payment) => !Number.isInteger(payment.amountPaise) || payment.amountPaise < 0)) {
    throw new Error('Payment allocations must use non-negative integer paise.')
  }
  if (payments.reduce((sum, payment) => sum + payment.amountPaise, 0) !== totalPaise) {
    throw new Error('Payment allocations must exactly equal the bill total.')
  }
}

export function financialYearForDate(businessDate: string) {
  const [year, month] = businessDate.split('-').map(Number)
  if (!Number.isInteger(year) || month < 1 || month > 12) throw new Error('Business date is invalid.')
  const start = month >= 4 ? year : year - 1
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`
}

export function formatPosReceiptNumber(businessDate: string, createdAt: string, sequence: number) {
  const [year, month, day] = businessDate.split('-')
  const timeParts = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hourCycle: 'h23',
  }).formatToParts(new Date(createdAt))
  const part = (type: Intl.DateTimeFormatPartTypes) => timeParts.find((item) => item.type === type)?.value ?? ''
  const timestamp = `${part('hour')}${part('minute')}${part('second')}${part('fractionalSecond')}`
  return `TNS-${year}${month}${day}-${timestamp}-${String(sequence).padStart(6, '0')}`
}

export function validateImportRows(rows: PosImportRow[]): PosImportValidation {
  const productIds = new Set<string>()
  const barcodes = new Set<string>()
  const errors: string[] = []
  let negativeQuantityCount = 0
  let zeroQuantityCount = 0
  rows.forEach((row, index) => {
    const rowNumber = index + 2
    if (!row.productId) errors.push(`Row ${rowNumber}: product ID is required.`)
    if (!row.barcode) errors.push(`Row ${rowNumber}: barcode is required.`)
    if (!row.name) errors.push(`Row ${rowNumber}: product name is required.`)
    if (!Number.isInteger(row.openingQuantity)) errors.push(`Row ${rowNumber}: quantity must be a whole number.`)
    if (!Number.isInteger(row.sellingPricePaise) || row.sellingPricePaise < 0) errors.push(`Row ${rowNumber}: selling price is invalid.`)
    if (productIds.has(row.productId)) errors.push(`Row ${rowNumber}: duplicate product ID ${row.productId}.`)
    if (barcodes.has(row.barcode)) errors.push(`Row ${rowNumber}: duplicate barcode ${row.barcode}.`)
    productIds.add(row.productId)
    barcodes.add(row.barcode)
    if (row.openingQuantity < 0) negativeQuantityCount += 1
    if (row.openingQuantity === 0) zeroQuantityCount += 1
  })
  return {
    rowCount: rows.length,
    uniqueProductIds: productIds.size,
    uniqueBarcodes: barcodes.size,
    negativeQuantityCount,
    zeroQuantityCount,
    errors,
  }
}
