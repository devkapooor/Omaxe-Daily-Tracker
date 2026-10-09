import { describe, expect, it } from 'vitest'
import { allocateLoanRepayment, allocateLoanRepaymentToLoan, loanPaiseToRupees, loanRupeesToPaise, normalizeLoanAmount, parseLoanAmount } from './loanMoney'

describe('loan money precision', () => {
  it('accepts positive rupee amounts with up to two decimal places', () => {
    expect(parseLoanAmount('1250.75')).toBe(1250.75)
    expect(parseLoanAmount('200')).toBe(200)
    expect(normalizeLoanAmount(0.1 + 0.2)).toBe(0.3)
  })

  it.each(['', '0', '0.00', '-1', '1.234', 'not an amount'])('rejects invalid loan amount %j', (value) => {
    expect(() => parseLoanAmount(value)).toThrow()
  })

  it('converts rupees to integer paise and back without floating-point drift', () => {
    expect(loanRupeesToPaise(0.1 + 0.2)).toBe(30)
    expect(loanPaiseToRupees(3035)).toBe(30.35)
  })

  it('allocates decimal repayments oldest-first and settles exact paise balances', () => {
    const loans = [
      { id: 'oldest', paidAmount: 0, remainingAmount: 10.1 },
      { id: 'next', paidAmount: 0, remainingAmount: 20.2 },
    ]

    expect(allocateLoanRepayment(loans, 10.15)).toEqual([
      { id: 'oldest', paidAmount: 10.1, remainingAmount: 0 },
      { id: 'next', paidAmount: 0.05, remainingAmount: 20.15 },
    ])
    expect(allocateLoanRepayment([{ id: 'only', paidAmount: 0, remainingAmount: 12.34 }], 12.34)).toEqual([
      { id: 'only', paidAmount: 12.34, remainingAmount: 0 },
    ])
  })

  it('rejects repayments exceeding the open balance by one paisa', () => {
    const loans = [{ id: 'only', paidAmount: 0, remainingAmount: 12.34 }]
    expect(() => allocateLoanRepayment(loans, 12.35)).toThrow('Loan payment exceeds the open loan balance')
  })

  it('applies a repayment only to the selected loan', () => {
    const loans = [
      { id: 'older', paidAmount: 0, remainingAmount: 100 },
      { id: 'selected', paidAmount: 0, remainingAmount: 50 },
    ]
    expect(allocateLoanRepaymentToLoan(loans, 'selected', 20)).toEqual([
      loans[0],
      { id: 'selected', paidAmount: 20, remainingAmount: 30 },
    ])
  })

  it('rejects a repayment larger than the selected loan even if another loan is open', () => {
    const loans = [
      { id: 'selected', paidAmount: 0, remainingAmount: 10 },
      { id: 'other', paidAmount: 0, remainingAmount: 90 },
    ]
    expect(() => allocateLoanRepaymentToLoan(loans, 'selected', 11)).toThrow('Loan payment exceeds the open loan balance')
  })
})
