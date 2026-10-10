import { useCallback, useRef } from 'react'
import { loadPosApprovalSource } from '@/features/pos/data/posRepository'
import type { PosReviewSource } from '../domain/actionCentreReview'

export function usePosReviewSource() {
  const cache = useRef(new Map<string, Promise<PosReviewSource>>())
  return useCallback((billId: string, refresh = false, expectedRevision?: number): Promise<PosReviewSource> => {
    if (refresh) cache.current.delete(billId)
    const existing = cache.current.get(billId)
    if (existing) return existing.then((source) => {
      if (expectedRevision === undefined || source.state.revision >= expectedRevision) return source
      // A newer request revision needs one state read; the receipt remains immutable.
      const current = cache.current.get(billId)
      if (current && current !== existing) return current
      const updated = loadPosApprovalSource(billId, source.bill)
      cache.current.set(billId, updated)
      void updated.catch(() => { if (cache.current.get(billId) === updated) cache.current.delete(billId) })
      return updated
    })
    const pending = loadPosApprovalSource(billId)
    cache.current.set(billId, pending)
    void pending.catch(() => { if (cache.current.get(billId) === pending) cache.current.delete(billId) })
    return pending
  }, [])
}
