import { useState } from 'react'
import type { PurchaseDraft } from '@/domain/financeTypes'
import { normalizeName, numberValue, singleStoreId, today } from '@/app/uiHelpers'
import { SearchableNameField } from '@/components/SearchableNameField'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { FieldLabel } from '@/components/ui/field-label'
import { Input } from '@/components/ui/input'
import { SectionHeading } from '@/components/ui/section-heading'

type PurchaseFormProps = {
  vendorOptions: string[]
  onCreateVendor: (name: string) => boolean
  onSave: (draft: PurchaseDraft) => void
}

export function PurchaseForm({ vendorOptions, onCreateVendor, onSave }: PurchaseFormProps) {
  const [error, setError] = useState('')
  const [vendorName, setVendorName] = useState('')
  const [purchaseDate] = useState(today())

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const supplierName = normalizeName(String(form.get('vendorName') || ''))
    const brandName = String(form.get('brandName') || '').trim()
    const billNumber = String(form.get('invoiceNumber') || '').trim()
    const purchaseAmount = numberValue(form.get('totalAmount'))

    if (!supplierName) {
      setError('Vendor name is required.')
      return
    }
    if (!brandName) {
      setError('Brand name is required.')
      return
    }
    if (!billNumber) {
      setError('Invoice number is required.')
      return
    }
    if (purchaseAmount <= 0) {
      setError('Total amount must be greater than zero.')
      return
    }

    onCreateVendor(supplierName)

    onSave({
      storeId: singleStoreId,
      date: purchaseDate,
      supplierName,
      billNumber,
      purchaseAmount,
      paidAmount: purchaseAmount,
      unpaidAmount: 0,
      paymentMode: 'Cash',
      category: brandName,
      notes: '',
    })

    setError('')
    setVendorName('')
    event.currentTarget.reset()
  }

  return (
    <Card>
      <CardHeader>
        <SectionHeading eyebrow="New Entry" title="Record Purchase" />
      </CardHeader>
      <CardContent>
        <form className="grid gap-5 md:grid-cols-2" onSubmit={handleSubmit}>
          <FieldLabel label="Vendor Name">
            <SearchableNameField
              name="vendorName"
              options={vendorOptions}
              placeholder="Search or add vendor"
              value={vendorName}
              onCreate={onCreateVendor}
              onValueChange={(value) => {
                setVendorName(value)
                setError('')
              }}
            />
          </FieldLabel>

          <FieldLabel label="Brand Name">
            <Input name="brandName" placeholder="Brand name" required onChange={() => setError('')} />
          </FieldLabel>

          <FieldLabel label="Total Amount">
            <Input name="totalAmount" type="number" min="0" step="1" placeholder="0" required onChange={() => setError('')} />
          </FieldLabel>

          <FieldLabel label="Date">
            <Input name="date" type="date" value={purchaseDate} readOnly />
          </FieldLabel>

          <FieldLabel className="md:col-span-2" label="Invoice Number">
            <Input name="invoiceNumber" placeholder="Invoice number" required onChange={() => setError('')} />
          </FieldLabel>

          {error && <p className="text-sm font-semibold text-destructive md:col-span-2">{error}</p>}
          <Button className="md:col-span-2">Save Purchase</Button>
        </form>
      </CardContent>
    </Card>
  )
}
