import { money } from '@/app/uiHelpers'
import { GlowCard } from '@/shared/ui/spotlight-card'

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
    <section className="grid gap-3 lg:grid-cols-2">
      <GlowCard className="p-4.5 shadow-[0_12px_28px_rgba(24,32,27,0.06)]">
        <span className="block text-xs font-extrabold uppercase tracking-[0.2em] text-muted-foreground">Monthly Sales Projection</span>
        <div className="mt-3 grid gap-4 md:grid-cols-[minmax(0,0.85fr)_1px_minmax(0,1.15fr)] md:items-center">
          <div>
            <span className="block text-[11px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">Average Sales</span>
            <strong className="mt-1.5 block text-xl font-black tracking-tight text-foreground">{money(averageDailySales)}</strong>
          </div>
          <div className="hidden h-14 w-px bg-border md:block" />
          <div>
            <span className="block text-[11px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">Monthly Projected Sales</span>
            <strong className="mt-1.5 block text-2xl font-black tracking-tight text-foreground">{money(projectedMonthlySales)}</strong>
          </div>
        </div>
      </GlowCard>
      <GlowCard className="p-4.5 shadow-[0_12px_28px_rgba(24,32,27,0.06)]">
        <span className="block text-xs font-extrabold uppercase tracking-[0.2em] text-muted-foreground">
          Break-Even Projection vs Monthly Operational Expenses ({marginPercentage}% Margin)
        </span>
        <p className="mt-3 text-sm font-semibold text-emerald-700">Projected Profit: {money(projectedProfit)}</p>
        <p className="mt-1.5 text-sm font-semibold text-rose-700">Projected Loss: {money(projectedLoss)}</p>
      </GlowCard>
    </section>
  )
}

