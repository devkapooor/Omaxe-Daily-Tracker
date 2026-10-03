import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, Barcode, Boxes, FileClock, Pause, Plus, Printer, RotateCcw, Settings2, ShoppingCart, Trash2 } from 'lucide-react'
import type { AppUser } from '@/domain/financeTypes'
import { today } from '@/app/uiHelpers'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { FieldLabel } from '@/shared/ui/field-label'
import { Input } from '@/shared/ui/input'
import { NativeSelect } from '@/shared/ui/native-select'
import { SectionHeading } from '@/shared/ui/section-heading'
import { StatusPanel } from '@/shared/ui/status-panel'
import { usePosSandbox } from '../hooks/usePosSandbox'
import { calculateDiscount, paiseToRupees, posSubtotal, rupeesToPaise } from '../domain/posDomain'
import { parseApprovedPosCsv, sha256Hex } from '../domain/csvImport'
import type { PosBill, PosCartLine, PosDiscount, PosPaymentAllocation, PosPaymentMethod, PosProduct } from '../domain/types'
import {
  adjustPosStock,
  deleteHeldCart,
  finalizePosBill,
  findPosProductByBarcode,
  getPosCost,
  importPosProducts,
  mapTemporaryItem,
  requestBillAction,
  resetPosSandbox,
  saveHeldCart,
  savePosCost,
  saveSaleFacingProduct,
  updateDiscountLimit,
} from '../data/posRepository'
import { printTestReceipt } from './receipt'

