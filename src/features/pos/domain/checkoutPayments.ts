import { rupeesToPaise, validateSettlement } from './posDomain'
import type { PosPaymentAllocation, PosPaymentMethod } from './types'

export type CheckoutPaymentMode = PosPaymentMethod | 'split'
export type SplitPaymentAmounts = Record<PosPaymentMethod, string>
export const checkoutPaymentMethods: Array<{ value: PosPaymentMethod; label: string }> = [
  { value: 'cash', label: 'Cash' }, { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' }, { value: 'bank-transfer', label: 'Bank Transfer' },
]
export const emptySplitPayments = (): SplitPaymentAmounts => ({ cash: '', upi: '', card: '', 'bank-transfer': '' })

export function buildCheckoutPayment(totalPaise: number, mode: CheckoutPaymentMode, split: SplitPaymentAmounts, cashReceived?: string) {
  const payments: PosPaymentAllocation[] = mode === 'split'
    ? checkoutPaymentMethods.map(({ value: method }) => {
      const amountPaise = rupeesToPaise(Number(split[method] || 0))
      if (amountPaise < 0) throw new Error('Payment amounts cannot be negative.')
      return { method, amountPaise }
    }).filter((payment) => payment.amountPaise > 0)
    : [{ method: mode, amountPaise: totalPaise }]
  if (mode === 'split' && payments.length < 2) throw new Error('Choose at least two payment methods for a split payment.')
  validateSettlement(totalPaise, payments)
  const cashPaise = payments.find((payment) => payment.method === 'cash')?.amountPaise ?? 0
  if (cashPaise === 0) return { payments, cashPaise, cashChangePaise: 0 }
  if (cashReceived !== undefined && !cashReceived.trim()) throw new Error('Enter the cash received from the customer.')
  const cashTenderedPaise = cashReceived === undefined ? cashPaise : rupeesToPaise(Number(cashReceived))
  if (cashTenderedPaise < cashPaise) throw new Error('Cash received is less than the cash amount due.')
  return { payments, cashPaise, cashTenderedPaise, cashChangePaise: cashTenderedPaise - cashPaise }
}
