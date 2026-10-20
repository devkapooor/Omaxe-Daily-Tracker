import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Printer, X } from 'lucide-react'
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
import { allocateInternalStockBarcode, completePosStockAuditBatch, findPosProductByBarcode, getPosCost, saveStockReceiptDraft, deletePosGoodsReceiptDraft, submitPosGoodsReceipt, beginStockAudit, postStockAuditGroup, previewStockReceiptReversal, reversePosGoodsReceipt } from '../data/posRepository'
import { createVendorV2 } from '@/store/vendorLedgerV2Repository'
import { serverNowIso } from '@/shared/lib/serverClock'
import { where } from 'firebase/firestore'
import { dateConstraints, readPage, readSource } from '@/features/stock/data/stockQueries'
import { lookupReceiptInvoice } from '@/features/stock/data/receiveStockRepository'
import { useServerPage } from '@/features/stock/hooks/useServerPage'
import { StockPageControls } from '@/features/stock/components/StockPageControls'
import { SourceRecord } from '@/features/stock/components/StockSourceDetails'
import { recentStockDate } from '@/features/stock/domain/stockDates'
import { StockOperationBoundary } from '@/features/stock/components/StockOperationBoundary'
import { firebaseConfig } from '@/shared/lib/firebase'
import type { ReceiptReversalPreview } from '@/features/stock/data/stockPostingRepository'
import { StatusPanel } from '@/shared/ui/status-panel'
import { printInternalBarcode } from '@/features/stock/domain/internalBarcode'

function productMrpPaise(product: PosProduct) {
  const raw = Object.entries(product.sourceValues ?? {}).find(([key]) => key.trim().toLocaleLowerCase('en-IN') === 'printed mrp')?.[1]
  if (!raw?.trim()) return null
  const amount = Number(raw.replace(/[₹,\s]/g, ''))
  return Number.isFinite(amount) && amount >= 0 ? rupeesToPaise(amount) : null
}

