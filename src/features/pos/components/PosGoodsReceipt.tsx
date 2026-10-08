import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { FieldLabel } from '@/shared/ui/field-label'
import { Input } from '@/shared/ui/input'
import { NativeSelect } from '@/shared/ui/native-select'
import { SectionHeading } from '@/shared/ui/section-heading'
import { Textarea } from '@/shared/ui/textarea'
import { today } from '@/app/uiHelpers'
import type { AppUser } from '@/domain/financeTypes'
import { normalizeInvoiceNumber, rupeesToPaise, type VendorV2 } from '@/domain/vendorLedgerV2'
import type { PosGoodsReceipt, PosGoodsReceiptLine, PosProduct } from '../domain/types'
import { completePosStockAuditBatch, findPosProductByBarcode, getPosCost, subscribePosGoodsReceipts, savePosGoodsReceiptDraft, deletePosGoodsReceiptDraft, submitPosGoodsReceipt, reconcilePosStockAuditBatch, reversePosGoodsReceipt } from '../data/posRepository'
import { createVendorV2 } from '@/store/vendorLedgerV2Repository'
import { serverNowIso } from '@/shared/lib/serverClock'

function productMrpPaise(product: PosProduct) {
  const raw = Object.entries(product.sourceValues ?? {}).find(([key]) => key.trim().toLocaleLowerCase('en-IN') === 'printed mrp')?.[1]
  if (!raw?.trim()) return null
  const amount = Number(raw.replace(/[₹,\s]/g, ''))
  return Number.isFinite(amount) && amount >= 0 ? rupeesToPaise(amount) : null
}

