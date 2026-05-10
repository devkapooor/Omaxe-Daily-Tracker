import { useMemo, useState } from 'react'
import type { DailyCashoutEntry } from '@/domain/appTypes'
import { formatDisplayDate, formatDisplayDateTime, money, today } from '@/app/uiHelpers'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { FieldLabel } from '@/components/ui/field-label'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { SectionHeading } from '@/components/ui/section-heading'

type DailyCashoutLogProps = {
  entries: DailyCashoutEntry[]
  userOptions: string[]
}

export function DailyCashoutLog({ entries, userOptions }: DailyCashoutLogProps) {
  const [selectedDate, setSelectedDate] = useState(today())
  const [selectedUser, setSelectedUser] = useState('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const filteredEntries = useMemo(
    () =>
      entries.filter(
        (entry) =>
          entry.date === selectedDate && (selectedUser === 'all' || entry.recordedBy.toLowerCase() === selectedUser.toLowerCase()),
      ),
    [entries, selectedDate, selectedUser],
  )

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeading eyebrow="Daily Cashout Log" title="Review Saved Cashouts" />
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldLabel label="Date">
              <Input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
            </FieldLabel>
            <FieldLabel label="Recorded By">
              <NativeSelect value={selectedUser} onChange={(event) => setSelectedUser(event.target.value)}>
                <option value="all">All users</option>
                {userOptions.map((user) => (
                  <option key={user} value={user}>
                    {user}
                  </option>
                ))}
              </NativeSelect>
            </FieldLabel>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3">
          {filteredEntries.length === 0 ? (
            <p className="text-sm font-medium text-muted-foreground">No daily cashouts match this filter.</p>
          ) : null}
          {filteredEntries.map((entry) => {
            const isExpanded = expandedId === entry.id
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
            return (
              <article className="rounded-[20px] border border-border/70 bg-secondary/55 p-4" key={entry.id}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-base font-bold text-foreground">{formatDisplayDate(entry.date)}</strong>
                      <Badge variant="outline">{entry.recordedBy}</Badge>
                      <Badge variant={auditStatus === 'matched' ? 'success' : 'warning'}>
                        {auditStatus === 'matched' ? 'Audit Matched' : auditStatus === 'cash-less' ? 'Cash Less' : 'Cash More'}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                      <span>Cash {money(entry.cashSales)}</span>
                      <span>UPI {money(entry.upiSales)}</span>
                      <span>Credit {money(entry.creditSales)}</span>
                      <span>Expense {money(entry.cashSales - drawerTotal)}</span>
                      <span>Drawer {money(drawerTotal)}</span>
                    </div>
                  </div>
                  <button
                    className="text-sm font-semibold text-primary transition-colors hover:text-primary/80"
                    onClick={() => setExpandedId((current) => (current === entry.id ? null : entry.id))}
                    type="button"
                  >
                    {isExpanded ? 'Hide Details' : 'View Details'}
                  </button>
                </div>

                {isExpanded ? (
                  <div className="mt-4 grid gap-4 rounded-[18px] border border-border/60 bg-white/80 p-4 text-sm text-foreground lg:grid-cols-2">
                    <DetailBlock label="Cash Drawer Particulars" value={entry.actualCashParticulars} />
                    <DetailBlock label="Pending Cash Particulars" value={entry.pendingCashParticulars} />
                    <DetailBlock label="System Audit" value={money(entry.cashAudit)} />
                    <DetailBlock label="Drawer Total" value={money(drawerTotal)} />
                    <DetailBlock label="Audit Status" value={auditMessage} />
                    <DetailBlock label="Created At" value={formatDisplayDateTime(entry.createdAt)} />
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

function DetailBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <span className="block text-[11px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
      <pre className="whitespace-pre-wrap font-sans text-sm text-foreground">{value}</pre>
    </div>
  )
}
