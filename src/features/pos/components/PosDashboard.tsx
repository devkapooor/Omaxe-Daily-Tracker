import { useState } from 'react'
import { today } from '@/app/uiHelpers'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { FieldLabel } from '@/shared/ui/field-label'
import { Input } from '@/shared/ui/input'
import { SectionHeading } from '@/shared/ui/section-heading'
import { StatusPanel } from '@/shared/ui/status-panel'
import { calculatePosDashboard } from '../domain/posDashboard'
import { usePosDashboard } from '../hooks/usePosDashboard'

const money = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function PosDashboard() {
  const [from, setFrom] = useState(today())
  const [to, setTo] = useState(today())
  const data = usePosDashboard(from, to)
  const metrics = calculatePosDashboard(data.bills, data.states, data.refunds, from, to)
  const cards = [
    { label: 'Total sales', value: money(metrics.salesPaise), note: 'After discounts; voided bills excluded' },
    { label: 'Refunds', value: money(metrics.refundsPaise), note: 'Approved refunds paid in this period' },
    { label: 'Net collections', value: money(metrics.netPaise), note: 'Sales less refunds' },
    { label: 'Bills', value: String(metrics.billCount), note: `${metrics.splitBillCount} paid using split payments` },
  ]
  return <section aria-label="POS sales dashboard" className="grid gap-3">
    <Card><CardHeader><SectionHeading eyebrow="POS (Test)" title="POS Sales Dashboard" description="Sales and payment collections for this POS only." /></CardHeader><CardContent className="flex flex-wrap items-end gap-3">
      <FieldLabel label="Start date"><Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></FieldLabel>
      <FieldLabel label="End date"><Input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></FieldLabel>
      <Button variant="outline" onClick={() => { const date = today(); setFrom(date); setTo(date) }}>Today</Button>
      <Button variant="outline" onClick={() => { const date = today(); setFrom(`${date.slice(0, 7)}-01`); setTo(date) }}>This month</Button>
    </CardContent></Card>
    {data.error ? <StatusPanel variant="destructive">{data.error}</StatusPanel> : data.loading ? <StatusPanel>Loading POS sales…</StatusPanel> : <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map((card) => <Card key={card.label} aria-label={card.label}><CardContent className="grid gap-1 pt-4"><span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{card.label}</span><strong className="text-2xl font-black tabular-nums">{card.value}</strong><span className="text-xs text-muted-foreground">{card.note}</span></CardContent></Card>)}</div>
      <Card><CardHeader><SectionHeading eyebrow="Payment methods" title="Sales split" description="Split bills are divided between their payment methods. Cash change is excluded." /></CardHeader><CardContent>
        <div className="overflow-x-auto"><table className="w-full min-w-[420px] text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="pb-3">Method</th><th className="pb-3 text-right">Collected</th><th className="pb-3 text-right">Refunds</th><th className="pb-3 text-right">Net</th></tr></thead><tbody>
          {metrics.methods.map((method) => <tr key={method.value} className="border-b last:border-0"><th className="py-4 text-left font-bold"><div>{method.label}</div><div className="mt-1 text-xs font-normal text-muted-foreground">{metrics.salesPaise ? (method.collectedPaise * 100 / metrics.salesPaise).toFixed(1) : '0.0'}% of sales</div></th><td className="py-4 text-right tabular-nums">{money(method.collectedPaise)}</td><td className="py-4 text-right tabular-nums">{money(method.refundedPaise)}</td><td className="py-4 text-right font-bold tabular-nums">{money(method.netPaise)}</td></tr>)}
          {metrics.unassignedRefundsPaise > 0 ? <tr className="border-b"><th className="py-3 text-left">Unassigned refunds</th><td className="text-right">{money(0)}</td><td className="text-right">{money(metrics.unassignedRefundsPaise)}</td><td className="text-right">{money(-metrics.unassignedRefundsPaise)}</td></tr> : null}
        </tbody><tfoot><tr className="border-t"><th className="pt-3 text-left">Total</th><td className="pt-3 text-right font-bold">{money(metrics.salesPaise)}</td><td className="pt-3 text-right font-bold">{money(metrics.refundsPaise)}</td><td className="pt-3 text-right font-bold">{money(metrics.netPaise)}</td></tr></tfoot></table></div>
        {metrics.billCount === 0 && metrics.refundsPaise === 0 ? <p className="mt-4 rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">No sales in this date range.</p> : null}
      </CardContent></Card>
      <Card><CardContent className="flex flex-wrap gap-x-6 gap-y-2 pt-4 text-sm"><span>Discounts: <strong>{money(metrics.discountPaise)}</strong></span><span>Voided bills: <strong>{metrics.voidedCount}</strong></span><span>Voided value: <strong>{money(metrics.voidedPaise)}</strong></span></CardContent></Card>
      <p className="text-xs text-muted-foreground">Sales use the bill date. Refunds use the refund date and method, including refunds for earlier bills. This dashboard does not update your main finance dashboard.</p>
    </>}
  </section>
}
