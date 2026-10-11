import { useEffect, useState } from 'react'
import type { AppUser } from '@/domain/financeTypes'
import type { PosApprovalRequest } from '@/features/pos/domain/types'
import type { CashierReconciliation } from '@/features/pos/domain/cashierHandover'
import { subscribePosApprovals } from '@/features/pos/data/posRepository'
import { subscribeReconciliations } from '@/features/pos/data/cashierHandoverRepository'
import { subscribeStockPriceChanges } from '@/features/stock/data/stockPriceRepository'
import type { StockPriceChange } from '@/features/stock/domain/stockPriceChange'

export function useActionCentreSources(currentUser: AppUser) {
  const [posRequests, setPosRequests] = useState<PosApprovalRequest[]>([])
  const [handovers, setHandovers] = useState<CashierReconciliation[]>([])
  const [posError, setPosError] = useState<string | null>(null)
  const [handoverError, setHandoverError] = useState<string | null>(null)
  const [posReady, setPosReady] = useState(false)
  const [handoverReady, setHandoverReady] = useState(false)
  const [stockChanges, setStockChanges] = useState<StockPriceChange[]>([])
  const [stockError, setStockError] = useState<string | null>(null)
  const [stockReady, setStockReady] = useState(false)
  useEffect(() => {
    if (currentUser.role !== 'owner') return
    const stopPos = subscribePosApprovals((items) => { setPosRequests(items); setPosReady(true); setPosError(null) }, (error) => { setPosError(error.message); setPosReady(true) })
    const stopHandovers = subscribeReconciliations((items) => { setHandovers(items); setHandoverReady(true); setHandoverError(null) }, (error) => { setHandoverError(error.message); setHandoverReady(true) })
    const stopStock = subscribeStockPriceChanges((items) => { setStockChanges(items); setStockReady(true); setStockError(null) }, (error) => { setStockError(error.message); setStockReady(true) })
    return () => { stopPos(); stopHandovers(); stopStock() }
  }, [currentUser.id, currentUser.role])
  return { posRequests, handovers, stockChanges, posError, handoverError, stockError, posLoading: !posReady, handoverLoading: !handoverReady, stockLoading: !stockReady, loading: !posReady || !handoverReady || !stockReady }
}
