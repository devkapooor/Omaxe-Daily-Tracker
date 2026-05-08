import type { Cashout } from '../domain/financeTypes'
import { money } from '../app/uiHelpers'

type RecentCashoutListProps = {
  cashouts: Cashout[]
  filterDate: string
  onFilterDateChange: (date: string) => void
}

export function RecentCashoutList({ cashouts, filterDate, onFilterDateChange }: RecentCashoutListProps) {
  return (
    <section className="cashout-card">
      <div className="card-title list-title">
        <div>
          <p className="eyebrow">Latest</p>
          <h2>Recent Expenses</h2>
        </div>
        <label>
          Date
          <input type="date" value={filterDate} onChange={(event) => onFilterDateChange(event.target.value)} />
        </label>
      </div>

      <div className="activity-list">
        {cashouts.length === 0 && <p className="empty-state">No cashout entries yet.</p>}
        {cashouts.map((cashout) => (
          <article className="activity-item" key={cashout.id}>
            <div>
              <strong>{cashout.paidTo}</strong>
              <span>
                {cashout.date} - {cashout.category} - {cashout.paymentMode}
              </span>
            </div>
            <strong>{money(cashout.amount)}</strong>
          </article>
        ))}
      </div>
    </section>
  )
}
