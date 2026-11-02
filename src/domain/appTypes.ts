import type { AppUser } from './financeTypes'

export type PurchasingCapability =
  | 'vendor.manage'
  | 'purchase.create'
  | 'purchase.correct'
  | 'settlement.create'
  | 'settlement.correct'
  | 'return.create'
  | 'return.resolve'
  | 'cheque.prepare'
  | 'cheque.issue'
  | 'cheque.present'
  | 'cheque.debit'
  | 'cheque.cancel'
  | 'vendorLedger.view'
  | 'migration.execute'

export type PurchasingCapabilities = Partial<Record<PurchasingCapability, boolean>>

export type UserAccount = AppUser & {
  email: string
  mobileNumber?: string
  approvalStatus?: 'pending' | 'approved' | 'rejected'
  createdAt: string
  disabled?: boolean
  purchasingCapabilities?: PurchasingCapabilities
}

export type VendorLedgerV2Config = {
  enabled: boolean
  activationDate?: string
  balanceCutoverId?: string
  balanceCutoverDate?: string
  balanceCutoverAt?: string
  balanceCutoverByUserId?: string
  balanceCutoverReason?: string
  balanceCutoverCounts?: { vendors: number; invoices: number; settlements?: number; pendingCheques: number; pendingReturns: number; pendingCorrections?: number }
  updatedAt?: string
  updatedByUserId?: string
}

export type Page = 'dashboard' | 'actions' | 'pos-test' | 'stock' | 'vendor-preview' | 'directory' | 'expense' | 'loans' | 'cashout' | 'movement' | 'logs' | 'settings'

export type ScheduledNotification = {
  id: string
  title: string
  message: string
  triggerTime: string
  targetRoles: Array<'manager' | 'billing'>
  enabled: boolean
}

export type LoanStatus = 'Open' | 'Settled'

export type LoanEntry = {
  id: string
  personName: string
  amount: number
  notes?: string
  paidAmount: number
  remainingAmount: number
  status: LoanStatus
  date: string
  promisedPayoffDate: string
  settledAt?: string
  createdAt: string
  updatedAt?: string
}

export type DailyCashoutEntry = {
  historicalCashTiming?: 'already-removed' | 'remove-now'
  drawerDebitReversalOperationId?: string
  drawerDebitReversalRestoredPaise?: number
  drawerDebitReversalAt?: string
  drawerDebitReversalReason?: string
  /** Dated owner reconciliation; does not change the physical count or drawer. */
  historicalExpenseReconciliationId?: string
  historicalExpenseReconciliationRevision?: number
  financeQuoteId?: string
  financePostingVersion?: 1
  historicalCountOnlyVersion?: 1
  discrepancyReason?: string
  reviewStatus?: string
  sourceTotals?: Record<string, unknown>
  bankTransferSales?: number
  id: string
  date: string
  recordedBy: string
  recordedByUserId?: string
  recordedByHolder?: LegacyCashHolder
  upiSales: number
  /** Optional for backwards compatibility; absent on historical cashouts. */
  cardSales?: number
  cashSales: number
  returns: number
  creditSales: number
  cashAudit: number | null
  cashExpense?: number
  refundAccountingVersion?: 1
  posCashRefundPaise?: number
  posRefundDayRevision?: number
  posRefundDayTotalPaise?: number
  posSourceHandoverRevision?: number
  posRefundQuoteId?: string
  drawerDenominations?: DrawerDenominations
  drawerTotal?: number
  /** Immutable POS drawer closure created with this cashout. */
  drawerClosureId?: string
  cashRemovedPaise?: number
  closingDrawerPaise?: number
  /** Applied once to the running virtual drawer; historical reporting totals remain unchanged. */
  drawerDebitPaise?: number
  drawerBalanceBeforePaise?: number
  drawerBalanceAfterPaise?: number
  drawerDebitAt?: string
  drawerDebitByUid?: string
  drawerDebitOperationId?: string
  drawerDebitReason?: string
  /** Snapshot of every active staff member's derived cash balance at this close. */
  holderBalancesAtClose?: Array<{ userId: string; name: string; amountPaise: number }>
  holderBalancesRevision?: number
  auditDifference?: number
  auditStatus?: 'matched' | 'cash-less' | 'cash-more' | 'not-reconciled'
  auditMessage?: string
  actualCashParticulars: string
  pendingCashParticulars: string
  remainingBalance: number
  createdAt: string
  updatedAt?: string
  updatedBy?: string
  revision?: number
}

export type DrawerDenominations = {
  denom500: number
  denom200: number
  denom100: number
  denom50: number
  denom20: number
  denom10: number
  change: number
}

export type CashoutCorrectionValues = {
  cashSales: number
  upiSales: number
  /** Optional on historical correction requests created before Card was tracked. */
  cardSales?: number
  creditSales: number
  returns: number
  cashExpense: number
  cashAudit: number
  drawerDenominations: DrawerDenominations
}

export type CashoutCorrectionRequest = {
  id: string
  cashoutId: string
  cashoutDate: string
  recordedBy: string
  recordedByUserId?: string
  sourceRevision: number
  before: CashoutCorrectionValues
  proposed: CashoutCorrectionValues
  reason: string
  requestedByUserId: string
  requestedBy: string
  requestType: 'staff-request' | 'owner-edit'
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn'
  createdAt: string
  reviewedAt?: string
  reviewedByUserId?: string
  reviewedBy?: string
  reviewReason?: string
}

export type LegacyCashHolder = 'Dev' | 'Arsh' | 'Farhan'

export type CashTransfer = {
  id: string
  date: string
  from?: LegacyCashHolder
  fromUserId?: string
  toType: 'person' | 'bank'
  toPerson?: LegacyCashHolder
  toUserId?: string
  bankDepositMethod?: 'bank' | 'cdm'
  amount: number
  reason: string
  createdBy: string
  recordType?: 'bank-transfer' | 'cash-movement'
  createdAt: string
}

export type PlannedPayment = {
  id: string
  title: string
  date: string
  amount: number
  notes: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type SettingsAuditEntry = {
  id: string
  action: string
  actor: string
  createdAt: string
}

export type MonthlyReportMeta = {
  id: string
  month: string
  marginPercentage: number
  createdAt: string
  updatedAt: string
  updatedBy: string
}

/** Minimal vendor identity used by shared finance summaries; balances stay in V2 ledger state. */
export type VendorIdentitySummary = { id: string; name: string }

export type NameDirectory = {
  people: string[]
}
