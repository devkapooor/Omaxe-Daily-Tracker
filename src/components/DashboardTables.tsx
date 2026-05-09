import { useMemo } from 'react'
import type { Cashout } from '@/domain/financeTypes'
import type { CashHolder } from '@/domain/appTypes'
import { money, today, type CashHolderAssignment } from '@/app/uiHelpers'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { SectionHeading } from '@/components/ui/section-heading'

type DashboardTablesProps = {
  cashouts: Cashout[]
  purchases: { date: string; category: string; purchaseAmount: number }[]
  payments: { date: string; type: 'Received' | 'Paid'; amount: number; paymentMode: string }[]
  pendingCashBalances: Record<CashHolder, number>
  pendingCashBankTotal: number
  holderAssignments: CashHolderAssignment[]
}

function DashboardListCard({
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
    <Card>
      <CardHeader>
        <SectionHeading eyebrow={eyebrow} title={title} />
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 && <p className="text-sm font-medium text-muted-foreground">{empty}</p>}
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4 rounded-3xl border border-border/70 bg-secondary/55 p-4">
            <span className="text-sm font-medium text-muted-foreground">{row.label}</span>
            <strong className="text-sm font-bold text-foreground">{row.value}</strong>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export function DashboardTables({
  cashouts,
  purchases,
  payments,
  pendingCashBalances,
  pendingCashBankTotal,
  holderAssignments,
}: DashboardTablesProps) {
  const month = today().slice(0, 7)

  const expenseByCategory = useMemo(() => {
    const map = new Map<string, number>()
    cashouts
      .filter((entry) => entry.date.slice(0, 7) === month)
      .forEach((entry) => map.set(entry.category, (map.get(entry.category) ?? 0) + entry.amount))
    return Array.from(map.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
  }, [cashouts, month])

  const monthlyPurchaseTotal = useMemo(
    () =>
      purchases
        .filter((entry) => entry.date.slice(0, 7) === month)
        .reduce((total, entry) => total + entry.purchaseAmount, 0),
    [month, purchases],
  )

  const vendorPaymentTotal = useMemo(
    () =>
      payments
        .filter((entry) => entry.date.slice(0, 7) === month && entry.type === 'Paid')
        .reduce((total, entry) => total + entry.amount, 0),
    [month, payments],
  )

  const paymentByMode = useMemo(() => {
    const map = new Map<string, number>()
    payments
      .filter((entry) => entry.date.slice(0, 7) === month && entry.type === 'Paid')
      .forEach((entry) => map.set(entry.paymentMode, (map.get(entry.paymentMode) ?? 0) + entry.amount))
    return Array.from(map.entries())
      .map(([mode, amount]) => ({ mode, amount }))
      .sort((a, b) => b.amount - a.amount)
  }, [month, payments])

  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <DashboardListCard
        eyebrow="Month Table"
        title="Expenses By Category"
        empty="No category expenses this month."
        rows={expenseByCategory.map((row) => ({ label: row.category, value: money(row.amount) }))}
      />

      <DashboardListCard
        eyebrow="Month Summary"
        title="Purchase vs Vendor Payment"
        empty="No purchase or payment activity this month."
        rows={[
          { label: 'Total Purchase', value: money(monthlyPurchaseTotal) },
          { label: 'Total Vendor Payment', value: money(vendorPaymentTotal) },
        ]}
      />

      <DashboardListCard
        eyebrow="Month Table"
        title="Vendor Payment By Mode"
        empty="No vendor payment entries this month."
        rows={paymentByMode.map((row) => ({ label: row.mode, value: money(row.amount) }))}
      />

      <DashboardListCard
        eyebrow="Cash Overview"
        title="Pending Cash Particulars"
        empty="No pending cash recorded."
        rows={[
          ...holderAssignments.map((assignment) => ({
            label: assignment.label,
            value: money(pendingCashBalances[assignment.holder] ?? 0),
          })),
          { label: 'Transferred To Bank', value: money(pendingCashBankTotal) },
        ]}
      />
    </section>
  )
}
