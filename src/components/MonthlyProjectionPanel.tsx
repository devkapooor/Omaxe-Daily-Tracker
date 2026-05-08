import { money } from '../app/uiHelpers'

type MonthlyProjectionPanelProps = {
  projectedMonthlySales: number
  monthlyFixedExpense: number
}

export function MonthlyProjectionPanel({ projectedMonthlySales, monthlyFixedExpense }: MonthlyProjectionPanelProps) {
  const projectedMarginValue = projectedMonthlySales * 0.25
  const breakEvenDelta = projectedMarginValue - monthlyFixedExpense
  const projectedProfit = breakEvenDelta > 0 ? breakEvenDelta : 0
  const projectedLoss = breakEvenDelta < 0 ? Math.abs(breakEvenDelta) : 0

  return (
    <section className="cashout-summary projection-grid">
      <div className="summary-card">
        <span>Monthly Sales Projection</span>
        <strong>{money(projectedMonthlySales)}</strong>
      </div>
      <div className="summary-card">
        <span>Break-Even Projection (25% Margin)</span>
        <p className="projection-note good">Projected Profit: {money(projectedProfit)}</p>
        <p className="projection-note risk">Projected Loss: {money(projectedLoss)}</p>
      </div>
    </section>
  )
}
