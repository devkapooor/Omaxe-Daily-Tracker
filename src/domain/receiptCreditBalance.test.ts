import { describe, expect, it } from 'vitest'
import { invoiceBalanceV2, type InvoiceAllocationV2, type PurchaseV2 } from './vendorLedgerV2'

describe('invoice display after a late shortage credit', () => {
  const purchase: PurchaseV2 = {
    id: 'invoice', vendorId: 'vendor', invoiceNumber: 'I1', normalizedInvoiceNumber: 'I1', invoiceDate: '2026-10-29',
    invoiceTotalPaise: 16000, invoiceReservationId: 'reservation', ledgerEntryId: 'entry', notes: '', revision: 2,
    createdAt: '2026-10-29T09:00:00Z', updatedAt: '2026-10-29T09:00:00Z', createdByUserId: 'owner', updatedByUserId: 'owner',
    pricingMode: 'received-stock', originalInvoiceTotalPaise: 20000,
    shortage: { state: 'received', originalInvoiceTotalPaise: 20000, expectedCreditPaise: 4000, creditNoteNumber: 'CN1' },
  }
  const allocation: InvoiceAllocationV2 = { id: 'allocation', vendorId: 'vendor', invoiceId: 'invoice', sourceType: 'settlement', sourceRecordId: 'payment', amountPaise: 18000, state: 'posted', revision: 1, createdAt: '2026-10-29T09:00:00Z', createdByUserId: 'owner' }
  it('shows a settled invoice after paid excess becomes vendor credit without erasing payment evidence', () => {
    const before = JSON.stringify(allocation)
    expect(invoiceBalanceV2(purchase, [allocation]).openAmountPaise).toBe(0)
    expect(JSON.stringify(allocation)).toBe(before)
  })
  it('does not hide an ordinary overallocated invoice or an unproved credit', () => {
    expect(() => invoiceBalanceV2({ ...purchase, shortage: null }, [allocation])).toThrow()
    expect(() => invoiceBalanceV2({ ...purchase, shortage: { ...purchase.shortage!, expectedCreditPaise: 1 } }, [allocation])).toThrow()
  })
})
