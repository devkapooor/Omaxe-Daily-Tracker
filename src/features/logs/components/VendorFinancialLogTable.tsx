import type { VendorLogRow } from '../domain/vendorLogRows'
import { ResponsiveLogTable, type LogTableColumn } from './ResponsiveLogTable'
import { formatDisplayDate, money } from '@/app/uiHelpers'
import { Badge } from '@/shared/ui/badge'

const amount = (value: number | null) => value === null ? 'Not recorded' : money(value)
export function VendorFinancialLogTable({ rows, kind, users, more, loadMore }: { rows: VendorLogRow[]; kind: 'purchase' | 'payment'; users: Map<string, string>; more: boolean; loadMore: () => void }) {
  const columns: LogTableColumn<VendorLogRow>[] = [
    { id: 'date', label: 'Date', value: row => row.date, cell: row => formatDisplayDate(row.date), hideable: false },
    { id: 'party', label: kind === 'purchase' ? 'Vendor' : 'Party', value: row => row.party, cell: row => <span className="font-semibold">{row.party}</span> },
    { id: 'reference', label: kind === 'purchase' ? 'Invoice' : 'Reference', value: row => row.reference, cell: row => <span className="block max-w-52 truncate" title={row.reference}>{row.reference}</span> },
    { id: 'amount', label: kind === 'purchase' ? 'Invoice total' : 'Amount', value: row => row.amount ?? '', cell: row => amount(row.amount), align: 'right' },
    ...(kind === 'purchase' ? [
      { id: 'paid', label: 'Paid', value: (row: VendorLogRow) => row.paid ?? '', cell: (row: VendorLogRow) => row.paid === null ? <span className="text-xs text-muted-foreground">See invoice allocations</span> : money(row.paid), align: 'right' as const },
      { id: 'open', label: 'Open payable', value: (row: VendorLogRow) => row.open ?? '', cell: (row: VendorLogRow) => amount(row.open), align: 'right' as const }
    ] : []),
    { id: 'method', label: 'Mode', value: row => row.method, cell: row => <Badge variant="outline">{row.method}</Badge> },
    { id: 'category', label: kind === 'purchase' ? 'Category' : 'Entry', value: row => row.category, cell: row => row.category },
    { id: 'actor', label: 'Recorded by', value: row => users.get(row.actor) || row.actor, cell: row => users.get(row.actor) || row.actor || 'Not recorded' },
    { id: 'source', label: 'Source', value: row => row.source, cell: row => <span title={row.id}>{row.source}</span> },
    { id: 'notes', label: 'Notes', value: row => row.notes, cell: row => <span className="block max-w-56 truncate text-muted-foreground" title={row.notes}>{row.notes || '—'}</span>, sortable: false }
  ]
  return <ResponsiveLogTable columns={columns} data={rows} emptyTitle={kind === 'purchase' ? 'No purchases found' : 'No payments found'} getRowId={row => row.id} initialSortId="date" noun={kind} searchPlaceholder="Search loaded records" searchText={row => [row.date, formatDisplayDate(row.date), row.party, row.reference, row.method, row.notes, row.source, users.get(row.actor), row.actor].join(' ')} hasMore={more} onLoadMore={loadMore} mobileCard={row => <article className="rounded-lg border border-border p-3"><div className="flex items-start justify-between gap-3"><strong>{row.party}</strong><span className="font-semibold">{amount(row.amount)}</span></div><p className="mt-1 text-xs text-muted-foreground">{formatDisplayDate(row.date)} · {row.source}</p><p className="mt-2 break-words text-sm">{row.reference}</p>{kind === 'purchase' ? <p className="mt-1 text-sm">Open payable: {amount(row.open)}</p> : <p className="mt-1 text-sm">{row.method}</p>}<p className="mt-1 text-xs">Recorded by: {users.get(row.actor) || row.actor || 'Not recorded'}</p></article>} />
}
