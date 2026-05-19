import type { Cashout, PurchaseDraft } from '../domain/financeTypes'
import type { CashHolder, Page, UserAccount } from '../domain/appTypes'

export type AppToast = {
  id: string
  message: string
}

export type DashboardRange = 'yesterday' | 'mtd'
export type MovementHistoryRange = 'today' | DashboardRange | 'custom'
export const IST_TIMEZONE = 'Asia/Kolkata'

export const singleStoreId = 'single-store'

export const cashoutCategories = [
  'Rent',
  'Maintenance',
  'Electricity',
  'Salary',
  'Stock Purchase',
  'Transportation',
  'Staff Welfare',
  'Loan Repayment',
]

export const cashoutPaymentModes: Cashout['paymentMode'][] = ['Cash', 'Bank Transfer', 'Cheque']
export const purchasePaymentModes: PurchaseDraft['paymentMode'][] = ['Cash', 'Bank Transfer', 'Cheque', 'Credit']

export type CashHolderAssignment = {
  holder: CashHolder
  label: string
  userId?: string
}

export function buildCashHolderAssignments(users: UserAccount[]): CashHolderAssignment[] {
  const enabledUsers = users.filter((user) => !user.disabled && user.approvalStatus !== 'rejected')
  const owner = enabledUsers.find((user) => user.role === 'owner')
  const staff = enabledUsers
    .filter((user) => user.role !== 'owner')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(0, 2)

  const assignments: CashHolderAssignment[] = []
  if (owner) {
    assignments.push({ holder: 'Dev', label: owner.name, userId: owner.id })
  } else {
    assignments.push({ holder: 'Dev', label: 'Owner' })
  }

  if (staff[0]) assignments.push({ holder: 'Arsh', label: staff[0].name, userId: staff[0].id })
  if (staff[1]) assignments.push({ holder: 'Farhan', label: staff[1].name, userId: staff[1].id })
  return assignments
}

export function resolveCashHolderForUser(userId: string, users: UserAccount[]) {
  const match = buildCashHolderAssignments(users).find((assignment) => assignment.userId === userId)
  return match?.holder ?? null
}

export function today() {
  return formatDateKeyFromDate(new Date())
}

export function shiftDate(date: string, days: number) {
  const [year, month, day] = date.split('-').map(Number)
  const utcDate = new Date(Date.UTC(year, month - 1, day))
  utcDate.setUTCDate(utcDate.getUTCDate() + days)
  return formatDateKey(
    utcDate.getUTCFullYear(),
    utcDate.getUTCMonth() + 1,
    utcDate.getUTCDate(),
  )
}

export function daysInMonth(date: string) {
  const [year, month] = date.split('-').map(Number)
  return new Date(year, month, 0).getDate()
}

export function daysBetweenInclusive(from: string, to: string) {
  const [fromYear, fromMonth, fromDay] = from.split('-').map(Number)
  const [toYear, toMonth, toDay] = to.split('-').map(Number)
  const start = Date.UTC(fromYear, fromMonth - 1, fromDay)
  const end = Date.UTC(toYear, toMonth - 1, toDay)
  const diff = Math.max(end - start, 0)
  return Math.floor(diff / (1000 * 60 * 60 * 24)) + 1
}

export function money(value: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatDisplayDate(value: string) {
  if (!value) return '-'
  const [year, month, day] = value.slice(0, 10).split('-')
  if (!year || !month || !day) return value
  return `${day}/${month}/${year}`
}

export function formatDisplayDateTime(value: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: IST_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

export function formatDisplayTime(value: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: IST_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function formatDateKey(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function formatDateKeyFromDate(date: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value

  if (!year || !month || !day) {
    return formatDateKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
  }

  return `${year}-${month}-${day}`
}

export function numberValue(value: FormDataEntryValue | null) {
  return Math.max(Number(value || 0), 0)
}

export function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length
}

export function canOpenSettings(role: string) {
  return role === 'owner' || role === 'manager' || role === 'billing'
}

export function canOpenPlanner(role: string) {
  return role === 'owner' || role === 'manager'
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

export function resolveActivePage(role: string, activePage: Page) {
  if (role === 'owner') return activePage
  if (activePage === 'dashboard' || activePage === 'logs') return 'expense'
  if (activePage === 'planner' && role === 'billing') return 'expense'
  return activePage
}
