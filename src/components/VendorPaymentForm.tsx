import { useState } from 'react'
import type { Cashout, PaymentDraft } from '@/domain/financeTypes'
import { normalizeName, numberValue, singleStoreId, today, wordCount } from '@/app/uiHelpers'
import { ChequeDetailsModal } from '@/components/ChequeDetailsModal'
import { SearchableSelect } from '@/components/SearchableSelect'
import { useChequeDetails } from '@/components/useChequeDetails'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { FieldLabel } from '@/components/ui/field-label'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { SectionHeading } from '@/components/ui/section-heading'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

type VendorPaymentFormProps = {
  vendorOptions: string[]
  onSave: (draft: PaymentDraft) => Promise<void> | void
}

export function VendorPaymentForm({ vendorOptions, onSave }: VendorPaymentFormProps) {
  const [vendorName, setVendorName] = useState('')
  const [amount, setAmount] = useState('0')
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
    setVendorName('')
    setAmount('0')
    setNotes('')
    setError('')
    resetChequeDetails()
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedVendorName = normalizeName(vendorName)
    const trimmedNotes = notes.trim()

    if (!normalizedVendorName) {
      setError('Choose a vendor from the list.')
      return
    }
    if (notesWordCount > 50) {
      setError('Notes cannot be more than 50 words.')
      return
    }
    if (!ensureChequeDetails()) return

    try {
      await onSave({
        storeId: singleStoreId,
        date: today(),
        type: 'Paid',
        entryType: 'vendor-payment',
        partyName: normalizedVendorName,
        amount: numberValue(amount),
        paymentMode,
        chequeNumber: isChequeMode ? chequeNumber.trim() : undefined,
        chequePayDate: isChequeMode ? chequePayDate : undefined,
        notes: trimmedNotes ? `Stock Purchase - ${trimmedNotes}` : 'Stock Purchase',
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save this vendor payment.')
      return
    }

    resetForm()
  }

  return (
    <>
      <Card className="flex h-full min-h-0 flex-col">
        <CardHeader>
          <SectionHeading eyebrow="New Entry" title="Record Vendor Payment" />
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto">
          <form className="grid gap-5 md:grid-cols-2" onSubmit={handleSubmit}>
            <FieldLabel label="Vendor">
              <SearchableSelect
                options={vendorOptions}
                placeholder="Search and select vendor"
                value={vendorName}
                onValueChange={(value) => {
                  setVendorName(value)
                  setError('')
                }}
              />
            </FieldLabel>

            <FieldLabel label="Amount">
              <Input
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

            <FieldLabel label="Purpose">
              <Input value="Stock Purchase" readOnly disabled />
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

            <Button className="md:col-span-2">Save Vendor Payment</Button>
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
