import { useState } from 'react'
import type { PurchaseDraft } from '@/domain/financeTypes'
import { normalizeName, numberValue, purchasePaymentModes, singleStoreId, today } from '@/app/uiHelpers'
import { SearchableSelect } from '@/shared/ui/SearchableSelect'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { FieldLabel } from '@/shared/ui/field-label'
import { Input } from '@/shared/ui/input'
import { NativeSelect } from '@/shared/ui/native-select'
import { SectionHeading } from '@/shared/ui/section-heading'

type PurchaseFormProps = {
  vendorOptions: string[]
  onSave: (draft: PurchaseDraft) => Promise<void> | void
}

export function PurchaseForm({ vendorOptions, onSave }: PurchaseFormProps) {
  const [error, setError] = useState('')
  const [vendorName, setVendorName] = useState('')
  const [purchaseDate] = useState(today())
  const [brandName, setBrandName] = useState('')
  const [purchaseAmount, setPurchaseAmount] = useState('0')
  const [paidAmount, setPaidAmount] = useState('0')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [paymentMode, setPaymentMode] = useState<PurchaseDraft['paymentMode']>('Cash')

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const supplierName = normalizeName(vendorName)
    const normalizedBrandName = brandName.trim()
    const billNumber = invoiceNumber.trim()
    const purchaseAmountValue = numberValue(purchaseAmount)
    const paidAmountValue = numberValue(paidAmount)

    if (!supplierName) {
      setError('Choose a vendor from the saved list.')
      return
    }
    if (!normalizedBrandName) {
      setError('Brand name is required.')
      return
    }
    if (!billNumber) {
      setError('Invoice number is required.')
      return
    }
    if (purchaseAmountValue <= 0) {
      setError('Total amount must be greater than zero.')
      return
    }
    if (paidAmountValue > purchaseAmountValue) {
      setError('Paid amount cannot exceed total amount.')
      return
    }

    try {
      await onSave({
        storeId: singleStoreId,
        date: purchaseDate,
        supplierName,
        billNumber,
        purchaseAmount: purchaseAmountValue,
        paidAmount: paidAmountValue,
        unpaidAmount: Math.max(purchaseAmountValue - paidAmountValue, 0),
        paymentMode,
        category: normalizedBrandName,
        notes: '',
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save the purchase.')
      return
    }

    setError('')
    setVendorName('')
    setBrandName('')
    setPurchaseAmount('0')
    setPaidAmount('0')
    setInvoiceNumber('')
    setPaymentMode('Cash')
  }

  return (
    <Card className="flex h-full min-h-0 flex-col">
      <CardHeader>
        <SectionHeading eyebrow="New Entry" title="Record Purchase" />
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto">
        <form className="grid gap-5 md:grid-cols-2" onSubmit={handleSubmit}>
          <FieldLabel label="Vendor Name">
            <SearchableSelect
              options={vendorOptions}
              placeholder="Search and select from saved vendors"
              value={vendorName}
              onValueChange={(value) => {
                setVendorName(value)
                setError('')
              }}
            />
          </FieldLabel>

          <FieldLabel label="Brand Name">
            <Input
              name="brandName"
              placeholder="Brand name"
              required
              value={brandName}
              onChange={(event) => {
                setBrandName(event.target.value)
                setError('')
              }}
            />
          </FieldLabel>

          <FieldLabel label="Total Amount">
            <Input
              name="totalAmount"
              type="number"
              min="0"
              step="1"
              placeholder="0"
              required
              value={purchaseAmount}
              onChange={(event) => {
                setPurchaseAmount(event.target.value)
                setError('')
              }}
            />
          </FieldLabel>

          <FieldLabel label="Paid Amount">
            <Input
              name="paidAmount"
              type="number"
              min="0"
              step="1"
              placeholder="0"
              required
              value={paidAmount}
              onChange={(event) => {
                setPaidAmount(event.target.value)
                setError('')
              }}
            />
          </FieldLabel>

          <FieldLabel label="Date">
            <Input name="date" type="date" value={purchaseDate} readOnly />
          </FieldLabel>

          <FieldLabel label="Payment Mode">
            <NativeSelect
              name="paymentMode"
              value={paymentMode}
              onChange={(event) => {
                setPaymentMode(event.target.value as PurchaseDraft['paymentMode'])
                setError('')
              }}
            >
              {purchasePaymentModes.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </NativeSelect>
          </FieldLabel>

          <FieldLabel className="md:col-span-2" label="Invoice Number">
            <Input
              name="invoiceNumber"
              placeholder="Invoice number"
              required
              value={invoiceNumber}
              onChange={(event) => {
                setInvoiceNumber(event.target.value)
                setError('')
              }}
            />
          </FieldLabel>

          {error && <p className="text-sm font-semibold text-destructive md:col-span-2">{error}</p>}
          <Button className="md:col-span-2">Save Purchase</Button>
        </form>
      </CardContent>
    </Card>
  )
}

