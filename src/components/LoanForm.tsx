import { useState } from 'react'
import type { LoanEntry } from '@/domain/appTypes'
import { normalizeName, numberValue, today } from '@/app/uiHelpers'
import { SearchableNameField } from '@/components/SearchableNameField'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { FieldLabel } from '@/components/ui/field-label'
import { Input } from '@/components/ui/input'
import { SectionHeading } from '@/components/ui/section-heading'

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
    <Card>
      <CardHeader>
        <SectionHeading eyebrow="New Entry" title="Loan Taken" />
      </CardHeader>
      <CardContent>
        <form className="grid gap-5 md:grid-cols-2" onSubmit={handleSubmit}>
          <FieldLabel label="Person Name">
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
          </FieldLabel>

          <FieldLabel label="Amount">
            <Input name="amount" type="number" min="0" step="1" placeholder="0" required onChange={() => setError('')} />
          </FieldLabel>

          <FieldLabel label="Date">
            <Input
              name="date"
              type="date"
              value={entryDate}
              onChange={(event) => {
                setEntryDate(event.target.value)
                setError('')
              }}
              required
            />
          </FieldLabel>

          <FieldLabel label="Promised Payoff Date">
            <Input
              name="promisedPayoffDate"
              type="date"
              value={promisedPayoffDate}
              onChange={(event) => {
                setPromisedPayoffDate(event.target.value)
                setError('')
              }}
              required
            />
          </FieldLabel>

          {error && <p className="text-sm font-semibold text-destructive md:col-span-2">{error}</p>}
          <Button className="md:col-span-2">Save Loan</Button>
        </form>
      </CardContent>
    </Card>
  )
}