const money = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function PosGoodsReceipt({ currentUser, vendors, enabled, showToast, onVendorChange, renderVendorPicker, view, onViewChange }: {
  currentUser: AppUser
  vendors: VendorV2[]
  enabled: boolean
  showToast: (message: string) => void
  onVendorChange: (id: string) => void
  renderVendorPicker: (value: string, onValueChange: (id: string) => void) => ReactNode
  view: 'receipt' | 'history'
  onViewChange: (view: 'receipt' | 'history') => void
}) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [vendorId, setVendorId] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(today())
  const [receiptDate, setReceiptDate] = useState(today())
  const [lines, setLines] = useState<PosGoodsReceiptLine[]>([])
  const [draftId, setDraftId] = useState<string | undefined>()
  const [draftRevision, setDraftRevision] = useState(0)
  const [barcode, setBarcode] = useState('')
  const [newProduct, setNewProduct] = useState<{ barcode: string; name: string; category: string; mrp: string; cost: string; internalBarcode?: boolean } | null>(null)
  const [newName, setNewName] = useState('')
  const [newOwner, setNewOwner] = useState('')
  const [newContact, setNewContact] = useState('')
  const [newAddress, setNewAddress] = useState('')
  const [newCompanies, setNewCompanies] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [showVendorForm, setShowVendorForm] = useState(false)
  const [invoiceTotal, setInvoiceTotal] = useState('')
  const [historyInvoice, setHistoryInvoice] = useState('')
  const [historyFrom, setHistoryFrom] = useState(recentStockDate)
  const [historyTo, setHistoryTo] = useState(today)
  const [historyStatus, setHistoryStatus] = useState('')
  const [historyVendor, setHistoryVendor] = useState('')
  const [historySearch, setHistorySearch] = useState({ vendor: '', invoice: '' })
  useEffect(() => { const timer = window.setTimeout(() => setHistorySearch({ vendor: historyVendor, invoice: historyInvoice }), 300); return () => window.clearTimeout(timer) }, [historyVendor, historyInvoice])
  const historyPending = historyVendor !== historySearch.vendor || historyInvoice !== historySearch.invoice
  const historyKey = JSON.stringify([historyFrom, historyTo, historyStatus, historySearch])
  const history = useServerPage<PosGoodsReceipt>(historyKey, (cursor) => readPage('goodsReceipts', [...dateConstraints(historyFrom, historyTo), ...(historyStatus ? [where('status', '==', historyStatus)] : []), ...(historySearch.vendor.trim() ? [where('vendorId', '==', historySearch.vendor.trim())] : []), ...(historySearch.invoice.trim() ? [where('invoiceNumber', '==', historySearch.invoice.trim())] : [])], cursor, 25, historyKey), view === 'history')
  const [invoiceResult, setInvoiceResult] = useState<{ key: string; value: PosGoodsReceipt | null; error: string }>({ key: '', value: null, error: '' })
  const [invoiceAttempt, setInvoiceAttempt] = useState(0)
  const invoiceKey = JSON.stringify([vendorId, normalizeInvoiceNumber(invoiceNumber)])
  const [selectedReceipt, setSelectedReceipt] = useState<PosGoodsReceipt | null>(null)
  const [receiptAction, setReceiptAction] = useState<'view' | 'reverse' | 'submit' | null>(null)
  const [reverseReason, setReverseReason] = useState('')
  const [reversalPreview, setReversalPreview] = useState<ReceiptReversalPreview | null>(null)
  const draftReference = useRef<string | undefined>(undefined)
  const scanRef = useRef<HTMLInputElement>(null)
  const activeVendors = useMemo(() => vendors.filter((vendor) => vendor.active).sort((a, b) => a.canonicalName.localeCompare(b.canonicalName)), [vendors])
  const selectedVendor = activeVendors.find((vendor) => vendor.id === vendorId)
  const matchingInvoice = invoiceResult.key === invoiceKey ? invoiceResult.value : null
  const receivedValuePaise = lines.reduce((sum, line) => sum + line.quantity * line.unitCostPaise, 0)
  const totalPaise = invoiceTotal.trim() && Number.isFinite(Number(invoiceTotal)) ? rupeesToPaise(Number(invoiceTotal)) : 0
  const linesReady = lines.length > 0 && lines.every((line) => Number.isInteger(line.quantity) && line.quantity > 0 && Number.isSafeInteger(line.unitCostPaise) && line.unitCostPaise > 0 && Number.isSafeInteger(line.sellingPricePaise) && (line.sellingPricePaise ?? -1) >= 0 && Number.isSafeInteger(line.mrpPaise) && (line.mrpPaise ?? -1) >= 0 && (line.sellingPricePaise ?? Infinity) <= (line.mrpPaise ?? -1))
  useEffect(() => { onVendorChange(vendorId) }, [vendorId, onVendorChange])
  useEffect(() => {
    if (view !== 'receipt' || !vendorId || !invoiceNumber.trim() || !enabled) return
    let active = true
    const timer = window.setTimeout(() => {
      void lookupReceiptInvoice(vendorId, invoiceNumber).then((value) => { if (active) setInvoiceResult({ key: invoiceKey, value, error: '' }) }).catch((cause: unknown) => { if (active) setInvoiceResult({ key: invoiceKey, value: null, error: cause instanceof Error ? cause.message : 'Invoice lookup failed.' }) })
    }, 300)
    return () => { active = false; window.clearTimeout(timer) }
  }, [vendorId, invoiceNumber, enabled, invoiceKey, invoiceAttempt, view])

  function resetForm() {
    setVendorId(''); setInvoiceNumber(''); setInvoiceDate(today()); setReceiptDate(today()); setLines([]); setDraftId(undefined); draftReference.current = undefined; setDraftRevision(0); setNewProduct(null); setInvoiceTotal('')
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
        setNewProduct({ barcode: value, name: '', category: '', mrp: '', cost: '' })
        return
      }
      const cost = await getPosCost(product.id)
      setLines((current) => {
        const found = current.find((line) => line.productId === product.id)
        if (found) return [{ ...found, quantity: found.quantity + 1 }, ...current.filter((line) => line.productId !== product.id)]
        return [{
          productId: product.id, barcode: product.barcode, productName: product.name, category: product.category,
          quantity: 0, unitCostPaise: cost ?? 0, unitCostInput: cost ? (cost / 100).toFixed(2) : '',
          sellingPricePaise: productMrpPaise(product) ?? undefined, sellingPriceInput: productMrpPaise(product) === null ? '' : ((productMrpPaise(product) ?? 0) / 100).toFixed(2), sellingPriceManuallyEdited: false,
          lineTotalPaise: 0, stockAtScan: product.currentQuantity, expectedRevision: product.revision, mrpPaise: productMrpPaise(product),
          mrpInput: productMrpPaise(product) === null ? '' : String((productMrpPaise(product) ?? 0) / 100),
        }, ...current]
      })
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Barcode lookup failed.') }
    finally { setBarcode(''); scanRef.current?.focus() }
  }

  async function addNewProduct() {
    if (!newProduct || !newProduct.name.trim() || !newProduct.category.trim() || !newProduct.mrp.trim() || !newProduct.cost.trim()) {
      setError('New products require a name, category, cost, and MRP.')
      return
    }
    const id = `pos-${crypto.randomUUID()}`
    const mrpValue = Number(newProduct.mrp)
    const costValue = Number(newProduct.cost)
    if (!Number.isFinite(mrpValue) || mrpValue < 0) { setError('Enter a valid MRP of zero or greater.'); return }
    if (!Number.isFinite(costValue) || costValue <= 0) { setError('Enter a cost price greater than zero.'); return }
    setBusy(true); setError('')
    try {
      const draftKey = draftId ?? (draftReference.current ??= crypto.randomUUID())
      if (!draftId) setDraftId(draftKey)
      const barcodeInfo = newProduct.internalBarcode
        ? await allocateInternalStockBarcode({ draftId: draftKey, productId: id }, currentUser)
        : { barcode: newProduct.barcode, draftId: draftKey, productId: id }
      setLines((current) => [{
        productId: id, barcode: barcodeInfo.barcode, productName: newProduct.name.trim(), category: newProduct.category.trim(),
        quantity: 0, unitCostPaise: rupeesToPaise(costValue), unitCostInput: costValue.toFixed(2), lineTotalPaise: 0, newProduct: true,
        ...(newProduct.internalBarcode ? { internalBarcode: true as const } : {}),
        sellingPricePaise: rupeesToPaise(mrpValue), sellingPriceInput: mrpValue.toFixed(2), sellingPriceManuallyEdited: false,
        mrpPaise: rupeesToPaise(mrpValue), mrpInput: mrpValue.toFixed(2), mrpChanged: true,
      }, ...current])
      setNewProduct(null)
      scanRef.current?.focus()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to prepare the new GRN product.') }
    finally { setBusy(false) }
  }

  async function saveDraft() {
    if (!selectedVendor) throw new Error('Choose a vendor.')
    setBusy(true)
    try {
      const id = await saveStockReceiptDraft({
        id: draftId ?? (draftReference.current ??= crypto.randomUUID()), expectedRevision: draftRevision, vendorId, vendorName: selectedVendor.canonicalName, invoiceNumber, invoiceDate, receiptDate, lines, invoiceTotalPaise: totalPaise,
      }, currentUser)
      setDraftId(id.id); setDraftRevision(id.revision)
      showToast('GRN draft saved. Stock and payable are unchanged.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save GRN draft.') }
    finally { setBusy(false) }
  }

  async function prepareSubmit() {
    setBusy(true); setError('')
    try {
      const saved = await saveStockReceiptDraft({ id: draftId ?? (draftReference.current ??= crypto.randomUUID()), expectedRevision: draftRevision, vendorId, vendorName: selectedVendor?.canonicalName ?? '', invoiceNumber, invoiceDate, receiptDate, lines, invoiceTotalPaise: totalPaise }, currentUser)
      setDraftId(saved.id); setDraftRevision(saved.revision); setSelectedReceipt(saved); setReceiptAction('submit')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to prepare the GRN.') }
    finally { setBusy(false) }
  }

  async function submitDraft(id?: string, expectedRevision?: number) {
    setBusy(true)
    try {
      const saved = id ? null : await saveStockReceiptDraft({
        id: draftId ?? (draftReference.current ??= crypto.randomUUID()), expectedRevision: draftRevision, vendorId, vendorName: selectedVendor?.canonicalName ?? '', invoiceNumber, invoiceDate, receiptDate, lines, invoiceTotalPaise: totalPaise,
      }, currentUser)
      const actualId = id ?? saved!.id
      if (saved) { setDraftId(saved.id); setDraftRevision(saved.revision) }
      const result = await submitPosGoodsReceipt(actualId, currentUser, expectedRevision ?? saved?.revision)
      showToast(result.payableCreated
        ? `GRN submitted. Stock updated and invoice payable created: ${money(result.totalPaise)}.`
        : `Partial receipt submitted. Stock updated and linked to existing invoice payable ${money(result.totalPaise)}.`)
      resetForm(); setReceiptAction(null); history.refresh()
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

  async function editDraft(cached: PosGoodsReceipt) {
    const receipt = await readSource<PosGoodsReceipt>('goodsReceipts', cached.id).catch((cause: unknown) => { setError(cause instanceof Error ? cause.message : 'Unable to open draft.'); return null })
    if (!receipt || receipt.status !== 'draft') { if (receipt) setError('This receipt is no longer a draft. Refresh history.'); return }
    if (receipt.lines.some(line => !line.newProduct && line.expectedRevision === undefined)) {
      const refreshedLines = await Promise.all(receipt.lines.map(async line => {
        if (line.newProduct || line.expectedRevision !== undefined) return line
        const product = await readSource<PosProduct>('products', line.productId)
        if (!product) throw new Error('A legacy draft product is unavailable. Remove and re-scan it.')
        return { ...line, expectedRevision: product.revision, stockAtScan: product.currentQuantity }
      })).catch(cause => { setError(cause instanceof Error ? cause.message : 'Unable to refresh legacy draft.'); return [] })
      if (!refreshedLines.length) return
      receipt.lines = refreshedLines
      showToast('Legacy draft revisions refreshed. Review quantities and prices, then save before submitting.')
    }
    setDraftId(receipt.id); setDraftRevision(receipt.revision); setVendorId(receipt.vendorId); setInvoiceNumber(receipt.invoiceNumber)
    setInvoiceDate(receipt.invoiceDate); setReceiptDate(receipt.receiptDate); setLines(receipt.lines.map((line) => ({ ...line, unitCostInput: line.unitCostInput ?? (line.unitCostPaise ? (line.unitCostPaise / 100).toFixed(2) : ''), sellingPriceInput: line.sellingPriceInput ?? (line.sellingPricePaise === undefined ? '' : (line.sellingPricePaise / 100).toFixed(2)), mrpInput: line.mrpInput ?? (line.mrpPaise === null || line.mrpPaise === undefined ? '' : String(line.mrpPaise / 100)) }))); setInvoiceTotal(receipt.invoiceTotalPaise ? String(receipt.invoiceTotalPaise / 100) : ''); onViewChange('receipt'); setError('')
  }

  async function openReceipt(cached: PosGoodsReceipt, action: 'view' | 'reverse' | 'submit') {
    if (busy) return
    setBusy(true); setError('')
    try {
      const receipt = await readSource<PosGoodsReceipt>('goodsReceipts', cached.id)
      if (!receipt) throw new Error('GRN was not found.')
      if (action === 'submit' && receipt.status !== 'draft') throw new Error('Only a draft can be submitted.')
      if (action === 'reverse' && receipt.status !== 'submitted') throw new Error('Only a submitted GRN can be reversed.')
      const preview = action === 'reverse' ? await previewStockReceiptReversal(receipt.id, currentUser) : null
      setReversalPreview(preview); setSelectedReceipt(receipt); setReceiptAction(action); setReverseReason('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to open GRN.') }
    finally { setBusy(false) }
  }

  async function reverseReceipt() {
    if (!selectedReceipt || !reversalPreview) return
    setBusy(true)
    try {
      await reversePosGoodsReceipt(selectedReceipt.id, reverseReason, currentUser, reversalPreview)
      showToast('GRN reversed with stock and payable adjustments.')
      setReceiptAction(null); history.refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to reverse the GRN.') }
    finally { setBusy(false) }
  }

  useEffect(() => {
    function recovered(event: Event) {
      const detail = (event as CustomEvent).detail as { actorId: string; method: string; result: PosGoodsReceipt }
      if (detail.actorId !== currentUser.id) return
      if (detail.method === 'saveStockReceiptDraft') {
        const r = detail.result
        setDraftId(r.id); setDraftRevision(r.revision); setVendorId(r.vendorId); setInvoiceNumber(r.invoiceNumber); setInvoiceDate(r.invoiceDate); setReceiptDate(r.receiptDate); setLines(r.lines); setInvoiceTotal(String((r.invoiceTotalPaise ?? 0) / 100))
        void readSource<PosGoodsReceipt>('goodsReceipts', r.id).then(latest => {
          if (!latest) { setError('Recovered draft source is unavailable. Check GRN History before continuing.'); return }
          if (latest.status !== 'draft') { resetForm(); setReceiptAction(null); history.refresh(); showToast('The recovered source has since been submitted or reversed. Open GRN History for its current status.'); return }
          setDraftRevision(latest.revision); setLines(latest.lines); setVendorId(latest.vendorId); setInvoiceNumber(latest.invoiceNumber); setInvoiceDate(latest.invoiceDate); setReceiptDate(latest.receiptDate); setInvoiceTotal(String((latest.invoiceTotalPaise ?? 0) / 100))
        }).catch(() => setError('Original draft recovered; current source could not be refreshed. Check GRN History before continuing.'))
      } else if (detail.method === 'submitStockReceipt') { resetForm(); setReceiptAction(null); history.refresh() }
      else if (['reverseStockReceipt', 'deleteStockReceiptDraft'].includes(detail.method)) { setReceiptAction(null); history.refresh() }
    }
    window.addEventListener('stock-operation-recovered', recovered)
    return () => window.removeEventListener('stock-operation-recovered', recovered)
  })

  return <StockOperationBoundary actor={currentUser}><div className="grid gap-3">
    {error && !receiptAction ? <p role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">{error}</p> : null}
    {view === 'receipt' && vendorId && invoiceNumber.trim() && enabled && invoiceResult.key !== invoiceKey ? <StatusPanel>Checking invoice reference…</StatusPanel> : null}
    {view === 'receipt' && invoiceResult.key === invoiceKey && invoiceResult.error ? <StatusPanel variant="destructive">{invoiceResult.error}<Button variant="outline" size="sm" onClick={() => setInvoiceAttempt((value) => value + 1)}>Retry invoice lookup</Button></StatusPanel> : null}
    {view === 'receipt' ? <Card><CardHeader className="pb-2"><h2 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">Goods Receipt Note (GRN)</h2></CardHeader><CardContent className="grid gap-3">
      {!enabled ? <p role="alert" className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">The vendor ledger is not active. A GRN cannot be submitted until it is enabled.</p> : null}
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <FieldLabel label="Vendor"><div className="flex gap-2">{renderVendorPicker(vendorId, setVendorId)}<Button type="button" size="sm" variant="outline" onClick={() => setShowVendorForm(true)}>Add vendor</Button></div></FieldLabel>
        <FieldLabel label="Vendor invoice number"><Input value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} required /></FieldLabel>
        <FieldLabel label="Invoice date"><Input type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} required /></FieldLabel>
        <FieldLabel label="Receipt date"><Input type="date" value={receiptDate} onChange={(event) => setReceiptDate(event.target.value)} required /></FieldLabel>
      </div>
      {matchingInvoice ? <p role="status" className="rounded-md border border-primary/30 bg-primary/5 p-2 text-sm">A submitted GRN already exists for this vendor invoice. This receipt will add stock and link to its existing payable of {money(matchingInvoice.invoiceTotalPaise ?? matchingInvoice.totalPaise)}; enter the same full invoice amount.</p> : null}
      <div className="grid gap-2 sm:flex"><form className="flex min-w-0 gap-2 sm:flex-1" onSubmit={(event) => { event.preventDefault(); void scan() }}><Input className="min-w-0 flex-1" ref={scanRef} value={barcode} onChange={(event) => setBarcode(event.target.value)} placeholder="Scan barcode, then Enter" aria-label="Scan product barcode" autoFocus /><Button type="submit">Scan item</Button></form><Button type="button" className="w-full sm:w-auto" variant="outline" onClick={() => { setError(''); setNewProduct({ barcode: '', name: '', category: '', mrp: '', cost: '', internalBarcode: true }) }}>Add item without barcode</Button></div>
      {newProduct ? <div className="grid gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 sm:grid-cols-2 xl:grid-cols-[minmax(12rem,1.5fr)_minmax(9rem,1fr)_minmax(8rem,.8fr)_minmax(8rem,.8fr)_auto_auto]">
        <p className="text-sm font-semibold sm:col-span-2 xl:col-span-6">{newProduct.internalBarcode ? 'Add a new product and assign an internal store barcode.' : `Barcode ${newProduct.barcode} is not in the catalog. Create product.`}</p>
        <FieldLabel label="Product name"><Input value={newProduct.name} onChange={(event) => setNewProduct({ ...newProduct, name: event.target.value })} required /></FieldLabel>
        <FieldLabel label="Category"><Input value={newProduct.category} onChange={(event) => setNewProduct({ ...newProduct, category: event.target.value })} required /></FieldLabel>
        <FieldLabel label="Cost price"><Input type="number" min="0.01" step="0.01" value={newProduct.cost} onChange={(event) => setNewProduct({ ...newProduct, cost: event.target.value })} required /></FieldLabel>
        <FieldLabel label="MRP"><Input type="number" min="0" step="0.01" value={newProduct.mrp} onChange={(event) => setNewProduct({ ...newProduct, mrp: event.target.value })} required /></FieldLabel>
        <Button type="button" className="self-end" disabled={busy} onClick={() => void addNewProduct()}>{busy ? 'Adding…' : 'Add to GRN'}</Button>
        <Button type="button" className="self-end" variant="outline" disabled={busy} onClick={() => setNewProduct(null)}>Cancel</Button>
        {newProduct.internalBarcode ? <p className="text-xs text-muted-foreground sm:col-span-2 xl:col-span-6">This is an internal store barcode, not an official GS1/UPC product code. It will scan after the GRN is submitted; stock and vendor payable change only on submission.</p> : null}
      </div> : null}
      <div className="overflow-x-auto rounded-md border border-border">
        <div className="grid min-w-[1080px] grid-cols-[minmax(13rem,1fr)_5.5rem_7rem_7rem_7rem_8rem_4rem] items-center gap-2 border-b bg-muted/50 px-3 py-2 text-xs font-semibold text-muted-foreground"><span>Product · stock</span><span>Received</span><span>Cost / unit</span><span>MRP</span><span>Selling price</span><span className="text-right">Line value</span><span /></div>
        <div className="max-h-[48vh] min-w-[1080px] overflow-y-auto">
          {lines.length === 0 ? <p className="p-5 text-center text-sm text-muted-foreground">Scan a barcode to add received goods. Enter quantity, cost, MRP, and selling price for every line.</p> : lines.map((line) => <div key={line.productId} className="grid grid-cols-[minmax(13rem,1fr)_5.5rem_7rem_7rem_7rem_8rem_4rem] items-center gap-2 border-b px-3 py-2 last:border-0">
            <div className="min-w-0"><strong className="block truncate text-sm">{line.productName}{line.newProduct ? <Badge variant="secondary" className="ml-2">New</Badge> : null}</strong><span className="text-[11px] text-muted-foreground">{line.barcode} · Stock {line.stockAtScan ?? 0}</span>{line.internalBarcode ? <Button type="button" size="sm" variant="outline" className="mt-1 h-7 px-2 text-[11px]" aria-label={`Print barcode label for ${line.productName}`} onClick={() => { try { printInternalBarcode(line.barcode, line.productName) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to open the print window.') } }}><Printer size={13} />Print label</Button> : null}</div>
            <Input aria-label={`Received quantity for ${line.productName}`} className="h-8 px-2" type="number" min="1" step="1" required value={line.quantity || ''} onChange={(event) => setLines((items) => items.map((item) => item.productId === line.productId ? { ...item, quantity: event.target.value === '' ? 0 : Math.max(0, Math.trunc(Number(event.target.value) || 0)) } : item))} />
            <Input aria-label={`Unit cost for ${line.productName}`} className="h-8 px-2" type="text" inputMode="decimal" required value={line.unitCostInput ?? (line.unitCostPaise ? (line.unitCostPaise / 100).toFixed(2) : '')} placeholder="Enter cost" onChange={(event) => { const value = event.target.value; const parsed = Number(value); const valid = value.trim() !== '' && Number.isFinite(parsed) && parsed >= 0; setLines((items) => items.map((item) => item.productId === line.productId ? { ...item, unitCostInput: value, unitCostPaise: valid ? rupeesToPaise(parsed) : 0 } : item)) }} onBlur={() => setLines((items) => items.map((item) => { if (item.productId !== line.productId) return item; const parsed = Number(item.unitCostInput); return item.unitCostInput?.trim() && Number.isFinite(parsed) && parsed >= 0 ? { ...item, unitCostInput: parsed.toFixed(2), unitCostPaise: rupeesToPaise(parsed) } : item }))} />
            <Input aria-label={`MRP for ${line.productName}`} className="h-8 px-2" type="text" inputMode="decimal" required value={line.mrpInput ?? (line.mrpPaise === null || line.mrpPaise === undefined ? '' : String(line.mrpPaise / 100))} placeholder="Enter MRP" onChange={(event) => { const value = event.target.value; const parsed = Number(value); const valid = value.trim() !== '' && Number.isFinite(parsed) && parsed >= 0; setLines((items) => items.map((item) => item.productId === line.productId ? { ...item, mrpInput: value, mrpPaise: valid ? rupeesToPaise(parsed) : null, sellingPriceInput: valid ? parsed.toFixed(2) : '', sellingPricePaise: valid ? rupeesToPaise(parsed) : undefined, sellingPriceManuallyEdited: false, mrpChanged: true } : item)) }} onBlur={() => setLines((items) => items.map((item) => { if (item.productId !== line.productId) return item; const parsed = Number(item.mrpInput); return item.mrpInput?.trim() && Number.isFinite(parsed) && parsed >= 0 ? { ...item, mrpInput: parsed.toFixed(2), mrpPaise: rupeesToPaise(parsed), sellingPriceInput: parsed.toFixed(2), sellingPricePaise: rupeesToPaise(parsed), sellingPriceManuallyEdited: false, mrpChanged: true } : item }))} />
            <Input aria-label={`Selling price for ${line.productName}`} className="h-8 px-2" type="text" inputMode="decimal" required value={line.sellingPriceInput ?? (line.sellingPricePaise === undefined ? '' : (line.sellingPricePaise / 100).toFixed(2))} placeholder="Enter price" onChange={(event) => { const value = event.target.value; const parsed = Number(value); const valid = value.trim() !== '' && Number.isFinite(parsed) && parsed >= 0; setLines((items) => items.map((item) => item.productId === line.productId ? { ...item, sellingPriceInput: value, sellingPricePaise: valid ? rupeesToPaise(parsed) : undefined, sellingPriceManuallyEdited: true } : item)) }} onBlur={() => setLines((items) => items.map((item) => { if (item.productId !== line.productId) return item; const parsed = Number(item.sellingPriceInput); return item.sellingPriceInput?.trim() && Number.isFinite(parsed) && parsed >= 0 ? { ...item, sellingPriceInput: parsed.toFixed(2), sellingPricePaise: rupeesToPaise(parsed), sellingPriceManuallyEdited: true } : item }))} />
            <strong className="w-full text-right text-sm tabular-nums">{money(line.quantity * line.unitCostPaise)}</strong>
            <Button type="button" size="sm" variant="ghost" aria-label={`Remove ${line.productName}`} onClick={() => setLines((items) => items.filter((item) => item.productId !== line.productId))}>Remove</Button>
          </div>)}
        </div>
      </div>
      <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-[1fr_13rem_auto] sm:items-end">
        <div className="text-sm"><span className="block text-muted-foreground">Received stock value</span><strong>{money(receivedValuePaise)}</strong></div>
        <FieldLabel label="Full invoice payable"><Input type="number" min="0.01" step="0.01" value={invoiceTotal} onChange={(event) => setInvoiceTotal(event.target.value)} placeholder="Invoice total" required /></FieldLabel>
        <div className="flex gap-2"><Button type="button" variant="outline" disabled={busy || !selectedVendor || !lines.length || !totalPaise} onClick={() => void saveDraft()}>Save draft</Button><Button type="button" disabled={busy || !enabled || !linesReady || !selectedVendor || !invoiceNumber.trim() || !totalPaise || invoiceResult.key !== invoiceKey || Boolean(invoiceResult.error)} onClick={() => void prepareSubmit()}>{busy ? 'Saving…' : 'Submit GRN'}</Button></div>
      </div>
      <p className="text-xs text-muted-foreground">Quantity, unit cost, MRP, and selling price are required for every product line. Selling price starts at MRP and must not exceed MRP. The payable is the full invoice amount; stock increases only by the quantities received above.</p>
    </CardContent></Card> : <Card><CardHeader><SectionHeading eyebrow="Recorded activity" title="GRN History" description="Filtered server pages. Blank dates include older receipts." /></CardHeader><CardContent className="grid gap-3">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        <FieldLabel label="From"><Input type="date" value={historyFrom} onChange={(event) => setHistoryFrom(event.target.value)} /></FieldLabel>
        <FieldLabel label="To"><Input type="date" value={historyTo} onChange={(event) => setHistoryTo(event.target.value)} /></FieldLabel>
        <FieldLabel label="Status"><NativeSelect value={historyStatus} onChange={(event) => setHistoryStatus(event.target.value)}><option value="">All</option><option value="draft">Draft</option><option value="submitted">Submitted</option><option value="reversed">Reversed</option></NativeSelect></FieldLabel>
        <FieldLabel label="Exact vendor ID"><Input value={historyVendor} onChange={(event) => setHistoryVendor(event.target.value)} /></FieldLabel>
        <FieldLabel label="Exact invoice"><Input value={historyInvoice} onChange={(event) => setHistoryInvoice(event.target.value)} /></FieldLabel>
      </div>
      {historyPending || history.loading ? <StatusPanel>Loading receipts…</StatusPanel> : history.error ? <StatusPanel variant="destructive">{history.error}<Button variant="outline" size="sm" onClick={history.retry}>Retry</Button></StatusPanel> : <div className="grid gap-2">
        {history.items.map((receipt) => <article key={receipt.id} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"><div className="min-w-0"><strong className="block truncate">{receipt.vendorName}</strong><p className="text-xs text-muted-foreground">Invoice {receipt.invoiceNumber} · {receipt.receiptDate} · {receipt.lines.length} lines</p></div><div className="flex items-center gap-2"><Badge variant={receipt.status === 'submitted' ? 'success' : receipt.status === 'reversed' ? 'destructive' : 'secondary'}>{receipt.status}</Badge><strong className="text-sm">{money(receipt.invoiceTotalPaise ?? receipt.totalPaise)}</strong></div><div className="flex flex-wrap gap-1">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void openReceipt(receipt, 'view')}>View</Button>
          {receipt.status === 'draft' ? <><Button size="sm" variant="outline" disabled={busy} onClick={() => void editDraft(receipt)}>Continue</Button><Button size="sm" disabled={busy || !enabled} onClick={() => void openReceipt(receipt, 'submit')}>Submit</Button>{currentUser.role === 'owner' || receipt.createdByUid === currentUser.id ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => void deletePosGoodsReceiptDraft(receipt.id, currentUser).then(() => { showToast('Draft deleted.'); history.refresh() }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Unable to delete draft.'))}>Delete</Button> : null}</> : receipt.status === 'submitted' && currentUser.role === 'owner' ? <Button size="sm" variant="destructive" disabled={busy} onClick={() => void openReceipt(receipt, 'reverse')}>Reverse</Button> : null}
        </div></article>)}
        {!history.items.length ? <StatusPanel>No GRNs match these filters.</StatusPanel> : null}
      </div>}
      <StockPageControls {...history} loading={history.loading || historyPending} />
    </CardContent></Card>}
    {selectedReceipt && receiptAction ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3">
      <Card role="dialog" aria-modal="true" aria-label={receiptAction === 'reverse' ? 'Reverse GRN' : receiptAction === 'submit' ? 'Confirm GRN' : 'GRN details'} className="flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden shadow-xl">
        <CardHeader className="flex-row items-center justify-between border-b"><h2 className="font-semibold">{receiptAction === 'reverse' ? 'Reverse GRN' : receiptAction === 'submit' ? 'Confirm GRN' : 'GRN details'}</h2><Button size="icon" variant="ghost" disabled={busy} aria-label="Close GRN details" onClick={() => setReceiptAction(null)}><X /></Button></CardHeader>
        <CardContent className="space-y-3 overflow-y-auto pt-4">
          {error ? <p role="alert" className="rounded border border-destructive/50 p-3 text-sm text-destructive">{error}</p> : null}
          {receiptAction === 'view' ? <SourceRecord title="Goods receipt" value={selectedReceipt as unknown as Record<string, unknown>} /> : receiptAction === 'submit' ? <ReceiptSubmissionEffects receipt={selectedReceipt} /> : null}
          {receiptAction === 'submit' ? <><p className="rounded border border-amber-500/40 p-3 text-sm">Confirm the received quantities, full invoice payable and prices above. Existing product prices will be updated immediately, and effective price changes will be sent to the owner for review. Stock value may differ from the full payable for partial receipts.</p><div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setReceiptAction(null)}>Back</Button><Button disabled={busy} onClick={() => void submitDraft(selectedReceipt.id, selectedReceipt.revision)}>Confirm GRN submission</Button></div></> : receiptAction === 'reverse' ? <><p className="text-sm text-destructive">Reversal adjusts received stock and the linked payable and is permanently recorded.</p><ReceiptReversalEffects preview={reversalPreview} /><FieldLabel label="Reason for reversal"><Textarea value={reverseReason} onChange={(event) => setReverseReason(event.target.value)} /></FieldLabel><div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setReceiptAction('view')}>Cancel</Button><Button variant="destructive" disabled={busy || !reverseReason.trim()} onClick={() => void reverseReceipt()}>{busy ? 'Reversing…' : 'Confirm reversal'}</Button></div></> : <div className="flex justify-end"><Button onClick={() => setReceiptAction(null)}>Close</Button></div>}
          {receiptAction !== 'view' ? <details className="rounded border p-3 text-sm"><summary className="cursor-pointer font-medium">Recorded GRN details</summary><div className="mt-3"><SourceRecord title="Goods receipt" value={selectedReceipt as unknown as Record<string, unknown>} /></div></details> : null}
        </CardContent>
      </Card>
    </div> : null}
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
  </div></StockOperationBoundary>
}

function ReceiptSubmissionEffects({ receipt }: { receipt: PosGoodsReceipt }) {
  const price = (value: number | null | undefined) => value === null || value === undefined ? 'Not recorded' : money(value)
  return <section className="grid gap-2 rounded border p-3 text-sm" aria-label="Receipt submission effects"><strong>{receipt.vendorName} / {receipt.invoiceNumber}</strong><p>Full invoice payable: {money(receipt.invoiceTotalPaise ?? receipt.totalPaise)}</p><p>Received stock value: {money(receipt.lines.reduce((sum, line) => sum + line.quantity * line.unitCostPaise, 0))}</p>{receipt.lines.map(line => <div key={line.productId} className="border-t pt-2"><strong>{line.productName} / {line.barcode}</strong><p>Receive {line.quantity} at {money(line.unitCostPaise)} per unit</p><p>MRP {price(line.mrpBeforePaise)} to {price(line.mrpPaise)} / Selling {price(line.sellingPriceBeforePaise)} to {price(line.sellingPricePaise)}</p>{line.newProduct ? <p className="text-xs text-muted-foreground">New product: these are its initial prices.</p> : null}</div>)}</section>
}

function ReceiptReversalEffects({ preview }: { preview: ReceiptReversalPreview | null }) {
  if (!preview) return <StatusPanel>Reversal preview unavailable. Reopen this GRN.</StatusPanel>
  const price = (value: number | null) => value === null ? 'Not recorded' : money(value)
  return <section className="grid gap-2 rounded border p-3 text-sm" aria-label="Reversal effects"><p>Open payable removed: {money(preview.openPayableRemovedPaise)} · Vendor credit added: {money(preview.vendorCreditAddedPaise)}</p>{preview.lines.map(line => <div key={line.productId} className="border-t pt-2"><strong>{line.barcode}</strong><p>Quantity {line.quantityBefore} → {line.quantityAfter}</p><p>MRP {price(line.pricesBefore.mrpPaise)} → {price(line.pricesAfter.mrpPaise)} · Selling {money(line.pricesBefore.sellingPricePaise)} → {money(line.pricesAfter.sellingPricePaise)}</p><p className="text-xs text-muted-foreground">{line.priceRestoration === 'unavailable-historical-provenance' ? 'Price restoration unavailable: historical provenance not recorded.' : line.priceRestoration === 'skipped-mrp-unavailable' ? 'Price restoration unavailable: current MRP is invalid or not recorded.' : line.priceRestoration === 'skipped-price-ceiling' ? 'Price restoration skipped to preserve selling price at or below MRP.' : line.priceRestoration === 'restored-receipt-prices' ? 'Receipt-owned prices will be restored and recorded for owner review.' : 'Later price edits are preserved.'}{line.costInvalidated ? ' This receipt-owned cost will be marked unavailable.' : ' Later costs are preserved.'}</p></div>)}</section>
}

type AuditItem = { product: PosProduct; physicalQuantity: string; costPaise: number | null; costInput: string }
type AuditPlan = { id: string; note: string; items: AuditItem[] }
export function PosStockAuditPage({ currentUser, showToast }: { currentUser: AppUser; showToast: (message: string) => void }) {
  const [barcode, setBarcode] = useState('')
  const auditStorageKey = `alphahub:audit-plan:${firebaseConfig.projectId}:${currentUser.id}`
  const [stored] = useState<{ plan: AuditPlan | null; error: string }>(() => {
    try { const raw = sessionStorage.getItem(auditStorageKey); const plan = raw ? JSON.parse(raw) as AuditPlan : null; if (plan && (!plan.id || !plan.note || !Array.isArray(plan.items) || !plan.items.length)) throw new Error('Invalid audit plan'); return { plan, error: '' } }
    catch { return { plan: null, error: 'Audit recovery storage is unavailable. Preserve this tab and review source records before making another count.' } }
  })
  const [auditPlan, setAuditPlan] = useState<AuditPlan | null>(stored.plan)
  const [items, setItems] = useState<AuditItem[]>(stored.plan?.items ?? [])
  const [auditId, setAuditId] = useState(() => stored.plan?.id ?? createStockAuditId())
  const [note, setNote] = useState(stored.plan?.note ?? '')
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

  function clearAuditPlan() { sessionStorage.removeItem(auditStorageKey); setAuditPlan(null); setNote(''); setAuditId(createStockAuditId()) }
  async function saveCounts() {
    const validationError = !auditPlan ? validateCounts() : ''
    if (validationError) { setError(validationError); setConfirming(false); return }
    setBusy(true); setError('')
    try {
      const plan = auditPlan ?? { id: auditId, note: note.trim(), items }
      sessionStorage.setItem(auditStorageKey, JSON.stringify(plan)); setAuditPlan(plan)
      await beginStockAudit(plan.items.map(({ product, physicalQuantity, costPaise, costInput }) => ({ productId: product.id, physicalQuantity: Number(physicalQuantity), expectedRevision: product.revision, ...(costPaise === null ? { suppliedCostPaise: rupeesToPaise(Number(costInput)) } : {}) })), currentUser, { id: plan.id, note: plan.note })
      let savedCount = 0, adjustedCount = 0, netImpactPaise = 0
      for (let offset = 0; offset < plan.items.length; offset += 5) {
        const results = await postStockAuditGroup(plan.id, offset / 5, currentUser)
        savedCount += results.length; adjustedCount += results.filter(r => r.difference !== 0).length; netImpactPaise += results.reduce((sum, r) => sum + r.valueImpactPaise, 0)
        const savedIds = new Set(results.map(r => r.productId))
        setItems(current => current.filter(item => !savedIds.has(item.product.id)))
      }
      await completePosStockAuditBatch(plan.id, currentUser)
      showToast(`${plan.id} saved: ${savedCount} products, ${adjustedCount} adjusted, net impact ${money(netImpactPaise)}.`)
      clearAuditPlan(); setItems([])
    } catch (cause) { setError(`Audit progress is preserved. Recover any pending operation, then resume this audit or finish it as interrupted. ${cause instanceof Error ? cause.message : 'Unable to confirm stock counts.'}`) }
    finally { setBusy(false); setConfirming(false); scanRef.current?.focus() }
  }
  async function finishInterrupted() {
    if (!auditPlan) return
    setBusy(true); setError('')
    try { await completePosStockAuditBatch(auditPlan.id, currentUser, true); clearAuditPlan(); showToast('Audit closed as interrupted. Posted counts remain recorded; re-scan remaining items before another audit.'); setItems([]) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to confirm interrupted completion.') }
    finally { setBusy(false) }
  }

  return <StockOperationBoundary actor={currentUser}>
    {stored.error ? <StatusPanel variant="destructive">{stored.error}</StatusPanel> : null}
    {auditPlan ? <StatusPanel>Audit {auditPlan.id} is preserved. Resume to recover confirmed groups, or close as interrupted.<div className="mt-2 flex flex-wrap gap-2"><Button disabled={busy} onClick={() => void saveCounts()}>Resume audit</Button><Button variant="outline" disabled={busy} onClick={() => void finishInterrupted()}>Finish interrupted audit</Button></div></StatusPanel> : null}
    <fieldset disabled={busy || !!auditPlan || !!stored.error} className="contents">
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
    </fieldset>
  </StockOperationBoundary>
}

function createStockAuditId() {
  const suffix = Array.from(crypto.getRandomValues(new Uint8Array(8)), (value) => value.toString(16).padStart(2, '0')).join('').toUpperCase()
  return `AUD-${today().replaceAll('-', '')}-${suffix}`
}
