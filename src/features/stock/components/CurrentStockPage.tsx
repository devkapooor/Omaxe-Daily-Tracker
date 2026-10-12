import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { FieldLabel } from '@/shared/ui/field-label'
import { Input } from '@/shared/ui/input'
import { NativeSelect } from '@/shared/ui/native-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { sortStockRows, type StockSort } from '../domain/currentStock'
import { stockQueryPlan, type StockQueryFilters } from '../domain/stockQueryPlan'
import { useCurrentStock } from '../hooks/useCurrentStock'
import { stockTableColumns } from './stockColumns'
import { StockProductDetails } from './StockProductDetails'
import { StockPageControls } from './StockPageControls'
import type { AppUser } from '@/domain/financeTypes'

const defaults: StockQueryFilters = { search: '', stockStatus: '' }
export function CurrentStockPage({ currentUser }: { currentUser: AppUser }) {
  const [input, setInput] = useState<StockQueryFilters>(defaults)
  const [filters, setFilters] = useState(input)
  useEffect(() => { const timer = window.setTimeout(() => setFilters(input), 300); return () => window.clearTimeout(timer) }, [input])
  const [sort, setSort] = useState<StockSort>('name')
  const [descending, setDescending] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editSelected, setEditSelected] = useState(false)
  const data = useCurrentStock(filters, sort, descending)
  const plan = stockQueryPlan(filters, sort, descending)
  const pending = JSON.stringify(input) !== JSON.stringify(filters)
  const visible = useMemo(() => plan.pageOnly ? sortStockRows(data.items, sort, descending) : data.items, [data.items, sort, descending, plan.pageOnly])
  function updateFilter<K extends keyof StockQueryFilters>(key: K, value: StockQueryFilters[K]) { setInput((previous) => ({ ...previous, [key]: value })) }
  function openProduct(id: string, edit = false) { setEditSelected(edit); setSelectedId(id) }
  return <div className="flex min-h-0 flex-1 flex-col gap-3">
    <Card className="shrink-0 p-3" role="region" aria-label="Stock Filters">
      <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(8rem,1fr)_auto]">
        <div className="col-span-2 min-w-0 sm:col-span-1"><FieldLabel label="Barcode"><Input autoComplete="off" value={input.search} placeholder="Type, paste or scan barcode" onChange={(event) => updateFilter('search', event.target.value)} /></FieldLabel></div>
        <FieldLabel label="Stock Status"><NativeSelect value={input.stockStatus} onChange={(event) => updateFilter('stockStatus', event.target.value)}><option value="">All</option><option value="positive">In Stock</option><option value="zero">Zero Stock</option><option value="negative">Negative Stock</option></NativeSelect></FieldLabel>
        <Button variant="outline" onClick={() => { setInput(defaults); setFilters(defaults) }}>Clear Filters</Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Barcode search matches the complete barcode. MRP, cost and margin sort this page only. Quantity filters may determine server ordering.</p>
    </Card>
    {!data.enabled && !pending ? <Card className="p-6 text-sm text-muted-foreground">Enter a barcode or choose a stock status to load stock.</Card> : pending || data.loading ? <Card className="p-6 text-sm text-muted-foreground" role="status">Loading filtered stock…</Card>
      : data.error ? <Card className="space-y-2 p-4" role="alert"><p className="text-sm text-destructive">{data.error}</p><Button variant="outline" size="sm" onClick={data.retry}>Retry</Button></Card>
      : !visible.length ? <Card className="p-6 text-sm text-muted-foreground">No products match these filters.</Card>
      : <div className="min-h-0 min-w-0 flex-1"><Table containerClassName="h-full overflow-auto" className="min-w-[950px]">
        <TableHeader className="sticky top-0 z-10 bg-muted"><TableRow>{stockTableColumns.map((column) => <TableHead key={column.key} className={`normal-case tracking-normal ${column.numeric ? 'text-right' : ''}`}>
          <button type="button" className="inline-flex items-center gap-1 py-2" onClick={() => { setSort(column.sort!); setDescending(sort === column.sort ? !descending : false) }} aria-label={`Sort By ${column.label}`}>
            {column.label}{sort === column.sort ? descending ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" /> : <ArrowUpDown className="size-3" />}
            {['mrpPaise', 'costPaise', 'marginPercent'].includes(column.key) ? <span className="text-[10px] font-normal text-muted-foreground">(page)</span> : null}
          </button>
        </TableHead>)}<TableHead className="sticky right-0 bg-muted">Actions</TableHead></TableRow></TableHeader>
        <TableBody>{visible.map((row) => <TableRow key={row.id} className="cursor-pointer" onClick={() => openProduct(row.id)}>{stockTableColumns.map((column) => <TableCell key={column.key} className={`${column.key === 'name' ? 'min-w-56' : ''} ${column.numeric ? 'text-right tabular-nums' : ''} ${column.key === 'currentQuantity' && row.currentQuantity < 0 ? 'text-destructive' : ''}`}>{column.value(row)}</TableCell>)}<TableCell className="sticky right-0 bg-card"><Button size="sm" variant="outline" aria-label={`Edit Stock Prices For ${row.name}`} onClick={(event) => { event.stopPropagation(); openProduct(row.id, true) }}>Edit</Button></TableCell></TableRow>)}</TableBody>
      </Table></div>}
    {data.enabled ? <><p className="text-xs text-muted-foreground">Ordering: {plan.effectiveSort === 'currentQuantity' ? 'quantity' : plan.effectiveSort === 'name' ? 'product name' : plan.effectiveSort}{plan.pageOnly ? ` · ${sort === 'mrpPaise' ? 'MRP' : sort === 'costPaise' ? 'cost' : 'margin'} sorted on this page only` : ''}. Values are a server snapshot; refresh for other-terminal changes.</p><StockPageControls {...data} loading={data.loading || pending} /></> : null}
    {selectedId ? <StockProductDetails key={selectedId} productId={selectedId} currentUser={currentUser} initialEdit={editSelected} onPricesSaved={data.refresh} onClose={() => setSelectedId(null)} /> : null}
  </div>
}
