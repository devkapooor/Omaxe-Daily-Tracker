import type { AppUser } from '@/domain/financeTypes'

export const POS_SANDBOX_ID = 'test'
export const POS_EXPECTED_PRODUCT_COUNT = 6069
export const POS_EXPECTED_NEGATIVE_QUANTITY_COUNT = 379
export const POS_EXPECTED_ZERO_QUANTITY_COUNT = 3294

export type PosActor = Pick<AppUser, 'id' | 'name' | 'role'>
/** Bank Transfer remains here only to read legacy receipts; checkout offers Cash, UPI, and Card. */
export type PosPaymentMethod = 'cash' | 'upi' | 'card' | 'bank-transfer'
export type PosReturnCondition = 'sellable' | 'damaged'

export type PosProduct = {
  id: string
  barcode: string
  name: string
  searchName: string
  searchTokens?: string[]
  category: string
  brand: string
  vendor: string
  sellingPricePaise: number
  currentQuantity: number
  revision: number
  active: boolean
  sourceValues?: Record<string, string>
  importRunId?: string
  createdAt: string
  createdByUid: string
  createdByName: string
  updatedAt: string
  updatedByUid: string
  updatedByName: string
  lastMovementId?: string
}

export type PosProductCost = {
  productId: string
  costPaise: number | null
  sourceValue: string
  importRunId: string
  updatedAt: string
  updatedByUid: string
  updatedByName: string
}

export type PosGoodsReceiptLine = {
  productId: string
  barcode: string
  productName: string
  category: string
  quantity: number
  unitCostPaise: number
  /** Raw editable cost text, kept while the user is typing a decimal amount. */
  unitCostInput?: string
  sellingPriceInput?: string
  sellingPriceManuallyEdited?: boolean
  sellingPriceBeforePaise?: number | null
  mrpBeforePaise?: number | null
  lineTotalPaise: number
  newProduct?: true
  sellingPricePaise?: number
  stockAtScan?: number
  mrpPaise?: number | null
  mrpInput?: string
  mrpChanged?: boolean
}

export type PosGoodsReceipt = {
  id: string
  status: 'draft' | 'submitted' | 'reversed'
  vendorId: string
  vendorName: string
  invoiceNumber: string
  invoiceDate: string
  receiptDate: string
  lines: PosGoodsReceiptLine[]
  mrpCorrections?: Array<{
    reason: string
    createdAt: string
    actorUid: string
    actorName: string
    lines: Array<{ productId: string; barcode: string; productName: string; beforeMrpPaise: number | null; afterMrpPaise: number | null }>
  }>
  totalPaise: number
  /** Full vendor invoice payable; differs from value of stock physically received. */
  invoiceTotalPaise?: number
  payablePurchaseId?: string
  payableOwner?: boolean
  originatingGoodsReceiptId?: string
  linkedReceiptIds?: string[]
  reversalLedgerEntryId?: string
  revision: number
  createdAt: string
  createdByUid: string
  createdByName: string
  updatedAt: string
  updatedByUid: string
  updatedByName: string
}

export type PosStockAudit = {
  id: string
  batchId?: string
  productId: string
  barcode: string
  productName: string
  systemQuantityBefore: number
  physicalQuantity: number
  difference: number
  systemQuantityAfter: number
  productRevisionBefore: number
  productRevisionAfter: number
  movementId?: string
  createdAt: string
  actorUid: string
  actorName: string
  actorRole: AppUser['role']
  unitCostPaise?: number
  costSource?: 'grn' | 'manual' | 'audit-correction'
  valueImpactPaise?: number
}

export type PosStockAuditBatch = {
  id: string
  status: 'saving' | 'completed'
  note: string
  itemCount: number
  adjustedItemCount: number
  matchedItemCount: number
  increaseValuePaise: number
  decreaseValuePaise: number
  netValuePaise: number
  interrupted?: boolean
  createdAt: string
  completedAt?: string
  actorUid: string
  actorName: string
  actorRole: AppUser['role']
}

export type PosCartLine = {
  id: string
  kind: 'product' | 'temporary'
  productId?: string
  barcode: string
  description: string
  quantity: number
  unitPricePaise: number
  expectedProductRevision?: number
  stockAtScan?: number
}

export type PosPaymentAllocation = {
  method: PosPaymentMethod
  amountPaise: number
  reference?: string
}

export type PosDiscount = {
  mode: 'none' | 'percentage' | 'amount'
  percentage?: number
  amountPaise: number
  overrideReason?: string
}

export type PosBill = {
  id: string
  handoverDate?: string
  cashierAuthTime?: number
  receiptNumber: string
  financialYear: string
  sequenceNumber: number
  businessDate: string
  customerName?: string
  customerMobile?: string
  lines: PosCartLine[]
  subtotalPaise: number
  discount: PosDiscount
  totalPaise: number
  payments: PosPaymentAllocation[]
  cashTenderedPaise?: number
  cashChangePaise?: number
  status: 'finalized'
  testOnly: true
  createdAt: string
  createdByUid: string
  createdByName: string
  createdByRole: AppUser['role']
}

export type PosHeldCart = {
  id: string
  label: string
  lines: PosCartLine[]
  customerName?: string
  customerMobile?: string
  discount: PosDiscount
  revision: number
  createdAt: string
  createdByUid: string
  createdByName: string
  updatedAt: string
  updatedByUid: string
  updatedByName: string
}

export type PosApprovalRequest = {
  id: string
  type: 'void' | 'return'
  billId: string
  receiptNumber: string
  sourceBillCreatedAt: string
  sourceBillRevision: number
  reason: string
  returnCondition?: PosReturnCondition
  returnLines?: Array<{ lineId: string; quantity: number }>
  refundDate?: string
  refundAmountPaise?: number
  refundMethod?: PosPaymentMethod
  refundReference?: string
  status: 'pending' | 'approved' | 'rejected' | 'stale'
  requestedAt: string
  requestedByUid: string
  requestedByName: string
  reviewedAt?: string
  reviewedByUid?: string
  reviewedByName?: string
  reviewReason?: string
}

export type PosCheckoutConfig = {
  billingMaxDiscountPercentage: number | null
  updatedAt?: string
  updatedByUid?: string
  updatedByName?: string
}

export type PosImportRow = {
  productId: string
  barcode: string
  name: string
  category: string
  brand: string
  vendor: string
  sellingPricePaise: number
  openingQuantity: number
  costPaise: number | null
  sourceValues: Record<string, string>
}

export type PosImportValidation = {
  rowCount: number
  uniqueProductIds: number
  uniqueBarcodes: number
  negativeQuantityCount: number
  zeroQuantityCount: number
  errors: string[]
}

export type PosBillState = {
  billId: string
  state: 'active' | 'voided' | 'partially-returned'
  revision: number
  returnedQuantities?: Record<string, number>
}

export type PosRefundEvent = {
  id: string
  type: string
  billId?: string
  refundDate?: string | null
  refundAmountPaise?: number
  refundMethod?: PosPaymentMethod | null
}
