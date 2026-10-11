import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '@/shared/lib/firebase'
import { POS_SANDBOX_ID } from '@/features/pos/domain/types'
import type { StockPriceChange, StockPrices } from '../domain/stockPriceChange'

export async function changeStockPrices(draft: StockPrices & { productId: string; expectedRevision: number; operationId: string; reason: string }) {
  return (await httpsCallable<typeof draft, StockPriceChange>(functions, 'changeStockPrices')(draft)).data
}
export async function reviewStockPriceChange(id: string) {
  await httpsCallable(functions, 'reviewStockPriceChange')({ id })
}
export function subscribeStockPriceChanges(next: (changes: StockPriceChange[]) => void, error: (cause: Error) => void) {
  return onSnapshot(query(collection(db, 'posSandboxes', POS_SANDBOX_ID, 'stockPriceChanges'), where('reviewStatus', '==', 'pending')), (snapshot) => next(snapshot.docs.map((entry) => ({ ...entry.data(), id: entry.id } as StockPriceChange))), error)
}
