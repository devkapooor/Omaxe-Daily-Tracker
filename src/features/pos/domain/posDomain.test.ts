import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { AppUser } from '@/domain/financeTypes'
import { calculateDiscount, financialYearForDate, formatTestReceiptNumber, validateDiscount, validateImportRows, validateSettlement } from './posDomain'
import { parseApprovedPosCsv } from './csvImport'

const billing = { id: 'billing-1', name: 'Bill', role: 'billing' } as AppUser
const manager = { id: 'manager-1', name: 'Manager', role: 'manager' } as AppUser

describe('POS test calculations', () => {
  it('uses April-March financial years and a separate test sequence format', () => {
    expect(financialYearForDate('2026-04-01')).toBe('2026-27')
    expect(financialYearForDate('2027-03-31')).toBe('2026-27')
    expect(formatTestReceiptNumber('2026-27', 1)).toBe('TEST-2026-27-000001')
  })

  it('requires exact split settlement in integer paise', () => {
    expect(() => validateSettlement(10_000, [{ method: 'cash', amountPaise: 4_000 }, { method: 'upi', amountPaise: 6_000 }])).not.toThrow()
    expect(() => validateSettlement(10_000, [{ method: 'cash', amountPaise: 9_999 }])).toThrow(/exactly equal/)
  })

  it('disables billing discounts until configured and audits manager overrides', () => {
    const discount = calculateDiscount(100_00, 'percentage', 10)
    expect(() => validateDiscount(billing, 100_00, discount, null)).toThrow(/disabled/)
    expect(() => validateDiscount(billing, 100_00, discount, 5)).toThrow(/exceeds/)
    expect(() => validateDiscount(manager, 100_00, discount, 5)).toThrow(/reason/)
    expect(() => validateDiscount(manager, 100_00, { ...discount, overrideReason: 'Damaged packaging' }, 5)).not.toThrow()
  })
})

describe('approved POS CSV parsing', () => {
  it('validates the normalized 2 October workbook export exactly', () => {
    const parsed = parseApprovedPosCsv(readFileSync('data/pos/omaxe-opening-stock-2026-10-02.approved.csv', 'utf8'))
    expect(parsed.validation).toMatchObject({ rowCount: 6069, uniqueProductIds: 6069, uniqueBarcodes: 6069, negativeQuantityCount: 379, zeroQuantityCount: 3294, errors: [] })
    expect(parsed.products[0].sourceValues['Source Workbook Name']).toBe('CUrrent Stock 2 OCt.xlsx')
    expect(parsed.products[0].sourceValues['Source Workbook SHA256']).toMatch(/^[a-f0-9]{64}$/)
  })

  it('preserves source evidence and accepts negative and zero opening quantities', () => {
    const parsed = parseApprovedPosCsv('Product ID,Barcode,Product Name,Category,Brand,Vendor,Selling Price,Opening Qty,Cost\nP-1,001, Alpha  Soap ,Care,Acme,V One,12.50,-2,8\nP-2,002,Beta,Care,Acme,V Two,5,0,')
    expect(parsed.products[0]).toMatchObject({ productId: 'P-1', barcode: '001', name: 'Alpha Soap', sellingPricePaise: 1250, openingQuantity: -2, costPaise: 800 })
    expect(parsed.products[0].sourceValues['Product Name']).toBe(' Alpha  Soap ')
    expect(parsed.validation).toMatchObject({ rowCount: 2, negativeQuantityCount: 1, zeroQuantityCount: 1 })
  })

  it('reports duplicate IDs and barcodes without correcting them', () => {
    const rows = [
      { productId: 'P', barcode: '1', name: 'A', category: '', brand: '', vendor: '', sellingPricePaise: 100, openingQuantity: 1, costPaise: null, sourceValues: {} },
      { productId: 'P', barcode: '1', name: 'B', category: '', brand: '', vendor: '', sellingPricePaise: 100, openingQuantity: 1, costPaise: null, sourceValues: {} },
    ]
    expect(validateImportRows(rows).errors).toHaveLength(2)
  })
})
