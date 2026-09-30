import type { Dispatch, SetStateAction } from 'react'
import { money, type DashboardMonthOffset } from '@/app/uiHelpers'
import { DashboardRangeFilter } from '@/features/dashboard/components/DashboardRangeFilter'
import { MonthlyProjectionPanel } from '@/features/dashboard/components/MonthlyProjectionPanel'
import { SummaryCard } from '@/features/dashboard/components/SummaryCard'
import type { MonthlyPerformanceMetrics } from '@/features/dashboard/hooks/useDashboardMetrics'

type DashboardPageProps = {
  marginPercentage: number
  monthOffset: DashboardMonthOffset
  performance: MonthlyPerformanceMetrics
  setMonthOffset: Dispatch<SetStateAction<DashboardMonthOffset>>
  totalLoans: number
  totalVendorOutstanding: number
}

export function DashboardPage({
  marginPercentage,
  monthOffset,
  performance,
  setMonthOffset,
  totalLoans,
  totalVendorOutstanding,
}: DashboardPageProps) {
  return (
    <section className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
      <div className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-card/70 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="block text-[10px] font-extrabold uppercase tracking-[0.18em] text-sky-300">Monthly Performance</span>
          <strong className="mt-0.5 block text-lg font-black text-foreground">{performance.monthLabel}</strong>
        </div>
        <DashboardRangeFilter value={monthOffset} onChange={setMonthOffset} />
      </div>
      <MonthlyProjectionPanel performance={performance} marginPercentage={marginPercentage} />
      <div>
        <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">Current Financial Position</span>
        <div className="grid gap-1.5 md:grid-cols-2">
          <SummaryCard label="Open Loan Balance" value={money(totalLoans)} />
          <SummaryCard label="Vendor Outstanding" value={money(totalVendorOutstanding)} />
        </div>
      </div>
    </section>
  )
}
