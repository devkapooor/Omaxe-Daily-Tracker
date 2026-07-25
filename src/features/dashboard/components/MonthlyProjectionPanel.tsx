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
    <section className="grid gap-2.5 lg:grid-cols-2">
      <GlowCard className="p-4">
        <span className="block text-xs font-extrabold uppercase tracking-[0.2em] text-[#c5a56a] sm:text-[13px]">Monthly Sales Projection</span>
        <div className="mt-2.5 grid gap-3 md:grid-cols-[minmax(0,0.85fr)_1px_minmax(0,1.15fr)] md:items-center">
          <div>
            <span className="block text-[10px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">Average Sales</span>
            <strong className="mt-1 block text-lg font-black tracking-tight text-foreground">{money(averageDailySales)}</strong>
          </div>
          <div className="hidden h-12 w-px bg-border md:block" />
          <div>
            <span className="block text-[10px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">Monthly Projected Sales</span>
            <strong className="mt-1 block text-xl font-black tracking-tight text-foreground sm:text-2xl">{money(projectedMonthlySales)}</strong>
          </div>
        </div>
      </GlowCard>
      <GlowCard className="p-4">
        <span className="block text-xs font-extrabold uppercase tracking-[0.2em] text-[#c5a56a] sm:text-[13px]">
          Break-Even Projection vs Monthly Operational Expenses ({marginPercentage}% Margin)
        </span>
        <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
          <p className="rounded-2xl border border-emerald-900/60 bg-emerald-950/35 px-3 py-2 text-sm font-semibold text-emerald-200">
            Projected Profit: {money(projectedProfit)}
          </p>
          <p className="rounded-2xl border border-rose-900/60 bg-rose-950/35 px-3 py-2 text-sm font-semibold text-rose-200">
            Projected Loss: {money(projectedLoss)}
          </p>
        </div>
      </GlowCard>
    </section>
  )
}

