import {
  calculateSalary,
  type PayrollAdjustment,
  type PayrollEvent,
  type PayrollMonth,
  type PayrollProfile,
  type PayrollSettings,
  type PayrollTerm,
  type SalaryCalculation,
  type SalaryDraft,
  type SalarySlip,
  type SalarySlipRevision,
} from '@/features/payroll/domain/payroll'

type UnknownRecord = Record<string, unknown>

function record(value: unknown, label: string): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${label} record.`)
  return value as UnknownRecord
}

function stringValue(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid ${label}.`)
  return value
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function integerValue(value: unknown, label: string, minimum = 0) {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) throw new Error(`Invalid ${label}.`)
  return value as number
}

function booleanValue(value: unknown, label: string) {
  if (typeof value !== 'boolean') throw new Error(`Invalid ${label}.`)
  return value
}

export function payrollTimestamp(value: unknown) {
  if (typeof value === 'string' && value) return value
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString()
  }
  throw new Error('Invalid payroll timestamp.')
}

function adjustments(value: unknown, label: string): PayrollAdjustment[] {
  if (!Array.isArray(value)) throw new Error(`Invalid ${label}.`)
  return value.map((item) => {
    const data = record(item, label)
    return {
      id: stringValue(data.id, `${label} id`),
      label: stringValue(data.label, `${label} label`),
      amountPaise: integerValue(data.amountPaise, `${label} amount`, 1),
    }
  })
}

function issuer(value: unknown) {
  const data = record(value, 'payroll issuer')
  return {
    name: stringValue(data.name, 'payroll issuer name'),
    ...(optionalString(data.address) ? { address: optionalString(data.address) } : {}),
    ...(optionalString(data.contact) ? { contact: optionalString(data.contact) } : {}),
  }
}

export function parsePayrollSettings(value: unknown): PayrollSettings {
  const data = record(value, 'payroll settings')
  return {
    issuer: issuer(data.issuer),
    defaultPaidWeeklyOffDays: integerValue(data.defaultPaidWeeklyOffDays, 'default paid weekly off days'),
    lastEventId: stringValue(data.lastEventId, 'settings event id'),
    updatedAt: payrollTimestamp(data.updatedAt),
    updatedByUid: stringValue(data.updatedByUid, 'settings actor uid'),
    updatedByName: stringValue(data.updatedByName, 'settings actor name'),
  }
}

export function parsePayrollProfile(value: unknown): PayrollProfile {
  const data = record(value, 'payroll profile')
  return {
    employeeUserId: stringValue(data.employeeUserId, 'employee uid'),
    enabled: booleanValue(data.enabled, 'payroll profile status'),
    lastEventId: stringValue(data.lastEventId, 'profile event id'),
    createdAt: payrollTimestamp(data.createdAt),
    createdByUid: stringValue(data.createdByUid, 'profile creator uid'),
    createdByName: stringValue(data.createdByName, 'profile creator name'),
    updatedAt: payrollTimestamp(data.updatedAt),
    updatedByUid: stringValue(data.updatedByUid, 'profile actor uid'),
    updatedByName: stringValue(data.updatedByName, 'profile actor name'),
  }
}

export function parsePayrollTerm(value: unknown): PayrollTerm {
  const data = record(value, 'payroll term')
  return {
    id: stringValue(data.id, 'payroll term id'),
    employeeUserId: stringValue(data.employeeUserId, 'employee uid'),
    effectiveFromMonth: stringValue(data.effectiveFromMonth, 'effective month'),
    monthlySalaryPaise: integerValue(data.monthlySalaryPaise, 'monthly salary', 1),
    requiredDailyMinutes: integerValue(data.requiredDailyMinutes, 'required daily minutes', 1),
    revision: integerValue(data.revision, 'term revision', 1),
    auditEventId: stringValue(data.auditEventId, 'term event id'),
    ...(optionalString(data.supersedesTermId) ? { supersedesTermId: optionalString(data.supersedesTermId) } : {}),
    createdAt: payrollTimestamp(data.createdAt),
    createdByUid: stringValue(data.createdByUid, 'term creator uid'),
    createdByName: stringValue(data.createdByName, 'term creator name'),
  }
}