type Tab = 'checkout' | 'products' | 'bills' | 'admin'
const paymentMethods: Array<{ value: PosPaymentMethod; label: string }> = [
  { value: 'cash', label: 'Cash' }, { value: 'upi', label: 'UPI' }, { value: 'card', label: 'Card' }, { value: 'bank-transfer', label: 'Bank Transfer' },
]
const money = (paise: number) => `₹${paiseToRupees(paise).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function PosPage({ currentUser, showToast }: { currentUser: AppUser; showToast: (message: string) => void }) {
  const [tab, setTab] = useState<Tab>('checkout')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [brand, setBrand] = useState('')
  const sandbox = usePosSandbox({ prefix: search, category, brand })
  const [cart, setCart] = useState<PosCartLine[]>([])
  const [customerName, setCustomerName] = useState('')
  const [customerMobile, setCustomerMobile] = useState('')
  const [discountMode, setDiscountMode] = useState<PosDiscount['mode']>('none')
  const [discountValue, setDiscountValue] = useState('0')
  const [discountReason, setDiscountReason] = useState('')
  const [payments, setPayments] = useState<Record<PosPaymentMethod, string>>({ cash: '', upi: '', card: '', 'bank-transfer': '' })
  const [cashTendered, setCashTendered] = useState('')
  const [unknownBarcode, setUnknownBarcode] = useState('')
  const [unknownDescription, setUnknownDescription] = useState('')
  const [unknownPrice, setUnknownPrice] = useState('')
  const [busy, setBusy] = useState(false)
  const scannerRef = useRef<HTMLInputElement>(null)
  const subtotal = posSubtotal(cart)
  let discount: PosDiscount = { mode: 'none', amountPaise: 0 }
  try {
    discount = calculateDiscount(subtotal, discountMode, Number(discountValue || 0))
    if (discountReason.trim()) discount.overrideReason = discountReason.trim()
  } catch { /* form validation is shown on submit */ }
  const total = subtotal - discount.amountPaise
  const categories = useMemo(() => Array.from(new Set(sandbox.products.map((product) => product.category).filter(Boolean))).sort(), [sandbox.products])
  const brands = useMemo(() => Array.from(new Set(sandbox.products.map((product) => product.brand).filter(Boolean))).sort(), [sandbox.products])

  function addProduct(product: PosProduct) {
    setCart((current) => {
      const existing = current.find((line) => line.kind === 'product' && line.productId === product.id)
      if (existing) return current.map((line) => line.id === existing.id ? { ...line, quantity: line.quantity + 1, expectedProductRevision: product.revision, stockAtScan: product.currentQuantity } : line)
      return [...current, { id: crypto.randomUUID(), kind: 'product', productId: product.id, barcode: product.barcode, description: product.name, quantity: 1, unitPricePaise: product.sellingPricePaise, expectedProductRevision: product.revision, stockAtScan: product.currentQuantity }]
    })
  }

  async function scanBarcode(value: string) {
    const barcode = value.trim()
    if (!barcode) return
    try {
      const product = await findPosProductByBarcode(barcode)
      if (product?.active) addProduct(product)
      else { setUnknownBarcode(barcode); setUnknownDescription(''); setUnknownPrice(''); showToast('Unknown barcode. Add it as a temporary test item.') }
    } catch (error) { showToast(error instanceof Error ? error.message : 'Barcode lookup failed.') }
    finally { if (scannerRef.current) scannerRef.current.value = ''; scannerRef.current?.focus() }
  }

  function resetCart() {
    setCart([]); setCustomerName(''); setCustomerMobile(''); setDiscountMode('none'); setDiscountValue('0'); setDiscountReason(''); setPayments({ cash: '', upi: '', card: '', 'bank-transfer': '' }); setCashTendered('')
  }

  async function checkout() {
    setBusy(true)
    try {
      const allocations: PosPaymentAllocation[] = paymentMethods.map(({ value }) => ({ method: value, amountPaise: rupeesToPaise(Number(payments[value] || 0)) })).filter((payment) => payment.amountPaise > 0)
      const bill = await finalizePosBill({ businessDate: today(), lines: cart, discount, payments: allocations, customerName, customerMobile, ...(cashTendered ? { cashTenderedPaise: rupeesToPaise(Number(cashTendered)) } : {}) }, currentUser)
      resetCart()
      showToast(`Test bill finalized: ${bill.receiptNumber}`)
      printTestReceipt(bill, 'thermal')
    } catch (error) { showToast(error instanceof Error ? error.message : 'Unable to finalize test bill.') }
    finally { setBusy(false) }
  }

  return <section className="min-h-0 flex-1 overflow-y-auto pr-1">
    <div className="grid gap-2.5">
      <Card><CardHeader className="flex-row items-start justify-between gap-3"><SectionHeading eyebrow="Isolated Firestore Sandbox" title="POS (Test)" description="Trial billing only. No production sales, cash, purchases, or finance records are used." /><Badge variant="warning">TEST ONLY</Badge></CardHeader></Card>
      {sandbox.error ? <StatusPanel variant="destructive">{sandbox.error}</StatusPanel> : null}
      <div className="flex flex-wrap gap-2">{(['checkout', 'products', 'bills', ...(currentUser.role === 'owner' ? ['admin'] : [])] as Tab[]).map((value) => <Button key={value} size="sm" variant={tab === value ? 'default' : 'outline'} onClick={() => setTab(value)}>{value === 'checkout' ? <ShoppingCart /> : value === 'products' ? <Boxes /> : value === 'bills' ? <FileClock /> : <Settings2 />}{value[0].toUpperCase() + value.slice(1)}</Button>)}</div>

      {tab === 'checkout' ? <div className="grid gap-2.5 xl:grid-cols-[1.2fr_.8fr]">
        <div className="grid content-start gap-2.5">
          <Card><CardContent className="grid gap-3 pt-4">
            <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void scanBarcode(scannerRef.current?.value ?? '') }}><Input ref={scannerRef} autoFocus inputMode="numeric" aria-label="Barcode scanner input" placeholder="Scan barcode, then Enter" className="text-lg font-bold" /><Button><Barcode />Scan</Button></form>
            {unknownBarcode ? <div className="grid gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:bg-amber-950/20 sm:grid-cols-3"><FieldLabel label="Unknown Barcode"><Input value={unknownBarcode} readOnly /></FieldLabel><FieldLabel label="Description"><Input value={unknownDescription} onChange={(event) => setUnknownDescription(event.target.value)} /></FieldLabel><FieldLabel label="Selling Price"><Input type="number" min="0" step="0.01" value={unknownPrice} onChange={(event) => setUnknownPrice(event.target.value)} /></FieldLabel><Button className="sm:col-span-3" type="button" onClick={() => { if (!unknownDescription.trim() || !unknownPrice) return showToast('Description and selling price are required.'); setCart((current) => [...current, { id: crypto.randomUUID(), kind: 'temporary', barcode: unknownBarcode, description: unknownDescription.trim(), quantity: 1, unitPricePaise: rupeesToPaise(Number(unknownPrice)) }]); setUnknownBarcode('') }}><Plus />Add unresolved item</Button></div> : null}
          </CardContent></Card>
          <Card><CardHeader><SectionHeading eyebrow="Manual lookup" title="Products" /></CardHeader><CardContent className="grid gap-3"><div className="grid gap-2 sm:grid-cols-3"><FieldLabel label="Name prefix"><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Starts with..." /></FieldLabel><FieldLabel label="Category"><NativeSelect value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All</option>{categories.map((value) => <option key={value}>{value}</option>)}</NativeSelect></FieldLabel><FieldLabel label="Brand"><NativeSelect value={brand} onChange={(event) => setBrand(event.target.value)}><option value="">All</option>{brands.map((value) => <option key={value}>{value}</option>)}</NativeSelect></FieldLabel></div><div className="grid max-h-72 gap-2 overflow-y-auto">{sandbox.products.map((product) => <button type="button" key={product.id} className="flex items-center justify-between rounded-xl border border-border p-3 text-left hover:bg-secondary/50" onClick={() => addProduct(product)}><span><strong>{product.name}</strong><small className="block text-muted-foreground">{product.barcode} · {product.category} · {product.brand}</small></span><span className="text-right"><strong>{money(product.sellingPricePaise)}</strong><small className={`block ${product.currentQuantity <= 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>Stock {product.currentQuantity}</small></span></button>)}</div></CardContent></Card>
        </div>
        <Card><CardHeader><SectionHeading eyebrow={`${cart.length} lines`} title="Test Cart" /></CardHeader><CardContent className="grid gap-3">
          {cart.length === 0 ? <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">Scan or select a product.</p> : cart.map((line) => <div key={line.id} className="rounded-xl border p-3"><div className="flex justify-between gap-2"><div><strong>{line.description}</strong><small className="block text-muted-foreground">{line.barcode} {line.kind === 'temporary' ? '· UNRESOLVED' : ''}</small></div><Button size="icon" variant="ghost" onClick={() => setCart((current) => current.filter((item) => item.id !== line.id))}><Trash2 /></Button></div><div className="mt-2 flex items-center justify-between"><div className="flex items-center gap-1"><Button size="sm" variant="outline" onClick={() => setCart((current) => current.map((item) => item.id === line.id ? { ...item, quantity: Math.max(1, item.quantity - 1) } : item))}>−</Button><span className="min-w-8 text-center font-bold">{line.quantity}</span><Button size="sm" variant="outline" onClick={() => setCart((current) => current.map((item) => item.id === line.id ? { ...item, quantity: item.quantity + 1 } : item))}>+</Button></div><strong>{money(line.quantity * line.unitPricePaise)}</strong></div>{line.kind === 'product' && (line.stockAtScan ?? 0) - line.quantity < 0 ? <p className="mt-2 text-xs font-bold text-amber-600"><AlertTriangle className="mr-1 inline size-3" />Stock will be negative. Billing remains allowed.</p> : null}</div>)}
          <div className="grid gap-2 sm:grid-cols-2"><FieldLabel label="Customer Name (Optional)"><Input value={customerName} onChange={(event) => setCustomerName(event.target.value)} /></FieldLabel><FieldLabel label="Mobile (Optional)"><Input value={customerMobile} onChange={(event) => setCustomerMobile(event.target.value)} /></FieldLabel></div>
          <div className="grid gap-2 sm:grid-cols-3"><FieldLabel label="Discount Type"><NativeSelect value={discountMode} onChange={(event) => setDiscountMode(event.target.value as PosDiscount['mode'])}><option value="none">None</option><option value="percentage">Percentage</option><option value="amount">Rupee amount</option></NativeSelect></FieldLabel><FieldLabel label="Discount Value"><Input type="number" min="0" step="0.01" disabled={discountMode === 'none'} value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} /></FieldLabel><FieldLabel label="Override Reason"><Input value={discountReason} onChange={(event) => setDiscountReason(event.target.value)} placeholder="Required above limit" /></FieldLabel></div>
          <div className="grid grid-cols-2 gap-2">{paymentMethods.map((method) => <FieldLabel key={method.value} label={method.label}><Input type="number" min="0" step="0.01" value={payments[method.value]} onChange={(event) => setPayments((current) => ({ ...current, [method.value]: event.target.value }))} /></FieldLabel>)}</div><FieldLabel label="Cash Tendered (for change)"><Input type="number" min="0" step="0.01" value={cashTendered} onChange={(event) => setCashTendered(event.target.value)} /></FieldLabel>
          <div className="rounded-xl bg-secondary/50 p-3 text-sm"><div className="flex justify-between"><span>Subtotal</span><strong>{money(subtotal)}</strong></div><div className="flex justify-between"><span>Discount</span><strong>− {money(discount.amountPaise)}</strong></div><div className="mt-2 flex justify-between text-lg"><span>Total</span><strong>{money(total)}</strong></div></div>
          <div className="grid gap-2 sm:grid-cols-2"><Button variant="outline" disabled={cart.length === 0 || busy} onClick={() => void saveHeldCart({ label: `Cart ${new Date().toLocaleTimeString('en-IN')}`, lines: cart, customerName, customerMobile, discount }, currentUser).then(() => { resetCart(); showToast('Cart held in POS sandbox.') }).catch((error: Error) => showToast(error.message))}><Pause />Hold cart</Button><Button disabled={cart.length === 0 || busy || !navigator.onLine} onClick={() => void checkout()}>{busy ? 'Finalizing...' : 'Finalize TEST Bill'}</Button></div>
          {sandbox.heldCarts.length > 0 ? <div><strong className="text-xs uppercase text-muted-foreground">Held carts (no stock reserved)</strong>{sandbox.heldCarts.map((held) => <div key={held.id} className="mt-2 flex items-center justify-between rounded-xl border p-2 text-sm"><span>{held.label} · {held.lines.length} lines</span><div className="flex gap-1"><Button size="sm" variant="outline" onClick={() => { setCart(held.lines); setCustomerName(held.customerName ?? ''); setCustomerMobile(held.customerMobile ?? ''); setDiscountMode(held.discount.mode); setDiscountValue(held.discount.mode === 'percentage' ? String(held.discount.percentage ?? 0) : String(paiseToRupees(held.discount.amountPaise))); void deleteHeldCart(held.id) }}>Resume</Button></div></div>)}</div> : null}
        </CardContent></Card>
      </div> : null}

      {tab === 'products' ? <ProductsPanel currentUser={currentUser} products={sandbox.products} search={search} setSearch={setSearch} showToast={showToast} /> : null}
      {tab === 'bills' ? <BillsPanel bills={sandbox.bills} products={sandbox.products} currentUser={currentUser} showToast={showToast} /> : null}
      {tab === 'admin' && currentUser.role === 'owner' ? <AdminPanel currentUser={currentUser} discountLimit={sandbox.config.billingMaxDiscountPercentage} showToast={showToast} /> : null}
    </div>
  </section>
}

