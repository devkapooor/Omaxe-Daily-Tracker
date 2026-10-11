import { documentId, getCountFromServer, limit, onSnapshot, orderBy, query, startAfter, where, type QueryDocumentSnapshot, type DocumentData, type Unsubscribe } from 'firebase/firestore'
import type { PosBill, PosBillState, PosProduct, PosRefundEvent } from '../domain/types'
import { readPage, singleFlight, stockCollection } from '@/features/stock/data/stockQueries'

/** Complete range totals through bounded realtime pages, with no partial-page totals published. */
function subscribeRange<T>(name: string, field: string, from: string, to: string, next: (records: T[]) => void, fail: (error: Error) => void, loading: () => void) {
  let active = true
  const pages: Array<{ stop: Unsubscribe; boundary: string; docs: QueryDocumentSnapshot<DocumentData>[]; ready: boolean }> = []
  function stopAfter(index: number) { pages.splice(index + 1).forEach((page) => page.stop()) }
  function publish() { if (active && pages.length && pages.every((page) => page.ready)) next(pages.flatMap((page) => page.docs.map((item) => ({ ...item.data(), id: item.id }) as T))) }
  function attach(index: number, cursor: QueryDocumentSnapshot<DocumentData> | null) {
    const page = { stop: (() => {}) as Unsubscribe, boundary: '', docs: [] as QueryDocumentSnapshot<DocumentData>[], ready: false }
    pages[index] = page
    page.stop = onSnapshot(query(stockCollection(name), where(field, '>=', from), where(field, '<=', to), orderBy(field), orderBy(documentId()), ...(cursor ? [startAfter(cursor)] : []), limit(100)), { includeMetadataChanges: true }, (snapshot) => {
      if (!active || pages[index] !== page || snapshot.metadata.fromCache) return
      const last = snapshot.docs.at(-1)
      const boundary = snapshot.size === 100 && last ? `${last.id}:${String(last.data()[field])}` : 'end'
      page.docs = snapshot.docs; page.ready = true
      if (boundary !== page.boundary) {
        loading(); stopAfter(index); page.boundary = boundary
        if (snapshot.size === 100 && last) attach(index + 1, last)
      }
      publish()
    }, (cause) => { if (active && pages[index] === page) fail(cause) })
  }
  attach(0, null)
  return () => { active = false; pages.forEach((page) => page.stop()) }
}
export function subscribeDashboardBills(from: string, to: string, next: (records: PosBill[]) => void, fail: (error: Error) => void, loading: () => void) { return subscribeRange('bills', 'businessDate', from, to, next, fail, loading) }
export function subscribeDashboardRefunds(from: string, to: string, next: (records: PosRefundEvent[]) => void, fail: (error: Error) => void, loading: () => void) { return subscribeRange('events', 'refundDate', from, to, next, fail, loading) }
export function subscribeDashboardStates(ids: string[], next: (records: PosBillState[]) => void, fail: (error: Error) => void) {
  let active = true
  if (!ids.length) { next([]); return () => { active = false } }
  const chunks = Array.from({ length: Math.ceil(ids.length / 30) }, (_, index) => ids.slice(index * 30, index * 30 + 30))
  const results = new Map<number, PosBillState[]>()
  const stops = chunks.map((chunk, index) => onSnapshot(query(stockCollection('billStates'), where(documentId(), 'in', chunk), limit(chunk.length)), { includeMetadataChanges: true }, (snapshot) => {
    if (!active || snapshot.metadata.fromCache) return
    results.set(index, snapshot.docs.map((entry) => entry.data() as PosBillState))
    if (results.size === chunks.length) next([...results.values()].flat())
  }, (cause) => { if (active) fail(cause) }))
  return () => { active = false; stops.forEach((stop) => stop()) }
}
export async function loadStockAttention() {
  const negative = query(stockCollection('products'), where('active', '==', true), where('currentQuantity', '<', 0))
  const zero = query(stockCollection('products'), where('active', '==', true), where('currentQuantity', '==', 0))
  const [negativeCount, zeroCount, negatives, zeros] = await Promise.all([
    singleFlight('attention-count:negative', () => getCountFromServer(negative)), singleFlight('attention-count:zero', () => getCountFromServer(zero)),
    readPage<PosProduct>('products', [where('active', '==', true), where('currentQuantity', '<', 0)], null, 5, 'attention-negative', 'currentQuantity', 'asc'),
    readPage<PosProduct>('products', [where('active', '==', true), where('currentQuantity', '==', 0)], null, 5, 'attention-zero', 'searchName', 'asc'),
  ])
  return { items: [{ negativeStockCount: negativeCount.data().count, zeroStockCount: zeroCount.data().count, stockAttention: [...negatives.items, ...zeros.items].slice(0, 5) }], cursor: null, hasMore: false }
}
