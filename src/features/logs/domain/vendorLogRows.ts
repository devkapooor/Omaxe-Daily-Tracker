import type { Cashout, Payment, Purchase } from '@/domain/financeTypes'

export type VendorLogRow = {
  id: string
  kind: 'purchase' | 'payment'
  date: string
  party: string
  reference: string
  amount: number | null
  paid: number | null
  open: number | null
  method: string
  category: string
  actor: string
  notes: string
  source: string
  chequeNumber?: string
}
type RecordData = Record<string, unknown>
const text = (value: unknown) => typeof value === 'string' ? value : ''
const paise = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) ? value / 100 : null

export function vendorPurchaseLogRow(id: string, source: RecordData, state: RecordData | null, party: string): VendorLogRow {
  return { id: 'purchasesV2/' + id, kind: 'purchase', date: text(source.invoiceDate), party,
    reference: text(source.invoiceNumber) || id, amount: paise(source.invoiceTotalPaise), paid: null,
    open: state && state.vendorId === source.vendorId && state.invoiceId === id ? paise(state.openAmountPaise) : null,
    method: 'Linked payments', category: text(source.category) || 'Not recorded', actor: text(source.createdByUserId), notes: text(source.notes), source: 'Vendor invoice' }
}
export function vendorPaymentLogRow(id: string, state: RecordData, source: RecordData | null, party: string): VendorLogRow {
  const methods: Record<string, string> = { cash: 'Cash', upi: 'UPI', card: 'Card', 'bank-transfer': 'Bank Transfer' }
  return { id: 'vendorSettlementsV2/' + id, kind: 'payment', date: text(state.date), party,
    reference: text(state.invoiceId) || id, amount: paise(state.amountPaise), paid: null, open: null,
    method: methods[text(state.mode)] || 'Not recorded', category: 'Vendor Payment', actor: text(source?.createdByUserId), notes: text(state.notes), source: source ? 'Vendor payment' : 'Vendor payment · original source unavailable' }
}
export function legacyPurchaseLogRow(entry: Purchase): VendorLogRow {
  return { id: 'purchases/' + entry.id, kind: 'purchase', date: entry.date, party: entry.supplierName, reference: entry.billNumber || entry.id,
    amount: entry.purchaseAmount, paid: entry.paidAmount, open: entry.unpaidAmount, method: entry.paymentMode, category: entry.category || 'Not recorded', actor: '', notes: entry.notes, source: 'Legacy purchase' }
}
export function legacyPaymentLogRow(entry: Payment): VendorLogRow {
  return { id: 'payments/' + entry.id, kind: 'payment', date: entry.date, party: entry.partyName, reference: entry.chequeNumber || entry.id,
    amount: entry.amount, paid: null, open: null, method: entry.paymentMode, category: entry.entryType || 'General', actor: '', notes: entry.notes, source: 'Legacy · ' + entry.type, chequeNumber: entry.chequeNumber }
}
export function vendorOutflowLogRow(entry: Cashout): VendorLogRow {
  const cheque = entry.paymentMode === 'Cheque' && entry.chequeNumber
  return { id: cheque ? 'chequesV2/' + entry.chequeNumber : 'vendorSettlementsV2/' + (entry.sourceRecordId || entry.id), kind: 'payment', date: entry.date,
    party: entry.paidTo, reference: entry.chequeNumber || entry.sourceRecordId || entry.id, amount: entry.amount, paid: null, open: null,
    method: entry.paymentMode, category: entry.category, actor: entry.postedByUid || entry.postedByName || '', notes: entry.notes, source: cheque ? 'Cheque debit' : 'Vendor payment', chequeNumber: entry.chequeNumber }
}
/** A settlement and its linked outflow are one payment; the canonical effective state wins. */
export function mergeVendorPaymentLogs(legacy: Payment[], outflows: Cashout[], canonical: VendorLogRow[]) {
  const rows = new Map<string, VendorLogRow>()
  for (const entry of legacy) if (entry.entryType !== 'loan-payment') { const row = legacyPaymentLogRow(entry); rows.set(row.id, row) }
  for (const entry of outflows) if (entry.sourceKind === 'vendor-payment') { const row = vendorOutflowLogRow(entry); rows.set(row.id, row) }
  for (const row of canonical) rows.set(row.id, row)
  return [...rows.values()]
}
