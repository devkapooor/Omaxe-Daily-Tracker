import { useEffect, useRef, useState } from 'react'
import { Button } from '@/shared/ui/button'
import { FieldLabel } from '@/shared/ui/field-label'
import { Input } from '@/shared/ui/input'
import {
  buildCheckoutPayment, checkoutPaymentMethods,
  type CheckoutPaymentMode, type SplitPaymentAmounts,
} from '../domain/checkoutPayments'

const money = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

type Props = {
  totalPaise: number
  mode: CheckoutPaymentMode
  split: SplitPaymentAmounts
  cashReceived: string | null
  disabled: boolean
  onMethod: (mode: CheckoutPaymentMode) => void
  onSplit: (amounts: SplitPaymentAmounts) => void
  onCashReceived: (value: string) => void
}

export function CheckoutPaymentPanel({ totalPaise, mode, split, cashReceived, disabled, onMethod, onSplit, onCashReceived }: Props) {
  const [splitOpen, setSplitOpen] = useState(false)
  const cashDue = mode === 'cash' ? totalPaise : mode === 'split' ? Math.max(0, Math.round(Number(split.cash || 0) * 100)) : 0
  let cashChange = 0
  let error = ''
  try { cashChange = buildCheckoutPayment(totalPaise, mode, split, cashReceived ?? undefined).cashChangePaise }
  catch (next) { error = next instanceof Error ? next.message : 'Payment is invalid.' }

  return <div className="grid gap-3">
    <fieldset disabled={disabled} className="grid gap-2">
      <legend className="mb-2 text-sm font-bold">Payment method</legend>
      <div className="grid grid-cols-2 gap-2">
        {checkoutPaymentMethods.map((method) => <Button key={method.value} type="button" aria-pressed={mode === method.value} variant={mode === method.value ? 'default' : 'outline'} onClick={() => onMethod(method.value)}>{method.label}</Button>)}
        <Button className="col-span-2" type="button" aria-pressed={mode === 'split'} variant={mode === 'split' ? 'default' : 'outline'} onClick={() => setSplitOpen(true)}>Split payments</Button>
      </div>
    </fieldset>
    {mode === 'split' ? <div className="rounded-xl border p-3 text-sm">
      <div className="mb-2 flex items-center justify-between"><strong>Split payment</strong><Button size="sm" variant="ghost" disabled={disabled} onClick={() => setSplitOpen(true)}>Edit split</Button></div>
      {checkoutPaymentMethods.filter((method) => Number(split[method.value]) > 0).map((method) => <div className="flex justify-between" key={method.value}><span>{method.label}</span><strong>{money(Math.round(Number(split[method.value]) * 100))}</strong></div>)}
    </div> : <p className="text-sm text-muted-foreground">Full total paid by {checkoutPaymentMethods.find((method) => method.value === mode)?.label}.</p>}
    {cashDue > 0 ? <div className="grid gap-2 rounded-xl border p-3">
      <FieldLabel label="Cash received"><Input disabled={disabled} type="number" min="0" step="0.01" value={cashReceived ?? (cashDue / 100).toFixed(2)} onChange={(event) => onCashReceived(event.target.value)} /></FieldLabel>
      <div className="flex items-center justify-between text-sm"><span>Change to return</span><output aria-label="Change to return" aria-live="polite" className="text-lg font-black text-primary">{money(cashChange)}</output></div>
    </div> : null}
    {error && totalPaise > 0 ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    {splitOpen ? <SplitPaymentDialog totalPaise={totalPaise} initial={split} onCancel={() => setSplitOpen(false)} onApply={(amounts) => { onSplit(amounts); setSplitOpen(false) }} /> : null}
  </div>
}

function SplitPaymentDialog({ totalPaise, initial, onCancel, onApply }: { totalPaise: number; initial: SplitPaymentAmounts; onCancel: () => void; onApply: (amounts: SplitPaymentAmounts) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [amounts, setAmounts] = useState<SplitPaymentAmounts>({ ...initial })
  const allocated = checkoutPaymentMethods.reduce((sum, method) => sum + Math.round(Number(amounts[method.value] || 0) * 100), 0)
  let error = ''
  try { buildCheckoutPayment(totalPaise, 'split', amounts) }
  catch (next) { error = next instanceof Error ? next.message : 'Invalid split.' }
  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => { if (dialog?.open) dialog.close() }
  }, [])
  return <dialog ref={dialogRef} aria-labelledby="split-payment-title" onCancel={(event) => { event.preventDefault(); onCancel() }} className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-md rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-xl backdrop:bg-slate-950/60">
    <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); if (!error) onApply(amounts) }}>
      <div><h2 id="split-payment-title" className="text-lg font-black">Split payments</h2><p className="text-sm text-muted-foreground">Divide {money(totalPaise)} between two or more payment methods.</p></div>
      <div className="grid grid-cols-2 gap-3">{checkoutPaymentMethods.map((method, index) => <FieldLabel key={method.value} label={method.label}><Input autoFocus={index === 0} type="number" min="0" step="0.01" value={amounts[method.value]} onChange={(event) => setAmounts((current) => ({ ...current, [method.value]: event.target.value }))} placeholder="0.00" /></FieldLabel>)}</div>
      <div className="flex justify-between rounded-xl bg-secondary/50 p-3 text-sm"><span>{allocated > totalPaise ? 'Over allocated' : 'Remaining'}</span><strong aria-live="polite">{Number.isFinite(allocated) ? money(Math.abs(totalPaise - allocated)) : 'Invalid amount'}</strong></div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={Boolean(error)}>Apply split</Button></div>
    </form>
  </dialog>
}
