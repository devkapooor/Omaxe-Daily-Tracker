export type AmountPaise = number

export type VendorV2 = {
  id: string
  canonicalName: string
  aliases: string[]
  contact: string
  address: string
  suppliedBrands: string[]
  active: boolean
  openingBalancePaise: AmountPaise
  openingLedgerEntryId?: string
  revision: number
  createdAt: string
  createdByUserId: string
  updatedAt: string
  updatedByUserId: string
}

export type PurchaseV2 = {
  id: string
  vendorId: string
  invoiceNumber: string
  invoiceDate: string
  receiptDate?: string
  invoiceTotalPaise: AmountPaise
  category?: string
  notes: string
  revision: number
  createdAt: string
  createdByUserId: string
  updatedAt: string
  updatedByUserId: string
}

export type VendorSettlementMode = 'cash' | 'upi' | 'card' | 'bank-transfer'

export type VendorSettlementV2 = {
  id: string
  vendorId: string
  date: string
  amountPaise: AmountPaise
  mode: VendorSettlementMode
  invoiceId?: string
  notes: string
  revision: number
  createdAt: string
  createdByUserId: string
  updatedAt: string
  updatedByUserId: string
}

export type VendorReturnOutcome = 'pending' | 'vendor-credit' | 'replacement' | 'rejected'

export type VendorReturnV2 = {
  id: string
  vendorId: string
  sourcePurchaseId?: string
  date: string
  description: string
  quantity: number
  unit: string
  valuePaise: AmountPaise
  reason: string
  outcome: VendorReturnOutcome
  outcomeReason?: string
  replacementReceivedAt?: string
  revision: number
  createdAt: string
  createdByUserId: string
  updatedAt: string
  updatedByUserId: string
}

export type ChequePurpose = 'vendor-payment' | 'expense'
export type ChequeStatus = 'draft' | 'issued' | 'presented' | 'debited' | 'cancelled' | 'bounced'
export type ChequeOrigin = 'v2' | 'legacy-workbook' | 'legacy-expense'

export type ChequeBookV2 = {
  id: string
  bankAccountLabel: string
  startNumber: number
  endNumber: number
  active: boolean
  revision: number
  createdAt: string
  createdByUserId: string
  updatedAt: string
  updatedByUserId: string
}

export type ChequeV2 = {
  id: string
  chequeBookId?: string
  chequeNumber: string
  purpose: ChequePurpose
  sourceRecordId: string
  vendorId?: string
  date: string
  amountPaise: AmountPaise
  status: ChequeStatus
  origin: ChequeOrigin
  sourceStatus?: string
  trackingOnly: boolean
  revision: number
  createdAt: string
  createdByUserId: string
  updatedAt: string
  updatedByUserId: string
}

export type LedgerEventType =
  | 'opening-balance'
  | 'opening-adjustment'
  | 'purchase'
  | 'vendor-credit'
  | 'settlement'
  | 'cheque-debit'
  | 'reversal'
  | 'pending-cheque'

export type VendorLedgerEntryV2 = {
  id: string
  vendorId: string
  eventType: LedgerEventType
  posting: 'financial' | 'informational'
  signedAmountPaise: AmountPaise
  sourceType: 'vendor' | 'purchase' | 'return' | 'settlement' | 'cheque' | 'ledger-entry'
  sourceRecordId: string
  sourceRevision: number
  reversalOfEntryId?: string
  reason?: string
  occurredOn: string
  createdAt: string
  createdByUserId: string
}

export type InvoiceAllocationV2 = {
  id: string
  vendorId: string
  invoiceId: string
  sourceType: 'settlement' | 'cheque'
  sourceRecordId: string
  amountPaise: AmountPaise
  state: 'reserved' | 'posted' | 'released' | 'reversed'
  revision: number
  createdAt: string
  createdByUserId: string
}

const businessDatePattern = /^\d{4}-\d{2}-\d{2}$/

