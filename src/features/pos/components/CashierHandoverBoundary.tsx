import { pendingFinanceOperation } from '@/features/register/data/financeRepository'
import { loadPendingCheckout } from '../data/checkoutRecovery'
import { pendingRefund } from '../data/refundRepository'
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react'
import type { AppUser } from '@/domain/financeTypes'
import { serverNowMs, synchronizeServerClock } from '@/shared/lib/serverClock'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { FieldLabel } from '@/shared/ui/field-label'
import { DrawerCountInProgressError, cashierAuthTime, initializeHandover, joinCounter, releaseCount, reserveCount, submitHandover, subscribeCashier, subscribeHandover } from '../data/cashierHandoverRepository'
import { COUNT_RESERVATION_MS, activeCountReservation, countCash, denominations, expectedHandover, handoverDate, isCounterOpen, type CashierState, type CountReservation, type HandoverLedger } from '../domain/cashierHandover'
import { HandoverContext } from '../hooks/useCashierHandover'
import { postFinanceOperation } from '@/features/register/data/financeRepository'

const money = (paise: number) => `\u20b9${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
function trustedNow() { try { return serverNowMs() } catch { return null } }

export function CashierHandoverBoundary({ currentUser, onSignOut, children }: { currentUser: AppUser; onSignOut: () => Promise<void>; children: (onLogout: () => void) => ReactNode }) {
  const [ledger, setLedger] = useState<HandoverLedger | null>(null)
  const [cashier, setCashier] = useState<CashierState | null>(null)
  const [authTime, setAuthTime] = useState<number | null>(null)
  const [loaded, setLoaded] = useState({ ledger: false, cashier: false })
  const [error, setError] = useState('')
  const [joinError, setJoinError] = useState('')
  const [logout, setLogout] = useState(false)
  const [logoutSaved, setLogoutSaved] = useState(false)
  const [logoutRequested, setLogoutRequested] = useState(false)
  const [logoutIssue, setLogoutIssue] = useState('')
  const [setup, setSetup] = useState(false)
  const [retry, setRetry] = useState(0)
  const [busy, setBusy] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [reservationId, setReservationId] = useState('')
  const [now, setNow] = useState(trustedNow)
  const joinPending = useRef<Promise<void> | null>(null)
  const actionPending = useRef(false)
  const owner = currentUser.role === 'owner'
  const ready = loaded.ledger && loaded.cashier && authTime !== null && now !== null
  const date = now === null ? '' : handoverDate(new Date(now).toISOString())
  const counterOpen = ready && isCounterOpen(ledger, date)
  const reservation = now === null ? null : activeCountReservation(ledger, now)
  const ownReservation = reservation?.uid === currentUser.id && reservation.authTime === authTime && reservation.date === date ? reservation : null
  const joined = counterOpen && cashier?.authTime === authTime && !cashier.closed && cashier.joinedCounterId === ledger?.counterSession?.openingReconciliationId
  const open = setup || logout || Boolean(ownReservation && ownReservation.kind !== 'cashout') || (!owner && (!ready || Boolean(error || joinError)))
  const kind = logout || ownReservation?.kind === 'logout' ? 'logout' : 'login'

  useEffect(() => { const timer = setInterval(() => setNow(trustedNow()), 1000); return () => clearInterval(timer) }, [])
  useEffect(() => {
    let active = true
    const fail = (next: Error) => { if (active) setError(next.message) }
    const stopLedger = subscribeHandover((next) => { setLedger(next); setLoaded((value) => ({ ...value, ledger: true })) }, fail)
    const stopCashier = subscribeCashier(currentUser.id, (next) => { setCashier(next); setLoaded((value) => ({ ...value, cashier: true })) }, fail)
    void cashierAuthTime().then((time) => { if (active) setAuthTime(time) }).catch(fail)
    return () => { active = false; stopLedger(); stopCashier() }
  }, [currentUser.id, retry])

  const openingId = ledger?.counterSession?.openingReconciliationId
  const reservedId = reservation?.id
  useEffect(() => {
    if (!ready || !counterOpen || joined || reservedId || logout || setup || error || joinError) return
    let active = true
    if (!joinPending.current) joinPending.current = joinCounter(currentUser).finally(() => { joinPending.current = null })
    void joinPending.current.then(() => { if (active) setJoinError('') }, (cause: unknown) => { if (active && !(cause instanceof DrawerCountInProgressError)) setJoinError(cause instanceof Error ? cause.message : 'Unable to join the shared counter.') })
    return () => { active = false }
  }, [ready, counterOpen, joined, reservedId, logout, setup, error, joinError, openingId, authTime, currentUser, retry])

  async function signOut() {
    if (actionPending.current) return
    actionPending.current = true; setBusy(true)
    try { const id = ownReservation?.id ?? reservationId; if (id) await releaseCount(currentUser, id); await onSignOut() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to sign out.') }
    finally { actionPending.current = false; setBusy(false) }
  }
  async function startCount(nextKind: 'login' | 'logout') {
    if (actionPending.current) return
    actionPending.current = true; setBusy(true); setError(''); setJoinError('')
    try {
      if (ownReservation && ownReservation.kind !== nextKind) await releaseCount(currentUser, ownReservation.id)
      const next = await reserveCount(currentUser, nextKind); setReservationId(next.id)
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to reserve the drawer for counting.') }
    finally { actionPending.current = false; setBusy(false) }
  }
  async function cancelCount(id = ownReservation?.id ?? reservationId) {
    if (actionPending.current) return
    actionPending.current = true; setBusy(true)
    try {
      if (id && reservation?.kind === 'cashout') {
        await postFinanceOperation('cashout-count-cancel', { quoteId: id })
      } else if (id) await releaseCount(currentUser, id)
      setReservationId(''); setLogout(false); setSetup(false); setError(''); setJoinError('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to cancel this count.') }
    finally { actionPending.current = false; setBusy(false) }
  }
  function retryConnection() {
    setLogoutIssue(''); setError(''); setJoinError(''); setLoaded({ ledger: false, cashier: false }); setAuthTime(null); setRetry((value) => value + 1)
    void synchronizeServerClock().then(() => setNow(trustedNow()), (cause: unknown) => setError(cause instanceof Error ? cause.message : 'Unable to synchronize server time.'))
  }
  const completeLogoutRequest = useEffectEvent(() => {
    if (!ready || busy || error || joinError || logoutIssue || actionPending.current) return
    if (reservation?.kind === 'cashout') {
      setLogoutIssue('Finish or cancel the Cashout count before signing out.')
      return
    }
    try {
      const checkout = loadPendingCheckout(currentUser.id)
      if (checkout.pending || checkout.error || pendingRefund(currentUser.id) || pendingFinanceOperation(currentUser.id)) {
        setLogoutIssue('Recover the pending financial operation before signing out. After recovery reloads the workspace, choose Log out again.')
        return
      }
    } catch (cause) {
      setLogoutIssue(cause instanceof Error ? cause.message : 'Recovery state is unavailable. Retry before signing out.')
      return
    }
    setLogoutRequested(false)
    if (cashier && !cashier.closed && cashier.authTime === authTime && (!owner || cashier.needsLogoutCheck)) { setLogout(true); setLogoutSaved(false); void startCount('logout') }
    else void signOut()
  })
  useEffect(() => {
    if (!logoutRequested || !ready || busy || error || joinError || logoutIssue) return
    const queued = window.setTimeout(() => completeLogoutRequest(), 0)
    return () => window.clearTimeout(queued)
  }, [logoutRequested, ready, busy, error, joinError, logoutIssue, cashier, authTime, reservation])
  function requestLogout() {
    // A refresh can expose navigation before the counter listeners are ready.
    // Preserve the click and show progress instead of silently ignoring it.
    setLogoutIssue(''); setLogoutRequested(true)
  }
  function exitRequested() {
    if (logoutSaved) void signOut()
    else requestLogout()
  }

  return <HandoverContext.Provider value={{ ledger, requestSetup: () => setSetup(true), counterOpen, joined, reservation }}>
    {logoutRequested && !open ? <div role="status" className="fixed bottom-20 left-4 right-4 z-[100] mx-auto flex max-w-xl flex-wrap items-center gap-3 rounded border border-border bg-card p-3 text-sm shadow-lg">{logoutIssue ? <p role="alert" className="text-destructive">{logoutIssue}</p> : <p>{busy ? 'Waiting for the current operation before logging out…' : error || joinError ? 'Logout is waiting. Resolve the recovery or connection message, then retry.' : 'Log out requested. Checking the counter and your session…'}</p>}<Button size="sm" variant="outline" disabled={busy} onClick={retryConnection}>Retry logout check</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => setLogoutRequested(false)}>Continue working</Button></div> : null}
    {confirmation && !open ? <div role="status" className="fixed bottom-4 left-4 right-4 z-[90] mx-auto flex max-w-xl items-center gap-3 rounded border border-border bg-card p-3 text-sm shadow-lg"><p>{confirmation}</p><Button size="sm" variant="ghost" onClick={() => setConfirmation('')}>Dismiss</Button></div> : null}
    {reservation && !open && !(ownReservation?.kind === 'cashout') ? <div role="status" className="fixed bottom-4 left-4 right-4 z-[95] mx-auto flex max-w-xl items-center gap-3 rounded border border-amber-300 bg-card p-3 text-sm shadow-lg"><p>{reservation.name} Is Counting The Shared Drawer. Billing, Refunds And Drawer Payments Are Paused.</p>{owner ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void cancelCount(reservation.id)}>Cancel Count</Button> : null}</div> : null}
    {!open && (error || joinError) ? <div role="alert" className="fixed bottom-4 left-4 right-4 z-[100] mx-auto flex max-w-xl items-center gap-3 rounded border border-destructive bg-card p-3 text-sm shadow-lg"><p>{error || joinError}</p><Button size="sm" variant="outline" onClick={retryConnection}>Retry Connection</Button></div> : null}
    {/* App's render prop passes the handler to logout buttons; it never invokes it during render. */}
    {children(requestLogout)}
    {open ? <HandoverDialog key={`${ready}:${!!ledger?.initialized}:${kind}:${ownReservation?.id ?? 'waiting'}:${logoutSaved}`} currentUser={currentUser} ledger={ledger} ready={ready} date={date} kind={kind} setupOnly={setup && counterOpen && !logout} error={error || joinError} busy={busy} reservation={ownReservation} otherReservation={reservation && !ownReservation ? reservation : null} counterOpen={counterOpen} logoutSaved={logoutSaved} onReserve={() => startCount(kind)} onCancel={() => cancelCount()} onOwnerRelease={(id) => cancelCount(id)} onRetry={retryConnection} onExit={exitRequested} onInitialize={async () => {
      if (actionPending.current) return
      actionPending.current = true; setBusy(true); setError('')
      try { await initializeHandover(currentUser) }
      catch (cause) { setError(cause instanceof Error ? cause.message : 'Drawer setup failed. Retry to resume.') }
      finally { actionPending.current = false; setBusy(false) }
    }} onSubmit={async (counts, coins, upi, card, revision, countDate, note) => {
      if (actionPending.current || !ownReservation) return
      actionPending.current = true; setBusy(true); setError('')
      try {
        const record = await submitHandover(currentUser, kind, counts, coins, upi, card, revision, countDate, note, ownReservation.id)
        setConfirmation(record.hasDiscrepancy ? `Count Saved. Differences: Cash ${money(record.delta.cash)}, UPI ${money(record.delta.upi)}, Card ${money(record.delta.card)}. Recorded For Owner Review.` : 'Count Saved. All Amounts Match.')
        setReservationId(''); setSetup(false)
        if (kind === 'logout') { setLogout(true); setLogoutSaved(true); await onSignOut() }
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save the count.') }
      finally { actionPending.current = false; setBusy(false) }
    }} /> : null}
  </HandoverContext.Provider>
}

type CountSubmit = (counts: Record<string, number>, coins: number, upi: number, card: number, revision: number, date: string, note: string) => Promise<void>
function HandoverDialog({ currentUser, ledger, ready, date, kind, setupOnly, error, busy, reservation, otherReservation, counterOpen, logoutSaved, onReserve, onCancel, onOwnerRelease, onRetry, onExit, onInitialize, onSubmit }: {
  currentUser: AppUser; ledger: HandoverLedger | null; ready: boolean; kind: 'login' | 'logout'; setupOnly: boolean; error: string; busy: boolean
  date: string
  reservation: CountReservation | null; otherReservation: CountReservation | null; counterOpen: boolean; logoutSaved: boolean
  onReserve: () => Promise<void>; onCancel: () => Promise<void>; onOwnerRelease: (id: string) => Promise<void>
  onRetry: () => void; onExit: () => void; onInitialize: () => Promise<void>; onSubmit: CountSubmit
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [counts, setCounts] = useState<Record<string, number>>(() => Object.fromEntries(denominations.map((value) => [String(value), 0])))
  const [coins, setCoins] = useState('')
  const [upi, setUpi] = useState('')
  const [card, setCard] = useState('')
  const [note, setNote] = useState('')
  const [validation, setValidation] = useState('')
  const [countDate] = useState(reservation?.date ?? date)
  const [countRevision] = useState(reservation?.revision)
  const stale = ledger?.revision !== countRevision || countDate !== date
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
    <h2 id="handover-title" className="text-lg font-semibold">{ledger?.initialized ? kind === 'logout' ? 'Logout Count' : counterOpen ? 'Joining Shared Counter' : 'Open Shared Counter' : 'Set Up Shared Cash Drawer'}</h2>
    <p className="mt-1 text-sm text-muted-foreground">{currentUser.name} · {date} · Shared counter / POS</p>
    {error || validation ? <p role="alert" className="my-3 text-sm text-destructive">{error || validation}</p> : null}
    {!ready ? <p className="my-4 text-sm">Checking The Saved Counter And Your Authenticated Session...</p> : logoutSaved ? <div className="my-4 space-y-3 text-sm"><p>Your Logout Count Is Saved. Retry Sign Out To Finish Without Counting Again.</p><Button disabled={busy} onClick={onExit}>Retry Sign Out</Button></div> : !ledger?.initialized ? <div className="my-4 space-y-3 text-sm">
      <p>Opening cash: ₹0 at 00:00 IST on 4 October. Existing bills, refunds and stock will be preserved. Setup imports only the reconciliation baseline.</p>
      <p>Only the owner can finish setup. Keep billing paused while setup runs. An interrupted setup can be resumed.</p>
      {currentUser.role === 'owner' ? <Button disabled={busy} onClick={() => void onInitialize()}>{busy ? 'Setting up…' : ledger ? 'Resume drawer setup' : 'Initialize from existing bills'}</Button> : <p className="font-medium">Ask the owner to initialize the drawer in POS.</p>}
    </div> : otherReservation ? <div className="my-4 space-y-3 text-sm"><p>{otherReservation.name} Is Counting The Shared Drawer. Wait Until The Count Is Saved Or Cancelled.</p><p>The Reservation Expires Five Minutes After Its Server-Recorded Start.</p>{currentUser.role === 'owner' || otherReservation.uid === currentUser.id ? <Button disabled={busy} variant="outline" onClick={() => void onOwnerRelease(otherReservation.id)}>Cancel Reserved Count</Button> : null}</div> : setupOnly ? <div className="my-4 space-y-3 text-sm"><p>The Shared Counter Is Already Open. No Additional Count Is Required.</p><Button disabled={busy} onClick={() => void onCancel()}>Continue To Billing</Button></div> : !reservation ? counterOpen && kind === 'login' ? <p role="status" className="my-4 text-sm">Joining The Open Counter. No Additional Count Is Required.</p> : <div className="my-4 space-y-3 text-sm"><p>{kind === 'logout' ? 'Save A Shared Drawer Count Before Signing Out. The Counter Will Stay Open For Other Staff.' : 'Complete One Opening Count For Both Billing Computers.'}</p><Button disabled={busy} onClick={() => void onReserve()}>{busy ? 'Reserving Drawer...' : kind === 'logout' ? 'Start Logout Count' : 'Start Opening Count'}</Button></div> : <form className="mt-4 space-y-4" onSubmit={(event) => {
      event.preventDefault(); setValidation('')
      try { if (stale) throw new Error('The totals changed. Restart the physical count.'); void onSubmit(counts, amount(coins), amount(upi), amount(card), countRevision!, countDate, note) }
      catch (next) { setValidation(next instanceof Error ? next.message : 'Invalid count.') }
    }}>
      <p className="text-sm text-muted-foreground">Billing, Refunds And Cashout Are Paused On Both Computers While You Count. Count All Physical Cash In The Shared Drawer. Enter Today's Cumulative UPI/Card Collections From The Shared Machine.</p>
      <p className="text-xs text-muted-foreground">Count Reservation Ends At {new Date(reservation.startedAt.toMillis() + COUNT_RESERVATION_MS).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}.</p>
      {stale ? <div role="alert" className="space-y-2 text-sm text-destructive"><p>The Counter Or Day Changed. Cancel And Start A Fresh Count Before Saving.</p><Button type="button" variant="outline" disabled={busy} onClick={() => void onCancel()}>Cancel Count</Button></div> : null}
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
    <div className="mt-3 flex flex-wrap gap-2">{error ? <Button disabled={busy} variant="outline" onClick={onRetry}>Retry Connection</Button> : null}{!logoutSaved && (kind === 'logout' || reservation || setupOnly) ? <Button disabled={busy} variant="outline" onClick={() => void onCancel()}>{kind === 'logout' ? 'Cancel Logout' : 'Cancel Count'}</Button> : null}{kind === 'login' ? <Button disabled={busy} variant="ghost" onClick={onExit}>Sign Out Instead</Button> : null}</div>
  </dialog>
}
