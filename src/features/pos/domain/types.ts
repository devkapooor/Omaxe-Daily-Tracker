import type { AppUser } from '@/domain/financeTypes'

export const POS_SANDBOX_ID = 'test'
export const POS_EXPECTED_PRODUCT_COUNT = 6069
export const POS_EXPECTED_NEGATIVE_QUANTITY_COUNT = 379
export const POS_EXPECTED_ZERO_QUANTITY_COUNT = 3294

export type PosActor = Pick<AppUser, 'id' | 'name' | 'role'>
export type PosPaymentMethod = 'cash' | 'upi' | 'card' | 'bank-transfer'
export type PosReturnCondition = 'sellable' | 'damaged'

export type PosProduct = {
  id: string
  barcode: string
  name: string
  searchName: string
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
