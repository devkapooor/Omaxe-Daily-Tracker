import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, query, where, type QueryConstraint, type Unsubscribe } from 'firebase/firestore'
import type { Page, VendorLedgerV2Config } from '@/domain/appTypes'
import type { AppUser } from '@/domain/financeTypes'
import type { ChequeV2, InvoiceAllocationV2, PurchaseV2, VendorAccountStateV2, VendorLedgerCorrectionRequestV2, VendorReturnV2, VendorSettlementV2, VendorSettlementStateV2, VendorV2 } from '@/domain/vendorLedgerV2'
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
  pendingLoading: boolean
  pendingError: string | null
}

type Records = Omit<VendorLedgerV2Data, 'config' | 'loading' | 'error' | 'pendingLoading' | 'pendingError'>
const emptyRecords: Records = { vendors: [], purchases: [], settlements: [], allocations: [], settlementStates: [], correctionRequests: [], returns: [], accountStates: [], cheques: [] }
const errorMessage = (cause: unknown) => cause instanceof Error ? cause.message : 'Unable to load the vendor ledger.'
const distinct = <T extends { id: string }>(items: T[]) => [...new Map(items.map((item) => [item.id, item])).values()]

/** Share owner pending feeds; attach the remaining ledger data only to its consumer page. */
export function useVendorLedgerV2(currentUser: AppUser, activePage: Page): VendorLedgerV2Data {
  const owner = currentUser.role === 'owner'
  const workspaceOpen = activePage === 'vendor-preview'
  const namesNeeded = workspaceOpen || (owner && activePage === 'actions')
  const readConfig = owner || workspaceOpen
  const [configState, setConfigState] = useState<{ value: VendorLedgerV2Config | null; ready: boolean; error: string | null }>({ value: null, ready: false, error: null })
  const [pending, setPending] = useState<{ key: string; corrections: VendorLedgerCorrectionRequestV2[]; returns: VendorReturnV2[]; ready: boolean; error: string | null }>({ key: '', corrections: [], returns: [], ready: false, error: null })
  const [scoped, setScoped] = useState<{ key: string; records: Records; ready: boolean; error: string | null }>({ key: '', records: emptyRecords, ready: false, error: null })
  const enabled = readConfig && configState.value?.enabled === true
  const pendingKey = `${currentUser.id}:${configState.value?.updatedAt ?? 'enabled'}`
  const scopedKey = `${pendingKey}:${workspaceOpen ? 'workspace' : 'names'}`

  useEffect(() => {
    if (!readConfig) return
    return onSnapshot(doc(db, 'appMetadata', 'vendorLedgerV2Config'), (snapshot) => {
      setConfigState({ value: snapshot.exists() ? snapshot.data() as VendorLedgerV2Config : null, ready: true, error: null })
    }, (cause) => setConfigState((state) => ({ ...state, ready: true, error: errorMessage(cause) })))
  }, [currentUser.id, readConfig])

  useEffect(() => {
    if (!owner || !enabled) return
    const ready = new Set<string>()
    const base = (state: typeof pending) => state.key === pendingKey ? state : { key: pendingKey, corrections: [], returns: [], ready: false, error: null }
    const fail = (cause: unknown) => setPending((state) => ({ ...base(state), ready: true, error: errorMessage(cause) }))
    const stopCorrections = onSnapshot(query(collection(db, vendorLedgerV2Collections.correctionRequests), where('status', '==', 'pending')), (snapshot) => {
      ready.add('corrections')
      setPending((state) => ({ ...base(state), corrections: snapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as VendorLedgerCorrectionRequestV2), ready: Boolean(base(state).error) || ready.size === 2 }))
    }, fail)
    const stopReturns = onSnapshot(query(collection(db, vendorLedgerV2Collections.returns), where('outcome', '==', 'pending')), (snapshot) => {
      ready.add('returns')
      setPending((state) => ({ ...base(state), returns: snapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as VendorReturnV2), ready: Boolean(base(state).error) || ready.size === 2 }))
    }, fail)
    return () => { stopCorrections(); stopReturns(); setPending({ key: '', corrections: [], returns: [], ready: false, error: null }) }
  }, [currentUser.id, owner, enabled, pendingKey])

  useEffect(() => {
    if (!enabled || !namesNeeded) return
    const stops: Unsubscribe[] = []
    const ready = new Set<keyof Records>()
    const required = workspaceOpen ? 9 : 1
    const base = (state: typeof scoped) => state.key === scopedKey ? state : { key: scopedKey, records: emptyRecords, ready: false, error: null }
    const fail = (cause: unknown) => setScoped((state) => ({ ...base(state), ready: true, error: errorMessage(cause) }))
    const subscribe = (name: keyof typeof vendorLedgerV2Collections, key: keyof Records, filters: QueryConstraint[] = []) => {
      stops.push(onSnapshot(query(collection(db, vendorLedgerV2Collections[name]), ...filters), (snapshot) => {
        ready.add(key)
        setScoped((state) => ({ ...base(state), records: { ...base(state).records, [key]: snapshot.docs.map((item) => ({ ...item.data(), id: item.id })) }, ready: Boolean(base(state).error) || ready.size === required }))
      }, fail))
    }
    subscribe('vendors', 'vendors')
    if (workspaceOpen) {
      subscribe('purchases', 'purchases')
      subscribe('settlements', 'settlements')
      subscribe('allocations', 'allocations')
      subscribe('settlementStates', 'settlementStates')
      subscribe('vendorAccountStates', 'accountStates')
      subscribe('cheques', 'cheques')
      subscribe('correctionRequests', 'correctionRequests', [owner ? where('status', 'in', ['approved', 'rejected', 'withdrawn']) : where('requestedByUserId', '==', currentUser.id)])
      subscribe('returns', 'returns', owner ? [where('outcome', 'in', ['vendor-credit', 'replacement', 'rejected'])] : [])
    }
    return () => { stops.forEach((stop) => stop()); setScoped({ key: '', records: emptyRecords, ready: false, error: null }) }
  }, [currentUser.id, owner, enabled, namesNeeded, workspaceOpen, scopedKey])

  const pendingLoading = owner && ((!configState.ready && !configState.error) || (enabled && (pending.key !== pendingKey || !pending.ready)))
  const pendingError = owner ? configState.error ?? (enabled && pending.key === pendingKey ? pending.error : null) : null
  const records = enabled && namesNeeded && scoped.key === scopedKey ? scoped.records : emptyRecords
  return {
    ...records,
    config: readConfig ? configState.value : null,
    correctionRequests: owner && enabled ? distinct([...(pending.key === pendingKey ? pending.corrections : []), ...(workspaceOpen ? records.correctionRequests : [])]) : records.correctionRequests,
    returns: owner && enabled ? distinct([...(pending.key === pendingKey ? pending.returns : []), ...(workspaceOpen ? records.returns : [])]) : records.returns,
    loading: (readConfig && !configState.ready) || pendingLoading || (enabled && namesNeeded && (scoped.key !== scopedKey || !scoped.ready)),
    error: (readConfig ? configState.error : null) ?? pendingError ?? (enabled && namesNeeded && scoped.key === scopedKey ? scoped.error : null),
    pendingLoading,
    pendingError,
  }
}
