import type { AppUser } from './financeTypes'

export type UserAccount = AppUser & {
  email: string
  mobileNumber?: string
  approvalStatus?: 'pending' | 'approved' | 'rejected'
  createdAt: string
  disabled?: boolean
}

export type Page = 'dashboard' | 'expense' | 'cashout' | 'purchase' | 'vendors' | 'loans' | 'movement' | 'settings'

export type LoanEntry = {
  id: string
  personName: string
  amount: number
  date: string
  promisedPayoffDate: string
  createdAt: string
}

export type DailyCashoutEntry = {
  id: string
  date: string
  recordedBy: string
  recordedByHolder?: CashHolder
  upiSales: number
  cashSales: number
  returns: number
  creditSales: number
  cashAudit: number
  actualCashParticulars: string
  pendingCashParticulars: string
  pendingCashBalances?: {
    dev: number
    arsh: number
    farhan: number
  }
  remainingBalance: number
  createdAt: string
}

export type CashHolder = 'Dev' | 'Arsh' | 'Farhan'

export type CashTransfer = {
  id: string
  date: string
  from: CashHolder
  toType: 'person' | 'bank'
  toPerson?: CashHolder
  amount: number
  reason: string
  createdBy: string
  createdAt: string
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
  createdAt: string
  updatedAt: string
}

export type NameDirectory = {
  people: string[]
  vendors: string[]
}
