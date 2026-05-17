import { formatDisplayDate, money, type CashHolderAssignment } from '@/app/uiHelpers'
import type { CashHolder } from '@/domain/appTypes'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { SectionHeading } from '@/components/ui/section-heading'

type DailyCashoutFinalSummaryPanelProps = {
  dailyFinalSummary: {
    date: string | null
    totalSales: number
    cashSales: number
    upiSales: number
    creditSales: number
    returns: number
    cashExpenses: number
    cashToHand: number
    transfersToday: number
  }
  pendingCashBalances: Record<CashHolder, number>
  holderAssignments: CashHolderAssignment[]
}

export function DailyCashoutFinalSummaryPanel({
  dailyFinalSummary,
  pendingCashBalances,
  holderAssignments,
}: DailyCashoutFinalSummaryPanelProps) {
  const pendingCashSummary = holderAssignments
    .map((assignment) => `${assignment.label} ${money(pendingCashBalances[assignment.holder] ?? 0)}`)
    .join(' | ')

  const rows = [
    ['Total Sales (Cash + UPI + Credit - Returns)', money(dailyFinalSummary.totalSales)],
    ['Total Expenses (Expense Register)', money(dailyFinalSummary.cashExpenses)],
    ['Cash To Hand (Cash Sales - Cash Expenses)', money(dailyFinalSummary.cashToHand)],
    ['Cash Transferred Today', money(dailyFinalSummary.transfersToday)],
    ['Net Pending Cash By Person', pendingCashSummary],
  ]

  return (
    <Card>
      <CardHeader>
        <SectionHeading
          eyebrow={dailyFinalSummary.date ? `Latest Closed Day - ${formatDisplayDate(dailyFinalSummary.date)}` : 'Latest Closed Day'}
          title="Daily Cashout Final Summary"
        />
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-2 rounded-3xl border border-border/70 bg-secondary/55 p-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm font-medium text-muted-foreground">{label}</span>
            <strong className="text-sm font-bold text-foreground">{value}</strong>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
