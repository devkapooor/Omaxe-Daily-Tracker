import { useMemo, useState } from 'react'
import { sortFn_basic } from '@tanstack/react-table'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { formatDisplayDateTime, money } from '@/app/uiHelpers'
import type { PosStockAudit, PosStockAuditBatch } from '@/features/pos/domain/types'
import { where } from 'firebase/firestore'
import { readPage } from '@/features/stock/data/stockQueries'
import { useServerPage } from '@/features/stock/hooks/useServerPage'
import { StockPageControls } from '@/features/stock/components/StockPageControls'
import { ResponsiveLogTable, type LogTableColumn } from '@/features/logs/components/ResponsiveLogTable'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { StatusPanel } from '@/shared/ui/status-panel'

function AuditItems({ batch }: { batch: PosStockAuditBatch }) {
  const data = useServerPage<PosStockAudit>(batch.id, (cursor) => readPage('stockAudits', [where('batchId', '==', batch.id)], cursor, 50, batch.id, 'productName', 'asc'))
  return <div className="space-y-2">
    {data.error ? <StatusPanel variant="destructive">{data.error}<Button variant="outline" size="sm" onClick={data.retry}>Retry</Button></StatusPanel> : data.loading ? <StatusPanel>Loading audit items…</StatusPanel> : <div className="overflow-auto"><table className="w-full min-w-[640px] text-sm"><thead><tr>{['Product / barcode', 'System', 'Counted', 'Difference', 'Unit cost', 'Value impact'].map((label) => <th key={label} className="p-2 text-left text-xs text-muted-foreground">{label}</th>)}</tr></thead><tbody>{data.items.map((item) => <tr key={item.id} className="border-t"><td className="p-2">{item.productName}<small className="block">{item.barcode}</small></td><td className="p-2">{item.systemQuantityBefore}</td><td className="p-2">{item.physicalQuantity}</td><td className="p-2">{item.difference > 0 ? '+' : ''}{item.difference}</td><td className="p-2">{item.unitCostPaise === undefined ? 'Not recorded' : money(item.unitCostPaise / 100)}</td><td className="p-2">{item.valueImpactPaise === undefined ? 'Not recorded' : money(item.valueImpactPaise / 100)}</td></tr>)}</tbody></table></div>}
    <StockPageControls {...data} />
  </div>
}
function StockAuditDetails({ batch }: { batch: PosStockAuditBatch }) {
  const [open, setOpen] = useState(false)
  return <div className="space-y-2"><Button size="sm" variant="outline" onClick={() => setOpen((value) => !value)}>{open ? <ChevronDown /> : <ChevronRight />}{open ? 'Hide items' : 'View items'}</Button>{open ? <AuditItems batch={batch} /> : null}</div>
}

export function StockAuditLogTable({ entries, serverPage = false }: { entries: PosStockAuditBatch[]; serverPage?: boolean }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const columns = useMemo<LogTableColumn<PosStockAuditBatch>[]>(() => ([
    { id: 'id', label: 'Audit ID', value: (entry) => entry.id, cell: (entry) => <span className="font-semibold">{entry.id}</span>, hideable: false },
    { id: 'createdAt', label: 'Date and time', value: (entry) => entry.createdAt, cell: (entry) => formatDisplayDateTime(entry.createdAt), sortDescFirst: true },
    { id: 'operator', label: 'Recorded by', value: (entry) => entry.actorName, cell: (entry) => entry.actorName },
    { id: 'items', label: 'Products', value: (entry) => entry.itemCount, cell: (entry) => <span>{entry.itemCount} <span className="text-muted-foreground">({entry.adjustedItemCount} adjusted)</span></span>, align: 'right' },
    { id: 'increase', label: 'Increase', value: (entry) => entry.increaseValuePaise, cell: (entry) => <span className="text-emerald-700">{money(entry.increaseValuePaise / 100)}</span>, align: 'right', sortDescFirst: true },
    { id: 'decrease', label: 'Decrease', value: (entry) => entry.decreaseValuePaise, cell: (entry) => <span className="text-rose-700">{money(entry.decreaseValuePaise / 100)}</span>, align: 'right', sortDescFirst: true },
    { id: 'net', label: 'Net impact', value: (entry) => entry.netValuePaise, cell: (entry) => <span className={`font-semibold ${entry.netValuePaise >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{money(entry.netValuePaise / 100)}</span>, align: 'right', sortDescFirst: true },
    { id: 'status', label: 'Status', value: (entry) => entry.interrupted ? 'interrupted' : entry.status, cell: (entry) => <Badge variant={entry.interrupted ? 'warning' : entry.status === 'completed' ? 'success' : 'secondary'}>{entry.interrupted ? 'Partial' : entry.status}</Badge> },
    { id: 'details', label: 'Details', value: () => '', cell: (entry) => <Button type="button" size="sm" variant="outline" onClick={() => setExpandedId((current) => current === entry.id ? null : entry.id)}>{expandedId === entry.id ? 'Hide' : 'Expand'}</Button>, sortable: false },
  ] satisfies LogTableColumn<PosStockAuditBatch>[]).map((column) => ({ ...column, sortFn: sortFn_basic })), [expandedId])

  return <div className="grid min-h-0 flex-1 gap-2">
    {serverPage ? <p className="text-xs text-muted-foreground">Search and column sorts apply to this server page. Use the page controls below to fetch more audits.</p> : null}
    <ResponsiveLogTable showFooter={!serverPage} columns={columns} data={entries} emptyTitle="No Stock Audits found" getRowId={(entry) => entry.id} initialSortId="createdAt" noun="Stock Audit" searchPlaceholder="Search Audit ID, operator or note" searchText={(entry) => [entry.id, entry.actorName, entry.note, entry.createdAt, entry.status].join(' ')} pageSize={25} mobileCard={(entry) => <Card className="grid gap-2 p-3"><div className="flex items-start justify-between gap-2"><div><p className="font-semibold">{entry.id}</p><p className="text-xs text-muted-foreground">{formatDisplayDateTime(entry.createdAt)} · {entry.actorName}</p></div><Badge variant={entry.interrupted ? 'warning' : entry.status === 'completed' ? 'success' : 'secondary'}>{entry.interrupted ? 'Partial' : entry.status}</Badge></div><p className="text-xs text-muted-foreground">{entry.note}</p><div className="grid grid-cols-2 gap-2 text-sm"><span>{entry.itemCount} products</span><strong className={entry.netValuePaise >= 0 ? 'text-emerald-700' : 'text-rose-700'}>{money(entry.netValuePaise / 100)}</strong></div><Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => setExpandedId((current) => current === entry.id ? null : entry.id)}>{expandedId === entry.id ? 'Hide details' : 'Expand details'}</Button></Card>} />
    {expandedId ? (() => { const batch = entries.find((entry) => entry.id === expandedId); return batch ? <div className="max-h-[45vh] overflow-auto rounded-md border p-3"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold">{batch.id}</h3><p className="text-sm text-muted-foreground">{batch.note}</p></div><span className="text-xs text-muted-foreground">{formatDisplayDateTime(batch.createdAt)}</span></div><StockAuditDetails key={batch.id} batch={batch} /></div> : null })() : null}
  </div>
}
