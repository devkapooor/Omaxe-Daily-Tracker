import { useState } from 'react'
import type { LoanEntry } from '@/domain/appTypes'
import { normalizeName, numberValue, today } from '@/app/uiHelpers'
import { SearchableSelect } from '@/components/SearchableSelect'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { FieldLabel } from '@/components/ui/field-label'
import { Input } from '@/components/ui/input'
import { SectionHeading } from '@/components/ui/section-heading'

type LoanFormProps = {
  peopleOptions: string[]
  onSave: (draft: Omit<LoanEntry, 'id' | 'createdAt' | 'paidAmount' | 'remainingAmount' | 'status' | 'settledAt' | 'updatedAt'>) => Promise<void> | void
}

export function LoanForm({ peopleOptions, onSave }: LoanFormProps) {
  const [error, setError] = useState('')
  const [personName, setPersonName] = useState('')
  const [entryDate, setEntryDate] = useState(today())
  const [promisedPayoffDate, setPromisedPayoffDate] = useState(today())

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const normalizedPersonName = normalizeName(personName)
    const amount = numberValue(form.get('amount'))
    const date = String(form.get('date') || '')
    const payoff = String(form.get('promisedPayoffDate') || '')

    if (!normalizedPersonName) {
      setError('Choose a party from the saved list.')
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

    try {
      await onSave({
        personName: normalizedPersonName,
        amount,
        date,
        promisedPayoffDate: payoff,
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save the loan.')
      return
    }
    setError('')
    setPersonName('')
    event.currentTarget.reset()
    setEntryDate(today())
    setPromisedPayoffDate(today())
  }

  return (
    <Card className="flex h-full min-h-0 flex-col">
      <CardHeader>
        <SectionHeading eyebrow="New Entry" title="Loan Taken" />
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto">
        <form className="grid gap-5 md:grid-cols-2" onSubmit={handleSubmit}>
          <FieldLabel label="Person Name">
            <SearchableSelect
              options={peopleOptions}
              placeholder="Search and select from saved parties"
              value={personName}
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
