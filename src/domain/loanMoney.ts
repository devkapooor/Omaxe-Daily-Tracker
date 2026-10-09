export type LoanBalanceAmounts = {
  paidAmount: number
  remainingAmount: number
}

export function loanRupeesToPaise(amount: number) {
  if (!Number.isFinite(amount)) throw new Error('Loan amount must be a finite number.')
  const paise = Math.round((amount + Number.EPSILON) * 100)
  if (!Number.isSafeInteger(paise)) throw new Error('Loan amount is too large to process safely.')
  return paise
}

export function loanPaiseToRupees(amountPaise: number) {
  if (!Number.isSafeInteger(amountPaise)) throw new Error('Loan amount in paise must be a safe integer.')
  return amountPaise / 100
}

export function normalizeLoanAmount(amount: number) {
  const amountPaise = loanRupeesToPaise(amount)
  if (amountPaise <= 0) throw new Error('Loan amount must be greater than zero.')
  return loanPaiseToRupees(amountPaise)
}

export function parseLoanAmount(value: FormDataEntryValue | string | null) {
  const raw = String(value ?? '').trim()
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) {
    throw new Error('Enter a positive amount with up to two decimal places.')
  }
  return normalizeLoanAmount(Number(raw))
}

/** Allocate a repayment oldest-first in integer paise to avoid fractional-rupee drift. */
export function allocateLoanRepayment<T extends LoanBalanceAmounts>(
  loans: T[],
  paymentAmount: number,
  overpaymentMessage = 'Loan payment exceeds the open loan balance for the selected person.',
) {
  const paymentPaise = loanRupeesToPaise(paymentAmount)
  if (paymentPaise < 0) throw new Error('Loan payment cannot be negative.')
  const openBalancePaise = loans.reduce((total, loan) => total + loanRupeesToPaise(loan.remainingAmount), 0)
  if (!Number.isSafeInteger(openBalancePaise)) throw new Error('Open loan balance is too large to process safely.')
  if (paymentPaise > openBalancePaise) throw new Error(overpaymentMessage)

  let remainingPaymentPaise = paymentPaise
  return loans.map((loan) => {
    const remainingPaise = loanRupeesToPaise(loan.remainingAmount)
    if (remainingPaymentPaise <= 0 || remainingPaise <= 0) return loan

    const appliedPaise = Math.min(remainingPaise, remainingPaymentPaise)
    const paidPaise = loanRupeesToPaise(loan.paidAmount) + appliedPaise
    remainingPaymentPaise -= appliedPaise
    return {
      ...loan,
      paidAmount: loanPaiseToRupees(paidPaise),
      remainingAmount: loanPaiseToRupees(remainingPaise - appliedPaise),
    }
  })
}

/** Apply a repayment only to the loan explicitly selected by the user. */
export function allocateLoanRepaymentToLoan<T extends LoanBalanceAmounts & { id: string }>(
  loans: T[],
  loanId: string,
  paymentAmount: number,
) {
  const index = loans.findIndex((loan) => loan.id === loanId)
  if (index < 0) throw new Error('The selected loan could not be found.')
  const next = [...loans]
  next[index] = allocateLoanRepayment([loans[index]], paymentAmount)[0]
  return next
}
