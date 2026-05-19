import type { MutableRefObject } from 'react'
import { collection, doc, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '../shared/lib/firebase'
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
  PlannedPayment,
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
  | 'setPlannedPayments'
  | 'setSettingsAuditLog'
  | 'setUsers'
  | 'setVendors'
> & {
  onSubscriptionError: (error: unknown) => void
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
  setPlannedPayments,
  setSettingsAuditLog,
  setUsers,
  setVendors,
  onSubscriptionError,
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
    }, onSubscriptionError),
    onSnapshot(collection(db, 'sales'), (snapshot) => {
      setFinanceData((current) => ({
        ...current,
        sales: sortByCreatedAtDesc(snapshot.docs.map((item) => mapDoc(item.id, item.data() as Omit<DailySales, 'id'>))),
      }))
      markLoaded('sales')
    }, onSubscriptionError),
    onSnapshot(collection(db, 'purchases'), (snapshot) => {
      setFinanceData((current) => ({
        ...current,
        purchases: sortByCreatedAtDesc(snapshot.docs.map((item) => mapDoc(item.id, item.data() as Omit<Purchase, 'id'>))),
      }))
      markLoaded('purchases')
    }, onSubscriptionError),
    onSnapshot(collection(db, 'cashouts'), (snapshot) => {
      setFinanceData((current) => ({
        ...current,
        cashouts: sortByCreatedAtDesc(snapshot.docs.map((item) => mapDoc(item.id, item.data() as Omit<Cashout, 'id'>))),
      }))
      markLoaded('cashouts')
    }, onSubscriptionError),
    onSnapshot(collection(db, 'payments'), (snapshot) => {
      setFinanceData((current) => ({
        ...current,
        payments: sortByCreatedAtDesc(snapshot.docs.map((item) => mapDoc(item.id, item.data() as Omit<Payment, 'id'>))),
      }))
      markLoaded('payments')
    }, onSubscriptionError),
    onSnapshot(collection(db, 'users'), (snapshot) => {
      setUsers(sortByCreatedAtDesc(snapshot.docs.map((item) => mapDoc(item.id, item.data() as Omit<UserAccount, 'id'>))))
      markLoaded('users')
    }, onSubscriptionError),
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
        }, onSubscriptionError)
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
    }, onSubscriptionError),
    onSnapshot(collection(db, 'dailyCashouts'), (snapshot) => {
      setDailyCashouts(
        sortByCreatedAtDesc(snapshot.docs.map((item) => mapDoc(item.id, item.data() as Omit<DailyCashoutEntry, 'id'>))),
      )
      markLoaded('dailyCashouts')
    }, onSubscriptionError),
    onSnapshot(query(collection(db, 'cashTransfers'), orderBy('createdAt', 'asc')), (snapshot) => {
      setCashTransfers(snapshot.docs.map((item) => mapDoc(item.id, item.data() as Omit<CashTransfer, 'id'>)))
      markLoaded('cashTransfers')
    }, onSubscriptionError),
    onSnapshot(query(collection(db, 'plannedPayments'), orderBy('date', 'asc')), (snapshot) => {
      setPlannedPayments(snapshot.docs.map((item) => mapDoc(item.id, item.data() as Omit<PlannedPayment, 'id'>)))
      markLoaded('plannedPayments')
    }, onSubscriptionError),
    onSnapshot(query(collection(db, 'settingsAudit'), orderBy('createdAt', 'desc')), (snapshot) => {
      setSettingsAuditLog(snapshot.docs.map((item) => mapDoc(item.id, item.data() as Omit<SettingsAuditEntry, 'id'>)).slice(0, 25))
      markLoaded('settingsAudit')
    }, onSubscriptionError),
    onSnapshot(doc(db, 'appMetadata', 'nameDirectory'), (snapshot) => {
      const data = snapshot.data() as Partial<NameDirectory> | undefined
      setNameDirectory({
        people: uniqNames(Array.isArray(data?.people) ? data.people : []),
        vendors: uniqNames(Array.isArray(data?.vendors) ? data.vendors : []),
      })
      markLoaded('nameDirectory')
    }, onSubscriptionError),
    onSnapshot(doc(db, 'appMetadata', 'appSettings'), (snapshot) => {
      const data = snapshot.data() as Partial<{ currentBankBalance: unknown; marginPercentage: unknown; monthlyOperationalExpense: unknown }> | undefined
      const currentBankBalance =
        typeof data?.currentBankBalance === 'number' && data.currentBankBalance >= 0
          ? data.currentBankBalance
          : defaultAppSettings.currentBankBalance
      const monthlyOperationalExpense =
        typeof data?.monthlyOperationalExpense === 'number' && data.monthlyOperationalExpense >= 0
          ? data.monthlyOperationalExpense
          : defaultAppSettings.monthlyOperationalExpense
      const marginPercentage =
        typeof data?.marginPercentage === 'number' && data.marginPercentage >= 0
          ? data.marginPercentage
          : defaultAppSettings.marginPercentage
      setAppSettings({ currentBankBalance, marginPercentage, monthlyOperationalExpense })
      markLoaded('appSettings')
    }, onSubscriptionError),
  ]

  return () => {
    unsubscribers.forEach((unsubscribe) => unsubscribe())
  }
}

