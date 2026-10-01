import { describe, expect, it } from 'vitest'
import type { ChequeV2, VendorV2 } from './vendorLedgerV2'
import { mergeV2ChequesIntoPlanner } from './unifiedPaymentPlanner'

describe('mergeV2ChequesIntoPlanner', () => {
  it('replaces matching legacy cheques and recalculates bank availability', () => {
    const cheque = {
      id: '1120', chequeNumber: '1120', chequeNumberValue: 1120, purpose: 'vendor-payment', sourceRecordId: '1120',
      vendorId: 'vendor-1', date: '2026-10-05', amountPaise: 40000, status: 'issued', origin: 'v2', trackingOnly: false,
      revision: 2, createdAt: '2026-10-01T00:00:00.000Z', createdByUserId: 'owner', updatedAt: '2026-10-01T00:00:00.000Z', updatedByUserId: 'owner',
    } satisfies ChequeV2
    const vendor = { id: 'vendor-1', canonicalName: 'Acme', aliases: [], contact: '', address: '', suppliedBrands: [], active: true, openingBalancePaise: 0, revision: 1, createdAt: '', createdByUserId: 'owner', updatedAt: '', updatedByUserId: 'owner' } satisfies VendorV2
    const result = mergeV2ChequesIntoPlanner(500, [{ date: '2026-10-05', totalAmount: 450, items: [
      { id: 'legacy-1120', amount: 450, date: '2026-10-05', note: '', source: 'vendor-cheque', title: 'Old row', chequeNumber: '001120', runningBalanceAfter: 50, status: 'available' },
    ] }], [cheque], [vendor])
    expect(result[0].items).toHaveLength(1)
    expect(result[0].items[0]).toMatchObject({ source: 'vendor-cheque-v2', title: 'Acme', amount: 400, runningBalanceAfter: 100, status: 'available' })
  })

  it('excludes draft and completed V2 cheques', () => {
    const base = { id: '1120', chequeNumber: '1120', chequeNumberValue: 1120, purpose: 'vendor-payment', sourceRecordId: '1120', vendorId: 'vendor-1', date: '2026-10-05', amountPaise: 40000, origin: 'v2', trackingOnly: false, revision: 1, createdAt: '', createdByUserId: 'owner', updatedAt: '', updatedByUserId: 'owner' } as const
    expect(mergeV2ChequesIntoPlanner(500, [], [{ ...base, status: 'draft' }, { ...base, id: '1121', chequeNumber: '1121', chequeNumberValue: 1121, status: 'debited' }], [])).toEqual([])
  })
})
