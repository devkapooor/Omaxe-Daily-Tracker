import { useEffect, useState } from 'react'
import type { AppUser } from '@/domain/financeTypes'
import type {
  PayrollMonth,
  PayrollProfile,
  PayrollSettings,
  PayrollTerm,
  SalaryDraft,
  SalarySlip,
} from '@/features/payroll/domain/payroll'
import {
  subscribeEmployeeSalarySlips,
  subscribePayrollDrafts,
  subscribePayrollMonth,
  subscribePayrollProfiles,
  subscribePayrollSettings,
  subscribePayrollSlipsForMonth,
  subscribePayrollTerms,
} from '@/features/payroll/data/payrollRepository'

type OwnerPayrollData = {
  settings: PayrollSettings | null
  profiles: PayrollProfile[]
  terms: PayrollTerm[]
  month: PayrollMonth | null
  drafts: SalaryDraft[]
  slips: SalarySlip[]
}

const emptyOwnerData: OwnerPayrollData = {
  settings: null,
  profiles: [],
  terms: [],
  month: null,
  drafts: [],
  slips: [],
}

export function usePayroll(currentUser: AppUser, payrollMonth: string) {
  const [data, setData] = useState<OwnerPayrollData>(emptyOwnerData)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const onError = (cause: Error) => {
      setError(cause.message || 'Unable to load payroll.')
      setLoading(false)
    }
    if (currentUser.role !== 'owner') {
      return subscribeEmployeeSalarySlips(currentUser.id, (slips) => {
        setData({ ...emptyOwnerData, slips })
        setError('')
        setLoading(false)
      }, onError)
    }

    const readySources = new Set<string>()
    const ready = (source: string) => {
      readySources.add(source)
      setError('')
      if (readySources.size >= 6) setLoading(false)
    }
    const unsubscribers = [
      subscribePayrollSettings((settings) => { setData((current) => ({ ...current, settings })); ready('settings') }, onError),
      subscribePayrollProfiles((profiles) => { setData((current) => ({ ...current, profiles })); ready('profiles') }, onError),
      subscribePayrollTerms((terms) => { setData((current) => ({ ...current, terms })); ready('terms') }, onError),
      subscribePayrollMonth(payrollMonth, (month) => { setData((current) => ({ ...current, month })); ready('month') }, onError),
      subscribePayrollDrafts(payrollMonth, (drafts) => { setData((current) => ({ ...current, drafts })); ready('drafts') }, onError),
      subscribePayrollSlipsForMonth(payrollMonth, (slips) => { setData((current) => ({ ...current, slips })); ready('slips') }, onError),
    ]
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe())
  }, [currentUser.id, currentUser.role, payrollMonth])

  return { ...data, loading, error }
}
