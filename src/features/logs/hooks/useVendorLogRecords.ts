import { useEffect, useRef, useState } from 'react'
import { loadVendorLogPage, type VendorLogKind, type VendorLogPage } from '../data/vendorLogQueries'

type Result = VendorLogPage & { key: string; loadingMore: boolean; error: string }
export function useVendorLogRecords(kind: VendorLogKind | null, start: string, end: string) {
  const [refresh, setRefresh] = useState(0)
  const key = JSON.stringify([kind, start, end, refresh])
  const [result, setResult] = useState<Result | null>(null)
  const generation = useRef(0), running = useRef<Promise<void> | null>(null)
  useEffect(() => {
    generation.current += 1
    if (!kind || !start || !end) return
    let active = true
    void loadVendorLogPage(kind, start, end).then(page => {
      if (active) setResult({ ...page, key, error: '', loadingMore: false })
    }).catch((cause: unknown) => {
      if (active) setResult({ key, rows: [], cursor: null, more: false, loadingMore: false, error: cause instanceof Error ? cause.message : 'Unable to load vendor logs.' })
    })
    return () => { active = false }
  }, [kind, start, end, key])
  const current = result?.key === key
  function loadMore() {
    if (!kind || !current || !result?.more || !result.cursor || running.current) return
    const epoch = generation.current
    setResult(previous => previous?.key === key ? { ...previous, loadingMore: true, error: '' } : previous)
    const request = loadVendorLogPage(kind, start, end, result.cursor).then(page => {
      if (generation.current !== epoch) return
      setResult(previous => previous?.key === key ? { ...previous, ...page, rows: [...new Map([...previous.rows, ...page.rows].map(row => [row.id, row])).values()], loadingMore: false } : previous)
    }).catch((cause: unknown) => {
      if (generation.current !== epoch) return
      setResult(previous => previous?.key === key ? { ...previous, loadingMore: false, error: cause instanceof Error ? cause.message : 'Unable to load more logs.' } : previous)
    })
    running.current = request
    void request.finally(() => { if (running.current === request) running.current = null })
  }
  return { rows: current ? result.rows : [], loading: !!kind && !current, loadingMore: current && result.loadingMore, error: current ? result.error : '', more: current && result.more, loadMore, refresh: () => setRefresh(value => value + 1) }
}
