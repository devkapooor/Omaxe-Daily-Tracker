import type { Cashout } from '../domain/financeTypes'
import type { CashHolder, Page } from '../domain/appTypes'

export type AppToast = {
  id: string
  message: string
}

export type DashboardRange = 'today' | 'yesterday' | 'mtd'
export type MovementHistoryRange = DashboardRange | 'custom'

export const singleStoreId = 'single-store'
export const monthlyFixedExpense = 500000

export const cashoutCategories = [
  'Staff',
  'Rent',
  'Utility',
  'Transport',
  'Repair',
  'Packaging',
  'Maintenance',
  'Miscellaneous',
]

export const cashoutPaymentModes: Cashout['paymentMode'][] = ['Cash', 'UPI', 'Card', 'Bank Transfer']

export function resolveCashHolderFromUserName(name: string): CashHolder | null {
  const lower = name.toLowerCase()
  if (lower.includes('dev')) return 'Dev'
  if (lower.includes('arsh')) return 'Arsh'
  if (lower.includes('farhan')) return 'Farhan'
  return null
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
  return role === 'owner'
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
    : activePage === 'dashboard' || activePage === 'loans' || activePage === 'settings'
      ? 'expense'
      : activePage
}
