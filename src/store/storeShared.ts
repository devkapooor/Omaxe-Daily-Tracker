import type { DocumentData } from 'firebase/firestore'
import type { Dispatch, SetStateAction } from 'react'
import { seedData } from './seedData'
import { normalizeName } from '@/shared/lib/nameUtils'
export { normalizeName, uniqNames } from '@/shared/lib/nameUtils'
import type {
  FinanceData,
  Store,
} from '../domain/financeTypes'
import type {
  CashTransfer,
  CashoutCorrectionRequest,
  DailyCashoutEntry,
  LoanStatus,
  LoanEntry,
  MonthlyReportMeta,
  NameDirectory,
  PlannedPayment,
  SettingsAuditEntry,
  UserAccount,
  VendorIdentitySummary,
} from '../domain/appTypes'
import type { WorkspaceMetrics } from '../domain/workspaceMetrics'
import type { VendorAccountStateV2 } from '@/domain/vendorLedgerV2'
import { serverNowIso } from '@/shared/lib/serverClock'
import type { ScheduledNotification } from '../domain/appTypes'
import { DEFAULT_SCHEDULED_NOTIFICATIONS } from '@/features/action-center/domain/scheduledNotifications'
import type { BusinessIdentity } from '@/domain/businessIdentity'

export const singleStoreId = 'single-store'
export const defaultMonthlyOperationalExpense = 500000
export const defaultMarginPercentage = 25

export type OperationalExpenseBreakdown = {
  rent: number
  electricity: number
  maintenance: number
  salaries: number
  royalty: number
  caFee: number
  miscellaneous: number
}

export type NameDirectoryType = keyof NameDirectory

export type AppSettings = BusinessIdentity & {
  marginPercentage: number
  monthlyOperationalExpense: number
  operationalExpenseBreakdown: OperationalExpenseBreakdown
  scheduledNotifications: ScheduledNotification[]
}

export type CreateUserInput = {
  email: string
  name: string
  password: string
  mobileNumber: string
  role: Exclude<UserAccount['role'], 'owner'>
}

export type LoadedCollections = Record<
  | 'stores'
  | 'sales'
  | 'purchases'
  | 'cashouts'
  | 'payments'
  | 'users'
  | 'vendors'
  | 'loans'
  | 'dailyCashouts'
  | 'cashTransfers'
  | 'plannedPayments'
  | 'monthlyReports'
  | 'settingsAudit'
  | 'nameDirectory'
  | 'appSettings'
  | 'workspaceMetrics',
  boolean
>

export const initialLoadedCollections: LoadedCollections = {
  stores: false,
  sales: false,
  purchases: false,
  cashouts: false,
  payments: false,
  users: false,
  vendors: false,
  loans: false,
  dailyCashouts: false,
  cashTransfers: false,
  plannedPayments: false,
  monthlyReports: false,
  settingsAudit: false,
  nameDirectory: false,
  appSettings: false,
  workspaceMetrics: false,
}

export const emptyFinanceData: FinanceData = {
  stores: [],
  sales: [],
  purchases: [],
  cashouts: [],
  payments: [],
}

export const emptyNameDirectory: NameDirectory = {
  people: [],
}

export const defaultAppSettings: AppSettings = {
  marginPercentage: defaultMarginPercentage,
  monthlyOperationalExpense: defaultMonthlyOperationalExpense,
  businessLegalName: 'Alphaflux Ventures Pvt Ltd',
  businessGstin: '09ABBCA5994J1Z5',
  businessFssaiLicense: '',
  businessBankName: '',
  businessBankAccountHolder: '',
  businessBankAccountNumber: '',
  businessBankIfsc: '',
  businessBankBranch: '',
  operationalExpenseBreakdown: {
    rent: 0,
    electricity: 0,
    maintenance: 0,
    salaries: 0,
    royalty: 0,
    caFee: 0,
    miscellaneous: 0,
  },
  scheduledNotifications: DEFAULT_SCHEDULED_NOTIFICATIONS,
}

