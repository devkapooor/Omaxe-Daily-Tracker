import { useMemo } from 'react'
import type { Cashout } from '../domain/financeTypes'
import type { CashHolder } from '../domain/appTypes'
import { money, today } from '../app/uiHelpers'

type DashboardTablesProps = {
  cashouts: Cashout[]
  purchases: { date: string; category: string; purchaseAmount: number }[]
  payments: { date: string; type: 'Received' | 'Paid'; amount: number; paymentMode: string }[]
  pendingCashBalances: Record<CashHolder, number>
  pendingCashBankTotal: number
}

export function DashboardTables({
  cashouts,
  purchases,
  payments,
  pendingCashBalances,
  pendingCashBankTotal,
}: DashboardTablesProps) {
  const month = today().slice(0, 7)

  const expenseByCategory = useMemo(() => {
    const map = new Map<string, number>()
    cashouts
      .filter((entry) => entry.date.slice(0, 7) === month)
      .forEach((entry) => map.set(entry.category, (map.get(entry.category) ?? 0) + entry.amount))
    return Array.from(map.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
  }, [cashouts, month])

  const monthlyPurchaseTotal = useMemo(
    () =>
      purchases
        .filter((entry) => entry.date.slice(0, 7) === month)
        .reduce((total, entry) => total + entry.purchaseAmount, 0),
    [month, purchases],
  )

  const vendorPaymentTotal = useMemo(
    () =>
      payments
        .filter((entry) => entry.date.slice(0, 7) === month && entry.type === 'Paid')
        .reduce((total, entry) => total + entry.amount, 0),
    [month, payments],
  )

  const paymentByMode = useMemo(() => {
    const map = new Map<string, number>()
    payments
      .filter((entry) => entry.date.slice(0, 7) === month && entry.type === 'Paid')
      .forEach((entry) => map.set(entry.paymentMode, (map.get(entry.paymentMode) ?? 0) + entry.amount))
    return Array.from(map.entries())
      .map(([mode, amount]) => ({ mode, amount }))
      .sort((a, b) => b.amount - a.amount)
  }, [month, payments])

  return (
    <section className="dashboard-tables-grid">
      <article className="cashout-card table-card">
        <div className="card-title">
          <p className="eyebrow">Month Table</p>
          <h2>Expenses By Category</h2>
        </div>
        <div className="table-shell">
          {expenseByCategory.length === 0 && <p className="empty-state">No category expenses this month.</p>}
          {expenseByCategory.map((row) => (
            <div className="table-row" key={row.category}>
              <span>{row.category}</span>
              <strong>{money(row.amount)}</strong>
            </div>
          ))}
        </div>
      </article>

      <article className="cashout-card table-card">
        <div className="card-title">
          <p className="eyebrow">Month Summary</p>
          <h2>Purchase vs Vendor Payment</h2>
        </div>
        <div className="table-shell">
          <div className="table-row">
            <span>Total Purchase</span>
            <strong>{money(monthlyPurchaseTotal)}</strong>
          </div>
          <div className="table-row">
            <span>Total Vendor Payment</span>
            <strong>{money(vendorPaymentTotal)}</strong>
          </div>
        </div>
      </article>

      <article className="cashout-card table-card">
        <div className="card-title">
          <p className="eyebrow">Month Table</p>
          <h2>Vendor Payment By Mode</h2>
        </div>
        <div className="table-shell">
          {paymentByMode.length === 0 && <p className="empty-state">No vendor payment entries this month.</p>}
          {paymentByMode.map((row) => (
            <div className="table-row" key={row.mode}>
              <span>{row.mode}</span>
              <strong>{money(row.amount)}</strong>
            </div>
          ))}
        </div>
      </article>

      <article className="cashout-card table-card">
        <div className="card-title">
          <p className="eyebrow">Cash Overview</p>
          <h2>Pending Cash Particulars</h2>
        </div>
        <div className="table-shell">
          {(['Dev', 'Arsh', 'Farhan'] as CashHolder[]).map((person) => (
            <div className="table-row" key={person}>
              <span>{person}</span>
              <strong>{money(pendingCashBalances[person] ?? 0)}</strong>
            </div>
          ))}
          <div className="table-row">
            <span>Transferred To Bank</span>
            <strong>{money(pendingCashBankTotal)}</strong>
          </div>
        </div>
      </article>
    </section>
  )
}
