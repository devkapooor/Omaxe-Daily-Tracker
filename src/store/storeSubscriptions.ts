import { collection, doc, limit, onSnapshot, orderBy, query, where, type Unsubscribe } from 'firebase/firestore'
import { db } from '../shared/lib/firebase'
import type { AppStoreSetters, LoadedCollections } from './storeShared'
import {
  defaultAppSettings,
  ensureSingleStore,
  mapDoc,
  normalizeLoanRecord,
  type OperationalExpenseBreakdown,
  sortByCreatedAtDesc,
  uniqNames,
} from './storeShared'
import type {
  Cashout,
  DailySales,
  Payment,
  Purchase,
  Store,
} from '../domain/financeTypes'
import type {
  CashoutCorrectionRequest,
  CashTransfer,
  DailyCashoutEntry,
  LoanEntry,
  MonthlyReportMeta,
  NameDirectory,
  PlannedPayment,
  SettingsAuditEntry,
  UserAccount,
  VendorIdentitySummary,
} from '../domain/appTypes'
import type { AppUser } from '../domain/financeTypes'
import type { WorkspaceMetrics } from '../domain/workspaceMetrics'
import { parseScheduledNotifications } from '@/features/action-center/domain/scheduledNotifications'
import type { VendorAccountStateV2 } from '@/domain/vendorLedgerV2'

type SetupSubscriptionsArgs = Pick<
  AppStoreSetters,
  | 'setCashTransfers'
  | 'setDailyCashouts'
  | 'setFinanceData'
  | 'setLoadedCollections'
  | 'setLoans'
  | 'setMonthlyReports'
  | 'setAppSettings'
  | 'setNameDirectory'
  | 'setPlannedPayments'
  | 'setSettingsAuditLog'
  | 'setUsers'
  | 'setVendors'
  | 'setVendorAccountStates'
  | 'setWorkspaceMetrics'
> & {
  currentUserRole: AppUser['role']
  onSubscriptionError: (error: unknown) => void
}

export function setupCashoutCorrectionSubscription(
  currentUser: AppUser,
  setRequests: AppStoreSetters['setCashoutCorrectionRequests'],
  onSubscriptionError: (error: unknown) => void,
  onLoaded: () => void,
) {
  const requestsRef = collection(db, 'cashoutCorrectionRequests')
  const requestsQuery = currentUser.role === 'owner'
    ? query(requestsRef, where('status', '==', 'pending'))
    : query(requestsRef, where('requestedByUserId', '==', currentUser.id))

  return onSnapshot(requestsQuery, (snapshot) => {
    setRequests(
      snapshot.docs
        .map((item) => mapDoc(item.id, item.data() as Omit<CashoutCorrectionRequest, 'id'>))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    )
    onLoaded()
  }, onSubscriptionError)
}

