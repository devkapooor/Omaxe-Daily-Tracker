import { useEffect, useRef, useState } from 'react'
import type { Cursor, ServerPage } from '../data/stockQueries'

export function useServerPage<T>(key: string, load: (cursor: Cursor) => Promise<ServerPage<T>>, enabled = true) {
  const reader = useRef(load)
  useEffect(() => { reader.current = load }, [load])
  const [navigation, setNavigation] = useState<{ key: string; index: number; cursors: Cursor[] }>({ key, index: 0, cursors: [null] })
  const [attempt, setAttempt] = useState(0)
  const nav = navigation.key === key ? navigation : { key, index: 0, cursors: [null] }
  const cursor = nav.cursors[nav.index]
  const requestKey = `${key}:${nav.index}:${attempt}`
  const [state, setState] = useState<{ key: string; page: ServerPage<T>; error: string | null; at: string }>({ key: '', page: { items: [], cursor: null, hasMore: false }, error: null, at: '' })
  useEffect(() => {
    if (!enabled) return
    let active = true
    void reader.current(cursor).then((page) => { if (active) setState({ key: requestKey, page, error: null, at: new Date().toISOString() }) }).catch((cause: unknown) => {
      if (active) setState({ key: requestKey, page: { items: [], cursor: null, hasMore: false }, error: cause instanceof Error ? cause.message : 'Unable to load records.', at: '' })
    })
    return () => { active = false }
  }, [requestKey, cursor, enabled])
  const current = enabled && state.key === requestKey ? state : null
  return {
    items: current?.page.items ?? [], error: current?.error ?? null, loading: enabled && !current, at: current?.at ?? '',
    index: nav.index, hasMore: current?.page.hasMore ?? false,
    next: () => { if (!current?.page.hasMore || !current.page.cursor) return; setNavigation({ key, index: nav.index + 1, cursors: [...nav.cursors.slice(0, nav.index + 1), current.page.cursor] }) },
    previous: () => { if (nav.index > 0) setNavigation({ ...nav, index: nav.index - 1 }) },
    refresh: () => { setNavigation({ key, index: 0, cursors: [null] }); setAttempt((value) => value + 1) },
    retry: () => setAttempt((value) => value + 1),
  }
}
