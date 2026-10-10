import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { collection, doc, onSnapshot } from 'firebase/firestore'
import { AlertTriangle, Barcode, ChartPie, FileClock, ClipboardCheck, Pause, Plus, Printer, ShoppingCart, Trash2, X } from 'lucide-react'
import type { AppUser } from '@/domain/financeTypes'
import { formatDisplayDateTime, today } from '@/app/uiHelpers'
import { ResponsiveLogTable, type LogTableColumn } from '@/features/logs/components/ResponsiveLogTable'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { FieldLabel } from '@/shared/ui/field-label'
import { Input } from '@/shared/ui/input'
import { NativeSelect } from '@/shared/ui/native-select'
import { PageCardStack } from '@/shared/ui/page-card-stack'
import { PageHeader, PageHeaderTab, PageHeaderTabsList } from '@/shared/ui/page-header'
import { PageLayout } from '@/shared/ui/page-layout'
import { SectionHeading } from '@/shared/ui/section-heading'
import { StatusPanel } from '@/shared/ui/status-panel'
import { Tabs } from '@/shared/ui/tabs'
import { usePosSandbox } from '../hooks/usePosSandbox'
import { calculateDiscount, paiseToRupees, posSubtotal, rupeesToPaise } from '../domain/posDomain'
import type { PosBill, PosCartLine, PosDiscount, PosPaymentMethod, PosProduct } from '../domain/types'
import {
  deleteHeldCart,
  createPosProductFromBarcode,
  finalizePosBill,
  findPosProductByBarcode,
  loadRecentPosBills,
  PosProductChangedSinceScanError,
  type PosBillPageCursor,
  searchPosProductsByName,
  requestBillAction,
  saveHeldCart,
} from '../data/posRepository'
import { printPosReceipt } from './receipt'
import { CheckoutPaymentPanel } from './CheckoutPaymentPanel'
import { PosDashboard } from './PosDashboard'
import { buildCheckoutPayment, emptySplitPayments, type CheckoutPaymentMode, type SplitPaymentAmounts } from '../domain/checkoutPayments'
import { serverNowDate } from '@/shared/lib/serverClock'
import { db } from '@/shared/lib/firebase'
import type { VendorV2 } from '@/domain/vendorLedgerV2'
import { vendorLedgerV2Collections } from '@/store/vendorLedgerV2Repository'
import { expectedHandover, handoverDate } from '../domain/cashierHandover'
import { useCashierHandover } from '../hooks/useCashierHandover'
import { PosGoodsReceipt, PosStockAuditPage } from './PosGoodsReceipt'