function assertIntegerPaise(value: number, label: string) {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be a safe integer amount in paise.`)
}

export function rupeesToPaise(rupees: number): AmountPaise {
  if (!Number.isFinite(rupees)) throw new Error('Rupee amount must be finite.')
  const paise = Math.round((rupees + Number.EPSILON) * 100)
  assertIntegerPaise(paise, 'Converted amount')
  return paise
}

export function paiseToRupees(paise: AmountPaise) {
  assertIntegerPaise(paise, 'Paise amount')
  return paise / 100
}

export function normalizeChequeNumber(value: string | number) {
  const raw = String(value).trim().replace(/[\s-]/g, '')
  if (!/^\d+$/.test(raw)) throw new Error('Cheque number must contain digits only.')
  const normalized = raw.replace(/^0+(?=\d)/, '')
  if (normalized === '0') throw new Error('Cheque number must be greater than zero.')
  return normalized
}

export function deterministicEventId(
  sourceType: VendorLedgerEntryV2['sourceType'],
  sourceRecordId: string,
  sourceRevision: number,
  eventType: LedgerEventType,
) {
  if (!sourceRecordId.trim()) throw new Error('Source record ID is required.')
  if (!Number.isSafeInteger(sourceRevision) || sourceRevision < 1) throw new Error('Source revision must be a positive integer.')
  return [sourceType, sourceRecordId.trim(), sourceRevision, eventType]
    .map((part) => encodeURIComponent(String(part)))
    .join(':')
}

export function invoiceReservationId(vendorId: string, invoiceNumber: string) {
  const normalizedInvoice = invoiceNumber.trim().toLocaleUpperCase('en-IN')
  if (!vendorId.trim() || !normalizedInvoice) throw new Error('Vendor and invoice number are required.')
  return `${encodeURIComponent(vendorId.trim())}:${encodeURIComponent(normalizedInvoice)}`
}

export function isV2BusinessDate(date: string, activationDate: string) {
  if (!businessDatePattern.test(date) || !businessDatePattern.test(activationDate)) {
    throw new Error('Business dates must use YYYY-MM-DD.')
  }
  return date >= activationDate
}

export function vendorOutstandingPaise(entries: VendorLedgerEntryV2[]) {
  return entries.reduce((total, entry) => {
    assertIntegerPaise(entry.signedAmountPaise, 'Ledger amount')
    return entry.posting === 'financial' ? total + entry.signedAmountPaise : total
  }, 0)
}

export function financialLedgerAmountPaise(eventType: LedgerEventType, amountPaise: AmountPaise) {
  assertIntegerPaise(amountPaise, 'Ledger source amount')
  if (amountPaise <= 0) throw new Error('Ledger source amount must be greater than zero.')
  if (eventType === 'opening-balance' || eventType === 'purchase') return amountPaise
  if (eventType === 'vendor-credit' || eventType === 'settlement' || eventType === 'cheque-debit') return -amountPaise
  throw new Error(`${eventType} requires an explicit signed adjustment or informational entry.`)
}

export function assertExpectedRevision(currentRevision: number, expectedRevision: number) {
  if (!Number.isSafeInteger(currentRevision) || currentRevision < 1 || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
    throw new Error('Revisions must be positive integers.')
  }
  if (currentRevision !== expectedRevision) throw new Error('The source revision is stale.')
}

export function validateOpeningAdjustment(amountPaise: AmountPaise, reason: string) {
  assertIntegerPaise(amountPaise, 'Opening adjustment')
  if (amountPaise === 0) throw new Error('Opening adjustment cannot be zero.')
  if (!reason.trim()) throw new Error('Opening adjustment reason is required.')
}

export function validateCustomPayment(amountPaise: AmountPaise, outstandingPaise: AmountPaise) {
  assertIntegerPaise(amountPaise, 'Payment')
  assertIntegerPaise(outstandingPaise, 'Outstanding')
  if (amountPaise <= 0) throw new Error('Payment must be greater than zero.')
  if (outstandingPaise <= 0) throw new Error('Vendor has no positive outstanding balance.')
  if (amountPaise > outstandingPaise) throw new Error('Payment cannot exceed vendor outstanding.')
}

export function validateInvoiceAllocation(amountPaise: AmountPaise, invoiceOpenPaise: AmountPaise) {
  assertIntegerPaise(amountPaise, 'Allocation')
  assertIntegerPaise(invoiceOpenPaise, 'Invoice open amount')
  if (amountPaise <= 0) throw new Error('Allocation must be greater than zero.')
  if (amountPaise > invoiceOpenPaise) throw new Error('Allocation cannot exceed the invoice open amount.')
}

const chequeTransitions: Record<ChequeStatus, ChequeStatus[]> = {
  draft: ['issued'],
  issued: ['presented', 'cancelled'],
  presented: ['debited', 'cancelled', 'bounced'],
  debited: [],
  cancelled: [],
  bounced: [],
}

export function canTransitionCheque(from: ChequeStatus, to: ChequeStatus) {
  return chequeTransitions[from].includes(to)
}

export function assertChequeTransition(from: ChequeStatus, to: ChequeStatus) {
  if (!canTransitionCheque(from, to)) throw new Error(`Cheque cannot transition from ${from} to ${to}.`)
}

export function releasesReservedAllocations(from: ChequeStatus, to: ChequeStatus) {
  return (from === 'issued' || from === 'presented') && (to === 'cancelled' || to === 'bounced')
}

export function chequeVendorLedgerEffectPaise(cheque: Pick<ChequeV2, 'amountPaise' | 'origin' | 'purpose' | 'status' | 'trackingOnly'>) {
  assertIntegerPaise(cheque.amountPaise, 'Cheque amount')
  if (cheque.trackingOnly || cheque.origin !== 'v2' || cheque.purpose !== 'vendor-payment') return 0
  return cheque.status === 'debited' ? -cheque.amountPaise : 0
}

export function activeChequeLeaf(number: string | number, startNumber = 1120, endNumber = 1199) {
  const normalized = normalizeChequeNumber(number)
  const numeric = Number(normalized)
  return Number.isSafeInteger(numeric) && numeric >= startNumber && numeric <= endNumber
}

export function mapLegacyChequeStatus(status: string): ChequeStatus {
  const normalized = status.trim().toLocaleLowerCase('en-IN')
  if (normalized === 'issued') return 'issued'
  if (normalized === 'in process') return 'presented'
  throw new Error(`Unsupported legacy open cheque status: ${status}`)
}
