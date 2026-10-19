import { useEffect, useState, type ReactNode } from 'react'
import type { AppUser } from '@/domain/financeTypes'
import { Button } from '@/shared/ui/button'
import { StatusPanel } from '@/shared/ui/status-panel'
import { pendingRefund, recoverRefund, refundInFlight } from '../data/refundRepository'

export function RefundOperationBoundary({ actor, children }: { actor: AppUser; children: ReactNode }) {
  const [state, setState] = useState({ pending: false, reference: '', inFlight: false, error: '' })
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  useEffect(() => {
    function read() {
      try { const pending = pendingRefund(actor.id); setState({ pending: !!pending, reference: String(pending?.input.operationId ?? ''), inFlight: refundInFlight(actor.id), error: '' }) }
      catch (error) { setState({ pending: false, reference: '', inFlight: false, error: error instanceof Error ? error.message : 'Refund recovery storage is unavailable.' }) }
    }
    read(); window.addEventListener('refund-operation-change', read)
    return () => window.removeEventListener('refund-operation-change', read)
  }, [actor.id])
  async function recover() {
    setBusy(true); setMessage('')
    try { const result = await recoverRefund(actor); setMessage(`Original refund operation recovered: ${result.id}. It was not posted again.`) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to recover. Preserve this tab and retry.') }
    finally { setBusy(false) }
  }
  return <div className="flex min-h-0 flex-1 flex-col gap-3">
    {state.inFlight ? <StatusPanel>Confirming refund operation…</StatusPanel> : state.pending || state.error ? <StatusPanel variant="destructive"><div role="alert" className="grid gap-2"><strong>Refund operation needs recovery</strong><p>{state.error || 'The previous result is not confirmed. Recover the same operation before posting another change.'}</p>{state.pending ? <><span className="break-all text-xs">Reference: {state.reference}</span><Button autoFocus disabled={busy} onClick={() => void recover()}>{busy ? 'Recovering…' : 'Recover refund operation'}</Button></> : null}</div></StatusPanel> : null}
    {message ? <p role="status" className="rounded border p-3 text-sm">{message}</p> : null}
    <div inert={state.inFlight || state.pending || !!state.error} className={`flex min-h-0 flex-1 flex-col ${state.pending || state.error ? 'opacity-50' : ''}`}>{children}</div>
  </div>
}
