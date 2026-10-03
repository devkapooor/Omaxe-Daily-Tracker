import { money } from '@/app/uiHelpers'
import type { MonthlyPerformanceMetrics } from '@/features/dashboard/domain/deriveMonthlyPerformance'
import { GlowCard } from '@/shared/ui/spotlight-card'

type BreakEvenProgressCardProps = {
  performance: MonthlyPerformanceMetrics
  marginPercentage: number
}

export function BreakEvenProgressCard({ performance, marginPercentage }: BreakEvenProgressCardProps) {
  const { breakEven } = performance

  if (breakEven.breakEvenSales === null || breakEven.progressPercentage === null) {
    return (
      <GlowCard glowColor="orange" className="h-full p-4">
        <span className="block text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Break-Even Progress</span>
        <strong className="mt-2 block text-base font-semibold text-foreground">Margin setting required</strong>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Add a margin above 0% in Settings to calculate the sales needed to cover monthly operating expenses.
        </p>
      </GlowCard>
    )
  }

  const displayedProgress = Math.min(Math.max(breakEven.progressPercentage, 0), 100)
  const status = breakEven.attained ? 'Break-even reached' : `${breakEven.progressPercentage.toFixed(1)}% covered`

  return (
    <GlowCard glowColor={breakEven.attained ? 'green' : 'orange'} className="h-full p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="block text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Break-Even Progress</span>
          <strong className={breakEven.attained ? 'block text-sm font-semibold text-emerald-700' : 'block text-sm font-semibold text-foreground'}>
            {status}
          </strong>
        </div>
        <span className="shrink-0 rounded-sm border border-border bg-muted px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {marginPercentage}% margin
        </span>
      </div>

      <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-label="Break-even sales progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(displayedProgress)}>
        <div
          className={breakEven.attained ? 'h-full rounded-full bg-emerald-400' : 'h-full rounded-full bg-cyan-400'}
          style={{ width: `${displayedProgress}%` }}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-sm border border-border bg-muted px-3 py-2">
          <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Break-Even Sales</span>
          <strong className="mt-1 block font-mono text-sm font-semibold tabular-nums text-foreground">{money(breakEven.breakEvenSales)}</strong>
        </div>
        <div className="rounded-sm border border-border bg-muted px-3 py-2">
          <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {breakEven.attained ? 'Above Break-Even' : 'Amount Remaining'}
          </span>
          <strong className={breakEven.attained ? 'mt-1 block font-mono text-sm font-semibold tabular-nums text-emerald-700' : 'mt-1 block font-mono text-sm font-semibold tabular-nums text-foreground'}>
            {money(breakEven.attained ? performance.sales - breakEven.breakEvenSales : breakEven.amountRemaining ?? 0)}
          </strong>
        </div>
      </div>

      {performance.isCurrentMonth && !breakEven.attained && breakEven.requiredDailySales !== null ? (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          {money(breakEven.requiredDailySales)} needed per remaining calendar day ({breakEven.remainingDays} days including today).
        </p>
      ) : null}
    </GlowCard>
  )
}