function ProductsPanel({ currentUser, products, search, setSearch, showToast }: { currentUser: AppUser; products: PosProduct[]; search: string; setSearch: (value: string) => void; showToast: (message: string) => void }) {
  const [selected, setSelected] = useState<PosProduct | null>(null)
  const [details, setDetails] = useState({ barcode: '', name: '', category: '', brand: '', vendor: '', sellingPrice: '', active: true })
  const [cost, setCost] = useState('')
  const [delta, setDelta] = useState('')
  const [reason, setReason] = useState('')
  const [reference, setReference] = useState('')
  function selectProduct(product: PosProduct) {
    setSelected(product)
    setDetails({ barcode: product.barcode, name: product.name, category: product.category, brand: product.brand, vendor: product.vendor, sellingPrice: String(paiseToRupees(product.sellingPricePaise)), active: product.active })
    setCost('')
    if (currentUser.role !== 'billing') void getPosCost(product.id).then((value) => setCost(value === null ? '' : String(paiseToRupees(value)))).catch((error: Error) => showToast(error.message))
  }
  return <Card><CardHeader><SectionHeading eyebrow="Audited sandbox inventory" title="Products & Stock" description="All active roles may update sale details and post reasoned stock movements. Costs remain protected." /></CardHeader><CardContent className="grid gap-3"><FieldLabel label="Product name prefix"><Input value={search} onChange={(event) => setSearch(event.target.value)} /></FieldLabel><div className="grid gap-2 lg:grid-cols-2">{products.map((product) => <button type="button" key={product.id} onClick={() => selectProduct(product)} className={`rounded-xl border p-3 text-left ${selected?.id === product.id ? 'border-primary bg-primary/5' : ''}`}><strong>{product.name}</strong><p className="text-xs text-muted-foreground">{product.barcode} · Stock {product.currentQuantity} · Rev {product.revision}</p></button>)}</div>{selected ? <div className="grid gap-3 rounded-xl border p-3"><div><strong>{selected.name}</strong><p className="text-xs text-muted-foreground">Current stock {selected.currentQuantity}; negative values are preserved and allowed.</p></div><div className="grid gap-2 sm:grid-cols-3"><FieldLabel label="Barcode"><Input value={details.barcode} onChange={(event) => setDetails((current) => ({ ...current, barcode: event.target.value }))} /></FieldLabel><FieldLabel label="Product Name"><Input value={details.name} onChange={(event) => setDetails((current) => ({ ...current, name: event.target.value }))} /></FieldLabel><FieldLabel label="Selling Price"><Input type="number" min="0" step="0.01" value={details.sellingPrice} onChange={(event) => setDetails((current) => ({ ...current, sellingPrice: event.target.value }))} /></FieldLabel><FieldLabel label="Category"><Input value={details.category} onChange={(event) => setDetails((current) => ({ ...current, category: event.target.value }))} /></FieldLabel><FieldLabel label="Brand"><Input value={details.brand} onChange={(event) => setDetails((current) => ({ ...current, brand: event.target.value }))} /></FieldLabel><FieldLabel label="Vendor"><Input value={details.vendor} onChange={(event) => setDetails((current) => ({ ...current, vendor: event.target.value }))} /></FieldLabel><label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={details.active} onChange={(event) => setDetails((current) => ({ ...current, active: event.target.checked }))} />Active for sale</label><Button className="sm:col-span-2" onClick={() => void saveSaleFacingProduct(selected.id, { barcode: details.barcode.trim(), name: details.name.trim(), category: details.category.trim(), brand: details.brand.trim(), vendor: details.vendor.trim(), sellingPricePaise: rupeesToPaise(Number(details.sellingPrice)), active: details.active }, selected.revision, currentUser).then(() => showToast('Sale-facing product details updated.')).catch((error: Error) => showToast(error.message))}>Save sale details</Button></div>{currentUser.role !== 'billing' ? <div className="grid gap-2 rounded-xl bg-secondary/40 p-3 sm:grid-cols-[1fr_auto]"><FieldLabel label="Protected Cost (Owner/Manager only)"><Input type="number" min="0" step="0.01" value={cost} onChange={(event) => setCost(event.target.value)} placeholder="Blank means missing" /></FieldLabel><Button className="self-end" variant="outline" onClick={() => void savePosCost(selected.id, cost === '' ? null : rupeesToPaise(Number(cost)), currentUser).then(() => showToast('Protected product cost updated.')).catch((error: Error) => showToast(error.message))}>Save cost</Button></div> : null}<div className="grid gap-2 sm:grid-cols-3"><FieldLabel label="Quantity change"><Input type="number" step="1" value={delta} onChange={(event) => setDelta(event.target.value)} placeholder="e.g. 12 or -2" /></FieldLabel><FieldLabel label="Mandatory reason"><Input value={reason} onChange={(event) => setReason(event.target.value)} /></FieldLabel><FieldLabel label="Source reference (Optional)"><Input value={reference} onChange={(event) => setReference(event.target.value)} /></FieldLabel><Button className="sm:col-span-3" onClick={() => void adjustPosStock(selected.id, Number(delta), reason, reference, currentUser).then(() => { setDelta(''); setReason(''); showToast('Sandbox stock movement posted.') }).catch((error: Error) => showToast(error.message))}>Post stock adjustment</Button></div></div> : null}</CardContent></Card>
}

