import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { AppUser } from '@/domain/financeTypes'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { FieldLabel } from '@/shared/ui/field-label'
import { cashierAuthTime, hasHistoricalBills, initializeHandover, submitHandover, subscribeCashier, subscribeHandover } from '../data/cashierHandoverRepository'
import { countCash, denominations, expectedHandover, handoverDate, requiresLoginHandover, type CashierState, type HandoverLedger } from '../domain/cashierHandover'
import { HandoverContext } from '../hooks/useCashierHandover'

const money = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`

export function CashierHandoverBoundary({ currentUser, onSignOut, children }: { currentUser: AppUser; onSignOut: () => Promise<void>; children: (onLogout: () => void) => ReactNode }) {
  const [ledger, setLedger] = useState<HandoverLedger | null>(null)
  const [cashier, setCashier] = useState<CashierState | null>(null)
  const [authTime, setAuthTime] = useState<number | null>(null)
  const [historical, setHistorical] = useState<boolean | null>(null)
  const [loaded, setLoaded] = useState({ ledger: false, cashier: false })
  const [error, setError] = useState('')
  const [logout, setLogout] = useState(false)
  const [setup, setSetup] = useState(false)
  const [retry, setRetry] = useState(0)
  const [busy, setBusy] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const sessionKey = `pos-cashier-session:${currentUser.id}`
  const [sessionAuthTime, setSessionAuthTime] = useState<number | null>(() => {
    try { const value = sessionStorage.getItem(sessionKey); return value === null ? null : Number(value) } catch { return null }
  })
  function rememberSession(time: number) {
    try { sessionStorage.setItem(sessionKey, String(time)) } catch { /* Persisted cashier state still enforces fresh authentication. */ }
    setSessionAuthTime(time)
  }
  const ownerExempt = currentUser.role === 'owner'
  const participates = !ownerExempt && (historical === true || cashier !== null)
  const ready = loaded.ledger && loaded.cashier && authTime !== null && historical !== null
  const loginRequired = !ownerExempt && requiresLoginHandover(cashier, historical === true, authTime, sessionAuthTime)
  const open = setup || (!ownerExempt && (!ready || loginRequired || logout || !!error))
  useEffect(() => {
    let active = true
    const fail = (next: Error) => { if (active) setError(next.message) }
    const stopLedger = subscribeHandover((next) => { setLedger(next); setLoaded((previous) => ({ ...previous, ledger: true })) }, fail)
    const stopCashier = subscribeCashier(currentUser.id, (next) => { setCashier(next); setLoaded((previous) => ({ ...previous, cashier: true })) }, fail)
    void Promise.all([cashierAuthTime(), hasHistoricalBills(currentUser.id)]).then(([time, hasBills]) => {
      if (active) { setAuthTime(time); setHistorical(hasBills); if (!hasBills) rememberSession(time) }
    }).catch(fail)
    return () => { active = false; stopLedger(); stopCashier() }
  // The boundary is keyed by user; sessionKey remains fixed for this mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id, retry])

  async function signOut() {
    setBusy(true)
    try { await onSignOut() } catch (next) { setError(next instanceof Error ? next.message : 'Unable to sign out.') }
    finally { setBusy(false) }
  }
  return <HandoverContext.Provider value={{ ledger, requestSetup: () => setSetup(true) }}>
    {confirmation && !open ? <div role="status" className="fixed bottom-4 left-4 right-4 z-[90] mx-auto flex max-w-xl items-center gap-3 rounded border border-border bg-card p-3 text-sm shadow-lg"><p>{confirmation}</p><Button size="sm" variant="ghost" onClick={() => setConfirmation('')}>Dismiss</Button></div> : null}
    {children(() => { if (!ready || error) return; if (participates) setLogout(true); else void signOut() })}
    {open ? <HandoverDialog key={`${ready}:${!!ledger?.initialized}:${logout}`} currentUser={currentUser} ledger={ledger} ready={ready} kind={logout ? 'logout' : 'login'} setupOnly={setup && !loginRequired && !logout} error={error} busy={busy} onRetry={() => { setError(''); setLoaded({ ledger: false, cashier: false }); setHistorical(null); setAuthTime(null); setRetry((previous) => previous + 1) }} onExit={() => void signOut()} onInitialize={async () => {
      setBusy(true); setError('')
      try { await initializeHandover(currentUser); setSetup(false) }
      catch (next) { setError(next instanceof Error ? next.message : 'Drawer setup failed. Retry to resume.') }
      finally { setBusy(false) }
    }} onSubmit={async (counts, coins, upi, card, revision, date, note) => {
      setBusy(true); setError('')
      try {
        const record = await submitHandover(currentUser, logout ? 'logout' : 'login', counts, coins, upi, card, revision, date, note)
        if (!logout) rememberSession(record.authTime)
        setConfirmation(record.hasDiscrepancy ? `Handover saved. Differences: cash ${money(record.delta.cash)}, UPI ${money(record.delta.upi)}, card ${money(record.delta.card)}. Recorded for owner review; you may continue billing.` : 'Handover saved. All amounts match; you may continue billing.')
        setSetup(false)
        if (logout) await onSignOut()
      } catch (next) { setError(next instanceof Error ? next.message : 'Unable to save the count.') }
      finally { setBusy(false) }
    }} /> : null}
  </HandoverContext.Provider>
}

type CountSubmit = (counts: Record<string, number>, coins: number, upi: number, card: number, revision: number, date: string, note: string) => Promise<void>
function HandoverDialog({ currentUser, ledger, ready, kind, setupOnly, error, busy, onRetry, onExit, onInitialize, onSubmit }: { currentUser: AppUser; ledger: HandoverLedger | null; ready: boolean; kind: 'login' | 'logout'; setupOnly: boolean; error: string; busy: boolean; onRetry: () => void; onExit: () => void; onInitialize: () => Promise<void>; onSubmit: CountSubmit }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [counts, setCounts] = useState<Record<string, number>>(() => Object.fromEntries(denominations.map((value) => [String(value), 0])))
  const [coins, setCoins] = useState('')
  const [upi, setUpi] = useState('')
  const [card, setCard] = useState('')
  const [note, setNote] = useState('')
  const [validation, setValidation] = useState('')
  const [date, setDate] = useState(handoverDate)
  const [countDate, setCountDate] = useState(date)
  const [countRevision, setCountRevision] = useState(ledger?.revision)
  const stale = ledger?.revision !== countRevision || countDate !== date
  useEffect(() => { const timer = setInterval(() => setDate(handoverDate()), 15000); return () => clearInterval(timer) }, [])
  const expected = ledger?.initialized ? expectedHandover(ledger, date) : null
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close() }, [])
  function amount(value: string) {
    if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) throw new Error('Enter machine totals and loose coins explicitly, including 0 when there is none.')
    const paise = Math.round(Number(value) * 100)
    if (!Number.isSafeInteger(paise)) throw new Error('Amount is too large.')
    return paise
  }
  let cash = 0
  try { cash = countCash(counts, coins ? amount(coins) : 0) } catch { /* Submit shows the validation. */ }
  const readings: Record<'cash' | 'upi' | 'card', number | null> = { cash, upi: null, card: null }
  try { readings.upi = amount(upi) } catch { /* Show a dash until the reading is valid. */ }
  try { readings.card = amount(card) } catch { /* Show a dash until the reading is valid. */ }
  return <dialog ref={ref} aria-labelledby="handover-title" onCancel={(event) => event.preventDefault()} className="fixed inset-0 z-[200] m-auto max-h-[92dvh] w-[calc(100%_-_2rem)] max-w-2xl overflow-y-auto rounded-lg border border-border bg-card p-5 text-card-foreground shadow-xl backdrop:bg-slate-950/50 backdrop:backdrop-blur-sm">
    <h2 id="handover-title" className="text-lg font-semibold">{ledger?.initialized ? `${kind === 'logout' ? 'Closing' : 'Opening'} cashier handover` : 'Set up the shared cash drawer'}</h2>
    <p className="mt-1 text-sm text-muted-foreground">{currentUser.name} · {date} · Shared counter / POS</p>
    {error || validation ? <p role="alert" className="my-3 text-sm text-destructive">{error || validation}</p> : null}
    {!ready ? <p className="my-4 text-sm">Checking your billing participation and saved handover…</p> : !ledger?.initialized ? <div className="my-4 space-y-3 text-sm">
      <p>Opening cash: ₹0 at 00:00 IST on 4 October. Existing bills, refunds and stock will be preserved. Setup imports only the reconciliation baseline.</p>
      <p>Only the owner can finish setup. Keep billing paused while setup runs. An interrupted setup can be resumed.</p>
      {currentUser.role === 'owner' ? <Button disabled={busy} onClick={() => void onInitialize()}>{busy ? 'Setting up…' : ledger ? 'Resume drawer setup' : 'Initialize from existing bills'}</Button> : <p className="font-medium">Ask the owner to initialize the drawer in POS.</p>}
    </div> : setupOnly ? null : <form className="mt-4 space-y-4" onSubmit={(event) => {
      event.preventDefault(); setValidation('')
      try { if (stale) throw new Error('The totals changed. Restart the physical count.'); void onSubmit(counts, amount(coins), amount(upi), amount(card), countRevision!, countDate, note) }
      catch (next) { setValidation(next instanceof Error ? next.message : 'Invalid count.') }
    }}>
      <p className="text-sm text-muted-foreground">Pause billing while counting. Count all physical cash in the shared drawer. Enter today's cumulative UPI/card collections from the shared machine—not just your own bills.</p>
      {stale ? <div role="alert" className="space-y-2 text-sm text-destructive"><p>Billing, another handover, or the day changed while you were counting. Restart the count against the updated totals.</p><Button type="button" variant="outline" disabled={busy} onClick={() => { setCountRevision(ledger.revision); setCountDate(date); setCounts(Object.fromEntries(denominations.map((value) => [String(value), 0]))); setCoins(''); setUpi(''); setCard(''); setValidation('') }}>Restart count</Button></div> : null}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{denominations.map((value) => <FieldLabel key={value} label={`₹${value} × count`}><Input required disabled={busy} type="number" min="0" max="1000000" step="1" value={counts[String(value)]} onChange={(event) => setCounts((previous) => ({ ...previous, [String(value)]: Number(event.target.value) }))} /></FieldLabel>)}</div>
      <div className="grid gap-2 sm:grid-cols-3">
        <FieldLabel label="Other loose coins (₹)"><Input required inputMode="decimal" placeholder="0" value={coins} onChange={(event) => setCoins(event.target.value)} /></FieldLabel>
        <FieldLabel label="Today's machine UPI (₹)"><Input required inputMode="decimal" placeholder="Enter daily total" value={upi} onChange={(event) => setUpi(event.target.value)} /></FieldLabel>
        <FieldLabel label="Today's machine card (₹)"><Input required inputMode="decimal" placeholder="Enter daily total" value={card} onChange={(event) => setCard(event.target.value)} /></FieldLabel>
      </div>
      <p className="text-xs text-muted-foreground">Do not include coins twice. Loose coins means coins not already entered by denomination above.</p>
      <div className="overflow-x-auto rounded border border-border p-3 text-sm">
        <table className="w-full text-left"><thead><tr className="border-b border-border"><th className="pb-2">Payment</th><th className="pb-2">Expected</th><th className="pb-2">Actual</th><th className="pb-2">Difference</th></tr></thead><tbody>
        {expected && (['cash', 'upi', 'card'] as const).map((method) => <tr key={method} className="border-b border-border last:border-0"><th className="py-2 pr-2 capitalize">{method}</th><td className="pr-2 whitespace-nowrap">{money(expected[method])}</td><td className="pr-2 whitespace-nowrap">{readings[method] === null ? '—' : money(readings[method])}</td><td className="whitespace-nowrap">{readings[method] === null ? '—' : money(readings[method] - expected[method])}</td></tr>)}
        </tbody></table>
      </div>
      <FieldLabel label="Handover notes (optional)"><Input value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} placeholder="Explain any difference or cash removed outside POS" /></FieldLabel>
      <p className="text-xs text-muted-foreground">Differences are recorded for the owner in Action Centre. Submission lets you continue without waiting for approval. It does not alter bills or finance balances.</p>
      <Button type="submit" className="w-full" disabled={busy || stale || !!error}>{busy ? 'Saving…' : kind === 'logout' ? 'Save count and log out' : 'Save count and continue'}</Button>
    </form>}
    <div className="mt-3 flex gap-2">{error ? <Button disabled={busy} variant="outline" onClick={onRetry}>Retry connection</Button> : null}{kind === 'login' ? <Button disabled={busy} variant="ghost" onClick={onExit}>Sign out instead</Button> : null}</div>
  </dialog>
}
