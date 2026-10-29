import { useRef, useState } from 'react'
import type { VendorAccountStateV2, VendorV2 } from '@/domain/vendorLedgerV2'
import { correctVendorOpening } from '@/store/vendorLedgerV2Repository'
import { stockMoney } from '@/features/stock/domain/currentStock'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { FieldLabel } from '@/shared/ui/field-label'
import { Input } from '@/shared/ui/input'
import { Textarea } from '@/shared/ui/textarea'
export function VendorOpeningCorrection({ vendor, account, onClose, onSaved }: { vendor: VendorV2; account?: VendorAccountStateV2; onClose: () => void; onSaved: () => void }) {
  const [value, setValue] = useState((vendor.openingBalancePaise / 100).toFixed(2)), [reason, setReason] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const operationId = useRef(crypto.randomUUID()), inFlight = useRef(false)
  const valid = /^\d+(?:\.\d{1,2})?$/.test(value.trim()) && Number.isSafeInteger(Math.round(Number(value) * 100))
  const amount = valid ? Math.round(Number(value) * 100) : 0, difference = amount - vendor.openingBalancePaise
  return <div className="fixed inset-0 z-[170] flex items-center justify-center bg-black/60 p-3" role="dialog" aria-modal="true" aria-label="Correct opening balance"><Card className="max-h-[90dvh] w-full max-w-lg overflow-y-auto"><CardHeader><h2 className="font-semibold">Correct opening balance · {vendor.canonicalName}</h2></CardHeader><CardContent><form className="grid gap-3" onSubmit={event => { event.preventDefault(); if (!valid || !difference || !reason.trim() || inFlight.current) return; inFlight.current = true; setBusy(true); setError(''); void correctVendorOpening({ operationId: operationId.current, vendorId: vendor.id, expectedVendorRevision: vendor.revision, expectedAccountRevision: account?.revision ?? 0, openingBalancePaise: amount, reason: reason.trim() }).then(() => { onSaved(); onClose() }).catch(cause => setError(cause instanceof Error ? cause.message : 'Opening correction failed.')).finally(() => { inFlight.current = false; setBusy(false) }) }}>
    <p className="text-sm">Previous opening: <strong>{stockMoney(vendor.openingBalancePaise)}</strong> · Current payable: <strong>{stockMoney(account?.outstandingPaise ?? 0)}</strong></p><FieldLabel label="Correct opening balance"><Input autoFocus inputMode="decimal" value={value} disabled={busy} onChange={event => setValue(event.target.value)} /></FieldLabel><p className="text-sm">Adjustment to post: <strong>{valid ? stockMoney(difference) : 'Enter a valid amount'}</strong></p><FieldLabel label="Reason for opening correction"><Textarea required value={reason} disabled={busy} onChange={event => setReason(event.target.value)} /></FieldLabel><p className="text-xs text-muted-foreground">Only the difference is posted. Original opening evidence, invoices and payments stay intact. A reduction beyond the outstanding creates vendor credit.</p>{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}<div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={busy || !valid || !difference || !reason.trim()}>Post audited opening correction</Button></div>
  </form></CardContent></Card></div>
}
