import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { calculateDiscount, formatPosReceiptNumber } from './posDomain'
import { handoverDate } from './cashierHandover'
const server = createRequire(import.meta.url)('../../../../functions/posCheckout.js')

describe('trusted checkout preserves approved client contracts', () => {
  it('agrees on independently specified IST and receipt fixtures', () => {
    for (const [time, day] of [['2026-10-12T18:29:59.999Z', '2026-10-12'], ['2026-10-12T18:30:00.000Z', '2026-10-13']]) {
      expect(handoverDate(time)).toBe(day)
      expect(server.istDate(new Date(time))).toBe(day)
      expect(server.receiptNumber(day, time, 21)).toBe(formatPosReceiptNumber(day, time, 21))
    }
  })
  it('retains configured percentage rounding with independent paise expectations', () => {
    for (const [subtotal, percentage, expected] of [[22500, 5, 1125], [1, 50, 1], [10001, 12.5, 1250]]) {
      expect(calculateDiscount(subtotal, 'percentage', percentage).amountPaise).toBe(expected)
      expect(server.percentageDiscount(subtotal, percentage)).toBe(expected)
    }
  })
})
