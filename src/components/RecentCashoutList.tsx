import type { Cashout } from '@/domain/financeTypes'
import { money } from '@/app/uiHelpers'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { FieldLabel } from '@/components/ui/field-label'
import { Input } from '@/components/ui/input'
import { SectionHeading } from '@/components/ui/section-heading'

type RecentCashoutListProps = {
  cashouts: Cashout[]
  filterDate: string
  onFilterDateChange: (date: string) => void
}

export function RecentCashoutList({ cashouts, filterDate, onFilterDateChange }: RecentCashoutListProps) {
  return (
    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-end sm:justify-between">
        <SectionHeading eyebrow="Latest" title="Recent Expenses" />
        <FieldLabel className="w-full sm:max-w-[180px]" label="Date">
          <Input type="date" value={filterDate} onChange={(event) => onFilterDateChange(event.target.value)} />
        </FieldLabel>
      </CardHeader>

      <CardContent>
        <div className="grid gap-3">
          {cashouts.length === 0 && <p className="text-sm font-medium text-muted-foreground">No cashout entries yet.</p>}
          {cashouts.map((cashout) => (
            <article
              key={cashout.id}
              className="flex flex-col gap-2 rounded-3xl border border-border/70 bg-secondary/55 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="space-y-1">
                <strong className="text-base font-bold text-foreground">{cashout.paidTo}</strong>
                <p className="text-sm text-muted-foreground">
                  {cashout.date} - {cashout.category} - {cashout.paymentMode}
                </p>
              </div>
              <strong className="text-base font-bold text-foreground">{money(cashout.amount)}</strong>
            </article>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
