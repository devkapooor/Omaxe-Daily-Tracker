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
    <section className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
      <div className="flex flex-col gap-3 rounded-md border border-border bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-5 dark:bg-card">
        <div>
          <span className="block text-[11px] font-medium uppercase tracking-[0.06em] text-slate-500">Monthly Performance</span>
          <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-foreground">{performance.monthLabel}</h1>
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
