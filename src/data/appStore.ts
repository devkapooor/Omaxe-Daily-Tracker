import { useEffect, useMemo, useRef, useState } from 'react'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { auth, db, isLocalAuthBypassEnabled, localBypassCredentials } from '../lib/firebase'
import type { AppUser, FinanceData } from '../domain/financeTypes'
import type {
  CashTransfer,
  DailyCashoutEntry,
  LoanEntry,
  NameDirectory,
  SettingsAuditEntry,
  UserAccount,
  VendorRecord,
} from '../domain/appTypes'
import { createAppStoreActions } from './storeActions'
import {
  defaultAppSettings,
  emptyFinanceData,
  emptyNameDirectory,
  ensureSingleStore,
  initialLoadedCollections,
  nowIso,
  type LoadedCollections,
} from './storeShared'
import { setupAppStoreSubscriptions } from './storeSubscriptions'
import { seedData } from './seedData'
import { readLegacyImportPayload } from './legacyLocalData'

export function useAppStore() {
  const [authUser, setAuthUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [loadedCollections, setLoadedCollections] = useState<LoadedCollections>(initialLoadedCollections)
  const [financeData, setFinanceData] = useState<FinanceData>(emptyFinanceData)
  const [appSettings, setAppSettings] = useState(defaultAppSettings)
  const [users, setUsers] = useState<UserAccount[]>([])
  const [vendors, setVendors] = useState<VendorRecord[]>([])
  const [nameDirectory, setNameDirectory] = useState<NameDirectory>(emptyNameDirectory)
  const [loans, setLoans] = useState<LoanEntry[]>([])
  const [dailyCashouts, setDailyCashouts] = useState<DailyCashoutEntry[]>([])
  const [cashTransfers, setCashTransfers] = useState<CashTransfer[]>([])
  const [settingsAuditLog, setSettingsAuditLog] = useState<SettingsAuditEntry[]>([])
  const [isBusy, setIsBusy] = useState(false)
  const [canStartSubscriptions, setCanStartSubscriptions] = useState(false)
  const bootstrappedOwnerRef = useRef<string | null>(null)
  const localBypassAttemptedRef = useRef(false)
  const vendorFallbackLoadedRef = useRef(false)

  useEffect(() => {
    return onAuthStateChanged(auth, (nextUser) => {
      setAuthUser(nextUser)
      setAuthReady(true)
      setAuthError(null)
      setLoadedCollections(initialLoadedCollections)
      setFinanceData(emptyFinanceData)
      setAppSettings(defaultAppSettings)
      setUsers([])
      setVendors([])
      setNameDirectory(emptyNameDirectory)
      setLoans([])
      setDailyCashouts([])
      setCashTransfers([])
      setSettingsAuditLog([])
      setCanStartSubscriptions(!nextUser)
    })
  }, [])

  useEffect(() => {
    async function autoSignInLocally() {
      if (!authReady || authUser || !isLocalAuthBypassEnabled || localBypassAttemptedRef.current) return
      if (!localBypassCredentials.email || !localBypassCredentials.password) {
        setAuthError('Local auth bypass is enabled, but the local Firebase credentials are missing.')
        return
      }

      localBypassAttemptedRef.current = true
      setIsBusy(true)
      setAuthError(null)
      try {
        await signInWithEmailAndPassword(auth, localBypassCredentials.email, localBypassCredentials.password)
      } catch (error) {
        setAuthError(error instanceof Error ? error.message : 'Unable to sign in to the local bypass account.')
      } finally {
        setIsBusy(false)
      }
    }

    void autoSignInLocally()
  }, [authReady, authUser])

  useEffect(() => {
    if (!authUser) return

    let cancelled = false
    const currentAuthUser = authUser
    async function verifyAccessBeforeSubscriptions() {
      setCanStartSubscriptions(false)
      try {
        const profileSnapshot = await getDoc(doc(db, 'users', currentAuthUser.uid))
        if (!profileSnapshot.exists()) {
          if (!cancelled) setCanStartSubscriptions(true)
          return
        }

        const profile = profileSnapshot.data() as Partial<UserAccount>
        if (profile.disabled) {
          if (profile.approvalStatus === 'pending') {
            setAuthError('This account is not active yet. Please contact the owner.')
          } else if (profile.approvalStatus === 'rejected') {
            setAuthError('This account is not active. Please contact the owner.')
          } else {
            setAuthError('This account has been disabled by the owner.')
          }
          await signOut(auth)
          return
        }

        if (!cancelled) setCanStartSubscriptions(true)
      } catch (error) {
        setAuthError(error instanceof Error ? error.message : 'Unable to verify your workspace access.')
        await signOut(auth).catch(() => undefined)
      }
    }

    void verifyAccessBeforeSubscriptions()
    return () => {
      cancelled = true
    }
  }, [authUser])

  useEffect(() => {
    if (!authUser || !canStartSubscriptions) return

    return setupAppStoreSubscriptions({
      setCashTransfers,
      setDailyCashouts,
      setFinanceData,
      setAppSettings,
      setLoadedCollections,
      setLoans,
      setNameDirectory,
      setSettingsAuditLog,
      setUsers,
      setVendors,
      vendorFallbackLoadedRef,
    })
  }, [authUser, canStartSubscriptions])

  const collectionsReady = useMemo(() => Object.values(loadedCollections).every(Boolean), [loadedCollections])

  const currentUser = useMemo<AppUser | null>(() => {
    if (!authUser) return null
    const profile = users.find((candidate) => candidate.id === authUser.uid)
    if (!profile || profile.disabled) return null
    return { id: profile.id, name: profile.name, role: profile.role }
  }, [authUser, users])

  useEffect(() => {
    async function bootstrapFirstOwner() {
      if (!authUser || !loadedCollections.users) return

      const existingProfile = users.find((candidate) => candidate.id === authUser.uid)
      if (existingProfile) {
        if (existingProfile.disabled) {
          await signOut(auth)
        }
        return
      }

      if (bootstrappedOwnerRef.current === authUser.uid) return
      bootstrappedOwnerRef.current = authUser.uid

      if (users.length === 0) {
        await setDoc(doc(db, 'users', authUser.uid), {
          name: authUser.displayName ?? authUser.email?.split('@')[0] ?? 'Owner',
          email: authUser.email ?? '',
          role: 'owner',
          createdAt: nowIso(),
          disabled: false,
        })
        return
      }

      setAuthError('Your Firebase login exists, but there is no matching user profile in Firestore.')
      await signOut(auth)
    }

    void bootstrapFirstOwner()
  }, [authUser, loadedCollections.users, users])

  useEffect(() => {
    async function seedDefaultStore() {
      if (!authUser || !loadedCollections.stores) return
      if (financeData.stores.length > 0) return
      await setDoc(doc(db, 'stores', ensureSingleStore([])[0].id), seedData.stores[0])
    }

    void seedDefaultStore()
  }, [authUser, financeData.stores.length, loadedCollections.stores])

  const canImportLegacyData = useMemo(() => {
    if (!authUser || !collectionsReady) return false
    const legacyPayload = readLegacyImportPayload()
    if (!legacyPayload) return false

    return (
      financeData.sales.length === 0 &&
      financeData.purchases.length === 0 &&
      financeData.cashouts.length === 0 &&
      financeData.payments.length === 0 &&
      vendors.length === 0 &&
      loans.length === 0 &&
      dailyCashouts.length === 0 &&
      cashTransfers.length === 0 &&
      settingsAuditLog.length === 0 &&
      nameDirectory.people.length === 0 &&
      nameDirectory.vendors.length === 0
    )
  }, [
    authUser,
    cashTransfers.length,
    collectionsReady,
    dailyCashouts.length,
    financeData.cashouts.length,
    financeData.payments.length,
    financeData.purchases.length,
    financeData.sales.length,
    loans.length,
    nameDirectory.people.length,
    nameDirectory.vendors.length,
    settingsAuditLog.length,
    vendors.length,
  ])

  const actions = createAppStoreActions({
    getState: () => ({
      cashTransfers,
      dailyCashouts,
      financeData,
      appSettings,
      loadedCollections,
      loans,
      nameDirectory,
      settingsAuditLog,
      users,
      vendors,
    }),
    setAuthError,
    setIsBusy,
  })

  return {
    authError,
    authReady,
    appSettings,
    canImportLegacyData,
    cashTransfers,
    changeOwnPassword: actions.changeOwnPassword,
    collectionsReady,
    createUserAccount: actions.createUserAccount,
    currentUser,
    dailyCashouts,
    data: financeData,
    deleteUserAccount: actions.deleteUserAccount,
    importLegacyData: actions.importLegacyData,
    isBusy,
    loans,
    nameDirectory,
    saveCashTransfer: actions.saveCashTransfer,
    saveCashout: actions.saveCashout,
    saveDailyCashoutEntry: actions.saveDailyCashoutEntry,
    saveLoanEntry: actions.saveLoanEntry,
    saveMonthlyOperationalExpense: actions.saveMonthlyOperationalExpense,
    savePayment: actions.savePayment,
    savePurchase: actions.savePurchase,
    saveSales: actions.saveSales,
    saveVendor: actions.saveVendor,
    settingsAuditLog,
    signIn: actions.signIn,
    signOutCurrentUser: actions.signOutCurrentUser,
    users,
    vendors,
    ensureNameInDirectory: actions.ensureNameInDirectory,
  }
}
