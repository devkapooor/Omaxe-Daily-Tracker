// Amounts are integer paise. This module never writes financial records.
const STEP_PAISE = 500000
const METHODS = ['cash', 'upi', 'card', 'bank-transfer']

function integer(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error('Invalid ' + label)
  return value
}
function add(a, b) { return integer(a + b, 'sum', -Number.MAX_SAFE_INTEGER) }
function rupees(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value * 100 - Math.round(value * 100)) > 0.00001) throw new Error('Invalid ' + label)
  return integer(Math.round(value * 100), label)
}
function istDate(now) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now))
}
function money(paise) {
  integer(paise, 'display amount', -Number.MAX_SAFE_INTEGER)
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: paise % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(paise / 100)
}
function stamp(now) {
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(now)) + ' IST'
}

function summarize(date, bills, states, events, cashouts = []) {
  const byId = new Map(states.map(s => [s.billId, s]))
  const methods = Object.fromEntries(METHODS.map(m => [m, 0]))
  let grossPaise = 0, refundsPaise = 0, billCount = 0
  for (const bill of bills) {
    if (bill.businessDate !== date) continue
    const state = byId.get(bill.id)?.state
    if (state && !['active', 'partially-returned', 'voided'].includes(state)) throw new Error('Invalid bill state')
    if (state === 'voided') continue
    const amount = integer(bill.totalPaise, 'bill total')
    if (!Array.isArray(bill.payments) || !bill.payments.length) throw new Error('Missing bill payments')
    let allocated = 0
    for (const payment of bill.payments) {
      if (!METHODS.includes(payment.method)) throw new Error('Unsupported payment method')
      const paid = integer(payment.amountPaise, 'payment')
      allocated = add(allocated, paid)
      methods[payment.method] = add(methods[payment.method], paid)
    }
    if (allocated !== amount) throw new Error('Bill payments do not reconcile')
    grossPaise = add(grossPaise, amount)
    billCount++
  }
  for (const event of events) {
    if (event.type !== 'bill-return-approved' || event.refundDate !== date) continue
    const amount = integer(event.refundAmountPaise, 'refund')
    refundsPaise = add(refundsPaise, amount)
    if (METHODS.includes(event.refundMethod)) methods[event.refundMethod] = add(methods[event.refundMethod], -amount)
  }
  return { date, grossPaise, refundsPaise, netPaise: add(grossPaise, -refundsPaise), billCount, averageBillPaise: billCount ? Math.round(grossPaise / billCount) : 0, methods, cashoutCount: cashouts.filter(c => c.date === date).length }
}

function todayText(summary, now) {
  const s = summary
  return ['AlphaHub · Today · ' + s.date, 'Source: POS', '', 'Net sales: ' + money(s.netPaise), 'Bills: ' + s.billCount, 'Average bill (before refunds): ' + money(s.averageBillPaise), '', 'Cash net: ' + money(s.methods.cash), 'UPI net: ' + money(s.methods.upi), 'Card net: ' + money(s.methods.card), ...(s.methods['bank-transfer'] ? ['Legacy bank transfer net: ' + money(s.methods['bank-transfer'])] : []), 'Refunds: ' + money(s.refundsPaise), '', 'Cashouts recorded today: ' + s.cashoutCount, 'Checked ' + stamp(now)].join('\n')
}
function milestoneText(summary, previous, now) {
  const reached = Math.max(0, Math.floor(summary.netPaise / STEP_PAISE))
  const count = reached - previous
  if (count < 1) throw new Error('No new milestone')
  const milestones = count <= 5
    ? Array.from({ length: count }, (_, i) => money((previous + i + 1) * STEP_PAISE)).join(', ')
    : money((previous + 1) * STEP_PAISE) + ' through ' + money(reached * STEP_PAISE) + ' (' + count + ' milestones)'
  return ['🟢 AlphaHub · Sales milestone', 'Reached: ' + milestones, 'Today’s POS net sales: ' + money(summary.netPaise), 'Bills: ' + summary.billCount, stamp(now)].join('\n')
}

function cashoutText(entry, now) {
  const method = key => rupees(entry[key] ?? 0, key)
  const cash = method('cashSales'), upi = method('upiSales'), card = method('cardSales'), bank = method('bankTransferSales'), credit = method('creditSales'), returns = method('returns')
  const gross = [cash, upi, card, bank, credit].reduce(add, 0)
  const counted = rupees(entry.drawerTotal, 'counted drawer')
  const expected = entry.cashAudit === null ? null : rupees(entry.cashAudit, 'expected drawer')
  const difference = expected === null ? null : add(counted, -expected)
  const label = difference === null ? 'Not reconciled — expected cash unavailable' : difference === 0 ? 'Matched' : difference < 0 ? 'Short by ' + money(-difference) : 'Excess by ' + money(difference)
  const historical = entry.historicalCountOnlyVersion === 1
  if (!historical && expected === null) throw new Error('Expected drawer is missing')
  return ['AlphaHub · Cashout report' + ((entry.revision || 1) > 1 ? ' · Revised' : ''), 'Business date: ' + entry.date, 'Coverage: this cashout window', 'Recorded by: ' + String(entry.recordedBy || 'Staff').replace(/[\r\n]/g, ' ').slice(0, 100), '', 'Recorded net sales: ' + money(add(gross, -returns)), 'Cash sales: ' + money(cash), 'UPI sales: ' + money(upi), 'Card sales: ' + money(card), ...(bank ? ['Legacy bank transfer sales: ' + money(bank)] : []), 'Declared credit sales: ' + money(credit), 'Returns: ' + money(returns), 'Cash paid out (includes cash refunds): ' + money(method('cashExpense')), '', 'Expected drawer: ' + (expected === null ? 'Unavailable' : money(expected)), 'Counted drawer: ' + money(counted), 'Cash check: ' + label, 'Review: ' + (['pending', 'matched', 'reviewed'].includes(entry.reviewStatus) ? entry.reviewStatus : 'See AlphaHub'), ...(historical ? ['Historical count'] : entry.lateCashoutVersion === 1 ? ['Late cashout'] : []), '', 'Recorded ' + stamp(entry.updatedAt || entry.createdAt), 'Report generated ' + stamp(now)].join('\n')
}

module.exports = { STEP_PAISE, integer, istDate, money, summarize, todayText, milestoneText, cashoutText }
