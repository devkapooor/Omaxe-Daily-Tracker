import { useState } from 'react'
import type { VendorV2 } from '@/domain/vendorLedgerV2'
import { rupeesToPaise } from '@/domain/vendorLedgerV2'
import { vendorIdentityOptions } from '@/domain/vendorIdentityV2'
import { today } from '@/app/uiHelpers'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { FieldLabel } from '@/shared/ui/field-label'
import { Input } from '@/shared/ui/input'
import { SectionHeading } from '@/shared/ui/section-heading'
import { SelectField } from '@/shared/ui/select-field'
import { Textarea } from '@/shared/ui/textarea'

export type PurchaseV2Draft = {
  vendorId: string
  invoiceNumber: string
  invoiceDate: string
  receiptDate?: string
  invoiceTotalPaise: number
  category?: string
  notes: string
}

type PurchaseFormV2Props = {
  isBusy: boolean
  vendors: VendorV2[]
  onSave: (draft: PurchaseV2Draft) => Promise<{ purchaseId: string }>
  onRecordPayment: (purchaseId: string, vendorId: string) => void
}

export function PurchaseFormV2({ isBusy, onRecordPayment, onSave, vendors }: PurchaseFormV2Props) {
  const [vendorId, setVendorId] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(today())
  const [receiptDate, setReceiptDate] = useState('')
  const [invoiceTotal, setInvoiceTotal] = useState('')
  const [category, setCategory] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [savedPurchase, setSavedPurchase] = useState<{ purchaseId: string; vendorId: string } | null>(null)
  const options = vendorIdentityOptions(vendors).map((option) => ({ ...option, keywords: [option.label] }))

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      const amount = Number(invoiceTotal)
      if (!vendorId) throw new Error('Choose an active V2 vendor.')
      if (!invoiceNumber.trim()) throw new Error('Invoice number is required.')
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Invoice total must be greater than zero.')
      const result = await onSave({
        vendorId,
        invoiceNumber: invoiceNumber.trim(),
        invoiceDate,
        ...(receiptDate ? { receiptDate } : {}),
        invoiceTotalPaise: rupeesToPaise(amount),
        ...(category.trim() ? { category: category.trim() } : {}),
        notes: notes.trim(),
      })
      setSavedPurchase({ purchaseId: result.purchaseId, vendorId })
      setInvoiceNumber('')
      setInvoiceTotal('')
      setCategory('')
      setNotes('')
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save the V2 purchase.')
    }
  }

  return (
    <Card className="flex h-full min-h-0 flex-col">
      <CardHeader>
        <SectionHeading eyebrow="V2 purchase" title="Record Invoice" />
        <p className="text-xs text-muted-foreground">Payments are recorded separately.</p>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto">
        <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
          <FieldLabel label="Vendor">
            <SelectField options={options} placeholder="Search active V2 vendors" searchable value={vendorId} onValueChange={setVendorId} />
          </FieldLabel>
          <FieldLabel label="Invoice Number">
            <Input value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} required />
          </FieldLabel>
          <FieldLabel label="Invoice Date">
            <Input type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} required />
          </FieldLabel>
          <FieldLabel label="Receipt Date">
            <Input type="date" value={receiptDate} onChange={(event) => setReceiptDate(event.target.value)} />
          </FieldLabel>
          <FieldLabel label="Invoice Total">
            <Input type="number" min="0.01" step="0.01" value={invoiceTotal} onChange={(event) => setInvoiceTotal(event.target.value)} required />
          </FieldLabel>
          <FieldLabel label="Brand / Category">
            <Input value={category} onChange={(event) => setCategory(event.target.value)} />
          </FieldLabel>
          <FieldLabel className="md:col-span-2" label="Notes">
            <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
          </FieldLabel>
          {error ? <p className="text-sm font-semibold text-destructive md:col-span-2">{error}</p> : null}
          <Button className="md:col-span-2" disabled={isBusy}>{isBusy ? 'Saving...' : 'Save Purchase'}</Button>
        </form>

        {savedPurchase ? (
          <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-cyan-400/20 bg-cyan-500/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">Invoice saved without a payment.</p>
            <Button type="button" variant="outline" onClick={() => onRecordPayment(savedPurchase.purchaseId, savedPurchase.vendorId)}>
              Record payment for this invoice
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
