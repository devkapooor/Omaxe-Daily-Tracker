import { and, collection, doc, documentId, getDocFromServer, getDocsFromServer, limit, orderBy, query, startAfter, where, type DocumentData, type QueryConstraint, type QueryCompositeFilterConstraint, type QueryFilterConstraint, type QueryNonFilterConstraint, type QueryDocumentSnapshot } from 'firebase/firestore'
import { auth, db } from '@/shared/lib/firebase'
import { POS_SANDBOX_ID } from '@/features/pos/domain/types'

export type Cursor = QueryDocumentSnapshot<DocumentData> | null
export type ServerPage<T> = { items: T[]; cursor: Cursor; hasMore: boolean }
export const stockCollection = (name: string) => collection(db, 'posSandboxes', POS_SANDBOX_ID, name)
const requests = new Map<string, Promise<unknown>>()
/** Share only concurrent identical reads. Successful data is not cached across visits. */
export function singleFlight<T>(key: string, read: () => Promise<T>): Promise<T> {
  key = `${auth.currentUser?.uid ?? 'unauthenticated'}:${key}`
  const pending = requests.get(key)
  if (pending) return pending as Promise<T>
  const promise = read().finally(() => { if (requests.get(key) === promise) requests.delete(key) })
  requests.set(key, promise)
  return promise
}
export async function readPage<T>(name: string, constraints: (QueryConstraint | QueryCompositeFilterConstraint)[], cursor: Cursor, size: number, identity: string, field = 'createdAt', direction: 'asc' | 'desc' = 'desc', secondary: string[] = []): Promise<ServerPage<T>> {
  return singleFlight(`${name}:${identity}:${size}:${cursor?.id ?? ''}:${JSON.stringify(cursor?.data() ?? null)}`, async () => {
    const isFilter = (constraint: QueryConstraint | QueryCompositeFilterConstraint) => ['where', 'or', 'and'].includes(constraint.type)
    const filters = constraints.filter(isFilter) as QueryFilterConstraint[]
    const ordering = [...constraints.filter(value => !isFilter(value)) as QueryNonFilterConstraint[], orderBy(field, direction), ...secondary.map((name) => orderBy(name, direction)), ...(field === '__name__' ? [] : [orderBy(documentId(), direction)]), ...(cursor ? [startAfter(cursor)] : []), limit(size)]
    const target = filters.length ? query(stockCollection(name), and(...filters), ...ordering) : query(stockCollection(name), ...ordering)
    const snapshot = await getDocsFromServer(target)
    return { items: snapshot.docs.map((entry) => ({ ...entry.data(), id: entry.id }) as T), cursor: snapshot.docs.at(-1) ?? cursor, hasMore: snapshot.size === size }
  })
}
export function readSource<T>(name: string, id: string): Promise<T | null> {
  return singleFlight(`source:${name}:${id}`, async () => {
    const snapshot = await getDocFromServer(doc(stockCollection(name), id))
    return snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } as T : null
  })
}
/** IST inclusive date inputs become a half-open UTC timestamp interval. */
export function dateConstraints(from: string, to: string, field = 'createdAt') {
  if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) || (from && to && from > to)) throw new Error('Choose a valid date range.')
  const result: QueryConstraint[] = []
  if (from) result.push(where(field, '>=', new Date(`${from}T00:00:00+05:30`).toISOString()))
  if (to) result.push(where(field, '<', new Date(new Date(`${to}T00:00:00+05:30`).getTime() + 86_400_000).toISOString()))
  return result
}
