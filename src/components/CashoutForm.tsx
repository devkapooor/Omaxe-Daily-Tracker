import { useState } from 'react'
import type { AppUser, Cashout, CashoutDraft, PaymentDraft } from '../domain/financeTypes'
import { cashoutCategories, cashoutPaymentModes, normalizeName, numberValue, singleStoreId, wordCount } from '../app/uiHelpers'
import { SearchableNameField } from './SearchableNameField'

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
  const [entryType, setEntryType] = useState<'expense' | 'payment-paid' | 'payment-received'>('expense')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [paidTo, setPaidTo] = useState('')
  const notesWordCount = wordCount(notes)
  const isExpense = entryType === 'expense'
  const isPaymentPaid = entryType === 'payment-paid'
  const formHeading = isExpense ? 'Record Expense' : isPaymentPaid ? 'Record Payment Paid' : 'Record Payment Received'
  const saveButtonLabel = isExpense ? 'Save Expense' : isPaymentPaid ? 'Save Payment Paid' : 'Save Payment Received'
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
        type: entryType === 'payment-paid' ? 'Paid' : 'Received',
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
    <form className="cashout-card cashout-form" onSubmit={handleSubmit}>
      <div className="card-title">
        <p className="eyebrow">New Entry</p>
        <h2>{formHeading}</h2>
      </div>

      <label>
        Entry Type
        <select
          value={entryType}
          onChange={(event) => {
            setEntryType(event.target.value as 'expense' | 'payment-paid' | 'payment-received')
            setError('')
          }}
        >
          <option value="expense">Expense</option>
          <option value="payment-paid">Payment Paid</option>
          <option value="payment-received">Payment Received</option>
        </select>
      </label>

      <label>
        Person / Party
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
      </label>

      <label>
        Amount
        <input name="amount" type="number" min="0" step="1" placeholder="0" required />
      </label>

      <label>
        {categoryLabel}
        <select name="category">
          {cashoutCategories.map((category) => (
            <option key={category}>{category}</option>
          ))}
        </select>
      </label>

      <label>
        Payment Mode
        <select name="paymentMode">
          {cashoutPaymentModes.map((mode) => (
            <option key={mode}>{mode}</option>
          ))}
        </select>
      </label>

      <label className="full-width">
        Notes
        <textarea
          name="notes"
          placeholder="Add details if needed"
          rows={3}
          value={notes}
          onChange={(event) => {
            setNotes(event.target.value)
            setError('')
          }}
        />
      </label>
      <div className={`word-limit ${notesWordCount > 50 ? 'over' : ''}`}>{notesWordCount}/50 words</div>
      {error && <p className="form-error light full-width">{error}</p>}

      <button className="primary full-width">{saveButtonLabel}</button>
    </form>
  )
}
