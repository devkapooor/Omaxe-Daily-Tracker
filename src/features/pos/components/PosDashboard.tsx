import { useState, type ComponentType } from 'react'
import { AlertTriangle, Banknote, Boxes, CreditCard, IndianRupee, PackageX, QrCode, ReceiptText, ShoppingBasket } from 'lucide-react'
import { formatDisplayDateTime, today } from '@/app/uiHelpers'
import type { PosPaymentMethod, PosProduct } from '../domain/types'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { SectionHeading } from '@/shared/ui/section-heading'
import { StatusPanel } from '@/shared/ui/status-panel'
import { Tabs, TabsList, TabsTrigger } from '@/shared/ui/tabs'
import { calculatePosDashboard } from '../domain/posDashboard'
import { usePosDashboard } from '../hooks/usePosDashboard'

const money = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const paymentIcons: Record<PosPaymentMethod, ComponentType<{ className?: string }>> = {
  cash: Banknote,
  upi: QrCode,
  card: CreditCard,
  'bank-transfer': IndianRupee,
}

type DayOffset = 0 | 1 | 2

function dayRange(offset: DayOffset) {
  const [currentYear, currentMonth, currentDay] = today().split('-').map(Number)
  const selected = new Date(currentYear, currentMonth - 1, currentDay - offset)
  const year = selected.getFullYear()
  const month = selected.getMonth() + 1
  const day = selected.getDate()
  const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return {
    from: date,
    to: date,
    label: selected.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }),
  }
}

