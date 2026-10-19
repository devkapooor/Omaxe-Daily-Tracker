import { useEffect, useState, type ReactNode } from 'react'
import type { AppUser } from '@/domain/financeTypes'
import { Button } from '@/shared/ui/button'
import { StatusPanel } from '@/shared/ui/status-panel'
import { pendingStockOperation, recoverStockOperation, stockOperationInFlight, type StockPendingOperation } from '../data/stockPostingRepository'

export function StockOperationBoundary({ actor, children, fill = false }: { actor: AppUser; children: ReactNode; fill?: boolean }) {
  const [state, setState] = useState<{ pending: StockPendingOperation | null; error: string; inFlight: boolean }>({ pending: null, error: '', inFlight: false })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    function read() {
      try { setState({ pending: pendingStockOperation(actor.id), error: '', inFlight: stockOperationInFlight(actor.id) }) }
      catch (error) { setState({ pending: null, error: error instanceof Error ? error.message : 'Stock recovery storage is unavailable.', inFlight: false }) }
    }
    read(); window.addEventListener('stock-operation-change', read)
    return () => window.removeEventListener('stock-operation-change', read)
  }, [actor.id])
  async function recover() {
    setBusy(true); setMessage('')
    try {
      const recovered = await recoverStockOperation(actor)
      const result = recovered.result as { id?: string; purchaseId?: string } | undefined
      setMessage(`Original stock operation recovered${result?.id ? `: ${result.id}` : result?.purchaseId ? `: ${result.purchaseId}` : ''}. Review its source details before continuing.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to recover. Keep this tab and retry.') }
    finally { setBusy(false) }
  }
  return <div className={fill ? 'flex min-h-0 flex-1 flex-col gap-3' : 'grid gap-3'}>
    {state.inFlight ? <StatusPanel>Confirming stock operation…</StatusPanel> : state.pending || state.error ? <StatusPanel variant="destructive"><div role="alert" className="grid gap-2"><strong>Stock operation needs recovery</strong><p>{state.error || 'The previous result is not yet confirmed. Recover the same operation before making another change.'}</p>{state.pending ? <><span className="break-all text-xs">Reference: {String(state.pending.input.operationId)}</span><Button autoFocus disabled={busy} onClick={() => void recover()}>{busy ? 'Recovering…' : 'Recover stock operation'}</Button></> : null}</div></StatusPanel> : null}
    {message ? <p role="status" className="rounded border p-3 text-sm">{message}</p> : null}
    <div inert={state.inFlight || !!state.pending || !!state.error} className={`${fill ? 'flex min-h-0 flex-1 flex-col' : ''} ${state.pending || state.error ? 'opacity-50' : ''}`}>{children}</div>
  </div>
}
