import { deleteDoc, doc, setDoc, writeBatch } from 'firebase/firestore'
import { db } from '@/shared/lib/firebase'
import { clearLegacyLocalData, readLegacyImportPayload } from '@/store/legacyLocalData'
import type { CashoutDraft, DailySales, PaymentDraft, PurchaseDraft } from '@/domain/financeTypes'
import type { CashTransfer, DailyCashoutEntry, LoanEntry, PlannedPayment, VendorRecord } from '@/domain/appTypes'
import type { NameDirectoryType, StoreCollectionState } from '@/store/storeShared'
import {
  normalizeLoanRecord,
  normalizeName,
  normalizeVendorRecord,
  nowIso,
  salesDocId,
  singleStoreId,
  sortByCreatedAtDesc,
} from '@/store/storeShared'

type FinanceActionArgs = {
  getState: () => StoreCollectionState
  setIsBusy: React.Dispatch<React.SetStateAction<boolean>>
  ensureNameInDirectory: (type: NameDirectoryType, rawName: string) => Promise<boolean>
}

function withoutUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)) as T
}

export function createFinanceActions({ ensureNameInDirectory, getState, setIsBusy }: FinanceActionArgs) {
  async function saveSales(draft: Omit<DailySales, 'id' | 'createdAt' | 'updatedAt'>) {
    const { financeData } = getState()
    const id = salesDocId(draft.storeId, draft.date)
    const existing = financeData.sales.find((item) => item.id === id)
    const timestamp = nowIso()
    await setDoc(doc(db, 'sales', id), { ...draft, createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp }, { merge: true })
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
    const nextOpeningOutstanding = Math.max(input.openingOutstanding ?? 0, 0)
    const openingPaidAlready = Math.max(
      (existing?.openingOutstanding ?? 0) - (existing?.openingOutstandingRemaining ?? existing?.openingOutstanding ?? 0),
      0,
    )
    const nextOpeningOutstandingRemaining = existing ? Math.max(nextOpeningOutstanding - openingPaidAlready, 0) : nextOpeningOutstanding
    const record = normalizeVendorRecord({
      id,
      name: normalizedName,
      ownerName: input.ownerName,
      contact: input.contact,
      address: input.address,
      companiesProvided: input.companiesProvided,
      notes: input.notes,
      openingOutstanding: nextOpeningOutstanding,
      openingOutstandingRemaining: nextOpeningOutstandingRemaining,
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
    await setDoc(doc(db, 'cashouts', id), withoutUndefined({ ...draft, createdAt: timestamp, updatedAt: timestamp }))
  }

  async function savePayment(draft: PaymentDraft) {
    const id = `payment-${crypto.randomUUID()}`
    const timestamp = nowIso()
    const normalizedPartyName = normalizeName(draft.partyName)
    const paymentRecord = withoutUndefined({ ...draft, partyName: normalizedPartyName, createdAt: timestamp, updatedAt: timestamp })

    if (draft.type === 'Paid' && draft.entryType === 'loan-payment') {
      const { loans } = getState()
      const matchingLoans = loans
        .map((loan) => normalizeLoanRecord(loan))
        .filter((loan) => loan.personName.toLowerCase() === normalizedPartyName.toLowerCase() && loan.remainingAmount > 0)
        .sort((a, b) => `${a.date}-${a.createdAt}`.localeCompare(`${b.date}-${b.createdAt}`))

      if (matchingLoans.length === 0) throw new Error('No open loans found for the selected person.')
      const totalOpenBalance = matchingLoans.reduce((total, loan) => total + loan.remainingAmount, 0)
      if (draft.amount > totalOpenBalance) throw new Error('Loan payment exceeds the open loan balance for the selected person.')

      const batch = writeBatch(db)
      batch.set(doc(db, 'payments', id), paymentRecord)

      let remainingPayment = draft.amount
      matchingLoans.forEach((loan) => {
        if (remainingPayment <= 0) return
        const applied = Math.min(loan.remainingAmount, remainingPayment)
        const nextPaidAmount = loan.paidAmount + applied
        const nextRemainingAmount = loan.remainingAmount - applied
        batch.update(doc(db, 'loans', loan.id), {
          paidAmount: nextPaidAmount,
          remainingAmount: nextRemainingAmount,
          status: nextRemainingAmount > 0 ? 'Open' : 'Settled',
          settledAt: nextRemainingAmount > 0 ? null : timestamp,
          updatedAt: timestamp,
        })
        remainingPayment -= applied
      })

      await batch.commit()
      return
    }

    if (draft.type === 'Paid' && draft.entryType === 'vendor-payment') {
      const { financeData, vendors } = getState()
      const matchingVendor = vendors.find((vendor) => vendor.name.toLowerCase() === normalizedPartyName.toLowerCase())
      const openingOutstandingRemaining = matchingVendor?.openingOutstandingRemaining ?? 0
      const matchingPurchases = financeData.purchases
        .filter((purchase) => purchase.supplierName.toLowerCase() === normalizedPartyName.toLowerCase() && purchase.unpaidAmount > 0)
        .sort((a, b) => `${a.date}-${a.createdAt}`.localeCompare(`${b.date}-${b.createdAt}`))

      if (matchingPurchases.length === 0 && openingOutstandingRemaining <= 0) {
        throw new Error('No open vendor outstanding found for the selected vendor.')
      }

      const totalOpenBalance = openingOutstandingRemaining + matchingPurchases.reduce((total, purchase) => total + purchase.unpaidAmount, 0)
      if (draft.amount > totalOpenBalance) throw new Error('Vendor payment exceeds the open outstanding for the selected vendor.')

      const batch = writeBatch(db)
      batch.set(doc(db, 'payments', id), paymentRecord)

      let remainingPayment = draft.amount
      if (matchingVendor && openingOutstandingRemaining > 0) {
        const appliedToOpening = Math.min(openingOutstandingRemaining, remainingPayment)
        batch.update(doc(db, 'vendors', matchingVendor.id), {
          openingOutstandingRemaining: openingOutstandingRemaining - appliedToOpening,
          updatedAt: timestamp,
        })
        remainingPayment -= appliedToOpening
      }

      matchingPurchases.forEach((purchase) => {
        if (remainingPayment <= 0) return
        const applied = Math.min(purchase.unpaidAmount, remainingPayment)
        batch.update(doc(db, 'purchases', purchase.id), {
          paidAmount: purchase.paidAmount + applied,
          unpaidAmount: purchase.unpaidAmount - applied,
          updatedAt: timestamp,
        })
        remainingPayment -= applied
      })

      await batch.commit()
      return
    }

    await setDoc(doc(db, 'payments', id), paymentRecord)
  }

  async function saveLoanEntry(draft: Omit<LoanEntry, 'id' | 'createdAt' | 'paidAmount' | 'remainingAmount' | 'status' | 'settledAt' | 'updatedAt'>) {
    const id = `loan-${crypto.randomUUID()}`
    const timestamp = nowIso()
    await setDoc(doc(db, 'loans', id), {
      ...draft,
      paidAmount: 0,
      remainingAmount: draft.amount,
      status: 'Open',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await ensureNameInDirectory('people', draft.personName)
  }

  async function saveDailyCashoutEntry(draft: Omit<DailyCashoutEntry, 'id' | 'createdAt'>) {
    const { dailyCashouts, financeData } = getState()
    const parsedDrawerTotal = draft.drawerTotal ?? draft.remainingBalance
    const auditDifference = draft.cashAudit - parsedDrawerTotal
    const auditStatus = auditDifference > 0 ? 'cash-less' : auditDifference < 0 ? 'cash-more' : 'matched'
    const auditMessage =
      auditDifference > 0
        ? `WARNING: Cash is less by ${auditDifference}.`
        : auditDifference < 0
          ? `Cash is more by ${Math.abs(auditDifference)}, probably wrong billings.`
          : 'Cash matches the system audit.'
    const latestPendingBalances = dailyCashouts[0]?.pendingCashBalances ?? { dev: 0, arsh: 0, farhan: 0 }
    const nextPendingBalances = { ...latestPendingBalances }
    const holder = draft.recordedByHolder
    if (holder === 'Dev') nextPendingBalances.dev += parsedDrawerTotal
    if (holder === 'Arsh') nextPendingBalances.arsh += parsedDrawerTotal
    if (holder === 'Farhan') nextPendingBalances.farhan += parsedDrawerTotal

    const entry: DailyCashoutEntry = {
      ...draft,
      drawerTotal: parsedDrawerTotal,
      auditDifference,
      auditStatus,
      auditMessage,
      pendingCashBalances: nextPendingBalances,
      remainingBalance: parsedDrawerTotal,
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
    const transfer: CashTransfer = { ...draft, id: `cash-transfer-${crypto.randomUUID()}`, createdAt: nowIso() }
    await setDoc(doc(db, 'cashTransfers', transfer.id), {
      id: transfer.id,
      date: transfer.date,
      from: transfer.from,
      toType: transfer.toType,
      ...(transfer.toPerson ? { toPerson: transfer.toPerson } : {}),
      amount: transfer.amount,
      reason: transfer.reason,
      createdBy: transfer.createdBy,
      ...(transfer.recordType ? { recordType: transfer.recordType } : {}),
      createdAt: transfer.createdAt,
    })
  }

  async function savePlannedPayment(draft: Omit<PlannedPayment, 'id' | 'createdAt' | 'updatedAt'>) {
    const title = normalizeName(draft.title)
    if (!title) throw new Error('A payment title is required.')
    if (!draft.date) throw new Error('A planned deduction date is required.')
    if (!Number.isFinite(draft.amount) || draft.amount <= 0) throw new Error('Planned payment amount must be greater than zero.')

    const id = `planned-payment-${crypto.randomUUID()}`
    const timestamp = nowIso()
    await setDoc(doc(db, 'plannedPayments', id), {
      id,
      title,
      date: draft.date,
      amount: draft.amount,
      notes: draft.notes.trim(),
      createdBy: normalizeName(draft.createdBy),
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  }

  async function deletePlannedPayment(paymentId: string) {
    await deleteDoc(doc(db, 'plannedPayments', paymentId))
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
          openingOutstanding: 0,
          openingOutstandingRemaining: 0,
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

  return {
    deletePlannedPayment,
    ensureNameInDirectory,
    importLegacyData,
    saveCashTransfer,
    saveCashout,
    saveDailyCashoutEntry,
    saveLoanEntry,
    savePayment,
    savePlannedPayment,
    savePurchase,
    saveSales,
    saveVendor,
  }
}
