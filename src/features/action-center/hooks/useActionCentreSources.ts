import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { db } from '@/shared/lib/firebase'
import type { Cashout } from '@/domain/financeTypes'
import type { DailyCashoutEntry } from '@/domain/appTypes'
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
  const [financialOutflows,setFinancialOutflows]=useState<Cashout[]>([])
  const [financialCashouts,setFinancialCashouts]=useState<DailyCashoutEntry[]>([])
  const [financeReady,setFinanceReady]=useState(false)
  const [financeError,setFinanceError]=useState<string|null>(null)
  const [financeMore,setFinanceMore]=useState(false)
  useEffect(() => {
    if (currentUser.role !== 'owner') return
    const stopPos = subscribePosApprovals((items) => { setPosRequests(items); setPosReady(true); setPosError(null) }, (error) => { setPosError(error.message); setPosReady(true) })
    const stopHandovers = subscribeReconciliations((items) => { setHandovers(items); setHandoverReady(true); setHandoverError(null) }, (error) => { setHandoverError(error.message); setHandoverReady(true) })
    const stopStock = subscribeStockPriceChanges((items) => { setStockChanges(items); setStockReady(true); setStockError(null) }, (error) => { setStockError(error.message); setStockReady(true) })
    const ready=new Set<string>(),more=new Set<string>()
    const fail=(e:Error)=>{setFinanceError(e.message);setFinanceReady(true)}
    const stopOutflows=onSnapshot(query(collection(db,'cashouts'),where('reviewStatus','==','pending'),orderBy('createdAt','asc'),limit(51)),s=>{ready.add('outflows');if(s.size>50)more.add('outflows');else more.delete('outflows');setFinancialOutflows(s.docs.slice(0,50).map(d=>({...d.data(),id:d.id}) as Cashout));setFinanceMore(more.size>0);setFinanceReady(ready.size===2);setFinanceError(null)},fail)
    const stopCashouts=onSnapshot(query(collection(db,'dailyCashouts'),where('reviewStatus','==','pending'),orderBy('createdAt','asc'),limit(51)),s=>{ready.add('cashouts');if(s.size>50)more.add('cashouts');else more.delete('cashouts');setFinancialCashouts(s.docs.slice(0,50).map(d=>({...d.data(),id:d.id}) as DailyCashoutEntry));setFinanceMore(more.size>0);setFinanceReady(ready.size===2)},fail)
    return () => { stopPos(); stopHandovers(); stopStock();stopOutflows();stopCashouts();setFinancialOutflows([]);setFinancialCashouts([]);setFinanceReady(false) }
  }, [currentUser.id, currentUser.role])
  return { financialOutflows,financialCashouts,financeError,financeMore,financeLoading:!financeReady,posRequests, handovers, stockChanges, posError, handoverError, stockError, posLoading: !posReady, handoverLoading: !handoverReady, stockLoading: !stockReady, loading: !posReady || !handoverReady || !stockReady || !financeReady }
}
