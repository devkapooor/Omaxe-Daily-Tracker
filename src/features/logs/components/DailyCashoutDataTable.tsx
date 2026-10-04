import { useMemo } from 'react'
import { Ellipsis } from 'lucide-react'
import type { DailyCashoutEntry } from '@/domain/appTypes'
import { formatDisplayDate, formatDisplayDateTime, money } from '@/app/uiHelpers'
import { ResponsiveLogTable, type LogTableColumn } from '@/features/logs/components/ResponsiveLogTable'
import { dailyCashoutSearchText } from '@/features/logs/domain/logTableSearch'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'

type DailyCashoutDataTableProps = {
  entries: DailyCashoutEntry[]
  onView: (entry: DailyCashoutEntry) => void
  onEdit: (entry: DailyCashoutEntry) => void
  onDelete: (entry: DailyCashoutEntry) => Promise<void> | void
}

type RowActionsProps = Pick<DailyCashoutDataTableProps, 'onDelete' | 'onEdit' | 'onView'> & {
  entry: DailyCashoutEntry
}

function auditLabel(status?: DailyCashoutEntry['auditStatus']) {
  if (status === 'cash-less') return 'Cash less'
  if (status === 'cash-more') return 'Cash more'
  return 'Matched'
}

function auditVariant(status?: DailyCashoutEntry['auditStatus']) {
  if (status === 'cash-less') return 'destructive' as const
  if (status === 'cash-more') return 'warning' as const
  return 'success' as const
}

function RowActions({ entry, onDelete, onEdit, onView }: RowActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label={`Actions for ${entry.recordedBy} cashout on ${formatDisplayDate(entry.date)}`}>
          <Ellipsis className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Cashout actions</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => onView(entry)}>View complete cashout</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onEdit(entry)}>Edit cashout</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-rose-700 focus:bg-rose-50 focus:text-rose-800" onSelect={() => void onDelete(entry)}>
          Delete cashout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function DailyCashoutDataTable({ entries, onDelete, onEdit, onView }: DailyCashoutDataTableProps) {
  const columns = useMemo<LogTableColumn<DailyCashoutEntry>[]>(() => [
    { id: 'date', label: 'Date', value: (entry) => entry.date, cell: (entry) => <span className="font-semibold">{formatDisplayDate(entry.date)}</span>, hideable: false, sortDescFirst: true },
    {
      id: 'recordedBy',
      label: 'Recorded by',
      value: (entry) => entry.recordedBy,
      cell: (entry) => (
        <div>
          <p className="font-semibold">{entry.recordedBy}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">{entry.recordedByUserId ? 'Account linked' : 'Legacy record'}</p>
        </div>
      ),
    },
    {
      id: 'sales',
      label: 'Sales',
      value: (entry) => entry.cashSales + entry.upiSales + (entry.cardSales ?? 0) + entry.creditSales - entry.returns,
      cell: (entry) => (
        <div>
          <p className="font-semibold">{money(entry.cashSales + entry.upiSales + (entry.cardSales ?? 0) + entry.creditSales - entry.returns)}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">Cash {money(entry.cashSales)} | UPI {money(entry.upiSales)} | Card {entry.cardSales === undefined ? '—' : money(entry.cardSales)}</p>
        </div>
      ),
      sortDescFirst: true,
    },
    { id: 'drawer', label: 'Drawer', value: (entry) => entry.drawerTotal ?? entry.remainingBalance, cell: (entry) => <span className="font-semibold">{money(entry.drawerTotal ?? entry.remainingBalance)}</span>, align: 'right', sortDescFirst: true },
    { id: 'auditStatus', label: 'Audit', value: (entry) => entry.auditStatus ?? 'matched', cell: (entry) => <Badge variant={auditVariant(entry.auditStatus)}>{auditLabel(entry.auditStatus)}</Badge> },
    { id: 'createdAt', label: 'Created', value: (entry) => entry.createdAt, cell: (entry) => <span className="text-muted-foreground">{formatDisplayDateTime(entry.createdAt)}</span>, sortDescFirst: true },
    { id: 'actions', label: 'Actions', value: () => '', cell: (entry) => <RowActions entry={entry} onDelete={onDelete} onEdit={onEdit} onView={onView} />, align: 'right', hideable: false, sortable: false },
  ], [onDelete, onEdit, onView])

  return (
    <ResponsiveLogTable
      columns={columns}
      data={entries}
      emptyTitle="No daily cashouts found"
      getRowId={(entry) => entry.id}
      initialSortId="date"
      noun="cashout"
      searchPlaceholder="Search name, date, audit status or particulars"
      searchText={(entry) => `${dailyCashoutSearchText(entry)} ${auditLabel(entry.auditStatus)}`}
      mobileCard={(entry) => (
        <article className="rounded-2xl border border-border/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,250,254,0.96))] p-3 shadow-[0_10px_22px_rgba(38,78,118,0.08)] dark:bg-none dark:bg-card dark:shadow-black/20">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-sm font-bold text-foreground">{formatDisplayDate(entry.date)}</p><p className="mt-0.5 text-xs font-semibold text-muted-foreground">{entry.recordedBy}</p></div>
            <RowActions entry={entry} onDelete={onDelete} onEdit={onEdit} onView={onView} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/55 pt-3 text-xs">
            <div><p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Sales</p><p className="mt-0.5 font-semibold">{money(entry.cashSales + entry.upiSales + (entry.cardSales ?? 0) + entry.creditSales - entry.returns)}</p></div>
            <div><p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Drawer</p><p className="mt-0.5 font-semibold">{money(entry.drawerTotal ?? entry.remainingBalance)}</p></div>
            <div><p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Cash / UPI / Card</p><p className="mt-0.5 font-semibold">{money(entry.cashSales)} / {money(entry.upiSales)} / {entry.cardSales === undefined ? '—' : money(entry.cardSales)}</p></div>
            <div><p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Audit</p><div className="mt-1"><Badge variant={auditVariant(entry.auditStatus)}>{auditLabel(entry.auditStatus)}</Badge></div></div>
          </div>
        </article>
      )}
    />
  )
}
