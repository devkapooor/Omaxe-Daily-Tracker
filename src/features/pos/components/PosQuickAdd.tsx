import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { subscribePosQuickProducts } from '../data/posRepository'
import type { PosProduct } from '../domain/types'

export function PosQuickAdd({ onAdd, disabled = false }: { onAdd: (product: PosProduct) => void; disabled?: boolean }) {
  const [products, setProducts] = useState<PosProduct[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    const stop = subscribePosQuickProducts((items) => {
      if (active) { setProducts(items); setStatus('ready') }
    }, () => { if (active) setStatus('error') })
    return () => { active = false; stop() }
  }, [attempt])

  return <section aria-label="Quick add products" className="grid min-w-0 gap-1.5 border-t border-border pt-2">
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quick add</h2>
      <span className="text-xs text-muted-foreground">Tap to add 1</span>
    </div>
    {status === 'loading' ? <p role="status" className="text-xs text-muted-foreground">Loading quick products…</p>
      : status === 'error' ? <div role="alert" className="flex items-center justify-between gap-2 text-xs text-destructive">
        <span>Quick products could not load. You can still scan or search.</span>
        <Button type="button" size="sm" variant="outline" onClick={() => { setStatus('loading'); setAttempt((value) => value + 1) }}>Retry</Button>
      </div>
      : products.length === 0 ? <p className="text-xs text-muted-foreground">No active quick products available. Use scan or search.</p>
      : <div className="flex min-w-0 gap-1.5 overflow-x-auto pb-1">
        {products.map((product) => <Button key={product.id} type="button" variant="outline" disabled={disabled || !navigator.onLine}
          aria-label={`Add ${product.name}`} title={`${product.name} · ${product.barcode}`}
          className="h-10 min-w-28 flex-1 shrink-0 justify-start gap-1.5 px-2 py-1 text-left"
          onClick={() => onAdd(product)}>
          <Plus className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
          <span className="grid min-w-0">
            <span className="truncate text-[11px] leading-4">{product.name}</span>
            <span className="text-[11px] font-normal leading-4 tabular-nums text-muted-foreground">₹{(product.sellingPricePaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </span>
        </Button>)}
      </div>}
  </section>
}
