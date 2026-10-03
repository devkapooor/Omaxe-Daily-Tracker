import { useRef, useState } from 'react'
import { AlertTriangle, Barcode, ChartPie, FileClock, Pause, Plus, Printer, RotateCcw, Settings2, ShoppingCart, Trash2 } from 'lucide-react'
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
import type { PosBill, PosCartLine, PosDiscount, PosPaymentMethod, PosProduct } from '../domain/types'
import {
  deleteHeldCart,
  finalizePosBill,
  findPosProductByBarcode,
  importPosProducts,
  mapTemporaryItem,
  requestBillAction,
  resetPosSandbox,
  saveHeldCart,
  updateDiscountLimit,
} from '../data/posRepository'
import { printTestReceipt } from './receipt'
import { CheckoutPaymentPanel } from './CheckoutPaymentPanel'
import { PosDashboard } from './PosDashboard'
import { buildCheckoutPayment, emptySplitPayments, type CheckoutPaymentMode, type SplitPaymentAmounts } from '../domain/checkoutPayments'

type Tab = 'checkout' | 'dashboard' | 'bills' | 'admin'
const paymentMethods: Array<{ value: PosPaymentMethod; label: string }> = [
  { value: 'cash', label: 'Cash' }, { value: 'upi', label: 'UPI' }, { value: 'card', label: 'Card' },
]
const money = (paise: number) => `₹${paiseToRupees(paise).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function PosPage({ currentUser, showToast }: { currentUser: AppUser; showToast: (message: string) => void }) {
  const [tab, setTab] = useState<Tab>('checkout')
  const sandbox = usePosSandbox({})
  const [cart, setCart] = useState<PosCartLine[]>([])
  const [customerName, setCustomerName] = useState('')
  const [customerMobile, setCustomerMobile] = useState('')
  const [discountMode, setDiscountMode] = useState<PosDiscount['mode']>('none')
  const [discountValue, setDiscountValue] = useState('0')
  const [discountReason, setDiscountReason] = useState('')
  const [paymentMode, setPaymentMode] = useState<CheckoutPaymentMode>('cash')
  const [splitPayments, setSplitPayments] = useState<SplitPaymentAmounts>(emptySplitPayments)
  const [cashReceived, setCashReceived] = useState<string | null>(null)
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
  let paymentError = ''
  try { buildCheckoutPayment(total, paymentMode, splitPayments, cashReceived ?? undefined) }
  catch (error) { paymentError = error instanceof Error ? error.message : 'Payment is invalid.' }

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
    setCart([]); setCustomerName(''); setCustomerMobile(''); setDiscountMode('none'); setDiscountValue('0'); setDiscountReason(''); setPaymentMode('cash'); setSplitPayments(emptySplitPayments()); setCashReceived(null)
  }

  function clearCart() {
    resetCart()
    setUnknownBarcode(''); setUnknownDescription(''); setUnknownPrice('')
  }

  async function checkout() {
    setBusy(true)
    try {
      const settlement = buildCheckoutPayment(total, paymentMode, splitPayments, cashReceived ?? undefined)
      const bill = await finalizePosBill({ businessDate: today(), lines: cart, discount, payments: settlement.payments, customerName, customerMobile, ...(settlement.cashTenderedPaise !== undefined ? { cashTenderedPaise: settlement.cashTenderedPaise } : {}) }, currentUser)
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
      <div className="flex flex-wrap gap-2">{(['checkout', 'dashboard', 'bills', ...(currentUser.role === 'owner' ? ['admin'] : [])] as Tab[]).map((value) => <Button key={value} size="sm" variant={tab === value ? 'default' : 'outline'} onClick={() => setTab(value)}>{value === 'checkout' ? <ShoppingCart /> : value === 'dashboard' ? <ChartPie /> : value === 'bills' ? <FileClock /> : <Settings2 />}{value[0].toUpperCase() + value.slice(1)}</Button>)}</div>

      {tab === 'checkout' ? <div className="grid items-start gap-2.5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,.8fr)]">
        <div className="grid min-w-0 content-start gap-2.5">
          <Card><CardContent className="grid gap-3 pt-4">
            <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void scanBarcode(scannerRef.current?.value ?? '') }}><Input ref={scannerRef} autoFocus inputMode="numeric" aria-label="Barcode scanner input" placeholder="Scan barcode, then Enter" className="text-lg font-bold" /><Button><Barcode />Scan</Button></form>
            {unknownBarcode ? <div className="grid gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:bg-amber-950/20 sm:grid-cols-3"><FieldLabel label="Unknown Barcode"><Input value={unknownBarcode} readOnly /></FieldLabel><FieldLabel label="Description"><Input value={unknownDescription} onChange={(event) => setUnknownDescription(event.target.value)} /></FieldLabel><FieldLabel label="Selling Price"><Input type="number" min="0" step="0.01" value={unknownPrice} onChange={(event) => setUnknownPrice(event.target.value)} /></FieldLabel><Button className="sm:col-span-3" type="button" onClick={() => { if (!unknownDescription.trim() || !unknownPrice) return showToast('Description and selling price are required.'); setCart((current) => [...current, { id: crypto.randomUUID(), kind: 'temporary', barcode: unknownBarcode, description: unknownDescription.trim(), quantity: 1, unitPricePaise: rupeesToPaise(Number(unknownPrice)) }]); setUnknownBarcode('') }}><Plus />Add unresolved item</Button></div> : null}
          </CardContent></Card>
          <Card aria-label="Cart items"><CardHeader className="flex-row items-center justify-between gap-3"><SectionHeading eyebrow={`${cart.reduce((quantity, line) => quantity + line.quantity, 0)} items`} title="Test Cart" /><Button type="button" variant="outline" size="sm" disabled={cart.length === 0 || busy} onClick={clearCart}><Trash2 />Clear cart</Button></CardHeader><CardContent className="grid gap-3">
          {cart.length === 0 ? <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">Scan a barcode to add items to the cart.</p> : cart.map((line) => <div key={line.id} className="rounded-xl border p-3"><div className="flex justify-between gap-2"><div><strong>{line.description}</strong><small className="block text-muted-foreground">{line.barcode} {line.kind === 'temporary' ? '· UNRESOLVED' : ''}</small></div><Button aria-label={`Remove ${line.description}`} size="icon" variant="ghost" onClick={() => setCart((current) => current.filter((item) => item.id !== line.id))}><Trash2 /></Button></div><div className="mt-2 flex items-center justify-between"><div className="flex items-center gap-1"><Button aria-label={`Decrease quantity of ${line.description}`} size="sm" variant="outline" onClick={() => setCart((current) => current.map((item) => item.id === line.id ? { ...item, quantity: Math.max(1, item.quantity - 1) } : item))}>−</Button><span className="min-w-8 text-center font-bold">{line.quantity}</span><Button aria-label={`Increase quantity of ${line.description}`} size="sm" variant="outline" onClick={() => setCart((current) => current.map((item) => item.id === line.id ? { ...item, quantity: item.quantity + 1 } : item))}>+</Button></div><strong>{money(line.quantity * line.unitPricePaise)}</strong></div>{line.kind === 'product' && (line.stockAtScan ?? 0) - line.quantity < 0 ? <p className="mt-2 text-xs font-bold text-amber-600"><AlertTriangle className="mr-1 inline size-3" />Stock will be negative. Billing remains allowed.</p> : null}</div>)}
          </CardContent></Card>
        </div>
        <Card aria-label="Payment and totals"><CardHeader><SectionHeading eyebrow="Checkout" title="Payment & Total" /></CardHeader><CardContent className="grid gap-3">
          <div className="grid gap-2 sm:grid-cols-2"><FieldLabel label="Customer Name (Optional)"><Input value={customerName} onChange={(event) => setCustomerName(event.target.value)} /></FieldLabel><FieldLabel label="Mobile (Optional)"><Input value={customerMobile} onChange={(event) => setCustomerMobile(event.target.value)} /></FieldLabel></div>
          <div className="grid gap-2 sm:grid-cols-3"><FieldLabel label="Discount Type"><NativeSelect value={discountMode} onChange={(event) => setDiscountMode(event.target.value as PosDiscount['mode'])}><option value="none">None</option><option value="percentage">Percentage</option><option value="amount">Rupee amount</option></NativeSelect></FieldLabel><FieldLabel label="Discount Value"><Input type="number" min="0" step="0.01" disabled={discountMode === 'none'} value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} /></FieldLabel><FieldLabel label="Override Reason"><Input value={discountReason} onChange={(event) => setDiscountReason(event.target.value)} placeholder="Required above limit" /></FieldLabel></div>
          <div className="rounded-xl bg-secondary/50 p-3 text-sm"><div className="flex justify-between"><span>Subtotal</span><strong>{money(subtotal)}</strong></div><div className="flex justify-between"><span>Discount</span><strong>− {money(discount.amountPaise)}</strong></div><div className="mt-2 flex justify-between text-lg"><span>Total</span><strong>{money(total)}</strong></div></div>
          <CheckoutPaymentPanel totalPaise={total} mode={paymentMode} split={splitPayments} cashReceived={cashReceived} disabled={busy} onMethod={(method) => { setPaymentMode(method); setCashReceived(null) }} onSplit={(amounts) => { setSplitPayments(amounts); setPaymentMode('split'); setCashReceived(null) }} onCashReceived={setCashReceived} />
          <div className="grid gap-2 sm:grid-cols-2"><Button variant="outline" disabled={cart.length === 0 || busy} onClick={() => void saveHeldCart({ label: `Cart ${new Date().toLocaleTimeString('en-IN')}`, lines: cart, customerName, customerMobile, discount }, currentUser).then(() => { resetCart(); showToast('Cart held in POS sandbox.') }).catch((error: Error) => showToast(error.message))}><Pause />Hold cart</Button><Button disabled={cart.length === 0 || busy || !navigator.onLine || Boolean(paymentError)} onClick={() => void checkout()}>{busy ? 'Finalizing...' : 'Finalize TEST Bill'}</Button></div>
          {sandbox.heldCarts.length > 0 ? <div><strong className="text-xs uppercase text-muted-foreground">Held carts (no stock reserved)</strong>{sandbox.heldCarts.map((held) => <div key={held.id} className="mt-2 flex items-center justify-between rounded-xl border p-2 text-sm"><span>{held.label} · {held.lines.length} lines</span><div className="flex gap-1"><Button size="sm" variant="outline" onClick={() => { setPaymentMode('cash'); setSplitPayments(emptySplitPayments()); setCashReceived(null); setDiscountReason(held.discount.overrideReason ?? ''); setCart(held.lines); setCustomerName(held.customerName ?? ''); setCustomerMobile(held.customerMobile ?? ''); setDiscountMode(held.discount.mode); setDiscountValue(held.discount.mode === 'percentage' ? String(held.discount.percentage ?? 0) : String(paiseToRupees(held.discount.amountPaise))); void deleteHeldCart(held.id) }}>Resume</Button></div></div>)}</div> : null}
        </CardContent></Card>
      </div> : null}

      {tab === 'dashboard' ? <PosDashboard /> : null}
      {tab === 'bills' ? <BillsPanel bills={sandbox.bills} products={sandbox.products} currentUser={currentUser} showToast={showToast} /> : null}
      {tab === 'admin' && currentUser.role === 'owner' ? <AdminPanel currentUser={currentUser} discountLimit={sandbox.config.billingMaxDiscountPercentage} showToast={showToast} /> : null}
    </div>
  </section>
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
