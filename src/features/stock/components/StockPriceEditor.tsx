import { useRef, useState } from 'react'
import { Button } from '@/shared/ui/button'
import { FieldLabel } from '@/shared/ui/field-label'
import { Input } from '@/shared/ui/input'
import { Textarea } from '@/shared/ui/textarea'
import { changeStockPrices } from '../data/stockPriceRepository'
import { stockPricePaise, validateStockPrices } from '../domain/stockPriceChange'
import { stockMoney, type StockRow } from '../domain/currentStock'

export function StockPriceEditor({ product, onCancel, onSaved, onBusy }: { product: StockRow; onCancel: () => void; onSaved: () => void; onBusy: (busy: boolean) => void }) {
  // Preserve the before-state and revision from the moment editing starts.
  const [original] = useState(product)
  const [mrp, setMrp] = useState(original.mrpPaise === null ? '' : (original.mrpPaise / 100).toFixed(2))
  const [selling, setSelling] = useState((original.sellingPricePaise / 100).toFixed(2))
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sending = useRef(false)
  const operation = useRef<{ fingerprint: string; id: string } | null>(null)
  const changedElsewhere = product.revision !== original.revision

  async function save() {
    if (sending.current) return
    setError(null)
    try {
      const mrpPaise = stockPricePaise(mrp, true)
      const sellingPricePaise = stockPricePaise(selling)!
      validateStockPrices({ mrpPaise, sellingPricePaise })
      if (mrpPaise === original.mrpPaise && sellingPricePaise === original.sellingPricePaise) throw new Error('Change MRP or selling price before saving.')
      if (reason.trim().length < 5 || reason.trim().length > 1000) throw new Error('Enter a change reason between 5 and 1000 characters.')
      const payload = { productId: original.id, expectedRevision: original.revision, mrpPaise, sellingPricePaise, reason: reason.trim() }
      const fingerprint = JSON.stringify(payload)
      if (!operation.current || operation.current.fingerprint !== fingerprint) operation.current = { fingerprint, id: `stock-price-${crypto.randomUUID()}` }
      sending.current = true; setBusy(true); onBusy(true)
      await changeStockPrices({ ...payload, operationId: operation.current.id })
      onSaved()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save stock prices. Your entered values have been kept.') }
    finally { sending.current = false; setBusy(false); onBusy(false) }
  }

  return <form className="space-y-3 rounded-md border border-border p-3" onSubmit={(event) => { event.preventDefault(); void save() }}>
    <h3 className="text-base font-semibold">Edit Stock Prices</h3>
    <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
      <FieldLabel label="MRP (₹)"><p className="text-xs text-muted-foreground">Current: {stockMoney(original.mrpPaise)}</p><Input inputMode="decimal" value={mrp} onChange={(event) => setMrp(event.target.value)} placeholder="Enter MRP" required /><p className="text-xs text-muted-foreground">Selling price must be at or below MRP.</p></FieldLabel>
      <FieldLabel label="Selling Price (₹)"><p className="text-xs text-muted-foreground">Current: {stockMoney(original.sellingPricePaise)}</p><Input inputMode="decimal" value={selling} onChange={(event) => setSelling(event.target.value)} required /></FieldLabel>
      <FieldLabel className="sm:col-span-2" label="Reason For Change"><Textarea value={reason} minLength={5} maxLength={1000} required onChange={(event) => setReason(event.target.value)} placeholder="Explain why these prices need correcting" /></FieldLabel>
    </fieldset>
    <p className="text-xs text-muted-foreground">Save updates current prices immediately and sends the before/after record to the owner in Action Centre.</p>
    {changedElsewhere ? <p role="alert" className="text-sm text-destructive">This product changed while you were editing. Cancel and reopen Edit Stock for a new edit. After an interrupted save, retry unchanged values to check whether it was saved.</p> : null}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Cancel Editing</Button><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save Prices'}</Button></div>
  </form>
}
