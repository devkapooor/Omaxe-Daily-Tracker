import { describe, expect, it } from 'vitest'
import type { DailyCashoutEntry } from '@/domain/appTypes'
import { deriveHistoricalDrawerClosurePreview } from '../data/drawerClosureRepository'
import type { HandoverLedger } from './cashierHandover'
import type { PosBill, PosRefundEvent } from './types'

const cashout: DailyCashoutEntry = {
  id: 'daily-cashout-oct-4',
  date: '2026-10-04',
  recordedBy: 'Pawan',
  recordedByUserId: 'billing',
  upiSales: 0,
  cashSales: 20912,
  returns: 0,
  creditSales: 0,
  cashAudit: 20912,
  drawerTotal: 21930,
  actualCashParticulars: '',
  pendingCashParticulars: '',
  remainingBalance: 21930,
  createdAt: '2026-10-04T18:28:31.350Z',
}

const ledger: HandoverLedger = {
  initialized: true,
  revision: 286,
  cashNetPaise: 3310500,
  dailyTotals: {},
  lastOperation: 'bill',
  lastOperationId: 'latest-bill',
  updatedByUid: 'billing',
  checkpoint: {
    cashActualPaise: 2142500,
    cashNetPaise: 2050600,
    date: '2026-10-04',
    upiActualPaise: 0,
    cardActualPaise: 0,
    upiNetPaise: 0,
    cardNetPaise: 0,
    reconciliationId: 'reconciliation',
  },
}

function bill(id: string, createdAt: string, amountPaise: number): PosBill {
  return { id, createdAt, payments: [{ method: 'cash', amountPaise }] } as PosBill
}

describe('historical drawer closure preview', () => {
  it('reconstructs the verified October 4 close without treating the old badge as physical cash', () => {
    const preview = deriveHistoricalDrawerClosurePreview(cashout, ledger, [
      bill('after-1', '2026-10-04T18:30:00.000Z', 1000000),
      bill('after-2', '2026-10-05T00:54:24.533Z', 219300),
    ], [])
    expect(preview).toMatchObject({
      countedPaise: 2193000,
      expectedAtClosurePaise: 2183100,
      differencePaise: 9900,
      subsequentCashBillPaise: 1219300,
      subsequentCashRefundPaise: 0,
      resultingBalancePaise: 1219300,
      currentExpectedPaise: 3402400,
    })
  })

  it('subtracts later voids and cash refunds when replaying post-close drawer activity', () => {
    const bills = [bill('after', '2026-10-04T19:00:00.000Z', 100000), bill('before', '2026-10-04T18:00:00.000Z', 50000)]
    const events = [
      { id: 'void', type: 'bill-voided', billId: 'after', createdAt: '2026-10-04T20:00:00.000Z' },
      { id: 'refund', type: 'bill-return-approved', refundMethod: 'cash', refundAmountPaise: 2500, createdAt: '2026-10-04T21:00:00.000Z' },
      { id: 'old-refund', type: 'bill-return-approved', refundMethod: 'cash', refundAmountPaise: 9999, createdAt: '2026-10-04T18:10:00.000Z' },
    ] as Array<PosRefundEvent & { createdAt?: string }>
    const preview = deriveHistoricalDrawerClosurePreview(cashout, ledger, bills, events)
    expect(preview.subsequentCashBillPaise).toBe(100000)
    expect(preview.subsequentCashRefundPaise).toBe(102500)
    expect(preview.subsequentNetCashPaise).toBe(-2500)
  })

  it('refuses to repair a cashout that is already linked', () => {
    expect(() => deriveHistoricalDrawerClosurePreview({ ...cashout, drawerClosureId: cashout.id }, ledger, [], []))
      .toThrow(/already has a drawer closure/)
  })
})
