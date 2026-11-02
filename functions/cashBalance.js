function normalizedName(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toLowerCase() : ''
}

function activeUser(user) {
  return user && user.disabled !== true && user.approvalStatus !== 'rejected'
}

// A session can span days. Its opening date is history; the latest accepted
// physical count determines which day's drawer is ready. Keep this contract
// aligned with isCounterOpen in cashierHandover.ts and counterOpen in Rules.
function isCounterOpenForDate(ledger, date) {
  return ledger?.initialized === true && ledger.counterSession?.status === 'open' && ledger.checkpoint?.date === date
}

function pendingCashForUser(userId, users, cashouts, transfers) {
  const active = users.filter((user) => activeUser(user.data))
  const activeIds = new Set(active.map((user) => user.id))
  const nameMatches = new Map()
  for (const user of active) {
    const key = normalizedName(user.data.name)
    if (key) nameMatches.set(key, [...(nameMatches.get(key) || []), user.id])
  }

  let amount = 0
  for (const cashout of cashouts) {
    const drawer = Number(cashout.data.drawerTotal ?? cashout.data.remainingBalance ?? 0)
    if (cashout.data.recordedByUserId && activeIds.has(cashout.data.recordedByUserId)) {
      if (cashout.data.recordedByUserId === userId) amount += drawer
    } else {
      const matches = nameMatches.get(normalizedName(cashout.data.recordedBy)) || []
      if (matches.length === 1 && matches[0] === userId) amount += drawer
    }
  }

  for (const transfer of transfers) {
    if (transfer.data.fromUserId === userId) amount -= Number(transfer.data.amount || 0)
    if (transfer.data.toType === 'person' && transfer.data.toUserId === userId) amount += Number(transfer.data.amount || 0)
  }
  return amount
}

module.exports = { activeUser, isCounterOpenForDate, normalizedName, pendingCashForUser }
