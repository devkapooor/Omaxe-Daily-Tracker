import type { InvoiceBalanceV2 } from '@/domain/vendorLedgerV2'
import { money } from '@/app/uiHelpers'
import { Badge } from '@/shared/ui/badge'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { SectionHeading } from '@/shared/ui/section-heading'

type OpenInvoicesV2Props = {
  balances: InvoiceBalanceV2[]
  vendorNameById: Record<string, string>
  onRecordPayment: (purchaseId: string, vendorId: string) => void
}

export function OpenInvoicesV2({ balances, onRecordPayment, vendorNameById }: OpenInvoicesV2Props) {
  return (
    <Card>
      <CardHeader>
        <SectionHeading eyebrow="V2 purchases" title="Open Invoices" />
      </CardHeader>
      <CardContent className="grid gap-3">
        {balances.length === 0 ? <p className="text-sm text-muted-foreground">No open V2 invoices.</p> : null}
        {balances.map(({ availableToAllocatePaise, openAmountPaise, purchase, reservedAmountPaise }) => (
          <button
            className="grid gap-3 rounded-2xl border border-border bg-card/60 p-4 text-left transition-colors hover:border-primary/50 sm:grid-cols-[1fr_auto] sm:items-center"
            key={purchase.id}
            onClick={() => onRecordPayment(purchase.id, purchase.vendorId)}
            type="button"
          >
            <span>
              <span className="block font-semibold text-foreground">{vendorNameById[purchase.vendorId] ?? 'Unknown vendor'}</span>
              <span className="text-sm text-muted-foreground">{purchase.invoiceNumber} | {purchase.invoiceDate}</span>
            </span>
            <span className="flex flex-wrap items-center gap-2 sm:justify-end">
              <Badge variant="secondary">Open {money(openAmountPaise / 100)}</Badge>
              {reservedAmountPaise > 0 ? <Badge variant="warning">Reserved {money(reservedAmountPaise / 100)}</Badge> : null}
              <Badge variant="outline">Available {money(availableToAllocatePaise / 100)}</Badge>
            </span>
          </button>
        ))}
      </CardContent>
    </Card>
  )
}
