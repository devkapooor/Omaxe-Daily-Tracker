import { money } from '@/app/uiHelpers'

type MonthlyProjectionPanelProps = {
  averageDailySales: number
  projectedMonthlySales: number
  monthlyOperationalExpense: number
  marginPercentage: number
}

export function MonthlyProjectionPanel({
  averageDailySales,
  projectedMonthlySales,
  monthlyOperationalExpense,
  marginPercentage,
}: MonthlyProjectionPanelProps) {
  const projectedMarginValue = projectedMonthlySales * (marginPercentage / 100)
  const breakEvenDelta = projectedMarginValue - monthlyOperationalExpense
  const projectedProfit = breakEvenDelta > 0 ? breakEvenDelta : 0
  const projectedLoss = breakEvenDelta < 0 ? Math.abs(breakEvenDelta) : 0

  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-[28px] border border-border/80 bg-white/85 p-6 shadow-[0_18px_45px_rgba(24,32,27,0.08)] backdrop-blur-xl">
        <span className="block text-xs font-extrabold uppercase tracking-[0.2em] text-muted-foreground">Monthly Sales Projection</span>
        <div className="mt-4 grid gap-5 md:grid-cols-[minmax(0,0.85fr)_1px_minmax(0,1.15fr)] md:items-center">
          <div>
            <span className="block text-[11px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">Average Sales</span>
            <strong className="mt-2 block text-2xl font-black tracking-tight text-foreground">{money(averageDailySales)}</strong>
          </div>
          <div className="hidden h-16 w-px bg-border md:block" />
          <div>
            <span className="block text-[11px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">Monthly Projected Sales</span>
            <strong className="mt-2 block text-3xl font-black tracking-tight text-foreground">{money(projectedMonthlySales)}</strong>
          </div>
        </div>
      </div>
      <div className="rounded-[28px] border border-border/80 bg-white/85 p-6 shadow-[0_18px_45px_rgba(24,32,27,0.08)] backdrop-blur-xl">
        <span className="block text-xs font-extrabold uppercase tracking-[0.2em] text-muted-foreground">
          Break-Even Projection vs Monthly Operational Expenses ({marginPercentage}% Margin)
        </span>
        <p className="mt-4 text-sm font-semibold text-emerald-700">Projected Profit: {money(projectedProfit)}</p>
        <p className="mt-2 text-sm font-semibold text-rose-700">Projected Loss: {money(projectedLoss)}</p>
      </div>
    </section>
  )
}
