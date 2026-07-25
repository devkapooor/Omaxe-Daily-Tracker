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
    <section className="grid gap-1.5 lg:grid-cols-2">
      <GlowCard className="p-3">
        <span className="block text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#c5a56a] sm:text-[11px]">Monthly Sales Projection</span>
        <div className="mt-1.5 grid gap-2 md:grid-cols-[minmax(0,0.85fr)_1px_minmax(0,1.15fr)] md:items-center">
          <div>
            <span className="block text-[9px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">Average Sales</span>
            <strong className="mt-0.75 block text-[1.2rem] font-black tracking-tight text-foreground">{money(averageDailySales)}</strong>
          </div>
          <div className="hidden h-9 w-px bg-border md:block" />
          <div>
            <span className="block text-[9px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">Monthly Projected Sales</span>
            <strong className="mt-0.75 block text-[1.4rem] font-black tracking-tight text-foreground sm:text-[1.6rem]">{money(projectedMonthlySales)}</strong>
          </div>
        </div>
      </GlowCard>
      <GlowCard className="p-3">
        <span className="block text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#c5a56a] sm:text-[11px]">
          Break-Even Projection vs Monthly Operational Expenses ({marginPercentage}% Margin)
        </span>
        <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
          <p className="rounded-[16px] border border-emerald-900/60 bg-emerald-950/35 px-2.5 py-1.5 text-[12px] font-semibold text-emerald-200">
            Projected Profit: {money(projectedProfit)}
          </p>
          <p className="rounded-[16px] border border-rose-900/60 bg-rose-950/35 px-2.5 py-1.5 text-[12px] font-semibold text-rose-200">
            Projected Loss: {money(projectedLoss)}
          </p>
        </div>
      </GlowCard>
    </section>
  )
}

