import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { formatDisplayDateTime, money } from '@/app/uiHelpers'
import type { PosStockAudit, PosStockAuditBatch } from '@/features/pos/domain/types'
import { loadPosStockAuditItems } from '@/features/pos/data/posRepository'
import { ResponsiveLogTable, type LogTableColumn } from '@/features/logs/components/ResponsiveLogTable'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { StatusPanel } from '@/shared/ui/status-panel'

function StockAuditDetails({ batch }: { batch: PosStockAuditBatch }) {
  const [items, setItems] = useState<PosStockAudit[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function toggle() {
    if (items) { setItems(null); return }
    setLoading(true); setError('')
    try { setItems(await loadPosStockAuditItems(batch.id)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load audit details.') }
    finally { setLoading(false) }
  }

  return <div className="grid gap-2">
    <Button type="button" variant="outline" size="sm" className="w-fit" disabled={loading} onClick={() => void toggle()}>
      {items ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}{loading ? 'Loading…' : items ? 'Hide items' : 'View items'}
    </Button>
    {error ? <StatusPanel variant="destructive">{error}</StatusPanel> : null}
    {items ? <Card className="overflow-hidden p-0">
      <div className="grid grid-cols-[minmax(10rem,1fr)_repeat(5,minmax(5rem,auto))] gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-semibold text-muted-foreground">
        <span>Product</span><span className="text-right">System</span><span className="text-right">Counted</span><span className="text-right">Difference</span><span className="text-right">Unit cost</span><span className="text-right">Impact</span>
      </div>
      <div className="max-h-72 overflow-auto">
        {items.map((item) => <div key={item.id} className="grid grid-cols-[minmax(10rem,1fr)_repeat(5,minmax(5rem,auto))] items-center gap-3 border-b px-3 py-2 text-sm last:border-0">
          <div className="min-w-0"><p className="truncate font-semibold">{item.productName}</p><p className="text-xs text-muted-foreground">{item.barcode}</p></div>
          <span className="text-right tabular-nums">{item.systemQuantityBefore}</span><span className="text-right tabular-nums">{item.physicalQuantity}</span>
          <span className={`text-right tabular-nums ${item.difference > 0 ? 'text-emerald-700' : item.difference < 0 ? 'text-rose-700' : ''}`}>{item.difference > 0 ? '+' : ''}{item.difference}</span>
          <span className="text-right tabular-nums">{item.unitCostPaise === undefined ? '—' : money(item.unitCostPaise / 100)}</span>
          <span className={`text-right font-semibold tabular-nums ${(item.valueImpactPaise ?? 0) > 0 ? 'text-emerald-700' : (item.valueImpactPaise ?? 0) < 0 ? 'text-rose-700' : ''}`}>{money((item.valueImpactPaise ?? 0) / 100)}</span>
          {item.costSource === 'audit-correction' ? <span className="col-span-full text-xs text-amber-700">Cost recorded from this Audit</span> : null}
        </div>)}
        {!items.length ? <p className="p-4 text-center text-sm text-muted-foreground">No item details were found.</p> : null}
      </div>
    </Card> : null}
  </div>
}

export function StockAuditLogTable({ entries }: { entries: PosStockAuditBatch[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const columns = useMemo<LogTableColumn<PosStockAuditBatch>[]>(() => [
    { id: 'id', label: 'Audit ID', value: (entry) => entry.id, cell: (entry) => <span className="font-semibold">{entry.id}</span>, hideable: false },
    { id: 'createdAt', label: 'Date and time', value: (entry) => entry.createdAt, cell: (entry) => formatDisplayDateTime(entry.createdAt), sortDescFirst: true },
    { id: 'operator', label: 'Recorded by', value: (entry) => entry.actorName, cell: (entry) => entry.actorName },
    { id: 'items', label: 'Products', value: (entry) => entry.itemCount, cell: (entry) => <span>{entry.itemCount} <span className="text-muted-foreground">({entry.adjustedItemCount} adjusted)</span></span>, align: 'right' },
    { id: 'increase', label: 'Increase', value: (entry) => entry.increaseValuePaise, cell: (entry) => <span className="text-emerald-700">{money(entry.increaseValuePaise / 100)}</span>, align: 'right', sortDescFirst: true },
    { id: 'decrease', label: 'Decrease', value: (entry) => entry.decreaseValuePaise, cell: (entry) => <span className="text-rose-700">{money(entry.decreaseValuePaise / 100)}</span>, align: 'right', sortDescFirst: true },
    { id: 'net', label: 'Net impact', value: (entry) => entry.netValuePaise, cell: (entry) => <span className={`font-semibold ${entry.netValuePaise >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{money(entry.netValuePaise / 100)}</span>, align: 'right', sortDescFirst: true },
    { id: 'status', label: 'Status', value: (entry) => entry.interrupted ? 'interrupted' : entry.status, cell: (entry) => <Badge variant={entry.interrupted ? 'warning' : entry.status === 'completed' ? 'success' : 'secondary'}>{entry.interrupted ? 'Partial' : entry.status}</Badge> },
    { id: 'details', label: 'Details', value: () => '', cell: (entry) => <Button type="button" size="sm" variant="outline" onClick={() => setExpandedId((current) => current === entry.id ? null : entry.id)}>{expandedId === entry.id ? 'Hide' : 'Expand'}</Button>, sortable: false },
  ], [expandedId])

  return <div className="grid min-h-0 flex-1 gap-2">
    <ResponsiveLogTable columns={columns} data={entries} emptyTitle="No Stock Audits found" getRowId={(entry) => entry.id} initialSortId="createdAt" noun="Stock Audit" searchPlaceholder="Search Audit ID, operator or note" searchText={(entry) => [entry.id, entry.actorName, entry.note, entry.createdAt, entry.status].join(' ')} pageSize={10} mobileCard={(entry) => <Card className="grid gap-2 p-3"><div className="flex items-start justify-between gap-2"><div><p className="font-semibold">{entry.id}</p><p className="text-xs text-muted-foreground">{formatDisplayDateTime(entry.createdAt)} · {entry.actorName}</p></div><Badge variant={entry.interrupted ? 'warning' : entry.status === 'completed' ? 'success' : 'secondary'}>{entry.interrupted ? 'Partial' : entry.status}</Badge></div><p className="text-xs text-muted-foreground">{entry.note}</p><div className="grid grid-cols-2 gap-2 text-sm"><span>{entry.itemCount} products</span><strong className={entry.netValuePaise >= 0 ? 'text-emerald-700' : 'text-rose-700'}>{money(entry.netValuePaise / 100)}</strong></div><Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => setExpandedId((current) => current === entry.id ? null : entry.id)}>{expandedId === entry.id ? 'Hide details' : 'Expand details'}</Button></Card>} />
    {expandedId ? (() => { const batch = entries.find((entry) => entry.id === expandedId); return batch ? <div className="max-h-[45vh] overflow-auto rounded-md border p-3"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold">{batch.id}</h3><p className="text-sm text-muted-foreground">{batch.note}</p></div><span className="text-xs text-muted-foreground">{formatDisplayDateTime(batch.createdAt)}</span></div><StockAuditDetails key={batch.id} batch={batch} /></div> : null })() : null}
  </div>
}
