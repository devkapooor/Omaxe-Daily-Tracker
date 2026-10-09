import { useState } from 'react'
import type { Cashout, PaymentDraft } from '@/domain/financeTypes'
import type { LoanEntry } from '@/domain/appTypes'
import { formatDisplayDate, money, normalizeName, singleStoreId, today, wordCount } from '@/app/uiHelpers'
import { parseLoanAmount } from '@/domain/loanMoney'
import { ChequeDetailsModal } from '@/features/register/components/ChequeDetailsModal'
import { SearchableSelect } from '@/shared/ui/searchable-select'
import { useChequeDetails } from '@/features/register/components/useChequeDetails'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { FieldLabel } from '@/shared/ui/field-label'
import { Input } from '@/shared/ui/input'
import { NativeSelect } from '@/shared/ui/native-select'
import { SelectField } from '@/shared/ui/select-field'
import { SectionHeading } from '@/shared/ui/section-heading'
import { Textarea } from '@/shared/ui/textarea'
import { cn } from '@/shared/lib/utils'

type LoanRepaymentFormProps = {
  loans: LoanEntry[]
  onSave: (draft: PaymentDraft) => Promise<void> | void
}

export function LoanRepaymentForm({ loans, onSave }: LoanRepaymentFormProps) {
  const [personName, setPersonName] = useState('')
  const [loanId, setLoanId] = useState('')
  const [amount, setAmount] = useState('0')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const notesWordCount = wordCount(notes)
  const openLoans = loans.filter((loan) => loan.remainingAmount > 0)
  const lenderNames = [...new Set(openLoans.map((loan) => normalizeName(loan.personName)))].sort((a, b) => a.localeCompare(b))
  const partyLoans = openLoans.filter((loan) => normalizeName(loan.personName).toLowerCase() === personName.toLowerCase())
  const selectedLoan = partyLoans.find((loan) => loan.id === loanId)
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
    setPersonName('')
    setLoanId('')
    setAmount('0')
    setNotes('')
    setError('')
    resetChequeDetails()
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedPersonName = normalizeName(personName)
    const trimmedNotes = notes.trim()

    if (!normalizedPersonName) {
      setError('Choose a party from the list.')
      return
    }
    if (!selectedLoan || selectedLoan.remainingAmount <= 0) {
      setError('Choose an open loan to repay.')
      return
    }
    if (notesWordCount > 50) {
      setError('Notes cannot be more than 50 words.')
      return
    }
    if (!ensureChequeDetails()) return

    try {
      const repaymentAmount = parseLoanAmount(amount)
      if (repaymentAmount > selectedLoan.remainingAmount) {
        setError(`Repayment cannot exceed this loan's remaining balance of ${money(selectedLoan.remainingAmount)}.`)
        return
      }
      await onSave({
        storeId: singleStoreId,
        date: today(),
        type: 'Paid',
        entryType: 'loan-payment',
        loanId: selectedLoan.id,
        partyName: normalizedPersonName,
        amount: repaymentAmount,
        paymentMode,
        chequeNumber: isChequeMode ? chequeNumber.trim() : undefined,
        chequePayDate: isChequeMode ? chequePayDate : undefined,
        notes: trimmedNotes ? `Loan Repayment - ${trimmedNotes}` : 'Loan Repayment',
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save this loan repayment.')
      return
    }

    resetForm()
  }

  return (
    <>
      <Card className="flex h-full min-h-0 flex-col">
        <CardHeader>
          <SectionHeading eyebrow="New Entry" title="Loan Repayment" />
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto">
          <form className="grid gap-5 md:grid-cols-2" onSubmit={handleSubmit}>
            <FieldLabel label="Loan Party">
              <SearchableSelect
                options={lenderNames}
                placeholder={lenderNames.length ? 'Search lenders with open loans' : 'No loans currently outstanding'}
                value={personName}
                onValueChange={(value) => {
                  setPersonName(value)
                  setLoanId('')
                  setError('')
                }}
              />
            </FieldLabel>

            <FieldLabel label="Loan">
              <SelectField
                options={partyLoans.map((loan) => ({
                  value: loan.id,
                  label: `${formatDisplayDate(loan.date)} · Principal ${money(loan.amount)} · Note: ${loan.notes?.trim() || 'No note'} · Remaining ${money(loan.remainingAmount)}`,
                  keywords: [loan.date, loan.amount.toString(), loan.notes ?? '', loan.remainingAmount.toString()],
                }))}
                placeholder="Select an open loan"
                value={loanId}
                required
                disabled={!personName || partyLoans.length === 0}
                onValueChange={(value) => {
                  const loan = partyLoans.find((candidate) => candidate.id === value)
                  setLoanId(value)
                  setAmount(loan ? String(loan.remainingAmount) : '0')
                  setError('')
                }}
              />
            </FieldLabel>

            {selectedLoan ? <p className="text-sm font-semibold text-muted-foreground md:col-span-2">Selected loan balance: <span className="text-foreground">{money(selectedLoan.remainingAmount)}</span></p> : null}

            <FieldLabel label="Amount">
              <Input
                type="number"
                min="0.01"
                max={selectedLoan?.remainingAmount}
                step="0.01"
                inputMode="decimal"
                placeholder="0.00"
                required
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value)
                  setError('')
                }}
              />
            </FieldLabel>

            <FieldLabel label="Purpose">
              <Input value="Loan Repayment" readOnly disabled />
            </FieldLabel>

            <FieldLabel label="Payment Mode">
              <NativeSelect
                value={paymentMode}
                onChange={(event) => {
                  handlePaymentModeChange(event.target.value as Cashout['paymentMode'])
                }}
              >
                <option>Cash</option>
                <option>Bank Transfer</option>
                <option>Cheque</option>
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

            <Button className="md:col-span-2">Save Loan Repayment</Button>
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

