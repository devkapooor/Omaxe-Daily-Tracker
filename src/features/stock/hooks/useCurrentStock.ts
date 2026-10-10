import { useEffect, useMemo, useState } from 'react'
import type { PosProduct, PosProductCost } from '@/features/pos/domain/types'
import { deriveStockRows } from '../domain/currentStock'
import { subscribeStockCosts, subscribeStockProducts } from '../data/stockRepository'

export function useCurrentStock() {
  const [attempt, setAttempt] = useState(0)
  const [products, setProducts] = useState<PosProduct[]>([])
  const [costs, setCosts] = useState<PosProductCost[]>([])
  const [productsReady, setProductsReady] = useState(false)
  const [costsReady, setCostsReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    const fail = (cause: Error) => { if (!cancelled) setError(cause.message) }
    const stopProducts = subscribeStockProducts((items) => {
      if (!cancelled) { setProducts(items); setProductsReady(true) }
    }, fail)
    const stopCosts = subscribeStockCosts((items) => {
      if (!cancelled) { setCosts(items); setCostsReady(true) }
    }, fail)
    return () => { cancelled = true; stopProducts(); stopCosts() }
  }, [attempt])
  const rows = useMemo(() => deriveStockRows(products, costs), [products, costs])
  const retry = () => {
    setError(null); setProductsReady(false); setCostsReady(false); setAttempt((value) => value + 1)
  }
  return { rows, loading: !productsReady || !costsReady, error, retry }
}
