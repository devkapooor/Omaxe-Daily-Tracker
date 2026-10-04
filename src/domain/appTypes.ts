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
  updatedAt?: string
  updatedByUserId?: string
}

export type Page = 'dashboard' | 'actions' | 'pos-test' | 'vendor-preview' | 'directory' | 'expense' | 'cashout' | 'movement' | 'payroll' | 'logs' | 'settings'

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
  cashAudit: number
  cashExpense?: number
  drawerDenominations?: DrawerDenominations
  drawerTotal?: number
  auditDifference?: number
  auditStatus?: 'matched' | 'cash-less' | 'cash-more'
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

export type VendorRecord = {
  id: string
  name: string
  ownerName: string
  contact: string
  address: string
  companiesProvided: string
  notes: string
  openingOutstanding: number
  openingOutstandingRemaining: number
  createdAt: string
  updatedAt: string
}

export type NameDirectory = {
  people: string[]
  vendors: string[]
}
