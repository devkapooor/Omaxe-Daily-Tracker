import { describe, expect, it } from 'vitest'
import { buildCheckoutPayment, emptySplitPayments } from './checkoutPayments'

describe('checkout payment selection', () => {
  it.each(['cash', 'upi', 'card'] as const)('allocates the full total automatically for %s', (method) => {
    expect(buildCheckoutPayment(12345, method, emptySplitPayments()).payments).toEqual([{ method, amountPaise: 12345 }])
  })
  it('calculates cash change without recording the excess as sales', () => {
    expect(buildCheckoutPayment(15000, 'cash', emptySplitPayments(), '200')).toMatchObject({ payments: [{ method: 'cash', amountPaise: 15000 }], cashTenderedPaise: 20000, cashChangePaise: 5000 })
    expect(() => buildCheckoutPayment(15000, 'cash', emptySplitPayments(), '100')).toThrow(/less than/)
    expect(() => buildCheckoutPayment(15000, 'cash', emptySplitPayments(), '')).toThrow(/cash received/)
  })
  it('uses only the cash portion of a split payment to calculate change', () => {
    const split = { ...emptySplitPayments(), cash: '50', upi: '100' }
    expect(buildCheckoutPayment(15000, 'split', split, '100')).toMatchObject({ cashPaise: 5000, cashTenderedPaise: 10000, cashChangePaise: 5000 })
  })
  it('rejects incomplete, stale and negative splits', () => {
    expect(() => buildCheckoutPayment(15000, 'split', { ...emptySplitPayments(), cash: '150' })).toThrow(/at least two/)
    const split = { ...emptySplitPayments(), cash: '50', card: '100' }
    expect(() => buildCheckoutPayment(20000, 'split', split)).toThrow(/exactly equal/)
    expect(() => buildCheckoutPayment(15000, 'split', { ...split, upi: '-1' })).toThrow(/negative/)
  })
  it('discards cash received when switching to a non-cash method', () => {
    expect(buildCheckoutPayment(15000, 'upi', emptySplitPayments(), '200')).toEqual({ payments: [{ method: 'upi', amountPaise: 15000 }], cashPaise: 0, cashChangePaise: 0 })
  })
})
