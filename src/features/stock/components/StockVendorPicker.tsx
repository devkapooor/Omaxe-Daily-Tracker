import { useEffect, useState } from 'react'
import type { VendorV2 } from '@/domain/vendorLedgerV2'
import { Button } from '@/shared/ui/button'
import { SelectField } from '@/shared/ui/select-field'
import { loadVendors } from '../data/receiveStockRepository'
import type { Cursor } from '../data/stockQueries'

type Request = { id: number; prefix: string; cursor: Cursor; previous: VendorV2[]; delay: number }
type Result = { id: number; items: VendorV2[]; cursor: Cursor; hasMore: boolean; error: string }

/** Only an open picker reads the catalogue. Reopening starts a fresh server page. */
export function StockVendorPicker({ value, selected, onSelect }: { value: string; selected: VendorV2 | null; onSelect: (vendor: VendorV2) => void }) {
  const [open, setOpen] = useState(false)
  const [request, setRequest] = useState<Request>({ id: 0, prefix: '', cursor: null, previous: [], delay: 0 })
  const [result, setResult] = useState<Result>({ id: -1, items: [], cursor: null, hasMore: false, error: '' })
  const current = result.id === request.id
  const loading = !current
  const items = current ? result.items : request.previous

  useEffect(() => {
    if (!open) return
    let active = true
    const timer = window.setTimeout(() => {
      void loadVendors(request.prefix, request.cursor).then((page) => {
        if (!active) return
        const unique = new Map([...request.previous, ...page.items].map((vendor) => [vendor.id, vendor]))
        setResult({ id: request.id, items: [...unique.values()], cursor: page.cursor, hasMore: page.hasMore, error: '' })
      }).catch((cause: unknown) => {
        if (active) setResult({ id: request.id, items: request.previous, cursor: request.cursor, hasMore: false, error: cause instanceof Error ? cause.message : 'Unable to load vendors.' })
      })
    }, request.delay)
    return () => { active = false; window.clearTimeout(timer) }
  }, [open, request])

  const selectedOption = selected?.id === value ? [{ label: selected.canonicalName, value: selected.id, disabled: !selected.active }] : []
  // Keep the selected label when closed; server search results alone form the open list.
  const options = open ? items.map((vendor) => ({ label: vendor.canonicalName, value: vendor.id })) : selectedOption

  return <div className="min-w-0 flex-1">
    <SelectField value={value} options={options} placeholder="Choose vendor" filterLocally={false}
      emptyMessage={loading ? 'Loading vendors…' : current && result.error ? 'Vendors could not be loaded.' : 'No active vendors match this name prefix.'}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (nextOpen) setRequest((previous) => ({ id: previous.id + 1, prefix: '', cursor: null, previous: [], delay: 0 }))
      }}
      onSearchChange={(prefix) => setRequest((previous) => ({ id: previous.id + 1, prefix: prefix.trim(), cursor: null, previous: [], delay: prefix ? 300 : 0 }))}
      onValueChange={(id) => { const vendor = items.find((item) => item.id === id); if (vendor) onSelect(vendor) }}
      panelFooter={<div className="space-y-2 border-t px-2.5 py-2 text-xs text-muted-foreground">
        <p>Search by vendor name prefix (case sensitive).</p>
        {loading && items.length > 0 ? <p role="status">Loading more vendors…</p> : null}
        {current && result.error ? <div role="alert"><p className="break-words text-destructive">{result.error}</p><Button type="button" size="sm" variant="outline" onClick={() => setRequest((previous) => ({ ...previous, id: previous.id + 1, delay: 0 }))}>Retry vendors</Button></div> : null}
        {current && result.hasMore ? <Button type="button" size="sm" variant="outline" className="w-full" onClick={() => setRequest((previous) => ({ ...previous, id: previous.id + 1, cursor: result.cursor, previous: result.items, delay: 0 }))}>Load more vendors</Button> : null}
      </div>}
    />
  </div>
}
