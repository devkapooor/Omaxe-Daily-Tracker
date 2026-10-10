import { useCallback, useEffect, useRef, useState } from 'react'
import { createActionHistoryPager, type HistoryRecord } from '../data/actionHistoryRepository'

type HistoryState = { records: HistoryRecord[]; started: boolean; loading: boolean; hasMore: boolean; error: string | null }
const emptyState: HistoryState = { records: [], started: false, loading: false, hasMore: true, error: null }

export function useActionCentreHistory(active: boolean, ready: boolean, vendorEnabled: boolean) {
  const [state, setState] = useState(emptyState)
  const session = useRef<{ vendorEnabled: boolean; pager: ReturnType<typeof createActionHistoryPager> } | null>(null)
  const running = useRef(false)
  const refreshQueued = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  const loadMore = useCallback(async () => {
    if (!ready || running.current) return
    if (!session.current || session.current.vendorEnabled !== vendorEnabled) {
      session.current = { vendorEnabled, pager: createActionHistoryPager(vendorEnabled) }
      setState(emptyState)
    }
    const current = session.current
    running.current = true
    setState((value) => ({ ...value, started: true, loading: true, error: null }))
    try {
      const page = await current.pager.next()
      if (mounted.current && session.current === current) setState((value) => ({ ...value, records: [...value.records, ...page.records], loading: false, hasMore: page.hasMore }))
    } catch (cause) {
      if (mounted.current && session.current === current) setState((value) => ({ ...value, loading: false, error: cause instanceof Error ? cause.message : 'Unable to load history.' }))
    } finally {
      running.current = false
      if (refreshQueued.current) {
        refreshQueued.current = false
        session.current = null
        if (mounted.current) setState(emptyState)
      }
    }
  }, [ready, vendorEnabled])

  useEffect(() => { if (active && ready && !state.loading && (!state.started || session.current?.vendorEnabled !== vendorEnabled)) void loadMore() }, [active, ready, state.started, state.loading, vendorEnabled, loadMore])
  const refresh = useCallback(() => { if (running.current) { refreshQueued.current = true; return }; session.current = null; setState(emptyState) }, [])
  return { ...state, loadMore, refresh }
}
