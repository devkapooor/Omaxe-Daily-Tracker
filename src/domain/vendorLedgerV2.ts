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
  normalizedInvoiceNumber: string
  invoiceDate: string
  receiptDate?: string
  invoiceTotalPaise: AmountPaise
  invoiceReservationId: string
  ledgerEntryId: string
  category?: string
  notes: string
  revision: number
  createdAt: string
  createdByUserId: string
  updatedAt: string
  updatedByUserId: string
}

export type InvoiceReservationV2 = {
  id: string
  vendorId: string
  normalizedInvoiceNumber: string
  purchaseId: string
  createdAt: string
  createdByUserId: string
}

export type VendorSettlementMode = 'cash' | 'upi' | 'card' | 'bank-transfer'

export type VendorSettlementV2 = {
  id: string
  vendorId: string
  date: string
  amountPaise: AmountPaise
  mode: VendorSettlementMode
  invoiceId?: string
  ledgerEntryId: string
  allocationId?: string
  notes: string
  revision: number
  createdAt: string
  createdByUserId: string
  updatedAt: string
  updatedByUserId: string
}

export type VendorAccountStateV2 = {
  id: string
  vendorId: string
  outstandingPaise: AmountPaise
  revision: number
  lastLedgerEntryId: string
  updatedAt: string
  updatedByUserId: string
}

