import type { LoanEntry } from '@/domain/appTypes'
import { formatDisplayDate, formatDisplayDateTime, money } from '@/app/uiHelpers'
import { Badge } from '@/shared/ui/badge'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { SectionHeading } from '@/shared/ui/section-heading'

type LoanLedgerProps = {
  loans: LoanEntry[]
}

export function LoanLedger({ loans }: LoanLedgerProps) {
  return (
    <Card>
      <CardHeader>
        <SectionHeading eyebrow="Loan Ledger" title="Saved Loans" />
      </CardHeader>
      <CardContent>
        <div className="grid gap-3">
          {loans.length === 0 ? <p className="text-sm font-medium text-muted-foreground">No loans recorded yet.</p> : null}
          {loans.map((loan) => (
            <article
              className="grid gap-3 rounded-[20px] border border-border/70 bg-secondary/55 p-4 lg:grid-cols-[minmax(0,1.3fr)_repeat(5,minmax(0,0.8fr))]"
              key={loan.id}
            >
              <div className="space-y-1">
                <strong className="text-base font-bold text-foreground">{loan.personName}</strong>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{loan.status}</Badge>
                  <span className="text-sm text-muted-foreground">Loan Date: {formatDisplayDate(loan.date)}</span>
                  <span className="text-sm text-muted-foreground">Payoff: {formatDisplayDate(loan.promisedPayoffDate)}</span>
                </div>
              </div>
              <Metric label="Original" value={money(loan.amount)} />
              <Metric label="Paid" value={money(loan.paidAmount)} />
              <Metric label="Remaining" value={money(loan.remainingAmount)} />
              <Metric label="Status" value={loan.status} />
              <Metric label="Settled At" value={loan.settledAt ? formatDisplayDateTime(loan.settledAt) : '-'} />
            </article>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <span className="block text-[11px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
      <strong className="text-sm font-bold text-foreground">{value}</strong>
    </div>
  )
}

