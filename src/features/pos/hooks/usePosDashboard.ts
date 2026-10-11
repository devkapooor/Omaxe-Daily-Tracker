import { useEffect, useState } from 'react'
import { subscribeDashboardStates, subscribeDashboardBills, subscribeDashboardRefunds } from '../data/posDashboardRepository'
import type { PosBill, PosBillState, PosRefundEvent } from '../domain/types'
type Snapshot = { key: string; bills: PosBill[]; refunds: PosRefundEvent[]; billsReady: boolean; refundsReady: boolean; error: string | null }
const empty = (key: string): Snapshot => ({ key, bills: [], refunds: [], billsReady: false, refundsReady: false, error: null })
export function usePosDashboard(from: string, to: string) {
  const [attempt, setAttempt] = useState(0)
  const key = `${from}/${to}/${attempt}`
  const [snapshot, setSnapshot] = useState<Snapshot>(() => empty(key))
  const [stateSnapshot, setStateSnapshot] = useState<{ key: string; states: PosBillState[]; ready: boolean; error: string | null }>({ key: '', states: [], ready: false, error: null })
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to
  useEffect(() => {
    if (!valid) return
    let active = true
    function update(values: Partial<Snapshot>) { if (active) setSnapshot((current) => ({ ...(current.key === key ? current : empty(key)), ...values })) }
    const onError = (error: Error) => update({ error: error.message })
    const stops = [
      subscribeDashboardBills(from, to, (bills) => update({ bills, billsReady: true }), onError, () => update({ billsReady: false })),
      subscribeDashboardRefunds(from, to, (refunds) => update({ refunds, refundsReady: true }), onError, () => update({ refundsReady: false })),
    ]
    return () => { active = false; stops.forEach((stop) => stop()) }
  }, [from, to, key, valid])
  const current = snapshot.key === key ? snapshot : empty(key)
  const ids = current.bills.map((bill) => bill.id).sort()
  const statesKey = JSON.stringify([key, current.billsReady, ids])
  useEffect(() => {
    if (!valid || !current.billsReady) return
    let active = true
    const stop = subscribeDashboardStates(JSON.parse(statesKey)[2] as string[], (states) => { if (active) setStateSnapshot({ key: statesKey, states, ready: true, error: null }) }, (error) => { if (active) setStateSnapshot({ key: statesKey, states: [], ready: false, error: error.message }) })
    return () => { active = false; stop() }
  }, [statesKey, valid, current.billsReady])
  const states = stateSnapshot.key === statesKey ? stateSnapshot : { states: [], ready: false, error: null }
  return { ...current, retry: () => setAttempt((value) => value + 1), states: states.states, error: valid ? current.error ?? states.error : 'Choose a valid date range.', loading: valid && !current.error && !states.error && !(current.billsReady && states.ready && current.refundsReady) }
}