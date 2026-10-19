import { useEffect, useMemo, useRef, useState } from 'react'
import type { AppUser } from '@/domain/financeTypes'
import { today } from '@/app/uiHelpers'
import { recentStockDate } from '../domain/stockDates'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'
import { FieldLabel } from '@/shared/ui/field-label'
import { NativeSelect } from '@/shared/ui/native-select'
import { StatusPanel } from '@/shared/ui/status-panel'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { createStockHistoryPager, historyKey, type HistoryFilters, type StockHistoryEntry } from '../data/stockHistoryRepository'
import { stockDate, stockMoney, stockTitleCase } from '../domain/currentStock'
import { StockSourceDetails } from './StockSourceDetails'

type Page = { items: StockHistoryEntry[]; hasMore: boolean }
export function StockHistoryPage({ currentUser, productId }: { currentUser: AppUser; productId?: string }) {
  const [filters, setFilters] = useState<HistoryFilters>({ from: productId ? '' : recentStockDate(), to: productId ? '' : today(), identifier: productId ?? '', identifierMode: productId ? 'productId' : 'barcode', event: '', undated: false })
  const [input, setInput] = useState(filters.identifier)
  useEffect(() => { const timer = window.setTimeout(() => setFilters((value) => ({ ...value, identifier: input })), 300); return () => window.clearTimeout(timer) }, [input])
  const [attempt, setAttempt] = useState(0)
  const key = JSON.stringify([filters, attempt])
  const pager = useMemo(() => {
    try { return createStockHistoryPager(filters, attempt) } catch (cause) { return { asOf: '', next: () => Promise.reject(cause) as Promise<Page> } }
  // The attempt intentionally creates a fresh snapshot boundary.
  }, [filters, attempt])
  const [state, setState] = useState<{ key: string; pages: Page[]; index: number; error: string; loading: boolean }>({ key: '', pages: [], index: 0, error: '', loading: true })
  const active = useRef('')
  const sending = useRef('')
  const [selected, setSelected] = useState<StockHistoryEntry | null>(null)
  useEffect(() => {
    active.current = key
    let live = true
    void pager.next().then((page) => { if (live) setState({ key, pages: [page], index: 0, error: '', loading: false }) }).catch((cause: unknown) => { if (live) setState({ key, pages: [], index: 0, error: cause instanceof Error ? cause.message : 'Unable to load history.', loading: false }) })
    return () => { live = false; if (active.current === key) active.current = '' }
  }, [key, pager])
  const current = state.key === key ? state : { key, pages: [], index: 0, error: '', loading: true }
  const pendingFilter = input !== filters.identifier
  const loading = current.loading || pendingFilter
  const page = current.pages[current.index]
  async function next() {
    if (sending.current === key || loading || !page?.hasMore) return
    if (current.pages[current.index + 1]) { setState((value) => ({ ...value, index: value.index + 1 })); return }
    sending.current = key
    setState((value) => ({ ...value, loading: true, error: '' }))
    try { const result = await pager.next(); if (active.current === key) setState((value) => value.key === key ? { ...value, pages: [...value.pages, result], index: value.index + 1, loading: false } : value) }
    catch (cause) { if (active.current === key) setState((value) => ({ ...value, loading: false, error: cause instanceof Error ? cause.message : 'Unable to load the next page.' })) }
    finally { if (sending.current === key) sending.current = '' }
  }
  return <div className="grid gap-3">
    <Card className="grid grid-cols-2 gap-2 p-3 lg:grid-cols-5">
      <FieldLabel label="From"><Input type="date" disabled={filters.undated} value={filters.from} onChange={(event) => setFilters((value) => ({ ...value, from: event.target.value }))} /></FieldLabel>
      <FieldLabel label="To"><Input type="date" disabled={filters.undated} value={filters.to} onChange={(event) => setFilters((value) => ({ ...value, to: event.target.value }))} /></FieldLabel>
      {!productId ? <><FieldLabel label="Find by"><NativeSelect value={filters.identifierMode} onChange={(event) => setFilters((value) => ({ ...value, identifierMode: event.target.value as 'barcode' | 'productId' }))}><option value="barcode">Exact barcode</option><option value="productId">Exact product ID</option></NativeSelect></FieldLabel><FieldLabel label="Product / barcode"><Input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Optional exact identifier" /></FieldLabel></> : null}
      <FieldLabel label="Event type"><NativeSelect value={filters.event} onChange={(event) => setFilters((value) => ({ ...value, event: event.target.value }))}>{[['', 'All events'], ['receipts', 'Receipts'], ['sales', 'Sales deductions'], ['returns', 'Returns'], ['damaged', 'Damaged returns'], ['adjustments', 'Quantity adjustments'], ['reversals', 'Reversals'], ['prices', 'Price changes']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</NativeSelect></FieldLabel>
    </Card>
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-foreground">Snapshot {pager.asOf ? stockDate(pager.asOf) : 'not loaded'}. Date filters exclude undated records. Blank dates include all dated history.</p><Button size="sm" variant="outline" onClick={() => setFilters((value) => ({ ...value, undated: !value.undated }))}>{filters.undated ? 'Dated history' : 'Undated legacy records'}</Button></div>
    {filters.identifier.trim() ? <p className="text-xs text-muted-foreground">Product filters cover stock movements. Bill-level damaged returns have no recorded product identifiers and are excluded from this filtered result. Historical unmapped returns are also bill-level and excluded.</p> : null}
    {filters.undated ? <p className="text-xs text-muted-foreground">An exact product ID is required. Each request inspects bounded product-specific pages; an empty page does not mean the scan is finished while Next remains available.</p> : null}
    {current.error ? <StatusPanel variant="destructive">{current.error}<Button size="sm" variant="outline" onClick={() => current.pages.length ? void next() : setAttempt((value) => value + 1)}>Retry</Button></StatusPanel> : null}
    {loading ? <StatusPanel>Loading history…</StatusPanel> : !page?.items.length ? <StatusPanel>{page?.hasMore ? 'No matching records in these scanned pages. Continue with Next.' : 'No recorded events match these filters.'}</StatusPanel> : <Table containerClassName="max-h-[60vh] overflow-auto" className="min-w-[1120px]">
      <TableHeader><TableRow>{['Date / time', 'Product / barcode', 'Event', 'Quantity change', 'MRP: old → new', 'Selling: old → new', 'Source', 'Recorded by', 'Reason', 'Details'].map((label) => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader>
      <TableBody>{page.items.map((entry) => <TableRow key={historyKey(entry)}><TableCell>{entry.createdAt ? stockDate(entry.createdAt) : 'Not recorded'}</TableCell><TableCell><span className="block">{entry.sourceKind !== 'movement' ? 'Bill-level return' : entry.productName || entry.productId || 'Not recorded'}</span><span className="font-mono text-xs text-muted-foreground">{entry.barcode || 'Barcode not recorded'}</span></TableCell><TableCell>{entry.sourceKind === 'damaged-return' ? 'Damaged return · no stock change' : entry.sourceKind === 'unmapped-return' ? 'Historical unmapped return · No stock record' : stockTitleCase(entry.type.replace(/-/g, ' '))}</TableCell><TableCell className="text-right tabular-nums">{entry.quantityDelta > 0 ? '+' : ''}{entry.quantityDelta ?? 'Not recorded'}</TableCell><TableCell>{'beforeMrpPaise' in entry || 'afterMrpPaise' in entry ? `${stockMoney(entry.beforeMrpPaise ?? null)} → ${stockMoney(entry.afterMrpPaise ?? null)}` : 'In source details / not recorded'}</TableCell><TableCell>{'beforeSellingPricePaise' in entry || 'afterSellingPricePaise' in entry ? `${stockMoney(entry.beforeSellingPricePaise ?? null)} → ${stockMoney(entry.afterSellingPricePaise ?? null)}` : 'In source details / not recorded'}</TableCell><TableCell className="max-w-48 break-all font-mono text-xs">{entry.goodsReceiptId || entry.billId || entry.stockAuditId || entry.correctionId || entry.sourceReference || entry.id}</TableCell><TableCell>{entry.actorName || entry.actorUid || 'Not recorded'}</TableCell><TableCell className="max-w-56 whitespace-normal">{entry.reason || (entry.stockAuditId || entry.approvalId ? 'Open source details' : 'Not recorded')}</TableCell><TableCell><Button size="sm" variant="outline" onClick={() => setSelected(entry)}>View</Button></TableCell></TableRow>)}</TableBody>
    </Table>}
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>Page {current.index + 1}</span><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setAttempt((value) => value + 1)} disabled={loading}>Refresh</Button><Button variant="outline" size="sm" disabled={loading || current.index === 0} onClick={() => setState((value) => ({ ...value, index: value.index - 1 }))}>Previous</Button><Button variant="outline" size="sm" disabled={loading || !page?.hasMore} onClick={() => void next()}>Next</Button></div></div>
    {selected ? <StockSourceDetails entry={selected} currentUser={currentUser} onClose={() => setSelected(null)} /> : null}
  </div>
}
