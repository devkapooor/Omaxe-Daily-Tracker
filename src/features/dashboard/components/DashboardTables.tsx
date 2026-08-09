import type { LabelAmountRow } from '@/domain/workspaceMetrics'
import { type LegacyCashBalance, money, type PendingCashUserBalance } from '@/app/uiHelpers'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { SectionHeading } from '@/shared/ui/section-heading'

type DashboardTablesProps = {
  expenseByCategory: LabelAmountRow[]
  monthlyPurchaseTotal: number
  paymentByMode: LabelAmountRow[]
  userBalances: PendingCashUserBalance[]
  legacyBalances: LegacyCashBalance[]
  pendingCashBankTotal: number
  vendorPaymentTotal: number
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
    <Card className="border-border/60">
      <CardHeader>
        <SectionHeading eyebrow={eyebrow} title={title} />
      </CardHeader>
      <CardContent className="space-y-1">
        {rows.length === 0 && <p className="text-[12px] font-medium text-muted-foreground">{empty}</p>}
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-2 rounded-[12px] border border-border/60 bg-secondary/45 px-2.5 py-1.75">
            <span className="text-[12px] font-medium text-muted-foreground">{row.label}</span>
            <strong className="text-[12px] font-bold text-foreground">{row.value}</strong>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export function DashboardTables({
  expenseByCategory,
  monthlyPurchaseTotal,
  paymentByMode,
  userBalances,
  legacyBalances,
  pendingCashBankTotal,
  vendorPaymentTotal,
}: DashboardTablesProps) {
  return (
    <section className="grid gap-1.5 xl:grid-cols-2">
      <DashboardListCard
        eyebrow="Month Table"
        title="Expenses By Category"
        empty="No category expenses this month."
        rows={expenseByCategory.map((row) => ({ label: row.label, value: money(row.amount) }))}
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
        rows={paymentByMode.map((row) => ({ label: row.label, value: money(row.amount) }))}
      />

      <DashboardListCard
        eyebrow="Cash Overview"
        title="Pending Cash Particulars"
        empty="No pending cash recorded."
        rows={[
          ...userBalances.map((entry) => ({
            label: entry.name,
            value: money(entry.amount),
          })),
          ...legacyBalances
            .filter((entry) => entry.amount !== 0)
            .map((entry) => ({ label: `Legacy ${entry.label}`, value: money(entry.amount) })),
          { label: 'Transferred To Bank', value: money(pendingCashBankTotal) },
        ]}
      />
    </section>
  )
}

