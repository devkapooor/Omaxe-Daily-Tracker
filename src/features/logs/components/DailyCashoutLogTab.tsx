import { useMemo, useState } from 'react'
import type { CashoutCorrectionRequest, CashoutCorrectionValues, DailyCashoutEntry } from '@/domain/appTypes'
import { drawerTotalFromDenominations } from '@/domain/cashoutCorrections'
import { formatDisplayDate, formatDisplayDateTime, money } from '@/app/uiHelpers'
import { CashoutCorrectionForm } from '@/features/cashout/components/CashoutCorrectionForm'
import { DailyCashoutDetailsModal } from '@/features/cashout/components/DailyCashoutDetailsModal'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { FieldLabel } from '@/shared/ui/field-label'
import { Input } from '@/shared/ui/input'
import { SectionHeading } from '@/shared/ui/section-heading'
import { useConfirmationDialog } from '@/shared/ui/confirmation-dialog'

type DailyCashoutLogTabProps = {
  correctionRequests: CashoutCorrectionRequest[]
  entries: DailyCashoutEntry[]
  onApproveCorrection: (request: CashoutCorrectionRequest) => Promise<void> | void
  onDelete: (entry: DailyCashoutEntry) => Promise<void> | void
  onEdit: (entry: DailyCashoutEntry, values: CashoutCorrectionValues, reason: string) => Promise<void> | void
  onRejectCorrection: (request: CashoutCorrectionRequest, reason: string) => Promise<void> | void
}

