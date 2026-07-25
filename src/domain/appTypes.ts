import type { AppUser } from './financeTypes'

export type UserAccount = AppUser & {
  email: string
  mobileNumber?: string
  approvalStatus?: 'pending' | 'approved' | 'rejected'
  createdAt: string
  disabled?: boolean
}

export type Page = 'dashboard' | 'directory' | 'expense' | 'cashout' | 'movement' | 'planner' | 'logs' | 'settings'

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
  cashSales: number
  returns: number
  creditSales: number
  cashAudit: number
  drawerTotal?: number
  auditDifference?: number
  auditStatus?: 'matched' | 'cash-less' | 'cash-more'
  auditMessage?: string
  actualCashParticulars: string
  pendingCashParticulars: string
  remainingBalance: number
  createdAt: string
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
