import { describe, expect, it } from 'vitest'
import type { ChequeV2, InvoiceAllocationV2, VendorLedgerEntryV2 } from './vendorLedgerV2'
import {
  activeChequeLeaf,
  assertExpectedRevision,
  assertChequeTransition,
  buildPurchasePostingV2,
  buildSettlementPostingV2,
  buildSettlementCorrectionV2,
  buildVendorV2,
  chequeVendorLedgerEffectPaise,
  deterministicEventId,
  financialLedgerAmountPaise,
  invoiceReservationId,
  invoiceBalanceV2,
  isV2BusinessDate,
  mapLegacyChequeStatus,
  normalizeChequeNumber,
  openInvoiceBalancesV2,
  paiseToRupees,
  releasesReservedAllocations,
  rupeesToPaise,
  validateCustomPayment,
  validateInvoiceAllocation,
  validateOpeningAdjustment,
  vendorOutstandingPaise,
} from './vendorLedgerV2'

function cheque(overrides: Partial<ChequeV2> = {}): ChequeV2 {
  return {
    id: 'cheque-1',
    chequeBookId: 'book-1',
    chequeNumber: '1120',
    purpose: 'vendor-payment',
    sourceRecordId: 'settlement-1',
    vendorId: 'vendor-1',
    date: '2026-10-02',
    amountPaise: 100_000,
    status: 'issued',
    origin: 'v2',
    trackingOnly: false,
    revision: 1,
    createdAt: '2026-10-01T00:00:00.000Z',
    createdByUserId: 'owner-1',
    updatedAt: '2026-10-01T00:00:00.000Z',
    updatedByUserId: 'owner-1',
    ...overrides,
  }
}

function ledgerEntry(overrides: Partial<VendorLedgerEntryV2> = {}): VendorLedgerEntryV2 {
  return {
    id: 'entry-1',
    vendorId: 'vendor-1',
    eventType: 'purchase',
    posting: 'financial',
    signedAmountPaise: 100_000,
    sourceType: 'purchase',
    sourceRecordId: 'purchase-1',
    sourceRevision: 1,
    occurredOn: '2026-10-02',
    createdAt: '2026-10-02T00:00:00.000Z',
    createdByUserId: 'owner-1',
    ...overrides,
  }
}

describe('V2 money and deterministic identifiers', () => {
  it('builds new vendors at zero without copying a legacy balance', () => {
    const vendor = buildVendorV2({
      id: 'vendor-1', canonicalName: ' Acme Supply ', aliases: ['ACME', ' acme ', 'North Shop'],
      suppliedBrands: ['Brand A', ' brand a ', 'Brand B'], actorUserId: 'owner-1', timestamp: '2026-10-01T00:00:00.000Z',
    })
    expect(vendor).toMatchObject({ canonicalName: 'Acme Supply', aliases: ['ACME', 'North Shop'], openingBalancePaise: 0 })
    expect(vendor.suppliedBrands).toEqual(['Brand A', 'Brand B'])
  })

  it('converts rupees at the legacy boundary and keeps paise integral', () => {
    expect(rupeesToPaise(7141.3)).toBe(714_130)
    expect(rupeesToPaise(0.1 + 0.2)).toBe(30)
    expect(paiseToRupees(714_130)).toBe(7141.3)
    expect(() => paiseToRupees(1.5)).toThrow(/integer/)
  })

  it('creates stable event and per-vendor invoice reservation IDs', () => {
    expect(deterministicEventId('purchase', 'purchase/1', 2, 'purchase')).toBe('purchase:purchase%2F1:2:purchase')
    expect(invoiceReservationId('vendor-1', ' inv-10 ')).toBe('vendor-1:INV-10')
  })

  it('applies one activation date to all V2 records', () => {
    expect(isV2BusinessDate('2026-10-01', '2026-10-01')).toBe(true)
    expect(isV2BusinessDate('2026-09-30', '2026-10-01')).toBe(false)
    expect(() => isV2BusinessDate('01/10/2026', '2026-10-01')).toThrow(/YYYY-MM-DD/)
  })
})

