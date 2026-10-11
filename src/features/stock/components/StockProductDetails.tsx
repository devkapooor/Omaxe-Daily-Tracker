import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { subscribeStockMovements, type StockMovement } from '../data/stockRepository'
import { NOT_RECORDED, stockDate, stockQuantity, stockTitleCase, type StockRow } from '../domain/currentStock'
import { stockColumns } from './stockColumns'
import { StockPriceEditor } from './StockPriceEditor'

function MovementHistory({ productId }: { productId: string }) {
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [page, setPage] = useState(0)
  useEffect(() => {
    let cancelled = false
    const stop = subscribeStockMovements(productId, (items) => {
      if (!cancelled) { setMovements(items); setLoading(false) }
    }, (cause) => { if (!cancelled) { setError(cause.message); setLoading(false) } })
    return () => { cancelled = true; stop() }
  }, [productId, attempt])
  const pages = Math.max(1, Math.ceil(movements.length / 50))
  const currentPage = Math.min(page, pages - 1)
  if (error) return <div role="alert" className="space-y-2 text-sm"><p className="text-destructive">Unable To Load Movement History.</p><p className="break-words text-muted-foreground">{error}</p><Button variant="outline" onClick={() => { setError(null); setLoading(true); setAttempt((value) => value + 1) }}>Retry</Button></div>
  if (loading) return <p role="status" className="text-sm text-muted-foreground">Loading Movement History…</p>
  if (!movements.length) return <p className="text-sm text-muted-foreground">No Recorded Movements. Opening Stock Was Imported Separately.</p>
  return <div className="space-y-3">
    <Table>
      <TableHeader><TableRow>{['Recorded At', 'Business Date', 'Movement', 'Quantity Change', 'Before', 'After', 'Recorded By', 'Reference', 'Reason'].map((label) => <TableHead key={label} className="normal-case tracking-normal">{label}</TableHead>)}</TableRow></TableHeader>
      <TableBody>{movements.slice(currentPage * 50, (currentPage + 1) * 50).map((movement) => <TableRow key={movement.id}>
        <TableCell>{stockDate(movement.createdAt)}</TableCell>
        <TableCell>{movement.businessDate || NOT_RECORDED}</TableCell>
        <TableCell>{stockTitleCase((movement.type ?? '').replace(/-/g, ' '))}</TableCell>
        <TableCell className={movement.quantityDelta < 0 ? 'text-destructive tabular-nums' : 'tabular-nums'}>{movement.quantityDelta > 0 ? '+' : ''}{stockQuantity(movement.quantityDelta ?? null)}</TableCell>
        <TableCell>{stockQuantity(movement.beforeQuantity ?? null)}</TableCell>
        <TableCell>{stockQuantity(movement.afterQuantity ?? null)}</TableCell>
        <TableCell>{stockTitleCase(movement.actorName ?? '')}</TableCell>
        <TableCell className="font-mono text-xs">{movement.goodsReceiptId ? `GRN: ${movement.goodsReceiptId}` : movement.billId ? `Bill: ${movement.billId}` : movement.stockAuditId ? `Audit: ${movement.stockAuditId}` : movement.id}</TableCell>
        <TableCell className="max-w-80 whitespace-normal">{stockTitleCase(movement.reason ?? '')}</TableCell>
      </TableRow>)}</TableBody>
    </Table>
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>{movements.length.toLocaleString('en-IN')} Recorded Movements · Page {currentPage + 1} Of {pages}</span>
      <div className="flex gap-2"><Button variant="outline" size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={currentPage >= pages - 1} onClick={() => setPage(currentPage + 1)}>Next</Button></div>
    </div>
  </div>
}

export function StockProductDetails({ product, onClose, initialEdit = false }: { product: StockRow; onClose: () => void; initialEdit?: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [editing, setEditing] = useState(initialEdit)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  // React's development effect cleanup also closes the native dialog. Only user
  // cancellation should clear the selected product, not that cleanup close event.
  return <dialog ref={dialogRef} aria-labelledby="stock-product-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose() }} className="m-auto max-h-[88dvh] w-[calc(100%_-_2rem)] max-w-6xl overflow-y-auto rounded-lg border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/50">
    <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-card p-4">
      <h2 id="stock-product-title" className="text-lg font-semibold">{stockTitleCase(product.name)}</h2>
      <div className="flex shrink-0 gap-2"><Button variant="outline" disabled={editing || busy} onClick={() => { setSaved(false); setEditing(true) }}>Edit Stock</Button><Button variant="ghost" size="icon" disabled={busy} aria-label="Close Product Details" onClick={onClose}><X className="size-5" /></Button></div>
    </div>
    <div className="space-y-5 p-4">
      {editing ? <StockPriceEditor product={product} onBusy={setBusy} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); setSaved(true) }} /> : null}
      {saved ? <p role="status" className="text-sm text-success">Prices Updated. The Owner Can Review This Change In Action Centre.</p> : null}
      <dl className="grid grid-cols-2 gap-x-5 gap-y-4 md:grid-cols-3 lg:grid-cols-4">{stockColumns.map((column) => <div key={column.key} className="min-w-0"><dt className="text-xs text-muted-foreground">{column.label}</dt><dd className={`mt-1 break-words text-sm font-medium ${column.key === 'currentQuantity' && product.currentQuantity < 0 ? 'text-destructive' : ''} ${column.key === 'id' || column.key === 'barcode' ? 'font-mono' : ''}`}>{column.value(product)}</dd></div>)}</dl>
      <p className="text-xs text-muted-foreground">Cost Price Is The Latest Recorded Unit Cost. Margin (%) Uses Selling Price And This Cost, Before Discounts And Expenses. Opening Quantity Is The Original Imported Quantity.</p>
      <details className="rounded-md border border-border p-3" onToggle={(event) => setHistoryOpen(event.currentTarget.open)}>
        <summary className="cursor-pointer text-base font-semibold">Recorded Movement History</summary>
        {historyOpen ? <div className="mt-3"><MovementHistory productId={product.id} /></div> : null}
      </details>
    </div>
  </dialog>
}