export function parsePayrollMonth(value: unknown): PayrollMonth {
  const data = record(value, 'payroll month')
  return {
    id: stringValue(data.id, 'payroll month id'),
    payrollMonth: stringValue(data.payrollMonth, 'payroll month'),
    paidWeeklyOffDays: integerValue(data.paidWeeklyOffDays, 'paid weekly off days'),
    finalizedSlipCount: integerValue(data.finalizedSlipCount, 'finalized slip count'),
    lastEventId: stringValue(data.lastEventId, 'month event id'),
    ...(data.lockedAt ? { lockedAt: payrollTimestamp(data.lockedAt) } : {}),
    createdAt: payrollTimestamp(data.createdAt),
    createdByUid: stringValue(data.createdByUid, 'month creator uid'),
    createdByName: stringValue(data.createdByName, 'month creator name'),
    updatedAt: payrollTimestamp(data.updatedAt),
    updatedByUid: stringValue(data.updatedByUid, 'month actor uid'),
    updatedByName: stringValue(data.updatedByName, 'month actor name'),
  }
}

export function parseSalaryDraft(value: unknown): SalaryDraft {
  const data = record(value, 'salary draft')
  const role = stringValue(data.employeeRole, 'employee role')
  if (role !== 'manager' && role !== 'billing') throw new Error('Invalid payroll employee role.')
  return {
    id: stringValue(data.id, 'salary draft id'),
    employeeUserId: stringValue(data.employeeUserId, 'employee uid'),
    employeeName: stringValue(data.employeeName, 'employee name'),
    employeeRole: role,
    payrollMonth: stringValue(data.payrollMonth, 'payroll month'),
    termId: stringValue(data.termId, 'payroll term id'),
    paidWeeklyOffDays: integerValue(data.paidWeeklyOffDays, 'paid weekly off days'),
    workedMinutes: integerValue(data.workedMinutes, 'worked minutes'),
    paidLeaveMinutes: integerValue(data.paidLeaveMinutes, 'paid leave minutes'),
    earnings: adjustments(data.earnings, 'earnings'),
    deductions: adjustments(data.deductions, 'deductions'),
    createdAt: payrollTimestamp(data.createdAt),
    createdByUid: stringValue(data.createdByUid, 'draft creator uid'),
    createdByName: stringValue(data.createdByName, 'draft creator name'),
    updatedAt: payrollTimestamp(data.updatedAt),
    updatedByUid: stringValue(data.updatedByUid, 'draft actor uid'),
    updatedByName: stringValue(data.updatedByName, 'draft actor name'),
  }
}

function calculation(value: unknown): SalaryCalculation {
  const data = record(value, 'salary calculation')
  const input = {
    payrollMonth: stringValue(data.payrollMonth, 'calculation month'),
    monthlySalaryPaise: integerValue(data.monthlySalaryPaise, 'calculation salary', 1),
    requiredDailyMinutes: integerValue(data.requiredDailyMinutes, 'calculation daily minutes', 1),
    paidWeeklyOffDays: integerValue(data.paidWeeklyOffDays, 'calculation weekly offs'),
    workedMinutes: integerValue(data.workedMinutes, 'calculation worked minutes'),
    paidLeaveMinutes: integerValue(data.paidLeaveMinutes, 'calculation paid leave minutes'),
    earnings: adjustments(data.earnings, 'calculation earnings'),
    deductions: adjustments(data.deductions, 'calculation deductions'),
  }
  const verified = calculateSalary(input)
  const storedKeys: (keyof SalaryCalculation)[] = [
    'calendarDays', 'expectedMinutes', 'weeklyOffMinutes', 'payableMinutes', 'basePayPaise',
    'earningsPaise', 'deductionsPaise', 'netPayPaise',
  ]
  storedKeys.forEach((key) => {
    if (integerValue(data[key], `calculation ${key}`) !== verified[key]) throw new Error('Saved salary calculation does not match its inputs.')
  })
  return verified
}