function BillsPanel({ bills, products, currentUser, showToast }: { bills: PosBill[]; products: PosProduct[]; currentUser: AppUser; showToast: (message: string) => void }) {
  const [reason, setReason] = useState('')
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [returnQuantities, setReturnQuantities] = useState<Record<string, string>>({})
  const [condition, setCondition] = useState<'sellable' | 'damaged'>('sellable')
  const [refundDate, setRefundDate] = useState(today())
  const [refundAmount, setRefundAmount] = useState('')
  const [refundMethod, setRefundMethod] = useState<PosPaymentMethod>('cash')
  const [refundReference, setRefundReference] = useState('')
  return <div className="grid gap-2.5">{bills.length === 0 ? <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">No test bills yet.</CardContent></Card> : bills.map((bill) => <Card key={bill.id}><CardHeader className="flex-row items-start justify-between"><SectionHeading eyebrow={bill.businessDate} title={bill.receiptNumber} description={`${bill.createdByName} · ${bill.lines.length} lines · ${money(bill.totalPaise)}`} /><div className="flex gap-1"><Button size="sm" variant="outline" onClick={() => printTestReceipt(bill, 'thermal')}><Printer />80mm</Button><Button size="sm" variant="outline" onClick={() => printTestReceipt(bill, 'a4')}><Printer />A4</Button></div></CardHeader><CardContent className="grid gap-3"><div className="grid gap-1">{bill.lines.map((line) => <div key={line.id} className="rounded-lg border p-2 text-xs"><div className="flex items-center justify-between gap-2"><span><strong>{line.description}</strong> · {line.quantity} × {money(line.unitPricePaise)}</span><label className="flex items-center gap-1">Return qty <Input className="w-20" type="number" min="0" max={line.quantity} step="1" value={returnQuantities[line.id] ?? ''} onChange={(event) => setReturnQuantities((current) => ({ ...current, [line.id]: event.target.value }))} placeholder="0" /></label></div>{line.kind === 'temporary' ? <div className="mt-2 flex gap-2"><NativeSelect value={mapping[line.id] ?? ''} onChange={(event) => setMapping((current) => ({ ...current, [line.id]: event.target.value }))}><option value="">Map unresolved item...</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} · stock {product.currentQuantity}</option>)}</NativeSelect><Button size="sm" onClick={() => { const product = products.find((candidate) => candidate.id === mapping[line.id]); if (!product) return; void mapTemporaryItem(bill.id, line.id, product.id, product.revision, currentUser).then(() => showToast('Temporary item mapped with original sale date.')).catch((error: Error) => showToast(error.message)) }}>Map</Button></div> : null}</div>)}</div><div className="grid gap-2 rounded-xl bg-secondary/30 p-2 sm:grid-cols-4"><FieldLabel label="Return Condition"><NativeSelect value={condition} onChange={(event) => setCondition(event.target.value as 'sellable' | 'damaged')}><option value="sellable">Sellable (restore stock)</option><option value="damaged">Damaged (no stock)</option></NativeSelect></FieldLabel><FieldLabel label="Refund Date"><Input type="date" value={refundDate} onChange={(event) => setRefundDate(event.target.value)} /></FieldLabel><FieldLabel label="Refund Amount"><Input type="number" min="0" step="0.01" value={refundAmount} onChange={(event) => setRefundAmount(event.target.value)} placeholder={String(paiseToRupees(bill.totalPaise))} /></FieldLabel><FieldLabel label="Refund Method"><NativeSelect value={refundMethod} onChange={(event) => setRefundMethod(event.target.value as PosPaymentMethod)}>{paymentMethods.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}</NativeSelect></FieldLabel><FieldLabel className="sm:col-span-4" label="Refund Reference (Optional)"><Input value={refundReference} onChange={(event) => setRefundReference(event.target.value)} /></FieldLabel></div><div className="flex flex-wrap gap-2"><Input className="min-w-52 flex-1" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Mandatory request reason" /><Button variant="destructive" onClick={() => void requestBillAction({ type: 'void', billId: bill.id, reason }, currentUser).then(() => { setReason(''); showToast('TEST void request sent to Action Centre.') }).catch((error: Error) => showToast(error.message))}><RotateCcw />Request void</Button><Button variant="outline" onClick={() => { const returnLines = bill.lines.map((line) => ({ lineId: line.id, quantity: Number(returnQuantities[line.id] ?? 0) })).filter((line) => line.quantity > 0); if (returnLines.length === 0) return showToast('Enter at least one return quantity.'); void requestBillAction({ type: 'return', billId: bill.id, reason, returnCondition: condition, returnLines, refundDate, refundAmountPaise: rupeesToPaise(Number(refundAmount || paiseToRupees(bill.totalPaise))), refundMethod, ...(refundReference.trim() ? { refundReference: refundReference.trim() } : {}) }, currentUser).then(() => { setReason(''); setReturnQuantities({}); showToast(`TEST ${condition} return sent to Action Centre.`) }).catch((error: Error) => showToast(error.message)) }}>Request return</Button></div></CardContent></Card>)}</div>
}

