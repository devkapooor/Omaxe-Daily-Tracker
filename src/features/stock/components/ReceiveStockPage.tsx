import { useEffect, useMemo, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/shared/lib/firebase'
import type { AppUser } from '@/domain/financeTypes'
import type { VendorV2 } from '@/domain/vendorLedgerV2'
import { PosGoodsReceipt } from '@/features/pos/components/PosGoodsReceipt'
import { FieldLabel } from '@/shared/ui/field-label'
import { Input } from '@/shared/ui/input'
import { Button } from '@/shared/ui/button'
import { StatusPanel } from '@/shared/ui/status-panel'
import { loadVendor, loadVendors } from '../data/receiveStockRepository'
import { useServerPage } from '../hooks/useServerPage'
import { StockPageControls } from './StockPageControls'
export function ReceiveStockPage({ currentUser, showToast, ownerEnabled }: { currentUser: AppUser; showToast: (message: string) => void; ownerEnabled?: boolean }) {
  const [prefix, setPrefix] = useState('')
  const [search, setSearch] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [selected, setSelected] = useState<VendorV2 | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { const timer = window.setTimeout(() => setPrefix(search), 300); return () => window.clearTimeout(timer) }, [search])
  const vendors = useServerPage(prefix, (cursor) => loadVendors(prefix, cursor), pickerOpen)
  useEffect(() => { if (ownerEnabled !== undefined) return; let active = true; const stop = onSnapshot(doc(db, 'appMetadata', 'vendorLedgerV2Config'), (snapshot) => { if (active) { setEnabled(snapshot.data()?.enabled === true); setError('') } }, (cause) => { if (active) setError(cause.message) }); return () => { active = false; stop() } }, [ownerEnabled])
  useEffect(() => {
    if (!selectedId) return
    let active = true
    void loadVendor(selectedId).then((value) => { if (active) setSelected(value) }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load selected vendor.') })
    return () => { active = false }
  }, [selectedId])
  const options = useMemo(() => [...new Map([...vendors.items, ...(selected?.id === selectedId ? [selected] : [])].map((vendor) => [vendor.id, vendor])).values()], [vendors.items, selected, selectedId])
  return <div className="grid gap-3">
    <div className="flex flex-wrap items-end gap-2"><Button size="sm" variant="outline" onClick={() => setPickerOpen((value) => !value)}>{pickerOpen ? 'Close vendor catalogue' : 'Find vendors'}</Button>{selected?.id === selectedId ? <span className="text-sm text-muted-foreground">Selected: {selected.canonicalName}</span> : null}</div>
    {pickerOpen ? <div className="space-y-2 rounded-md border p-3"><FieldLabel label="Vendor name starts with (case sensitive)"><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Optional name prefix" /></FieldLabel>{vendors.error ? <StatusPanel variant="destructive">{vendors.error}<Button size="sm" variant="outline" onClick={vendors.retry}>Retry</Button></StatusPanel> : vendors.loading ? <StatusPanel>Loading vendors…</StatusPanel> : <p className="text-xs text-muted-foreground">{vendors.items.length} vendors available in the form's selector on this catalogue page.</p>}<StockPageControls {...vendors} /></div> : null}
    {error ? <StatusPanel variant="destructive">{error}</StatusPanel> : null}
    <PosGoodsReceipt currentUser={currentUser} vendors={options} enabled={(ownerEnabled ?? enabled) && !error} showToast={showToast} onVendorChange={setSelectedId} onFindVendors={() => setPickerOpen(true)} />
  </div>
}