describe('V2 ledger rules', () => {
  it('builds one deterministic purchase, uniqueness reservation, and ledger event', () => {
    const posting = buildPurchasePostingV2({
      id: 'purchase-1',
      vendorId: 'vendor-1',
      invoiceNumber: ' inv 10 ',
      invoiceDate: '2026-10-02',
      invoiceTotalPaise: 125_050,
      category: ' Grocery ',
      actorUserId: 'user-1',
      timestamp: '2026-10-02T00:00:00.000Z',
    })
    expect(posting.purchase.invoiceReservationId).toBe('vendor-1:INV%2010')
    expect(posting.purchase.normalizedInvoiceNumber).toBe('INV 10')
    expect(posting.purchase.ledgerEntryId).toBe('purchase:purchase-1:1:purchase')
    expect(posting.reservation.normalizedInvoiceNumber).toBe('INV 10')
    expect(posting.ledgerEntry.signedAmountPaise).toBe(125_050)
    expect(posting.purchase).not.toHaveProperty('paidAmount')
  })

  it('calculates outstanding from financial entries and excludes pending cheque information', () => {
    const entries = [
      ledgerEntry(),
      ledgerEntry({ id: 'credit', eventType: 'vendor-credit', signedAmountPaise: -20_000 }),
      ledgerEntry({ id: 'pending', eventType: 'pending-cheque', posting: 'informational', signedAmountPaise: -50_000 }),
    ]
    expect(vendorOutstandingPaise(entries)).toBe(80_000)
  })

  it('derives open invoice value from posted allocations and keeps cheque reservations separate', () => {
    const purchase = buildPurchasePostingV2({
      id: 'purchase-1', vendorId: 'vendor-1', invoiceNumber: 'INV-1', invoiceDate: '2026-10-02',
      invoiceTotalPaise: 100_000, actorUserId: 'owner-1', timestamp: '2026-10-02T00:00:00.000Z',
    }).purchase
    const allocation = (id: string, amountPaise: number, state: InvoiceAllocationV2['state']): InvoiceAllocationV2 => ({
      id, vendorId: 'vendor-1', invoiceId: 'purchase-1', sourceType: 'settlement', sourceRecordId: `source-${id}`,
      amountPaise, state, revision: 1, createdAt: '2026-10-02T00:00:00.000Z', createdByUserId: 'owner-1',
    })
    const allocations = [allocation('posted', 25_000, 'posted'), allocation('reserved', 20_000, 'reserved')]

    expect(invoiceBalanceV2(purchase, allocations)).toMatchObject({
      openAmountPaise: 75_000,
      reservedAmountPaise: 20_000,
      availableToAllocatePaise: 55_000,
    })
    expect(openInvoiceBalancesV2([purchase], allocations)).toHaveLength(1)
    expect(() => invoiceBalanceV2(purchase, [allocation('excess', 100_001, 'posted')])).toThrow(/exceed/)
  })

  it('builds separate invoice-linked settlements and caps them at current balances', () => {
    const purchase = buildPurchasePostingV2({
      id: 'purchase-1', vendorId: 'vendor-1', invoiceNumber: 'INV-1', invoiceDate: '2026-10-02',
      invoiceTotalPaise: 100_000, actorUserId: 'owner-1', timestamp: '2026-10-02T00:00:00.000Z',
    })
    const accountState = {
      id: 'vendor-1', vendorId: 'vendor-1', outstandingPaise: 100_000, revision: 1,
      lastLedgerEntryId: purchase.ledgerEntry.id, updatedAt: purchase.purchase.createdAt, updatedByUserId: 'owner-1',
    }
    const posting = buildSettlementPostingV2({
      id: 'settlement-1', vendorId: 'vendor-1', date: '2026-10-02', amountPaise: 40_000,
      mode: 'upi', invoiceId: 'purchase-1', actorUserId: 'owner-1', timestamp: '2026-10-02T01:00:00.000Z',
    }, accountState, purchase.invoiceState)

    expect(posting.ledgerEntry.signedAmountPaise).toBe(-40_000)
    expect(posting.nextAccountState.outstandingPaise).toBe(60_000)
    expect(posting.nextInvoiceState?.openAmountPaise).toBe(60_000)
    expect(posting.allocation?.state).toBe('posted')
    expect(() => buildSettlementPostingV2({
      id: 'settlement-2', vendorId: 'vendor-1', date: '2026-10-02', amountPaise: 100_001,
      mode: 'cash', actorUserId: 'owner-1', timestamp: '2026-10-02T01:00:00.000Z',
    }, accountState)).toThrow(/exceed/)
  })

  it('corrects settlements with compensating evidence and blocks stale requests', () => {
    const state = {
      id: 'settlement-1', vendorId: 'vendor-1', settlementId: 'settlement-1', date: '2026-10-02',
      amountPaise: 40_000, mode: 'upi' as const, invoiceId: 'purchase-1', notes: '', revision: 1,
      updatedAt: '2026-10-02T00:00:00.000Z', updatedByUserId: 'staff-1',
    }
    const request = {
      id: 'correction-1', kind: 'settlement-correction' as const, sourceRecordId: 'settlement-1', vendorId: 'vendor-1',
      sourceRevision: 1, before: { date: state.date, amountPaise: 40_000, mode: state.mode, invoiceId: 'purchase-1', notes: '' },
      proposed: { date: state.date, amountPaise: 30_000, mode: state.mode, invoiceId: 'purchase-1', notes: 'Corrected' },
      reason: 'Amount entered incorrectly', requestedByUserId: 'staff-1', requestedBy: 'Staff',
      requestType: 'staff-request' as const, status: 'pending' as const, createdAt: state.updatedAt,
    }
    const accountState = {
      id: 'vendor-1', vendorId: 'vendor-1', outstandingPaise: 60_000, revision: 2,
      lastLedgerEntryId: 'settlement:settlement-1:1:settlement', updatedAt: state.updatedAt, updatedByUserId: 'staff-1',
    }
    const invoiceState = {
      id: 'purchase-1', vendorId: 'vendor-1', invoiceId: 'purchase-1', openAmountPaise: 60_000,
      reservedAmountPaise: 0, revision: 2, lastAllocationId: 'settlement:settlement-1:purchase-1',
      updatedAt: state.updatedAt, updatedByUserId: 'staff-1',
    }
    const correction = buildSettlementCorrectionV2(request, state, accountState, invoiceState, 'owner-1', '2026-10-03T00:00:00.000Z')

    expect(correction.adjustmentPaise).toBe(10_000)
    expect(correction.ledgerEntry?.signedAmountPaise).toBe(10_000)
    expect(correction.allocationAdjustment?.state).toBe('reversed')
    expect(correction.nextAccountState?.outstandingPaise).toBe(70_000)
    expect(correction.nextInvoiceState?.openAmountPaise).toBe(70_000)
    expect(() => buildSettlementCorrectionV2({ ...request, sourceRevision: 2 }, state, accountState, invoiceState, 'owner-1', '2026-10-03T00:00:00.000Z')).toThrow(/stale/)
  })

  it('applies approved financial signs and rejects ambiguous event types', () => {
    expect(financialLedgerAmountPaise('purchase', 100_000)).toBe(100_000)
    expect(financialLedgerAmountPaise('opening-balance', 10_000)).toBe(10_000)
    expect(financialLedgerAmountPaise('vendor-credit', 20_000)).toBe(-20_000)
    expect(financialLedgerAmountPaise('settlement', 30_000)).toBe(-30_000)
    expect(financialLedgerAmountPaise('cheque-debit', 40_000)).toBe(-40_000)
    expect(() => financialLedgerAmountPaise('opening-adjustment', 1)).toThrow(/explicit signed/)
  })

  it('blocks stale revisions before a correction or transition', () => {
    expect(() => assertExpectedRevision(2, 2)).not.toThrow()
    expect(() => assertExpectedRevision(3, 2)).toThrow(/stale/)
  })

  it('requires audited non-zero opening adjustments', () => {
    expect(() => validateOpeningAdjustment(5_000, 'Verified opening correction')).not.toThrow()
    expect(() => validateOpeningAdjustment(-5_000, 'Verified opening correction')).not.toThrow()
    expect(() => validateOpeningAdjustment(0, 'Correction')).toThrow(/zero/)
    expect(() => validateOpeningAdjustment(5_000, ' ')).toThrow(/reason/)
  })

  it('caps custom payments and invoice allocations', () => {
    expect(() => validateCustomPayment(50_000, 50_000)).not.toThrow()
    expect(() => validateCustomPayment(50_001, 50_000)).toThrow(/exceed/)
    expect(() => validateCustomPayment(1, 0)).toThrow(/positive outstanding/)
    expect(() => validateInvoiceAllocation(25_000, 50_000)).not.toThrow()
    expect(() => validateInvoiceAllocation(50_001, 50_000)).toThrow(/invoice open/)
  })
})

