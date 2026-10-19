import { postFinanceOperation } from '@/features/register/data/financeRepository'
import { deleteDoc, deleteField, doc, getDocFromServer, setDoc, writeBatch } from 'firebase/firestore'
import { db } from '@/shared/lib/firebase'
import type { CashoutDraft, DailySales, Payment, PaymentDraft, PurchaseDraft } from '@/domain/financeTypes'
import type { CashTransfer, DailyCashoutEntry, LoanEntry, VendorRecord } from '@/domain/appTypes'
import { allocateLoanRepayment, allocateLoanRepaymentToLoan, loanRupeesToPaise, normalizeLoanAmount } from '@/domain/loanMoney'
import type { NameDirectoryType, StoreCollectionState } from '@/store/storeShared'
import {
  normalizeLoanRecord,
  normalizeName,
  nowIso,
} from '@/store/storeShared'
import { createCashoutCorrectionActions } from '@/store/actions/createCashoutCorrectionActions'
import { rupeesToPaise } from '@/features/pos/domain/posDomain'

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

export function createFinanceActions({ ensureNameInDirectory, getState }: FinanceActionArgs) {
  const cashoutCorrectionActions = createCashoutCorrectionActions({ getState })

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
          normalizeName(payment.partyName).toLowerCase() === normalizedPartyName,
      ),
    )

    let loanState: LoanEntry[] = matchingLoans.map((loan) => ({
      ...loan,
      paidAmount: 0,
      remainingAmount: loan.amount,
      status: 'Open',
      settledAt: undefined,
      updatedAt: loan.updatedAt ?? loan.createdAt,
    }))

    for (const payment of matchingPayments) {
      const previousState = loanState
      let nextState: LoanEntry[]
      if (payment.loanId) {
        if (!previousState.some((loan) => loan.id === payment.loanId)) throw new Error(`Cannot safely recompute ${partyName}'s loans because a repayment references a missing loan.`)
        nextState = allocateLoanRepaymentToLoan(previousState, payment.loanId, payment.amount)
      } else {
        nextState = allocateLoanRepayment(
          previousState,
          payment.amount,
          `Cannot safely recompute loans for ${partyName} because repayment history exceeds the surviving loan balance.`,
        )
      }
      const paymentTimestamp = payment.updatedAt ?? payment.createdAt
      loanState = nextState.map((loan, index) => {
        if (loan.paidAmount === previousState[index].paidAmount) return loan
        return {
          ...loan,
          status: loan.remainingAmount > 0 ? 'Open' : 'Settled',
          settledAt: loan.remainingAmount > 0 ? undefined : paymentTimestamp,
          updatedAt: paymentTimestamp,
        }
      })
    }

    return loanState
  }

  async function saveSales(_draft: Omit<DailySales, 'id' | 'createdAt' | 'updatedAt'>) { void _draft; throw new Error('Sales are posted from trusted Cashout. Manual browser sales posting is retired.') }

  async function savePurchase(_draft: PurchaseDraft) { void _draft; throw new Error('Receive stock through the Stock workspace. Legacy manual purchase posting is retired.') }

  async function saveVendor(_input: Omit<VendorRecord, 'id' | 'createdAt' | 'updatedAt'>) { void _input; throw new Error('Create and manage vendors through Vendor Workspace.') }

  async function saveCashout(draft: CashoutDraft) { const modes = { Cash:'cash', UPI:'upi', Card:'card', 'Bank Transfer':'bank-transfer', Cheque:'cheque' }; await postFinanceOperation('expense',{amountPaise:rupeesToPaise(draft.amount),category:draft.category,paidTo:draft.paidTo,mode:modes[draft.paymentMode],notes:draft.notes,...(draft.paymentMode==='Cheque'?{chequeNumber:draft.chequeNumber,chequeDate:draft.chequePayDate}: {})}) }

  async function savePayment(draft: PaymentDraft) {
    const id = `payment-${crypto.randomUUID()}`
    const timestamp = nowIso()
    const normalizedPartyName = normalizeName(draft.partyName)
    const paymentRecord = withoutUndefined({ ...draft, partyName: normalizedPartyName, createdAt: timestamp, updatedAt: timestamp })

    if (draft.type === 'Paid' && draft.entryType === 'loan-payment') {
      if (!draft.loanId?.trim()) throw new Error('Select the specific loan this repayment should reduce.')
      const normalizedAmount = normalizeLoanAmount(draft.amount)
      const normalizedPaymentRecord = { ...paymentRecord, amount: normalizedAmount }
      const { loans } = getState()
      const selectedLoan = loans
        .map((loan) => normalizeLoanRecord(loan))
        .find((loan) => loan.id === draft.loanId)

      if (!selectedLoan || selectedLoan.remainingAmount <= 0) throw new Error('The selected loan is no longer open. Refresh and select an open loan.')
      if (normalizeName(selectedLoan.personName).toLowerCase() !== normalizedPartyName.toLowerCase()) throw new Error('The selected loan does not belong to the chosen party.')
      if (loanRupeesToPaise(normalizedAmount) > loanRupeesToPaise(selectedLoan.remainingAmount)) throw new Error('Repayment exceeds the remaining balance of the selected loan.')

      const batch = writeBatch(db)
      batch.set(doc(db, 'payments', id), normalizedPaymentRecord)
      const [updatedLoan] = allocateLoanRepaymentToLoan([selectedLoan], selectedLoan.id, normalizedAmount)
      batch.update(doc(db, 'loans', selectedLoan.id), {
        paidAmount: updatedLoan.paidAmount,
        remainingAmount: updatedLoan.remainingAmount,
        status: updatedLoan.remainingAmount > 0 ? 'Open' : 'Settled',
        settledAt: updatedLoan.remainingAmount > 0 ? null : timestamp,
        updatedAt: timestamp,
      })

      await batch.commit()
      return
    }

    throw new Error('Record vendor payments through Register. Legacy payment posting is retired.')
  }

  async function saveLoanEntry(draft: Omit<LoanEntry, 'id' | 'createdAt' | 'paidAmount' | 'remainingAmount' | 'status' | 'settledAt' | 'updatedAt'>) {
    const id = `loan-${crypto.randomUUID()}`
    const timestamp = nowIso()
    const amount = normalizeLoanAmount(draft.amount)
    await setDoc(doc(db, 'loans', id), {
      ...draft,
      amount,
      paidAmount: 0,
      remainingAmount: amount,
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
    if (financeData.payments.some((payment) => payment.entryType === 'loan-payment' && payment.loanId === loanId)) {
      throw new Error('This loan has repayments linked to it. Remove or correct those repayment entries first; the loan cannot be deleted safely.')
    }

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

  async function saveDailyCashoutEntry(draft: Omit<DailyCashoutEntry, 'id' | 'createdAt'>) { if(!draft.financeQuoteId)throw new Error('Start a fresh trusted Cashout count before closing.'); await postFinanceOperation('cashout-close',{quoteId:draft.financeQuoteId,drawerDenominations:draft.drawerDenominations,creditSales:draft.creditSales,reason:draft.discrepancyReason||''}) }

  async function deleteExpenseEntry(expenseId: string) { const expense=await getDocFromServer(doc(db,'cashouts',expenseId));if(!expense.exists())throw new Error('Expense not found.');await postFinanceOperation('expense-cancel',{expenseId,expectedRevision:expense.get('revision')||1,reason:'Owner requested audited cancellation from Logs.'}) }

  async function deletePurchaseEntry(_purchaseId: string) { void _purchaseId; throw new Error('Purchase history is preserved. Use its authorised source reversal.') }

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

  async function deleteDailyCashoutEntry(_entryId: string) { void _entryId; throw new Error('Financial Cashout history cannot be erased. Use the audited correction workflow.') }

  async function saveCashTransfer(draft: Omit<CashTransfer, 'id' | 'createdAt'>) { const {date,fromUserId,toType,toUserId,bankDepositMethod,amount,reason}=draft;await postFinanceOperation('cash-transfer',{date,fromUserId,toType,toUserId,bankDepositMethod,amount,reason}) }

  async function deleteCashTransferEntry(transferId: string) {
    if (!transferId.trim()) throw new Error('Cash transfer id is required.')
    throw new Error(`Cash movements are preserved for audit. Record a reverse transfer instead of deleting ${transferId}.`)
  }

  async function deleteSettingsAuditEntry(entryId: string) {
    if (!entryId.trim()) throw new Error('Settings audit id is required.')
    await deleteDoc(doc(db, 'settingsAudit', entryId))
  }

  async function importLegacyData(): Promise<boolean> { throw new Error('Legacy financial imports require a separately approved trusted migration. No data was changed.') }

  return {
    ...cashoutCorrectionActions,
    deleteCashTransferEntry,
    deleteDailyCashoutEntry,
    deleteExpenseEntry,
    deleteLoanEntry,
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
    savePurchase,
    saveSales,
    saveVendor,
  }
}
