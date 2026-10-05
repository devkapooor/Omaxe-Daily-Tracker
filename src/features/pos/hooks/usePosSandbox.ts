import { useEffect, useState } from 'react'
import {
  subscribeHeldCarts,
  subscribePosConfig,
  subscribePosProducts,
} from '../data/posRepository'
import type { PosCheckoutConfig, PosHeldCart, PosProduct } from '../domain/types'

export function usePosSandbox(filters: { prefix?: string; category?: string; brand?: string }) {
  const { prefix, category, brand } = filters
  const [products, setProducts] = useState<PosProduct[]>([])
  const [heldCarts, setHeldCarts] = useState<PosHeldCart[]>([])
  const [config, setConfig] = useState<PosCheckoutConfig>({ billingMaxDiscountPercentage: null })
  const [error, setError] = useState<string | null>(null)
  useEffect(() => subscribePosProducts(setProducts, (next) => setError(next.message), { prefix, category, brand }), [prefix, category, brand])
  useEffect(() => subscribeHeldCarts(setHeldCarts, (next) => setError(next.message)), [])
  useEffect(() => subscribePosConfig(setConfig, (next) => setError(next.message)), [])
  return { products, heldCarts, config, error }
}
