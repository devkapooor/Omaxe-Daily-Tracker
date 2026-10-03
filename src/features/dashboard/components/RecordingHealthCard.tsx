import { formatDisplayDate } from '@/app/uiHelpers'
import type { MonthlyPerformanceMetrics, RecordingCoverage } from '@/features/dashboard/domain/deriveMonthlyPerformance'
import { GlowCard } from '@/shared/ui/spotlight-card'

function CoverageRow({ label, coverage }: { label: string; coverage: RecordingCoverage }) {
  const percentage = coverage.coverageDays > 0 ? Math.min((coverage.recordedDays / coverage.coverageDays) * 100, 100) : 0

  return (
    <div className="rounded-sm border border-border bg-muted px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <strong className="font-mono text-sm font-semibold tabular-nums text-foreground">{coverage.recordedDays} / {coverage.coverageDays} days</strong>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-sky-400" style={{ width: `${percentage}%` }} />
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Latest record: {coverage.latestDate ? formatDisplayDate(coverage.latestDate) : 'No record'}
      </p>
    </div>
  )
}

export function RecordingHealthCard({ performance }: { performance: MonthlyPerformanceMetrics }) {
  return (
    <GlowCard glowColor="neutral" className="p-4">
      <span className="block text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Recording Health</span>
      <strong className="mt-2 block text-base font-semibold text-foreground">Calendar-day coverage</strong>
      <div className="mt-3 space-y-2">
        <CoverageRow label="Sales" coverage={performance.recordingHealth.sales} />
        <CoverageRow label="Cashouts" coverage={performance.recordingHealth.cashouts} />
      </div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        Coverage is informational. Closed days and holidays are not marked as missing.
      </p>
    </GlowCard>
  )
}
