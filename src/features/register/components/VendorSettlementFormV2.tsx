import { useState } from 'react'
import { today } from '@/app/uiHelpers'
import type { InvoiceBalanceV2, VendorSettlementMode, VendorV2 } from '@/domain/vendorLedgerV2'
import { rupeesToPaise } from '@/domain/vendorLedgerV2'
import { vendorIdentityOptions } from '@/domain/vendorIdentityV2'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { FieldLabel } from '@/shared/ui/field-label'
import { Input } from '@/shared/ui/input'
import { SectionHeading } from '@/shared/ui/section-heading'
import { SelectField } from '@/shared/ui/select-field'
import { Textarea } from '@/shared/ui/textarea'

export type VendorSettlementV2Draft = {
  vendorId: string
  date: string
  amountPaise: number
  mode: VendorSettlementMode
  invoiceId?: string
  notes: string
}

type VendorSettlementFormV2Props = {
  balances: InvoiceBalanceV2[]
  isBusy: boolean
  vendors: VendorV2[]
  initialInvoiceId?: string
  initialVendorId?: string
  onSave: (draft: VendorSettlementV2Draft) => Promise<void>
}

const modeOptions = [
  { label: 'Cash', value: 'cash' },
  { label: 'UPI', value: 'upi' },
  { label: 'Card', value: 'card' },
  { label: 'Bank Transfer', value: 'bank-transfer' },
] satisfies { label: string; value: VendorSettlementMode }[]

export function VendorSettlementFormV2(props: VendorSettlementFormV2Props) {
  const { balances, initialInvoiceId = '', initialVendorId = '', isBusy, onSave, vendors } = props
  const [vendorId, setVendorId] = useState(initialVendorId)
  const [invoiceId, setInvoiceId] = useState(initialInvoiceId)
  const [date, setDate] = useState(today())
  const [amount, setAmount] = useState('')
  const [mode, setMode] = useState<VendorSettlementMode>('bank-transfer')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const vendorOptions = vendorIdentityOptions(vendors).map((option) => ({ ...option, keywords: [option.label] }))
  const invoiceOptions = [
    { label: 'Custom vendor-account payment', value: '' },
    ...balances
      .filter((balance) => balance.purchase.vendorId === vendorId && balance.availableToAllocatePaise > 0)
      .map((balance) => ({
        label: `${balance.purchase.invoiceNumber} | available INR ${(balance.availableToAllocatePaise / 100).toLocaleString('en-IN')}`,
        value: balance.purchase.id,
      })),
  ]

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      const rupees = Number(amount)
      if (!vendorId) throw new Error('Choose an active V2 vendor.')
      if (!Number.isFinite(rupees) || rupees <= 0) throw new Error('Payment must be greater than zero.')
      await onSave({
        vendorId,
        date,
        amountPaise: rupeesToPaise(rupees),
        mode,
        ...(invoiceId ? { invoiceId } : {}),
        notes: notes.trim(),
      })
      setAmount('')
      setNotes('')
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save the V2 vendor settlement.')
    }
  }

  return (
    <Card className="flex h-full min-h-0 flex-col">
      <CardHeader>
        <SectionHeading eyebrow="V2 settlement" title="Record Vendor Payment" />
        <p className="text-sm text-muted-foreground">Payments are separate from purchases. Cheques must be recorded in the Cheque Register.</p>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto">
        <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
          <FieldLabel label="Vendor">
            <SelectField options={vendorOptions} placeholder="Search active V2 vendors" searchable value={vendorId} onValueChange={(value) => {
              setVendorId(value)
              setInvoiceId('')
            }} />
          </FieldLabel>
          <FieldLabel label="Invoice Allocation">
            <SelectField options={invoiceOptions} value={invoiceId} onValueChange={setInvoiceId} />
          </FieldLabel>
          <FieldLabel label="Payment Date">
            <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
          </FieldLabel>
          <FieldLabel label="Amount">
            <Input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required />
          </FieldLabel>
          <FieldLabel label="Payment Mode">
            <SelectField options={modeOptions} value={mode} onValueChange={(value) => setMode(value as VendorSettlementMode)} />
          </FieldLabel>
          <FieldLabel className="md:col-span-2" label="Notes">
            <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
          </FieldLabel>
          {error ? <p className="text-sm font-semibold text-destructive md:col-span-2">{error}</p> : null}
          <Button className="md:col-span-2" disabled={isBusy}>{isBusy ? 'Saving...' : 'Save Vendor Payment'}</Button>
        </form>
      </CardContent>
    </Card>
  )
}
