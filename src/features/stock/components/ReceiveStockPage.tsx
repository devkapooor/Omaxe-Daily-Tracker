import { useEffect, useRef, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/shared/lib/firebase'
import type { AppUser } from '@/domain/financeTypes'
import type { VendorV2 } from '@/domain/vendorLedgerV2'
import { PosGoodsReceipt } from '@/features/pos/components/PosGoodsReceipt'
import { Button } from '@/shared/ui/button'
import { StatusPanel } from '@/shared/ui/status-panel'
import { loadVendor } from '../data/receiveStockRepository'
import { StockVendorPicker } from './StockVendorPicker'

export function ReceiveStockPage({ currentUser, showToast, ownerEnabled, view, onViewChange }: {
  currentUser: AppUser
  showToast: (message: string) => void
  ownerEnabled?: boolean
  view: 'receipt' | 'history'
  onViewChange: (view: 'receipt' | 'history') => void
}) {
  const [selectedId, setSelectedId] = useState('')
  const [selected, setSelected] = useState<VendorV2 | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [configError, setConfigError] = useState('')
  const [vendorError, setVendorError] = useState({ id: '', message: '' })
  const selectedRef = useRef(selected)
  useEffect(() => { selectedRef.current = selected }, [selected])
  const [vendorAttempt, setVendorAttempt] = useState(0)
  useEffect(() => {
    if (ownerEnabled !== undefined) return
    const stop = onSnapshot(doc(db, 'appMetadata', 'vendorLedgerV2Config'), (snapshot) => {
      setEnabled(snapshot.data()?.enabled === true); setConfigError('')
    }, (cause) => setConfigError(cause.message))
    return stop
  }, [ownerEnabled])
  useEffect(() => {
    if (!selectedId || selectedRef.current?.id === selectedId || view !== 'receipt') return
    let active = true
    void loadVendor(selectedId).then((vendor) => {
      if (!active) return
      setSelected(vendor)
      setVendorError({ id: selectedId, message: vendor ? '' : 'The selected vendor no longer exists. Choose another vendor.' })
    }).catch((cause: unknown) => {
      if (active) setVendorError({ id: selectedId, message: cause instanceof Error ? cause.message : 'Unable to load selected vendor.' })
    })
    return () => { active = false }
  }, [selectedId, vendorAttempt, view])
  const selectedVendor = selected?.id === selectedId ? selected : null
  return <div className="grid gap-3">
    {configError ? <StatusPanel variant="destructive">{configError}</StatusPanel> : null}
    {view === 'receipt' && vendorError.id === selectedId && vendorError.message ? <StatusPanel variant="destructive">{vendorError.message}<Button type="button" size="sm" variant="outline" onClick={() => setVendorAttempt((value) => value + 1)}>Retry selected vendor</Button></StatusPanel> : null}
    <PosGoodsReceipt currentUser={currentUser} vendors={selectedVendor ? [selectedVendor] : []}
      enabled={(ownerEnabled ?? enabled) && !configError} showToast={showToast}
      view={view} onViewChange={onViewChange} onVendorChange={setSelectedId}
      renderVendorPicker={(value, onValueChange) => <StockVendorPicker value={value} selected={selected} onSelect={(vendor) => {
        setSelected(vendor); setSelectedId(vendor.id); setVendorError({ id: '', message: '' }); onValueChange(vendor.id)
      }} />}
    />
  </div>
}
