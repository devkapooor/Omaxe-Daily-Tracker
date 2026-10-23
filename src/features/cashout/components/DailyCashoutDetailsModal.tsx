import type { DailyCashoutEntry } from '@/domain/appTypes'
import { useEffect, useRef } from 'react'
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
  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!entry) return
    const previous = document.activeElement as HTMLElement | null
    const controls = () => [...(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || [])]
    controls()[0]?.focus()
    function handle(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); onClose() }
      if (event.key === 'Tab') {
        const nodes = controls(), first = nodes[0], last = nodes.at(-1)
        if (!first || !last) return
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', handle)
    return () => { document.removeEventListener('keydown', handle); previous?.focus() }
  }, [entry, onClose])
  if (!entry) return null

  const drawerTotal = entry.drawerTotal ?? entry.remainingBalance
  const auditDifference = entry.auditDifference ?? (entry.cashAudit === null ? null : entry.cashAudit - drawerTotal)
  const auditStatus =
    entry.auditStatus ?? (auditDifference === null ? 'not-reconciled' : auditDifference > 0 ? 'cash-less' : auditDifference < 0 ? 'cash-more' : 'matched')
  const auditMessage =
    entry.auditMessage ??
    (auditDifference === null ? 'Expected drawer unavailable for this historical count.' : auditDifference > 0
      ? `WARNING: Cash is less by ${auditDifference}.`
      : auditDifference < 0
        ? `Cash is more by ${Math.abs(auditDifference)}, probably wrong billings.`
        : 'Cash matches the system audit.')

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/40 px-3 py-6 backdrop-blur-sm">
      <Card ref={dialogRef} role="dialog" aria-modal="true" aria-label="Cashout details" className="max-h-[90dvh] w-full max-w-3xl overflow-y-auto">
        <CardHeader className="gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-3">
              <SectionHeading eyebrow="Cash Drawer Particulars" title="Complete Daily Cashout" />
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{entry.recordedBy}</Badge>
                <Badge variant={auditStatus === 'matched' ? 'success' : auditStatus === 'not-reconciled' ? 'outline' : 'warning'}>
                  {auditStatus === 'matched' ? 'Audit Matched' : auditStatus === 'cash-less' ? 'Cash Less' : auditStatus === 'cash-more' ? 'Cash More' : 'Not reconciled'}
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
          <DetailBlock label={entry.financePostingVersion === 1 ? 'Gross Cash Sales' : 'Cash Sales'} value={money(entry.cashSales)} />
          <DetailBlock label="UPI Sales" value={money(entry.upiSales)} />
          <DetailBlock label="Card Sales" value={entry.cardSales === undefined ? 'Not recorded on this entry' : money(entry.cardSales)} />
          <DetailBlock label="Credit Sales" value={money(entry.creditSales)} />
          <DetailBlock label="Returns" value={money(entry.returns)} />
          <DetailBlock label={entry.financePostingVersion === 1 ? 'Cash Paid Out (including refunds)' : 'Cash Expense'} value={money(entry.cashExpense ?? 0)} />
          <DetailBlock label="System Audit" value={entry.cashAudit === null ? 'Unavailable for this historical count' : money(entry.cashAudit)} />
          <DetailBlock label="Drawer Total" value={money(drawerTotal)} />
          <DetailBlock label="Remaining Balance" value={money(entry.remainingBalance)} />
          {entry.financePostingVersion === 1 ? <DetailBlock className="md:col-span-2 xl:col-span-3" label="Cash Basis" value="Cash Paid Out includes cash refunds, vendor cash payments and ordinary cash expenses. Refunds shown separately are part of that total; they are not another deduction." /> : null}
          <DetailBlock label="Revision" value={String(entry.revision ?? 1)} />
          {entry.updatedAt ? <DetailBlock label="Last Corrected" value={`${formatDisplayDateTime(entry.updatedAt)} by ${entry.updatedBy ?? 'Owner'}`} /> : null}
          <DetailBlock className="md:col-span-2 xl:col-span-3" label="Audit Status" value={auditMessage} />
          <DetailBlock className="md:col-span-2 xl:col-span-3" label="Cash Drawer Particulars" value={entry.actualCashParticulars} />
          <DetailBlock className="md:col-span-2 xl:col-span-3" label="Pending Cash Particulars" value={entry.pendingCashParticulars} />
          <DetailBlock
            className="md:col-span-2 xl:col-span-3"
            label="Staff Cash Balances At Close"
            value={entry.holderBalancesAtClose?.length
              ? entry.holderBalancesAtClose.map((balance) => `${balance.name}: ${money(balance.amountPaise / 100)}`).join('\n')
              : 'Not recorded on this historical cashout.'}
          />
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

