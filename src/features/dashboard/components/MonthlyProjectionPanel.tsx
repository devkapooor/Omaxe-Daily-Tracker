import { money } from '@/app/uiHelpers'
import { BreakEvenProgressCard } from '@/features/dashboard/components/BreakEvenProgressCard'
import { DailySalesTrendCard } from '@/features/dashboard/components/DailySalesTrendCard'
import { RecordingHealthCard } from '@/features/dashboard/components/RecordingHealthCard'
import type { MonthlyPerformanceMetrics } from '@/features/dashboard/domain/deriveMonthlyPerformance'
import { GlowCard } from '@/shared/ui/spotlight-card'
import { SummaryCard } from '@/features/dashboard/components/SummaryCard'

type MonthlyProjectionPanelProps = {
  performance: MonthlyPerformanceMetrics
  marginPercentage: number
}

function comparison(current: number, previous: number, positiveIsGood = true) {
  if (previous === 0) {
    return { label: 'No prior month data', tone: 'neutral' as const }
  }

  const difference = current - previous
  const percentage = Math.abs((difference / previous) * 100)
  const direction = difference > 0 ? '+' : difference < 0 ? '-' : ''
  const isPositive = positiveIsGood ? difference > 0 : difference < 0
  const isNegative = positiveIsGood ? difference < 0 : difference > 0
  return {
    label: `${direction}${money(Math.abs(difference))} (${percentage.toFixed(1)}%) vs prior`,
    tone: isPositive ? 'positive' as const : isNegative ? 'negative' as const : 'neutral' as const,
  }
}

const mixMeta = [
  { key: 'cash', label: 'Cash', color: 'bg-cyan-400' },
  { key: 'upi', label: 'UPI', color: 'bg-blue-500' },
  { key: 'credit', label: 'Credit', color: 'bg-indigo-400' },
  { key: 'returns', label: 'Returns', color: 'bg-rose-500' },
] as const

function percentageOfMix(value: number, total: number) {
  return total > 0 ? (value / total) * 100 : 0
}

function formatPercentage(value: number) {
  return `${value.toFixed(value === 0 ? 0 : 1)}%`
}

export function MonthlyProjectionPanel({ performance, marginPercentage }: MonthlyProjectionPanelProps) {
  const mixTotal = Object.values(performance.salesMix).reduce((total, value) => total + value, 0)
  const salesMix = mixMeta.map((item) => ({
    ...item,
    percentage: percentageOfMix(performance.salesMix[item.key], mixTotal),
  }))
  const resultIsProfit = performance.estimatedMarginResult >= 0

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Total Sales" value={money(performance.sales)} comparison={comparison(performance.sales, performance.previous.sales)} />
        <SummaryCard label="Recorded Expenses" value={money(performance.expenses)} comparison={comparison(performance.expenses, performance.previous.expenses, false)} />
        <SummaryCard label="Net After Recorded Expenses" value={money(performance.operatingBalance)} comparison={comparison(performance.operatingBalance, performance.previous.operatingBalance)} />
        <SummaryCard label="Cash Collected" value={money(performance.cashCollected)} comparison={comparison(performance.cashCollected, performance.previous.cashCollected)} />
      </div>

      <section className="grid auto-rows-fr items-stretch gap-3 lg:grid-cols-2 xl:grid-cols-3">
        <GlowCard glowColor="blue" className="h-full p-4">
          <span className="block text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
            {performance.isCurrentMonth ? 'Month-End Outlook' : 'Completed Month Result'}
          </span>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="min-w-0">
              <span className="block text-[11px] font-medium uppercase leading-tight tracking-wide text-muted-foreground xl:whitespace-nowrap">Average Daily Sales</span>
              <strong className="mt-1 block font-mono text-base font-semibold tabular-nums text-foreground">{money(performance.averageDailySales)}</strong>
            </div>
            <div className="min-w-0">
                <span className="block text-[11px] font-medium uppercase leading-tight tracking-wide text-muted-foreground xl:whitespace-nowrap">
                {performance.isCurrentMonth ? 'Projected Sales' : 'Final Sales'}
              </span>
              <strong className="mt-1 block font-mono text-base font-semibold tabular-nums text-foreground">{money(performance.outlookSales)}</strong>
            </div>
            <div className="min-w-0">
                <span className="block text-[11px] font-medium uppercase leading-tight tracking-wide text-muted-foreground xl:whitespace-nowrap">
                {performance.isCurrentMonth ? 'Projected' : 'Estimated'} {resultIsProfit ? 'Profit' : 'Loss'}
              </span>
              <strong className={resultIsProfit ? 'mt-1 block font-mono text-base font-semibold tabular-nums text-emerald-700' : 'mt-1 block font-mono text-base font-semibold tabular-nums text-rose-700'}>
                {money(Math.abs(performance.estimatedMarginResult))}
              </strong>
            </div>
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">Estimated using {marginPercentage}% margin and configured monthly operating expenses.</p>
        </GlowCard>

        <BreakEvenProgressCard performance={performance} marginPercentage={marginPercentage} />

        <GlowCard glowColor="blue" className="h-full p-4">
          <span className="block text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Sales Mix</span>
          <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-secondary" role="img" aria-label={`Sales mix percentages for ${performance.monthLabel}`}>
            {salesMix.map((item) => (
              <span
                key={item.key}
                className={item.color}
                style={{ width: `${item.percentage}%` }}
                title={`${item.label}: ${formatPercentage(item.percentage)}`}
              />
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {salesMix.map((item) => (
                <div key={item.key} className="rounded border border-border bg-muted px-2.5 py-2">
                <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  <span className={`h-2 w-2 rounded-full ${item.color}`} />
                  {item.label}
                </span>
                <strong className="mt-1 block font-mono text-sm font-semibold tabular-nums text-foreground">{formatPercentage(item.percentage)}</strong>
              </div>
            ))}
          </div>
        </GlowCard>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        <DailySalesTrendCard performance={performance} />
        <RecordingHealthCard performance={performance} />
      </section>
    </div>
  )
}

