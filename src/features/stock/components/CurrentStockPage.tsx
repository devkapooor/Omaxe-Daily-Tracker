import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { FieldLabel } from '@/shared/ui/field-label'
import { Input } from '@/shared/ui/input'
import { NativeSelect } from '@/shared/ui/native-select'
import { SelectField } from '@/shared/ui/select-field'
import { PageHeader } from '@/shared/ui/page-header'
import { PageLayout } from '@/shared/ui/page-layout'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { defaultStockFilters, filterStockRows, sortStockRows, stockFacetOptions, type StockFilters, type StockSort } from '../domain/currentStock'
import { useCurrentStock } from '../hooks/useCurrentStock'
import { stockTableColumns } from './stockColumns'
import { StockProductDetails } from './StockProductDetails'

const pageDefaults: StockFilters = { ...defaultStockFilters, active: '' }

export function CurrentStockPage() {
  const { rows, loading, error, retry } = useCurrentStock()
  const [filters, setFilters] = useState<StockFilters>({ ...pageDefaults })
  const [sort, setSort] = useState<StockSort>('name')
  const [descending, setDescending] = useState(false)
  const [page, setPage] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editSelected, setEditSelected] = useState(false)
  const vendorOptions = useMemo(() => stockFacetOptions(rows, 'vendor'), [rows])
  const matching = useMemo(() => filterStockRows(rows, filters, 'barcode'), [rows, filters])
  const sorted = useMemo(() => sortStockRows(matching, sort, descending), [matching, sort, descending])
  const pages = Math.max(1, Math.ceil(sorted.length / 50))
  const currentPage = Math.min(page, pages - 1)
  const visible = sorted.slice(currentPage * 50, (currentPage + 1) * 50)
  const selected = rows.find((row) => row.id === selectedId)
  function openProduct(id: string, edit = false) { setEditSelected(edit); setSelectedId(id) }
  function updateFilter(key: 'search' | 'stockStatus' | 'vendor', value: string) { setFilters((previous) => ({ ...previous, [key]: value })); setPage(0) }
  function changeSort(value: StockSort) { setSort(value); setDescending(sort === value ? !descending : false); setPage(0) }

  return <PageLayout className="min-h-0 flex-1 overflow-hidden" header={<PageHeader title="Current Stock" className="shrink-0" />}>
    <Card className="shrink-0 p-3" role="region" aria-label="Stock Filters">
      <div className="grid grid-cols-2 items-end gap-2 lg:grid-cols-[minmax(14rem,2fr)_repeat(2,minmax(0,1fr))_auto]">
        <div className="col-span-2 lg:col-span-1"><FieldLabel label="Barcode Search"><Input type="text" autoComplete="off" spellCheck={false} value={filters.search} placeholder="Type, Paste Or Scan Barcode" onChange={(event) => updateFilter('search', event.target.value)} /></FieldLabel></div>
        <FieldLabel label="Stock Status"><NativeSelect value={filters.stockStatus} onChange={(event) => updateFilter('stockStatus', event.target.value)}><option value="">All</option><option value="positive">In Stock</option><option value="zero">Zero Stock</option><option value="negative">Negative Stock</option></NativeSelect></FieldLabel>
        <FieldLabel label="Vendor"><SelectField value={filters.vendor} options={vendorOptions} onValueChange={(value) => updateFilter('vendor', value)} /></FieldLabel>
        <Button className="col-span-2 lg:col-span-1" variant="outline" onClick={() => { setFilters({ ...pageDefaults }); setPage(0) }}>Clear Filters</Button>
      </div>
    </Card>
    {error ? <div className="min-h-0 flex-1 overflow-y-auto"><Card className="space-y-2 p-4" role="alert"><p className="text-sm text-destructive">Unable To Load Current Stock.</p><p className="break-words text-xs text-muted-foreground">{error}</p><Button variant="outline" size="sm" onClick={retry}>Retry</Button></Card></div>
      : loading ? <Card className="min-h-0 flex-1 overflow-y-auto p-6 text-sm text-muted-foreground" role="status">Loading The Complete Stock Catalogue…</Card>
        : !matching.length ? <Card className="min-h-0 flex-1 overflow-y-auto p-6 text-sm text-muted-foreground" role="status">{filters.search.trim() ? 'No Products Match This Barcode And The Selected Filters.' : 'No Products Match These Filters.'}</Card>
          : <>
            <div className="min-h-0 min-w-0 flex-1"><Table containerClassName="h-full overflow-auto" className="min-w-[950px]">
              <TableHeader className="sticky top-0 z-10 bg-muted"><TableRow>{stockTableColumns.map((column) => <TableHead key={column.key} title={column.description} className={`normal-case tracking-normal ${column.numeric ? 'text-right' : ''}`} aria-sort={column.sort === sort ? descending ? 'descending' : 'ascending' : undefined}>
                <button type="button" className={`inline-flex items-center gap-1 py-2 ${column.numeric ? 'justify-end' : 'text-left'}`} onClick={() => changeSort(column.sort!)} aria-label={`Sort By ${column.label}`}>
                  {column.label}{column.sort === sort ? descending ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" /> : <ArrowUpDown className="size-3 text-muted-foreground" />}
                </button>
              </TableHead>)}<TableHead className="sticky right-0 z-20 bg-muted normal-case tracking-normal">Actions</TableHead></TableRow></TableHeader>
              <TableBody>{visible.map((row) => <TableRow key={row.id} className="cursor-pointer" onClick={() => openProduct(row.id)}>{stockTableColumns.map((column) => <TableCell key={column.key} className={`${column.key === 'name' ? 'min-w-56' : ''} ${column.numeric ? 'text-right tabular-nums' : ''} ${(column.key === 'currentQuantity' && row.currentQuantity < 0) || (column.key === 'marginPercent' && row.marginPercent !== null && row.marginPercent < 0) ? 'font-semibold text-destructive' : ''} ${column.key === 'barcode' ? 'font-mono text-xs' : ''}`}>{column.key === 'name' ? <button type="button" className="max-w-80 whitespace-normal text-left font-medium text-primary underline-offset-4 hover:underline" onClick={() => openProduct(row.id)}>{column.value(row)}</button> : column.value(row)}</TableCell>)}<TableCell className="sticky right-0 bg-card"><Button size="sm" variant="outline" aria-label={`Edit Stock Prices For ${row.name}`} onClick={(event) => { event.stopPropagation(); openProduct(row.id, true) }}>Edit</Button></TableCell></TableRow>)}</TableBody>
            </Table></div>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground" aria-label="Stock Pagination">
              <span aria-live="polite">Page {currentPage + 1} Of {pages}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={currentPage === pages - 1} onClick={() => setPage(currentPage + 1)}>Next</Button></div>
            </div>
          </>}
    {selected ? <StockProductDetails key={selected.id} product={selected} initialEdit={editSelected} onClose={() => setSelectedId(null)} /> : null}
  </PageLayout>
}
