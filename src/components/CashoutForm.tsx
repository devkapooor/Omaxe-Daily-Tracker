import { useState } from 'react'
import type { AppUser, Cashout, CashoutDraft, PaymentDraft } from '@/domain/financeTypes'
import {
  cashoutCategories,
  cashoutPaymentModes,
  normalizeName,
  numberValue,
  singleStoreId,
  today,
  wordCount,
} from '@/app/uiHelpers'
import { SearchableSelect } from '@/components/SearchableSelect'
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
  onSaveCashout: (draft: CashoutDraft) => Promise<void> | void
  onSavePayment: (draft: PaymentDraft) => Promise<void> | void
}

export function CashoutForm({
  currentUser,
  peopleOptions,
  onSaveCashout,
  onSavePayment,
}: CashoutFormProps) {
  const [entryType, setEntryType] = useState<'expense' | 'vendor-payment' | 'loan-payment'>('expense')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [partyName, setPartyName] = useState('')
  const notesWordCount = wordCount(notes)
  const isExpense = entryType === 'expense'
  const isLoanPayment = entryType === 'loan-payment'
  const formHeading = isExpense ? 'Record Expense' : isLoanPayment ? 'Record Loan Payment' : 'Record Vendor Payment'
  const saveButtonLabel = isExpense ? 'Save Expense' : isLoanPayment ? 'Save Loan Payment' : 'Save Vendor Payment'
  const categoryLabel = isExpense ? 'Category' : 'Purpose'
  const partyLabel = isExpense ? 'Person / Party' : isLoanPayment ? 'Loan Party' : 'Vendor / Party'

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const isApprover = currentUser.role === 'owner' || currentUser.role === 'manager'
    const trimmedNotes = notes.trim()
    const partyValue = normalizeName(partyName)

    if (notesWordCount > 50) {
      setError('Notes cannot be more than 50 words.')
      return
    }
    if (!partyValue) {
      setError('Choose a name from the list.')
      return
    }

    const amount = numberValue(form.get('amount'))
    const category = String(form.get('category') || 'Miscellaneous')
    const paymentMode = String(form.get('paymentMode')) as Cashout['paymentMode']
    const date = today()

    try {
      if (entryType === 'expense') {
        await onSaveCashout({
          storeId: singleStoreId,
          date,
          paidTo: partyValue,
          amount,
          category,
          paymentMode,
          approvedBy: isApprover ? currentUser.name : 'Pending approval',
          notes: trimmedNotes,
        })
      } else {
        await onSavePayment({
          storeId: singleStoreId,
          date,
          type: 'Paid',
          entryType,
          partyName: partyValue,
          amount,
          paymentMode,
          notes: category ? `${category}${trimmedNotes ? ` - ${trimmedNotes}` : ''}` : trimmedNotes,
        })
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save this register entry.')
      return
    }

    setNotes('')
    setPartyName('')
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
                setEntryType(event.target.value as 'expense' | 'vendor-payment' | 'loan-payment')
                setError('')
              }}
            >
              <option value="expense">Expense</option>
              <option value="vendor-payment">Vendor Payment</option>
              <option value="loan-payment">Loan Payment</option>
            </NativeSelect>
          </FieldLabel>

          <FieldLabel label={partyLabel}>
            <SearchableSelect
              options={peopleOptions}
              placeholder="Search and select from saved names"
              value={partyName}
              onValueChange={(value) => {
                setPartyName(value)
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