const money = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function PosGoodsReceipt({ currentUser, vendors, enabled, showToast }: {
  currentUser: AppUser
  vendors: VendorV2[]
  enabled: boolean
  showToast: (message: string) => void
}) {
  const [receipts, setReceipts] = useState<PosGoodsReceipt[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [vendorId, setVendorId] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(today())
  const [receiptDate, setReceiptDate] = useState(today())
  const [lines, setLines] = useState<PosGoodsReceiptLine[]>([])
  const [draftId, setDraftId] = useState<string | undefined>()
  const [barcode, setBarcode] = useState('')
  const [newProduct, setNewProduct] = useState<{ barcode: string; name: string; category: string; price: string; mrp: string } | null>(null)
  const [newName, setNewName] = useState('')
  const [newOwner, setNewOwner] = useState('')
  const [newContact, setNewContact] = useState('')
  const [newAddress, setNewAddress] = useState('')
  const [newCompanies, setNewCompanies] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [showVendorForm, setShowVendorForm] = useState(false)
  const [view, setView] = useState<'receipt' | 'history'>('receipt')
  const [invoiceTotal, setInvoiceTotal] = useState('')
  const [historySearch, setHistorySearch] = useState('')
  const scanRef = useRef<HTMLInputElement>(null)
  const activeVendors = useMemo(() => vendors.filter((vendor) => vendor.active).sort((a, b) => a.canonicalName.localeCompare(b.canonicalName)), [vendors])
  const selectedVendor = activeVendors.find((vendor) => vendor.id === vendorId)
  const matchingInvoice = receipts.find((receipt) => receipt.status === 'submitted' && receipt.vendorId === vendorId && normalizeInvoiceNumber(receipt.invoiceNumber) === normalizeInvoiceNumber(invoiceNumber))
  const receivedValuePaise = lines.reduce((sum, line) => sum + line.quantity * line.unitCostPaise, 0)
  const totalPaise = invoiceTotal.trim() && Number.isFinite(Number(invoiceTotal)) ? rupeesToPaise(Number(invoiceTotal)) : 0
  const visibleReceipts = receipts.filter((receipt) => `${receipt.vendorName} ${receipt.invoiceNumber} ${receipt.status} ${receipt.receiptDate}`.toLocaleLowerCase('en-IN').includes(historySearch.trim().toLocaleLowerCase('en-IN')))

  useEffect(() => subscribePosGoodsReceipts(setReceipts, (cause) => setError(cause.message)), [])

  function resetForm() {
    setVendorId(''); setInvoiceNumber(''); setInvoiceDate(today()); setReceiptDate(today()); setLines([]); setDraftId(undefined); setNewProduct(null); setInvoiceTotal('')
  }

  async function scan() {
    const value = barcode.trim()
    if (!value) return
    setError('')
    try {
      const queued = lines.find((line) => line.barcode === value)
      if (queued) {
        setLines((current) => [{ ...queued, quantity: queued.quantity + 1 }, ...current.filter((line) => line.productId !== queued.productId)])
        return
      }
      const product = await findPosProductByBarcode(value)
      if (!product || !product.active) {
        setNewProduct({ barcode: value, name: '', category: '', price: '', mrp: '' })
        return
      }
      const cost = await getPosCost(product.id)
      setLines((current) => {
        const found = current.find((line) => line.productId === product.id)
        if (found) return [{ ...found, quantity: found.quantity + 1 }, ...current.filter((line) => line.productId !== product.id)]
        return [{
          productId: product.id, barcode: product.barcode, productName: product.name, category: product.category,
          quantity: 0, unitCostPaise: cost ?? 0, unitCostInput: cost ? (cost / 100).toFixed(2) : '',
          lineTotalPaise: 0, stockAtScan: product.currentQuantity, mrpPaise: productMrpPaise(product),
          mrpInput: productMrpPaise(product) === null ? '' : String((productMrpPaise(product) ?? 0) / 100),
        }, ...current]
      })
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Barcode lookup failed.') }
    finally { setBarcode(''); scanRef.current?.focus() }
  }

  function addNewProduct() {
    if (!newProduct || !newProduct.name.trim() || !newProduct.category.trim() || newProduct.price === '') {
      setError('New products require a name, category, and selling price.')
      return
    }
    const id = `pos-${crypto.randomUUID()}`
    const mrpValue = newProduct.mrp.trim() ? Number(newProduct.mrp) : null
    if (mrpValue !== null && (!Number.isFinite(mrpValue) || mrpValue < 0)) { setError('MRP must be zero or greater.'); return }
    setLines((current) => [{
      productId: id, barcode: newProduct.barcode, productName: newProduct.name.trim(), category: newProduct.category.trim(),
      quantity: 0, unitCostPaise: 0, unitCostInput: '', lineTotalPaise: 0, newProduct: true,
      sellingPricePaise: rupeesToPaise(Number(newProduct.price)),
      ...(mrpValue !== null ? { mrpPaise: rupeesToPaise(mrpValue), mrpInput: mrpValue.toFixed(2), mrpChanged: true } : {}),
    }, ...current])
    setNewProduct(null)
    scanRef.current?.focus()
  }

  async function saveDraft() {
    if (!selectedVendor) throw new Error('Choose a vendor.')
    setBusy(true)
    try {
      const id = await savePosGoodsReceiptDraft({
        id: draftId, vendorId, vendorName: selectedVendor.canonicalName, invoiceNumber, invoiceDate, receiptDate, lines, invoiceTotalPaise: totalPaise,
      }, currentUser)
      setDraftId(id)
      showToast('GRN draft saved. Stock and payable are unchanged.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save GRN draft.') }
    finally { setBusy(false) }
  }

  async function submitDraft(id?: string) {
    setBusy(true)
    try {
      const actualId = id ?? await savePosGoodsReceiptDraft({
        id: draftId, vendorId, vendorName: selectedVendor?.canonicalName ?? '', invoiceNumber, invoiceDate, receiptDate, lines, invoiceTotalPaise: totalPaise,
      }, currentUser)
      const result = await submitPosGoodsReceipt(actualId, currentUser)
      showToast(result.payableCreated
        ? `GRN submitted. Stock updated and invoice payable created: ${money(result.totalPaise)}.`
        : `Partial receipt submitted. Stock updated and linked to existing invoice payable ${money(result.totalPaise)}.`)
      resetForm()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to submit GRN.') }
    finally { setBusy(false) }
  }

  async function addVendor(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!newName.trim() || !newOwner.trim() || !newContact.trim() || !newAddress.trim() || !newCompanies.trim()) {
      setError('Vendor name, owner, contact, address, and companies provided are required.')
      return
    }
    setBusy(true)
    try {
      const vendor = {
        id: `vendor-${crypto.randomUUID()}`, canonicalName: newName.trim(), ownerName: newOwner.trim(), contact: newContact.trim(),
        address: newAddress.trim(), suppliedBrands: newCompanies.split(',').map((value) => value.trim()).filter(Boolean),
        notes: newNotes.trim(), actorUserId: currentUser.id, timestamp: serverNowIso(),
      }
      await createVendorV2(vendor)
      setVendorId(vendor.id)
      setShowVendorForm(false)
      setNewName(''); setNewOwner(''); setNewContact(''); setNewAddress(''); setNewCompanies(''); setNewNotes('')
      showToast(`Vendor ${vendor.canonicalName} added.`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to add vendor.') }
    finally { setBusy(false) }
  }

  function editDraft(receipt: PosGoodsReceipt) {
    setDraftId(receipt.id); setVendorId(receipt.vendorId); setInvoiceNumber(receipt.invoiceNumber)
    setInvoiceDate(receipt.invoiceDate); setReceiptDate(receipt.receiptDate); setLines(receipt.lines.map((line) => ({ ...line, unitCostInput: line.unitCostPaise ? (line.unitCostPaise / 100).toFixed(2) : '', mrpInput: line.mrpPaise === null || line.mrpPaise === undefined ? '' : String(line.mrpPaise / 100) }))); setInvoiceTotal(receipt.invoiceTotalPaise ? String(receipt.invoiceTotalPaise / 100) : ''); setView('receipt'); setError('')
  }

  return <div className="grid gap-3">
    <div role="tablist" aria-label="Goods receipt sections" className="flex w-fit items-center gap-1 rounded-lg border bg-muted p-1">
      <Button type="button" role="tab" aria-selected={view === 'receipt'} variant={view === 'receipt' ? 'default' : 'ghost'} onClick={() => setView('receipt')}>Goods Receipt</Button>
      <Button type="button" role="tab" aria-selected={view === 'history'} variant={view === 'history' ? 'default' : 'ghost'} onClick={() => setView('history')}>History</Button>
    </div>
    {error ? <p role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">{error}</p> : null}
    {view === 'receipt' ? <Card><CardHeader className="pb-2"><h2 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">Goods Receipt Note (GRN)</h2></CardHeader><CardContent className="grid gap-3">
      {!enabled ? <p role="alert" className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">The vendor ledger is not active. A GRN cannot be submitted until it is enabled.</p> : null}
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <FieldLabel label="Vendor"><div className="flex gap-2"><NativeSelect className="min-w-0 flex-1" value={vendorId} onChange={(event) => setVendorId(event.target.value)}><option value="">Choose vendor</option>{activeVendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.canonicalName}</option>)}</NativeSelect><Button type="button" size="sm" variant="outline" onClick={() => setShowVendorForm(true)}>Add vendor</Button></div></FieldLabel>
        <FieldLabel label="Vendor invoice number"><Input value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} required /></FieldLabel>
        <FieldLabel label="Invoice date"><Input type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} required /></FieldLabel>
        <FieldLabel label="Receipt date"><Input type="date" value={receiptDate} onChange={(event) => setReceiptDate(event.target.value)} required /></FieldLabel>
      </div>
      {matchingInvoice ? <p role="status" className="rounded-md border border-primary/30 bg-primary/5 p-2 text-sm">A submitted GRN already exists for this vendor invoice. This receipt will add stock and link to its existing payable of {money(matchingInvoice.invoiceTotalPaise ?? matchingInvoice.totalPaise)}; enter the same full invoice amount.</p> : null}
      <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void scan() }}><Input ref={scanRef} value={barcode} onChange={(event) => setBarcode(event.target.value)} placeholder="Scan barcode, then Enter" aria-label="Scan product barcode" autoFocus /><Button type="submit">Scan item</Button></form>
      {newProduct ? <div className="grid gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 sm:grid-cols-5">
        <p className="sm:col-span-4 text-sm font-semibold">Barcode {newProduct.barcode} is not in the catalog. Create product.</p>
        <FieldLabel label="Product name"><Input value={newProduct.name} onChange={(event) => setNewProduct({ ...newProduct, name: event.target.value })} /></FieldLabel>
        <FieldLabel label="Category"><Input value={newProduct.category} onChange={(event) => setNewProduct({ ...newProduct, category: event.target.value })} /></FieldLabel>
        <FieldLabel label="Selling price"><Input type="number" min="0" step="0.01" value={newProduct.price} onChange={(event) => setNewProduct({ ...newProduct, price: event.target.value })} /></FieldLabel>
        <FieldLabel label="MRP"><Input type="text" inputMode="decimal" value={newProduct.mrp} onChange={(event) => setNewProduct({ ...newProduct, mrp: event.target.value })} placeholder="Optional" /></FieldLabel>
        <Button type="button" className="self-end" onClick={addNewProduct}>Add to GRN</Button>
      </div> : null}
      <div className="overflow-x-auto rounded-md border border-border">
        <div className="grid min-w-[900px] grid-cols-[minmax(13rem,1fr)_5.5rem_7rem_7rem_8rem_4rem] items-center gap-2 border-b bg-muted/50 px-3 py-2 text-xs font-semibold text-muted-foreground"><span>Product · stock</span><span>Received</span><span>Cost / unit</span><span>MRP</span><span className="text-right">Line value</span><span /></div>
        <div className="max-h-[48vh] min-w-[900px] overflow-y-auto">
          {lines.length === 0 ? <p className="p-5 text-center text-sm text-muted-foreground">Scan a barcode to add received goods. Quantity starts at 0.</p> : lines.map((line) => <div key={line.productId} className="grid grid-cols-[minmax(13rem,1fr)_5.5rem_7rem_7rem_8rem_4rem] items-center gap-2 border-b px-3 py-2 last:border-0">
            <div className="min-w-0"><strong className="block truncate text-sm">{line.productName}{line.newProduct ? <Badge variant="secondary" className="ml-2">New</Badge> : null}</strong><span className="text-[11px] text-muted-foreground">{line.barcode} · Stock {line.stockAtScan ?? 0}</span></div>
            <Input aria-label={`Received quantity for ${line.productName}`} className="h-8 px-2" type="number" min="0" step="1" value={line.quantity} onChange={(event) => setLines((items) => items.map((item) => item.productId === line.productId ? { ...item, quantity: event.target.value === '' ? 0 : Math.max(0, Math.trunc(Number(event.target.value) || 0)) } : item))} />
            <Input aria-label={`Unit cost for ${line.productName}`} className="h-8 px-2" type="text" inputMode="decimal" value={line.unitCostInput ?? (line.unitCostPaise ? (line.unitCostPaise / 100).toFixed(2) : '')} placeholder="Enter cost" onChange={(event) => { const value = event.target.value; const parsed = Number(value); const valid = value.trim() !== '' && Number.isFinite(parsed) && parsed >= 0; setLines((items) => items.map((item) => item.productId === line.productId ? { ...item, unitCostInput: value, unitCostPaise: valid ? rupeesToPaise(parsed) : 0 } : item)) }} onBlur={() => setLines((items) => items.map((item) => { if (item.productId !== line.productId) return item; const parsed = Number(item.unitCostInput); return item.unitCostInput?.trim() && Number.isFinite(parsed) && parsed >= 0 ? { ...item, unitCostInput: parsed.toFixed(2), unitCostPaise: rupeesToPaise(parsed) } : item }))} />
            <Input aria-label={`MRP for ${line.productName}`} className="h-8 px-2" type="text" inputMode="decimal" value={line.mrpInput ?? (line.mrpPaise === null || line.mrpPaise === undefined ? '' : String(line.mrpPaise / 100))} placeholder="Enter MRP" onChange={(event) => { const value = event.target.value; const parsed = Number(value); const valid = value.trim() !== '' && Number.isFinite(parsed) && parsed >= 0; setLines((items) => items.map((item) => item.productId === line.productId ? { ...item, mrpInput: value, mrpPaise: valid ? rupeesToPaise(parsed) : null, mrpChanged: true } : item)) }} onBlur={() => setLines((items) => items.map((item) => { if (item.productId !== line.productId) return item; const parsed = Number(item.mrpInput); return item.mrpInput?.trim() && Number.isFinite(parsed) && parsed >= 0 ? { ...item, mrpInput: parsed.toFixed(2), mrpPaise: rupeesToPaise(parsed), mrpChanged: true } : item }))} />
            <strong className="w-full text-right text-sm tabular-nums">{money(line.quantity * line.unitCostPaise)}</strong>
            <Button type="button" size="sm" variant="ghost" aria-label={`Remove ${line.productName}`} onClick={() => setLines((items) => items.filter((item) => item.productId !== line.productId))}>Remove</Button>
          </div>)}
        </div>
      </div>
      <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-[1fr_13rem_auto] sm:items-end">
        <div className="text-sm"><span className="block text-muted-foreground">Received stock value</span><strong>{money(receivedValuePaise)}</strong></div>
        <FieldLabel label="Full invoice payable"><Input type="number" min="0.01" step="0.01" value={invoiceTotal} onChange={(event) => setInvoiceTotal(event.target.value)} placeholder="Invoice total" required /></FieldLabel>
        <div className="flex gap-2"><Button type="button" variant="outline" disabled={busy || !lines.length || !totalPaise} onClick={() => void saveDraft()}>Save draft</Button><Button type="button" disabled={busy || !enabled || !lines.some((line) => line.quantity > 0) || !vendorId || !invoiceNumber.trim() || !totalPaise} onClick={() => void submitDraft()}>{busy ? 'Saving…' : 'Submit GRN'}</Button></div>
      </div>
      <p className="text-xs text-muted-foreground">The payable is the full invoice amount; stock increases only by the quantities received above.</p>
    </CardContent></Card> : <Card><CardHeader><SectionHeading eyebrow="Recent activity" title="GRN History" description="Search receipts and continue or review saved GRNs." /></CardHeader><CardContent className="grid content-start gap-3">
      <Input value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} placeholder="Search vendor, invoice, status or date" aria-label="Search GRN history" />
      <div className="grid max-h-[65vh] content-start gap-2 overflow-y-auto">
        {visibleReceipts.map((receipt) => <article key={receipt.id} className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
          <div className="min-w-0"><strong className="block truncate">{receipt.vendorName}</strong><p className="text-xs text-muted-foreground">Invoice {receipt.invoiceNumber} · {receipt.receiptDate} · {receipt.lines.length} line(s)</p></div>
          <div className="flex items-center gap-2"><Badge variant={receipt.status === 'submitted' ? 'success' : 'secondary'}>{receipt.status}</Badge><strong>{money(receipt.invoiceTotalPaise ?? receipt.totalPaise)}</strong></div>
          {receipt.status === 'draft' ? <div className="flex gap-1"><Button size="sm" variant="outline" disabled={busy} onClick={() => editDraft(receipt)}>Continue</Button><Button size="sm" disabled={busy || !enabled} onClick={() => void submitDraft(receipt.id)}>Submit</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => void deletePosGoodsReceiptDraft(receipt.id, currentUser).then(() => showToast('Draft deleted.')).catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to delete draft.'))}>Delete</Button></div> : receipt.status === 'submitted' && currentUser.role === 'owner' ? <Button size="sm" variant="outline" disabled={busy} onClick={() => { const reason = window.prompt('Reason for reversing this GRN?'); if (!reason?.trim()) return; setBusy(true); void reversePosGoodsReceipt(receipt.id, reason, currentUser).then(() => showToast('GRN reversed with stock and payable adjustments. Create a corrected GRN if needed.')).catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to reverse GRN.')).finally(() => setBusy(false)) }}>Reverse / correct</Button> : null}
        </article>)}
        {visibleReceipts.length === 0 ? <p className="rounded border border-dashed p-5 text-center text-sm text-muted-foreground">{receipts.length ? 'No GRNs match that search.' : 'No GRNs recorded yet.'}</p> : null}
      </div>
    </CardContent></Card>}
    {showVendorForm ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setShowVendorForm(false) }}>
      <Card role="dialog" aria-modal="true" aria-labelledby="new-vendor-title" className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden shadow-xl">
        <CardHeader className="flex-row items-center justify-between border-b"><SectionHeading eyebrow="Vendor directory" title="Add vendor" /><Button type="button" size="icon" variant="ghost" aria-label="Close add vendor" disabled={busy} onClick={() => setShowVendorForm(false)}><X /></Button></CardHeader>
        <CardContent className="overflow-y-auto pt-4"><form onSubmit={(event) => void addVendor(event)} className="grid gap-3 sm:grid-cols-2">
          <FieldLabel label="Vendor name"><Input value={newName} onChange={(event) => setNewName(event.target.value)} required /></FieldLabel>
          <FieldLabel label="Owner name"><Input value={newOwner} onChange={(event) => setNewOwner(event.target.value)} required /></FieldLabel>
          <FieldLabel label="Contact"><Input value={newContact} onChange={(event) => setNewContact(event.target.value)} required /></FieldLabel>
          <FieldLabel label="Address"><Input value={newAddress} onChange={(event) => setNewAddress(event.target.value)} required /></FieldLabel>
          <FieldLabel className="sm:col-span-2" label="Companies provided"><Input value={newCompanies} onChange={(event) => setNewCompanies(event.target.value)} placeholder="Comma separated" required /></FieldLabel>
          <FieldLabel className="sm:col-span-2" label="Notes"><Textarea value={newNotes} onChange={(event) => setNewNotes(event.target.value)} /></FieldLabel>
          <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setShowVendorForm(false)}>Cancel</Button><Button disabled={busy}>{busy ? 'Saving…' : 'Save vendor'}</Button></div>
        </form></CardContent>
      </Card>
    </div> : null}
  </div>
}

