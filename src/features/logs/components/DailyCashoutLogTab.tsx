import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { CashoutCorrectionRequest, CashoutCorrectionValues, DailyCashoutEntry } from '@/domain/appTypes'
import { formatDisplayDate } from '@/app/uiHelpers'
import { CashoutCorrectionForm } from '@/features/cashout/components/CashoutCorrectionForm'
import { DailyCashoutDetailsModal } from '@/features/cashout/components/DailyCashoutDetailsModal'
import { DailyCashoutDataTable } from '@/features/logs/components/DailyCashoutDataTable'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { SectionHeading } from '@/shared/ui/section-heading'

type DailyCashoutLogTabProps = {
  correctionRequests: CashoutCorrectionRequest[]
  entries: DailyCashoutEntry[]
  onDelete: (entry: DailyCashoutEntry) => Promise<void> | void
  onEdit: (entry: DailyCashoutEntry, values: CashoutCorrectionValues, reason: string) => Promise<void> | void
}

export function DailyCashoutLogTab({
  correctionRequests,
  entries,
  onDelete,
  onEdit,
}: DailyCashoutLogTabProps) {
  const [selectedEntry, setSelectedEntry] = useState<DailyCashoutEntry | null>(null)
  const [editingEntry, setEditingEntry] = useState<DailyCashoutEntry | null>(null)
  const reviewedRequests = correctionRequests.filter((request) => request.status !== 'pending')

  return (
    <Card className="flex flex-col xl:h-full xl:min-h-0">
      <CardHeader className="pb-3"><SectionHeading eyebrow="Logs" title="Daily Cashouts" /></CardHeader>
      <CardContent className="flex flex-1 flex-col gap-2.5 xl:min-h-0 xl:overflow-hidden">
        {reviewedRequests.length > 0 ? (
          <details className="group rounded-2xl border border-border/70 bg-secondary/25">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3 text-[10px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">
              <span>Recent Correction History ({reviewedRequests.length})</span>
              <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="grid max-h-56 gap-2 overflow-y-auto px-3 pb-3 pr-4 md:grid-cols-2">
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
          </details>
        ) : null}
        <DailyCashoutDataTable entries={entries} onView={setSelectedEntry} onEdit={setEditingEntry} onDelete={onDelete} />
        <DailyCashoutDetailsModal entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
        {editingEntry ? <CashoutCorrectionForm entry={editingEntry} mode="owner-edit" onClose={() => setEditingEntry(null)} onSubmit={(values, reason) => onEdit(editingEntry, values, reason)} /> : null}
      </CardContent>
    </Card>
  )
}
