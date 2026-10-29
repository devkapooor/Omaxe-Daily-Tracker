import { useEffect, useState } from 'react'
import { where } from 'firebase/firestore'
import type { AppUser } from '@/domain/financeTypes'
import type { PosGoodsReceipt } from '@/features/pos/domain/types'
import { Button } from '@/shared/ui/button'
import { SelectField } from '@/shared/ui/select-field'
import { readPage, type Cursor, type ServerPage } from '../data/stockQueries'
import { stockMoney, stockDate } from '../domain/currentStock'

export function SavedReceiptDrafts({ actor, refreshKey, onResume, onDelete, busy = false }: {
  actor: AppUser; refreshKey: number; busy?: boolean
  onResume: (receipt: PosGoodsReceipt) => void; onDelete: (receipt: PosGoodsReceipt) => void
}) {
  const [items, setItems] = useState<PosGoodsReceipt[]>([])
  const [selected, setSelected] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true); setError('')
      try {
        const all: PosGoodsReceipt[] = []; let cursor: Cursor = null
        for (;;) {
          const page: ServerPage<PosGoodsReceipt> = await readPage<PosGoodsReceipt>('goodsReceipts', [where('status', '==', 'draft')], cursor, 250, 'draft-selector:' + refreshKey + ':' + attempt, '__name__', 'asc')
          all.push(...page.items)
          if (all.length > 10000) throw new Error('Too many drafts to search safely. Ask the owner to review them.')
          if (!page.hasMore) break
          cursor = page.cursor
        }
        if (active) setItems(all.sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt)))
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load drafts.') }
      finally { if (active) setLoading(false) }
    }
    void load(); return () => { active = false }
  }, [actor.id, refreshKey, attempt])
  const receipt = items.find(item => item.id === selected)
  const canEdit = receipt && (actor.role === 'owner' || receipt.createdByUid === actor.id)
  return <section className="rounded-md border bg-card px-3 py-2" aria-label="Saved GRN drafts">
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold">Saved drafts{loading ? '' : ' (' + items.length + ')'}</span>
      <SelectField className="min-w-48 flex-1" searchable disabled={loading || busy || !!error} placeholder={loading ? 'Loading drafts…' : items.length ? 'Search vendor or invoice · all dates' : 'No saved drafts'} value={receipt?.id ?? ''} onValueChange={setSelected} options={items.map(item => ({ value: item.id, label: item.vendorName + ' · ' + item.invoiceNumber + ' · ' + stockDate(item.updatedAt ?? item.createdAt) + ' · ' + stockMoney(item.invoiceTotalPaise ?? item.totalPaise) }))} />
      <Button type="button" size="sm" variant="outline" disabled={busy || !canEdit} onClick={() => receipt && onResume(receipt)}>Resume</Button>
      <Button type="button" size="sm" variant="outline" disabled={busy || !canEdit} onClick={() => receipt && onDelete(receipt)}>Delete draft</Button>
      <Button type="button" size="sm" variant="ghost" disabled={busy || loading} onClick={() => setAttempt(value => value + 1)}>Refresh</Button>
    </div>
    {error ? <p role="alert" className="mt-1 text-xs text-destructive">{error}</p> : receipt && !canEdit ? <p className="mt-1 text-xs text-muted-foreground">Only the creator or owner can resume or delete this draft.</p> : null}
  </section>
}
