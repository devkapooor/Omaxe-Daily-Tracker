import type { DocumentData } from 'firebase/firestore'
import type { Dispatch, SetStateAction } from 'react'
import { seedData } from './seedData'
import type {
  FinanceData,
  Store,
} from '../domain/financeTypes'
import type {
  CashTransfer,
  DailyCashoutEntry,
  LoanStatus,
  LoanEntry,
  NameDirectory,
  SettingsAuditEntry,
  UserAccount,
  VendorRecord,
} from '../domain/appTypes'

export const singleStoreId = 'single-store'
export const defaultMonthlyOperationalExpense = 500000

export type NameDirectoryType = keyof NameDirectory

export type AppSettings = {
  monthlyOperationalExpense: number
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
  | 'settingsAudit'
  | 'nameDirectory'
  | 'appSettings',
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
  settingsAudit: false,
  nameDirectory: false,
  appSettings: false,
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
  vendors: [],
}

export const defaultAppSettings: AppSettings = {
  monthlyOperationalExpense: defaultMonthlyOperationalExpense,
}

export type AppStoreSetters = {
  setAuthError: Dispatch<SetStateAction<string | null>>
  setCashTransfers: Dispatch<SetStateAction<CashTransfer[]>>
  setDailyCashouts: Dispatch<SetStateAction<DailyCashoutEntry[]>>
  setFinanceData: Dispatch<SetStateAction<FinanceData>>
  setIsBusy: Dispatch<SetStateAction<boolean>>
  setLoadedCollections: Dispatch<SetStateAction<LoadedCollections>>
  setLoans: Dispatch<SetStateAction<LoanEntry[]>>
  setNameDirectory: Dispatch<SetStateAction<NameDirectory>>
  setAppSettings: Dispatch<SetStateAction<AppSettings>>
  setSettingsAuditLog: Dispatch<SetStateAction<SettingsAuditEntry[]>>
  setUsers: Dispatch<SetStateAction<UserAccount[]>>
  setVendors: Dispatch<SetStateAction<VendorRecord[]>>
}

export function sortByCreatedAtDesc<T extends { createdAt: string }>(items: T[]) {
  return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

export function uniqNames(values: string[]) {
  const map = new Map<string, string>()
  values.forEach((value) => {
    const normalized = normalizeName(value)
    if (!normalized) return
    const key = normalized.toLowerCase()
    if (!map.has(key)) map.set(key, normalized)
  })
  return Array.from(map.values()).sort((a, b) => a.localeCompare(b))
}

export function mapDoc<T extends DocumentData>(id: string, data: T) {
  return { id, ...data } as T & { id: string }
}

export function normalizeVendorRecord(record: VendorRecord) {
  return {
    ...record,
    name: normalizeName(record.name),
    ownerName: normalizeName(record.ownerName),
    contact: record.contact.trim(),
    address: record.address.trim(),
    companiesProvided: record.companiesProvided.trim(),
    notes: record.notes.trim(),
  }
}

export function normalizeLoanRecord(record: LoanEntry): LoanEntry {
  const amount = Math.max(record.amount, 0)
  const paidAmount = Math.max(record.paidAmount ?? 0, 0)
  const remainingAmount = Math.max(record.remainingAmount ?? Math.max(amount - paidAmount, 0), 0)
  const status: LoanStatus = remainingAmount > 0 ? 'Open' : 'Settled'

  return {
    ...record,
    personName: normalizeName(record.personName),
    amount,
    paidAmount: Math.min(paidAmount, amount),
    remainingAmount,
    status,
    settledAt: status === 'Settled' ? record.settledAt ?? record.createdAt : undefined,
    updatedAt: record.updatedAt ?? record.createdAt,
  }
}

export function parseVendorCatalog(data: DocumentData | undefined) {
  const raw = data?.vendors
  if (!Array.isArray(raw)) return [] as VendorRecord[]
  return sortByCreatedAtDesc(
    raw.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return []
      const candidate = entry as Partial<VendorRecord>
      if (
        typeof candidate.id !== 'string' ||
        typeof candidate.name !== 'string' ||
        typeof candidate.ownerName !== 'string' ||
        typeof candidate.contact !== 'string' ||
        typeof candidate.address !== 'string' ||
        typeof candidate.companiesProvided !== 'string' ||
        typeof candidate.notes !== 'string' ||
        typeof candidate.createdAt !== 'string' ||
        typeof candidate.updatedAt !== 'string'
      ) {
        return []
      }
      return [normalizeVendorRecord(candidate as VendorRecord)]
    }),
  )
}

export function nowIso() {
  return new Date().toISOString()
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
  dailyCashouts: DailyCashoutEntry[]
  financeData: FinanceData
  loadedCollections: LoadedCollections
  loans: LoanEntry[]
  nameDirectory: NameDirectory
  settingsAuditLog: SettingsAuditEntry[]
  users: UserAccount[]
  vendors: VendorRecord[]
}
