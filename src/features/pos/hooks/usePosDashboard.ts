import { useEffect, useState } from 'react'
import { subscribePosBillStates, subscribePosDashboardBills, subscribePosDashboardRefunds } from '../data/posRepository'
import type { PosBill, PosBillState, PosRefundEvent } from '../domain/types'

type Snapshot = { key: string; bills: PosBill[]; states: PosBillState[]; refunds: PosRefundEvent[]; billsReady: boolean; statesReady: boolean; refundsReady: boolean; error: string | null }
const empty = (key: string): Snapshot => ({ key, bills: [], states: [], refunds: [], billsReady: false, statesReady: false, refundsReady: false, error: null })

export function usePosDashboard(from: string, to: string) {
  const key = `${from}/${to}`
  const [snapshot, setSnapshot] = useState<Snapshot>(() => empty(key))
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to
  useEffect(() => {
    if (!valid) return
    function update(values: Partial<Snapshot>) {
      setSnapshot((current) => ({ ...(current.key === key ? current : empty(key)), ...values }))
    }
    const onError = (error: Error) => update({ error: error.message })
    const unsubscribes = [
      subscribePosDashboardBills(from, to, (bills) => update({ bills, billsReady: true }), onError),
      subscribePosBillStates((states) => update({ states, statesReady: true }), onError),
      subscribePosDashboardRefunds(from, to, (refunds) => update({ refunds, refundsReady: true }), onError),
    ]
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe())
  }, [from, to, key, valid])
  const current = snapshot.key === key ? snapshot : empty(key)
  return {
    ...current,
    error: valid ? current.error : 'Choose a valid date range with the start date on or before the end date.',
    loading: valid && !current.error && !(current.billsReady && current.statesReady && current.refundsReady),
  }
}
