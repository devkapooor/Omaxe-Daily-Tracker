import { describe, expect, it } from 'vitest'
import type { DailyCashoutEntry } from './appTypes'
import {
  calculateCashoutAudit,
  cashoutCorrectionValuesEqual,
  cashoutEntryFromCorrection,
  denominationsFromEntry,
  drawerTotalFromDenominations,
} from './cashoutCorrections'

const legacyEntry: DailyCashoutEntry = {
  id: 'cashout-1',
  date: '2026-09-28',
  recordedBy: 'Staff',
  cashSales: 16488,
  upiSales: 26147,
  creditSales: 125,
  returns: 0,
  cashAudit: 15939,
  drawerTotal: 54382,
  remainingBalance: 54382,
  actualCashParticulars: '500 x 21 = 10500\n200 x 200 = 40000\n100 x 22 = 2200\n50 x 24 = 1200\n20 x 13 = 260\n10 x 22 = 220\nChange = 2\nTotal = 54382',
  pendingCashParticulars: 'By: Staff\nExpected Cash: 15938\nDrawer Total: 54382\nSystem Audit: 15939',
  createdAt: '2026-09-29T00:00:00.000Z',
}

describe('cashout corrections', () => {
  it('parses denomination counts from legacy particulars', () => {
    expect(denominationsFromEntry(legacyEntry)).toEqual({
      denom500: 21,
      denom200: 200,
      denom100: 22,
      denom50: 24,
      denom20: 13,
      denom10: 22,
      change: 2,
    })
  })

  it('calculates drawer totals and each audit state', () => {
    expect(drawerTotalFromDenominations({ denom500: 1, denom200: 2, denom100: 3, denom50: 4, denom20: 5, denom10: 6, change: 7 })).toBe(1567)
    expect(calculateCashoutAudit(1600, 1567).auditStatus).toBe('cash-less')
    expect(calculateCashoutAudit(1500, 1567).auditStatus).toBe('cash-more')
    expect(calculateCashoutAudit(1567, 1567).auditStatus).toBe('matched')
  })

  it('compares correction values independently of Firestore map key order', () => {
    const values = {
      cashSales: 100,
      upiSales: 200,
      creditSales: 30,
      returns: 5,
      cashExpense: 10,
      cashAudit: 90,
      drawerDenominations: { denom500: 1, denom200: 2, denom100: 3, denom50: 4, denom20: 5, denom10: 6, change: 7 },
    }
    const reordered = {
      cashAudit: 90,
      cashExpense: 10,
      returns: 5,
      creditSales: 30,
      upiSales: 200,
      cashSales: 100,
      drawerDenominations: { change: 7, denom10: 6, denom20: 5, denom50: 4, denom100: 3, denom200: 2, denom500: 1 },
    }
    expect(JSON.stringify(values)).not.toBe(JSON.stringify(reordered))
    expect(cashoutCorrectionValuesEqual(values, reordered)).toBe(true)
  })

  it('rebuilds audit fields and increments the revision after correction', () => {
    const corrected = cashoutEntryFromCorrection(legacyEntry, {
      cashSales: 16488,
      upiSales: 26147,
      creditSales: 125,
      returns: 0,
      cashExpense: 550,
      cashAudit: 15939,
      drawerDenominations: { denom500: 21, denom200: 2, denom100: 22, denom50: 24, denom20: 13, denom10: 22, change: 2 },
    }, 'Owner', '2026-10-01T00:00:00.000Z')

    expect(corrected.drawerTotal).toBe(14782)
    expect(corrected.auditStatus).toBe('cash-less')
    expect(corrected.revision).toBe(2)
    expect(corrected.updatedBy).toBe('Owner')
    expect(corrected.actualCashParticulars).toContain('200 x 2 = 400')
  })
})
