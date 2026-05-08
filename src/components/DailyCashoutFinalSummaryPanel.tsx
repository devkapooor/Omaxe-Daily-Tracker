import type { CashHolder } from '../domain/appTypes'
import { money } from '../app/uiHelpers'

type DailyCashoutFinalSummaryPanelProps = {
  dailyFinalSummary: {
    totalSales: number
    cashSales: number
    upiSales: number
    creditSales: number
    returns: number
    cashExpenses: number
    cashToHand: number
    transfersToday: number
  }
  pendingCashBalances: Record<CashHolder, number>
}

export function DailyCashoutFinalSummaryPanel({
  dailyFinalSummary,
  pendingCashBalances,
}: DailyCashoutFinalSummaryPanelProps) {
  return (
    <section className="cashout-card table-card daily-final-summary">
      <div className="card-title">
        <p className="eyebrow">Today Summary</p>
        <h2>Daily Cashout Final Summary</h2>
      </div>
      <div className="table-shell">
        <div className="table-row">
          <span>Total Sales (Cash + UPI + Credit - Returns)</span>
          <strong>{money(dailyFinalSummary.totalSales)}</strong>
        </div>
        <div className="table-row">
          <span>Total Expenses (Expense Register)</span>
          <strong>{money(dailyFinalSummary.cashExpenses)}</strong>
        </div>
        <div className="table-row">
          <span>Cash To Hand (Cash Sales - Cash Expenses)</span>
          <strong>{money(dailyFinalSummary.cashToHand)}</strong>
        </div>
        <div className="table-row">
          <span>Cash Transferred Today</span>
          <strong>{money(dailyFinalSummary.transfersToday)}</strong>
        </div>
        <div className="table-row">
          <span>Net Pending Cash By Person</span>
          <strong>
            Dev {money(pendingCashBalances.Dev)} | Arsh {money(pendingCashBalances.Arsh)} | Farhan{' '}
            {money(pendingCashBalances.Farhan)}
          </strong>
        </div>
      </div>
    </section>
  )
}