export function parseSalarySlip(value: unknown): SalarySlip {
  const data = record(value, 'salary slip')
  const role = stringValue(data.employeeRole, 'employee role')
  if (role !== 'manager' && role !== 'billing') throw new Error('Invalid payroll employee role.')
  const paymentState = stringValue(data.paymentState, 'salary payment state')
  if (!['unpaid', 'paid', 'additional-due', 'overpaid'].includes(paymentState)) throw new Error('Invalid salary payment state.')
  return {
    id: stringValue(data.id, 'salary slip id'),
    employeeUserId: stringValue(data.employeeUserId, 'employee uid'),
    employeeName: stringValue(data.employeeName, 'employee name'),
    employeeRole: role,
    payrollMonth: stringValue(data.payrollMonth, 'payroll month'),
    currentRevision: integerValue(data.currentRevision, 'current revision', 1),
    currentRevisionId: stringValue(data.currentRevisionId, 'current revision id'),
    currentCalculation: calculation(data.currentCalculation),
    totalPaidPaise: integerValue(data.totalPaidPaise, 'total paid'),
    paymentState: paymentState as SalarySlip['paymentState'],
    outstandingPaise: integerValue(data.outstandingPaise, 'outstanding amount'),
    overpaidPaise: integerValue(data.overpaidPaise, 'overpaid amount'),
    finalizedAt: payrollTimestamp(data.finalizedAt),
    finalizedByUid: stringValue(data.finalizedByUid, 'finalizer uid'),
    finalizedByName: stringValue(data.finalizedByName, 'finalizer name'),
    lastEventId: stringValue(data.lastEventId, 'last event id'),
    updatedAt: payrollTimestamp(data.updatedAt),
    updatedByUid: stringValue(data.updatedByUid, 'slip actor uid'),
    updatedByName: stringValue(data.updatedByName, 'slip actor name'),
  }
}

export function parseSalarySlipRevision(value: unknown): SalarySlipRevision {
  const data = record(value, 'salary slip revision')
  const role = stringValue(data.employeeRole, 'employee role')
  if (role !== 'manager' && role !== 'billing') throw new Error('Invalid payroll employee role.')
  return {
    id: stringValue(data.id, 'salary slip revision id'),
    slipId: stringValue(data.slipId, 'salary slip id'),
    revision: integerValue(data.revision, 'salary slip revision', 1),
    employeeUserId: stringValue(data.employeeUserId, 'employee uid'),
    employeeName: stringValue(data.employeeName, 'employee name'),
    employeeRole: role,
    payrollMonth: stringValue(data.payrollMonth, 'payroll month'),
    issuer: issuer(data.issuer),
    term: parsePayrollTerm(data.term),
    calculation: calculation(data.calculation),
    reason: stringValue(data.reason, 'revision reason'),
    createdAt: payrollTimestamp(data.createdAt),
    createdByUid: stringValue(data.createdByUid, 'revision creator uid'),
    createdByName: stringValue(data.createdByName, 'revision creator name'),
  }
}

export function parsePayrollEvent(value: unknown): PayrollEvent {
  const data = record(value, 'payroll event')
  const type = stringValue(data.type, 'payroll event type')
  const supported = ['settings-updated', 'profile-updated', 'term-created', 'month-configured', 'slip-finalized', 'slip-revised', 'payment-recorded']
  if (!supported.includes(type)) throw new Error('Invalid payroll event type.')
  return {
    id: stringValue(data.id, 'payroll event id'),
    type: type as PayrollEvent['type'],
    actorUid: stringValue(data.actorUid, 'payroll event actor uid'),
    actorName: stringValue(data.actorName, 'payroll event actor name'),
    createdAt: payrollTimestamp(data.createdAt),
    ...(optionalString(data.employeeUserId) ? { employeeUserId: optionalString(data.employeeUserId) } : {}),
    ...(optionalString(data.payrollMonth) ? { payrollMonth: optionalString(data.payrollMonth) } : {}),
    ...(optionalString(data.slipId) ? { slipId: optionalString(data.slipId) } : {}),
    ...(data.revision !== undefined ? { revision: integerValue(data.revision, 'payroll event revision', 1) } : {}),
    ...(optionalString(data.reason) ? { reason: optionalString(data.reason) } : {}),
    ...(data.amountPaise !== undefined ? { amountPaise: integerValue(data.amountPaise, 'payroll event amount', 1) } : {}),
    ...(optionalString(data.paymentDate) ? { paymentDate: optionalString(data.paymentDate) } : {}),
    ...(optionalString(data.paymentMethod) ? { paymentMethod: optionalString(data.paymentMethod) as PayrollEvent['paymentMethod'] } : {}),
    ...(optionalString(data.paymentReference) ? { paymentReference: optionalString(data.paymentReference) } : {}),
  }
}
