import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { AppUser } from '@/domain/financeTypes'
import { Button } from '@/shared/ui/button'
import { subscribeStockProduct } from '../data/stockRepository'
import { stockTitleCase, type StockRow } from '../domain/currentStock'
import { stockColumns } from './stockColumns'
import { StockPriceEditor } from './StockPriceEditor'
import { StockHistoryPage } from './StockHistoryPage'
import { StatusPanel } from '@/shared/ui/status-panel'

export function StockProductDetails({ productId, currentUser, onClose, onPricesSaved, initialEdit = false }: { productId: string; currentUser: AppUser; onClose: () => void; onPricesSaved: () => void; initialEdit?: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [product, setProduct] = useState<StockRow | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [editing, setEditing] = useState(initialEdit)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  useEffect(() => { const dialog = dialogRef.current; dialog?.showModal(); return () => dialog?.close() }, [])
  useEffect(() => {
    let active = true
    const stop = subscribeStockProduct(productId, (value) => { if (active) { setProduct(value); setError('') } }, (cause) => { if (active) setError(cause.message) })
    return () => { active = false; stop() }
  }, [productId, attempt])
  return <dialog ref={dialogRef} aria-labelledby="stock-product-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose() }} className="m-auto max-h-[88dvh] w-[calc(100%_-_2rem)] max-w-6xl overflow-y-auto rounded-lg border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/50">
    <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-card p-4">
      <h2 id="stock-product-title" className="text-lg font-semibold">{product ? stockTitleCase(product.name) : 'Product details'}</h2>
      <div className="flex shrink-0 gap-2"><Button variant="outline" disabled={!product || Boolean(error) || editing || busy} onClick={() => { setSaved(false); setEditing(true) }}>Edit Stock</Button><Button variant="ghost" size="icon" disabled={busy} aria-label="Close Product Details" onClick={onClose}><X className="size-5" /></Button></div>
    </div>
    <div className="space-y-5 p-4">
      {error ? <StatusPanel variant="destructive">{error}<Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>Retry</Button></StatusPanel> : !product ? <StatusPanel>Loading current product details…</StatusPanel> : <>
        {editing ? <StockPriceEditor product={product} onBusy={setBusy} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); setSaved(true); onPricesSaved() }} /> : null}
        {saved ? <p role="status" className="text-sm text-success">Prices Updated. The Owner Can Review This Change In Action Centre.</p> : null}
        <dl className="grid grid-cols-2 gap-x-5 gap-y-4 md:grid-cols-3 lg:grid-cols-4">{stockColumns.map((column) => <div key={column.key} className="min-w-0"><dt className="text-xs text-muted-foreground">{column.label}</dt><dd className={`mt-1 break-words text-sm font-medium ${column.key === 'currentQuantity' && product.currentQuantity < 0 ? 'text-destructive' : ''}`}>{column.value(product)}</dd></div>)}</dl>
        <p className="text-xs text-muted-foreground">Quantity changes use Stock Audit. Cost is the latest recorded unit cost; margin is before discounts and expenses. Opening quantity is the original imported quantity.</p>
        <details className="rounded-md border p-3" onToggle={(event) => setHistoryOpen(event.currentTarget.open)}><summary className="cursor-pointer text-base font-semibold">Recorded Movement History</summary>{historyOpen ? <div className="mt-3"><StockHistoryPage currentUser={currentUser} productId={product.id} /></div> : null}</details>
      </>}
    </div>
  </dialog>
}