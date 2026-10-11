import { useCallback, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from 'react'
export function createPosDraft(userId: string) {
  const values: Record<string, unknown> = {}
  const listeners = new Set<() => void>()
  return {
    userId,
    initialize<T>(key: string, initial: T | (() => T)) { if (!(key in values)) values[key] = typeof initial === 'function' ? (initial as () => T)() : initial; return values[key] as T },
    get<T>(key: string) { return values[key] as T },
    set<T>(key: string, action: SetStateAction<T>) {
      const next = typeof action === 'function' ? (action as (previous: T) => T)(values[key] as T) : action
      if (Object.is(next, values[key])) return
      values[key] = next; listeners.forEach((notify) => notify())
    },
    subscribe(notify: () => void) { listeners.add(notify); return () => { listeners.delete(notify) } },
  }
}
export type PosDraft = ReturnType<typeof createPosDraft>
/** In-memory draft only. Subscribers are React components, never Firestore listeners. */
export function usePosDraftState<T>(draft: PosDraft, userId: string, key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  useState(() => draft.initialize(key, initial))
  const getSnapshot = useCallback(() => draft.get<T>(key), [draft, key])
  const value = useSyncExternalStore(draft.subscribe, getSnapshot)
  const update = useCallback<Dispatch<SetStateAction<T>>>((action) => { if (draft.userId === userId) draft.set(key, action) }, [draft, userId, key])
  return [value, update]
}