export type InvoiceStateV2 = {
  id: string
  vendorId: string
  invoiceId: string
  openAmountPaise: AmountPaise
  reservedAmountPaise: AmountPaise
  revision: number
  lastAllocationId?: string
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

export type InvoiceBalanceV2 = {
  purchase: PurchaseV2
  openAmountPaise: AmountPaise
  reservedAmountPaise: AmountPaise
  availableToAllocatePaise: AmountPaise
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
  const normalizedInvoice = normalizeInvoiceNumber(invoiceNumber)
  if (!vendorId.trim() || !normalizedInvoice) throw new Error('Vendor and invoice number are required.')
  return `${encodeURIComponent(vendorId.trim())}:${encodeURIComponent(normalizedInvoice)}`
}

export function normalizeInvoiceNumber(invoiceNumber: string) {
  return invoiceNumber.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleUpperCase('en-IN')
}

export type CreatePurchaseV2Input = {
  id: string
  vendorId: string
  invoiceNumber: string
  invoiceDate: string
  receiptDate?: string
  invoiceTotalPaise: AmountPaise
  category?: string
  notes?: string
  actorUserId: string
  timestamp: string
}

export function buildPurchasePostingV2(input: CreatePurchaseV2Input) {
  const id = input.id.trim()
  const vendorId = input.vendorId.trim()
  const invoiceNumber = input.invoiceNumber.trim()
  const actorUserId = input.actorUserId.trim()
  if (!id || !vendorId || !invoiceNumber || !actorUserId) throw new Error('Purchase ID, vendor, invoice number, and actor are required.')
  assertIntegerPaise(input.invoiceTotalPaise, 'Invoice total')
  if (input.invoiceTotalPaise <= 0) throw new Error('Invoice total must be greater than zero.')
  if (!businessDatePattern.test(input.invoiceDate)) throw new Error('Invoice date must use YYYY-MM-DD.')
  if (input.receiptDate && !businessDatePattern.test(input.receiptDate)) throw new Error('Receipt date must use YYYY-MM-DD.')

  const reservationId = invoiceReservationId(vendorId, invoiceNumber)
  const normalizedInvoiceNumber = normalizeInvoiceNumber(invoiceNumber)
  const ledgerEntryId = deterministicEventId('purchase', id, 1, 'purchase')
  const purchase: PurchaseV2 = {
    id,
    vendorId,
    invoiceNumber,
    normalizedInvoiceNumber,
    invoiceDate: input.invoiceDate,
    ...(input.receiptDate ? { receiptDate: input.receiptDate } : {}),
    invoiceTotalPaise: input.invoiceTotalPaise,
    invoiceReservationId: reservationId,
    ledgerEntryId,
    ...(input.category?.trim() ? { category: input.category.trim() } : {}),
    notes: input.notes?.trim() ?? '',
    revision: 1,
    createdAt: input.timestamp,
    createdByUserId: actorUserId,
    updatedAt: input.timestamp,
    updatedByUserId: actorUserId,
  }
  const reservation: InvoiceReservationV2 = {
    id: reservationId,
    vendorId,
    normalizedInvoiceNumber,
    purchaseId: id,
    createdAt: input.timestamp,
    createdByUserId: actorUserId,
  }
  const ledgerEntry: VendorLedgerEntryV2 = {
    id: ledgerEntryId,
    vendorId,
    eventType: 'purchase',
    posting: 'financial',
    signedAmountPaise: financialLedgerAmountPaise('purchase', input.invoiceTotalPaise),
    sourceType: 'purchase',
    sourceRecordId: id,
    sourceRevision: 1,
    occurredOn: input.invoiceDate,
    createdAt: input.timestamp,
    createdByUserId: actorUserId,
  }
  const invoiceState: InvoiceStateV2 = {
    id,
    vendorId,
    invoiceId: id,
    openAmountPaise: input.invoiceTotalPaise,
    reservedAmountPaise: 0,
    revision: 1,
    updatedAt: input.timestamp,
    updatedByUserId: actorUserId,
  }
  return { invoiceState, ledgerEntry, purchase, reservation }
}

export type CreateSettlementV2Input = {
  id: string
  vendorId: string
  date: string
  amountPaise: AmountPaise
  mode: VendorSettlementMode
  invoiceId?: string
  notes?: string
  actorUserId: string
  timestamp: string
}

export function buildSettlementPostingV2(
  input: CreateSettlementV2Input,
  accountState: VendorAccountStateV2,
  invoiceState?: InvoiceStateV2,
) {
  const id = input.id.trim()
  const vendorId = input.vendorId.trim()
  const actorUserId = input.actorUserId.trim()
  if (!id || !vendorId || !actorUserId) throw new Error('Settlement ID, vendor, and actor are required.')
  if (!businessDatePattern.test(input.date)) throw new Error('Settlement date must use YYYY-MM-DD.')
  if (accountState.vendorId !== vendorId) throw new Error('Vendor account state does not match the settlement vendor.')
  validateCustomPayment(input.amountPaise, accountState.outstandingPaise)
  if (input.invoiceId) {
    if (!invoiceState || invoiceState.invoiceId !== input.invoiceId || invoiceState.vendorId !== vendorId) {
      throw new Error('Invoice state does not match the selected vendor invoice.')
    }
    validateInvoiceAllocation(input.amountPaise, invoiceState.openAmountPaise - invoiceState.reservedAmountPaise)
  }

  const ledgerEntryId = deterministicEventId('settlement', id, 1, 'settlement')
  const allocationId = input.invoiceId ? deterministicAllocationId('settlement', id, input.invoiceId) : undefined
  const settlement: VendorSettlementV2 = {
    id,
    vendorId,
    date: input.date,
    amountPaise: input.amountPaise,
    mode: input.mode,
    ...(input.invoiceId ? { invoiceId: input.invoiceId } : {}),
    ledgerEntryId,
    ...(allocationId ? { allocationId } : {}),
    notes: input.notes?.trim() ?? '',
    revision: 1,
    createdAt: input.timestamp,
    createdByUserId: actorUserId,
    updatedAt: input.timestamp,
    updatedByUserId: actorUserId,
  }
  const ledgerEntry: VendorLedgerEntryV2 = {
    id: ledgerEntryId,
    vendorId,
    eventType: 'settlement',
    posting: 'financial',
    signedAmountPaise: financialLedgerAmountPaise('settlement', input.amountPaise),
    sourceType: 'settlement',
    sourceRecordId: id,
    sourceRevision: 1,
    occurredOn: input.date,
    createdAt: input.timestamp,
    createdByUserId: actorUserId,
  }
  const nextAccountState: VendorAccountStateV2 = {
    ...accountState,
    outstandingPaise: accountState.outstandingPaise - input.amountPaise,
    revision: accountState.revision + 1,
    lastLedgerEntryId: ledgerEntryId,
    updatedAt: input.timestamp,
    updatedByUserId: actorUserId,
  }
  const allocation: InvoiceAllocationV2 | undefined = input.invoiceId && allocationId ? {
    id: allocationId,
    vendorId,
    invoiceId: input.invoiceId,
    sourceType: 'settlement',
    sourceRecordId: id,
    amountPaise: input.amountPaise,
    state: 'posted',
    revision: 1,
    createdAt: input.timestamp,
    createdByUserId: actorUserId,
  } : undefined
  const nextInvoiceState = allocation && invoiceState ? {
    ...invoiceState,
    openAmountPaise: invoiceState.openAmountPaise - input.amountPaise,
    revision: invoiceState.revision + 1,
    lastAllocationId: allocation.id,
    updatedAt: input.timestamp,
    updatedByUserId: actorUserId,
  } : undefined
  return { allocation, ledgerEntry, nextAccountState, nextInvoiceState, settlement }
}

export function deterministicAllocationId(sourceType: InvoiceAllocationV2['sourceType'], sourceRecordId: string, invoiceId: string) {
  if (!sourceRecordId.trim() || !invoiceId.trim()) throw new Error('Allocation source and invoice IDs are required.')
  return [sourceType, sourceRecordId.trim(), invoiceId.trim()].map((part) => encodeURIComponent(part)).join(':')
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

export function invoiceBalanceV2(purchase: PurchaseV2, allocations: InvoiceAllocationV2[]): InvoiceBalanceV2 {
  const matchingAllocations = allocations.filter((allocation) => allocation.invoiceId === purchase.id)
  const postedAmountPaise = matchingAllocations
    .filter((allocation) => allocation.state === 'posted')
    .reduce((total, allocation) => total + allocation.amountPaise, 0)
  const reservedAmountPaise = matchingAllocations
    .filter((allocation) => allocation.state === 'reserved')
    .reduce((total, allocation) => total + allocation.amountPaise, 0)
  assertIntegerPaise(postedAmountPaise, 'Posted invoice allocation')
  assertIntegerPaise(reservedAmountPaise, 'Reserved invoice allocation')
  const openAmountPaise = purchase.invoiceTotalPaise - postedAmountPaise
  const availableToAllocatePaise = openAmountPaise - reservedAmountPaise
  if (openAmountPaise < 0 || availableToAllocatePaise < 0) {
    throw new Error('Invoice allocations exceed the immutable invoice total.')
  }
  return { purchase, openAmountPaise, reservedAmountPaise, availableToAllocatePaise }
}

export function openInvoiceBalancesV2(purchases: PurchaseV2[], allocations: InvoiceAllocationV2[]) {
  return purchases
    .map((purchase) => invoiceBalanceV2(purchase, allocations))
    .filter((balance) => balance.openAmountPaise > 0)
    .sort((left, right) => left.purchase.invoiceDate.localeCompare(right.purchase.invoiceDate))
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
