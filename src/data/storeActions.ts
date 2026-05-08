import type { Dispatch, SetStateAction } from 'react'
import { deleteApp, initializeApp } from 'firebase/app'
import {
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
} from 'firebase/auth'
import {
  collection,
  doc,
  getCountFromServer,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { auth, db, firebaseConfig } from '../lib/firebase'
import { clearLegacyLocalData, readLegacyImportPayload } from './legacyLocalData'
import { seedData } from './seedData'
import type {
  CashoutDraft,
  PaymentDraft,
  PurchaseDraft,
  SalesDraft,
} from '../domain/financeTypes'
import type {
  CashTransfer,
  DailyCashoutEntry,
  LoanEntry,
  VendorRecord,
} from '../domain/appTypes'
import type { CreateUserInput, StoreCollectionState } from './storeShared'
import {
  NameDirectoryType,
  normalizeName,
  normalizeVendorRecord,
  nowIso,
  salesDocId,
  singleStoreId,
  sortByCreatedAtDesc,
  uniqNames,
} from './storeShared'

type CreateActionsArgs = {
  getState: () => StoreCollectionState
  setAuthError: Dispatch<SetStateAction<string | null>>
  setIsBusy: Dispatch<SetStateAction<boolean>>
}

export function createAppStoreActions({ getState, setAuthError, setIsBusy }: CreateActionsArgs) {
  async function pushSettingsAudit(action: string, actor: string) {
    const id = `settings-audit-${crypto.randomUUID()}`
    await setDoc(doc(db, 'settingsAudit', id), {
      action,
      actor,
      createdAt: nowIso(),
    })
  }

  async function ensureNameInDirectory(type: NameDirectoryType, rawName: string) {
    const { nameDirectory } = getState()
    const normalized = normalizeName(rawName)
    if (!normalized) return false
    const existing = nameDirectory[type].some((item) => item.toLowerCase() === normalized.toLowerCase())
    if (existing) return false

    const next = {
      ...nameDirectory,
      [type]: uniqNames([...nameDirectory[type], normalized]),
    }
    await setDoc(doc(db, 'appMetadata', 'nameDirectory'), next, { merge: true })
    return true
  }

  async function saveSales(draft: SalesDraft) {
    const { financeData } = getState()
    const id = salesDocId(draft.storeId, draft.date)
    const existing = financeData.sales.find((item) => item.id === id)
    const timestamp = nowIso()
    await setDoc(
      doc(db, 'sales', id),
      {
        ...draft,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      },
      { merge: true },
    )
  }

  async function savePurchase(draft: PurchaseDraft) {
    const id = `purchase-${crypto.randomUUID()}`
    const timestamp = nowIso()
    await setDoc(doc(db, 'purchases', id), {
      ...draft,
      unpaidAmount: Math.max(draft.purchaseAmount - draft.paidAmount, 0),
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  }

  async function saveVendor(input: Omit<VendorRecord, 'id' | 'createdAt' | 'updatedAt'>) {
    const { vendors } = getState()
    const normalizedName = normalizeName(input.name)
    const existing = vendors.find((vendor) => vendor.name.toLowerCase() === normalizedName.toLowerCase())
    const timestamp = nowIso()
    const id = existing?.id ?? `vendor-${crypto.randomUUID()}`
    const record = normalizeVendorRecord({
      id,
      name: normalizedName,
      ownerName: input.ownerName,
      contact: input.contact,
      address: input.address,
      companiesProvided: input.companiesProvided,
      notes: input.notes,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    })

    try {
      await setDoc(doc(db, 'vendors', id), record, { merge: true })
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? String(error.code) : ''
      if (!code.includes('permission-denied')) throw error

      const nextCatalog = sortByCreatedAtDesc([...vendors.filter((vendor) => vendor.id !== id), record])
      await setDoc(doc(db, 'appMetadata', 'vendorCatalog'), { vendors: nextCatalog }, { merge: true })
    }
    await ensureNameInDirectory('vendors', normalizedName)
  }

  async function saveCashout(draft: CashoutDraft) {
    const id = `cashout-${crypto.randomUUID()}`
    const timestamp = nowIso()
    await setDoc(doc(db, 'cashouts', id), {
      ...draft,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  }

  async function savePayment(draft: PaymentDraft) {
    const id = `payment-${crypto.randomUUID()}`
    const timestamp = nowIso()
    await setDoc(doc(db, 'payments', id), {
      ...draft,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  }

  async function addStore(name: string, location: string) {
    const id = `store-${crypto.randomUUID()}`
    const timestamp = nowIso()
    await setDoc(doc(db, 'stores', id), {
      name: normalizeName(name),
      location: normalizeName(location),
      active: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  }

  async function resetDemoData() {
    const batch = writeBatch(db)
    seedData.stores.forEach((store) => batch.set(doc(db, 'stores', store.id), store))
    await batch.commit()
  }

  async function signInWithApp(email: string, password: string) {
    setIsBusy(true)
    setAuthError(null)
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to sign in.')
      throw error
    } finally {
      setIsBusy(false)
    }
  }

  async function createInitialOwnerAccount(name: string, email: string, password: string) {
    setIsBusy(true)
    setAuthError(null)
    try {
      await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password)
      await setDoc(doc(db, 'users', auth.currentUser!.uid), {
        name: normalizeName(name),
        email: email.trim().toLowerCase(),
        role: 'owner',
        createdAt: nowIso(),
        disabled: false,
      })
      await ensureNameInDirectory('people', name)
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to create the owner account.')
      throw error
    } finally {
      setIsBusy(false)
    }
  }

  async function signOutCurrentUser() {
    await signOut(auth)
  }

  async function createUserAccount(input: CreateUserInput, actor: string) {
    setIsBusy(true)
    const secondaryApp = initializeApp(firebaseConfig, `secondary-${crypto.randomUUID()}`)
    const secondaryAuth = getAuth(secondaryApp)

    try {
      const credentials = await createUserWithEmailAndPassword(secondaryAuth, input.email, input.password)
      await setDoc(doc(db, 'users', credentials.user.uid), {
        name: normalizeName(input.name),
        email: input.email.trim().toLowerCase(),
        role: input.role,
        createdAt: nowIso(),
        disabled: false,
      })
      await ensureNameInDirectory('people', input.name)
      await pushSettingsAudit(`User created: ${input.name} (${input.role})`, actor)
    } finally {
      await secondaryAuth.signOut().catch(() => undefined)
      await deleteApp(secondaryApp).catch(() => undefined)
      setIsBusy(false)
    }
  }

  async function setUserDisabled(userId: string, disabled: boolean, actor: string) {
    const { users } = getState()
    const target = users.find((item) => item.id === userId)
    if (!target) return
    await updateDoc(doc(db, 'users', userId), { disabled })
    await pushSettingsAudit(`${disabled ? 'Access disabled' : 'Access restored'}: ${target.name}`, actor)
  }

  async function changeOwnPassword(nextPassword: string) {
    if (!auth.currentUser) throw new Error('No authenticated user found.')
    await updatePassword(auth.currentUser, nextPassword)
  }

  async function saveLoanEntry(draft: Omit<LoanEntry, 'id' | 'createdAt'>) {
    const id = `loan-${crypto.randomUUID()}`
    await setDoc(doc(db, 'loans', id), {
      ...draft,
      createdAt: nowIso(),
    })
    await ensureNameInDirectory('people', draft.personName)
  }

  async function saveDailyCashoutEntry(draft: Omit<DailyCashoutEntry, 'id' | 'createdAt'>) {
    const { dailyCashouts, financeData } = getState()
    const latestPendingBalances = dailyCashouts[0]?.pendingCashBalances ?? { dev: 0, arsh: 0, farhan: 0 }
    const nextPendingBalances = { ...latestPendingBalances }
    const lower = draft.recordedBy.toLowerCase()
    if (lower.includes('dev')) nextPendingBalances.dev += draft.remainingBalance
    if (lower.includes('arsh')) nextPendingBalances.arsh += draft.remainingBalance
    if (lower.includes('farhan')) nextPendingBalances.farhan += draft.remainingBalance

    const entry: DailyCashoutEntry = {
      ...draft,
      pendingCashBalances: nextPendingBalances,
      id: `daily-cashout-${crypto.randomUUID()}`,
      createdAt: nowIso(),
    }
    await setDoc(doc(db, 'dailyCashouts', entry.id), entry)

    const existingSales = financeData.sales.find((sale) => sale.storeId === singleStoreId && sale.date === draft.date)
    const mergedCashSales = (existingSales?.cashSales ?? 0) + draft.cashSales
    const mergedUpiSales = (existingSales?.upiSales ?? 0) + draft.upiSales
    const mergedCardSales = existingSales?.cardSales ?? 0
    const mergedBankTransferSales = existingSales?.bankTransferSales ?? 0
    const mergedCreditSales = (existingSales?.creditSales ?? 0) + draft.creditSales
    const mergedReturns = (existingSales?.returnsDiscounts ?? 0) + draft.returns
    const mergedTotalSales = mergedCashSales + mergedUpiSales + mergedCardSales + mergedBankTransferSales + mergedCreditSales

    await saveSales({
      storeId: singleStoreId,
      date: draft.date,
      totalSales: mergedTotalSales,
      cashSales: mergedCashSales,
      upiSales: mergedUpiSales,
      cardSales: mergedCardSales,
      bankTransferSales: mergedBankTransferSales,
      creditSales: mergedCreditSales,
      returnsDiscounts: mergedReturns,
      notes: `Auto-synced from cashout register. ${draft.actualCashParticulars}`.trim(),
    })
  }

  async function saveCashTransfer(draft: Omit<CashTransfer, 'id' | 'createdAt'>) {
    const transfer: CashTransfer = {
      ...draft,
      id: `cash-transfer-${crypto.randomUUID()}`,
      createdAt: nowIso(),
    }
    await setDoc(doc(db, 'cashTransfers', transfer.id), transfer)
  }

  async function importLegacyData() {
    const legacyPayload = readLegacyImportPayload()
    if (!legacyPayload) return false

    setIsBusy(true)
    try {
      const batch = writeBatch(db)

      legacyPayload.financeData.stores.forEach((store) => batch.set(doc(db, 'stores', store.id), store))
      legacyPayload.financeData.sales.forEach((sale) => batch.set(doc(db, 'sales', sale.id), sale))
      legacyPayload.financeData.purchases.forEach((purchase) => batch.set(doc(db, 'purchases', purchase.id), purchase))
      legacyPayload.financeData.cashouts.forEach((cashout) => batch.set(doc(db, 'cashouts', cashout.id), cashout))
      legacyPayload.financeData.payments.forEach((payment) => batch.set(doc(db, 'payments', payment.id), payment))
      legacyPayload.nameDirectory.vendors.forEach((vendorName) => {
        const vendorId = `vendor-${vendorName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || crypto.randomUUID()}`
        batch.set(doc(db, 'vendors', vendorId), {
          name: vendorName,
          ownerName: '',
          contact: '',
          address: '',
          companiesProvided: '',
          notes: 'Imported from legacy vendor list.',
          createdAt: nowIso(),
          updatedAt: nowIso(),
        })
      })
      legacyPayload.loans.forEach((loan) => batch.set(doc(db, 'loans', loan.id), loan))
      legacyPayload.dailyCashouts.forEach((entry) => batch.set(doc(db, 'dailyCashouts', entry.id), entry))
      legacyPayload.cashTransfers.forEach((entry) => batch.set(doc(db, 'cashTransfers', entry.id), entry))
      legacyPayload.settingsAuditLog.forEach((entry) => batch.set(doc(db, 'settingsAudit', entry.id), entry))
      if (legacyPayload.nameDirectory.people.length > 0 || legacyPayload.nameDirectory.vendors.length > 0) {
        batch.set(doc(db, 'appMetadata', 'nameDirectory'), legacyPayload.nameDirectory, { merge: true })
      }
      legacyPayload.users.forEach((user) => {
        batch.set(doc(db, 'users', user.id), {
          name: user.name,
          email: user.email,
          role: user.role,
          createdAt: user.createdAt,
          disabled: Boolean(user.disabled),
        })
      })

      await batch.commit()
      clearLegacyLocalData()
      return true
    } finally {
      setIsBusy(false)
    }
  }

  async function hasAnyUserProfiles() {
    const snapshot = await getCountFromServer(collection(db, 'users'))
    return snapshot.data().count > 0
  }

  return {
    addStore,
    changeOwnPassword,
    createInitialOwnerAccount,
    createUserAccount,
    ensureNameInDirectory,
    hasAnyUserProfiles,
    importLegacyData,
    resetDemoData,
    saveCashTransfer,
    saveCashout,
    saveDailyCashoutEntry,
    saveLoanEntry,
    savePayment,
    savePurchase,
    saveSales,
    saveVendor,
    setUserDisabled,
    signIn: signInWithApp,
    signOutCurrentUser,
  }
}