export function PosStockAuditPage({ currentUser, showToast }: { currentUser: AppUser; showToast: (message: string) => void }) {
  const [barcode, setBarcode] = useState('')
  const [items, setItems] = useState<Array<{ product: PosProduct; physicalQuantity: string; costPaise: number | null; costInput: string }>>([])
  const [auditId, setAuditId] = useState(() => createStockAuditId())
  const [note, setNote] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const scanRef = useRef<HTMLInputElement>(null)
  const quantityRefs = useRef<Record<string, HTMLInputElement | null>>({})

  async function scan() {
    const value = barcode.trim()
    if (!value) return
    setBusy(true); setError('')
    try {
      const found = await findPosProductByBarcode(value)
      if (!found || !found.active) throw new Error('Barcode not found in the active catalog. Add the product through Goods Receipt first.')
      const queued = items.find((item) => item.product.id === found.id)
      if (queued) {
        setItems((current) => [queued, ...current.filter((item) => item.product.id !== found.id)])
        window.setTimeout(() => quantityRefs.current[found.id]?.focus(), 0)
        return
      }
      const costPaise = await getPosCost(found.id)
      setItems((current) => [{ product: found, physicalQuantity: '', costPaise, costInput: '' }, ...current])
      window.setTimeout(() => quantityRefs.current[found.id]?.focus(), 0)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Barcode lookup failed.') }
    finally { setBarcode(''); setBusy(false); scanRef.current?.focus() }
  }

  function validateCounts() {
    if (!items.length) return 'Scan at least one product.'
    const invalidCount = items.find((item) => item.physicalQuantity === '' || !Number.isInteger(Number(item.physicalQuantity)) || Number(item.physicalQuantity) < 0)
    if (invalidCount) return `Enter a whole physical quantity of zero or more for ${invalidCount.product.name}.`
    const missingCost = items.find((item) => item.costPaise === null && (item.costInput.trim() === '' || !Number.isFinite(Number(item.costInput)) || Number(item.costInput) < 0))
    if (missingCost) return `Enter the purchase cost for ${missingCost.product.name}.`
    if (!note.trim()) return 'Enter an Audit note before saving.'
    return ''
  }

  function reviewCounts() {
    const validationError = validateCounts()
    if (validationError) { setError(validationError); return }
    setError(''); setConfirming(true)
  }

  async function saveCounts() {
    const validationError = validateCounts()
    if (validationError) { setError(validationError); setConfirming(false); return }
    const savingAuditId = auditId
    setBusy(true); setError('')
    let savedCount = 0
    let adjustedCount = 0
    let netImpactPaise = 0
    try {
      for (let offset = 0; offset < items.length; offset += 5) {
        const group = items.slice(offset, offset + 5)
        const results = await reconcilePosStockAuditBatch(group.map(({ product, physicalQuantity, costPaise, costInput }) => ({
          productId: product.id, physicalQuantity: Number(physicalQuantity), expectedRevision: product.revision,
          ...(costPaise === null ? { suppliedCostPaise: rupeesToPaise(Number(costInput)) } : {}),
        })), currentUser, { id: savingAuditId, note: note.trim() })
        savedCount += results.length
        adjustedCount += results.filter((result) => result.difference !== 0).length
        netImpactPaise += results.reduce((sum, result) => sum + result.valueImpactPaise, 0)
        const savedIds = new Set(group.map((item) => item.product.id))
        setItems((current) => current.filter((item) => !savedIds.has(item.product.id)))
      }
      await completePosStockAuditBatch(savingAuditId, currentUser)
      showToast(`${savingAuditId} saved: ${savedCount} products, ${adjustedCount} adjusted, net impact ${money(netImpactPaise)}.`)
      setNote(''); setAuditId(createStockAuditId())
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : 'Unable to save stock counts.'
      const nextAuditId = createStockAuditId()
      if (savedCount) {
        try { await completePosStockAuditBatch(savingAuditId, currentUser, true) } catch { /* preserve the original failure */ }
        setError(`${savingAuditId} saved ${savedCount} products. Remaining products are queued as ${nextAuditId}. ${detail}`)
      } else setError(`Nothing was saved. Queued products now use ${nextAuditId}. ${detail}`)
      setAuditId(nextAuditId)
    }
    finally { setBusy(false); setConfirming(false); scanRef.current?.focus() }
  }

  return <>
    <Card><CardHeader className="pb-2"><div className="flex items-center justify-between gap-3"><h2 className="text-base font-semibold tracking-tight sm:text-lg">Stock Audit</h2><Badge variant="secondary">{auditId}</Badge></div></CardHeader><CardContent className="grid gap-3">
      {error ? <p role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">{error}</p> : null}
      <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void scan() }}><Input ref={scanRef} value={barcode} onChange={(event) => setBarcode(event.target.value)} aria-label="Scan audit barcode" placeholder="Scan barcode, then Enter" autoFocus disabled={busy} /><Button disabled={busy}>Scan</Button></form>
      <div className="overflow-x-auto rounded-md border">
        <div className="grid min-w-[650px] grid-cols-[minmax(13rem,1fr)_9rem_9rem_5rem] gap-2 border-b bg-muted/50 px-3 py-2 text-xs font-semibold text-muted-foreground"><span>Product</span><span>Physical quantity</span><span>Purchase cost</span><span /></div>
        <div className="max-h-[55vh] min-w-[650px] overflow-y-auto">
          {items.map(({ product, physicalQuantity, costPaise, costInput }) => <div key={product.id} className="grid grid-cols-[minmax(13rem,1fr)_9rem_9rem_5rem] items-center gap-2 border-b px-3 py-2 last:border-0">
            <div className="min-w-0"><strong className="block truncate text-sm">{product.name}</strong><span className="text-xs text-muted-foreground">{product.barcode}</span></div>
            <Input ref={(element) => { quantityRefs.current[product.id] = element }} aria-label={`Physical quantity for ${product.name}`} className="h-8" type="number" min="0" step="1" value={physicalQuantity} onChange={(event) => setItems((current) => current.map((item) => item.product.id === product.id ? { ...item, physicalQuantity: event.target.value } : item))} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); scanRef.current?.focus() } }} />
            {costPaise === null ? <Input aria-label={`Purchase cost for ${product.name}`} className="h-8" type="text" inputMode="decimal" value={costInput} placeholder="Enter cost" onChange={(event) => setItems((current) => current.map((item) => item.product.id === product.id ? { ...item, costInput: event.target.value } : item))} /> : <strong className="text-sm tabular-nums">{money(costPaise)}</strong>}
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setItems((current) => current.filter((item) => item.product.id !== product.id))}>Remove</Button>
          </div>)}
          {!items.length ? <p className="p-5 text-center text-sm text-muted-foreground">Scan products to begin an Audit.</p> : null}
        </div>
      </div>
      {items.length ? <><FieldLabel label="Mandatory Audit note"><Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. Weekly shelf count" /></FieldLabel><div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" disabled={busy} onClick={() => { setItems([]); setNote(''); setAuditId(createStockAuditId()) }}>Clear list</Button><Button disabled={busy} onClick={reviewCounts}>{busy ? 'Saving…' : `Review & save ${items.length} products`}</Button></div></> : null}
    </CardContent></Card>
    {confirming ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3"><Card role="dialog" aria-modal="true" aria-labelledby="audit-confirm-title" className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden shadow-xl"><CardHeader className="flex-row items-center justify-between border-b"><div><h2 id="audit-confirm-title" className="text-lg font-semibold">Confirm {auditId}</h2><p className="text-sm text-muted-foreground">{items.length} products · {currentUser.name}</p></div><Button type="button" size="icon" variant="ghost" disabled={busy} onClick={() => setConfirming(false)}><X /></Button></CardHeader><CardContent className="grid gap-3 overflow-y-auto pt-4"><div className="rounded-md bg-secondary/40 p-3 text-sm"><strong>Audit note</strong><p>{note.trim()}</p></div><div className="grid gap-1">{items.map((item) => <div key={item.product.id} className="flex items-center justify-between gap-3 rounded border px-3 py-2 text-sm"><span className="min-w-0"><strong className="block truncate">{item.product.name}</strong><span className="text-xs text-muted-foreground">{item.product.barcode}</span></span><span className="shrink-0 text-right"><strong>Count {item.physicalQuantity}</strong>{item.costPaise === null ? <span className="block text-xs text-muted-foreground">New cost {money(rupeesToPaise(Number(item.costInput)))}</span> : null}</span></div>)}</div><div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setConfirming(false)}>Back</Button><Button disabled={busy} onClick={() => void saveCounts()}>{busy ? 'Saving…' : 'Confirm and reconcile stock'}</Button></div></CardContent></Card></div> : null}
  </>
}

function createStockAuditId() {
  const suffix = Array.from(crypto.getRandomValues(new Uint8Array(2)), (value) => value.toString(16).padStart(2, '0')).join('').toUpperCase()
  return `AUD-${today().replaceAll('-', '')}-${suffix}`
}
