import { useMemo, useState } from 'react'
import type { Cashout, Payment } from '@/domain/financeTypes'
import type { CashHolder, PlannedPayment } from '@/domain/appTypes'
import { formatDisplayDate, money, numberValue } from '@/app/uiHelpers'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { FieldLabel } from '@/shared/ui/field-label'
import { Input } from '@/shared/ui/input'
import { SectionHeading } from '@/shared/ui/section-heading'
import { GlowCard } from '@/shared/ui/spotlight-card'
import { Textarea } from '@/shared/ui/textarea'

type PaymentPlannerPageProps = {
  currentBankBalance: number
  expenses: Cashout[]
  payments: Payment[]
  plannedPayments: PlannedPayment[]
  pendingCashBalances: Record<CashHolder, number>
  onSaveBankBalance: (currentBankBalance: number) => Promise<void>
  onSavePlannedPayment: (draft: Omit<PlannedPayment, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  onDeletePlannedPayment: (paymentId: string) => Promise<void>
  currentUserName: string
}

type PlannerItem = {
  id: string
  amount: number
  date: string
  note: string
  source: 'expense-cheque' | 'vendor-cheque' | 'manual-plan'
  title: string
  chequeNumber?: string
}

export function PaymentPlannerPage({
  currentBankBalance,
  expenses,
  payments,
  plannedPayments,
  pendingCashBalances,
  onSaveBankBalance,
  onSavePlannedPayment,
  onDeletePlannedPayment,
  currentUserName,
}: PaymentPlannerPageProps) {
  const [bankBalanceInput, setBankBalanceInput] = useState(String(currentBankBalance))
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [amount, setAmount] = useState('0')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  const totalCounterCash = useMemo(
    () => Object.values(pendingCashBalances).reduce((total, value) => total + value, 0),
    [pendingCashBalances],
  )

  const plannerItems = useMemo<PlannerItem[]>(() => {
    const chequeExpenses = expenses
      .filter((entry) => entry.paymentMode === 'Cheque' && entry.chequePayDate)
      .map((entry) => ({
        id: `expense-${entry.id}`,
        amount: entry.amount,
        date: entry.chequePayDate!,
        note: entry.notes,
        source: 'expense-cheque' as const,
        title: entry.paidTo,
        chequeNumber: entry.chequeNumber,
      }))

    const vendorCheques = payments
      .filter((entry) => entry.paymentMode === 'Cheque' && entry.type === 'Paid' && entry.entryType === 'vendor-payment' && entry.chequePayDate)
      .map((entry) => ({
        id: `payment-${entry.id}`,
        amount: entry.amount,
        date: entry.chequePayDate!,
        note: entry.notes,
        source: 'vendor-cheque' as const,
        title: entry.partyName,
        chequeNumber: entry.chequeNumber,
      }))

    const manualPlans = plannedPayments.map((entry) => ({
      id: entry.id,
      amount: entry.amount,
      date: entry.date,
      note: entry.notes,
      source: 'manual-plan' as const,
      title: entry.title,
    }))

    return [...chequeExpenses, ...vendorCheques, ...manualPlans].sort((a, b) => {
      const dateSort = a.date.localeCompare(b.date)
      if (dateSort !== 0) return dateSort
      return a.title.localeCompare(b.title)
    })
  }, [expenses, payments, plannedPayments])

  const groupedSchedule = useMemo(() => {
    let runningBalance = currentBankBalance
    const groups: Array<{
      date: string
      items: Array<PlannerItem & { runningBalanceAfter: number; status: 'available' | 'deficit' }>
      totalAmount: number
    }> = []

    plannerItems.forEach((item) => {
      runningBalance -= item.amount
      const status: 'available' | 'deficit' = runningBalance >= 0 ? 'available' : 'deficit'
      const lastGroup = groups[groups.length - 1]
      const enriched = { ...item, runningBalanceAfter: runningBalance, status }

      if (lastGroup && lastGroup.date === item.date) {
        lastGroup.items.push(enriched)
        lastGroup.totalAmount += item.amount
        return
      }

      groups.push({
        date: item.date,
        items: [enriched],
        totalAmount: item.amount,
      })
    })

    return groups
  }, [currentBankBalance, plannerItems])

  async function submitBankBalance(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = numberValue(bankBalanceInput)
    try {
      setError('')
      await onSaveBankBalance(value)
      setBankBalanceInput(String(value))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update the bank balance.')
    }
  }

  async function submitManualPlan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const plannedAmount = numberValue(amount)

    if (!title.trim()) {
      setError('Enter a title or payee for the planned payment.')
      return
    }
    if (!date) {
      setError('Choose the planned deduction date.')
      return
    }
    if (plannedAmount <= 0) {
      setError('Planned payment amount must be greater than zero.')
      return
    }

    try {
      setError('')
      await onSavePlannedPayment({
        title: title.trim(),
        date,
        amount: plannedAmount,
        notes: notes.trim(),
        createdBy: currentUserName,
      })
      setTitle('')
      setDate('')
      setAmount('0')
      setNotes('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save the planned payment.')
    }
  }

  return (
    <section className="grid min-h-0 flex-1 gap-3 overflow-hidden xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      <div className="grid min-h-0 gap-3">
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <SectionHeading eyebrow="Funds" title="Current Bank Balance" />
            </CardHeader>
            <CardContent>
              <form className="grid gap-3" onSubmit={submitBankBalance}>
                <FieldLabel label="Available Bank Balance">
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={bankBalanceInput}
                    onChange={(event) => {
                      setBankBalanceInput(event.target.value)
                      setError('')
                    }}
                  />
                </FieldLabel>
                <Button>Update Bank Balance</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <SectionHeading eyebrow="Reference" title="Counter Cash Snapshot" />
            </CardHeader>
            <CardContent className="space-y-1.5">
              <p className="text-xl font-black tracking-tight text-foreground">{money(totalCounterCash)}</p>
              <p className="text-sm text-muted-foreground">
                Counter cash is shown for reference from the cashout and cash movement records. Planner availability is checked only against bank balance.
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="flex min-h-0 flex-col">
          <CardHeader className="pb-3">
            <SectionHeading eyebrow="Manual Plan" title="Add Planned Deduction" />
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto">
            <form className="grid gap-3.5 md:grid-cols-2" onSubmit={submitManualPlan}>
              <FieldLabel label="Title / Payee">
                <Input
                  value={title}
                  placeholder="Supplier, rent, salary, etc."
                  onChange={(event) => {
                    setTitle(event.target.value)
                    setError('')
                  }}
                />
              </FieldLabel>
              <FieldLabel label="Deduction Date">
                <Input
                  type="date"
                  value={date}
                  onChange={(event) => {
                    setDate(event.target.value)
                    setError('')
                  }}
                />
              </FieldLabel>
              <FieldLabel label="Amount">
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={amount}
                  onChange={(event) => {
                    setAmount(event.target.value)
                    setError('')
                  }}
                />
              </FieldLabel>
              <FieldLabel label="Notes">
                <Textarea
                  rows={3}
                  value={notes}
                  placeholder="Optional context"
                  onChange={(event) => {
                    setNotes(event.target.value)
                    setError('')
                  }}
                />
              </FieldLabel>
              {error ? <p className="text-sm font-semibold text-destructive md:col-span-2">{error}</p> : null}
              <Button className="md:col-span-2">Save Planned Payment</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card className="flex min-h-0 flex-col">
        <CardHeader className="pb-3">
          <SectionHeading eyebrow="Schedule" title="Upcoming Deductions" />
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-hidden">
          <div className="min-h-0 space-y-3 overflow-y-auto pr-1">
            {groupedSchedule.length === 0 ? (
              <p className="text-sm font-medium text-muted-foreground">No upcoming cheque deductions or manual plans yet.</p>
            ) : null}
            {groupedSchedule.map((group) => (
              <GlowCard key={group.date} className="bg-[linear-gradient(180deg,rgba(245,248,242,0.92),rgba(242,246,239,0.82))] p-3.5" spotlightSize={180}>
                <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-muted-foreground">Deduction Date</p>
                    <p className="text-base font-black text-foreground">{formatDisplayDate(group.date)}</p>
                  </div>
                  <Badge variant="outline">Total {money(group.totalAmount)}</Badge>
                </div>
                <div className="space-y-2.5">
                  {group.items.map((item) => (
                    <GlowCard key={item.id} className="rounded-[16px] p-3.5 text-sm text-foreground" spotlightSize={160}>
                      <div className="flex flex-wrap items-start justify-between gap-2.5">
                        <div className="space-y-1">
                          <p className="font-bold">{item.title}</p>
                          <p className="text-muted-foreground">
                            {item.source === 'expense-cheque'
                              ? 'Expense Cheque'
                              : item.source === 'vendor-cheque'
                                ? 'Vendor Payment Cheque'
                                : 'Manual Planned Payment'}
                            {item.chequeNumber ? ` | Cheque ${item.chequeNumber}` : ''}
                          </p>
                          {item.note ? <p className="text-muted-foreground">{item.note}</p> : null}
                        </div>
                        <div className="text-right">
                          <p className="font-bold">{money(item.amount)}</p>
                          <Badge variant={item.status === 'deficit' ? 'destructive' : 'outline'}>
                            {item.status === 'deficit' ? 'Funds Not Available' : 'Funds Available'}
                          </Badge>
                          <p className="mt-2 text-xs font-medium text-muted-foreground">
                            Running balance {money(item.runningBalanceAfter)}
                          </p>
                        </div>
                      </div>
                      {item.source === 'manual-plan' ? (
                        <div className="mt-3">
                          <Button variant="outline" size="sm" onClick={() => void onDeletePlannedPayment(item.id)}>
                            Delete Manual Plan
                          </Button>
                        </div>
                      ) : null}
                    </GlowCard>
                  ))}
                </div>
              </GlowCard>
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  )
}

