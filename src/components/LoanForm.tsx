import { useState } from 'react'
import type { LoanEntry } from '../domain/appTypes'
import { normalizeName, numberValue, today } from '../app/uiHelpers'
import { SearchableNameField } from './SearchableNameField'

type LoanFormProps = {
  peopleOptions: string[]
  onCreatePerson: (name: string) => boolean
  onSave: (draft: Omit<LoanEntry, 'id' | 'createdAt'>) => void
}

export function LoanForm({ peopleOptions, onCreatePerson, onSave }: LoanFormProps) {
  const [error, setError] = useState('')
  const [personName, setPersonName] = useState('')
  const [entryDate, setEntryDate] = useState(today())
  const [promisedPayoffDate, setPromisedPayoffDate] = useState(today())

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const normalizedPersonName = normalizeName(String(form.get('personName') || ''))
    const amount = numberValue(form.get('amount'))
    const date = String(form.get('date') || '')
    const payoff = String(form.get('promisedPayoffDate') || '')

    if (!normalizedPersonName) {
      setError('Person name is required.')
      return
    }
    if (amount <= 0) {
      setError('Amount must be greater than zero.')
      return
    }
    if (!date || !payoff) {
      setError('Both dates are required.')
      return
    }

    onCreatePerson(normalizedPersonName)
    onSave({
      personName: normalizedPersonName,
      amount,
      date,
      promisedPayoffDate: payoff,
    })
    setError('')
    setPersonName('')
    event.currentTarget.reset()
    setEntryDate(today())
    setPromisedPayoffDate(today())
  }

  return (
    <form className="cashout-card purchase-form" onSubmit={handleSubmit}>
      <div className="card-title">
        <p className="eyebrow">New Entry</p>
        <h2>Loan Taken</h2>
      </div>
      <label>
        Person Name
        <SearchableNameField
          name="personName"
          options={peopleOptions}
          placeholder="Search or add person"
          value={personName}
          onCreate={onCreatePerson}
          onValueChange={(value) => {
            setPersonName(value)
            setError('')
          }}
        />
      </label>
      <label>
        Amount
        <input name="amount" type="number" min="0" step="1" placeholder="0" required onChange={() => setError('')} />
      </label>
      <label>
        Date
        <input
          name="date"
          type="date"
          value={entryDate}
          onChange={(event) => {
            setEntryDate(event.target.value)
            setError('')
          }}
          required
        />
      </label>
      <label>
        Promised Payoff Date
        <input
          name="promisedPayoffDate"
          type="date"
          value={promisedPayoffDate}
          onChange={(event) => {
            setPromisedPayoffDate(event.target.value)
            setError('')
          }}
          required
        />
      </label>
      {error && <p className="form-error light full-width">{error}</p>}
      <button className="primary full-width">Save Loan</button>
    </form>
  )
}