describe('V2 cheque rules', () => {
  it('enforces the approved lifecycle and allocation release rules', () => {
    expect(() => assertChequeTransition('draft', 'issued')).not.toThrow()
    expect(() => assertChequeTransition('issued', 'presented')).not.toThrow()
    expect(() => assertChequeTransition('presented', 'debited')).not.toThrow()
    expect(() => assertChequeTransition('issued', 'debited')).toThrow(/cannot transition/)
    expect(releasesReservedAllocations('issued', 'cancelled')).toBe(true)
    expect(releasesReservedAllocations('presented', 'bounced')).toBe(true)
    expect(releasesReservedAllocations('presented', 'debited')).toBe(false)
  })

  it('reduces outstanding only for debited V2 vendor cheques', () => {
    expect(chequeVendorLedgerEffectPaise(cheque({ status: 'issued' }))).toBe(0)
    expect(chequeVendorLedgerEffectPaise(cheque({ status: 'presented' }))).toBe(0)
    expect(chequeVendorLedgerEffectPaise(cheque({ status: 'debited' }))).toBe(-100_000)
    expect(chequeVendorLedgerEffectPaise(cheque({ status: 'debited', purpose: 'expense' }))).toBe(0)
    expect(chequeVendorLedgerEffectPaise(cheque({ status: 'debited', origin: 'legacy-workbook', trackingOnly: true }))).toBe(0)
  })

  it('normalizes cheque numbers and restricts the active book to 1120-1199', () => {
    expect(normalizeChequeNumber('00 11-20')).toBe('1120')
    expect(activeChequeLeaf('1120')).toBe(true)
    expect(activeChequeLeaf('1199')).toBe(true)
    expect(activeChequeLeaf('1200')).toBe(false)
    expect(activeChequeLeaf('1119')).toBe(false)
  })

  it('maps verified legacy statuses without creating a financial rule', () => {
    expect(mapLegacyChequeStatus('Issued')).toBe('issued')
    expect(mapLegacyChequeStatus('In Process')).toBe('presented')
    expect(() => mapLegacyChequeStatus('Debited')).toThrow(/Unsupported/)
  })
})
