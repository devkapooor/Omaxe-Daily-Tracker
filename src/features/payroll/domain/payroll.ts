export type PayrollPaymentMethod = 'Cash' | 'Bank Transfer' | 'UPI' | 'Other'

export type PayrollAdjustment = {
  id: string
  label: string
  amountPaise: number
}

export type PayrollIssuer = {
  name: string
  address?: string
  contact?: string
}

export type PayrollTerm = {
  id: string
  employeeUserId: string
  effectiveFromMonth: string
  monthlySalaryPaise: number
  requiredDailyMinutes: number
  revision: number
  supersedesTermId?: string
  createdAt: string
  createdByUid: string
  createdByName: string
}

export type SalaryCalculationInput = {
  payrollMonth: string
  monthlySalaryPaise: number
  requiredDailyMinutes: number
  paidWeeklyOffDays: number
  workedMinutes: number
  paidLeaveMinutes: number
  earnings: PayrollAdjustment[]
  deductions: PayrollAdjustment[]
}

export type SalaryCalculation = SalaryCalculationInput & {
  calendarDays: number
  expectedMinutes: number
  weeklyOffMinutes: number
  payableMinutes: number
  basePayPaise: number
  earningsPaise: number
  deductionsPaise: number
  netPayPaise: number
}

export type SalaryPaymentState = 'unpaid' | 'paid' | 'additional-due' | 'overpaid'

export type SalaryPaymentSummary = {
  state: SalaryPaymentState
  totalPaidPaise: number
  outstandingPaise: number
  overpaidPaise: number
}

function requireSafeInteger(value: number, label: string, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${label} must be a whole number of at least ${minimum}.`)
  }
}

export function isPayrollMonth(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) return false
  const [year, month] = value.split('-').map(Number)
  return year >= 2000 && month >= 1 && month <= 12
}

export function payrollCalendarDays(month: string) {
  if (!isPayrollMonth(month)) throw new Error('Choose a valid payroll month.')
  const [year, monthNumber] = month.split('-').map(Number)
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
}

function validateAdjustments(entries: PayrollAdjustment[], label: string) {
  const ids = new Set<string>()
  entries.forEach((entry) => {
    if (!entry.id.trim()) throw new Error(`${label} entry id is required.`)
    if (!entry.label.trim()) throw new Error(`${label} label is required.`)
    if (ids.has(entry.id)) throw new Error(`${label} entry ids must be unique.`)
    requireSafeInteger(entry.amountPaise, `${label} amount`, 1)
    ids.add(entry.id)
  })
}

function sumAdjustments(entries: PayrollAdjustment[]) {
  return entries.reduce((total, entry) => {
    const next = total + entry.amountPaise
    if (!Number.isSafeInteger(next)) throw new Error('Payroll adjustment total is too large.')
    return next
  }, 0)
}

export function calculateSalary(input: SalaryCalculationInput): SalaryCalculation {
  const calendarDays = payrollCalendarDays(input.payrollMonth)
  requireSafeInteger(input.monthlySalaryPaise, 'Monthly salary', 1)
  requireSafeInteger(input.requiredDailyMinutes, 'Required daily minutes', 1)
  if (input.requiredDailyMinutes > 24 * 60) throw new Error('Required daily minutes cannot exceed 24 hours.')
  requireSafeInteger(input.paidWeeklyOffDays, 'Paid weekly off days')
  if (input.paidWeeklyOffDays > calendarDays) throw new Error('Paid weekly off days cannot exceed the calendar days in the month.')
  requireSafeInteger(input.workedMinutes, 'Worked minutes')
  requireSafeInteger(input.paidLeaveMinutes, 'Paid leave minutes')
  validateAdjustments(input.earnings, 'Earning')
  validateAdjustments(input.deductions, 'Deduction')

  const expectedMinutes = calendarDays * input.requiredDailyMinutes
  const weeklyOffMinutes = input.paidWeeklyOffDays * input.requiredDailyMinutes
  const payableMinutes = input.workedMinutes + input.paidLeaveMinutes + weeklyOffMinutes
  const basePayPaise = Math.round((input.monthlySalaryPaise * payableMinutes) / expectedMinutes)
  if (!Number.isSafeInteger(basePayPaise)) throw new Error('Calculated base salary is too large.')

  const earningsPaise = sumAdjustments(input.earnings)
  const deductionsPaise = sumAdjustments(input.deductions)
  const netPayPaise = basePayPaise + earningsPaise - deductionsPaise
  if (!Number.isSafeInteger(netPayPaise)) throw new Error('Calculated net salary is too large.')
  if (netPayPaise < 0) throw new Error('Deductions cannot make net salary negative.')

  return {
    ...input,
    calendarDays,
    expectedMinutes,
    weeklyOffMinutes,
    payableMinutes,
    basePayPaise,
    earningsPaise,
    deductionsPaise,
    netPayPaise,
  }
}

export function selectPayrollTerm(terms: PayrollTerm[], employeeUserId: string, payrollMonth: string) {
  if (!isPayrollMonth(payrollMonth)) throw new Error('Choose a valid payroll month.')
  return terms
    .filter((term) => term.employeeUserId === employeeUserId && term.effectiveFromMonth <= payrollMonth)
    .sort((left, right) => {
      const monthOrder = right.effectiveFromMonth.localeCompare(left.effectiveFromMonth)
      if (monthOrder !== 0) return monthOrder
      return right.revision - left.revision
    })[0] ?? null
}

export function deriveSalaryPaymentSummary(netPayPaise: number, totalPaidPaise: number): SalaryPaymentSummary {
  requireSafeInteger(netPayPaise, 'Net salary')
  requireSafeInteger(totalPaidPaise, 'Total paid')
  if (totalPaidPaise === 0) {
    return { state: 'unpaid', totalPaidPaise, outstandingPaise: netPayPaise, overpaidPaise: 0 }
  }
  if (totalPaidPaise === netPayPaise) {
    return { state: 'paid', totalPaidPaise, outstandingPaise: 0, overpaidPaise: 0 }
  }
  if (totalPaidPaise < netPayPaise) {
    return { state: 'additional-due', totalPaidPaise, outstandingPaise: netPayPaise - totalPaidPaise, overpaidPaise: 0 }
  }
  return { state: 'overpaid', totalPaidPaise, outstandingPaise: 0, overpaidPaise: totalPaidPaise - netPayPaise }
}

export function hoursAndMinutesToMinutes(hours: number, minutes: number) {
  requireSafeInteger(hours, 'Hours')
  requireSafeInteger(minutes, 'Minutes')
  if (minutes > 59) throw new Error('Minutes must be between 0 and 59.')
  return hours * 60 + minutes
}

export function formatPayrollMinutes(totalMinutes: number) {
  requireSafeInteger(totalMinutes, 'Total minutes')
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${hours}h ${String(minutes).padStart(2, '0')}m`
}

export function rupeesToPayrollPaise(rupees: number) {
  if (!Number.isFinite(rupees) || rupees < 0) throw new Error('Amount must be zero or greater.')
  const paise = Math.round((rupees + Number.EPSILON) * 100)
  requireSafeInteger(paise, 'Amount')
  return paise
}