export function DailyCashoutLogTab({
  correctionRequests,
  entries,
  onApproveCorrection,
  onDelete,
  onEdit,
  onRejectCorrection,
}: DailyCashoutLogTabProps) {
  const confirmation = useConfirmationDialog()
  const [month, setMonth] = useState('')
  const [search, setSearch] = useState('')
  const [selectedEntry, setSelectedEntry] = useState<DailyCashoutEntry | null>(null)
  const [editingEntry, setEditingEntry] = useState<DailyCashoutEntry | null>(null)
  const pendingRequests = correctionRequests.filter((request) => request.status === 'pending')
  const reviewedRequests = correctionRequests.filter((request) => request.status !== 'pending').slice(0, 10)
  const filteredEntries = useMemo(() => {
    const query = search.trim().toLowerCase()
    return entries
      .filter((entry) => {
        const monthMatch = !month || entry.date.slice(0, 7) === month
        const searchMatch = !query || entry.recordedBy.toLowerCase().includes(query) ||
          (entry.auditStatus ?? '').toLowerCase().includes(query) || entry.actualCashParticulars.toLowerCase().includes(query)
        return monthMatch && searchMatch
      })
      .sort((left, right) => right.date.localeCompare(left.date) || (right.createdAt ?? '').localeCompare(left.createdAt ?? ''))
  }, [entries, month, search])

  return (
    <Card className="flex flex-col xl:h-full xl:min-h-0">
      <CardHeader className="pb-3"><SectionHeading eyebrow="Logs" title="Daily Cashouts" /></CardHeader>
      <CardContent className="flex flex-1 flex-col gap-2.5 xl:min-h-0 xl:overflow-hidden">
        {pendingRequests.length > 0 ? (
          <div className="space-y-2 rounded-2xl border border-amber-900/55 bg-amber-950/20 p-3">
            <span className="block text-[10px] font-extrabold uppercase tracking-[0.16em] text-amber-200">Pending Correction Requests</span>
            {pendingRequests.map((request) => {
              const beforeDrawer = drawerTotalFromDenominations(request.before.drawerDenominations)
              const proposedDrawer = drawerTotalFromDenominations(request.proposed.drawerDenominations)
              return (
                <div key={request.id} className="rounded-xl border border-border/70 bg-background/55 p-3 text-xs">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-bold">{formatDisplayDate(request.cashoutDate)} | {request.recordedBy}</p>
                      <p className="mt-1 text-muted-foreground">Requested by {request.requestedBy}: {request.reason}</p>
                      <p className="mt-1 text-muted-foreground">Drawer {money(beforeDrawer)} to {money(proposedDrawer)} | Cash Movement impact {money(proposedDrawer - beforeDrawer)}</p>
                      <p className="mt-1 text-muted-foreground">Cash {money(request.before.cashSales)} to {money(request.proposed.cashSales)} | UPI {money(request.before.upiSales)} to {money(request.proposed.upiSales)} | Credit {money(request.before.creditSales)} to {money(request.proposed.creditSales)}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => void onApproveCorrection(request)}>Approve</Button>
                      <Button size="sm" variant="destructive" onClick={() => void (async () => {
                        const result = await confirmation.confirm({ title: 'Reject this correction request?', requireReason: true, confirmLabel: 'Reject Correction' })
                        if (typeof result === 'string') await onRejectCorrection(request, result)
                      })()}>Reject</Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : null}

        {reviewedRequests.length > 0 ? (
          <div className="space-y-2 rounded-2xl border border-border/70 bg-secondary/25 p-3">
            <span className="block text-[10px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">Recent Correction History</span>
            <div className="grid gap-2 md:grid-cols-2">
              {reviewedRequests.map((request) => (
                <div key={request.id} className="rounded-xl border border-border/60 bg-background/45 p-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold">{formatDisplayDate(request.cashoutDate)} | {request.recordedBy}</p>
                    <span className="font-bold uppercase text-muted-foreground">{request.status}</span>
                  </div>
                  <p className="mt-1 text-muted-foreground">{request.reason}</p>
                  <p className="mt-1 text-muted-foreground">Reviewed by {request.reviewedBy ?? '-'}{request.reviewReason ? ` | ${request.reviewReason}` : ''}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid gap-2 md:grid-cols-2">
          <FieldLabel label="Month"><Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></FieldLabel>
          <FieldLabel label="Search"><Input value={search} placeholder="Recorded by or audit status" onChange={(event) => setSearch(event.target.value)} /></FieldLabel>
        </div>
        <div className="space-y-2 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
          {filteredEntries.length === 0 ? <p className="text-[12px] font-medium text-muted-foreground">No daily cashouts recorded yet.</p> : null}
          {filteredEntries.map((entry) => {
            const drawerTotal = entry.drawerTotal ?? entry.remainingBalance
            return (
              <div key={entry.id} className="rounded-[14px] border border-border/70 bg-[linear-gradient(180deg,rgba(31,32,36,0.96),rgba(24,25,29,0.92))] p-2.5 text-[12px] text-foreground shadow-[0_10px_20px_rgba(0,0,0,0.14)]">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Daily Cashout</div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditingEntry(entry)}>Edit</Button>
                    <Button type="button" variant="destructive" size="sm" onClick={() => void onDelete(entry)}>Delete</Button>
                  </div>
                </div>
                <p className="font-bold">{formatDisplayDate(entry.date)} | {entry.recordedBy}</p>
                <p className="text-muted-foreground">{entry.recordedByUserId ? 'User ID linked to current account' : 'Legacy cashout without user identity'}</p>
                <p className="text-muted-foreground">Cash {money(entry.cashSales)} | UPI {money(entry.upiSales)} | Credit {money(entry.creditSales)} | Drawer {money(drawerTotal)}</p>
                <p className="text-muted-foreground">Audit {entry.auditStatus ?? 'matched'} | Created {formatDisplayDateTime(entry.createdAt)}</p>
                <button className="mt-2 text-[12px] font-semibold text-primary transition-colors hover:text-primary/80" onClick={() => setSelectedEntry(entry)} type="button">View Complete Cashout</button>
              </div>
            )
          })}
        </div>
        <DailyCashoutDetailsModal entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
        {editingEntry ? <CashoutCorrectionForm entry={editingEntry} mode="owner-edit" onClose={() => setEditingEntry(null)} onSubmit={(values, reason) => onEdit(editingEntry, values, reason)} /> : null}
        {confirmation.dialog}
      </CardContent>
    </Card>
  )
}
