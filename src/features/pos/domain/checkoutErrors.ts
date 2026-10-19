import type { PosProduct } from './types'

export class PosProductChangedSinceScanError extends Error {
  constructor(readonly productId: string, readonly previousStock: number | undefined, readonly latestProduct: Pick<PosProduct, 'name' | 'sellingPricePaise' | 'currentQuantity' | 'revision'>) {
    super(`Stock changed for ${latestProduct.name} after it was scanned; product details may have changed too.`)
    this.name = 'PosProductChangedSinceScanError'
  }
}
/** The trusted handler explicitly guarantees this attempt did not post. */
export class CheckoutRejectedError extends Error {
  constructor(message: string, readonly kind: string) { super(message); this.name = 'CheckoutRejectedError' }
}
