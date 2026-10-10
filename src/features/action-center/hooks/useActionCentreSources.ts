import { useEffect, useState } from 'react'
import type { AppUser } from '@/domain/financeTypes'
import type { PosApprovalRequest } from '@/features/pos/domain/types'
import type { CashierReconciliation } from '@/features/pos/domain/cashierHandover'
import { subscribePosApprovals } from '@/features/pos/data/posRepository'
import { subscribeReconciliations } from '@/features/pos/data/cashierHandoverRepository'

export function useActionCentreSources(currentUser: AppUser) {
  const [posRequests, setPosRequests] = useState<PosApprovalRequest[]>([])
  const [handovers, setHandovers] = useState<CashierReconciliation[]>([])
  const [posError, setPosError] = useState<string | null>(null)
  const [handoverError, setHandoverError] = useState<string | null>(null)
  const [posReady, setPosReady] = useState(false)
  const [handoverReady, setHandoverReady] = useState(false)
  useEffect(() => {
    if (currentUser.role !== 'owner') return
    const stopPos = subscribePosApprovals((items) => { setPosRequests(items); setPosReady(true) }, (error) => { setPosError(error.message); setPosReady(true) })
    const stopHandovers = subscribeReconciliations((items) => { setHandovers(items); setHandoverReady(true) }, (error) => { setHandoverError(error.message); setHandoverReady(true) })
    return () => { stopPos(); stopHandovers() }
  }, [currentUser.role])
  return { posRequests, handovers, posError, handoverError, loading: !posReady || !handoverReady }
}
