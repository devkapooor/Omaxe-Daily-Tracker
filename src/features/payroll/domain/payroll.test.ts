import { describe, expect, it } from 'vitest'
import {
  calculateSalary,
  deriveSalaryPaymentSummary,
  formatPayrollMinutes,
  hoursAndMinutesToMinutes,
  payrollCalendarDays,
  rupeesToPayrollPaise,
  selectPayrollTerm,
  type PayrollTerm,
} from './payroll'

const baseInput = {
  payrollMonth: '2026-09',
  monthlySalaryPaise: 3_000_000,
  requiredDailyMinutes: 8 * 60,
  paidWeeklyOffDays: 4,
  workedMinutes: 200 * 60,
  paidLeaveMinutes: 0,
  earnings: [],
  deductions: [],
}

describe('payroll calculations', () => {
  it('supports every month length including leap years', () => {
    expect(payrollCalendarDays('2026-02')).toBe(28)
    expect(payrollCalendarDays('2028-02')).toBe(29)
    expect(payrollCalendarDays('2026-09')).toBe(30)
    expect(payrollCalendarDays('2026-10')).toBe(31)
  })

  it('credits four paid weekly offs into payable time', () => {
    const result = calculateSalary(baseInput)
    expect(result.expectedMinutes).toBe(240 * 60)
    expect(result.weeklyOffMinutes).toBe(32 * 60)
    expect(result.payableMinutes).toBe(232 * 60)
    expect(result.basePayPaise).toBe(2_900_000)
  })

  it('adds paid leave, earnings, and deductions', () => {
    const result = calculateSalary({
      ...baseInput,
      paidLeaveMinutes: 8 * 60,
      earnings: [{ id: 'bonus', label: 'Bonus', amountPaise: 50_000 }],
      deductions: [{ id: 'advance', label: 'Advance', amountPaise: 20_000 }],
    })
    expect(result.basePayPaise).toBe(3_000_000)
    expect(result.netPayPaise).toBe(3_030_000)
  })

  it('pays additional approved hours at the same rate', () => {
    const result = calculateSalary({ ...baseInput, workedMinutes: 216 * 60 })
    expect(result.payableMinutes).toBe(248 * 60)
    expect(result.basePayPaise).toBe(3_100_000)
  })

  it('blocks a negative net salary', () => {
    expect(() => calculateSalary({
      ...baseInput,
      deductions: [{ id: 'deduction', label: 'Deduction', amountPaise: 3_000_001 }],
    })).toThrow(/negative/)
  })

  it('requires valid whole-minute and paise inputs', () => {
    expect(() => calculateSalary({ ...baseInput, workedMinutes: 1.5 })).toThrow(/whole number/)
    expect(hoursAndMinutesToMinutes(12, 30)).toBe(750)
    expect(() => hoursAndMinutesToMinutes(12, 60)).toThrow(/between 0 and 59/)
    expect(formatPayrollMinutes(750)).toBe('12h 30m')
    expect(rupeesToPayrollPaise(1234.56)).toBe(123_456)
  })
})

describe('payroll terms and payment state', () => {
  const terms: PayrollTerm[] = [
    { id: 'old', employeeUserId: 'staff-1', effectiveFromMonth: '2026-01', monthlySalaryPaise: 2_000_000, requiredDailyMinutes: 480, revision: 1, auditEventId: 'event-old', createdAt: '2026-01-01', createdByUid: 'owner', createdByName: 'Owner' },
    { id: 'sept-v1', employeeUserId: 'staff-1', effectiveFromMonth: '2026-09', monthlySalaryPaise: 2_500_000, requiredDailyMinutes: 480, revision: 1, auditEventId: 'event-v1', createdAt: '2026-09-01', createdByUid: 'owner', createdByName: 'Owner' },
    { id: 'sept-v2', employeeUserId: 'staff-1', effectiveFromMonth: '2026-09', monthlySalaryPaise: 2_600_000, requiredDailyMinutes: 420, revision: 2, auditEventId: 'event-v2', supersedesTermId: 'sept-v1', createdAt: '2026-09-02', createdByUid: 'owner', createdByName: 'Owner' },
  ]

  it('selects the latest term effective for September', () => {
    expect(selectPayrollTerm(terms, 'staff-1', '2026-08')?.id).toBe('old')
    expect(selectPayrollTerm(terms, 'staff-1', '2026-09')?.id).toBe('sept-v2')
  })

  it('derives unpaid, paid, additional due, and overpaid states', () => {
    expect(deriveSalaryPaymentSummary(100_000, 0).state).toBe('unpaid')
    expect(deriveSalaryPaymentSummary(100_000, 100_000).state).toBe('paid')
    expect(deriveSalaryPaymentSummary(120_000, 100_000)).toMatchObject({ state: 'additional-due', outstandingPaise: 20_000 })
    expect(deriveSalaryPaymentSummary(90_000, 100_000)).toMatchObject({ state: 'overpaid', overpaidPaise: 10_000 })
  })
})
