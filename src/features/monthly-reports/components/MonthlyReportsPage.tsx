import { useMemo, useState } from 'react'
import { formatDisplayDateTime, money } from '@/app/uiHelpers'
import type { MonthlyReportMeta } from '@/domain/appTypes'
import type { CashTransfer, DailyCashoutEntry, LoanEntry, VendorRecord } from '@/domain/appTypes'
import type { FinanceData } from '@/domain/financeTypes'
import { useMonthlyReportMetrics } from '@/features/monthly-reports/hooks/useMonthlyReportMetrics'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'
import { SectionHeading } from '@/shared/ui/section-heading'
import { cn } from '@/shared/lib/utils'

type MonthlyReportsPageProps = {
  data: FinanceData
  cashTransfers: CashTransfer[]
  currentUserName: string
  dailyCashouts: DailyCashoutEntry[]
  defaultMarginPercentage: number
  loans: LoanEntry[]
  monthlyReports: MonthlyReportMeta[]
  totalLoans: number
  totalVendorOutstanding: number
  vendors: VendorRecord[]
  onSaveMonthlyMargin: (month: string, marginPercentage: number, actor: string) => Promise<void>
  onToast: (message: string) => void
}

function MetricCard({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'profit' | 'expense' }) {
  const toneClass =
    tone === 'profit'
      ? 'border-emerald-900/60 bg-emerald-950/25'
      : tone === 'expense'
        ? 'border-rose-900/60 bg-rose-950/20'
        : 'border-border/70 bg-secondary/40'

  return (
    <div className={cn('rounded-[16px] border px-3 py-2.5', toneClass)}>
      <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <strong className="mt-1 block text-[1.15rem] font-black tracking-tight text-foreground">{value}</strong>
    </div>
  )
}

