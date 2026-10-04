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
  monthDataMonth: string | null
}

const emptyOwnerData: OwnerPayrollData = {
  settings: null,
  profiles: [],
  terms: [],
  month: null,
  drafts: [],
  slips: [],
  monthDataMonth: null,
}

export function usePayroll(currentUser: AppUser, payrollMonth: string) {
  const [data, setData] = useState<OwnerPayrollData>(emptyOwnerData)
  const [loading, setLoading] = useState(true)
  const [readyMonth, setReadyMonth] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const onError = (cause: Error) => {
      if (!active) return
      setError(cause.message || 'Unable to load payroll.')
      setLoading(false)
    }
    if (currentUser.role !== 'owner') {
      return subscribeEmployeeSalarySlips(currentUser.id, (slips) => {
        if (!active) return
        setData({ ...emptyOwnerData, slips })
        setError('')
        setLoading(false)
      }, onError)
    }

    const readySources = new Set<string>()
    const readyMonthSources = new Set<string>()
    const ready = (source: string) => {
      if (!active) return
      readySources.add(source)
      setError('')
      if (readySources.size >= 6) setLoading(false)
    }
    const readyMonthData = (source: string) => {
      if (!active) return
      readyMonthSources.add(source)
      if (readyMonthSources.size === 3) {
        setData((current) => ({ ...current, monthDataMonth: payrollMonth }))
        setReadyMonth(payrollMonth)
      }
    }
    const unsubscribers = [
      subscribePayrollSettings((settings) => { setData((current) => ({ ...current, settings })); ready('settings') }, onError),
      subscribePayrollProfiles((profiles) => { setData((current) => ({ ...current, profiles })); ready('profiles') }, onError),
      subscribePayrollTerms((terms) => { setData((current) => ({ ...current, terms })); ready('terms') }, onError),
      subscribePayrollMonth(payrollMonth, (month) => { if (!active) return; setData((current) => ({ ...current, month })); ready('month'); readyMonthData('month') }, onError),
      subscribePayrollDrafts(payrollMonth, (drafts) => { if (!active) return; setData((current) => ({ ...current, drafts })); ready('drafts'); readyMonthData('drafts') }, onError),
      subscribePayrollSlipsForMonth(payrollMonth, (slips) => { if (!active) return; setData((current) => ({ ...current, slips })); ready('slips'); readyMonthData('slips') }, onError),
    ]
    return () => {
      active = false
      unsubscribers.forEach((unsubscribe) => unsubscribe())
    }
  }, [currentUser.id, currentUser.role, payrollMonth])

  const monthDataIsCurrent = data.monthDataMonth === payrollMonth
  return {
    ...data,
    month: monthDataIsCurrent ? data.month : null,
    drafts: monthDataIsCurrent ? data.drafts : [],
    slips: monthDataIsCurrent ? data.slips : [],
    loading: loading || (currentUser.role === 'owner' && (readyMonth !== payrollMonth || !monthDataIsCurrent) && !error),
    error,
  }
}