export function PosDashboard({ products }: { products: PosProduct[] }) {
  const [dayOffset, setDayOffset] = useState<DayOffset>(0)
  const range = dayRange(dayOffset)
  const data = usePosDashboard(range.from, range.to)
  const metrics = calculatePosDashboard(data.bills, data.states, data.refunds, range.from, range.to, products)
  const cards = [
    { label: 'Net Sales', value: money(metrics.netPaise), note: `${money(metrics.salesPaise)} before refunds`, icon: IndianRupee },
    { label: 'Bills', value: String(metrics.billCount), note: `${metrics.splitBillCount} split payments`, icon: ReceiptText },
    { label: 'Items Sold', value: metrics.unitsSold.toLocaleString('en-IN'), note: 'Quantity across completed bills', icon: ShoppingBasket },
    { label: 'Average Bill', value: money(metrics.averageBillPaise), note: 'Average after discounts', icon: Boxes },
  ]

  return <section aria-label="POS sales dashboard" className="grid gap-card-gap pb-4">
    <Card>
      <CardContent className="flex min-h-20 flex-col justify-center gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div><span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">POS Performance</span><h2 className="text-xl font-semibold tracking-tight">{range.label}</h2></div>
        <Tabs value={String(dayOffset)} onValueChange={(value) => setDayOffset(Number(value) as DayOffset)}>
          <TabsList aria-label="POS business day" className="min-h-8 grid-cols-3">
            <TabsTrigger value="0">T</TabsTrigger>
            <TabsTrigger value="1">T-1</TabsTrigger>
            <TabsTrigger value="2">T-2</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardContent>
    </Card>

    {data.error ? <StatusPanel variant="destructive">{data.error}</StatusPanel> : data.loading ? <StatusPanel>Loading POS activity…</StatusPanel> : <>
      <div className="grid gap-card-gap sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon
          return <Card key={card.label} aria-label={card.label}><CardContent className="flex items-start justify-between gap-3 py-4">
            <div className="grid gap-1"><span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{card.label}</span><strong className="text-2xl font-black tabular-nums">{card.value}</strong><span className="text-xs text-muted-foreground">{card.note}</span></div>
            <span className="rounded-lg bg-primary/10 p-2 text-primary"><Icon className="size-5" /></span>
          </CardContent></Card>
        })}
      </div>

      <div className="grid gap-card-gap xl:grid-cols-2">
        <Card>
          <CardHeader><SectionHeading eyebrow="Collections" title="Payment Mix" description="Net collections by payment method." /></CardHeader>
          <CardContent className="grid gap-3">
            {metrics.methods.map((method) => {
              const Icon = paymentIcons[method.value]
              const share = metrics.salesPaise > 0 ? method.collectedPaise * 100 / metrics.salesPaise : 0
              return <div key={method.value} className="grid gap-1.5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2 font-semibold"><Icon className="size-4 text-muted-foreground" />{method.label}</span>
                  <span className="text-right"><strong className="tabular-nums">{money(method.netPaise)}</strong><span className="ml-2 text-xs text-muted-foreground">{share.toFixed(1)}%</span></span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, share))}%` }} /></div>
                {method.refundedPaise > 0 ? <span className="text-xs text-muted-foreground">Refunded {money(method.refundedPaise)}</span> : null}
              </div>
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><SectionHeading eyebrow="Exceptions" title="Needs Attention" description="Activity that may require review." /></CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            <ExceptionMetric label="Approved refunds" value={money(metrics.refundsPaise)} note={`${metrics.refundCount} refund records`} alert={metrics.refundsPaise > 0} />
            <ExceptionMetric label="Discounts" value={money(metrics.discountPaise)} note={`${metrics.discountedBillCount} discounted bills`} alert={metrics.discountPaise > 0} />
            <ExceptionMetric label="Voided bills" value={String(metrics.voidedCount)} note={money(metrics.voidedPaise)} alert={metrics.voidedCount > 0} />
            <ExceptionMetric label="Unresolved items" value={String(metrics.unresolvedItemCount)} note="Temporary item quantity" alert={metrics.unresolvedItemCount > 0} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-card-gap xl:grid-cols-2">
        <Card>
          <CardHeader><SectionHeading eyebrow="Product performance" title="Top Selling Products" description={`Ranked by sales value for ${range.label}.`} /></CardHeader>
          <CardContent>
            {metrics.topProducts.length === 0 ? <EmptyState text="No catalog product sales on this day." /> : <div className="divide-y divide-border">
              {metrics.topProducts.map((product, index) => <div key={product.id} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span className="flex size-7 items-center justify-center rounded-full bg-secondary text-xs font-black">{index + 1}</span>
                <div className="min-w-0"><strong className="block truncate text-sm">{product.name}</strong><span className="text-xs text-muted-foreground">{product.quantity.toLocaleString('en-IN')} units</span></div>
                <strong className="text-sm tabular-nums">{money(product.revenuePaise)}</strong>
              </div>)}
            </div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><SectionHeading eyebrow="Inventory" title="Stock Attention" description="Active products at zero or negative stock." /></CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid grid-cols-2 gap-2">
              <ExceptionMetric label="Negative stock" value={String(metrics.negativeStockCount)} note="Below zero" alert={metrics.negativeStockCount > 0} />
              <ExceptionMetric label="Out of stock" value={String(metrics.zeroStockCount)} note="Exactly zero" alert={metrics.zeroStockCount > 0} />
            </div>
            {metrics.stockAttention.length === 0 ? <EmptyState text="No active products at zero or negative stock." /> : <div className="divide-y divide-border rounded-lg border border-border px-3">
              {metrics.stockAttention.map((product) => <div key={product.id} className="flex items-center justify-between gap-3 py-2.5 text-sm"><span className="min-w-0 truncate font-medium">{product.name}</span><strong className={product.currentQuantity < 0 ? 'text-destructive' : 'text-warning'}>{product.currentQuantity.toLocaleString('en-IN')}</strong></div>)}
            </div>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><SectionHeading eyebrow="Latest activity" title="Recent Bills" description={`Most recent completed bills in ${range.label}.`} /></CardHeader>
        <CardContent>
          {metrics.recentBills.length === 0 ? <EmptyState text="No completed bills on this day." /> : <div className="divide-y divide-border">
            {metrics.recentBills.map((bill) => <div key={bill.id} className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-4">
              <div><strong className="text-sm">{bill.receiptNumber}</strong><span className="ml-2 text-xs text-muted-foreground">{bill.createdByName}</span></div>
              <span className="text-xs text-muted-foreground">{formatDisplayDateTime(bill.createdAt)}</span>
              <strong className="text-sm tabular-nums">{money(bill.totalPaise)}</strong>
            </div>)}
          </div>}
        </CardContent>
      </Card>
    </>}
  </section>
}

function ExceptionMetric({ label, value, note, alert }: { label: string; value: string; note: string; alert: boolean }) {
  return <div className="rounded-lg border border-border bg-secondary/25 p-3">
    <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</span>{alert ? <AlertTriangle className="size-4 text-warning" /> : null}</div>
    <strong className="mt-1 block text-xl tabular-nums">{value}</strong>
    <span className="text-xs text-muted-foreground">{note}</span>
  </div>
}

function EmptyState({ text }: { text: string }) {
  return <div className="flex items-center gap-2 rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground"><PackageX className="size-4" />{text}</div>
}
