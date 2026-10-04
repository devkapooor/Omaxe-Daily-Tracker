import { useMemo, useState, type FormEvent } from 'react'
import { Eye, Plus, Trash2 } from 'lucide-react'
import type { UserAccount } from '@/domain/appTypes'
import type { AppUser } from '@/domain/financeTypes'
import {
  calculateSalary,
  hoursAndMinutesToMinutes,
  isPayrollMonth,
  rupeesToPayrollPaise,
  selectPayrollTerm,
  type PayrollAdjustment,
  type PayrollPaymentMethod,
  type SalarySlip,
} from '@/features/payroll/domain/payroll'
import {
  createPayrollTerm,
  defaultPayrollSettings,
  finalizeSalarySlip,
  recordSalaryPayment,
  reviseSalarySlip,
  savePayrollMonth,
  savePayrollProfile,
  savePayrollSettings,
  saveSalaryDraft,
} from '@/features/payroll/data/payrollRepository'
import { usePayroll } from '@/features/payroll/hooks/usePayroll'
import { SalarySlipDetails } from '@/features/payroll/components/SalarySlipDetails'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { FieldLabel } from '@/shared/ui/field-label'
import { Input } from '@/shared/ui/input'
import { NativeSelect } from '@/shared/ui/native-select'
import { PageCardStack } from '@/shared/ui/page-card-stack'
import { PageHeader, PageHeaderTab, PageHeaderTabsList } from '@/shared/ui/page-header'
import { PageLayout } from '@/shared/ui/page-layout'
import { SectionHeading } from '@/shared/ui/section-heading'
import { StatusPanel } from '@/shared/ui/status-panel'
import { Tabs, TabsContent } from '@/shared/ui/tabs'
import { Textarea } from '@/shared/ui/textarea'
import { useConfirmationDialog } from '@/shared/ui/confirmation-dialog'
import { serverNowDate } from '@/shared/lib/serverClock'
import { today } from '@/app/uiHelpers'

type PayrollPageProps = {
  currentUser: AppUser
  users: UserAccount[]
  showToast: (message: string) => void
}

type AdjustmentDraft = PayrollAdjustment & { amountRupees: string }

