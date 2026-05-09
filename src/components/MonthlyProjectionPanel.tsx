import { money } from '@/app/uiHelpers'

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
    <section className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-[28px] border border-border/80 bg-white/85 p-6 shadow-[0_18px_45px_rgba(24,32,27,0.08)] backdrop-blur-xl">
        <span className="block text-xs font-extrabold uppercase tracking-[0.2em] text-muted-foreground">Monthly Sales Projection</span>
        <strong className="mt-4 block text-3xl font-black tracking-tight text-foreground">{money(projectedMonthlySales)}</strong>
      </div>
      <div className="rounded-[28px] border border-border/80 bg-white/85 p-6 shadow-[0_18px_45px_rgba(24,32,27,0.08)] backdrop-blur-xl">
        <span className="block text-xs font-extrabold uppercase tracking-[0.2em] text-muted-foreground">Break-Even Projection (25% Margin)</span>
        <p className="mt-4 text-sm font-semibold text-emerald-700">Projected Profit: {money(projectedProfit)}</p>
        <p className="mt-2 text-sm font-semibold text-rose-700">Projected Loss: {money(projectedLoss)}</p>
      </div>
    </section>
  )
}
