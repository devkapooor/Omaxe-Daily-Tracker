export type PaymentMode = 'Cash' | 'UPI' | 'Card' | 'Bank Transfer' | 'Cheque' | 'Credit'

export type Store = {
  id: string
  name: string
  location: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export type DailySales = {
  id: string
  storeId: string
  date: string
  totalSales: number
  cashSales: number
  upiSales: number
  cardSales: number
  bankTransferSales: number
  creditSales: number
  returnsDiscounts: number
  refundAccountingVersion?: 1
  netSalesAmount?: number
  notes: string
  createdAt: string
  updatedAt: string
}

export type Purchase = {
  id: string
  storeId: string
  date: string
  supplierName: string
  billNumber: string
  purchaseAmount: number
  paidAmount: number
  unpaidAmount: number
  paymentMode: PaymentMode
  category: string
  notes: string
  createdAt: string
  updatedAt: string
}

export type Cashout = {
  id: string
  storeId: string
  date: string
  paidTo: string
  amount: number
  category: string
  paymentMode: Exclude<PaymentMode, 'Credit'>
  chequeNumber?: string
  chequePayDate?: string
  approvedBy: string
  sourceKind?: 'pos-return' | 'expense' | 'vendor-payment'
  sourceRecordId?: string
  fundingSource?: 'counter' | 'bank' | 'cheque'
  fundingVersion?: 1
  paymentStatus?: string
  reviewStatus?: string
  revision?: number
  reviewedAt?: string
  reviewedByUid?: string
  amountPaise?: number
  billId?: string
  approvalId?: string
  eventId?: string
  postedByUid?: string
  postedByName?: string
  postedByRole?: AppUser['role']
  notes: string
  createdAt: string
  updatedAt: string
}

export type Payment = {
  id: string
  storeId: string
  date: string
  type: 'Received' | 'Paid'
  entryType?: 'vendor-payment' | 'loan-payment'
  /** Explicit target for new loan repayments; absent on historical FIFO records. */
  loanId?: string
  partyName: string
  amount: number
  paymentMode: Exclude<PaymentMode, 'Credit'>
  chequeNumber?: string
  chequePayDate?: string
  notes: string
  createdAt: string
  updatedAt: string
}

export type FinanceData = {
  stores: Store[]
  sales: DailySales[]
  purchases: Purchase[]
  cashouts: Cashout[]
  payments: Payment[]
}

export type SalesDraft = Omit<DailySales, 'id' | 'createdAt' | 'updatedAt'>
export type PurchaseDraft = Omit<Purchase, 'id' | 'createdAt' | 'updatedAt'>
export type CashoutDraft = Omit<Cashout, 'id' | 'createdAt' | 'updatedAt'>
export type PaymentDraft = Omit<Payment, 'id' | 'createdAt' | 'updatedAt'>

export type UserRole = 'owner' | 'manager' | 'billing'

export type AppUser = {
  id: string
  name: string
  role: UserRole
  storeId?: string
}