function currentPayrollMonth() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).formatToParts(serverNowDate())
  return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}`
}

function money(paise: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(paise / 100)
}

function paymentBadge(state: SalarySlip['paymentState']) {
  if (state === 'paid') return 'success' as const
  if (state === 'overpaid') return 'warning' as const
  if (state === 'additional-due') return 'destructive' as const
  return 'secondary' as const
}

function adjustmentRows(entries: AdjustmentDraft[], setEntries: (entries: AdjustmentDraft[]) => void, label: string) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between"><p className="text-xs font-bold">{label}</p><Button size="sm" type="button" variant="outline" onClick={() => setEntries([...entries, { id: crypto.randomUUID(), label: '', amountPaise: 0, amountRupees: '' }])}><Plus className="size-3.5" /> Add</Button></div>
      {entries.map((entry, index) => (
        <div className="grid grid-cols-[1fr_8rem_auto] gap-2" key={entry.id}>
          <Input aria-label={`${label} label`} placeholder="Label" value={entry.label} onChange={(event) => setEntries(entries.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} />
          <Input aria-label={`${label} amount`} min="0.01" placeholder="Amount" step="0.01" type="number" value={entry.amountRupees} onChange={(event) => setEntries(entries.map((item, itemIndex) => itemIndex === index ? { ...item, amountRupees: event.target.value } : item))} />
          <Button aria-label={`Remove ${label}`} size="icon" type="button" variant="ghost" onClick={() => setEntries(entries.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="size-3.5" /></Button>
        </div>
      ))}
    </div>
  )
}

export function PayrollPage({ currentUser, users, showToast }: PayrollPageProps) {
  const [payrollMonth, setPayrollMonth] = useState(currentPayrollMonth)
  const payroll = usePayroll(currentUser, payrollMonth)
  const confirmation = useConfirmationDialog()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [selectedSlip, setSelectedSlip] = useState<SalarySlip | null>(null)
  const [setupEmployeeId, setSetupEmployeeId] = useState('')
  const [entryEmployeeId, setEntryEmployeeId] = useState('')
  const [workedHours, setWorkedHours] = useState('0')
  const [workedMinutes, setWorkedMinutes] = useState('0')
  const [leaveHours, setLeaveHours] = useState('0')
  const [leaveMinutes, setLeaveMinutes] = useState('0')
  const [earnings, setEarnings] = useState<AdjustmentDraft[]>([])
  const [deductions, setDeductions] = useState<AdjustmentDraft[]>([])
  const [paymentSlip, setPaymentSlip] = useState<SalarySlip | null>(null)

  const actor = useMemo(() => ({ uid: currentUser.id, name: currentUser.name }), [currentUser.id, currentUser.name])
  const candidates = useMemo(() => users.filter((user) => !user.disabled && (user.role === 'manager' || user.role === 'billing')), [users])
  const enabledIds = useMemo(() => new Set(payroll.profiles.filter((profile) => profile.enabled).map((profile) => profile.employeeUserId)), [payroll.profiles])
  const selectedUser = candidates.find((user) => user.id === entryEmployeeId)
  const selectedTerm = selectedUser ? selectPayrollTerm(payroll.terms, selectedUser.id, payrollMonth) : null
  const selectedDraft = payroll.drafts.find((draft) => draft.employeeUserId === entryEmployeeId)
  const selectedFinalSlip = payroll.slips.find((slip) => slip.employeeUserId === entryEmployeeId)
  const weeklyOffDays = payroll.month?.paidWeeklyOffDays ?? payroll.settings?.defaultPaidWeeklyOffDays ?? 4

  const summary = useMemo(() => payroll.slips.reduce((totals, slip) => ({
    net: totals.net + slip.currentCalculation.netPayPaise,
    paid: totals.paid + slip.totalPaidPaise,
    outstanding: totals.outstanding + slip.outstandingPaise,
  }), { net: 0, paid: 0, outstanding: 0 }), [payroll.slips])

  function run(action: () => Promise<unknown>, success: string) {
    setBusy(true)
    setError('')
    return Promise.resolve().then(action).then(() => showToast(success)).catch((cause) => {
      setError(cause instanceof Error ? cause.message : 'Unable to complete the payroll action.')
    }).finally(() => setBusy(false))
  }

  function parseAdjustments(entries: AdjustmentDraft[]) {
    return entries.map((entry) => ({ id: entry.id, label: entry.label.trim(), amountPaise: rupeesToPayrollPaise(Number(entry.amountRupees)) }))
  }

  function loadEntry(employeeId: string) {
    setEntryEmployeeId(employeeId)
    const draft = payroll.drafts.find((item) => item.employeeUserId === employeeId)
    const slip = payroll.slips.find((item) => item.employeeUserId === employeeId)
    const calculation = draft ?? slip?.currentCalculation
    const worked = calculation?.workedMinutes ?? 0
    const leave = calculation?.paidLeaveMinutes ?? 0
    setWorkedHours(String(Math.floor(worked / 60)))
    setWorkedMinutes(String(worked % 60))
    setLeaveHours(String(Math.floor(leave / 60)))
    setLeaveMinutes(String(leave % 60))
    setEarnings((calculation?.earnings ?? []).map((item) => ({ ...item, amountRupees: String(item.amountPaise / 100) })))
    setDeductions((calculation?.deductions ?? []).map((item) => ({ ...item, amountRupees: String(item.amountPaise / 100) })))
  }

  async function saveEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedUser || !selectedTerm || !payroll.month) {
      setError('Complete the employee salary terms and monthly weekly-off setup first.')
      return
    }
    const values = {
      paidWeeklyOffDays: weeklyOffDays,
      workedMinutes: hoursAndMinutesToMinutes(Number(workedHours), Number(workedMinutes)),
      paidLeaveMinutes: hoursAndMinutesToMinutes(Number(leaveHours), Number(leaveMinutes)),
      earnings: parseAdjustments(earnings),
      deductions: parseAdjustments(deductions),
    }
    if (selectedFinalSlip) {
      const reason = await confirmation.confirm({ title: 'Revise finalized salary slip?', requireReason: true, warning: 'The existing revision and any payment evidence will be preserved.', confirmLabel: 'Create Revision' })
      if (typeof reason !== 'string') return
      await run(() => reviseSalarySlip({ slipId: selectedFinalSlip.id, expectedRevision: selectedFinalSlip.currentRevision, termId: selectedTerm.id, ...values, reason, actor }), 'Salary slip revision created.')
      return
    }
    await run(() => saveSalaryDraft({ employeeUserId: selectedUser.id, employeeName: selectedUser.name, employeeRole: selectedUser.role as 'manager' | 'billing', payrollMonth, termId: selectedTerm.id, ...values, actor }), 'Salary draft saved.')
  }

  async function finalize(employeeId: string) {
    const draft = payroll.drafts.find((item) => item.employeeUserId === employeeId)
    if (!draft) return
    const approved = await confirmation.confirm({ title: 'Finalize this salary slip?', details: [`Employee: ${draft.employeeName}`, `Month: ${payrollMonth}`], warning: 'Finalization creates immutable payroll evidence.', confirmLabel: 'Finalize' })
    if (!approved) return
    await run(() => finalizeSalarySlip(draft.id, actor), 'Salary slip finalized.')
  }

  async function recordPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!paymentSlip) return
    const form = new FormData(event.currentTarget)
    const paymentDate = String(form.get('paymentDate'))
    const method = String(form.get('paymentMethod')) as PayrollPaymentMethod
    const reference = String(form.get('paymentReference')).trim()
    const approved = await confirmation.confirm({ title: 'Record full outstanding salary payment?', details: [`Employee: ${paymentSlip.employeeName}`, `Amount: ${money(paymentSlip.outstandingPaise)}`, `Method: ${method}`], confirmLabel: 'Record Payment' })
    if (!approved) return
    await run(() => recordSalaryPayment({ slipId: paymentSlip.id, expectedRevision: paymentSlip.currentRevision, paymentDate, paymentMethod: method, paymentReference: reference, actor }), 'Salary payment recorded.')
    setPaymentSlip(null)
  }

  if (currentUser.role !== 'owner') {
    return (
      <PageLayout header={<PageHeader title="My Salary Slips" />}>
        {payroll.error ? <StatusPanel variant="destructive">{payroll.error}</StatusPanel> : null}
        {payroll.loading ? <StatusPanel>Loading salary slips...</StatusPanel> : null}
        {!payroll.loading && payroll.slips.length === 0 ? <StatusPanel>No finalized salary slips are available yet.</StatusPanel> : null}
        <div className="grid gap-card-gap lg:grid-cols-2">{payroll.slips.map((slip) => <Card key={slip.id}><CardContent className="flex items-center justify-between gap-3 pt-3"><div><p className="font-bold">{slip.payrollMonth}</p><p className="text-xs text-muted-foreground">Net {money(slip.currentCalculation.netPayPaise)}</p></div><div className="flex items-center gap-2"><Badge variant={paymentBadge(slip.paymentState)}>{slip.paymentState.replace('-', ' ')}</Badge><Button size="sm" variant="outline" onClick={() => setSelectedSlip(slip)}><Eye className="size-3.5" /> View</Button></div></CardContent></Card>)}</div>
        {selectedSlip ? <SalarySlipDetails slip={selectedSlip} onClose={() => setSelectedSlip(null)} /> : null}
      </PageLayout>
    )
  }

  return (
    <Tabs defaultValue="monthly" className="min-h-0 flex-1">
      <PageLayout header={(
        <PageHeader title="Payroll" tools={(
          <div className="flex min-w-0 flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <PageHeaderTabsList aria-label="Payroll sections" className="grid grid-cols-3">
              <PageHeaderTab value="monthly">Monthly</PageHeaderTab>
              <PageHeaderTab value="staff">Staff</PageHeaderTab>
              <PageHeaderTab value="employer">Employer</PageHeaderTab>
            </PageHeaderTabsList>
            <label className="flex shrink-0 items-center justify-between gap-1.5 text-xs font-medium text-muted-foreground sm:justify-start">
              <span>Month</span>
              <Input aria-label="Payroll month" className="h-8 w-36" min="2026-09" type="month" value={payrollMonth} onChange={(event) => { const nextMonth = event.target.value; if (!isPayrollMonth(nextMonth)) return; setPayrollMonth(nextMonth); setEntryEmployeeId(''); setSelectedSlip(null) }} />
            </label>
          </div>
        )} />
      )}>
      {error || payroll.error ? <StatusPanel variant="destructive">{error || payroll.error}</StatusPanel> : null}
      {payroll.loading ? <StatusPanel>Loading payroll...</StatusPanel> : null}

      <PageCardStack className="sm:grid-cols-3">
        <Card><CardContent className="pt-3"><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Net Payroll</p><p className="mt-1 text-lg font-black">{money(summary.net)}</p></CardContent></Card>
        <Card><CardContent className="pt-3"><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Paid</p><p className="mt-1 text-lg font-black text-success">{money(summary.paid)}</p></CardContent></Card>
        <Card><CardContent className="pt-3"><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Outstanding</p><p className="mt-1 text-lg font-black text-warning">{money(summary.outstanding)}</p></CardContent></Card>
      </PageCardStack>

        <TabsContent value="monthly" className="m-0 grid gap-card-gap">
          <Card><CardHeader><SectionHeading eyebrow="Month Settings" title="Paid Weekly Offs" description="This count locks after the first slip is finalized." /></CardHeader><CardContent><form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void run(() => savePayrollMonth({ payrollMonth, paidWeeklyOffDays: Number(form.get('paidWeeklyOffDays')), actor }), 'Payroll month configured.') }}><FieldLabel label="Days"><Input className="w-32" defaultValue={String(weeklyOffDays)} disabled={(payroll.month?.finalizedSlipCount ?? 0) > 0} max="31" min="0" name="paidWeeklyOffDays" type="number" /></FieldLabel><Button disabled={busy || (payroll.month?.finalizedSlipCount ?? 0) > 0}>Save</Button>{(payroll.month?.finalizedSlipCount ?? 0) > 0 ? <Badge variant="secondary">Locked</Badge> : null}</form></CardContent></Card>

          <div className="grid gap-2.5">{candidates.map((user) => {
            const term = selectPayrollTerm(payroll.terms, user.id, payrollMonth)
            const draft = payroll.drafts.find((item) => item.employeeUserId === user.id)
            const slip = payroll.slips.find((item) => item.employeeUserId === user.id)
            const enabled = enabledIds.has(user.id)
            return <Card key={user.id}><CardContent className="flex flex-wrap items-center justify-between gap-3 pt-3"><div><div className="flex items-center gap-2"><p className="font-bold">{user.name}</p><Badge variant={slip ? paymentBadge(slip.paymentState) : draft ? 'outline' : enabled && term ? 'secondary' : 'warning'}>{slip ? slip.paymentState.replace('-', ' ') : draft ? 'draft' : enabled && term ? 'ready' : 'setup needed'}</Badge></div><p className="text-xs text-muted-foreground">{term ? `${money(term.monthlySalaryPaise)} · ${term.requiredDailyMinutes / 60} hrs/day` : 'No applicable salary term'}</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => { setSetupEmployeeId(user.id) }}>Setup</Button>{enabled && term ? <Button size="sm" variant="outline" onClick={() => loadEntry(user.id)}>{slip ? 'Revise' : draft ? 'Edit Draft' : 'Enter Hours'}</Button> : null}{draft ? <Button disabled={busy} size="sm" onClick={() => void finalize(user.id)}>Finalize</Button> : null}{slip ? <Button size="sm" variant="outline" onClick={() => setSelectedSlip(slip)}>View</Button> : null}{slip && slip.outstandingPaise > 0 ? <Button disabled={busy} size="sm" onClick={() => setPaymentSlip(slip)}>Record Payment</Button> : null}</div></CardContent></Card>
          })}</div>

          {entryEmployeeId && selectedUser ? <Card><CardHeader><SectionHeading eyebrow={selectedFinalSlip ? 'Audited Revision' : 'Salary Entry'} title={`${selectedUser.name} · ${payrollMonth}`} description={selectedFinalSlip ? 'A reason is required and the earlier revision remains unchanged.' : 'Enter worked time, paid leave, and adjustments.'} /></CardHeader><CardContent><form className="space-y-4" onSubmit={saveEntry}><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><FieldLabel label="Worked Hours"><Input min="0" type="number" value={workedHours} onChange={(event) => setWorkedHours(event.target.value)} /></FieldLabel><FieldLabel label="Worked Minutes"><Input max="59" min="0" type="number" value={workedMinutes} onChange={(event) => setWorkedMinutes(event.target.value)} /></FieldLabel><FieldLabel label="Paid Leave Hours"><Input min="0" type="number" value={leaveHours} onChange={(event) => setLeaveHours(event.target.value)} /></FieldLabel><FieldLabel label="Paid Leave Minutes"><Input max="59" min="0" type="number" value={leaveMinutes} onChange={(event) => setLeaveMinutes(event.target.value)} /></FieldLabel></div><div className="grid gap-4 lg:grid-cols-2">{adjustmentRows(earnings, setEarnings, 'Earnings')}{adjustmentRows(deductions, setDeductions, 'Deductions')}</div>{selectedTerm ? (() => { try { const preview = calculateSalary({ payrollMonth, monthlySalaryPaise: selectedTerm.monthlySalaryPaise, requiredDailyMinutes: selectedTerm.requiredDailyMinutes, paidWeeklyOffDays: weeklyOffDays, workedMinutes: hoursAndMinutesToMinutes(Number(workedHours), Number(workedMinutes)), paidLeaveMinutes: hoursAndMinutesToMinutes(Number(leaveHours), Number(leaveMinutes)), earnings: parseAdjustments(earnings), deductions: parseAdjustments(deductions) }); return <StatusPanel variant="info">Preview net salary: {money(preview.netPayPaise)}</StatusPanel> } catch { return null } })() : null}<div className="flex gap-2"><Button disabled={busy}>{selectedFinalSlip ? 'Create Revision' : selectedDraft ? 'Update Draft' : 'Save Draft'}</Button><Button type="button" variant="ghost" onClick={() => setEntryEmployeeId('')}>Close</Button></div></form></CardContent></Card> : null}
          {paymentSlip ? <Card><CardHeader><SectionHeading eyebrow="Salary Payment" title={paymentSlip.employeeName} description={`Full outstanding payment: ${money(paymentSlip.outstandingPaise)}`} /></CardHeader><CardContent><form className="grid gap-3 sm:grid-cols-3" onSubmit={recordPayment}><FieldLabel label="Payment Date"><Input defaultValue={today()} name="paymentDate" required type="date" /></FieldLabel><FieldLabel label="Method"><NativeSelect defaultValue="Bank Transfer" name="paymentMethod"><option value="Cash">Cash</option><option value="Bank Transfer">Bank Transfer</option><option value="UPI">UPI</option><option value="Other">Other</option></NativeSelect></FieldLabel><FieldLabel label="Reference"><Input name="paymentReference" placeholder="Optional" /></FieldLabel><div className="flex gap-2 sm:col-span-3"><Button disabled={busy}>Record Full Payment</Button><Button type="button" variant="ghost" onClick={() => setPaymentSlip(null)}>Cancel</Button></div></form></CardContent></Card> : null}
          {selectedSlip ? <SalarySlipDetails slip={selectedSlip} onClose={() => setSelectedSlip(null)} /> : null}
        </TabsContent>

        <TabsContent value="staff" className="m-0 space-y-4">
          <div className="grid gap-3">{candidates.map((user) => <Card key={user.id}><CardContent className="flex items-center justify-between gap-3 pt-3"><div><p className="font-bold">{user.name}</p><p className="text-xs text-muted-foreground">{user.role} · {enabledIds.has(user.id) ? 'Payroll enabled' : 'Not enrolled'}</p></div><Button size="sm" variant="outline" onClick={() => setSetupEmployeeId(user.id)}>Manage</Button></CardContent></Card>)}</div>
          {setupEmployeeId ? (() => { const user = candidates.find((item) => item.id === setupEmployeeId); if (!user) return null; return <Card><CardHeader><SectionHeading eyebrow="Payroll Terms" title={user.name} description="Terms become effective from the selected month and remain immutable." /></CardHeader><CardContent className="space-y-4"><div className="flex items-center gap-2"><Button disabled={busy} variant={enabledIds.has(user.id) ? 'destructive' : 'default'} onClick={() => void run(() => savePayrollProfile({ employeeUserId: user.id, enabled: !enabledIds.has(user.id), actor }), enabledIds.has(user.id) ? 'Payroll disabled for staff member.' : 'Payroll enabled for staff member.')}>{enabledIds.has(user.id) ? 'Disable Payroll' : 'Enable Payroll'}</Button><Button variant="ghost" onClick={() => setSetupEmployeeId('')}>Close</Button></div>{enabledIds.has(user.id) ? <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const effectiveFromMonth = String(form.get('effectiveFromMonth')); const superseded = payroll.terms.filter((term) => term.employeeUserId === user.id && term.effectiveFromMonth === effectiveFromMonth).sort((a, b) => b.revision - a.revision)[0]; void run(() => createPayrollTerm({ employeeUserId: user.id, effectiveFromMonth, monthlySalaryPaise: rupeesToPayrollPaise(Number(form.get('monthlySalary'))), requiredDailyMinutes: hoursAndMinutesToMinutes(Number(form.get('dailyHours')), Number(form.get('dailyMinutes'))), supersedesTermId: superseded?.id, actor }), 'Salary terms saved.') }}><FieldLabel label="Effective Month"><Input defaultValue={payrollMonth} min="2026-09" name="effectiveFromMonth" type="month" /></FieldLabel><FieldLabel label="Monthly Salary"><Input min="0.01" name="monthlySalary" required step="0.01" type="number" /></FieldLabel><FieldLabel label="Daily Hours"><Input defaultValue="8" max="24" min="0" name="dailyHours" type="number" /></FieldLabel><FieldLabel label="Daily Minutes"><Input defaultValue="0" max="59" min="0" name="dailyMinutes" type="number" /></FieldLabel><div className="sm:col-span-2 lg:col-span-4"><Button disabled={busy}>Save Terms</Button></div></form> : null}</CardContent></Card> })() : null}
        </TabsContent>

        <TabsContent value="employer" className="m-0"><Card className="max-w-3xl"><CardHeader><SectionHeading eyebrow="Salary Slip Issuer" title="Employer Details" /></CardHeader><CardContent><form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void run(() => savePayrollSettings({ issuer: { name: String(form.get('name')), address: String(form.get('address')), contact: String(form.get('contact')) }, defaultPaidWeeklyOffDays: Number(form.get('defaultPaidWeeklyOffDays')), actor }), 'Payroll settings saved.') }}><FieldLabel label="Employer Name"><Input defaultValue={payroll.settings?.issuer.name ?? defaultPayrollSettings.issuer.name} name="name" required /></FieldLabel><FieldLabel label="Contact"><Input defaultValue={payroll.settings?.issuer.contact ?? ''} name="contact" /></FieldLabel><FieldLabel className="sm:col-span-2" label="Address"><Textarea defaultValue={payroll.settings?.issuer.address ?? ''} name="address" /></FieldLabel><FieldLabel label="Default Weekly Offs"><Input defaultValue={String(payroll.settings?.defaultPaidWeeklyOffDays ?? 4)} max="31" min="0" name="defaultPaidWeeklyOffDays" type="number" /></FieldLabel><div className="sm:col-span-2"><Button disabled={busy}>Save Employer Details</Button></div></form></CardContent></Card></TabsContent>
      </PageLayout>
      {confirmation.dialog}
    </Tabs>
  )
}
