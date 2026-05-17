import { useState } from 'react'
import type { AppUser, Cashout, CashoutDraft } from '@/domain/financeTypes'
import {
  cashoutCategories,
  cashoutPaymentModes,
  numberValue,
  singleStoreId,
  today,
  wordCount,
} from '@/app/uiHelpers'
import { ChequeDetailsModal } from '@/components/ChequeDetailsModal'
import { useChequeDetails } from '@/components/useChequeDetails'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { FieldLabel } from '@/components/ui/field-label'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { SectionHeading } from '@/components/ui/section-heading'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

type ExpenseFormProps = {
  currentUser: AppUser
  onSave: (draft: CashoutDraft) => Promise<void> | void
}

export function ExpenseForm({ currentUser, onSave }: ExpenseFormProps) {
  const expenseCategories = cashoutCategories.filter((item) => item !== 'Stock Purchase' && item !== 'Loan Repayment')
  const [amount, setAmount] = useState('0')
  const [category, setCategory] = useState(expenseCategories[0] ?? 'Rent')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const notesWordCount = wordCount(notes)
  const {
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
  } = useChequeDetails(setError)

  function resetForm() {
    setAmount('0')
    setCategory(expenseCategories[0] ?? 'Rent')
    setNotes('')
    setError('')
    resetChequeDetails()
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const isApprover = currentUser.role === 'owner' || currentUser.role === 'manager'
    const trimmedNotes = notes.trim()

    if (notesWordCount > 50) {
      setError('Notes cannot be more than 50 words.')
      return
    }
    if (!ensureChequeDetails()) return

    try {
      await onSave({
        storeId: singleStoreId,
        date: today(),
        paidTo: category,
        amount: numberValue(amount),
        category,
        paymentMode,
        chequeNumber: isChequeMode ? chequeNumber.trim() : undefined,
        chequePayDate: isChequeMode ? chequePayDate : undefined,
        approvedBy: isApprover ? currentUser.name : 'Pending approval',
        notes: trimmedNotes,
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save this expense.')
      return
    }

    resetForm()
  }

  return (
    <>
      <Card className="flex h-full min-h-0 flex-col">
        <CardHeader>
          <SectionHeading eyebrow="New Entry" title="Record Expense" />
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto">
          <form className="grid gap-5 md:grid-cols-2" onSubmit={handleSubmit}>
            <FieldLabel label="Amount">
              <Input
                name="amount"
                type="number"
                min="0"
                step="1"
                placeholder="0"
                required
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value)
                  setError('')
                }}
              />
            </FieldLabel>

            <FieldLabel label="Category">
              <NativeSelect
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value)
                  setError('')
                }}
              >
                {expenseCategories.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </NativeSelect>
            </FieldLabel>

            <FieldLabel label="Payment Mode">
              <NativeSelect
                value={paymentMode}
                onChange={(event) => {
                  handlePaymentModeChange(event.target.value as Cashout['paymentMode'])
                }}
              >
                {cashoutPaymentModes.map((mode) => (
                  <option key={mode}>{mode}</option>
                ))}
              </NativeSelect>
            </FieldLabel>

            <FieldLabel className="md:col-span-2" label="Notes">
              <Textarea
                placeholder="Add details if needed"
                rows={3}
                value={notes}
                onChange={(event) => {
                  setNotes(event.target.value)
                  setError('')
                }}
              />
            </FieldLabel>

            <div className={cn('text-right text-xs font-bold text-muted-foreground md:col-span-2', notesWordCount > 50 && 'text-destructive')}>
              {notesWordCount}/50 words
            </div>
            {error ? <p className="text-sm font-semibold text-destructive md:col-span-2">{error}</p> : null}

            <Button className="md:col-span-2">Save Expense</Button>
          </form>
        </CardContent>
      </Card>

      {isChequeModalOpen ? (
        <ChequeDetailsModal
          chequeNumber={chequeNumber}
          chequePayDate={chequePayDate}
          error={error}
          onChequeNumberChange={(value) => {
            setChequeNumber(value)
            setError('')
          }}
          onChequePayDateChange={(value) => {
            setChequePayDate(value)
            setError('')
          }}
          onClose={() => setIsChequeModalOpen(false)}
          onConfirm={confirmChequeDetails}
        />
      ) : null}
    </>
  )
}
