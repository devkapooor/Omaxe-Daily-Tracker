import { useState } from 'react'
import type { AppUser, Cashout, CashoutDraft, PaymentDraft } from '@/domain/financeTypes'
import {
  cashoutCategories,
  cashoutPaymentModes,
  normalizeName,
  numberValue,
  singleStoreId,
  wordCount,
} from '@/app/uiHelpers'
import { SearchableNameField } from '@/components/SearchableNameField'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { FieldLabel } from '@/components/ui/field-label'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { SectionHeading } from '@/components/ui/section-heading'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

type CashoutFormProps = {
  currentUser: AppUser
  peopleOptions: string[]
  onCreatePerson: (name: string) => boolean
  onSaveCashout: (draft: CashoutDraft) => void
  onSavePayment: (draft: PaymentDraft) => void
}

export function CashoutForm({
  currentUser,
  peopleOptions,
  onCreatePerson,
  onSaveCashout,
  onSavePayment,
}: CashoutFormProps) {
  const [entryType, setEntryType] = useState<'expense' | 'payment-paid'>('expense')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [paidTo, setPaidTo] = useState('')
  const notesWordCount = wordCount(notes)
  const isExpense = entryType === 'expense'
  const formHeading = isExpense ? 'Record Expense' : 'Record Payment Paid'
  const saveButtonLabel = isExpense ? 'Save Expense' : 'Save Payment Paid'
  const categoryLabel = isExpense ? 'Category' : 'Purpose'

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const now = new Date()
    const isApprover = currentUser.role === 'owner' || currentUser.role === 'manager'
    const trimmedNotes = notes.trim()
    const paidToValue = normalizeName(String(form.get('paidTo') || ''))

    if (notesWordCount > 50) {
      setError('Notes cannot be more than 50 words.')
      return
    }
    if (!paidToValue) {
      setError('Person name is required.')
      return
    }

    onCreatePerson(paidToValue)

    const amount = numberValue(form.get('amount'))
    const category = String(form.get('category') || 'Miscellaneous')
    const paymentMode = String(form.get('paymentMode')) as Cashout['paymentMode']
    const date = now.toISOString().slice(0, 10)

    if (entryType === 'expense') {
      onSaveCashout({
        storeId: singleStoreId,
        date,
        paidTo: paidToValue,
        amount,
        category,
        paymentMode,
        approvedBy: isApprover ? currentUser.name : 'Pending approval',
        notes: trimmedNotes,
      })
    } else {
      onSavePayment({
        storeId: singleStoreId,
        date,
        type: 'Paid',
        partyName: paidToValue,
        amount,
        paymentMode,
        notes: category ? `${category}${trimmedNotes ? ` - ${trimmedNotes}` : ''}` : trimmedNotes,
      })
    }

    setNotes('')
    setPaidTo('')
    setError('')
    event.currentTarget.reset()
  }

  return (
    <Card>
      <CardHeader>
        <SectionHeading eyebrow="New Entry" title={formHeading} />
      </CardHeader>
      <CardContent>
        <form className="grid gap-5 md:grid-cols-2" onSubmit={handleSubmit}>
          <FieldLabel label="Entry Type">
            <NativeSelect
              value={entryType}
              onChange={(event) => {
                setEntryType(event.target.value as 'expense' | 'payment-paid')
                setError('')
              }}
            >
              <option value="expense">Expense</option>
              <option value="payment-paid">Payment Paid</option>
            </NativeSelect>
          </FieldLabel>

          <FieldLabel label="Person / Party">
            <SearchableNameField
              name="paidTo"
              options={peopleOptions}
              placeholder="Search or add person"
              value={paidTo}
              onCreate={onCreatePerson}
              onValueChange={(value) => {
                setPaidTo(value)
                setError('')
              }}
            />
          </FieldLabel>

          <FieldLabel label="Amount">
            <Input name="amount" type="number" min="0" step="1" placeholder="0" required />
          </FieldLabel>

          <FieldLabel label={categoryLabel}>
            <NativeSelect name="category">
              {cashoutCategories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </NativeSelect>
          </FieldLabel>

          <FieldLabel label="Payment Mode">
            <NativeSelect name="paymentMode">
              {cashoutPaymentModes.map((mode) => (
                <option key={mode}>{mode}</option>
              ))}
            </NativeSelect>
          </FieldLabel>

          <FieldLabel className="md:col-span-2" label="Notes">
            <Textarea
              name="notes"
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
          {error && <p className="text-sm font-semibold text-destructive md:col-span-2">{error}</p>}

          <Button className="md:col-span-2">{saveButtonLabel}</Button>
        </form>
      </CardContent>
    </Card>
  )
}
