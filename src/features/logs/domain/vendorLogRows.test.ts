import { describe, expect, it } from 'vitest'
import type { Cashout, Payment, Purchase } from '@/domain/financeTypes'
import { legacyPurchaseLogRow, mergeVendorPaymentLogs, vendorPaymentLogRow, vendorPurchaseLogRow } from './vendorLogRows'

describe('vendor source log views', () => {
  it('shows invoice total/open separately without treating credit reductions as cash paid', () => {
    const row = vendorPurchaseLogRow('invoice', { invoiceDate: '2026-10-15', vendorId: 'vendor', invoiceNumber: 'A-1', invoiceTotalPaise: 100000 }, { vendorId: 'vendor', invoiceId: 'invoice', openAmountPaise: 2000 }, 'Synthetic vendor')
    expect(row).toMatchObject({ amount: 1000, open: 20, paid: null, reference: 'A-1', id: 'purchasesV2/invoice' })
  })
  it('does not invent balances from missing or mismatched invoice state', () => {
    const source = { vendorId: 'vendor', invoiceTotalPaise: 10000 }
    expect(vendorPurchaseLogRow('invoice', source, null, 'Vendor').open).toBeNull()
    expect(vendorPurchaseLogRow('invoice', source, { vendorId: 'another', invoiceId: 'invoice', openAmountPaise: 5000 }, 'Vendor').open).toBeNull()
  })
  it('uses current corrected payment date/amount/mode, retaining original actor evidence', () => {
    expect(vendorPaymentLogRow('payment', { date: '2026-10-16', amountPaise: 7500, mode: 'bank-transfer' }, { date: '2026-10-15', amountPaise: 10000, createdByUserId: 'actor' }, 'Vendor')).toMatchObject({ date: '2026-10-16', amount: 75, method: 'Bank Transfer', actor: 'actor' })
  })
  it('deduplicates settlement/outflow and includes a cheque debit once; ignores ordinary/refund outflows', () => {
    const outflows = [
      { id: 'projection', sourceKind: 'vendor-payment', sourceRecordId: 'payment', amount: 190, paymentMode: 'Cash', paidTo: 'Vendor' },
      { id: 'cheque', sourceKind: 'vendor-payment', sourceRecordId: '1124', chequeNumber: '1124', amount: 780, paymentMode: 'Cheque', paidTo: 'Vendor' },
      { id: 'expense', sourceKind: 'expense', amount: 50 }, { id: 'refund', sourceKind: 'pos-return', amount: 90 }
    ] as Cashout[]
    const canonical = vendorPaymentLogRow('payment', { amountPaise: 20000, mode: 'cash' }, { createdByUserId: 'actor' }, 'Vendor')
    const rows = mergeVendorPaymentLogs([], outflows, [canonical])
    expect(rows).toHaveLength(2)
    expect(rows.map(row => row.amount).sort((a, b) => a! - b!)).toEqual([200, 780])
    expect(rows.find(row => row.id === 'vendorSettlementsV2/payment')?.actor).toBe('actor')
  })
  it('preserves legacy recorded values without changing rupee scale', () => {
    const legacy = legacyPurchaseLogRow({ id: 'old', purchaseAmount: 500, paidAmount: 125, unpaidAmount: 375 } as Purchase)
    expect(legacy).toMatchObject({ id: 'purchases/old', amount: 500, paid: 125, open: 375 })
  })
  it('keeps loan mutations and loan-payment rows outside the vendor log view', () => {
    expect(mergeVendorPaymentLogs([{ id: 'loan', entryType: 'loan-payment' }] as Payment[], [], [])).toEqual([])
  })
})
