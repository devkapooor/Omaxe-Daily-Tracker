import { useState } from 'react'
import type { PurchaseDraft } from '../domain/financeTypes'
import { normalizeName, numberValue, singleStoreId, today } from '../app/uiHelpers'
import { SearchableNameField } from './SearchableNameField'

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
    <form className="cashout-card purchase-form" onSubmit={handleSubmit}>
      <div className="card-title">
        <p className="eyebrow">New Entry</p>
        <h2>Record Purchase</h2>
      </div>

      <label>
        Vendor Name
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
      </label>

      <label>
        Brand Name
        <input name="brandName" placeholder="Brand name" required onChange={() => setError('')} />
      </label>

      <label>
        Total Amount
        <input name="totalAmount" type="number" min="0" step="1" placeholder="0" required onChange={() => setError('')} />
      </label>

      <label>
        Date
        <input name="date" type="date" value={purchaseDate} readOnly />
      </label>

      <label className="full-width">
        Invoice Number
        <input name="invoiceNumber" placeholder="Invoice number" required onChange={() => setError('')} />
      </label>

      {error && <p className="form-error light full-width">{error}</p>}
      <button className="primary full-width">Save Purchase</button>
    </form>
  )
}
