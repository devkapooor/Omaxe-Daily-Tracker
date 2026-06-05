import { formatDisplayDate, type LegacyCashBalance, money, type PendingCashUserBalance } from '@/app/uiHelpers'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { SectionHeading } from '@/shared/ui/section-heading'

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
  userBalances: PendingCashUserBalance[]
  legacyBalances: LegacyCashBalance[]
}

export function DailyCashoutFinalSummaryPanel({
  dailyFinalSummary,
  userBalances,
  legacyBalances,
}: DailyCashoutFinalSummaryPanelProps) {
  const pendingCashSummary = userBalances
    .map((entry) => `${entry.name} ${money(entry.amount)}`)
    .concat(legacyBalances.filter((entry) => entry.amount !== 0).map((entry) => `Legacy ${entry.label} ${money(entry.amount)}`))
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
      <CardContent className="space-y-2.5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-1.5 rounded-[18px] border border-border/70 bg-secondary/55 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm font-medium text-muted-foreground">{label}</span>
            <strong className="text-sm font-bold text-foreground">{value}</strong>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

