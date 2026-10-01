import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore'
import type { VendorLedgerV2Config } from '@/domain/appTypes'
import type { AppUser } from '@/domain/financeTypes'
import type {
  ChequeV2,
  InvoiceAllocationV2,
  PurchaseV2,
  VendorAccountStateV2,
  VendorLedgerCorrectionRequestV2,
  VendorReturnV2,
  VendorSettlementV2,
  VendorSettlementStateV2,
  VendorV2,
} from '@/domain/vendorLedgerV2'
import { db } from '@/shared/lib/firebase'
import { vendorLedgerV2Collections } from '@/store/vendorLedgerV2Repository'

export type VendorLedgerV2Data = {
  config: VendorLedgerV2Config | null
  vendors: VendorV2[]
  purchases: PurchaseV2[]
  settlements: VendorSettlementV2[]
  allocations: InvoiceAllocationV2[]
  settlementStates: VendorSettlementStateV2[]
  correctionRequests: VendorLedgerCorrectionRequestV2[]
  returns: VendorReturnV2[]
  accountStates: VendorAccountStateV2[]
  cheques: ChequeV2[]
  loading: boolean
  error: string | null
}

const emptyData: Omit<VendorLedgerV2Data, 'config' | 'loading' | 'error'> = {
  vendors: [], purchases: [], settlements: [], allocations: [], settlementStates: [], correctionRequests: [], returns: [], accountStates: [], cheques: [],
}

export function useVendorLedgerV2(currentUser: AppUser): VendorLedgerV2Data {
  const [state, setState] = useState<VendorLedgerV2Data>({ config: null, ...emptyData, loading: true, error: null })

  useEffect(() => {
    let dataUnsubscribers: Unsubscribe[] = []
    const fail = (cause: unknown) => setState((current) => ({
      ...current, loading: false, error: cause instanceof Error ? cause.message : 'Unable to load the V2 vendor ledger.',
    }))
    const configUnsubscribe = onSnapshot(doc(db, 'appMetadata', 'vendorLedgerV2Config'), (snapshot) => {
      dataUnsubscribers.forEach((unsubscribe) => unsubscribe())
      dataUnsubscribers = []
      const config = snapshot.exists() ? snapshot.data() as VendorLedgerV2Config : null
      if (config?.enabled !== true) {
        setState({ config, ...emptyData, loading: false, error: null })
        return
      }

      setState((current) => ({ ...current, config, loading: true, error: null }))
      const subscribe = <T,>(name: keyof typeof vendorLedgerV2Collections, key: keyof VendorLedgerV2Data) => {
        dataUnsubscribers.push(onSnapshot(collection(db, vendorLedgerV2Collections[name]), (result) => {
          setState((current) => ({
            ...current,
            [key]: result.docs.map((entry) => entry.data() as T),
            loading: false,
          }))
        }, fail))
      }
      subscribe<VendorV2>('vendors', 'vendors')
      subscribe<PurchaseV2>('purchases', 'purchases')
      subscribe<VendorSettlementV2>('settlements', 'settlements')
      subscribe<InvoiceAllocationV2>('allocations', 'allocations')
      subscribe<VendorSettlementStateV2>('settlementStates', 'settlementStates')
      subscribe<VendorReturnV2>('returns', 'returns')
      subscribe<VendorAccountStateV2>('vendorAccountStates', 'accountStates')
      subscribe<ChequeV2>('cheques', 'cheques')
      const correctionSource = currentUser.role === 'owner'
        ? collection(db, vendorLedgerV2Collections.correctionRequests)
        : query(
            collection(db, vendorLedgerV2Collections.correctionRequests),
            where('requestedByUserId', '==', currentUser.id),
          )
      dataUnsubscribers.push(onSnapshot(correctionSource, (result) => {
        setState((current) => ({
          ...current,
          correctionRequests: result.docs.map((entry) => entry.data() as VendorLedgerCorrectionRequestV2),
          loading: false,
        }))
      }, fail))
    }, fail)

    return () => {
      configUnsubscribe()
      dataUnsubscribers.forEach((unsubscribe) => unsubscribe())
    }
  }, [currentUser.id, currentUser.role])

  return state
}
