import { useCallback, useRef } from 'react'
import { doc, getDocFromServer } from 'firebase/firestore'
import type { VendorSettlementStateV2 } from '@/domain/vendorLedgerV2'
import { db } from '@/shared/lib/firebase'
import { vendorLedgerV2Collections } from '@/store/vendorLedgerV2Repository'

export function useVendorReviewSource() {
  const cache = useRef(new Map<string, Promise<VendorSettlementStateV2 | null>>())
  return useCallback((id: string, refresh = false, expectedRevision?: number) => {
    const key = `${id}:${expectedRevision ?? 'source'}`
    if (refresh) cache.current.delete(key)
    const existing = cache.current.get(key)
    if (existing) return existing
    const pending = getDocFromServer(doc(db, vendorLedgerV2Collections.settlementStates, id)).then((snapshot) => {
      if (!snapshot.exists()) return null
      return { ...snapshot.data(), id: snapshot.id } as VendorSettlementStateV2
    })
    cache.current.set(key, pending)
    void pending.catch(() => { if (cache.current.get(key) === pending) cache.current.delete(key) })
    return pending
  }, [])
}
