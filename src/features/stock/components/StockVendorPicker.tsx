import { useEffect, useState } from 'react'
import type { VendorV2 } from '@/domain/vendorLedgerV2'
import { vendorIdentitySearchText } from '@/domain/vendorIdentityV2'
import { Button } from '@/shared/ui/button'
import { SelectField } from '@/shared/ui/select-field'
import { loadVendorDirectory } from '../data/receiveStockRepository'

export function StockVendorPicker({ value, selected, onSelect, includeInactive = false, allowClear = false }: {
  value: string; selected: VendorV2 | null; onSelect: (vendor: VendorV2 | null) => void
  includeInactive?: boolean; allowClear?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState('')
  const [count, setCount] = useState(25)
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<{ items: VendorV2[]; ready: boolean; error: string }>({ items: [], ready: false, error: '' })
  useEffect(() => {
    if (!open) return
    let active = true
    void loadVendorDirectory(includeInactive).then(items => {
      if (active) setState({ items, ready: true, error: '' })
    }).catch((error: unknown) => { if (active) setState({ items: [], ready: true, error: error instanceof Error ? error.message : 'Unable to load vendors.' }) })
    return () => { active = false }
  }, [open, includeInactive, attempt])
  const words = term.trim().toLocaleLowerCase('en-IN').split(/\s+/).filter(Boolean)
  const matches = state.items.filter(vendor => words.every(word => vendorIdentitySearchText(vendor).includes(word)))
  const options = (open ? matches.slice(0, count) : selected ? [selected] : []).map(vendor => ({
    label: vendor.canonicalName + (vendor.active ? '' : ' (inactive)'), value: vendor.id,
  }))
  if (open && allowClear) options.unshift({ label: 'All vendors', value: '' })
  return <div className="min-w-0 flex-1">
    <SelectField value={value} options={options} placeholder={allowClear ? 'All vendors' : 'Choose vendor'} filterLocally={false}
      emptyMessage={!state.ready ? 'Searching the complete vendor directory…' : state.error ? 'Vendor search failed.' : 'No vendors match this name or alias.'}
      onOpenChange={next => {
        setOpen(next)
        if (next) { setTerm(''); setCount(25); setState({ items: [], ready: false, error: '' }) }
      }}
      onSearchChange={query => { setTerm(query); setCount(25) }}
      onValueChange={id => { if (!id && allowClear) onSelect(null); else { const vendor = state.items.find(item => item.id === id); if (vendor) onSelect(vendor) } }}
      panelFooter={<div className="space-y-2 border-t px-2.5 py-2 text-xs text-muted-foreground">
        <p>{state.ready && !state.error ? `${matches.length} matches · searches every vendor name and alias` : 'Loading the complete directory…'}</p>
        {state.error ? <div role="alert"><p className="text-destructive">{state.error}</p><Button type="button" size="sm" variant="outline" onClick={() => { setState({ items: [], ready: false, error: '' }); setAttempt(value => value + 1) }}>Retry vendors</Button></div> : null}
        {state.ready && matches.length > count ? <Button type="button" size="sm" variant="outline" onClick={() => setCount(value => value + 25)}>Show more matches</Button> : null}
      </div>} />
  </div>
}