function ListCard({
  eyebrow,
  title,
  empty,
  rows,
}: {
  eyebrow: string
  title: string
  empty: string
  rows: Array<{ label: string; value: string }>
}) {
  return (
    <Card variant="quiet">
      <CardHeader>
        <SectionHeading eyebrow={eyebrow} title={title} />
      </CardHeader>
      <CardContent className="space-y-1.5">
        {rows.length === 0 ? <p className="text-[12px] font-medium text-muted-foreground">{empty}</p> : null}
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-2 rounded-[12px] border border-border/70 bg-secondary/45 px-2.5 py-1.75">
            <span className="text-[12px] font-medium text-muted-foreground">{row.label}</span>
            <strong className="text-[12px] font-bold text-foreground">{row.value}</strong>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export function MonthlyReportsPage({
  cashTransfers,
  currentUserName,
  dailyCashouts,
  data,
  defaultMarginPercentage,
  loans,
  monthlyReports,
  onSaveMonthlyMargin,
  onToast,
  totalLoans,
  totalVendorOutstanding,
  vendors,
}: MonthlyReportsPageProps) {
  const { defaultSelectedMonth, detailsByMonth, months, openLoanCount, summaries } = useMonthlyReportMetrics({
    cashTransfers,
    dailyCashouts,
    data,
    defaultMarginPercentage,
    loans,
    monthlyReports,
    totalLoans,
    totalVendorOutstanding,
    vendors,
  })
  const [selectedMonth, setSelectedMonth] = useState<string | null>(defaultSelectedMonth)
  const [editedMarginMonth, setEditedMarginMonth] = useState<string | null>(null)
  const [editedMarginValue, setEditedMarginValue] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const effectiveSelectedMonth = selectedMonth && detailsByMonth.has(selectedMonth) ? selectedMonth : defaultSelectedMonth
  const selectedDetail = useMemo(
    () => (effectiveSelectedMonth ? detailsByMonth.get(effectiveSelectedMonth) ?? null : null),
    [detailsByMonth, effectiveSelectedMonth],
  )
  const marginInput = selectedDetail
    ? editedMarginMonth === selectedDetail.month
      ? editedMarginValue
      : String(selectedDetail.marginPercentage)
    : ''

  if (!months.length) {
    return (
      <section className="mt-2.5 min-h-0 flex-1 overflow-y-auto pr-1">
        <Card className="p-4">
          <SectionHeading
            eyebrow="Monthly Reports"
            title="No monthly activity yet"
            description="This page will populate once sales, expenses, purchases, payments, cashouts, or monthly margins are recorded."
          />
        </Card>
      </section>
    )
  }

  async function handleSaveMargin() {
    if (!selectedDetail) return
    const nextMargin = Number(marginInput)
    if (!Number.isFinite(nextMargin) || nextMargin < 0 || nextMargin > 100) {
      setError('Margin percentage must be between 0 and 100.')
      return
    }

    setIsSaving(true)
    setError('')
    try {
      await onSaveMonthlyMargin(selectedDetail.month, nextMargin, currentUserName)
      onToast(`Monthly margin saved for ${selectedDetail.label}.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save this monthly margin.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="mt-1.5 min-h-0 flex-1 overflow-y-auto pr-1">
      <div className="grid gap-2.5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)]">
        <Card className="min-h-0">
          <CardHeader>
            <SectionHeading
              eyebrow="Overview"
              title="Month Summary"
              description="Newest months appear first. Pick a month to inspect the detailed financial breakdown."
            />
          </CardHeader>
          <CardContent className="space-y-2">
            {summaries.map((summary) => {
              const isActive = summary.month === selectedMonth
              return (
                <button
                  key={summary.month}
                  type="button"
                  className={cn(
                    'w-full rounded-[18px] border px-3 py-2.5 text-left transition-colors',
                    isActive ? 'border-[#5d4724] bg-secondary/75' : 'border-border/70 bg-background/35 hover:bg-secondary/55',
                  )}
                  onClick={() => {
                    setSelectedMonth(summary.month)
                    setEditedMarginMonth(null)
                    setEditedMarginValue('')
                    setError('')
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#c5a56a]">{summary.month}</p>
                      <h3 className="text-[15px] font-black tracking-tight text-foreground">{summary.label}</h3>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-background/55 px-2 py-1 text-right">
                      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Gross Profit</p>
                      <strong className="text-[12px] font-black text-foreground">{money(summary.grossProfitEstimate)}</strong>
                    </div>
                  </div>
                  <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                    <div className="rounded-[12px] border border-border/60 bg-background/35 px-2 py-1.5">
                      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Sales</p>
                      <strong className="text-[12px] font-bold text-foreground">{money(summary.totalSales)}</strong>
                    </div>
                    <div className="rounded-[12px] border border-border/60 bg-background/35 px-2 py-1.5">
                      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Expenses</p>
                      <strong className="text-[12px] font-bold text-foreground">{money(summary.totalCashoutExpenses)}</strong>
                    </div>
                    <div className="rounded-[12px] border border-border/60 bg-background/35 px-2 py-1.5">
                      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Purchases</p>
                      <strong className="text-[12px] font-bold text-foreground">{money(summary.totalPurchases)}</strong>
                    </div>
                    <div className="rounded-[12px] border border-border/60 bg-background/35 px-2 py-1.5">
                      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Vendor Payments</p>
                      <strong className="text-[12px] font-bold text-foreground">{money(summary.vendorPaymentTotal)}</strong>
                    </div>
                  </div>
                </button>
              )
            })}
          </CardContent>
        </Card>

        {selectedDetail ? (
          <div className="grid gap-2.5">
            <Card>
              <CardHeader>
                <SectionHeading
                  eyebrow="Selected Month"
                  title={selectedDetail.label}
                  description={selectedDetail.updatedAt ? `Last updated ${formatDisplayDateTime(selectedDetail.updatedAt)}` : 'Built from recorded monthly activity.'}
                />
              </CardHeader>
              <CardContent className="grid gap-2">
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  <MetricCard label="Total Sales" value={money(selectedDetail.totalSales)} />
                  <MetricCard label="Gross Profit Estimate" value={money(selectedDetail.grossProfitEstimate)} tone="profit" />
                  <MetricCard label="Cashout Expenses" value={money(selectedDetail.totalCashoutExpenses)} tone="expense" />
                  <MetricCard label="Returns / Discounts" value={money(selectedDetail.totalReturns)} />
                </div>

                <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                  <div>
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#c5a56a]">Month Margin</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">This month uses its own saved margin percentage for gross-profit estimation.</p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[120px_auto]">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={marginInput}
                      onChange={(event) => {
                        setEditedMarginMonth(selectedDetail.month)
                        setEditedMarginValue(event.target.value)
                        setError('')
                      }}
                    />
                    <Button type="button" onClick={() => void handleSaveMargin()} disabled={isSaving}>
                      {isSaving ? 'Saving...' : 'Save Margin'}
                    </Button>
                  </div>
                </div>
                {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
              </CardContent>
            </Card>

            <div className="grid gap-2.5 lg:grid-cols-2">
              <ListCard
                eyebrow="Sales Mix"
                title="Sales Breakdown"
                empty="No sales recorded for this month."
                rows={[
                  { label: 'Cash Sales', value: money(selectedDetail.salesMix.cashSales) },
                  { label: 'UPI Sales', value: money(selectedDetail.salesMix.upiSales) },
                  { label: 'Card Sales', value: money(selectedDetail.salesMix.cardSales) },
                  { label: 'Bank Transfer Sales', value: money(selectedDetail.salesMix.bankTransferSales) },
                  { label: 'Credit Sales', value: money(selectedDetail.salesMix.creditSales) },
                  { label: 'Returns / Discounts', value: money(selectedDetail.salesMix.returnsDiscounts) },
                ].filter((row) => row.value !== money(0))}
              />

              <ListCard
                eyebrow="Expense Mix"
                title="Expenses By Category"
                empty="No cashout expenses recorded for this month."
                rows={selectedDetail.expenseByCategory.map((row) => ({ label: row.category, value: money(row.amount) }))}
              />

              <ListCard
                eyebrow="Purchase Flow"
                title="Purchases And Payments"
                empty="No purchase or payment activity recorded for this month."
                rows={[
                  { label: 'Purchases', value: money(selectedDetail.purchaseTotals.totalPurchases) },
                  { label: 'Purchase Count', value: String(selectedDetail.purchaseTotals.purchaseCount) },
                  { label: 'Vendor Payments', value: money(selectedDetail.paymentTotals.vendorPayments) },
                  { label: 'Loan Payments Paid', value: money(selectedDetail.paymentTotals.loanPaymentsPaid) },
                  { label: 'All Paid Entries', value: money(selectedDetail.paymentTotals.totalPaid) },
                  { label: 'All Received Entries', value: money(selectedDetail.paymentTotals.totalReceived) },
                ]}
              />

              <ListCard
                eyebrow="Cash Flow"
                title="Operational Cash Signals"
                empty="No daily cashouts or transfers recorded for this month."
                rows={[
                  { label: 'Daily Cashout Entries', value: String(selectedDetail.operationalFlow.dailyCashoutCount) },
                  { label: 'Drawer Total Recorded', value: money(selectedDetail.operationalFlow.drawerTotalRecorded) },
                  { label: 'Transferred To Bank', value: money(selectedDetail.operationalFlow.transferredToBank) },
                  { label: 'Transferred To People', value: money(selectedDetail.operationalFlow.transferredToPeople) },
                  { label: 'Pending Cash Signal', value: money(selectedDetail.operationalFlow.pendingCashSignal) },
                ]}
              />
            </div>

            <Card variant="quiet">
              <CardHeader>
                <SectionHeading
                  eyebrow="Current Snapshot"
                  title="Outstanding Liabilities"
                  description="These are current balances shown for context. They are not reconstructed month-end snapshots."
                />
              </CardHeader>
              <CardContent className="grid gap-2 md:grid-cols-3">
                <MetricCard label="Current Vendor Outstanding" value={money(selectedDetail.liabilitySnapshot.currentVendorOutstanding)} />
                <MetricCard label="Current Open Loan Balance" value={money(selectedDetail.liabilitySnapshot.currentOpenLoanBalance)} />
                <MetricCard label="Open Loan Entries" value={String(openLoanCount)} />
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </section>
  )
}
