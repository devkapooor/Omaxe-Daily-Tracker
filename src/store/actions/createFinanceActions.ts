import { deleteDoc, deleteField, doc, setDoc, writeBatch } from 'firebase/firestore'
import { db } from '@/shared/lib/firebase'
import { clearLegacyLocalData, readLegacyImportPayload } from '@/store/legacyLocalData'
import type { CashoutDraft, DailySales, Payment, PaymentDraft, PurchaseDraft } from '@/domain/financeTypes'
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

function sortByBusinessOrder<T extends { date: string; createdAt: string }>(items: T[]) {
  return [...items].sort((a, b) => `${a.date}-${a.createdAt}`.localeCompare(`${b.date}-${b.createdAt}`))
}

export function createFinanceActions({ ensureNameInDirectory, getState, setIsBusy }: FinanceActionArgs) {
  async function syncSalesForDate(date: string, nextDailyCashouts: DailyCashoutEntry[]) {
    const { financeData } = getState()
    const remainingEntries = nextDailyCashouts.filter((entry) => entry.date === date)
    const salesId = salesDocId(singleStoreId, date)
    const existingSales = financeData.sales.find((sale) => sale.id === salesId)

    if (remainingEntries.length === 0) {
      if (existingSales) {
        await deleteDoc(doc(db, 'sales', salesId))
      }
      return
    }

    const cashSales = remainingEntries.reduce((total, entry) => total + entry.cashSales, 0)
    const upiSales = remainingEntries.reduce((total, entry) => total + entry.upiSales, 0)
    const creditSales = remainingEntries.reduce((total, entry) => total + entry.creditSales, 0)
    const returnsDiscounts = remainingEntries.reduce((total, entry) => total + entry.returns, 0)
    const cardSales = existingSales?.cardSales ?? 0
    const bankTransferSales = existingSales?.bankTransferSales ?? 0
    const timestamp = nowIso()

    await setDoc(doc(db, 'sales', salesId), {
      id: salesId,
      storeId: singleStoreId,
      date,
      totalSales: cashSales + upiSales + cardSales + bankTransferSales + creditSales,
      cashSales,
      upiSales,
      cardSales,
      bankTransferSales,
      creditSales,
      returnsDiscounts,
      notes: `Auto-synced from cashout register. ${remainingEntries.map((entry) => entry.actualCashParticulars.trim()).filter(Boolean).join(' | ')}`.trim(),
      createdAt: existingSales?.createdAt ?? remainingEntries[0]?.createdAt ?? timestamp,
      updatedAt: timestamp,
    })
  }

  function recomputeLoansForParty(loans: LoanEntry[], payments: Payment[], partyName: string) {
    const normalizedPartyName = normalizeName(partyName).toLowerCase()
    const matchingLoans = sortByBusinessOrder(
      loans
        .map((loan) => normalizeLoanRecord(loan))
        .filter((loan) => loan.personName.toLowerCase() === normalizedPartyName),
    )
    const matchingPayments = sortByBusinessOrder(
      payments.filter(
        (payment) =>
          payment.type === 'Paid' &&
          payment.entryType === 'loan-payment' &&
          payment.partyName.toLowerCase() === normalizedPartyName,
      ),
    )

    const loanState: LoanEntry[] = matchingLoans.map((loan) => ({
      ...loan,
      paidAmount: 0,
      remainingAmount: loan.amount,
      status: 'Open',
      settledAt: undefined,
      updatedAt: loan.updatedAt ?? loan.createdAt,
    }))

    for (const payment of matchingPayments) {
      let remainingPayment = payment.amount
      for (const loan of loanState) {
        if (remainingPayment <= 0) break
        if (loan.remainingAmount <= 0) continue

        const applied = Math.min(loan.remainingAmount, remainingPayment)
        loan.paidAmount += applied
        loan.remainingAmount -= applied
        loan.status = loan.remainingAmount > 0 ? 'Open' : 'Settled'
        loan.settledAt = loan.remainingAmount > 0 ? undefined : payment.updatedAt ?? payment.createdAt
        loan.updatedAt = payment.updatedAt ?? payment.createdAt
        remainingPayment -= applied
      }

      if (remainingPayment > 0) {
        throw new Error(`Cannot safely recompute loans for ${partyName} because repayment history exceeds the surviving loan balance.`)
      }
    }

    return loanState
  }

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

  async function deleteLoanEntry(loanId: string) {
    if (!loanId.trim()) throw new Error('Loan id is required.')

    const { financeData, loans } = getState()
    const targetLoan = loans.find((loan) => loan.id === loanId)
    if (!targetLoan) throw new Error('This loan record could not be found.')

    const remainingLoans = loans.filter((loan) => loan.id !== loanId)
    const recomputedLoans = recomputeLoansForParty(remainingLoans, financeData.payments, targetLoan.personName)
    const batch = writeBatch(db)

    batch.delete(doc(db, 'loans', loanId))
    recomputedLoans.forEach((loan) => {
      batch.update(doc(db, 'loans', loan.id), {
        paidAmount: loan.paidAmount,
        remainingAmount: loan.remainingAmount,
        status: loan.status,
        updatedAt: loan.updatedAt ?? nowIso(),
        settledAt: loan.settledAt ?? deleteField(),
        notes: loan.notes ?? deleteField(),
      })
    })

    await batch.commit()
  }

  async function saveDailyCashoutEntry(draft: Omit<DailyCashoutEntry, 'id' | 'createdAt'>) {
    const { financeData } = getState()
    const parsedDrawerTotal = draft.drawerTotal ?? draft.remainingBalance
    const auditDifference = draft.cashAudit - parsedDrawerTotal
    const auditStatus = auditDifference > 0 ? 'cash-less' : auditDifference < 0 ? 'cash-more' : 'matched'
    const auditMessage =
      auditDifference > 0
        ? `WARNING: Cash is less by ${auditDifference}.`
        : auditDifference < 0
          ? `Cash is more by ${Math.abs(auditDifference)}, probably wrong billings.`
          : 'Cash matches the system audit.'
    const entry: DailyCashoutEntry = {
      ...draft,
      drawerTotal: parsedDrawerTotal,
      auditDifference,
      auditStatus,
      auditMessage,
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

  async function deleteExpenseEntry(expenseId: string) {
    if (!expenseId.trim()) throw new Error('Expense id is required.')
    await deleteDoc(doc(db, 'cashouts', expenseId))
  }

  async function deletePurchaseEntry(purchaseId: string) {
    if (!purchaseId.trim()) throw new Error('Purchase id is required.')
    await deleteDoc(doc(db, 'purchases', purchaseId))
  }

  async function deletePaymentEntry(paymentId: string) {
    if (!paymentId.trim()) throw new Error('Payment id is required.')

    const { financeData, loans } = getState()
    const targetPayment = financeData.payments.find((payment) => payment.id === paymentId)
    if (!targetPayment) throw new Error('This payment record could not be found.')

    if (targetPayment.entryType === 'vendor-payment') {
      throw new Error('Vendor-payment delete is blocked for safety because historical allocation details are not stored on old records.')
    }

    if (targetPayment.entryType === 'loan-payment') {
      const remainingPayments = financeData.payments.filter((payment) => payment.id !== paymentId)
      const recomputedLoans = recomputeLoansForParty(loans, remainingPayments, targetPayment.partyName)
      const batch = writeBatch(db)

      batch.delete(doc(db, 'payments', paymentId))
      recomputedLoans.forEach((loan) => {
        batch.update(doc(db, 'loans', loan.id), {
          paidAmount: loan.paidAmount,
          remainingAmount: loan.remainingAmount,
          status: loan.status,
          updatedAt: loan.updatedAt ?? nowIso(),
          settledAt: loan.settledAt ?? deleteField(),
          notes: loan.notes ?? deleteField(),
        })
      })

      await batch.commit()
      return
    }

    await deleteDoc(doc(db, 'payments', paymentId))
  }

  async function deleteDailyCashoutEntry(entryId: string) {
    if (!entryId.trim()) throw new Error('Daily cashout id is required.')

    const { dailyCashouts } = getState()
    const targetEntry = dailyCashouts.find((entry) => entry.id === entryId)
    if (!targetEntry) throw new Error('This daily cashout record could not be found.')

    await deleteDoc(doc(db, 'dailyCashouts', entryId))
    await syncSalesForDate(
      targetEntry.date,
      dailyCashouts.filter((entry) => entry.id !== entryId),
    )
  }

  async function saveCashTransfer(draft: Omit<CashTransfer, 'id' | 'createdAt'>) {
    const transfer: CashTransfer = { ...draft, id: `cash-transfer-${crypto.randomUUID()}`, createdAt: nowIso() }
    await setDoc(doc(db, 'cashTransfers', transfer.id), {
      id: transfer.id,
      date: transfer.date,
      ...(transfer.fromUserId ? { fromUserId: transfer.fromUserId } : {}),
      toType: transfer.toType,
      ...(transfer.toUserId ? { toUserId: transfer.toUserId } : {}),
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

  async function deleteCashTransferEntry(transferId: string) {
    if (!transferId.trim()) throw new Error('Cash transfer id is required.')
    await deleteDoc(doc(db, 'cashTransfers', transferId))
  }

  async function deleteSettingsAuditEntry(entryId: string) {
    if (!entryId.trim()) throw new Error('Settings audit id is required.')
    await deleteDoc(doc(db, 'settingsAudit', entryId))
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
    deleteCashTransferEntry,
    deleteDailyCashoutEntry,
    deleteExpenseEntry,
    deleteLoanEntry,
    deletePlannedPayment,
    deletePaymentEntry,
    deletePurchaseEntry,
    deleteSettingsAuditEntry,
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
