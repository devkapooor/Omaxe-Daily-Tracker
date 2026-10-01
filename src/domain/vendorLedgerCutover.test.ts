import { describe, expect, it } from 'vitest'
import {
  confirmsVendorLedgerActivation,
  reviewVendorLedgerCutover,
  VENDOR_LEDGER_ACTIVATION_PHRASE,
} from './vendorLedgerCutover'

describe('V2 vendor ledger cutover review', () => {
  it('allows an empty clean start so vendors can be added individually after activation', () => {
    const review = reviewVendorLedgerCutover('2026-10-01', [])

    expect(review).toMatchObject({ ready: true, vendorCount: 0, adjustedOpeningCount: 0, totalOpeningPaise: 0 })
  })

  it('reconciles explicit zero and audited opening balances', () => {
    const review = reviewVendorLedgerCutover('2026-10-05', [
      { id: 'vendor-1', canonicalName: 'Vendor One', openingBalancePaise: 0, openingReason: '' },
      { id: 'vendor-2', canonicalName: 'Vendor Two', openingBalancePaise: 125_050, openingReason: 'Verified statement' },
    ])
    expect(review).toMatchObject({ ready: true, vendorCount: 2, adjustedOpeningCount: 1, totalOpeningPaise: 125_050 })
    expect(review.chequeBook).toEqual({ id: 'book-1120-1199', startNumber: 1120, endNumber: 1199 })
  })

  it('blocks duplicate vendors and unsupported opening assumptions', () => {
    const review = reviewVendorLedgerCutover('', [
      { id: 'vendor-1', canonicalName: 'Vendor One', openingBalancePaise: 10_000, openingReason: '' },
      { id: 'vendor-2', canonicalName: ' vendor one ', openingBalancePaise: -1, openingReason: 'Legacy estimate' },
    ])
    expect(review.ready).toBe(false)
    expect(review.errors.join(' ')).toMatch(/activation date/)
    expect(review.errors.join(' ')).toMatch(/Duplicate vendor/)
    expect(review.errors.join(' ')).toMatch(/audit reason/)
    expect(review.errors.join(' ')).toMatch(/invalid opening/)
  })

  it('requires the exact production activation phrase', () => {
    expect(confirmsVendorLedgerActivation(VENDOR_LEDGER_ACTIVATION_PHRASE)).toBe(true)
    expect(confirmsVendorLedgerActivation(` ${VENDOR_LEDGER_ACTIVATION_PHRASE} `)).toBe(true)
    expect(confirmsVendorLedgerActivation('activate v2')).toBe(false)
    expect(confirmsVendorLedgerActivation('ACTIVATE')).toBe(false)
  })
})
