import type { DailyCashoutEntry } from '@/domain/appTypes'
import { createPortal } from 'react-dom'
import { formatDisplayDate, formatDisplayDateTime, money } from '@/app/uiHelpers'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { SectionHeading } from '@/shared/ui/section-heading'

type DailyCashoutDetailsModalProps = {
  entry: DailyCashoutEntry | null
  onClose: () => void
}

export function DailyCashoutDetailsModal({ entry, onClose }: DailyCashoutDetailsModalProps) {
  if (!entry) return null

  const drawerTotal = entry.drawerTotal ?? entry.remainingBalance
  const auditDifference = entry.auditDifference ?? entry.cashAudit - drawerTotal
  const auditStatus =
    entry.auditStatus ?? (auditDifference > 0 ? 'cash-less' : auditDifference < 0 ? 'cash-more' : 'matched')
  const auditMessage =
    entry.auditMessage ??
    (auditDifference > 0
      ? `WARNING: Cash is less by ${auditDifference}.`
      : auditDifference < 0
        ? `Cash is more by ${Math.abs(auditDifference)}, probably wrong billings.`
        : 'Cash matches the system audit.')

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/40 px-3 py-6 backdrop-blur-sm">
      <Card className="max-h-[90vh] w-full max-w-3xl overflow-y-auto">
        <CardHeader className="gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-3">
              <SectionHeading eyebrow="Cash Drawer Particulars" title="Complete Daily Cashout" />
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{entry.recordedBy}</Badge>
                <Badge variant={auditStatus === 'matched' ? 'success' : 'warning'}>
                  {auditStatus === 'matched' ? 'Audit Matched' : auditStatus === 'cash-less' ? 'Cash Less' : 'Cash More'}
                </Badge>
              </div>
            </div>
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
          <p className="text-sm font-medium text-muted-foreground">
            Review the complete saved daily cashout for {formatDisplayDate(entry.date)}.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <DetailBlock label="Date" value={formatDisplayDate(entry.date)} />
          <DetailBlock label="Recorded By" value={entry.recordedBy} />
          <DetailBlock label="Created At" value={formatDisplayDateTime(entry.createdAt)} />
          <DetailBlock label="Cash Sales" value={money(entry.cashSales)} />
          <DetailBlock label="UPI Sales" value={money(entry.upiSales)} />
          <DetailBlock label="Credit Sales" value={money(entry.creditSales)} />
          <DetailBlock label="System Audit" value={money(entry.cashAudit)} />
          <DetailBlock label="Drawer Total" value={money(drawerTotal)} />
          <DetailBlock label="Remaining Balance" value={money(entry.remainingBalance)} />
          <DetailBlock className="md:col-span-2 xl:col-span-3" label="Audit Status" value={auditMessage} />
          <DetailBlock className="md:col-span-2 xl:col-span-3" label="Cash Drawer Particulars" value={entry.actualCashParticulars} />
          <DetailBlock className="md:col-span-2 xl:col-span-3" label="Pending Cash Particulars" value={entry.pendingCashParticulars} />
        </CardContent>
      </Card>
    </div>,
    document.body,
  )
}

function DetailBlock({
  className,
  label,
  value,
}: {
  className?: string
  label: string
  value: string
}) {
  return (
    <div className={className ? `space-y-1 ${className}` : 'space-y-1'}>
      <span className="block text-[11px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
      <pre className="whitespace-pre-wrap font-sans text-sm text-foreground">{value}</pre>
    </div>
  )
}

