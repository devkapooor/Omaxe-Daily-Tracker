import type { DailySales, FinanceData, UserRole } from '../domain/financeTypes'
import type { CashTransfer, DailyCashoutEntry, LoanEntry, NameDirectory, SettingsAuditEntry, UserAccount } from '../domain/appTypes'

const financeStorageKey = 'omaxe-daily-tracker-finance-data-v2'
const userStorageKey = 'omaxe-daily-tracker-users-v1'
const nameDirectoryStorageKey = 'omaxe-daily-tracker-name-directory-v2'
const loansStorageKey = 'omaxe-daily-tracker-loans-v2'
const dailyCashoutStorageKey = 'omaxe-daily-tracker-daily-cashout-v2'
const cashTransferStorageKey = 'omaxe-daily-tracker-cash-transfer-v2'
const settingsAuditStorageKey = 'omaxe-daily-tracker-settings-audit-v2'

const legacyKeys = [
  financeStorageKey,
  userStorageKey,
  nameDirectoryStorageKey,
  loansStorageKey,
  dailyCashoutStorageKey,
  cashTransferStorageKey,
  settingsAuditStorageKey,
]

const emptyFinanceData: FinanceData = {
  stores: [],
  sales: [],
  purchases: [],
  cashouts: [],
  payments: [],
}

function parseJson<T>(key: string, fallback: T) {
  if (typeof window === 'undefined') return fallback
  const raw = window.localStorage.getItem(key)
  if (!raw) return fallback

  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

function uniqNames(values: string[]) {
  const map = new Map<string, string>()
  values.forEach((value) => {
    const normalized = normalizeName(value)
    if (!normalized) return
    const key = normalized.toLowerCase()
    if (!map.has(key)) map.set(key, normalized)
  })
  return Array.from(map.values()).sort((a, b) => a.localeCompare(b))
}

function asRole(value: unknown): UserRole | null {
  if (value === 'owner' || value === 'manager' || value === 'billing') return value
  return null
}

function deriveEmail(name: string) {
  return `${normalizeName(name).toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '')}@example.com`
}

function migrateUsers() {
  const parsed = parseJson<unknown[]>(userStorageKey, [])
  if (!Array.isArray(parsed)) return [] as UserAccount[]

  return parsed.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const candidate = entry as Partial<UserAccount> & { pin?: string }
    const role = asRole(candidate.role)
    if (!role || typeof candidate.id !== 'string' || typeof candidate.name !== 'string') return []

    return [
      {
        id: candidate.id,
        name: normalizeName(candidate.name),
        role,
        email: typeof candidate.email === 'string' ? candidate.email : deriveEmail(candidate.name),
        createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : new Date().toISOString(),
        disabled: Boolean(candidate.disabled),
      },
    ]
  })
}

function migrateNameDirectory() {
  const parsed = parseJson<Partial<NameDirectory>>(nameDirectoryStorageKey, {})
  return {
    people: uniqNames(Array.isArray(parsed.people) ? parsed.people : []),
    vendors: uniqNames(Array.isArray(parsed.vendors) ? parsed.vendors : []),
  } satisfies NameDirectory
}

function migrateLoans() {
  const parsed = parseJson<LoanEntry[]>(loansStorageKey, [])
  if (!Array.isArray(parsed)) return [] as LoanEntry[]
  return parsed.filter(
    (loan) =>
      loan &&
      typeof loan.id === 'string' &&
      typeof loan.personName === 'string' &&
      typeof loan.amount === 'number' &&
      typeof loan.date === 'string' &&
      typeof loan.promisedPayoffDate === 'string' &&
      typeof loan.createdAt === 'string',
  )
}

function migrateDailyCashouts() {
  const parsed = parseJson<DailyCashoutEntry[]>(dailyCashoutStorageKey, [])
  if (!Array.isArray(parsed)) return [] as DailyCashoutEntry[]
  return parsed.filter((entry) => entry && typeof entry.id === 'string' && typeof entry.createdAt === 'string')
}

function migrateCashTransfers() {
  const parsed = parseJson<CashTransfer[]>(cashTransferStorageKey, [])
  if (!Array.isArray(parsed)) return [] as CashTransfer[]
  return parsed.filter((entry) => entry && typeof entry.id === 'string' && typeof entry.createdAt === 'string')
}

function migrateSettingsAudit() {
  const parsed = parseJson<SettingsAuditEntry[]>(settingsAuditStorageKey, [])
  if (!Array.isArray(parsed)) return [] as SettingsAuditEntry[]
  return parsed.filter((entry) => entry && typeof entry.id === 'string' && typeof entry.createdAt === 'string')
}

function hasLegacyData() {
  if (typeof window === 'undefined') return false
  return legacyKeys.some((key) => window.localStorage.getItem(key))
}

export type LegacyImportPayload = {
  financeData: FinanceData
  users: UserAccount[]
  nameDirectory: NameDirectory
  loans: LoanEntry[]
  dailyCashouts: DailyCashoutEntry[]
  cashTransfers: CashTransfer[]
  settingsAuditLog: SettingsAuditEntry[]
}

export function readLegacyImportPayload(): LegacyImportPayload | null {
  if (!hasLegacyData()) return null

  const financeData = parseJson<FinanceData>(financeStorageKey, emptyFinanceData)

  return {
    financeData: {
      stores: Array.isArray(financeData.stores) ? financeData.stores : [],
      sales: Array.isArray(financeData.sales) ? (financeData.sales as DailySales[]) : [],
      purchases: Array.isArray(financeData.purchases) ? financeData.purchases : [],
      cashouts: Array.isArray(financeData.cashouts) ? financeData.cashouts : [],
      payments: Array.isArray(financeData.payments) ? financeData.payments : [],
    },
    users: migrateUsers(),
    nameDirectory: migrateNameDirectory(),
    loans: migrateLoans(),
    dailyCashouts: migrateDailyCashouts(),
    cashTransfers: migrateCashTransfers(),
    settingsAuditLog: migrateSettingsAudit(),
  }
}

export function clearLegacyLocalData() {
  if (typeof window === 'undefined') return
  legacyKeys.forEach((key) => window.localStorage.removeItem(key))
}