type Tab = 'checkout' | 'dashboard' | 'bills' | 'grn' | 'audit'
const paymentMethods: Array<{ value: PosPaymentMethod; label: string }> = [
  { value: 'cash', label: 'Cash' }, { value: 'upi', label: 'UPI' }, { value: 'card', label: 'Card' },
]
const money = (paise: number) => `₹${paiseToRupees(paise).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
function productMrp(product: PosProduct) {
  const raw = Object.entries(product.sourceValues ?? {}).find(([key]) => key.trim().toLowerCase() === 'printed mrp')?.[1]
  if (!raw?.trim()) return null
  const amount = Number(raw.replace(/[₹,\s]/g, ''))
  return Number.isFinite(amount) && amount >= 0 ? `MRP ${money(rupeesToPaise(amount))}` : null
}

export function PosPage({ currentUser, showToast }: { currentUser: AppUser; showToast: (message: string) => void }) {
  const handover = useCashierHandover()
  const [tab, setTab] = useState<Tab>('checkout')
  const [grnVendors, setGrnVendors] = useState<VendorV2[]>([])
  const [vendorLedgerEnabled, setVendorLedgerEnabled] = useState(false)
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
  const [unknownProductName, setUnknownProductName] = useState('')
  const [unknownPrice, setUnknownPrice] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [searchResults, setSearchResults] = useState<PosProduct[]>([])
  const [searchingProducts, setSearchingProducts] = useState(false)
  const [productSearchError, setProductSearchError] = useState('')
  const [busy, setBusy] = useState(false)
  const [creatingProduct, setCreatingProduct] = useState(false)
  const [showCustomerDiscount, setShowCustomerDiscount] = useState(false)
  const [showUnresolvedAlert, setShowUnresolvedAlert] = useState(false)
  const [highlightedCartKey, setHighlightedCartKey] = useState<string | null>(null)
  const [cartUpdateSequence, setCartUpdateSequence] = useState(0)
  const [checkoutWarning, setCheckoutWarning] = useState('')
  const scannerRef = useRef<HTMLInputElement>(null)
  const cartScrollRef = useRef<HTMLDivElement>(null)
  const highlightTimerRef = useRef<number | null>(null)
  const cashDrawerPaise = handover.ledger?.initialized ? expectedHandover(handover.ledger, handoverDate()).cash : null
  useEffect(() => {
    if (tab !== 'grn') return
    const unsubscribeConfig = onSnapshot(doc(db, 'appMetadata', 'vendorLedgerV2Config'), (snapshot) => {
      const enabled = snapshot.data()?.enabled === true
      setVendorLedgerEnabled(enabled)
      if (!enabled) setGrnVendors([])
    })
    const unsubscribeVendors = onSnapshot(collection(db, vendorLedgerV2Collections.vendors), (snapshot) => {
      setGrnVendors(snapshot.docs.map((item) => item.data() as VendorV2))
    })
    return () => { unsubscribeConfig(); unsubscribeVendors() }
  }, [tab])
  useEffect(() => {
    const term = productSearch.trim()
    let active = true
    if (term.length < 2) return () => { active = false }
    const timer = window.setTimeout(() => {
      setSearchingProducts(true)
      setProductSearchError('')
      void searchPosProductsByName(term).then((results) => {
        if (active) setSearchResults(results)
      }).catch((error: unknown) => {
        if (active) setProductSearchError(error instanceof Error ? error.message : 'Product search failed.')
      }).finally(() => { if (active) setSearchingProducts(false) })
    }, 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [productSearch])
  const subtotal = posSubtotal(cart)
  const cartQuantity = cart.reduce((quantity, line) => quantity + line.quantity, 0)
  let discount: PosDiscount = { mode: 'none', amountPaise: 0 }
  try {
    discount = calculateDiscount(subtotal, discountMode, Number(discountValue || 0))
    if (discountReason.trim()) discount.overrideReason = discountReason.trim()
  } catch { /* form validation is shown on submit */ }
  const total = subtotal - discount.amountPaise
  const effectiveDiscountPercentage = subtotal > 0 ? discount.amountPaise * 100 / subtotal : 0
  const requiresDiscountOverrideReason = currentUser.role !== 'billing'
    && sandbox.config.billingMaxDiscountPercentage !== null
    && effectiveDiscountPercentage > sandbox.config.billingMaxDiscountPercentage
  useEffect(() => {
    if (requiresDiscountOverrideReason) setShowCustomerDiscount(true)
  }, [requiresDiscountOverrideReason])
  useEffect(() => {
    if (cartUpdateSequence > 0) cartScrollRef.current?.scrollTo({ top: 0 })
  }, [cartUpdateSequence])
  let paymentError = ''
  try { buildCheckoutPayment(total, paymentMode, splitPayments, cashReceived ?? undefined) }
  catch (error) { paymentError = error instanceof Error ? error.message : 'Payment is invalid.' }

  function addProduct(product: PosProduct) {
    setCheckoutWarning('')
    setCartUpdateSequence((sequence) => sequence + 1)
    setHighlightedCartKey(product.id)
    if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current)
    highlightTimerRef.current = window.setTimeout(() => setHighlightedCartKey(null), 1100)
    setCart((current) => {
      const existing = current.find((line) => line.kind === 'product' && line.productId === product.id)
      const updatedLine: PosCartLine = existing
        ? { ...existing, quantity: existing.quantity + 1, expectedProductRevision: product.revision, stockAtScan: product.currentQuantity }
        : { id: crypto.randomUUID(), kind: 'product', productId: product.id, barcode: product.barcode, description: product.name, quantity: 1, unitPricePaise: product.sellingPricePaise, expectedProductRevision: product.revision, stockAtScan: product.currentQuantity }
      return [updatedLine, ...current.filter((line) => line.id !== existing?.id)]
    })
  }

  function focusScanner() {
    window.requestAnimationFrame(() => scannerRef.current?.focus({ preventScroll: true }))
  }

  async function scanBarcode(value: string) {
    const barcode = value.trim()
    if (!barcode) return
    let keepSearchTerm = false
    try {
      const product = await findPosProductByBarcode(barcode)
      if (product?.active) addProduct(product)
      else if (product) showToast('This barcode belongs to an inactive product. Ask a manager to reactivate it.')
      else {
        const matches = await searchPosProductsByName(barcode)
        if (matches.length === 1) addProduct(matches[0])
        else if (matches.length > 1) {
          setSearchResults(matches)
          keepSearchTerm = true
        }
        else {
          setUnknownBarcode(barcode)
          setUnknownProductName('')
          setUnknownPrice('')
          setShowUnresolvedAlert(true)
          showToast('Product not found. Add its name and selling price to create it in inventory.')
        }
      }
    } catch (error) { showToast(error instanceof Error ? error.message : 'Barcode lookup failed.') }
    finally {
      setSearchingProducts(false)
      if (!keepSearchTerm) setProductSearch('')
      scannerRef.current?.focus({ preventScroll: true })
    }
  }

  async function createUnknownProduct() {
    if (!unknownBarcode || !unknownProductName.trim() || unknownPrice === '') {
      showToast('Product name and selling price are required.')
      return
    }
    const price = Number(unknownPrice)
    if (!Number.isFinite(price) || price < 0) {
      showToast('Enter a valid selling price of zero or more.')
      return
    }
    setCreatingProduct(true)
    try {
      const product = await createPosProductFromBarcode({
        barcode: unknownBarcode,
        name: unknownProductName.trim(),
        sellingPricePaise: rupeesToPaise(price),
      }, currentUser)
      addProduct(product)
      setUnknownBarcode('')
      setUnknownProductName('')
      setUnknownPrice('')
      setShowUnresolvedAlert(false)
      showToast(`Product resolved and added to cart. Current stock: ${product.currentQuantity}.`)
      focusScanner()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to add product to inventory.')
    } finally {
      setCreatingProduct(false)
    }
  }

  function resetCart() {
    setCart([]); setCustomerName(''); setCustomerMobile(''); setDiscountMode('none'); setDiscountValue('0'); setDiscountReason(''); setPaymentMode('cash'); setSplitPayments(emptySplitPayments()); setCashReceived(null)
    setCheckoutWarning('')
  }

  function clearCart() {
    resetCart()
    setUnknownBarcode(''); setUnknownProductName(''); setUnknownPrice('')
    setShowUnresolvedAlert(false)
  }

  async function checkout() {
    if (unknownBarcode || cart.some((line) => line.kind === 'temporary')) {
      setShowUnresolvedAlert(true)
      return
    }
    setBusy(true)
    try {
      const settlement = buildCheckoutPayment(total, paymentMode, splitPayments, cashReceived ?? undefined)
      const bill = await finalizePosBill({ businessDate: today(), lines: cart, discount, payments: settlement.payments, customerName, customerMobile, ...(settlement.cashTenderedPaise !== undefined ? { cashTenderedPaise: settlement.cashTenderedPaise } : {}) }, currentUser)
      clearCart()
      setCheckoutWarning('')
      setShowCustomerDiscount(false)
      showToast(`Bill finalized: ${bill.receiptNumber}`)
      printPosReceipt(bill, 'thermal')
    } catch (error) {
      if (error instanceof PosProductChangedSinceScanError) {
        setCart((current) => current.map((line) => line.kind === 'product' && line.productId === error.productId
          ? { ...line, description: error.latestProduct.name, unitPricePaise: error.latestProduct.sellingPricePaise, stockAtScan: error.latestProduct.currentQuantity, expectedProductRevision: error.latestProduct.revision }
          : line))
        const oldStock = error.previousStock === undefined ? 'unknown' : String(error.previousStock)
        setCheckoutWarning(`Product updated since scan (stock ${oldStock} → ${error.latestProduct.currentQuantity}). Cart details were refreshed and quantity was kept. Review the price and total, then finalize again; no bill was created.`)
      } else {
        showToast(error instanceof Error ? error.message : 'Unable to finalize bill.')
      }
    }
    finally { setBusy(false); focusScanner() }
  }

  return <>
    <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)} className="flex min-h-0 flex-1 flex-col">
    <PageLayout className="min-h-0 flex-1 overflow-hidden" header={(
      <PageHeader title="POS" tools={(
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 lg:flex-row lg:items-center">
          <div className="min-w-0 overflow-x-auto">
            <PageHeaderTabsList aria-label="POS sections" className="grid min-w-max grid-cols-5">
              <PageHeaderTab value="checkout"><ShoppingCart />Billing</PageHeaderTab>
              <PageHeaderTab value="dashboard"><ChartPie />Dashboard</PageHeaderTab>
              <PageHeaderTab value="bills"><FileClock />Bills</PageHeaderTab>
              <PageHeaderTab value="grn"><Barcode />GRN</PageHeaderTab>
              <PageHeaderTab value="audit"><ClipboardCheck />Audit</PageHeaderTab>
            </PageHeaderTabsList>
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded border border-border bg-secondary/35 px-3 py-1.5" title="Last physical count plus POS cash payments less approved cash refunds since that count.">
            <span className="text-xs text-muted-foreground">Cash Drawer</span>
            <strong className="font-mono text-sm font-semibold tabular-nums text-success">{cashDrawerPaise === null ? 'Set up drawer' : money(cashDrawerPaise)}</strong>
          </div>
        </div>
      )} />
    )}>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <PageCardStack className={tab === 'bills' || tab === 'grn' || tab === 'audit' ? 'min-h-full content-start pb-4' : 'h-full pb-4'}>
      {!handover.ledger?.initialized ? <StatusPanel variant="warning">Shared drawer setup is required before billing. {currentUser.role === 'owner' ? <Button size="sm" onClick={handover.requestSetup}>Set up drawer</Button> : 'Ask the owner to initialize the drawer.'}</StatusPanel> : null}
      {sandbox.error ? <StatusPanel variant="destructive">{sandbox.error}</StatusPanel> : null}

      {tab === 'checkout' ? <div className="grid min-h-full items-start gap-card-gap lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,7fr)_minmax(22rem,3fr)] lg:items-stretch">
        <div className="grid min-w-0 gap-card-gap lg:min-h-0 lg:grid-rows-[auto_minmax(0,1fr)]">
          <Card><CardContent className="grid gap-3 pt-4">
            <form className="grid gap-2" onSubmit={(event) => { event.preventDefault(); void scanBarcode(scannerRef.current?.value ?? '') }}>
              <div className="flex gap-2"><Input ref={scannerRef} value={productSearch} onChange={(event) => { const value = event.target.value; setProductSearch(value); setSearchResults([]); setProductSearchError(''); setSearchingProducts(value.trim().length >= 2) }} autoFocus disabled={showUnresolvedAlert} aria-label="Scan barcode or search product name" placeholder="Scan barcode or search product name" className="text-lg font-bold" /><Button type="submit" disabled={showUnresolvedAlert}><Barcode />Add</Button></div>
              {productSearch.trim().length >= 2 ? <div className="grid max-h-36 gap-1 overflow-y-auto" aria-live="polite">
                {productSearchError ? <p role="alert" className="text-sm text-destructive">{productSearchError}</p> : searchingProducts ? <p className="text-sm text-muted-foreground">Searching products…</p> : searchResults.length === 0 ? <p className="text-sm text-muted-foreground">No products match those name words.</p> : searchResults.map((product) => <div key={product.id} className="flex items-center justify-between gap-3 rounded border px-3 py-2 text-sm">
                  <span className="min-w-0"><strong className="block truncate">{product.name}</strong><span className="text-xs text-muted-foreground">{product.barcode} · Stock {product.currentQuantity}</span></span>
                  <span className="flex shrink-0 items-center gap-2">{productMrp(product) ? <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">{productMrp(product)}</span> : null}<Button size="sm" type="button" disabled={!product.active} onClick={() => { addProduct(product); setProductSearch(''); setSearchResults([]); setSearchingProducts(false); focusScanner() }}>{product.active ? 'Add' : 'Inactive'}</Button></span>
                </div>)}
              </div> : null}
            </form>
          </CardContent></Card>
          <Card aria-label="Cart items" className="flex min-h-0 flex-col"><CardHeader className="shrink-0 flex-row items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><SectionHeading eyebrow="Billing" title="Cart" /><div className="flex shrink-0 items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-primary-foreground shadow-sm" aria-live="polite" aria-label={`${cartQuantity} items in cart`}><strong className="text-xl leading-none tabular-nums">{cartQuantity}</strong><span className="text-[10px] font-bold uppercase tracking-wide">Items</span></div></div><Button type="button" variant="outline" size="sm" disabled={cart.length === 0 || busy} onClick={clearCart}><Trash2 />Clear cart</Button></CardHeader><CardContent ref={cartScrollRef} className="@container grid auto-rows-max content-start gap-1.5 p-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          {cart.length === 0 ? <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">Scan a barcode to add items to the cart.</p> : cart.map((line) => <div key={line.id} className={`grid min-h-[72px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors duration-500 @min-[32rem]:grid-cols-[minmax(0,1fr)_auto_auto_auto] ${highlightedCartKey === (line.kind === 'product' ? line.productId : line.id) ? 'border-primary bg-primary/10 ring-1 ring-primary/30' : ''}`}>
            <span className="col-span-full min-w-0 @min-[32rem]:col-span-1" title={`${line.description} · ${line.barcode}`}>
              <strong className="block line-clamp-2 break-words leading-[18px]">{line.description}</strong>
              <span className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs leading-4 text-muted-foreground"><span className="break-all font-mono">{line.barcode}</span>{line.kind === 'temporary' ? <span className="font-semibold">UNRESOLVED</span> : <span>Stock At Scan: {line.stockAtScan ?? 'Unknown'}</span>}</span>
            </span>
            <span className="flex items-center gap-1"><Button aria-label={`Decrease quantity of ${line.description}`} size="icon" className="size-7" variant="outline" onClick={() => setCart((current) => current.map((item) => item.id === line.id ? { ...item, quantity: Math.max(1, item.quantity - 1) } : item))}>−</Button><strong className="min-w-5 text-center tabular-nums">{line.quantity}</strong><Button aria-label={`Increase quantity of ${line.description}`} size="icon" className="size-7" variant="outline" onClick={() => setCart((current) => current.map((item) => item.id === line.id ? { ...item, quantity: item.quantity + 1 } : item))}>+</Button></span>
            <strong className="min-w-16 text-right tabular-nums">{money(line.quantity * line.unitPricePaise)}</strong>
            <Button aria-label={`Remove ${line.description}`} size="icon" className="size-7" variant="ghost" onClick={() => setCart((current) => current.filter((item) => item.id !== line.id))}><Trash2 className="size-4" /></Button>
            {line.kind === 'product' && (line.stockAtScan ?? 0) - line.quantity < 0 ? <p className="col-span-full text-xs font-bold text-amber-600"><AlertTriangle className="mr-1 inline size-3" />Only {line.stockAtScan ?? 0} in stock when scanned; this bill leaves stock negative. Billing remains allowed.</p> : null}
          </div>)}
          </CardContent></Card>
        </div>
        <Card className="flex flex-col lg:h-full lg:min-h-0" aria-label="Payment and totals"><CardHeader><SectionHeading eyebrow="Billing" title="Payment & Total" /></CardHeader><CardContent className="flex flex-col gap-3 lg:min-h-0 lg:flex-1 lg:overflow-hidden">
          <div className="grid gap-3 lg:min-h-0 lg:flex-1 lg:content-start lg:overflow-y-auto lg:pr-1">
          <Button type="button" size="sm" variant="outline" aria-expanded={showCustomerDiscount} onClick={() => setShowCustomerDiscount((open) => requiresDiscountOverrideReason ? true : !open)} className="justify-between"><span>{requiresDiscountOverrideReason ? 'Discount override details required' : showCustomerDiscount ? 'Hide customer & discount' : 'Add customer or discount'}</span><span className="truncate text-xs font-normal text-muted-foreground">{customerName || customerMobile ? 'Customer added' : ''}{discount.amountPaise > 0 ? `${customerName || customerMobile ? ' · ' : ''}Discount ${money(discount.amountPaise)}` : ''}</span></Button>
          {showCustomerDiscount ? <div className="grid gap-2 rounded-lg border border-border p-2"><div className="grid gap-2 sm:grid-cols-2"><Input aria-label="Customer Name (Optional)" placeholder="Customer name (optional)" value={customerName} onChange={(event) => setCustomerName(event.target.value)} /><Input aria-label="Mobile (Optional)" inputMode="tel" placeholder="Mobile (optional)" value={customerMobile} onChange={(event) => setCustomerMobile(event.target.value)} /></div><div className="grid gap-2 sm:grid-cols-2"><FieldLabel label="Discount Type"><NativeSelect value={discountMode} onChange={(event) => setDiscountMode(event.target.value as PosDiscount['mode'])}><option value="none">None</option><option value="percentage">Percentage</option><option value="amount">Rupee amount</option></NativeSelect></FieldLabel><FieldLabel label="Discount Value"><Input type="number" min="0" step="0.01" disabled={discountMode === 'none'} value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} /></FieldLabel>{requiresDiscountOverrideReason ? <FieldLabel className="sm:col-span-2" label="Override Reason"><Input required value={discountReason} onChange={(event) => setDiscountReason(event.target.value)} placeholder="Why is this discount above the limit?" /></FieldLabel> : null}</div></div> : null}
          <div className="rounded-xl bg-secondary/50 p-3 text-sm"><div className="flex justify-between"><span>Subtotal</span><strong>{money(subtotal)}</strong></div><div className="flex justify-between"><span>Discount</span><strong>− {money(discount.amountPaise)}</strong></div><div className="mt-2 flex justify-between text-lg"><span>Total</span><strong>{money(total)}</strong></div></div>
          <CheckoutPaymentPanel totalPaise={total} mode={paymentMode} split={splitPayments} cashReceived={cashReceived} disabled={busy} onMethod={(method) => { setPaymentMode(method); setCashReceived(null) }} onSplit={(amounts) => { setSplitPayments(amounts); setPaymentMode('split'); setCashReceived(null) }} onCashReceived={setCashReceived} />
          {sandbox.heldCarts.length > 0 ? <div><strong className="text-xs uppercase text-muted-foreground">Held carts (no stock reserved)</strong>{sandbox.heldCarts.map((held) => <div key={held.id} className="mt-2 flex items-center justify-between rounded-xl border p-2 text-sm"><span>{held.label} · {held.lines.length} lines</span><div className="flex gap-1"><Button size="sm" variant="outline" onClick={() => { setPaymentMode('cash'); setSplitPayments(emptySplitPayments()); setCashReceived(null); setDiscountReason(held.discount.overrideReason ?? ''); setCart(held.lines); setCustomerName(held.customerName ?? ''); setCustomerMobile(held.customerMobile ?? ''); setDiscountMode(held.discount.mode); setDiscountValue(held.discount.mode === 'percentage' ? String(held.discount.percentage ?? 0) : String(paiseToRupees(held.discount.amountPaise))); setShowCustomerDiscount(Boolean(held.customerName || held.customerMobile || held.discount.mode !== 'none')); void deleteHeldCart(held.id) }}>Resume</Button></div></div>)}</div> : null}
          </div>
          <div className="grid shrink-0 gap-2 border-t border-border pt-3"><div className="grid gap-2 sm:grid-cols-2">{checkoutWarning ? <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200 sm:col-span-2"><AlertTriangle className="mr-1 inline size-3.5" />{checkoutWarning}</p> : null}<Button variant="outline" disabled={cart.length === 0 || busy} onClick={() => void saveHeldCart({ label: `Cart ${serverNowDate().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}`, lines: cart, customerName, customerMobile, discount }, currentUser).then(() => { clearCart(); showToast('Cart held.') }).catch((error: Error) => showToast(error.message))}><Pause />Hold cart</Button><Button disabled={cart.length === 0 || busy || !navigator.onLine || Boolean(paymentError)} onClick={() => void checkout()}>{busy ? 'Finalizing...' : 'Finalize Bill'}</Button></div></div>
        </CardContent></Card>
      </div> : null}

      {tab === 'dashboard' ? <PosDashboard products={sandbox.products} /> : null}
      {tab === 'bills' ? <BillsPanel currentUser={currentUser} showToast={showToast} /> : null}
      {tab === 'grn' ? <PosGoodsReceipt currentUser={currentUser} vendors={grnVendors} enabled={vendorLedgerEnabled} showToast={showToast} /> : null}
      {tab === 'audit' ? <PosStockAuditPage currentUser={currentUser} showToast={showToast} /> : null}
        </PageCardStack>
      </div>
    </PageLayout>
    </Tabs>
    {showUnresolvedAlert ? createPortal(
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3" role="alertdialog" aria-modal="true" aria-labelledby="pos-unresolved-title" aria-describedby="pos-unresolved-description">
        <Card className="w-full max-w-xl shadow-2xl">
          <CardHeader><SectionHeading eyebrow="Billing blocked" title="Resolve unknown product before checkout" /></CardHeader>
          <CardContent className="grid gap-3">
            <p id="pos-unresolved-description" className="text-sm text-muted-foreground">The bill cannot be finalized while an unknown barcode or unresolved cart item remains. Add the product to live inventory, or remove unresolved legacy items from this cart.</p>
            {unknownBarcode ? <>
              <FieldLabel label="Unknown barcode"><Input value={unknownBarcode} readOnly /></FieldLabel>
              <FieldLabel label="Product name"><Input value={unknownProductName} onChange={(event) => setUnknownProductName(event.target.value)} autoFocus /></FieldLabel>
              <FieldLabel label="Selling price"><Input type="number" min="0" step="0.01" value={unknownPrice} onChange={(event) => setUnknownPrice(event.target.value)} /></FieldLabel>
              <p className="text-xs text-muted-foreground">Creating it adds the product to the live inventory at 0 stock, then adds it to this cart. Record received stock through GRN or correct the count through Audit.</p>
              <Button type="button" disabled={creatingProduct} onClick={() => void createUnknownProduct()}><Plus />{creatingProduct ? 'Creating product…' : 'Create product & resolve barcode'}</Button>
            </> : <>
              <div className="grid gap-1 text-sm">{cart.filter((line) => line.kind === 'temporary').map((line) => <p key={line.id}><strong>{line.description}</strong> · barcode {line.barcode}</p>)}</div>
              <Button type="button" variant="outline" onClick={() => { setCart((current) => current.filter((line) => line.kind !== 'temporary')); setShowUnresolvedAlert(false); showToast('Unresolved legacy items were removed from the cart. They will not be billed.') }}>Remove unresolved items from cart</Button>
            </>}
          </CardContent>
        </Card>
      </div>,
      document.body,
    ) : null}
  </>
}

function billPaymentMode(bill: PosBill) {
  const labels: Record<PosPaymentMethod, string> = { cash: 'Cash', upi: 'UPI', card: 'Card', 'bank-transfer': 'Bank transfer' }
  const methods = [...new Set(bill.payments.filter((payment) => payment.amountPaise !== 0).map((payment) => labels[payment.method]))]
  if (methods.length === 0) return 'Not recorded'
  return methods.length === 1 ? methods[0] : `Split · ${methods.join(' + ')}`
}

function shortReceiptNumber(receiptNumber: string) {
  const suffix = receiptNumber.split('-').at(-1)
  return suffix ? `#${suffix}` : receiptNumber
}

