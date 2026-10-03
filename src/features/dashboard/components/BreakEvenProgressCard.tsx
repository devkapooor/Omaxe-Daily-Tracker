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
      <GlowCard glowColor="orange" className="h-full p-2.5">
        <span className="block text-[10px] font-extrabold uppercase tracking-[0.16em] text-blue-700 sm:text-[11px] dark:text-blue-300">Break-Even Progress</span>
        <strong className="mt-1 block text-base font-black text-foreground">Margin setting required</strong>
        <p className="mt-1 text-[9px] font-semibold leading-snug text-muted-foreground">
          Add a margin above 0% in Settings to calculate the sales needed to cover monthly operating expenses.
        </p>
      </GlowCard>
    )
  }

  const displayedProgress = Math.min(Math.max(breakEven.progressPercentage, 0), 100)
  const status = breakEven.attained ? 'Break-even reached' : `${breakEven.progressPercentage.toFixed(1)}% covered`

  return (
    <GlowCard glowColor={breakEven.attained ? 'green' : 'orange'} className="h-full p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="block text-[10px] font-extrabold uppercase tracking-[0.16em] text-blue-700 sm:text-[11px] dark:text-blue-300">Break-Even Progress</span>
          <strong className={breakEven.attained ? 'block text-sm font-black text-emerald-700' : 'block text-sm font-black text-foreground'}>
            {status}
          </strong>
        </div>
        <span className="shrink-0 rounded-full border border-border/70 bg-background/45 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.1em] text-muted-foreground">
          {marginPercentage}% margin
        </span>
      </div>

      <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-label="Break-even sales progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(displayedProgress)}>
        <div
          className={breakEven.attained ? 'h-full rounded-full bg-emerald-400' : 'h-full rounded-full bg-cyan-400'}
          style={{ width: `${displayedProgress}%` }}
        />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <div className="rounded-xl border border-border/60 bg-background/35 px-2 py-1.5">
          <span className="block text-[9px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">Break-Even Sales</span>
          <strong className="mt-0.5 block text-sm font-black text-foreground">{money(breakEven.breakEvenSales)}</strong>
        </div>
        <div className="rounded-xl border border-border/60 bg-background/35 px-2 py-1.5">
          <span className="block text-[9px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">
            {breakEven.attained ? 'Above Break-Even' : 'Amount Remaining'}
          </span>
          <strong className={breakEven.attained ? 'mt-0.5 block text-sm font-black text-emerald-700' : 'mt-0.5 block text-sm font-black text-foreground'}>
            {money(breakEven.attained ? performance.sales - breakEven.breakEvenSales : breakEven.amountRemaining ?? 0)}
          </strong>
        </div>
      </div>

      {performance.isCurrentMonth && !breakEven.attained && breakEven.requiredDailySales !== null ? (
        <p className="mt-1.5 text-[9px] font-semibold leading-snug text-muted-foreground">
          {money(breakEven.requiredDailySales)} needed per remaining calendar day ({breakEven.remainingDays} days including today).
        </p>
      ) : null}
    </GlowCard>
  )
}