export const emptyWorkspaceMetrics: WorkspaceMetrics = {
  updatedAt: null,
  generatedForDate: '',
  dashboardRanges: {
    yesterday: {
      from: '',
      to: '',
      sales: 0,
      expenses: 0,
      salesLastUpdated: null,
      expensesLastUpdated: null,
    },
    mtd: {
      from: '',
      to: '',
      sales: 0,
      expenses: 0,
      salesLastUpdated: null,
      expensesLastUpdated: null,
    },
  },
  registerToday: {
    cashout: 0,
    cashExpenses: 0,
    paymentPaid: 0,
    paymentReceived: 0,
    paymentNet: 0,
  },
  projections: {
    averageDailySales: 0,
    projectedMonthlySales: 0,
    monthlyOperationalExpense: defaultMonthlyOperationalExpense,
    marginPercentage: defaultMarginPercentage,
    projectedMarginValue: 0,
    projectedProfit: 0,
    projectedLoss: 0,
  },
  latestClosedDaySummary: {
    date: null,
    totalSales: 0,
    cashSales: 0,
    upiSales: 0,
    cardSales: 0,
    creditSales: 0,
    returns: 0,
    cashExpenses: 0,
    cashToHand: 0,
    transfersToday: 0,
  },
  liabilities: {
    totalLoans: 0,
    totalVendorOutstanding: 0,
    openLoanCount: 0,
  },
  vendorOutstandingByName: {},
  pendingCash: {
    bankTotal: 0,
    legacyBalances: [],
    legacyCashoutEntries: [],
    legacyTransferEntries: [],
    migratedCashoutEntries: [],
    userBalances: [],
    totalCounterCash: 0,
  },
  dashboardTables: {
    month: '',
    expenseByCategory: [],
    monthlyPurchaseTotal: 0,
    vendorPaymentTotal: 0,
    paymentByMode: [],
  },
  planner: {
    totalCounterCash: 0,
    groupedSchedule: [],
  },
  monthlyReports: {
    months: [],
    defaultSelectedMonth: null,
    summaries: [],
    detailsByMonth: {},
  },
}

export type AppStoreSetters = {
  setAuthError: Dispatch<SetStateAction<string | null>>
  setCashTransfers: Dispatch<SetStateAction<CashTransfer[]>>
  setCashoutCorrectionRequests: Dispatch<SetStateAction<CashoutCorrectionRequest[]>>
  setDailyCashouts: Dispatch<SetStateAction<DailyCashoutEntry[]>>
  setFinanceData: Dispatch<SetStateAction<FinanceData>>
  setIsBusy: Dispatch<SetStateAction<boolean>>
  setLoadedCollections: Dispatch<SetStateAction<LoadedCollections>>
  setLoans: Dispatch<SetStateAction<LoanEntry[]>>
  setMonthlyReports: Dispatch<SetStateAction<MonthlyReportMeta[]>>
  setNameDirectory: Dispatch<SetStateAction<NameDirectory>>
  setPlannedPayments: Dispatch<SetStateAction<PlannedPayment[]>>
  setAppSettings: Dispatch<SetStateAction<AppSettings>>
  setSettingsAuditLog: Dispatch<SetStateAction<SettingsAuditEntry[]>>
  setUsers: Dispatch<SetStateAction<UserAccount[]>>
  setVendors: Dispatch<SetStateAction<VendorIdentitySummary[]>>
  setVendorAccountStates: Dispatch<SetStateAction<VendorAccountStateV2[]>>
  setWorkspaceMetrics: Dispatch<SetStateAction<WorkspaceMetrics>>
}

export function sortByCreatedAtDesc<T extends { createdAt: string }>(items: T[]) {
  return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function mapDoc<T extends DocumentData>(id: string, data: T) {
  return { id, ...data } as T & { id: string }
}

export function normalizeLoanRecord(record: LoanEntry): LoanEntry {
  const amount = Math.max(record.amount, 0)
  const paidAmount = Math.max(record.paidAmount ?? 0, 0)
  const remainingAmount = Math.max(record.remainingAmount ?? Math.max(amount - paidAmount, 0), 0)
  const status: LoanStatus = remainingAmount > 0 ? 'Open' : 'Settled'

  return {
    ...record,
    personName: normalizeName(record.personName),
    notes: record.notes?.trim() || undefined,
    amount,
    paidAmount: Math.min(paidAmount, amount),
    remainingAmount,
    status,
    settledAt: status === 'Settled' ? record.settledAt ?? record.createdAt : undefined,
    updatedAt: record.updatedAt ?? record.createdAt,
  }
}

export function nowIso() {
  return serverNowIso()
}

export function salesDocId(storeId: string, date: string) {
  return `sale-${storeId}-${date}`
}

export function ensureSingleStore(stores: Store[]) {
  if (stores.length > 0) return stores
  return seedData.stores
}

export type StoreCollectionState = {
  appSettings: AppSettings
  cashTransfers: CashTransfer[]
  cashoutCorrectionRequests: CashoutCorrectionRequest[]
  dailyCashouts: DailyCashoutEntry[]
  financeData: FinanceData
  loadedCollections: LoadedCollections
  loans: LoanEntry[]
  monthlyReports: MonthlyReportMeta[]
  nameDirectory: NameDirectory
  plannedPayments: PlannedPayment[]
  settingsAuditLog: SettingsAuditEntry[]
  users: UserAccount[]
  vendors: VendorIdentitySummary[]
  vendorAccountStates: VendorAccountStateV2[]
  workspaceMetrics: WorkspaceMetrics
}
