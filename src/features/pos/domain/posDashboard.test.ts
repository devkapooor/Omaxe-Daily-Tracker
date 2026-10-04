import { describe, expect, it } from 'vitest'
import type { PosBill, PosBillState, PosProduct, PosRefundEvent } from './types'
import { calculatePosDashboard } from './posDashboard'

const date = '2026-10-03'
const bill = (id: string, payments: PosBill['payments'], businessDate = date): PosBill => ({
  id, receiptNumber: `TEST-${id}`, financialYear: '2026-27', sequenceNumber: 1, businessDate, lines: [],
  subtotalPaise: 16000, discount: { mode: 'amount', amountPaise: 1000 }, totalPaise: 15000,
  payments, cashTenderedPaise: 20000, cashChangePaise: 5000, status: 'finalized', testOnly: true,
  createdAt: `${businessDate}T00:00:00.000Z`, createdByUid: 'test', createdByName: 'Test', createdByRole: 'owner',
})

describe('POS dashboard totals', () => {
  it('counts a split bill once and uses allocations rather than cash tendered', () => {
    const result = calculatePosDashboard([bill('one', [{ method: 'cash', amountPaise: 5000 }, { method: 'upi', amountPaise: 10000 }])], [], [], date, date)
    expect(result).toMatchObject({ salesPaise: 15000, netPaise: 15000, billCount: 1, splitBillCount: 1, discountPaise: 1000 })
    expect(result.methods.map((method) => method.collectedPaise)).toEqual([5000, 10000, 0, 0])
  })
  it('excludes voided receipts and keeps rejected or pending returns out of refunds', () => {
    const states: PosBillState[] = [{ billId: 'void', state: 'voided', revision: 2 }]
    const events: PosRefundEvent[] = [{ id: 'pending', type: 'return-requested', refundDate: date, refundAmountPaise: 1000, refundMethod: 'cash' }]
    const result = calculatePosDashboard([bill('void', [{ method: 'card', amountPaise: 15000 }]), bill('active', [{ method: 'cash', amountPaise: 15000 }])], states, events, date, date)
    expect(result).toMatchObject({ salesPaise: 15000, refundsPaise: 0, billCount: 1, voidedCount: 1, voidedPaise: 15000 })
    expect(result.methods.find((method) => method.value === 'card')?.collectedPaise).toBe(0)
  })
  it('uses refund date and refund method, including refunds of older sales', () => {
    const events: PosRefundEvent[] = [
      { id: 'refund', type: 'bill-return-approved', billId: 'older-sale', refundDate: date, refundAmountPaise: 2000, refundMethod: 'cash' },
      { id: 'future', type: 'bill-return-approved', refundDate: '2026-10-04', refundAmountPaise: 1000, refundMethod: 'upi' },
    ]
    const result = calculatePosDashboard([bill('card', [{ method: 'card', amountPaise: 15000 }]), bill('older-sale', [{ method: 'upi', amountPaise: 15000 }], '2026-10-02')], [], events, date, date)
    expect(result).toMatchObject({ salesPaise: 15000, refundsPaise: 2000, netPaise: 13000 })
    expect(result.methods.find((method) => method.value === 'cash')?.netPaise).toBe(-2000)
  })
  it('includes more than the recent-bills display limit and both date boundaries', () => {
    const bills = Array.from({ length: 65 }, (_, index) => bill(String(index), [{ method: 'bank-transfer', amountPaise: 15000 }], index % 2 ? '2026-10-01' : date))
    const result = calculatePosDashboard(bills, [], [], '2026-10-01', date)
    expect(result.billCount).toBe(65)
    expect(result.salesPaise).toBe(975000)
    expect(result.methods.find((method) => method.value === 'bank-transfer')?.netPaise).toBe(975000)
  })
  it('reconciles refunds with missing methods and returns a clean empty period', () => {
    expect(calculatePosDashboard([], [], [], date, date)).toMatchObject({ salesPaise: 0, refundsPaise: 0, netPaise: 0, billCount: 0 })
    const result = calculatePosDashboard([], [], [{ id: 'legacy', type: 'bill-return-approved', refundDate: date, refundAmountPaise: 500 }], date, date)
    expect(result).toMatchObject({ unassignedRefundsPaise: 500, refundsPaise: 500, netPaise: -500 })
  })
  it('derives operational product, basket, stock, and recent-bill metrics', () => {
    const sale = bill('sale', [{ method: 'upi', amountPaise: 15000 }])
    sale.lines = [
      { id: 'line-1', kind: 'product', productId: 'product-1', barcode: '100', description: 'Product One', quantity: 2, unitPricePaise: 6000 },
      { id: 'line-2', kind: 'temporary', barcode: 'temp', description: 'Temporary', quantity: 1, unitPricePaise: 3000 },
    ]
    const product = (id: string, name: string, currentQuantity: number): PosProduct => ({
      id, name, currentQuantity, barcode: id, searchName: name.toLowerCase(), category: '', brand: '', vendor: '', sellingPricePaise: 6000,
      revision: 1, active: true, createdAt: '', createdByUid: '', createdByName: '', updatedAt: '', updatedByUid: '', updatedByName: '',
    })
    const result = calculatePosDashboard([sale], [], [], date, date, [product('product-1', 'Product One', -2), product('product-2', 'Product Two', 0)])
    expect(result).toMatchObject({ unitsSold: 3, averageBillPaise: 15000, unresolvedItemCount: 1, negativeStockCount: 1, zeroStockCount: 1 })
    expect(result.topProducts[0]).toMatchObject({ id: 'product-1', quantity: 2, revenuePaise: 12000 })
    expect(result.stockAttention.map((item) => item.id)).toEqual(['product-1', 'product-2'])
    expect(result.recentBills[0].id).toBe('sale')
  })
})
