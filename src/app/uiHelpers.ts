import type { Cashout } from '../domain/financeTypes'
import type { CashHolder, Page, UserAccount } from '../domain/appTypes'

export type AppToast = {
  id: string
  message: string
}

export type DashboardRange = 'today' | 'yesterday' | 'mtd'
export type MovementHistoryRange = DashboardRange | 'custom'

export const singleStoreId = 'single-store'
export const monthlyFixedExpense = 500000

export const cashoutCategories = [
  'Rent',
  'Maintenance',
  'Electricity',
  'Salary',
  'Stock Purchase',
  'Transportation',
  'Staff Welfare',
]

export const cashoutPaymentModes: Cashout['paymentMode'][] = ['Cash', 'UPI', 'Card', 'Bank Transfer']

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
  return new Date().toISOString().slice(0, 10)
}

export function shiftDate(date: string, days: number) {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function daysInMonth(date: string) {
  const [year, month] = date.split('-').map(Number)
  return new Date(year, month, 0).getDate()
}

export function daysBetweenInclusive(from: string, to: string) {
  const start = new Date(`${from}T00:00:00`).getTime()
  const end = new Date(`${to}T00:00:00`).getTime()
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

export function numberValue(value: FormDataEntryValue | null) {
  return Math.max(Number(value || 0), 0)
}

export function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length
}

export function canOpenSettings(role: string) {
  return role === 'owner' || role === 'manager' || role === 'billing'
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
  return role === 'owner'
    ? activePage
    : activePage === 'dashboard' || activePage === 'loans'
      ? 'expense'
      : activePage
}
