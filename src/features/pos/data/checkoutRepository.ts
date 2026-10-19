import { httpsCallable } from 'firebase/functions'
import { auth, functions } from '@/shared/lib/firebase'
import type { AppUser } from '@/domain/financeTypes'
import type { PosBill, PosCartLine, PosDiscount, PosPaymentAllocation, PosProduct } from '../domain/types'
import { CheckoutRejectedError, PosProductChangedSinceScanError } from '../domain/checkoutErrors'
import { posSubtotal, validateSettlement } from '../domain/posDomain'

export type FinalizeInput = {
  operationId?: string
  businessDate: string
  lines: PosCartLine[]
  discount: PosDiscount
  payments: PosPaymentAllocation[]
  customerName?: string
  customerMobile?: string
  cashTenderedPaise?: number
  cashChangePaise?: number
}
type Rejection = { checkoutRejected?: boolean; kind?: string; productId?: string; previousStock?: number | null; latestProduct?: Pick<PosProduct, 'name' | 'sellingPricePaise' | 'currentQuantity' | 'revision'> }

export async function finalizePosBill(input: FinalizeInput, actor: AppUser): Promise<PosBill> {
  if (!navigator.onLine) throw new Error('Checkout is disabled while offline. Recover the same checkout after reconnecting.')
  if (!auth.currentUser || auth.currentUser.uid !== actor.id) throw new CheckoutRejectedError('Please sign in again before checkout.', 'session')
  if (input.lines.some(line => line.kind !== 'product' || !line.productId)) throw new CheckoutRejectedError('Resolve or remove every unknown product before finalizing this bill.', 'validation')
  try { validateSettlement(posSubtotal(input.lines) - input.discount.amountPaise, input.payments) }
  catch (error) { throw new CheckoutRejectedError(error instanceof Error ? error.message : 'Payment quote is invalid.', 'validation') }
  try {
    const checkout = httpsCallable<FinalizeInput & { operationId: string }, PosBill>(functions, 'finalizePosCheckout')
    const result = (await checkout({ ...input, operationId: input.operationId ?? crypto.randomUUID() })).data
    if (auth.currentUser?.uid !== actor.id) throw new Error('Checkout result belongs to the previous account. Sign in to that account to recover it.')
    return result
  } catch (error) {
    const details = (error as { details?: Rejection }).details
    if (details?.checkoutRejected) {
      if (details.kind === 'product-changed' && details.productId && details.latestProduct) throw new PosProductChangedSinceScanError(details.productId, details.previousStock ?? undefined, details.latestProduct)
      throw new CheckoutRejectedError(error instanceof Error ? error.message : 'Checkout rejected.', details.kind ?? 'validation')
    }
    // Timeouts/internal/network errors do not prove the transaction failed.
    throw error
  }
}
