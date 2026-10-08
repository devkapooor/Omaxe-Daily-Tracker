import { useEffect, useMemo, useRef, useState } from 'react'
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
import { rupeesToPaise, type VendorV2 } from '@/domain/vendorLedgerV2'
import type { PosGoodsReceipt, PosGoodsReceiptLine, PosProduct, PosStockAudit } from '../domain/types'
import { findPosProductByBarcode, subscribePosGoodsReceipts, savePosGoodsReceiptDraft, deletePosGoodsReceiptDraft, submitPosGoodsReceipt, reconcilePosStockAuditBatch, subscribePosStockAudits, reversePosGoodsReceipt } from '../data/posRepository'
import { createVendorV2 } from '@/store/vendorLedgerV2Repository'
import { serverNowIso } from '@/shared/lib/serverClock'

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
  const [newProduct, setNewProduct] = useState<{ barcode: string; name: string; category: string; price: string } | null>(null)
  const [newName, setNewName] = useState('')
  const [newOwner, setNewOwner] = useState('')
  const [newContact, setNewContact] = useState('')
  const [newAddress, setNewAddress] = useState('')
  const [newCompanies, setNewCompanies] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [showVendorForm, setShowVendorForm] = useState(false)
  const [mode, setMode] = useState<'receipt' | 'audit'>('receipt')
  const scanRef = useRef<HTMLInputElement>(null)
  const activeVendors = useMemo(() => vendors.filter((vendor) => vendor.active).sort((a, b) => a.canonicalName.localeCompare(b.canonicalName)), [vendors])
  const selectedVendor = activeVendors.find((vendor) => vendor.id === vendorId)
  const totalPaise = lines.reduce((sum, line) => sum + line.quantity * line.unitCostPaise, 0)

  useEffect(() => subscribePosGoodsReceipts(setReceipts, (cause) => setError(cause.message)), [])

  function resetForm() {
    setVendorId(''); setInvoiceNumber(''); setInvoiceDate(today()); setReceiptDate(today()); setLines([]); setDraftId(undefined); setNewProduct(null)
  }

  async function scan() {
    const value = barcode.trim()
    if (!value) return
    setError('')
    try {
      const product = await findPosProductByBarcode(value)
      if (!product || !product.active) {
        setNewProduct({ barcode: value, name: '', category: '', price: '' })
        return
      }
      setLines((current) => {
        const found = current.find((line) => line.productId === product.id)
        if (found) return current.map((line) => line.productId === product.id ? { ...line, quantity: line.quantity + 1 } : line)
        return [...current, {
          productId: product.id, barcode: product.barcode, productName: product.name, category: product.category,
          quantity: 1, unitCostPaise: 0, lineTotalPaise: 0, stockAtScan: product.currentQuantity,
        }]
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
    setLines((current) => [...current, {
      productId: id, barcode: newProduct.barcode, productName: newProduct.name.trim(), category: newProduct.category.trim(),
      quantity: 1, unitCostPaise: 0, lineTotalPaise: 0, newProduct: true,
      sellingPricePaise: rupeesToPaise(Number(newProduct.price)),
    }])
    setNewProduct(null)
  }

  async function saveDraft() {
    if (!selectedVendor) throw new Error('Choose a vendor.')
    setBusy(true)
    try {
      const id = await savePosGoodsReceiptDraft({
        id: draftId, vendorId, vendorName: selectedVendor.canonicalName, invoiceNumber, invoiceDate, receiptDate, lines,
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
        id: draftId, vendorId, vendorName: selectedVendor?.canonicalName ?? '', invoiceNumber, invoiceDate, receiptDate, lines,
      }, currentUser)
      const result = await submitPosGoodsReceipt(actualId, currentUser)
      showToast(`GRN submitted. Stock updated and payable created: ${money(result.totalPaise)}.`)
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
    setInvoiceDate(receipt.invoiceDate); setReceiptDate(receipt.receiptDate); setLines(receipt.lines); setError('')
  }

  return <div className="grid gap-3">
    <Card role="tablist" aria-label="Goods receiving tools" className="flex w-fit items-center gap-1 bg-muted p-1 shadow-none">
      <Button type="button" role="tab" aria-selected={mode === 'receipt'} variant={mode === 'receipt' ? 'default' : 'ghost'} onClick={() => setMode('receipt')}>Goods Receipt</Button>
      <Button type="button" role="tab" aria-selected={mode === 'audit'} variant={mode === 'audit' ? 'default' : 'ghost'} onClick={() => setMode('audit')}>Audit</Button>
    </Card>
    {mode === 'audit' ? <StockAuditPanel currentUser={currentUser} showToast={showToast} /> : <div className="grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(19rem,0.9fr)]">
    <div className="grid content-start gap-3">
      <Card><CardHeader><SectionHeading eyebrow="Inventory receiving" title="Goods Receipt Note (GRN)" description="Scan each item, confirm its received quantity and final purchase cost per unit." /></CardHeader><CardContent className="grid gap-3">
        {!enabled ? <p role="alert" className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">The vendor ledger is not active. A GRN cannot be submitted until it is enabled.</p> : null}
        {error ? <p role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">{error}</p> : null}
        <div className="grid gap-2 sm:grid-cols-2">
          <FieldLabel label="Vendor"><div className="flex gap-2"><NativeSelect className="min-w-0 flex-1" value={vendorId} onChange={(event) => setVendorId(event.target.value)}><option value="">Choose vendor</option>{activeVendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.canonicalName}</option>)}</NativeSelect><Button type="button" variant="outline" onClick={() => setShowVendorForm((value) => !value)}>Add</Button></div></FieldLabel>
          <FieldLabel label="Vendor invoice number"><Input value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} required /></FieldLabel>
          <FieldLabel label="Invoice date"><Input type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} required /></FieldLabel>
          <FieldLabel label="Receipt date"><Input type="date" value={receiptDate} onChange={(event) => setReceiptDate(event.target.value)} required /></FieldLabel>
        </div>
        {showVendorForm ? <form onSubmit={(event) => void addVendor(event)} className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-2">
          <strong className="sm:col-span-2">New vendor</strong>
          <FieldLabel label="Vendor name"><Input value={newName} onChange={(event) => setNewName(event.target.value)} required /></FieldLabel>
          <FieldLabel label="Owner name"><Input value={newOwner} onChange={(event) => setNewOwner(event.target.value)} required /></FieldLabel>
          <FieldLabel label="Contact"><Input value={newContact} onChange={(event) => setNewContact(event.target.value)} required /></FieldLabel>
          <FieldLabel label="Address"><Input value={newAddress} onChange={(event) => setNewAddress(event.target.value)} required /></FieldLabel>
          <FieldLabel className="sm:col-span-2" label="Companies provided"><Input value={newCompanies} onChange={(event) => setNewCompanies(event.target.value)} placeholder="Comma separated" required /></FieldLabel>
          <FieldLabel className="sm:col-span-2" label="Notes"><Textarea value={newNotes} onChange={(event) => setNewNotes(event.target.value)} /></FieldLabel>
          <Button className="sm:col-span-2" disabled={busy}>Save vendor</Button>
        </form> : null}
        <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void scan() }}><Input ref={scanRef} value={barcode} onChange={(event) => setBarcode(event.target.value)} placeholder="Scan barcode, then Enter" aria-label="Scan product barcode" autoFocus /><Button type="submit">Scan item</Button></form>
        {newProduct ? <div className="grid gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 sm:grid-cols-2">
          <p className="sm:col-span-2 text-sm font-semibold">Barcode {newProduct.barcode} is not in the catalog. Create product.</p>
          <FieldLabel label="Product name"><Input value={newProduct.name} onChange={(event) => setNewProduct({ ...newProduct, name: event.target.value })} /></FieldLabel>
          <FieldLabel label="Category"><Input value={newProduct.category} onChange={(event) => setNewProduct({ ...newProduct, category: event.target.value })} /></FieldLabel>
          <FieldLabel label="Selling price"><Input type="number" min="0" step="0.01" value={newProduct.price} onChange={(event) => setNewProduct({ ...newProduct, price: event.target.value })} /></FieldLabel>
          <Button type="button" className="self-end" onClick={addNewProduct}>Add to GRN</Button>
        </div> : null}
        <div className="grid gap-2">
          {lines.length === 0 ? <p className="rounded border border-dashed p-5 text-center text-sm text-muted-foreground">Scan a barcode to add received goods.</p> : lines.map((line, index) => <div key={line.productId} className="grid gap-2 rounded border border-border p-3 sm:grid-cols-[minmax(0,1.5fr)_6rem_8rem_auto] sm:items-end">
      <div className="min-w-0"><strong className="block truncate">{line.productName}</strong><span className="text-xs text-muted-foreground">{line.barcode} · Current stock {line.stockAtScan ?? 0}</span>{line.newProduct ? <Badge variant="secondary" className="ml-2">New</Badge> : null}</div>
            <FieldLabel label="Received qty"><Input type="number" min="1" step="1" value={line.quantity} onChange={(event) => setLines((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: Math.max(1, Math.trunc(Number(event.target.value) || 1)) } : item))} /></FieldLabel>
            <FieldLabel label="Cost / unit"><Input type="number" min="0.01" step="0.01" value={line.unitCostPaise ? (line.unitCostPaise / 100).toFixed(2) : ''} onChange={(event) => setLines((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, unitCostPaise: event.target.value === '' ? 0 : rupeesToPaise(Number(event.target.value)) } : item))} /></FieldLabel>
            <Button type="button" variant="outline" onClick={() => setLines((items) => items.filter((_, itemIndex) => itemIndex !== index))}>Remove</Button>
            <p className="text-right text-sm font-semibold sm:col-span-4">Line value: {money(line.quantity * line.unitCostPaise)}</p>
          </div>)}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3"><strong className="text-lg">GRN payable: {money(totalPaise)}</strong><div className="flex gap-2"><Button type="button" variant="outline" disabled={busy || !lines.length} onClick={() => void saveDraft()}>Save draft</Button><Button type="button" disabled={busy || !enabled || !lines.length || !vendorId || !invoiceNumber.trim()} onClick={() => void submitDraft()}>{busy ? 'Saving…' : 'Submit GRN'}</Button></div></div>
      </CardContent></Card>
    </div>
    <Card><CardHeader><SectionHeading eyebrow="Recent activity" title="GRN History" description="Drafts do not affect stock or vendor payables." /></CardHeader><CardContent className="grid max-h-[75vh] content-start gap-2 overflow-y-auto">
      {receipts.map((receipt) => <article key={receipt.id} className="grid gap-2 rounded-md border border-border p-3">
        <div className="flex items-start justify-between gap-2"><div><strong>{receipt.vendorName}</strong><p className="text-xs text-muted-foreground">Invoice {receipt.invoiceNumber} · {receipt.receiptDate}</p></div><Badge variant={receipt.status === 'submitted' ? 'success' : 'secondary'}>{receipt.status}</Badge></div>
        <div className="flex items-center justify-between text-sm"><span>{receipt.lines.length} line(s)</span><strong>{money(receipt.totalPaise)}</strong></div>
        {receipt.status === 'draft' ? <div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => editDraft(receipt)}>Continue</Button><Button size="sm" disabled={busy || !enabled} onClick={() => void submitDraft(receipt.id)}>Submit</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => void deletePosGoodsReceiptDraft(receipt.id, currentUser).then(() => showToast('Draft deleted.')).catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to delete draft.'))}>Delete draft</Button></div> : null}
        {receipt.status === 'submitted' && currentUser.role === 'owner' ? <Button size="sm" variant="outline" disabled={busy} onClick={() => {
          const reason = window.prompt('Reason for reversing this GRN?')
          if (!reason?.trim()) return
          setBusy(true)
          void reversePosGoodsReceipt(receipt.id, reason, currentUser).then(() => showToast('GRN reversed with stock and payable adjustments. Create a corrected GRN if needed.')).catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to reverse GRN.')).finally(() => setBusy(false))
        }}>Reverse / correct</Button> : null}
      </article>)}
      {receipts.length === 0 ? <p className="text-sm text-muted-foreground">No GRNs recorded yet.</p> : null}
    </CardContent></Card>
    </div>}
  </div>
}

