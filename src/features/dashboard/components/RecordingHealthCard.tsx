import { formatDisplayDate } from '@/app/uiHelpers'
import type { MonthlyPerformanceMetrics, RecordingCoverage } from '@/features/dashboard/domain/deriveMonthlyPerformance'
import { GlowCard } from '@/shared/ui/spotlight-card'

function CoverageRow({ label, coverage }: { label: string; coverage: RecordingCoverage }) {
  const percentage = coverage.coverageDays > 0 ? Math.min((coverage.recordedDays / coverage.coverageDays) * 100, 100) : 0

  return (
    <div className="rounded-xl border border-border/60 bg-background/35 px-2.5 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
        <strong className="text-sm font-black text-foreground">{coverage.recordedDays} / {coverage.coverageDays} days</strong>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-sky-400" style={{ width: `${percentage}%` }} />
      </div>
      <p className="mt-1.5 text-[9px] font-semibold text-muted-foreground">
        Latest record: {coverage.latestDate ? formatDisplayDate(coverage.latestDate) : 'No record'}
      </p>
    </div>
  )
}

export function RecordingHealthCard({ performance }: { performance: MonthlyPerformanceMetrics }) {
  return (
    <GlowCard glowColor="neutral" className="p-3">
      <span className="block text-[10px] font-extrabold uppercase tracking-[0.16em] text-blue-700 sm:text-[11px] dark:text-blue-300">Recording Health</span>
      <strong className="mt-1 block text-base font-black text-foreground">Calendar-day coverage</strong>
      <div className="mt-2 space-y-2">
        <CoverageRow label="Sales" coverage={performance.recordingHealth.sales} />
        <CoverageRow label="Cashouts" coverage={performance.recordingHealth.cashouts} />
      </div>
      <p className="mt-2 text-[9px] font-semibold leading-relaxed text-muted-foreground">
        Coverage is informational. Closed days and holidays are not marked as missing.
      </p>
    </GlowCard>
  )
}
