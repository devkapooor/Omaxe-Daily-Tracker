import {
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/shared/lib/firebase'
import {
  calculateSalary,
  deriveSalaryPaymentSummary,
  isPayrollMonth,
  type PayrollActor,
  type PayrollAdjustment,
  type PayrollEvent,
  type PayrollIssuer,
  type PayrollMonth,
  type PayrollPaymentMethod,
  type PayrollProfile,
  type PayrollSettings,
  type PayrollTerm,
  type SalaryDraft,
  type SalarySlip,
  type SalarySlipRevision,
} from '@/features/payroll/domain/payroll'
import {
  parsePayrollEvent,
  parsePayrollMonth,
  parsePayrollProfile,
  parsePayrollSettings,
  parsePayrollTerm,
  parseSalaryDraft,
  parseSalarySlip,
  parseSalarySlipRevision,
} from './payrollParsers'

export const defaultPayrollSettings = {
  issuer: { name: '' },
  defaultPaidWeeklyOffDays: 4,
} satisfies Pick<PayrollSettings, 'issuer' | 'defaultPaidWeeklyOffDays'>

function requireActor(actor: PayrollActor) {
  if (!actor.uid.trim() || !actor.name.trim()) throw new Error('Authenticated payroll actor is required.')
}

function requireMonth(month: string) {
  if (!isPayrollMonth(month)) throw new Error('Choose a valid payroll month.')
}

function eventId() {
  return `payroll-event-${crypto.randomUUID()}`
}

export function salarySlipId(employeeUserId: string, payrollMonth: string) {
  return `${employeeUserId}__${payrollMonth}`
}

export function salaryRevisionId(slipId: string, revision: number) {
  return `${slipId}__r${String(revision).padStart(3, '0')}`
}

function eventDocument(input: Omit<PayrollEvent, 'createdAt'>) {
  return {
    ...input,
    createdAt: serverTimestamp(),
  }
}

function parseCollection<T>(docs: { data: () => unknown }[], parser: (value: unknown) => T) {
  return docs.map((item) => parser(item.data()))
}

export function subscribePayrollSettings(
  onData: (settings: PayrollSettings | null) => void,
  onError: (error: Error) => void,
) {
  return onSnapshot(doc(db, 'payrollSettings', 'config'), (snapshot) => {
    onData(snapshot.exists() ? parsePayrollSettings(snapshot.data()) : null)
  }, (error) => onError(error))
}

export function subscribePayrollProfiles(
  onData: (profiles: PayrollProfile[]) => void,
  onError: (error: Error) => void,
) {
  return onSnapshot(collection(db, 'payrollProfiles'), (snapshot) => {
    onData(parseCollection(snapshot.docs, parsePayrollProfile))
  }, (error) => onError(error))
}

export function subscribePayrollTerms(
  onData: (terms: PayrollTerm[]) => void,
  onError: (error: Error) => void,
) {
  return onSnapshot(collection(db, 'payrollTerms'), (snapshot) => {
    onData(parseCollection(snapshot.docs, parsePayrollTerm))
  }, (error) => onError(error))
}

export function subscribePayrollMonth(
  payrollMonth: string,
  onData: (month: PayrollMonth | null) => void,
  onError: (error: Error) => void,
) {
  requireMonth(payrollMonth)
  return onSnapshot(doc(db, 'payrollMonths', payrollMonth), (snapshot) => {
    onData(snapshot.exists() ? parsePayrollMonth(snapshot.data()) : null)
  }, (error) => onError(error))
}

export function subscribePayrollDrafts(
  payrollMonth: string,
  onData: (drafts: SalaryDraft[]) => void,
  onError: (error: Error) => void,
) {
  requireMonth(payrollMonth)
  return onSnapshot(query(collection(db, 'payrollDrafts'), where('payrollMonth', '==', payrollMonth)), (snapshot) => {
    onData(parseCollection(snapshot.docs, parseSalaryDraft))
  }, (error) => onError(error))
}

export function subscribePayrollSlipsForMonth(
  payrollMonth: string,
  onData: (slips: SalarySlip[]) => void,
  onError: (error: Error) => void,
) {
  requireMonth(payrollMonth)
  return onSnapshot(query(collection(db, 'salarySlips'), where('payrollMonth', '==', payrollMonth)), (snapshot) => {
    onData(parseCollection(snapshot.docs, parseSalarySlip))
  }, (error) => onError(error))
}

export function subscribeEmployeeSalarySlips(
  employeeUserId: string,
  onData: (slips: SalarySlip[]) => void,
  onError: (error: Error) => void,
) {
  return onSnapshot(query(collection(db, 'salarySlips'), where('employeeUserId', '==', employeeUserId)), (snapshot) => {
    onData(parseCollection(snapshot.docs, parseSalarySlip).sort((left, right) => right.payrollMonth.localeCompare(left.payrollMonth)))
  }, (error) => onError(error))
}

export function subscribeSalarySlipHistory(
  slipId: string,
  onData: (history: { revisions: SalarySlipRevision[]; events: PayrollEvent[] }) => void,
  onError: (error: Error) => void,
) {
  let revisions: SalarySlipRevision[] = []
  let events: PayrollEvent[] = []
  const emit = () => onData({
    revisions: [...revisions].sort((left, right) => right.revision - left.revision),
    events: [...events].sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
  })
  const unsubscribers: Unsubscribe[] = [
    onSnapshot(query(collection(db, 'salarySlipRevisions'), where('slipId', '==', slipId)), (snapshot) => {
      revisions = parseCollection(snapshot.docs, parseSalarySlipRevision)
      emit()
    }, (error) => onError(error)),
    onSnapshot(query(collection(db, 'payrollEvents'), where('slipId', '==', slipId)), (snapshot) => {
      events = parseCollection(snapshot.docs, parsePayrollEvent)
      emit()
    }, (error) => onError(error)),
  ]
  return () => unsubscribers.forEach((unsubscribe) => unsubscribe())
}

export async function savePayrollSettings(input: {
  issuer: PayrollIssuer
  defaultPaidWeeklyOffDays: number
  actor: PayrollActor
}) {
  requireActor(input.actor)
  if (!input.issuer.name.trim()) throw new Error('Employer name is required.')
  if (!Number.isSafeInteger(input.defaultPaidWeeklyOffDays) || input.defaultPaidWeeklyOffDays < 0 || input.defaultPaidWeeklyOffDays > 31) {
    throw new Error('Default paid weekly offs must be between 0 and 31.')
  }
  const id = eventId()
  await runTransaction(db, async (transaction) => {
    transaction.set(doc(db, 'payrollSettings', 'config'), {
      issuer: {
        name: input.issuer.name.trim(),
        ...(input.issuer.address?.trim() ? { address: input.issuer.address.trim() } : {}),
        ...(input.issuer.contact?.trim() ? { contact: input.issuer.contact.trim() } : {}),
      },
      defaultPaidWeeklyOffDays: input.defaultPaidWeeklyOffDays,
      updatedAt: serverTimestamp(),
      updatedByUid: input.actor.uid,
      updatedByName: input.actor.name,
    })
    transaction.set(doc(db, 'payrollEvents', id), eventDocument({
      id,
      type: 'settings-updated',
      actorUid: input.actor.uid,
      actorName: input.actor.name,
    }))
  })
}

export async function savePayrollProfile(input: {
  employeeUserId: string
  enabled: boolean
  actor: PayrollActor
}) {
  requireActor(input.actor)
  if (!input.employeeUserId.trim()) throw new Error('Employee uid is required.')
  const profileRef = doc(db, 'payrollProfiles', input.employeeUserId)
  const id = eventId()
  await runTransaction(db, async (transaction) => {
    const profileSnapshot = await transaction.get(profileRef)
    const existing = profileSnapshot.exists() ? parsePayrollProfile(profileSnapshot.data()) : null
    transaction.set(profileRef, {
      employeeUserId: input.employeeUserId,
      enabled: input.enabled,
      createdAt: existing?.createdAt ?? serverTimestamp(),
      createdByUid: existing?.createdByUid ?? input.actor.uid,
      createdByName: existing?.createdByName ?? input.actor.name,
      updatedAt: serverTimestamp(),
      updatedByUid: input.actor.uid,
      updatedByName: input.actor.name,
    })
    transaction.set(doc(db, 'payrollEvents', id), eventDocument({
      id,
      type: 'profile-updated',
      actorUid: input.actor.uid,
      actorName: input.actor.name,
      employeeUserId: input.employeeUserId,
      reason: input.enabled ? 'Payroll enabled.' : 'Payroll disabled.',
    }))
  })
}

export async function createPayrollTerm(input: {
  employeeUserId: string
  effectiveFromMonth: string
  monthlySalaryPaise: number
  requiredDailyMinutes: number
  supersedesTermId?: string
  actor: PayrollActor
}) {
  requireActor(input.actor)
  requireMonth(input.effectiveFromMonth)
  if (!Number.isSafeInteger(input.monthlySalaryPaise) || input.monthlySalaryPaise <= 0) throw new Error('Monthly salary must be greater than zero.')
  if (!Number.isSafeInteger(input.requiredDailyMinutes) || input.requiredDailyMinutes <= 0 || input.requiredDailyMinutes > 24 * 60) {
    throw new Error('Required daily hours must be greater than zero and no more than 24 hours.')
  }
  const id = `payroll-term-${crypto.randomUUID()}`
  const auditId = eventId()
  await runTransaction(db, async (transaction) => {
    const profileSnapshot = await transaction.get(doc(db, 'payrollProfiles', input.employeeUserId))
    if (!profileSnapshot.exists() || !parsePayrollProfile(profileSnapshot.data()).enabled) throw new Error('Enable payroll for this employee first.')
    let revision = 1
    if (input.supersedesTermId) {
      const previousSnapshot = await transaction.get(doc(db, 'payrollTerms', input.supersedesTermId))
      if (!previousSnapshot.exists()) throw new Error('The salary term being replaced was not found.')
      const previous = parsePayrollTerm(previousSnapshot.data())
      if (previous.employeeUserId !== input.employeeUserId || previous.effectiveFromMonth !== input.effectiveFromMonth) {
        throw new Error('A salary term can only replace the same employee and effective month.')
      }
      revision = previous.revision + 1
    }
    transaction.set(doc(db, 'payrollTerms', id), {
      id,
      employeeUserId: input.employeeUserId,
      effectiveFromMonth: input.effectiveFromMonth,
      monthlySalaryPaise: input.monthlySalaryPaise,
      requiredDailyMinutes: input.requiredDailyMinutes,
      revision,
      ...(input.supersedesTermId ? { supersedesTermId: input.supersedesTermId } : {}),
      createdAt: serverTimestamp(),
      createdByUid: input.actor.uid,
      createdByName: input.actor.name,
    })
    transaction.set(doc(db, 'payrollEvents', auditId), eventDocument({
      id: auditId,
      type: 'term-created',
      actorUid: input.actor.uid,
      actorName: input.actor.name,
      employeeUserId: input.employeeUserId,
      payrollMonth: input.effectiveFromMonth,
      reason: input.supersedesTermId ? 'Salary term corrected.' : 'Salary term created.',
    }))
  })
  return id
}

export async function savePayrollMonth(input: {
  payrollMonth: string
  paidWeeklyOffDays: number
  actor: PayrollActor
}) {
  requireActor(input.actor)
  requireMonth(input.payrollMonth)
  if (!Number.isSafeInteger(input.paidWeeklyOffDays) || input.paidWeeklyOffDays < 0 || input.paidWeeklyOffDays > 31) {
    throw new Error('Paid weekly offs must be between 0 and 31.')
  }
  const monthRef = doc(db, 'payrollMonths', input.payrollMonth)
  const id = eventId()
  await runTransaction(db, async (transaction) => {
    const monthSnapshot = await transaction.get(monthRef)
    const existing = monthSnapshot.exists() ? parsePayrollMonth(monthSnapshot.data()) : null
    if ((existing?.finalizedSlipCount ?? 0) > 0) throw new Error('Weekly offs are locked because this month already has finalized salary slips.')
    transaction.set(monthRef, {
      id: input.payrollMonth,
      payrollMonth: input.payrollMonth,
      paidWeeklyOffDays: input.paidWeeklyOffDays,
      finalizedSlipCount: existing?.finalizedSlipCount ?? 0,
      createdAt: existing?.createdAt ?? serverTimestamp(),
      createdByUid: existing?.createdByUid ?? input.actor.uid,
      createdByName: existing?.createdByName ?? input.actor.name,
      updatedAt: serverTimestamp(),
      updatedByUid: input.actor.uid,
      updatedByName: input.actor.name,
    })
    transaction.set(doc(db, 'payrollEvents', id), eventDocument({
      id,
      type: 'month-configured',
      actorUid: input.actor.uid,
      actorName: input.actor.name,
      payrollMonth: input.payrollMonth,
      reason: `${input.paidWeeklyOffDays} paid weekly offs configured.`,
    }))
  })
}

export async function saveSalaryDraft(input: {
  employeeUserId: string
  employeeName: string
  employeeRole: 'manager' | 'billing'
  payrollMonth: string
  termId: string
  paidWeeklyOffDays: number
  workedMinutes: number
  paidLeaveMinutes: number
  earnings: PayrollAdjustment[]
  deductions: PayrollAdjustment[]
  actor: PayrollActor
}) {
  requireActor(input.actor)
  requireMonth(input.payrollMonth)
  const id = salarySlipId(input.employeeUserId, input.payrollMonth)
  const draftRef = doc(db, 'payrollDrafts', id)
  await runTransaction(db, async (transaction) => {
    const [profileSnapshot, termSnapshot, monthSnapshot, existingSnapshot] = await Promise.all([
      transaction.get(doc(db, 'payrollProfiles', input.employeeUserId)),
      transaction.get(doc(db, 'payrollTerms', input.termId)),
      transaction.get(doc(db, 'payrollMonths', input.payrollMonth)),
      transaction.get(draftRef),
    ])
    if (!profileSnapshot.exists() || !parsePayrollProfile(profileSnapshot.data()).enabled) throw new Error('Payroll is not enabled for this employee.')
    if (!termSnapshot.exists()) throw new Error('Salary terms were not found.')
    const term = parsePayrollTerm(termSnapshot.data())
    if (term.employeeUserId !== input.employeeUserId || term.effectiveFromMonth > input.payrollMonth) throw new Error('These salary terms do not apply to the selected month.')
    if (!monthSnapshot.exists()) throw new Error('Configure the payroll month before saving salary drafts.')
    const month = parsePayrollMonth(monthSnapshot.data())
    if (month.paidWeeklyOffDays !== input.paidWeeklyOffDays) throw new Error('The payroll month weekly-off setting changed. Refresh and try again.')
    calculateSalary({
      payrollMonth: input.payrollMonth,
      monthlySalaryPaise: term.monthlySalaryPaise,
      requiredDailyMinutes: term.requiredDailyMinutes,
      paidWeeklyOffDays: input.paidWeeklyOffDays,
      workedMinutes: input.workedMinutes,
      paidLeaveMinutes: input.paidLeaveMinutes,
      earnings: input.earnings,
      deductions: input.deductions,
    })
    const existing = existingSnapshot.exists() ? parseSalaryDraft(existingSnapshot.data()) : null
    transaction.set(draftRef, {
      id,
      employeeUserId: input.employeeUserId,
      employeeName: input.employeeName.trim(),
      employeeRole: input.employeeRole,
      payrollMonth: input.payrollMonth,
      termId: input.termId,
      paidWeeklyOffDays: input.paidWeeklyOffDays,
      workedMinutes: input.workedMinutes,
      paidLeaveMinutes: input.paidLeaveMinutes,
      earnings: input.earnings,
      deductions: input.deductions,
      createdAt: existing?.createdAt ?? serverTimestamp(),
      createdByUid: existing?.createdByUid ?? input.actor.uid,
      createdByName: existing?.createdByName ?? input.actor.name,
      updatedAt: serverTimestamp(),
      updatedByUid: input.actor.uid,
      updatedByName: input.actor.name,
    })
  })
  return id
}

export async function finalizeSalarySlip(draftId: string, actor: PayrollActor) {
  requireActor(actor)
  const event = eventId()
  await runTransaction(db, async (transaction) => {
    const draftRef = doc(db, 'payrollDrafts', draftId)
    const draftSnapshot = await transaction.get(draftRef)
    if (!draftSnapshot.exists()) throw new Error('Salary draft was not found.')
    const draft = parseSalaryDraft(draftSnapshot.data())
    const slipRef = doc(db, 'salarySlips', draft.id)
    const [slipSnapshot, profileSnapshot, termSnapshot, monthSnapshot, settingsSnapshot, userSnapshot] = await Promise.all([
      transaction.get(slipRef),
      transaction.get(doc(db, 'payrollProfiles', draft.employeeUserId)),
      transaction.get(doc(db, 'payrollTerms', draft.termId)),
      transaction.get(doc(db, 'payrollMonths', draft.payrollMonth)),
      transaction.get(doc(db, 'payrollSettings', 'config')),
      transaction.get(doc(db, 'users', draft.employeeUserId)),
    ])
    if (slipSnapshot.exists()) throw new Error('This employee already has a finalized salary slip for the month.')
    if (!profileSnapshot.exists() || !parsePayrollProfile(profileSnapshot.data()).enabled) throw new Error('Payroll is not enabled for this employee.')
    if (!termSnapshot.exists() || !monthSnapshot.exists() || !settingsSnapshot.exists() || !userSnapshot.exists()) throw new Error('Payroll setup is incomplete.')
    const term = parsePayrollTerm(termSnapshot.data())
    const month = parsePayrollMonth(monthSnapshot.data())
    const settings = parsePayrollSettings(settingsSnapshot.data())
    const user = userSnapshot.data()
    if (user.disabled === true || (user.role !== 'manager' && user.role !== 'billing')) throw new Error('Only active manager and billing users can receive salary slips.')
    if (term.employeeUserId !== draft.employeeUserId || term.effectiveFromMonth > draft.payrollMonth) throw new Error('The selected salary terms are not valid for this month.')
    if (month.paidWeeklyOffDays !== draft.paidWeeklyOffDays) throw new Error('The payroll month weekly-off setting changed. Update the draft first.')
    const calculation = calculateSalary({
      payrollMonth: draft.payrollMonth,
      monthlySalaryPaise: term.monthlySalaryPaise,
      requiredDailyMinutes: term.requiredDailyMinutes,
      paidWeeklyOffDays: draft.paidWeeklyOffDays,
      workedMinutes: draft.workedMinutes,
      paidLeaveMinutes: draft.paidLeaveMinutes,
      earnings: draft.earnings,
      deductions: draft.deductions,
    })
    const revision = 1
    const revisionId = salaryRevisionId(draft.id, revision)
    const payment = deriveSalaryPaymentSummary(calculation.netPayPaise, 0)
    transaction.set(slipRef, {
      id: draft.id,
      employeeUserId: draft.employeeUserId,
      employeeName: user.name,
      employeeRole: user.role,
      payrollMonth: draft.payrollMonth,
      currentRevision: revision,
      currentRevisionId: revisionId,
      currentCalculation: calculation,
      totalPaidPaise: payment.totalPaidPaise,
      paymentState: payment.state,
      outstandingPaise: payment.outstandingPaise,
      overpaidPaise: payment.overpaidPaise,
      finalizedAt: serverTimestamp(),
      finalizedByUid: actor.uid,
      finalizedByName: actor.name,
      lastEventId: event,
      updatedAt: serverTimestamp(),
      updatedByUid: actor.uid,
      updatedByName: actor.name,
    })
    transaction.set(doc(db, 'salarySlipRevisions', revisionId), {
      id: revisionId,
      slipId: draft.id,
      revision,
      employeeUserId: draft.employeeUserId,
      employeeName: user.name,
      employeeRole: user.role,
      payrollMonth: draft.payrollMonth,
      issuer: settings.issuer,
      term,
      calculation,
      reason: 'Initial salary slip finalized.',
      createdAt: serverTimestamp(),
      createdByUid: actor.uid,
      createdByName: actor.name,
    })
    transaction.set(doc(db, 'payrollEvents', event), eventDocument({
      id: event,
      type: 'slip-finalized',
      actorUid: actor.uid,
      actorName: actor.name,
      employeeUserId: draft.employeeUserId,
      payrollMonth: draft.payrollMonth,
      slipId: draft.id,
      revision,
      reason: 'Initial salary slip finalized.',
    }))
    transaction.update(doc(db, 'payrollMonths', draft.payrollMonth), {
      finalizedSlipCount: month.finalizedSlipCount + 1,
      lockedAt: month.lockedAt ?? serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedByUid: actor.uid,
      updatedByName: actor.name,
    })
    transaction.delete(draftRef)
  })
}

export async function reviseSalarySlip(input: {
  slipId: string
  expectedRevision: number
  termId: string
  paidWeeklyOffDays: number
  workedMinutes: number
  paidLeaveMinutes: number
  earnings: PayrollAdjustment[]
  deductions: PayrollAdjustment[]
  reason: string
  actor: PayrollActor
}) {
  requireActor(input.actor)
  if (!input.reason.trim()) throw new Error('A correction reason is required.')
  const event = eventId()
  await runTransaction(db, async (transaction) => {
    const slipRef = doc(db, 'salarySlips', input.slipId)
    const [slipSnapshot, termSnapshot, settingsSnapshot] = await Promise.all([
      transaction.get(slipRef),
      transaction.get(doc(db, 'payrollTerms', input.termId)),
      transaction.get(doc(db, 'payrollSettings', 'config')),
    ])
    if (!slipSnapshot.exists() || !termSnapshot.exists() || !settingsSnapshot.exists()) throw new Error('Salary slip setup could not be found.')
    const slip = parseSalarySlip(slipSnapshot.data())
    const term = parsePayrollTerm(termSnapshot.data())
    const settings = parsePayrollSettings(settingsSnapshot.data())
    if (slip.currentRevision !== input.expectedRevision) throw new Error('This salary slip changed. Refresh before applying the correction.')
    if (term.employeeUserId !== slip.employeeUserId || term.effectiveFromMonth > slip.payrollMonth) throw new Error('The selected salary terms do not apply to this slip.')
    const calculation = calculateSalary({
      payrollMonth: slip.payrollMonth,
      monthlySalaryPaise: term.monthlySalaryPaise,
      requiredDailyMinutes: term.requiredDailyMinutes,
      paidWeeklyOffDays: input.paidWeeklyOffDays,
      workedMinutes: input.workedMinutes,
      paidLeaveMinutes: input.paidLeaveMinutes,
      earnings: input.earnings,
      deductions: input.deductions,
    })
    const revision = slip.currentRevision + 1
    const revisionId = salaryRevisionId(slip.id, revision)
    const payment = deriveSalaryPaymentSummary(calculation.netPayPaise, slip.totalPaidPaise)
    transaction.set(doc(db, 'salarySlipRevisions', revisionId), {
      id: revisionId,
      slipId: slip.id,
      revision,
      employeeUserId: slip.employeeUserId,
      employeeName: slip.employeeName,
      employeeRole: slip.employeeRole,
      payrollMonth: slip.payrollMonth,
      issuer: settings.issuer,
      term,
      calculation,
      reason: input.reason.trim(),
      createdAt: serverTimestamp(),
      createdByUid: input.actor.uid,
      createdByName: input.actor.name,
    })
    transaction.set(doc(db, 'payrollEvents', event), eventDocument({
      id: event,
      type: 'slip-revised',
      actorUid: input.actor.uid,
      actorName: input.actor.name,
      employeeUserId: slip.employeeUserId,
      payrollMonth: slip.payrollMonth,
      slipId: slip.id,
      revision,
      reason: input.reason.trim(),
    }))
    transaction.update(slipRef, {
      currentRevision: revision,
      currentRevisionId: revisionId,
      currentCalculation: calculation,
      paymentState: payment.state,
      outstandingPaise: payment.outstandingPaise,
      overpaidPaise: payment.overpaidPaise,
      lastEventId: event,
      updatedAt: serverTimestamp(),
      updatedByUid: input.actor.uid,
      updatedByName: input.actor.name,
    })
  })
}

export async function recordSalaryPayment(input: {
  slipId: string
  expectedRevision: number
  paymentDate: string
  paymentMethod: PayrollPaymentMethod
  paymentReference?: string
  actor: PayrollActor
}) {
  requireActor(input.actor)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paymentDate)) throw new Error('Choose a valid payment date.')
  const event = eventId()
  await runTransaction(db, async (transaction) => {
    const slipRef = doc(db, 'salarySlips', input.slipId)
    const slipSnapshot = await transaction.get(slipRef)
    if (!slipSnapshot.exists()) throw new Error('Salary slip was not found.')
    const slip = parseSalarySlip(slipSnapshot.data())
    if (slip.currentRevision !== input.expectedRevision) throw new Error('This salary slip changed. Refresh before recording payment.')
    if (slip.outstandingPaise <= 0) throw new Error('This salary slip has no outstanding amount to pay.')
    const amountPaise = slip.outstandingPaise
    const payment = deriveSalaryPaymentSummary(slip.currentCalculation.netPayPaise, slip.totalPaidPaise + amountPaise)
    transaction.set(doc(db, 'payrollEvents', event), eventDocument({
      id: event,
      type: 'payment-recorded',
      actorUid: input.actor.uid,
      actorName: input.actor.name,
      employeeUserId: slip.employeeUserId,
      payrollMonth: slip.payrollMonth,
      slipId: slip.id,
      revision: slip.currentRevision,
      amountPaise,
      paymentDate: input.paymentDate,
      paymentMethod: input.paymentMethod,
      ...(input.paymentReference?.trim() ? { paymentReference: input.paymentReference.trim() } : {}),
    }))
    transaction.update(slipRef, {
      totalPaidPaise: payment.totalPaidPaise,
      paymentState: payment.state,
      outstandingPaise: payment.outstandingPaise,
      overpaidPaise: payment.overpaidPaise,
      lastEventId: event,
      updatedAt: serverTimestamp(),
      updatedByUid: input.actor.uid,
      updatedByName: input.actor.name,
    })
  })
}