function StockAuditPanel({ currentUser, showToast }: { currentUser: AppUser; showToast: (message: string) => void }) {
  const [barcode, setBarcode] = useState('')
  const [items, setItems] = useState<{ product: PosProduct; physicalQuantity: string }[]>([])
  const [audits, setAudits] = useState<PosStockAudit[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const scanRef = useRef<HTMLInputElement>(null)

  useEffect(() => subscribePosStockAudits(setAudits, (cause) => setError(cause.message)), [])

  async function scan() {
    const value = barcode.trim()
    if (!value) return
    setBusy(true); setError('')
    try {
      const found = await findPosProductByBarcode(value)
      if (!found || !found.active) throw new Error('Barcode not found in the active catalog. Add the product through Goods Receipt first.')
      if (items.some((item) => item.product.id === found.id)) throw new Error(`${found.name} is already queued. Change its count in the list below.`)
      setItems((current) => [...current, { product: found, physicalQuantity: String(found.currentQuantity) }])
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Barcode lookup failed.') }
    finally { setBarcode(''); setBusy(false); scanRef.current?.focus() }
  }

  async function saveCounts() {
    if (!items.length) return
    const invalidCount = items.find((item) => item.physicalQuantity === '' || !Number.isInteger(Number(item.physicalQuantity)) || Number(item.physicalQuantity) < 0)
    if (invalidCount) { setError(`Enter a whole physical quantity of zero or more for ${invalidCount.product.name}.`); return }
    setBusy(true); setError('')
    let savedCount = 0
    let adjustedCount = 0
    const batchId = crypto.randomUUID()
    try {
      for (let offset = 0; offset < items.length; offset += 5) {
        const group = items.slice(offset, offset + 5)
        const results = await reconcilePosStockAuditBatch(group.map(({ product, physicalQuantity }) => ({
          productId: product.id, physicalQuantity: Number(physicalQuantity), expectedRevision: product.revision,
        })), currentUser, batchId)
        savedCount += results.length
        adjustedCount += results.filter((result) => result.difference !== 0).length
        const savedIds = new Set(group.map((item) => item.product.id))
        setItems((current) => current.filter((item) => !savedIds.has(item.product.id)))
      }
      showToast(`Audit recorded for ${savedCount} products; stock adjusted for ${adjustedCount}.`)
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : 'Unable to save stock counts.'
      setError(savedCount ? `Saved ${savedCount} counts; remaining counts are still queued. ${detail}` : detail)
    }
    finally { setBusy(false) }
  }

  return <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(19rem,0.9fr)]">
    <Card><CardHeader><SectionHeading eyebrow="Inventory audit" title="Count Physical Stock" description="Scanning and submitting a count reconciles system stock to the physical quantity. This creates no vendor payable." /></CardHeader><CardContent className="grid gap-3">
      {error ? <p role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">{error}</p> : null}
      <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void scan() }}><Input ref={scanRef} value={barcode} onChange={(event) => setBarcode(event.target.value)} aria-label="Scan audit barcode" placeholder="Scan barcode, then Enter" autoFocus disabled={busy} /><Button disabled={busy}>Scan</Button></form>
      {items.map(({ product, physicalQuantity }) => <div key={product.id} className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[minmax(0,1fr)_6rem_9rem_6rem_auto] sm:items-center">
        <div className="min-w-0"><strong className="block truncate">{product.name}</strong><span className="text-xs text-muted-foreground">{product.barcode}</span></div>
        <div className="rounded-md bg-secondary/40 p-3"><span className="block text-xs text-muted-foreground">System stock at scan</span><strong className="text-xl tabular-nums">{product.currentQuantity}</strong></div>
        <FieldLabel label="Physical quantity counted"><Input type="number" min="0" step="1" value={physicalQuantity} onChange={(event) => setItems((current) => current.map((item) => item.product.id === product.id ? { ...item, physicalQuantity: event.target.value } : item))} /></FieldLabel>
        <p className="text-sm">Difference: <strong>{physicalQuantity !== '' && Number.isInteger(Number(physicalQuantity)) ? Number(physicalQuantity) - product.currentQuantity : '—'}</strong></p>
        <Button type="button" variant="outline" disabled={busy} onClick={() => setItems((current) => current.filter((item) => item.product.id !== product.id))}>Remove</Button>
      </div>)}
      {items.length ? <>
        <p className="text-xs text-muted-foreground">{items.length} item(s) queued. Save processes the list in atomic groups of up to 5. If a group fails, earlier groups stay saved and unsaved products remain queued.</p>
        <Button disabled={busy} onClick={() => void saveCounts()}>{busy ? 'Saving counts…' : `Save ${items.length} counts & reconcile stock`}</Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={() => setItems([])}>Clear list</Button>
      </> : <p className="rounded border border-dashed p-5 text-center text-sm text-muted-foreground">Scan items to build a count list. Stock changes only when you save the list.</p>}
    </CardContent></Card>
    <Card><CardHeader><SectionHeading eyebrow="Audit trail" title="Recent Counts" description="Latest 50 physical counts." /></CardHeader><CardContent className="grid max-h-[75vh] content-start gap-2 overflow-y-auto">
      {audits.map((audit) => <article key={audit.id} className="rounded-md border border-border p-3 text-sm"><div className="flex justify-between gap-2"><strong>{audit.productName}</strong><strong>{audit.difference > 0 ? '+' : ''}{audit.difference}</strong></div><p className="text-xs text-muted-foreground">System {audit.systemQuantityBefore} → Counted {audit.physicalQuantity} · {audit.actorName}</p><time className="text-xs text-muted-foreground">{new Date(audit.createdAt).toLocaleString('en-IN')}</time></article>)}
      {audits.length === 0 ? <p className="text-sm text-muted-foreground">No stock audits recorded yet.</p> : null}
    </CardContent></Card>
  </div>
}
