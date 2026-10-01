import type { ChequeV2, VendorV2 } from './vendorLedgerV2'
import { normalizeChequeNumber } from './vendorLedgerV2'
import type { PlannerScheduleGroupSnapshot, PlannerScheduleItemSnapshot } from './workspaceMetrics'

function safeChequeNumber(value?: string) {
  if (!value) return null
  try {
    return normalizeChequeNumber(value)
  } catch {
    return value.trim().toLocaleUpperCase('en-IN')
  }
}

export function mergeV2ChequesIntoPlanner(
  currentBankBalance: number,
  groups: PlannerScheduleGroupSnapshot[],
  cheques: ChequeV2[],
  vendors: VendorV2[],
): PlannerScheduleGroupSnapshot[] {
  const openV2 = cheques.filter((cheque) => cheque.status === 'issued' || cheque.status === 'presented')
  const v2Numbers = new Set(openV2.map((cheque) => safeChequeNumber(cheque.chequeNumber)))
  const legacyItems = groups.flatMap((group) => group.items).filter((item) => {
    const number = safeChequeNumber(item.chequeNumber)
    return !number || !v2Numbers.has(number)
  })
  const vendorNames = Object.fromEntries(vendors.map((vendor) => [vendor.id, vendor.canonicalName]))
  const v2Items: PlannerScheduleItemSnapshot[] = openV2.map((cheque) => ({
    id: `v2-cheque-${cheque.id}`,
    amount: cheque.amountPaise / 100,
    date: cheque.date,
    note: `${cheque.status === 'presented' ? 'Presented' : 'Issued'} V2 cheque`,
    source: 'vendor-cheque-v2',
    title: cheque.vendorId ? vendorNames[cheque.vendorId] ?? cheque.vendorId : 'Vendor cheque',
    chequeNumber: cheque.chequeNumber,
    runningBalanceAfter: 0,
    status: 'available',
  }))
  const sorted = [...legacyItems, ...v2Items].sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id))
  let runningBalance = currentBankBalance
  const rebuilt = sorted.map((item) => {
    runningBalance -= item.amount
    return { ...item, runningBalanceAfter: runningBalance, status: runningBalance < 0 ? 'deficit' as const : 'available' as const }
  })
  const grouped = new Map<string, PlannerScheduleGroupSnapshot>()
  rebuilt.forEach((item) => {
    const group = grouped.get(item.date) ?? { date: item.date, totalAmount: 0, items: [] }
    group.items.push(item)
    group.totalAmount += item.amount
    grouped.set(item.date, group)
  })
  return [...grouped.values()].sort((left, right) => left.date.localeCompare(right.date))
}
