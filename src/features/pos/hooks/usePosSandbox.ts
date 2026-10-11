import { useEffect, useState } from 'react'
import {
  subscribeHeldCarts,
  subscribePosConfig,
} from '../data/posRepository'
import type { PosCheckoutConfig, PosHeldCart } from '../domain/types'

export function usePosSandbox(billingActive: boolean) {
  const [heldCarts, setHeldCarts] = useState<PosHeldCart[]>([])
  const [config, setConfig] = useState<PosCheckoutConfig>({ billingMaxDiscountPercentage: null })
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!billingActive) return
    let active = true
    const fail = (next: Error) => { if (active) setError(next.message) }
    const stopCarts = subscribeHeldCarts((items) => { if (active) setHeldCarts(items) }, fail)
    const stopConfig = subscribePosConfig((next) => { if (active) { setConfig(next); setReady(true); setError(null) } }, fail)
    return () => { active = false; stopCarts(); stopConfig(); setReady(false) }
  }, [billingActive])
  return { heldCarts, config, error, ready }
}