function AdminPanel({ currentUser, discountLimit, showToast }: { currentUser: AppUser; discountLimit: number | null; showToast: (message: string) => void }) {
  const [limitValue, setLimitValue] = useState(discountLimit === null ? '' : String(discountLimit))
  const [file, setFile] = useState<File | null>(null)
  const [importSummary, setImportSummary] = useState('')
  const [progress, setProgress] = useState('')
  const [confirmation, setConfirmation] = useState('')
  async function runImport() {
    if (!file) return
    try {
      const parsed = parseApprovedPosCsv(await file.text())
      setImportSummary(`${parsed.validation.rowCount} rows · ${parsed.validation.negativeQuantityCount} negative · ${parsed.validation.zeroQuantityCount} zero · ${parsed.validation.errors.length} errors`)
      const checksum = await sha256Hex(file)
      await importPosProducts({ rows: parsed.products, validation: parsed.validation, file, checksum, sourceHeaders: parsed.sourceHeaders, actor: currentUser, onProgress: (count) => setProgress(`${count}/${parsed.products.length} products imported`) })
      showToast('Approved POS stock CSV import completed.')
    } catch (error) { showToast(error instanceof Error ? error.message : 'Import failed.') }
  }
  return <div className="grid gap-2.5 lg:grid-cols-2"><Card><CardHeader><SectionHeading eyebrow="Owner only" title="Discount Control" /></CardHeader><CardContent className="grid gap-2"><FieldLabel label="Billing maximum percentage (blank disables)"><Input type="number" min="0" max="100" step="0.01" value={limitValue} onChange={(event) => setLimitValue(event.target.value)} /></FieldLabel><Button onClick={() => void updateDiscountLimit(limitValue === '' ? null : Number(limitValue), currentUser).then(() => showToast('POS test discount limit updated.')).catch((error: Error) => showToast(error.message))}>Save limit</Button></CardContent></Card><Card><CardHeader><SectionHeading eyebrow="Owner only · quota sensitive" title="Approved CSV Import" description="Select the normalized CSV. XLSX is intentionally unsupported at runtime." /></CardHeader><CardContent className="grid gap-2"><Input type="file" accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />{importSummary ? <p className="text-xs">{importSummary}</p> : null}{progress ? <p className="text-xs font-bold">{progress}</p> : null}<Button disabled={!file} onClick={() => void runImport()}>Validate & import 6,069 products</Button></CardContent></Card><Card className="lg:col-span-2"><CardHeader><SectionHeading eyebrow="Exceptional destructive action" title="Reset POS Test Sandbox" description="Deletes only records under posSandboxes/test in resumable batches." /></CardHeader><CardContent className="grid gap-2"><StatusPanel variant="warning">This removes all test bills, stock, events, approvals, and import history. Production records are outside the deletion paths.</StatusPanel><FieldLabel label="Type RESET POS TEST SANDBOX"><Input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></FieldLabel><Button variant="destructive" disabled={confirmation !== 'RESET POS TEST SANDBOX'} onClick={() => void resetPosSandbox(currentUser, (name, deleted) => setProgress(`${deleted} records deleted · ${name}`)).then((deleted) => { setConfirmation(''); showToast(`POS test sandbox reset: ${deleted} records deleted.`) }).catch((error: Error) => showToast(error.message))}><Trash2 />Reset sandbox</Button></CardContent></Card></div>
}
