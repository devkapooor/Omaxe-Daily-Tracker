import type { MutableRefObject } from 'react'
import { collection, doc, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { AppStoreSetters, LoadedCollections } from './storeShared'
import {
  defaultAppSettings,
  ensureSingleStore,
  mapDoc,
  normalizeLoanRecord,
  parseVendorCatalog,
  sortByCreatedAtDesc,
  uniqNames,
  normalizeVendorRecord,
} from './storeShared'
import type {
  Cashout,
  DailySales,
  Payment,
  Purchase,
  Store,
} from '../domain/financeTypes'
import type {
  CashTransfer,
  DailyCashoutEntry,
  LoanEntry,
  NameDirectory,
  SettingsAuditEntry,
  UserAccount,
  VendorRecord,
} from '../domain/appTypes'

type SetupSubscriptionsArgs = Pick<
  AppStoreSetters,
  | 'setCashTransfers'
  | 'setDailyCashouts'
  | 'setFinanceData'
  | 'setLoadedCollections'
  | 'setLoans'
  | 'setAppSettings'
  | 'setNameDirectory'
  | 'setSettingsAuditLog'
  | 'setUsers'
  | 'setVendors'
> & {
  vendorFallbackLoadedRef: MutableRefObject<boolean>
}

export function setupAppStoreSubscriptions({
  setCashTransfers,
  setDailyCashouts,
  setFinanceData,
  setLoadedCollections,
  setLoans,
  setAppSettings,
  setNameDirectory,
  setSettingsAuditLog,
  setUsers,
  setVendors,
  vendorFallbackLoadedRef,
}: SetupSubscriptionsArgs) {
  const markLoaded = (key: keyof LoadedCollections) => {
    setLoadedCollections((current) => (current[key] ? current : { ...current, [key]: true }))
  }

  const unsubscribers = [
    onSnapshot(collection(db, 'stores'), (snapshot) => {
      setFinanceData((current) => ({
        ...current,
        stores: ensureSingleStore(snapshot.docs.map((item) => mapDoc(item.id, item.data() as Omit<Store, 'id'>))),
      }))
      markLoaded('stores')
    }),
    onSnapshot(collection(db, 'sales'), (snapshot) => {
      setFinanceData((current) => ({
        ...current,
        sales: sortByCreatedAtDesc(snapshot.docs.map((item) => mapDoc(item.id, item.data() as Omit<DailySales, 'id'>))),
      }))
      markLoaded('sales')
    }),
    onSnapshot(collection(db, 'purchases'), (snapshot) => {
      setFinanceData((current) => ({
        ...current,
        purchases: sortByCreatedAtDesc(snapshot.docs.map((item) => mapDoc(item.id, item.data() as Omit<Purchase, 'id'>))),
      }))
      markLoaded('purchases')
    }),
    onSnapshot(collection(db, 'cashouts'), (snapshot) => {
      setFinanceData((current) => ({
        ...current,
        cashouts: sortByCreatedAtDesc(snapshot.docs.map((item) => mapDoc(item.id, item.data() as Omit<Cashout, 'id'>))),
      }))
      markLoaded('cashouts')
    }),
    onSnapshot(collection(db, 'payments'), (snapshot) => {
      setFinanceData((current) => ({
        ...current,
        payments: sortByCreatedAtDesc(snapshot.docs.map((item) => mapDoc(item.id, item.data() as Omit<Payment, 'id'>))),
      }))
      markLoaded('payments')
    }),
    onSnapshot(collection(db, 'users'), (snapshot) => {
      setUsers(sortByCreatedAtDesc(snapshot.docs.map((item) => mapDoc(item.id, item.data() as Omit<UserAccount, 'id'>))))
      markLoaded('users')
    }),
    onSnapshot(
      collection(db, 'vendors'),
      (snapshot) => {
        vendorFallbackLoadedRef.current = false
        setVendors(
          sortByCreatedAtDesc(
            snapshot.docs.map((item) => normalizeVendorRecord(mapDoc(item.id, item.data() as Omit<VendorRecord, 'id'>))),
          ),
        )
        markLoaded('vendors')
      },
      () => {
        if (vendorFallbackLoadedRef.current) return
        const fallbackUnsubscribe = onSnapshot(doc(db, 'appMetadata', 'vendorCatalog'), (snapshot) => {
          vendorFallbackLoadedRef.current = true
          setVendors(parseVendorCatalog(snapshot.data()))
          markLoaded('vendors')
        })
        unsubscribers.push(fallbackUnsubscribe)
      },
    ),
    onSnapshot(collection(db, 'loans'), (snapshot) => {
      setLoans(
        sortByCreatedAtDesc(
          snapshot.docs.map((item) => normalizeLoanRecord(mapDoc(item.id, item.data() as Omit<LoanEntry, 'id'>))),
        ),
      )
      markLoaded('loans')
    }),
    onSnapshot(collection(db, 'dailyCashouts'), (snapshot) => {
      setDailyCashouts(
        sortByCreatedAtDesc(snapshot.docs.map((item) => mapDoc(item.id, item.data() as Omit<DailyCashoutEntry, 'id'>))),
      )
      markLoaded('dailyCashouts')
    }),
    onSnapshot(query(collection(db, 'cashTransfers'), orderBy('createdAt', 'asc')), (snapshot) => {
      setCashTransfers(snapshot.docs.map((item) => mapDoc(item.id, item.data() as Omit<CashTransfer, 'id'>)))
      markLoaded('cashTransfers')
    }),
    onSnapshot(query(collection(db, 'settingsAudit'), orderBy('createdAt', 'desc')), (snapshot) => {
      setSettingsAuditLog(snapshot.docs.map((item) => mapDoc(item.id, item.data() as Omit<SettingsAuditEntry, 'id'>)).slice(0, 25))
      markLoaded('settingsAudit')
    }),
    onSnapshot(doc(db, 'appMetadata', 'nameDirectory'), (snapshot) => {
      const data = snapshot.data() as Partial<NameDirectory> | undefined
      setNameDirectory({
        people: uniqNames(Array.isArray(data?.people) ? data.people : []),
        vendors: uniqNames(Array.isArray(data?.vendors) ? data.vendors : []),
      })
      markLoaded('nameDirectory')
    }),
    onSnapshot(doc(db, 'appMetadata', 'appSettings'), (snapshot) => {
      const data = snapshot.data() as Partial<{ monthlyOperationalExpense: unknown }> | undefined
      const value = typeof data?.monthlyOperationalExpense === 'number' && data.monthlyOperationalExpense >= 0
        ? data.monthlyOperationalExpense
        : defaultAppSettings.monthlyOperationalExpense
      setAppSettings({ monthlyOperationalExpense: value })
      markLoaded('appSettings')
    }),
  ]

  return () => {
    unsubscribers.forEach((unsubscribe) => unsubscribe())
  }
}