const BILL_HISTORY_BATCH_SIZE = 7

function BillActions({ bill, onReturn }: { bill: PosBill; onReturn: (bill: PosBill) => void }) {
  return <div className="flex flex-wrap justify-end gap-1.5">
    <Button size="sm" variant="outline" onClick={() => onReturn(bill)}>Request return</Button>
    <Button size="sm" variant="outline" onClick={() => printPosReceipt(bill, 'thermal')}><Printer />Reprint</Button>
  </div>
}

function BillsPanel({ currentUser, showToast }: { currentUser: AppUser; showToast: (message: string) => void }) {
  const [bills, setBills] = useState<PosBill[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [nextCursor, setNextCursor] = useState<PosBillPageCursor | null>(null)
  const [hasOlder, setHasOlder] = useState(false)
  const [returnBill, setReturnBill] = useState<PosBill | null>(null)
  useEffect(() => {
    let active = true
    void loadRecentPosBills(BILL_HISTORY_BATCH_SIZE).then((page) => {
      if (!active) return
      setBills(page.bills)
      setNextCursor(page.nextCursor)
      setHasOlder(page.bills.length === BILL_HISTORY_BATCH_SIZE)
    }).catch((error: unknown) => {
      if (active) setLoadError(error instanceof Error ? error.message : 'Unable to load recent bills.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [])

  async function loadMoreBills() {
    if (!nextCursor) return
    setLoadingMore(true)
    try {
      const page = await loadRecentPosBills(BILL_HISTORY_BATCH_SIZE, nextCursor)
      if (page.bills.length === 0) {
        setHasOlder(false)
        showToast('No older bills are available.')
        return
      }
      setBills((current) => [...current, ...page.bills])
      setNextCursor(page.nextCursor)
      setHasOlder(page.bills.length === BILL_HISTORY_BATCH_SIZE)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to load older bills.')
    } finally {
      setLoadingMore(false)
    }
  }

  const columns = useMemo<LogTableColumn<PosBill>[]>(() => [
    {
      id: 'bill', label: 'Bill', value: (bill) => bill.createdAt,
      cell: (bill) => <span title={bill.receiptNumber}><strong className="block">{shortReceiptNumber(bill.receiptNumber)}</strong><span className="text-[10px] text-muted-foreground">{formatDisplayDateTime(bill.createdAt)}</span></span>,
      hideable: false, sortDescFirst: true,
    },
    { id: 'total', label: 'Total amount', value: (bill) => bill.totalPaise, cell: (bill) => <strong className="tabular-nums">{money(bill.totalPaise)}</strong>, align: 'right', sortDescFirst: true },
    { id: 'operator', label: 'Punched by', value: (bill) => bill.createdByName, cell: (bill) => <span className="font-medium">{bill.createdByName}</span> },
    { id: 'payment', label: 'Payment mode', value: billPaymentMode, cell: (bill) => billPaymentMode(bill) },
    { id: 'actions', label: 'Actions', value: () => '', cell: (bill) => <BillActions bill={bill} onReturn={setReturnBill} />, align: 'right', hideable: false, sortable: false },
  ], [])

  return <>
    <Card className="min-h-0">
      <CardHeader className="flex-row items-end justify-between gap-3 border-b border-border/60 pb-3">
        <SectionHeading eyebrow="Bills" title="Bill History" description={`Latest 7 loaded first · ${bills.length} shown`} />
        {hasOlder ? <Button size="sm" variant="outline" disabled={loading || loadingMore} onClick={() => void loadMoreBills()}>{loadingMore ? 'Loading…' : 'Load more'}</Button> : null}
      </CardHeader>
      <CardContent className="px-2 pb-2 pt-2 sm:px-3">
        {loadError ? <StatusPanel variant="destructive">{loadError}</StatusPanel> : loading ? <StatusPanel>Loading latest bills…</StatusPanel> : <ResponsiveLogTable
          columns={columns}
          data={bills}
          emptyTitle="No bills yet"
          getRowId={(bill) => bill.id}
          initialSortId="bill"
          noun="bill"
          pageSize={1000}
          searchPlaceholder="Search bill, operator or payment mode"
          searchText={(bill) => [bill.receiptNumber, bill.businessDate, formatDisplayDateTime(bill.createdAt), bill.createdByName, billPaymentMode(bill)].join(' ')}
          showFooter={false}
          showToolbar={false}
          mobileCard={(bill) => <article className="rounded-2xl border border-border/90 bg-card p-3 shadow-sm">
            <div className="flex items-start justify-between gap-3"><div title={bill.receiptNumber}><strong className="text-sm">{shortReceiptNumber(bill.receiptNumber)}</strong><p className="text-[10px] text-muted-foreground">{formatDisplayDateTime(bill.createdAt)}</p></div><strong className="tabular-nums">{money(bill.totalPaise)}</strong></div>
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/60 pt-3 text-xs"><span><span className="block text-[10px] uppercase text-muted-foreground">Punched by</span>{bill.createdByName}</span><span><span className="block text-[10px] uppercase text-muted-foreground">Payment</span>{billPaymentMode(bill)}</span></div>
            <div className="mt-3 border-t border-border/60 pt-3"><BillActions bill={bill} onReturn={setReturnBill} /></div>
          </article>}
        />}
      </CardContent>
    </Card>
    {returnBill ? <ReturnDialog key={returnBill.id} bill={returnBill} currentUser={currentUser} showToast={showToast} onClose={() => setReturnBill(null)} /> : null}
  </>
}

function ReturnDialog({ bill, currentUser, showToast, onClose }: { bill: PosBill; currentUser: AppUser; showToast: (message: string) => void; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const [returnQuantities, setReturnQuantities] = useState<Record<string, string>>({})
  const [condition, setCondition] = useState<'sellable' | 'damaged'>('sellable')
  const [refundDate, setRefundDate] = useState(today())
  const [refundAmount, setRefundAmount] = useState('')
  const [refundMethod, setRefundMethod] = useState<PosPaymentMethod>('cash')
  const [refundReference, setRefundReference] = useState('')
  const [busy, setBusy] = useState(false)
  async function submitReturn() {
    const returnLines = bill.lines.map((line) => ({ lineId: line.id, quantity: Number(returnQuantities[line.id] ?? 0) })).filter((line) => line.quantity > 0)
    if (returnLines.length === 0) return showToast('Enter at least one return quantity.')
    setBusy(true)
    try {
      await requestBillAction({ type: 'return', billId: bill.id, reason, returnCondition: condition, returnLines, refundDate, refundAmountPaise: rupeesToPaise(Number(refundAmount || paiseToRupees(bill.totalPaise))), refundMethod, ...(refundReference.trim() ? { refundReference: refundReference.trim() } : {}) }, currentUser)
      showToast(condition + ' return sent to Action Centre.')
      onClose()
    } catch (error) { showToast(error instanceof Error ? error.message : 'Unable to request return.') }
    finally { setBusy(false) }
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3" onKeyDown={(event) => { if (event.key === 'Escape' && !busy) onClose() }}>
    <Card role="dialog" aria-modal="true" aria-labelledby="return-dialog-title" className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden shadow-xl">
      <CardHeader className="flex-row items-start justify-between gap-3 border-b"><div id="return-dialog-title"><SectionHeading eyebrow="Return items" title={bill.receiptNumber} description="Choose quantities and enter the refund details." /></div><Button type="button" size="icon" variant="ghost" aria-label="Close return dialog" disabled={busy} onClick={onClose}><X /></Button></CardHeader>
      <CardContent className="grid gap-3 overflow-y-auto pt-4">
        <div className="grid gap-2">{bill.lines.map((line) => <div key={line.id} className="flex items-center justify-between gap-3 rounded-lg border p-2 text-sm"><span className="min-w-0"><strong className="block truncate">{line.description}</strong><span className="text-muted-foreground">Sold {line.quantity} · {money(line.unitPricePaise)} each</span></span><FieldLabel className="shrink-0" label="Return qty"><Input className="w-24" type="number" min="0" max={line.quantity} step="1" value={returnQuantities[line.id] ?? ''} onChange={(event) => setReturnQuantities((current) => ({ ...current, [line.id]: event.target.value }))} placeholder="0" /></FieldLabel></div>)}</div>
        <div className="grid gap-2 rounded-xl bg-secondary/30 p-3 sm:grid-cols-2"><FieldLabel label="Return Condition"><NativeSelect value={condition} onChange={(event) => setCondition(event.target.value as 'sellable' | 'damaged')}><option value="sellable">Sellable (restore stock)</option><option value="damaged">Damaged (no stock)</option></NativeSelect></FieldLabel><FieldLabel label="Refund Date"><Input type="date" value={refundDate} onChange={(event) => setRefundDate(event.target.value)} /></FieldLabel><FieldLabel label="Refund Amount"><Input type="number" min="0" step="0.01" value={refundAmount} onChange={(event) => setRefundAmount(event.target.value)} placeholder={String(paiseToRupees(bill.totalPaise))} /></FieldLabel><FieldLabel label="Refund Method"><NativeSelect value={refundMethod} onChange={(event) => setRefundMethod(event.target.value as PosPaymentMethod)}>{paymentMethods.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}</NativeSelect></FieldLabel><FieldLabel className="sm:col-span-2" label="Refund Reference (Optional)"><Input value={refundReference} onChange={(event) => setRefundReference(event.target.value)} /></FieldLabel><FieldLabel className="sm:col-span-2" label="Mandatory request reason"><Input value={reason} onChange={(event) => setReason(event.target.value)} /></FieldLabel></div>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button type="button" disabled={busy || !reason.trim()} onClick={() => void submitReturn()}>{busy ? 'Sending...' : 'Request return'}</Button></div>
      </CardContent>
    </Card>
  </div>
}
