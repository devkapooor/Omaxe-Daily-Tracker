import { useState } from 'react'
import type { Cashout } from '@/domain/financeTypes'

export function useChequeDetails(setError: (value: string) => void) {
  const [paymentMode, setPaymentMode] = useState<Cashout['paymentMode']>('Cash')
  const [chequeNumber, setChequeNumber] = useState('')
  const [chequePayDate, setChequePayDate] = useState('')
  const [isChequeModalOpen, setIsChequeModalOpen] = useState(false)

  const isChequeMode = paymentMode === 'Cheque'

  function resetChequeDetails() {
    setPaymentMode('Cash')
    setChequeNumber('')
    setChequePayDate('')
    setIsChequeModalOpen(false)
  }

  function handlePaymentModeChange(nextMode: Cashout['paymentMode']) {
    setPaymentMode(nextMode)
    setError('')
    if (nextMode === 'Cheque') {
      setIsChequeModalOpen(true)
      return
    }

    setChequeNumber('')
    setChequePayDate('')
  }

  function ensureChequeDetails() {
    if (!isChequeMode) return true
    if (chequeNumber.trim() && chequePayDate) return true

    setError('Cheque details are required before saving.')
    setIsChequeModalOpen(true)
    return false
  }

  function confirmChequeDetails() {
    if (!chequeNumber.trim() || !chequePayDate) {
      setError('Cheque number and pay date are required.')
      return false
    }

    setIsChequeModalOpen(false)
    setError('')
    return true
  }

  return {
    paymentMode,
    chequeNumber,
    chequePayDate,
    isChequeModalOpen,
    isChequeMode,
    setChequeNumber,
    setChequePayDate,
    setIsChequeModalOpen,
    handlePaymentModeChange,
    ensureChequeDetails,
    confirmChequeDetails,
    resetChequeDetails,
  }
}
