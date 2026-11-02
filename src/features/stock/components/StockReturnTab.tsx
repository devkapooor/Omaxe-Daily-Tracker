import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot } from 'firebase/firestore'
import type { AppUser } from '@/domain/financeTypes'
import type { VendorReturnV2, VendorV2 } from '@/domain/vendorLedgerV2'
import { VendorStockReturns } from '@/features/vendor-workspace/components/VendorStockReturns'
import { loadVendorDirectory } from '@/features/stock/data/receiveStockRepository'
import { vendorLedgerV2Collections } from '@/store/vendorLedgerV2Repository'
import { db } from '@/shared/lib/firebase'
import { StatusPanel } from '@/shared/ui/status-panel'

type StockReturnTabProps = {
  currentUser: AppUser
  showToast: (message: string) => void
  businessLegalName: string
  businessGstin: string
}

export function StockReturnTab(props: StockReturnTabProps) {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [error, setError] = useState('')

  useEffect(() => onSnapshot(doc(db, 'appMetadata', 'vendorLedgerV2Config'), snapshot => {
    setEnabled(snapshot.data()?.enabled === true)
    setError('')
  }, cause => {
    setEnabled(false)
    setError(cause.message)
  }), [])

  if (enabled === null) return <StatusPanel className="m-3">Checking vendor setup…</StatusPanel>
  if (!enabled) return <StatusPanel variant="warning" className="m-3">{error || 'Vendor setup must be enabled before Stock Return can be used.'}</StatusPanel>

  return <StockReturnContent key="enabled" {...props} />
}

function StockReturnContent({ currentUser, showToast, businessLegalName, businessGstin }: StockReturnTabProps) {
  const [vendors, setVendors] = useState<VendorV2[]>([])
  const [returns, setReturns] = useState<VendorReturnV2[]>([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    const stopReturns = onSnapshot(collection(db, vendorLedgerV2Collections.returns), snapshot => {
      if (active) {
        setReturns(snapshot.docs.map(item => ({ ...item.data(), id: item.id }) as VendorReturnV2))
        setReady(true)
      }
    }, cause => {
      if (active) { setError(cause.message); setReady(true) }
    })
    void loadVendorDirectory(true).then(items => {
      if (active) setVendors(items)
    }).catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : 'Unable to load vendors.')
    })
    return () => { active = false; stopReturns() }
  }, [])

  if (error && !ready) return <StatusPanel variant="warning" className="m-3">{error}</StatusPanel>
  if (!ready) return <StatusPanel className="m-3">Loading Stock Return…</StatusPanel>

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true)
    try { await action(); showToast(success) }
    catch (cause) { showToast(cause instanceof Error ? cause.message : 'Unable to complete this stock return.'); throw cause }
    finally { setBusy(false) }
  }

  return <div className="grid gap-2 p-2">{error ? <StatusPanel variant="warning">{error}</StatusPanel> : null}<VendorStockReturns currentUser={currentUser} returns={returns} vendors={vendors} busy={busy} onRun={run} businessLegalName={businessLegalName} businessGstin={businessGstin} /></div>
}
