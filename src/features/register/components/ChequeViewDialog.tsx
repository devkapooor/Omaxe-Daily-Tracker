import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { doc, getDocFromServer } from 'firebase/firestore'
import { X } from 'lucide-react'
import type { ChequeV2 } from '@/domain/vendorLedgerV2'
import { db } from '@/shared/lib/firebase'
import { formatDisplayDate, formatDisplayDateTime, money, today } from '@/app/uiHelpers'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'

export function ChequeViewDialog({ chequeId, onClose }: { chequeId: string; onClose: () => void }) {
  const [result, setResult] = useState<{ cheque: ChequeV2 & { exceptionReason?: string }; payee: string; actor: string } | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let active = true
    async function load() {
      const snapshot = await getDocFromServer(doc(db, 'chequesV2', chequeId))
      if (!snapshot.exists()) throw new Error('The cheque record is unavailable.')
      const cheque = { ...snapshot.data(), id: snapshot.id } as ChequeV2 & { exceptionReason?: string }
      const [payee, actor] = await Promise.all([
        cheque.vendorId ? getDocFromServer(doc(db, 'vendorsV2', cheque.vendorId)).then(s => s.exists() ? String(s.get('canonicalName') || cheque.vendorId) : 'Vendor record unavailable').catch(() => 'Vendor name unavailable · ' + cheque.vendorId)
          : cheque.purpose === 'expense' && cheque.sourceRecordId ? getDocFromServer(doc(db, 'cashouts', cheque.sourceRecordId)).then(s => s.exists() ? String(s.get('paidTo') || 'Not recorded') : 'Not recorded').catch(() => 'Source unavailable') : Promise.resolve('Not recorded'),
        cheque.createdByUserId ? getDocFromServer(doc(db, 'users', cheque.createdByUserId)).then(s => s.exists() ? String(s.get('name') || cheque.createdByUserId) : cheque.createdByUserId).catch(() => cheque.createdByUserId) : Promise.resolve('Not recorded')
      ])
      if (active) { setResult({ cheque, payee, actor }); setError('') }
    }
    void load().catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load cheque details.') })
    return () => { active = false }
  }, [chequeId, retry])
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const controls = () => [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') || [])]
    controls()[0]?.focus()
    function handle(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); onClose() }
      if (event.key !== 'Tab') return
      const nodes = controls(), first = nodes[0], last = nodes.at(-1)
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handle)
    return () => { document.removeEventListener('keydown', handle); previous?.focus() }
  }, [onClose])
  const cheque = result?.cheque
  const status = cheque ? ['issued', 'presented'].includes(cheque.status) ? cheque.date > today() ? 'Issued' : 'In progress' : cheque.status.charAt(0).toUpperCase() + cheque.status.slice(1) : ''
  const fields = cheque && result ? [
    ['Cheque number', cheque.chequeNumber], ['Cheque date', formatDisplayDate(cheque.date)],
    ['Amount', money(cheque.amountPaise / 100)], ['Status', status], ['Payee', result.payee],
    ['Payment', cheque.purpose === 'vendor-payment' ? 'Vendor payment' : 'Expense'],
    ['Recorded by', result.actor], ['Recorded at', cheque.createdAt ? formatDisplayDateTime(cheque.createdAt) : 'Not recorded'],
    ['Last updated', cheque.updatedAt ? formatDisplayDateTime(cheque.updatedAt) : 'Not recorded'],
    ['Record reference', 'chequesV2/' + cheque.id],
    ...(cheque.vendorId ? [['Vendor reference', cheque.vendorId]] : []),
    ...(cheque.exceptionReason ? [['Exception reason', cheque.exceptionReason]] : [])
  ] : []
  return createPortal(<div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/45 p-3" onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <Card ref={dialogRef} role="dialog" aria-modal="true" aria-label="Cheque details" className="max-h-[90dvh] w-full max-w-xl overflow-y-auto">
      <CardHeader className="flex-row items-center justify-between gap-3"><h2 className="font-semibold">Cheque details</h2><Button type="button" variant="ghost" size="icon" aria-label="Close cheque details" onClick={onClose}><X className="size-4" /></Button></CardHeader>
      <CardContent className="grid gap-4">
        {!result && !error ? <p role="status">Loading cheque details…</p> : null}
        {error ? <div role="alert"><p className="text-sm text-destructive">{error}</p><Button type="button" variant="outline" onClick={() => { setError(''); setResult(null); setRetry(value => value + 1); dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus() }}>Retry details</Button></div> : null}
        {fields.length ? <dl className="grid gap-3 sm:grid-cols-2">{fields.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm font-medium">{value}</dd></div>)}</dl> : null}
        {cheque && (cheque.trackingOnly || cheque.origin !== 'v2') ? <p className="text-xs text-muted-foreground">Legacy tracking only; this view does not post a payment.</p> : null}
        <div className="flex justify-end"><Button type="button" variant="outline" onClick={onClose}>Close</Button></div>
      </CardContent>
    </Card>
  </div>, document.body)
}
