import type { CashoutCorrectionValues, DailyCashoutEntry, DrawerDenominations } from './appTypes'

export const emptyDrawerDenominations: DrawerDenominations = {
  denom500: 0,
  denom200: 0,
  denom100: 0,
  denom50: 0,
  denom20: 0,
  denom10: 0,
  change: 0,
}

function nonNegative(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(Math.round(value), 0) : 0
}

export function drawerTotalFromDenominations(denominations: DrawerDenominations) {
  return (
    nonNegative(denominations.denom500) * 500 +
    nonNegative(denominations.denom200) * 200 +
    nonNegative(denominations.denom100) * 100 +
    nonNegative(denominations.denom50) * 50 +
    nonNegative(denominations.denom20) * 20 +
    nonNegative(denominations.denom10) * 10 +
    nonNegative(denominations.change)
  )
}

export function calculateCashoutAudit(cashAudit: number, drawerTotal: number) {
  const auditDifference = cashAudit - drawerTotal
  const auditStatus = auditDifference > 0 ? 'cash-less' as const : auditDifference < 0 ? 'cash-more' as const : 'matched' as const
  const auditMessage = auditDifference > 0
    ? `WARNING: Cash is less by ${auditDifference}.`
    : auditDifference < 0
      ? `Cash is more by ${Math.abs(auditDifference)}, probably wrong billings.`
      : 'Cash matches the system audit.'
  return { auditDifference, auditMessage, auditStatus }
}

export function formatDrawerParticulars(denominations: DrawerDenominations) {
  const drawerTotal = drawerTotalFromDenominations(denominations)
  return [
    `500 x ${denominations.denom500} = ${denominations.denom500 * 500}`,
    `200 x ${denominations.denom200} = ${denominations.denom200 * 200}`,
    `100 x ${denominations.denom100} = ${denominations.denom100 * 100}`,
    `50 x ${denominations.denom50} = ${denominations.denom50 * 50}`,
    `20 x ${denominations.denom20} = ${denominations.denom20 * 20}`,
    `10 x ${denominations.denom10} = ${denominations.denom10 * 10}`,
    `Change = ${denominations.change}`,
    `Total = ${drawerTotal}`,
  ].join('\n')
}

export function normalizeCorrectionValues(values: CashoutCorrectionValues): CashoutCorrectionValues {
  return {
    cashSales: nonNegative(values.cashSales),
    upiSales: nonNegative(values.upiSales),
    creditSales: nonNegative(values.creditSales),
    returns: nonNegative(values.returns),
    cashExpense: nonNegative(values.cashExpense),
    cashAudit: nonNegative(values.cashAudit),
    drawerDenominations: {
      denom500: nonNegative(values.drawerDenominations.denom500),
      denom200: nonNegative(values.drawerDenominations.denom200),
      denom100: nonNegative(values.drawerDenominations.denom100),
      denom50: nonNegative(values.drawerDenominations.denom50),
      denom20: nonNegative(values.drawerDenominations.denom20),
      denom10: nonNegative(values.drawerDenominations.denom10),
      change: nonNegative(values.drawerDenominations.change),
    },
  }
}

export function cashoutCorrectionValuesEqual(left: CashoutCorrectionValues, right: CashoutCorrectionValues) {
  const a = normalizeCorrectionValues(left)
  const b = normalizeCorrectionValues(right)
  return a.cashSales === b.cashSales &&
    a.upiSales === b.upiSales &&
    a.creditSales === b.creditSales &&
    a.returns === b.returns &&
    a.cashExpense === b.cashExpense &&
    a.cashAudit === b.cashAudit &&
    a.drawerDenominations.denom500 === b.drawerDenominations.denom500 &&
    a.drawerDenominations.denom200 === b.drawerDenominations.denom200 &&
    a.drawerDenominations.denom100 === b.drawerDenominations.denom100 &&
    a.drawerDenominations.denom50 === b.drawerDenominations.denom50 &&
    a.drawerDenominations.denom20 === b.drawerDenominations.denom20 &&
    a.drawerDenominations.denom10 === b.drawerDenominations.denom10 &&
    a.drawerDenominations.change === b.drawerDenominations.change
}

function parseLineNumber(text: string, pattern: RegExp) {
  const match = text.match(pattern)
  return match ? nonNegative(Number(match[1])) : 0
}

export function denominationsFromEntry(entry: DailyCashoutEntry): DrawerDenominations {
  if (entry.drawerDenominations) return normalizeCorrectionValues({
    cashSales: 0,
    upiSales: 0,
    creditSales: 0,
    returns: 0,
    cashExpense: 0,
    cashAudit: 0,
    drawerDenominations: entry.drawerDenominations,
  }).drawerDenominations

  const text = entry.actualCashParticulars ?? ''
  return {
    denom500: parseLineNumber(text, /500\s*x\s*(\d+)/i),
    denom200: parseLineNumber(text, /200\s*x\s*(\d+)/i),
    denom100: parseLineNumber(text, /100\s*x\s*(\d+)/i),
    denom50: parseLineNumber(text, /50\s*x\s*(\d+)/i),
    denom20: parseLineNumber(text, /20\s*x\s*(\d+)/i),
    denom10: parseLineNumber(text, /10\s*x\s*(\d+)/i),
    change: parseLineNumber(text, /Change\s*=\s*(\d+)/i),
  }
}

function cashExpenseFromEntry(entry: DailyCashoutEntry) {
  if (typeof entry.cashExpense === 'number') return nonNegative(entry.cashExpense)
  const expectedCash = entry.pendingCashParticulars?.match(/Expected Cash:\s*(-?\d+)/i)
  if (!expectedCash) return 0
  return Math.max(entry.cashSales - Number(expectedCash[1]), 0)
}

export function correctionValuesFromEntry(entry: DailyCashoutEntry): CashoutCorrectionValues {
  return normalizeCorrectionValues({
    cashSales: entry.cashSales,
    upiSales: entry.upiSales,
    creditSales: entry.creditSales,
    returns: entry.returns,
    cashExpense: cashExpenseFromEntry(entry),
    cashAudit: entry.cashAudit,
    drawerDenominations: denominationsFromEntry(entry),
  })
}

export function cashoutEntryFromCorrection(
  entry: DailyCashoutEntry,
  rawValues: CashoutCorrectionValues,
  updatedBy: string,
  updatedAt: string,
): DailyCashoutEntry {
  const values = normalizeCorrectionValues(rawValues)
  const drawerTotal = drawerTotalFromDenominations(values.drawerDenominations)
  const { auditDifference, auditMessage, auditStatus } = calculateCashoutAudit(values.cashAudit, drawerTotal)
  const denominations = values.drawerDenominations
  const actualCashParticulars = formatDrawerParticulars(denominations)

  return {
    ...entry,
    ...values,
    drawerTotal,
    auditDifference,
    auditStatus,
    auditMessage,
    actualCashParticulars,
    pendingCashParticulars: `By: ${entry.recordedBy}\nExpected Cash: ${values.cashSales - values.cashExpense}\nDrawer Total: ${drawerTotal}\nSystem Audit: ${values.cashAudit}\nAudit Check: ${auditMessage}`,
    remainingBalance: drawerTotal,
    revision: (entry.revision ?? 1) + 1,
    updatedAt,
    updatedBy,
  }
}