export function setupAppStoreSubscriptions({
  setCashTransfers,
  setDailyCashouts,
  setFinanceData,
  setLoadedCollections,
  setLoans,
  setMonthlyReports,
  setAppSettings,
  setNameDirectory,
  setPlannedPayments,
  setSettingsAuditLog,
  setUsers,
  setVendors,
  setVendorAccountStates,
  setWorkspaceMetrics,
  currentUserRole,
  onSubscriptionError,
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
    (() => {
      let vendorMasterReady = false
      let accountStatesReady = false
      let vendorLedgerEnabled: boolean | null = null
      let vendorSubscriptions: Unsubscribe[] = []
      const stopVendorSubscriptions = () => {
        vendorSubscriptions.forEach(unsubscribe => unsubscribe())
        vendorSubscriptions = []
        vendorMasterReady = false
        accountStatesReady = false
      }
      const markVendorsReady = () => {
        if (vendorMasterReady && accountStatesReady) markLoaded('vendors')
      }
      const configUnsubscribe = onSnapshot(doc(db, 'appMetadata', 'vendorLedgerV2Config'), (snapshot) => {
        const enabled = snapshot.exists() && snapshot.get('enabled') === true
        if (vendorLedgerEnabled === enabled) return
        vendorLedgerEnabled = enabled
        stopVendorSubscriptions()
        if (!enabled) {
          setVendors([])
          setVendorAccountStates([])
          setLoadedCollections(current => ({ ...current, vendors: true }))
          return
        }
        setLoadedCollections(current => ({ ...current, vendors: false }))
        const vendorMasterUnsubscribe = onSnapshot(collection(db, 'vendorsV2'), (vendorSnapshot) => {
          const vendors = vendorSnapshot.docs.map((item) => ({
            id: item.id,
            name: String(item.get('canonicalName') ?? ''),
          } satisfies VendorIdentitySummary))
          setVendors(vendors)
          vendorMasterReady = true
          markVendorsReady()
        }, onSubscriptionError)
        const accountStatesUnsubscribe = onSnapshot(collection(db, 'vendorAccountStatesV2'), (accountSnapshot) => {
          setVendorAccountStates(accountSnapshot.docs.map((item) => ({ ...item.data(), id: item.id } as VendorAccountStateV2)))
          accountStatesReady = true
          markVendorsReady()
        }, onSubscriptionError)
        vendorSubscriptions = [vendorMasterUnsubscribe, accountStatesUnsubscribe]
      }, onSubscriptionError)
      return () => {
        configUnsubscribe()
        stopVendorSubscriptions()
      }
    })(),
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
    onSnapshot(query(collection(db, 'monthlyReports'), orderBy('month', 'desc')), (snapshot) => {
      setMonthlyReports(snapshot.docs.map((item) => mapDoc(item.id, item.data() as Omit<MonthlyReportMeta, 'id'>)))
      markLoaded('monthlyReports')
    }, onSubscriptionError),
    onSnapshot(doc(db, 'appMetadata', 'nameDirectory'), (snapshot) => {
      const data = snapshot.data() as Partial<NameDirectory> | undefined
      setNameDirectory({
        people: uniqNames(Array.isArray(data?.people) ? data.people : []),
      })
      markLoaded('nameDirectory')
    }, onSubscriptionError),
    onSnapshot(doc(db, 'appMetadata', currentUserRole === 'owner' ? 'appSettings' : 'staffSettings'), (snapshot) => {
      if (currentUserRole !== 'owner' && (!snapshot.exists() || snapshot.get('schemaVersion') !== 1)) {
        setLoadedCollections(value => ({ ...value, appSettings: false }))
        onSubscriptionError(Object.assign(new Error('Shared settings are unavailable or need an update. Ask the owner to publish them, then retry.'), { code: 'shared-view-unavailable' }))
        return
      }
      const data = snapshot.data() as Partial<{
        marginPercentage: unknown
        monthlyOperationalExpense: unknown
        businessLegalName: unknown
        businessGstin: unknown
        businessFssaiLicense: unknown
        businessBankName: unknown
        businessBankAccountHolder: unknown
        businessBankAccountNumber: unknown
        businessBankIfsc: unknown
        businessBankBranch: unknown
        operationalExpenseBreakdown: Partial<Record<keyof OperationalExpenseBreakdown, unknown>>
        scheduledNotifications: unknown
      }> | undefined
      const monthlyOperationalExpense =
        typeof data?.monthlyOperationalExpense === 'number' && data.monthlyOperationalExpense >= 0
          ? data.monthlyOperationalExpense
          : defaultAppSettings.monthlyOperationalExpense
      const marginPercentage =
        typeof data?.marginPercentage === 'number' && data.marginPercentage >= 0
          ? data.marginPercentage
          : defaultAppSettings.marginPercentage
      const rawBreakdown = data?.operationalExpenseBreakdown
      const operationalExpenseBreakdown: OperationalExpenseBreakdown = {
        rent: typeof rawBreakdown?.rent === 'number' && rawBreakdown.rent >= 0 ? rawBreakdown.rent : defaultAppSettings.operationalExpenseBreakdown.rent,
        electricity: typeof rawBreakdown?.electricity === 'number' && rawBreakdown.electricity >= 0 ? rawBreakdown.electricity : defaultAppSettings.operationalExpenseBreakdown.electricity,
        maintenance: typeof rawBreakdown?.maintenance === 'number' && rawBreakdown.maintenance >= 0 ? rawBreakdown.maintenance : defaultAppSettings.operationalExpenseBreakdown.maintenance,
        salaries: typeof rawBreakdown?.salaries === 'number' && rawBreakdown.salaries >= 0 ? rawBreakdown.salaries : defaultAppSettings.operationalExpenseBreakdown.salaries,
        royalty: typeof rawBreakdown?.royalty === 'number' && rawBreakdown.royalty >= 0 ? rawBreakdown.royalty : defaultAppSettings.operationalExpenseBreakdown.royalty,
        caFee: typeof rawBreakdown?.caFee === 'number' && rawBreakdown.caFee >= 0 ? rawBreakdown.caFee : defaultAppSettings.operationalExpenseBreakdown.caFee,
        miscellaneous:
          typeof rawBreakdown?.miscellaneous === 'number' && rawBreakdown.miscellaneous >= 0
            ? rawBreakdown.miscellaneous
            : defaultAppSettings.operationalExpenseBreakdown.miscellaneous,
      }
      const optionalText = (value: unknown) => typeof value === 'string' ? value.trim() : ''
      const ownerBankText = (value: unknown) => currentUserRole === 'owner' ? optionalText(value) : ''
      setAppSettings({
        marginPercentage, monthlyOperationalExpense, operationalExpenseBreakdown,
        businessLegalName: optionalText(data?.businessLegalName) || defaultAppSettings.businessLegalName,
        businessGstin: optionalText(data?.businessGstin).toUpperCase() || defaultAppSettings.businessGstin,
        businessFssaiLicense: optionalText(data?.businessFssaiLicense),
        businessBankName: ownerBankText(data?.businessBankName),
        businessBankAccountHolder: ownerBankText(data?.businessBankAccountHolder),
        businessBankAccountNumber: ownerBankText(data?.businessBankAccountNumber),
        businessBankIfsc: ownerBankText(data?.businessBankIfsc),
        businessBankBranch: ownerBankText(data?.businessBankBranch),
        scheduledNotifications: parseScheduledNotifications(data?.scheduledNotifications),
      })
      markLoaded('appSettings')
    }, onSubscriptionError),
    onSnapshot(doc(db, 'appMetadata', currentUserRole === 'owner' ? 'workspaceMetrics' : 'staffWorkspaceMetrics'), (snapshot) => {
      if (currentUserRole !== 'owner' && (!snapshot.exists() || snapshot.get('schemaVersion') !== 1)) {
        setLoadedCollections(value => ({ ...value, workspaceMetrics: false }))
        onSubscriptionError(Object.assign(new Error('Shared reporting data is unavailable or needs an update. Ask the owner to publish it, then retry.'), { code: 'shared-view-unavailable' }))
        return
      }
      const data = snapshot.data()
      if (!data || typeof data !== 'object') {
        markLoaded('workspaceMetrics')
        return
      }
      if (currentUserRole === 'owner') setWorkspaceMetrics(data as WorkspaceMetrics)
      else {
        // This role never ingests bank-only state, even if a malformed cached view appears.
        const shared = data as WorkspaceMetrics
        setWorkspaceMetrics({ ...shared, planner: { totalCounterCash: shared.planner.totalCounterCash, groupedSchedule: shared.planner.groupedSchedule.map(group => ({ ...group, items: group.items.map(item => ({ id: item.id, amount: item.amount, date: item.date, note: item.note, source: item.source, title: item.title, ...(item.chequeNumber ? { chequeNumber: item.chequeNumber } : {}) })) })) } })
      }
      markLoaded('workspaceMetrics')
    }, onSubscriptionError),
  ]

  if (currentUserRole === 'owner') {
    unsubscribers.push(
      onSnapshot(collection(db, 'loans'), (snapshot) => {
        setLoans(
          sortByCreatedAtDesc(
            snapshot.docs.map((item) => normalizeLoanRecord(mapDoc(item.id, item.data() as Omit<LoanEntry, 'id'>))),
          ),
        )
        markLoaded('loans')
      }, onSubscriptionError),
    )
  } else {
    setLoans([])
    markLoaded('loans')
  }

  if (currentUserRole === 'owner') {
    unsubscribers.push(
      onSnapshot(query(collection(db, 'settingsAudit'), orderBy('createdAt', 'desc'), limit(25)), (snapshot) => {
        setSettingsAuditLog(snapshot.docs.map((item) => mapDoc(item.id, item.data() as Omit<SettingsAuditEntry, 'id'>)))
        markLoaded('settingsAudit')
      }, onSubscriptionError),
    )
  } else {
    setSettingsAuditLog([])
    markLoaded('settingsAudit')
  }

  return () => {
    unsubscribers.forEach((unsubscribe) => unsubscribe())
  }
}

