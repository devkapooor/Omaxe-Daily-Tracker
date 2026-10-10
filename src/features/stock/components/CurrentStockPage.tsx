import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { FieldLabel } from '@/shared/ui/field-label'
import { Input } from '@/shared/ui/input'
import { NativeSelect } from '@/shared/ui/native-select'
import { SelectField } from '@/shared/ui/select-field'
import { PageHeader } from '@/shared/ui/page-header'
import { PageLayout } from '@/shared/ui/page-layout'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { defaultStockFilters, filterStockRows, sortStockRows, stockFacetOptions, stockFilterError, stockMoney, stockQuantity, stockTitleCase, type Facet, type StockFilters, type StockSort } from '../domain/currentStock'
import { useCurrentStock } from '../hooks/useCurrentStock'
import { stockColumns } from './stockColumns'
import { StockProductDetails } from './StockProductDetails'

const facets: Array<{ key: Facet; label: string }> = [{ key: 'category', label: 'Category' }, { key: 'subcategory', label: 'Subcategory' }, { key: 'brand', label: 'Brand' }, { key: 'vendor', label: 'Vendor' }]

export function CurrentStockPage() {
  const { rows, loading, error, retry } = useCurrentStock()
  const [filters, setFilters] = useState<StockFilters>({ ...defaultStockFilters })
  const [sort, setSort] = useState<StockSort>('name')
  const [descending, setDescending] = useState(false)
  const [page, setPage] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const options = useMemo(() => Object.fromEntries(facets.map(({ key }) => [key, stockFacetOptions(rows, key)])) as Record<Facet, ReturnType<typeof stockFacetOptions>>, [rows])
  const matching = useMemo(() => filterStockRows(rows, filters), [rows, filters])
  const sorted = useMemo(() => sortStockRows(matching, sort, descending), [matching, sort, descending])
  const totalQuantity = useMemo(() => matching.reduce((total, row) => total + row.currentQuantity, 0), [matching])
  const pages = Math.max(1, Math.ceil(sorted.length / 50))
  const currentPage = Math.min(page, pages - 1)
  const visible = sorted.slice(currentPage * 50, (currentPage + 1) * 50)
  const selected = rows.find((row) => row.id === selectedId)
  const filterError = stockFilterError(filters)
  function updateFilter(key: keyof StockFilters, value: string) { setFilters((previous) => ({ ...previous, [key]: value })); setPage(0) }
  function changeSort(value: StockSort) { setSort(value); setDescending(sort === value ? !descending : false); setPage(0) }

  return <PageLayout className="min-h-0 flex-1 overflow-hidden" header={<PageHeader title="Current Stock" tools={<Button variant="ghost" size="sm" onClick={() => { setFilters({ ...defaultStockFilters }); setPage(0) }}>Clear Filters</Button>} />}>
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
      <Card className="space-y-3 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <FieldLabel label="Search Products"><Input value={filters.search} placeholder="Scan Barcode Or Search Products" onChange={(event) => updateFilter('search', event.target.value)} /></FieldLabel>
          {facets.map(({ key, label }) => <FieldLabel key={key} label={label}><SelectField value={filters[key]} options={options[key]} onValueChange={(value) => updateFilter(key, value)} /></FieldLabel>)}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          <FieldLabel label="Stock Status"><NativeSelect value={filters.stockStatus} onChange={(event) => updateFilter('stockStatus', event.target.value)}><option value="">All</option><option value="positive">In Stock</option><option value="zero">Zero Stock</option><option value="negative">Negative Stock</option></NativeSelect></FieldLabel>
          <FieldLabel label="Minimum Quantity"><Input type="number" step="any" placeholder="Any" value={filters.minQuantity} onChange={(event) => updateFilter('minQuantity', event.target.value)} /></FieldLabel>
          <FieldLabel label="Maximum Quantity"><Input type="number" step="any" placeholder="Any" value={filters.maxQuantity} onChange={(event) => updateFilter('maxQuantity', event.target.value)} /></FieldLabel>
          <FieldLabel label="Product Status"><NativeSelect value={filters.active} onChange={(event) => updateFilter('active', event.target.value)}><option value="active">Active</option><option value="inactive">Inactive</option><option value="">All</option></NativeSelect></FieldLabel>
          <FieldLabel label="Sort By"><NativeSelect value={sort} onChange={(event) => { setSort(event.target.value as StockSort); setPage(0) }}><option value="name">Product Name</option><option value="currentQuantity">Current Quantity</option><option value="mrpPaise">MRP</option><option value="sellingPricePaise">Selling Price</option><option value="costPaise">Cost Price</option></NativeSelect></FieldLabel>
          <FieldLabel label="Sort Order"><NativeSelect value={descending ? 'desc' : 'asc'} onChange={(event) => { setDescending(event.target.value === 'desc'); setPage(0) }}><option value="asc">Ascending</option><option value="desc">Descending</option></NativeSelect></FieldLabel>
        </div>
        {filterError ? <p role="alert" className="text-sm text-destructive">{filterError}</p> : null}
      </Card>
      {error ? <Card className="space-y-2 p-4" role="alert"><p className="text-sm text-destructive">Unable To Load Current Stock.</p><p className="break-words text-xs text-muted-foreground">{error}</p><Button variant="outline" size="sm" onClick={retry}>Retry</Button></Card>
        : loading ? <Card className="p-6 text-sm text-muted-foreground" role="status">Loading The Complete Stock Catalogue…</Card>
          : <>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm" aria-live="polite"><p><strong>{matching.length.toLocaleString('en-IN')}</strong> Matching Products <span className="text-muted-foreground">· Total Quantity </span><strong className={totalQuantity < 0 ? 'text-destructive' : ''}>{stockQuantity(totalQuantity)}</strong></p><span className="text-xs text-muted-foreground">50 Products Per Page · Select A Product To View Details</span></div>
            {!matching.length ? <Card className="p-6 text-sm text-muted-foreground">{filterError ? 'Update The Quantity Range To View Products.' : 'No Products Match These Filters.'}</Card> : <>
              <div className="hidden md:block"><Table>
                <TableHeader><TableRow>{stockColumns.map((column) => <TableHead key={column.key} className={`normal-case tracking-normal ${column.numeric ? 'text-right' : ''}`} aria-sort={column.sort === sort ? descending ? 'descending' : 'ascending' : undefined}>{column.sort ? <button type="button" className="inline-flex items-center gap-1 py-2 text-left" onClick={() => changeSort(column.sort!)}>{column.label}{column.sort === sort ? descending ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" /> : null}</button> : column.label}</TableHead>)}</TableRow></TableHeader>
                <TableBody>{visible.map((row) => <TableRow key={row.id}>{stockColumns.map((column) => <TableCell key={column.key} className={`${column.key === 'name' ? 'min-w-56' : ''} ${column.numeric ? 'text-right tabular-nums' : ''} ${column.key === 'currentQuantity' && row.currentQuantity < 0 ? 'font-semibold text-destructive' : ''} ${column.key === 'id' || column.key === 'barcode' ? 'font-mono text-xs' : ''}`}>{column.key === 'name' ? <button type="button" className="max-w-80 whitespace-normal text-left font-medium text-primary underline-offset-4 hover:underline" onClick={() => setSelectedId(row.id)}>{column.value(row)}</button> : column.value(row)}</TableCell>)}</TableRow>)}</TableBody>
              </Table></div>
              <div className="grid gap-2 md:hidden">{visible.map((row) => <button key={row.id} type="button" className="rounded-md border border-border bg-card p-3 text-left shadow-sm" onClick={() => setSelectedId(row.id)}>
                <span className="block text-sm font-semibold text-primary">{stockTitleCase(row.name)}</span><span className="mt-1 block break-all font-mono text-xs text-muted-foreground">{row.barcode || row.id}</span>
                <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs"><span className={row.currentQuantity < 0 ? 'font-semibold text-destructive' : ''}>Quantity: {stockQuantity(row.currentQuantity)}</span><span>MRP: {stockMoney(row.mrpPaise)}</span><span>Selling Price: {stockMoney(row.sellingPricePaise)}</span><span>Cost Price: {stockMoney(row.costPaise)}</span></span>
                <span className="mt-1 block text-xs text-muted-foreground">{stockTitleCase(row.category)} · {row.active ? 'Active' : 'Inactive'} · View Details</span>
              </button>)}</div>
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 text-xs text-muted-foreground"><span>{currentPage * 50 + 1}–{Math.min((currentPage + 1) * 50, matching.length)} Of {matching.length.toLocaleString('en-IN')} Products · Page {currentPage + 1} Of {pages}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={currentPage === pages - 1} onClick={() => setPage(currentPage + 1)}>Next</Button></div></div>
            </>}
          </>}
    </div>
    {selected ? <StockProductDetails key={selected.id} product={selected} onClose={() => setSelectedId(null)} /> : null}
  </PageLayout>
}
