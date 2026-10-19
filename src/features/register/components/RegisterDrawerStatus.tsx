import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/shared/lib/firebase'
import { money } from '@/app/uiHelpers'
import { Card, CardContent } from '@/shared/ui/card'

export function RegisterDrawerStatus() {
  const [drawer, setDrawer] = useState<number | null>(null)
  const [error, setError] = useState('')
  useEffect(() => onSnapshot(doc(db, 'posSandboxes', 'test', 'handover', 'main'), snapshot => {
    const ledger = snapshot.data(), checkpoint = ledger?.checkpoint
    setDrawer(ledger?.counterSession?.status === 'open'
      ? Number(checkpoint ? checkpoint.cashActualPaise + ledger.cashNetPaise - checkpoint.cashNetPaise : ledger.cashNetPaise)
      : null)
    setError('')
  }, cause => setError(cause.message)), [])
  return <Card><CardContent className="p-4"><p>Available drawer cash <strong>{error ? 'Unavailable' : drawer === null ? 'Counter closed' : money(drawer / 100)}</strong></p>{error ? <p role="alert" className="mt-2 text-sm text-destructive">{error}</p> : null}</CardContent></Card>
}
