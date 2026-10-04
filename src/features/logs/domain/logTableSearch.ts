import type { DailyCashoutEntry } from '@/domain/appTypes'
import { formatDisplayDate } from '@/app/uiHelpers'

export function normalizeLogSearchText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function dailyCashoutSearchText(entry: DailyCashoutEntry) {
  return [
    entry.date,
    formatDisplayDate(entry.date),
    entry.recordedBy,
    entry.cardSales === undefined ? 'card not recorded' : String(entry.cardSales),
    entry.auditStatus ?? 'matched',
    entry.actualCashParticulars,
    entry.pendingCashParticulars,
  ].join(' ')
}
