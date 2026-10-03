import { useEffect, useState } from 'react'
import { Printer, X } from 'lucide-react'
import type { PayrollEvent, SalarySlip, SalarySlipRevision } from '@/features/payroll/domain/payroll'
import { formatPayrollMinutes } from '@/features/payroll/domain/payroll'
import { subscribeSalarySlipHistory } from '@/features/payroll/data/payrollRepository'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { SectionHeading } from '@/shared/ui/section-heading'
import { StatusPanel } from '@/shared/ui/status-panel'

function money(paise: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(paise / 100)
}

function dateTime(value: string) {
  if (!value) return 'Pending timestamp'
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function statusVariant(state: SalarySlip['paymentState']) {
  if (state === 'paid') return 'success' as const
  if (state === 'overpaid') return 'warning' as const
  if (state === 'additional-due') return 'destructive' as const
  return 'secondary' as const
}

type SalarySlipDetailsProps = {
  slip: SalarySlip
  onClose?: () => void
}

export function SalarySlipDetails({ slip, onClose }: SalarySlipDetailsProps) {
  const [revisions, setRevisions] = useState<SalarySlipRevision[]>([])
  const [events, setEvents] = useState<PayrollEvent[]>([])
  const [error, setError] = useState('')

  useEffect(() => subscribeSalarySlipHistory(slip.id, slip.employeeUserId, (history) => {
    setRevisions(history.revisions)
    setEvents(history.events)
    setError('')
  }, (cause) => setError(cause.message)), [slip.employeeUserId, slip.id])

  const current = revisions.find((revision) => revision.revision === slip.currentRevision)
  const calculation = current?.calculation ?? slip.currentCalculation
  const payments = events.filter((event) => event.type === 'payment-recorded')

  return (
    <Card className="payroll-print-area">
      <CardHeader className="flex-row items-start justify-between gap-3">
        <SectionHeading
          eyebrow={`Salary Slip · ${slip.payrollMonth}`}
          title={slip.employeeName}
          description={`Revision ${slip.currentRevision} · Finalized by ${slip.finalizedByName}`}
        />
        <div className="flex shrink-0 gap-2 print:hidden">
          <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="size-3.5" /> Print</Button>
          {onClose ? <Button aria-label="Close salary slip" size="icon" variant="ghost" onClick={onClose}><X className="size-4" /></Button> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <StatusPanel variant="destructive">{error}</StatusPanel> : null}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={statusVariant(slip.paymentState)}>{slip.paymentState.replace('-', ' ')}</Badge>
          <span className="text-xs text-muted-foreground">Issued {dateTime(slip.finalizedAt)}</span>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-border/70 bg-secondary/25 p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Base Pay</p><p className="mt-1 font-bold">{money(calculation.basePayPaise)}</p></div>
          <div className="rounded-xl border border-border/70 bg-secondary/25 p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Net Salary</p><p className="mt-1 font-bold">{money(calculation.netPayPaise)}</p></div>
          <div className="rounded-xl border border-border/70 bg-secondary/25 p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Paid</p><p className="mt-1 font-bold">{money(slip.totalPaidPaise)}</p></div>
          <div className="rounded-xl border border-border/70 bg-secondary/25 p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Outstanding</p><p className="mt-1 font-bold">{money(slip.outstandingPaise)}</p></div>
        </div>

        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="space-y-1 rounded-xl border border-border/70 p-3">
            <p><span className="text-muted-foreground">Worked:</span> {formatPayrollMinutes(calculation.workedMinutes)}</p>
            <p><span className="text-muted-foreground">Paid leave:</span> {formatPayrollMinutes(calculation.paidLeaveMinutes)}</p>
            <p><span className="text-muted-foreground">Paid weekly offs:</span> {calculation.paidWeeklyOffDays} days</p>
            <p><span className="text-muted-foreground">Payable time:</span> {formatPayrollMinutes(calculation.payableMinutes)}</p>
          </div>
          <div className="space-y-1 rounded-xl border border-border/70 p-3">
            <p><span className="text-muted-foreground">Monthly salary:</span> {money(calculation.monthlySalaryPaise)}</p>
            <p><span className="text-muted-foreground">Earnings:</span> {money(calculation.earningsPaise)}</p>
            <p><span className="text-muted-foreground">Deductions:</span> {money(calculation.deductionsPaise)}</p>
            {slip.overpaidPaise > 0 ? <p><span className="text-muted-foreground">Overpaid:</span> {money(slip.overpaidPaise)}</p> : null}
          </div>
        </div>

        {(calculation.earnings.length > 0 || calculation.deductions.length > 0) ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div><h3 className="mb-2 text-xs font-bold uppercase tracking-wider">Earnings</h3>{calculation.earnings.length ? calculation.earnings.map((item) => <p className="flex justify-between text-sm" key={item.id}><span>{item.label}</span><span>{money(item.amountPaise)}</span></p>) : <p className="text-sm text-muted-foreground">None</p>}</div>
            <div><h3 className="mb-2 text-xs font-bold uppercase tracking-wider">Deductions</h3>{calculation.deductions.length ? calculation.deductions.map((item) => <p className="flex justify-between text-sm" key={item.id}><span>{item.label}</span><span>{money(item.amountPaise)}</span></p>) : <p className="text-sm text-muted-foreground">None</p>}</div>
          </div>
        ) : null}

        {payments.length ? (
          <div><h3 className="mb-2 text-xs font-bold uppercase tracking-wider">Payment Evidence</h3>{payments.map((payment) => <p className="text-sm" key={payment.id}>{payment.paymentDate} · {payment.paymentMethod} · {money(payment.amountPaise ?? 0)}{payment.paymentReference ? ` · ${payment.paymentReference}` : ''}</p>)}</div>
        ) : null}

        {revisions.length > 1 ? (
          <div><h3 className="mb-2 text-xs font-bold uppercase tracking-wider">Revision History</h3>{revisions.map((revision) => <div className="mb-2 rounded-xl border border-border/60 p-3 text-sm" key={revision.id}><p className="font-semibold">Revision {revision.revision} · {money(revision.calculation.netPayPaise)}</p><p className="text-muted-foreground">{revision.reason} · {dateTime(revision.createdAt)}</p></div>)}</div>
        ) : null}

        {current ? <p className="border-t border-border/60 pt-3 text-xs text-muted-foreground">Issued by {current.issuer.name}{current.issuer.address ? ` · ${current.issuer.address}` : ''}{current.issuer.contact ? ` · ${current.issuer.contact}` : ''}</p> : null}
      </CardContent>
    </Card>
  )
}
