import { describe, expect, it } from 'vitest'
import type { VendorAccountStateV2 } from '@/domain/vendorLedgerV2'
import type { VendorIdentitySummary } from '@/domain/appTypes'
import { deriveVendorOutstanding } from './deriveCashMetrics'

const vendor = (id: string, name: string): VendorIdentitySummary => ({ id, name })

const account = (vendorId: string, outstandingPaise: number): VendorAccountStateV2 => ({
  id: vendorId,
  vendorId,
  outstandingPaise,
  vendorCreditPaise: 0,
  revision: 1,
  lastLedgerEntryId: 'entry',
  updatedAt: '',
  updatedByUserId: 'owner',
})

describe('vendor payable dashboard source', () => {
  it('uses V2 account states as the dashboard payable source', () => {
    const result = deriveVendorOutstanding(
      [vendor('vendor-a', 'Alpha Supply'), vendor('vendor-b', 'Beta Supply')],
      [account('vendor-a', 125075)],
    )

    expect(Object.fromEntries(result)).toEqual({
      'alpha supply': 1250.75,
      'beta supply': 0,
    })
  })

  it('keeps an orphaned V2 account visible by stable vendor ID instead of dropping its balance', () => {
    const result = deriveVendorOutstanding([], [account('vendor-orphan', 4200)])

    expect(Object.fromEntries(result)).toEqual({ 'vendor-orphan': 42 })
  })

  it('fails closed on an invalid payable amount', () => {
    expect(() => deriveVendorOutstanding([], [account('vendor-a', -1)])).toThrow(/invalid payable balance/i)
  })
})
