import { activeWorkspaceUsers, legacyCashHolderLabel, normalizeName } from '@/app/uiHelpers'
import type { CashTransfer, DailyCashoutEntry, UserAccount, VendorIdentitySummary } from '@/domain/appTypes'
import type { VendorAccountStateV2 } from '@/domain/vendorLedgerV2'
import type { PendingCashSnapshot } from '@/domain/workspaceMetrics'

export function derivePendingCash(users: UserAccount[], dailyCashouts: DailyCashoutEntry[], cashTransfers: CashTransfer[]): PendingCashSnapshot {
  const activeUsers = activeWorkspaceUsers(users)
  const activeUserIds = new Set(activeUsers.map((user) => user.id))
  const activeUsersByNormalizedName = new Map<string, UserAccount[]>()
  activeUsers.forEach((user) => {
    const key = normalizeName(user.name).toLowerCase()
    if (key) activeUsersByNormalizedName.set(key, [...(activeUsersByNormalizedName.get(key) ?? []), user])
  })

  const userBalanceMap = new Map<string, number>(activeUsers.map((user) => [user.id, 0]))
  const legacyBalanceMap = new Map<string, PendingCashSnapshot['legacyBalances'][number]>()
  const legacyCashoutEntries: DailyCashoutEntry[] = []
  const legacyTransferEntries: CashTransfer[] = []
  const migratedCashoutEntries: DailyCashoutEntry[] = []
  let bankTotal = 0

  function ensureLegacyBalance(holder?: PendingCashSnapshot['legacyBalances'][number]['holder']) {
    const resolvedHolder = holder ?? 'unassigned'
    const existing = legacyBalanceMap.get(resolvedHolder)
    if (existing) return existing
    const next = { holder: resolvedHolder, label: legacyCashHolderLabel(resolvedHolder), amount: 0, cashoutCount: 0, transferInCount: 0, transferOutCount: 0 }
    legacyBalanceMap.set(resolvedHolder, next)
    return next
  }

  function addToActiveUser(userId: string, amount: number) {
    if (!activeUserIds.has(userId)) return false
    userBalanceMap.set(userId, (userBalanceMap.get(userId) ?? 0) + amount)
    return true
  }

  function exactMatchedUserId(rawName: string) {
    const matches = activeUsersByNormalizedName.get(normalizeName(rawName).toLowerCase()) ?? []
    return matches.length === 1 ? matches[0]?.id ?? null : null
  }

  dailyCashouts.forEach((entry) => {
    const drawerTotal = entry.drawerTotal ?? entry.remainingBalance
    if (entry.recordedByUserId && addToActiveUser(entry.recordedByUserId, drawerTotal)) return
    const migratedUserId = exactMatchedUserId(entry.recordedBy)
    if (migratedUserId && addToActiveUser(migratedUserId, drawerTotal)) {
      migratedCashoutEntries.push(entry)
      return
    }
    const balance = ensureLegacyBalance(entry.recordedByHolder)
    balance.amount += drawerTotal
    balance.cashoutCount += 1
    legacyCashoutEntries.push(entry)
  })

  cashTransfers.forEach((entry) => {
    if (!(entry.fromUserId && addToActiveUser(entry.fromUserId, -entry.amount))) {
      const source = ensureLegacyBalance(entry.from)
      source.amount -= entry.amount
      source.transferOutCount += 1
      legacyTransferEntries.push(entry)
    }
    if (entry.toType === 'person') {
      if (entry.toUserId && addToActiveUser(entry.toUserId, entry.amount)) return
      const destination = ensureLegacyBalance(entry.toPerson)
      destination.amount += entry.amount
      destination.transferInCount += 1
      if (!legacyTransferEntries.some((candidate) => candidate.id === entry.id)) legacyTransferEntries.push(entry)
      return
    }
    bankTotal += entry.amount
  })

  const userBalances = activeUsers.map((user) => ({ userId: user.id, name: user.name, amount: userBalanceMap.get(user.id) ?? 0 })).sort((a, b) => a.name.localeCompare(b.name))
  const legacyBalances = Array.from(legacyBalanceMap.values()).sort((a, b) => a.label.localeCompare(b.label))
  return {
    bankTotal,
    legacyBalances,
    legacyCashoutEntries,
    legacyTransferEntries,
    migratedCashoutEntries,
    userBalances,
    totalCounterCash: userBalances.reduce((total, entry) => total + entry.amount, 0),
  }
}

export function deriveVendorOutstanding(vendors: VendorIdentitySummary[], accountStates: VendorAccountStateV2[]) {
  const totals = new Map<string, number>()
  const vendorNameById = new Map<string, string>()
  vendors.forEach((vendor) => {
    const key = vendor.name.trim().toLowerCase()
    if (!key) return
    vendorNameById.set(vendor.id, key)
    if (!totals.has(key)) totals.set(key, 0)
  })
  accountStates.forEach((account) => {
    const key = vendorNameById.get(account.vendorId) ?? account.vendorId.trim().toLowerCase()
    if (!key) return
    const amountPaise = account.outstandingPaise
    if (!Number.isSafeInteger(amountPaise) || amountPaise < 0) throw new Error(`Invalid payable balance for vendor ${account.vendorId}.`)
    totals.set(key, (totals.get(key) ?? 0) + amountPaise / 100)
  })
  return totals
}
