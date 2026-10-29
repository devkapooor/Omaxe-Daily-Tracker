import { useEffect, useMemo, useRef, useState } from 'react'
import { sortFn_basic } from '@tanstack/react-table'
import { Eye, X } from 'lucide-react'
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
import { BusinessReference } from '@/shared/businessReferences'

function AuditItems({ batch }: { batch: PosStockAuditBatch }) {
  const data = useServerPage<PosStockAudit>(batch.id, (cursor) => readPage('stockAudits', [where('batchId', '==', batch.id)], cursor, 50, batch.id, 'productName', 'asc'))
  return <div className="space-y-2">
    {data.error ? <StatusPanel variant="destructive">{data.error}<Button variant="outline" size="sm" onClick={data.retry}>Retry</Button></StatusPanel> : data.loading ? <StatusPanel>Loading audit items…</StatusPanel> : <div className="overflow-auto"><table className="w-full min-w-[640px] text-sm"><thead><tr>{['Product / barcode', 'System', 'Counted', 'Difference', 'Unit cost', 'Value impact'].map((label) => <th key={label} className="p-2 text-left text-xs text-muted-foreground">{label}</th>)}</tr></thead><tbody>{data.items.map((item) => <tr key={item.id} className="border-t"><td className="p-2">{item.productName}<small className="block">{item.barcode}</small></td><td className="p-2">{item.systemQuantityBefore}</td><td className="p-2">{item.physicalQuantity}</td><td className="p-2">{item.difference > 0 ? '+' : ''}{item.difference}</td><td className="p-2">{item.unitCostPaise === undefined ? 'Not recorded' : money(item.unitCostPaise / 100)}</td><td className="p-2">{item.valueImpactPaise === undefined ? 'Not recorded' : money(item.valueImpactPaise / 100)}</td></tr>)}</tbody></table></div>}
    <StockPageControls {...data} />
  </div>
}
function StockAuditDetails({ batch, onClose }: { batch: PosStockAuditBatch; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => { const dialog = dialogRef.current; dialog?.showModal(); return () => dialog?.close() }, [])
  return <dialog ref={dialogRef} aria-labelledby="stock-audit-details-title" onCancel={(event) => { event.preventDefault(); onClose() }} className="m-auto max-h-[88dvh] w-[calc(100%_-_2rem)] max-w-5xl overflow-y-auto rounded-lg border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/50">
    <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-card p-4"><h2 id="stock-audit-details-title" className="text-lg font-semibold">Audit details · <BusinessReference prefix="AUDIT" id={batch.id}/></h2><Button type="button" variant="ghost" size="icon" aria-label="Close audit details" onClick={onClose}><X className="size-5" /></Button></div>
    <div className="space-y-3 p-4"><div className="grid gap-2 rounded-md border p-3 text-sm sm:grid-cols-2"><p><span className="text-muted-foreground">Date and time: </span>{formatDisplayDateTime(batch.createdAt)}</p><p><span className="text-muted-foreground">Recorded by: </span>{batch.actorName}</p><p className="sm:col-span-2"><span className="text-muted-foreground">Reason: </span>{batch.note || 'Not recorded'}</p></div><AuditItems batch={batch} /></div>
  </dialog>
}

export function StockAuditLogTable({ entries, serverPage = false }: { entries: PosStockAuditBatch[]; serverPage?: boolean }) {
  const [selectedBatch, setSelectedBatch] = useState<PosStockAuditBatch | null>(null)
  const columns = useMemo<LogTableColumn<PosStockAuditBatch>[]>(() => ([
    { id: 'id', label: 'Audit ID', value: (entry) => entry.id, cell: (entry) => <BusinessReference prefix="AUDIT" id={entry.id}/>, hideable: false },
    { id: 'createdAt', label: 'Date and time', value: (entry) => entry.createdAt, cell: (entry) => formatDisplayDateTime(entry.createdAt), sortDescFirst: true },
    { id: 'operator', label: 'Recorded by', value: (entry) => entry.actorName, cell: (entry) => entry.actorName },
    { id: 'items', label: 'Products', value: (entry) => entry.itemCount, cell: (entry) => <span>{entry.itemCount} <span className="text-muted-foreground">({entry.adjustedItemCount} adjusted)</span></span>, align: 'right' },
    { id: 'increase', label: 'Increase', value: (entry) => entry.increaseValuePaise, cell: (entry) => <span className="text-emerald-700">{money(entry.increaseValuePaise / 100)}</span>, align: 'right', sortDescFirst: true },
    { id: 'decrease', label: 'Decrease', value: (entry) => entry.decreaseValuePaise, cell: (entry) => <span className="text-rose-700">{money(entry.decreaseValuePaise / 100)}</span>, align: 'right', sortDescFirst: true },
    { id: 'net', label: 'Net impact', value: (entry) => entry.netValuePaise, cell: (entry) => <span className={`font-semibold ${entry.netValuePaise >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{money(entry.netValuePaise / 100)}</span>, align: 'right', sortDescFirst: true },
    { id: 'status', label: 'Status', value: (entry) => entry.interrupted ? 'interrupted' : entry.status, cell: (entry) => <Badge variant={entry.interrupted ? 'warning' : entry.status === 'completed' ? 'success' : 'secondary'}>{entry.interrupted ? 'Partial' : entry.status}</Badge> },
    { id: 'details', label: 'Details', value: () => '', cell: (entry) => <Button type="button" size="sm" variant="outline" onClick={() => setSelectedBatch(entry)}><Eye size={16} />View</Button>, sortable: false },
  ] satisfies LogTableColumn<PosStockAuditBatch>[]).map((column) => ({ ...column, sortFn: sortFn_basic })), [])

  return <div className="grid min-h-0 flex-1 gap-2">
    {serverPage ? <p className="text-xs text-muted-foreground">Search and column sorts apply to this server page. Use the page controls below to fetch more audits.</p> : null}
    <ResponsiveLogTable showFooter={!serverPage} columns={columns} data={entries} emptyTitle="No Stock Audits found" getRowId={(entry) => entry.id} initialSortId="createdAt" noun="Stock Audit" searchPlaceholder="Search Audit ID, operator or note" searchText={(entry) => [entry.id, entry.actorName, entry.note, entry.createdAt, entry.status].join(' ')} pageSize={25} mobileCard={(entry) => <Card className="grid gap-2 p-3"><div className="flex items-start justify-between gap-2"><div><p className="font-semibold"><BusinessReference prefix="AUDIT" id={entry.id}/></p><p className="text-xs text-muted-foreground">{formatDisplayDateTime(entry.createdAt)} · {entry.actorName}</p></div><Badge variant={entry.interrupted ? 'warning' : entry.status === 'completed' ? 'success' : 'secondary'}>{entry.interrupted ? 'Partial' : entry.status}</Badge></div><p className="text-xs text-muted-foreground">{entry.note}</p><div className="grid grid-cols-2 gap-2 text-sm"><span>{entry.itemCount} products</span><strong className={entry.netValuePaise >= 0 ? 'text-emerald-700' : 'text-rose-700'}>{money(entry.netValuePaise / 100)}</strong></div><Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => setSelectedBatch(entry)}><Eye size={16} />View</Button></Card>} />
    {selectedBatch ? <StockAuditDetails batch={selectedBatch} onClose={() => setSelectedBatch(null)} /> : null}
  </div>
}
