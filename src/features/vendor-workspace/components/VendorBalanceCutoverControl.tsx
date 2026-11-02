import { useState } from 'react'
import type { VendorLedgerV2Config } from '@/domain/appTypes'
import type { AppUser } from '@/domain/financeTypes'
import { postFinanceOperation } from '@/features/register/data/financeRepository'
import { today } from '@/app/uiHelpers'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'

type Result = {
  vendorCount: number
  invoiceCount: number
  settlementCount: number
  payableBeforePaise: number
  creditBeforePaise: number
  pendingChequeCount: number
  pendingReturnCount: number
  pendingCorrectionCount: number
}

export function VendorBalanceCutoverControl({ user, config }: { user: AppUser; config: VendorLedgerV2Config }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')
  if (user.role !== 'owner' || config.balanceCutoverId) return null

  async function reset() {
    const cutoverDate = today()
    const confirmation = window.prompt(`This one-time action sets all vendor payables and credits to zero for ${cutoverDate}. Type exactly: RESET VENDOR BALANCES ${cutoverDate}`)
    if (confirmation !== `RESET VENDOR BALANCES ${cutoverDate}`) return
    if (!window.confirm('Proceed with the one-time vendor balance reset? Historical invoices and stock records will be retained.')) return
    setBusy(true); setError(''); setResult(null)
    try {
      const data = await postFinanceOperation<Result>('vendor-balance-cutover', {
        cutoverId: `vendor-reset-${cutoverDate.replaceAll('-', '')}`,
        cutoverDate,
        reason: 'Owner reset vendor payables to zero; new balances will be entered as opening amounts on the first GRN or payment.',
        confirmation,
      })
      setResult(data)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Vendor balances could not be reset. No success was confirmed.')
    } finally { setBusy(false) }
  }

  return <Card><CardHeader><h2 className="font-semibold">Start vendor balances afresh</h2></CardHeader><CardContent className="space-y-3 text-sm"><p>This one-time reset sets current vendor payables and credits to ₹0. Old invoices, payments, stock, returns and issued cheque history are retained. Each vendor’s new opening payable is entered by the owner with its first new GRN or payment.</p><p className="text-muted-foreground">Old GRN reversals and payment corrections are closed off from the new payable period. Pending old payment corrections are closed with an audit note.</p>{error ? <p role="alert" className="text-destructive">{error}</p> : null}{result ? <div role="status" className="rounded border p-3"><strong>Reset recorded.</strong><p>{result.vendorCount} vendors, {result.invoiceCount} invoices and {result.settlementCount} payments retained as history.</p><p>Before reset: V2 payable ₹{(result.payableBeforePaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}; credits ₹{(result.creditBeforePaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}.</p><p>{result.pendingChequeCount} pending cheques, {result.pendingReturnCount} pending returns and {result.pendingCorrectionCount} pending payment corrections retained or closed with history.</p></div> : null}<Button variant="destructive" disabled={busy} onClick={() => void reset()}>{busy ? 'Resetting…' : 'Reset vendor balances to zero'}</Button></CardContent></Card>
}
