import { useMemo } from 'react'
import { Ellipsis } from 'lucide-react'
import type { Cashout, DailySales, Payment, Purchase } from '@/domain/financeTypes'
import type { CashTransfer, LoanEntry, SettingsAuditEntry } from '@/domain/appTypes'
import { formatDisplayDate, formatDisplayDateTime, formatDisplayTime, money } from '@/app/uiHelpers'
import { ResponsiveLogTable, type LogTableColumn } from '@/features/logs/components/ResponsiveLogTable'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'

function MobileLogCard({ children, subtitle, title, trailing }: { children: React.ReactNode; subtitle: string; title: string; trailing?: React.ReactNode }) {
  return (
    <article className="rounded-2xl border border-border/70 bg-[linear-gradient(180deg,rgba(16,40,61,0.96),rgba(9,29,47,0.94))] p-3 shadow-[0_10px_22px_rgba(1,10,20,0.24)]">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-sm font-bold text-foreground">{title}</p><p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p></div>
        {trailing}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/55 pt-3 text-xs">{children}</div>
    </article>
  )
}

function MobileValue({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{label}</p><div className="mt-0.5 font-semibold text-foreground">{value}</div></div>
}

function notesCell(value?: string) {
  return value ? <span className="block max-w-56 truncate text-muted-foreground" title={value}>{value}</span> : <span className="text-muted-foreground">-</span>
}

const salesColumns: LogTableColumn<DailySales>[] = [
  { id: 'date', label: 'Date', value: (entry) => entry.date, cell: (entry) => <span className="font-semibold">{formatDisplayDate(entry.date)}</span>, hideable: false, sortDescFirst: true },
  { id: 'totalSales', label: 'Total sales', value: (entry) => entry.totalSales, cell: (entry) => <span className="font-semibold">{money(entry.totalSales)}</span>, align: 'right', sortDescFirst: true },
  { id: 'cashSales', label: 'Cash', value: (entry) => entry.cashSales, cell: (entry) => money(entry.cashSales), align: 'right', sortDescFirst: true },
  { id: 'upiSales', label: 'UPI', value: (entry) => entry.upiSales, cell: (entry) => money(entry.upiSales), align: 'right', sortDescFirst: true },
  { id: 'otherSales', label: 'Card / Bank / Credit', value: (entry) => entry.cardSales + entry.bankTransferSales + entry.creditSales, cell: (entry) => `${money(entry.cardSales)} / ${money(entry.bankTransferSales)} / ${money(entry.creditSales)}`, align: 'right', sortDescFirst: true },
  { id: 'returns', label: 'Returns', value: (entry) => entry.returnsDiscounts, cell: (entry) => <span className="text-rose-200">{money(entry.returnsDiscounts)}</span>, align: 'right', sortDescFirst: true },
  { id: 'notes', label: 'Notes', value: (entry) => entry.notes, cell: (entry) => notesCell(entry.notes), sortable: false },
]

export function SalesLogTable({ entries }: { entries: DailySales[] }) {
  return (
    <ResponsiveLogTable
      columns={salesColumns}
      data={entries}
      emptyTitle="No sales found"
      getRowId={(entry) => entry.id}
      initialSortId="date"
      noun="sale"
      searchPlaceholder="Search date or notes"
      searchText={(entry) => [entry.date, formatDisplayDate(entry.date), entry.notes].join(' ')}
      mobileCard={(entry) => (
        <MobileLogCard title={money(entry.totalSales)} subtitle={formatDisplayDate(entry.date)}>
          <MobileValue label="Cash" value={money(entry.cashSales)} />
          <MobileValue label="UPI" value={money(entry.upiSales)} />
          <MobileValue label="Card / Bank" value={`${money(entry.cardSales)} / ${money(entry.bankTransferSales)}`} />
          <MobileValue label="Credit / Returns" value={`${money(entry.creditSales)} / ${money(entry.returnsDiscounts)}`} />
        </MobileLogCard>
      )}
    />
  )
}

const expenseColumns: LogTableColumn<Cashout>[] = [
  { id: 'date', label: 'Date', value: (entry) => entry.date, cell: (entry) => <span className="font-semibold">{formatDisplayDate(entry.date)}</span>, hideable: false, sortDescFirst: true },
  { id: 'paidTo', label: 'Paid to', value: (entry) => entry.paidTo, cell: (entry) => <span className="font-semibold">{entry.paidTo}</span> },
  { id: 'category', label: 'Category', value: (entry) => entry.category, cell: (entry) => entry.category },
  { id: 'amount', label: 'Amount', value: (entry) => entry.amount, cell: (entry) => <span className="font-semibold">{money(entry.amount)}</span>, align: 'right', sortDescFirst: true },
  { id: 'paymentMode', label: 'Mode', value: (entry) => entry.paymentMode, cell: (entry) => <Badge variant="outline">{entry.paymentMode}</Badge> },
  { id: 'approvedBy', label: 'Approved by', value: (entry) => entry.approvedBy, cell: (entry) => entry.approvedBy || '-' },
  { id: 'notes', label: 'Notes', value: (entry) => entry.notes, cell: (entry) => notesCell(entry.notes), sortable: false },
]

export function ExpenseLogTable({ entries }: { entries: Cashout[] }) {
  return (
    <ResponsiveLogTable
      columns={expenseColumns}
      data={entries}
      emptyTitle="No expenses found"
      getRowId={(entry) => entry.id}
      initialSortId="date"
      noun="expense"
      searchPlaceholder="Search paid to, category, mode or notes"
      searchText={(entry) => [entry.date, formatDisplayDate(entry.date), entry.paidTo, entry.category, entry.paymentMode, entry.approvedBy, entry.chequeNumber, entry.notes].join(' ')}
      mobileCard={(entry) => (
        <MobileLogCard title={entry.paidTo} subtitle={`${formatDisplayDate(entry.date)} | ${entry.category}`} trailing={<Badge variant="outline">{entry.paymentMode}</Badge>}>
          <MobileValue label="Amount" value={money(entry.amount)} />
          <MobileValue label="Approved by" value={entry.approvedBy || '-'} />
          <MobileValue label="Cheque" value={entry.chequeNumber || '-'} />
          <MobileValue label="Notes" value={entry.notes || '-'} />
        </MobileLogCard>
      )}
    />
  )
}

const purchaseColumns: LogTableColumn<Purchase>[] = [
  { id: 'date', label: 'Date', value: (entry) => entry.date, cell: (entry) => <span className="font-semibold">{formatDisplayDate(entry.date)}</span>, hideable: false, sortDescFirst: true },
  { id: 'supplier', label: 'Supplier', value: (entry) => entry.supplierName, cell: (entry) => <span className="font-semibold">{entry.supplierName}</span> },
  { id: 'bill', label: 'Bill', value: (entry) => entry.billNumber, cell: (entry) => entry.billNumber || '-' },
  { id: 'category', label: 'Category', value: (entry) => entry.category, cell: (entry) => entry.category },
  { id: 'total', label: 'Total', value: (entry) => entry.purchaseAmount, cell: (entry) => <span className="font-semibold">{money(entry.purchaseAmount)}</span>, align: 'right', sortDescFirst: true },
  { id: 'paid', label: 'Paid', value: (entry) => entry.paidAmount, cell: (entry) => money(entry.paidAmount), align: 'right', sortDescFirst: true },
  { id: 'unpaid', label: 'Unpaid', value: (entry) => entry.unpaidAmount, cell: (entry) => <span className={entry.unpaidAmount > 0 ? 'text-amber-200' : undefined}>{money(entry.unpaidAmount)}</span>, align: 'right', sortDescFirst: true },
  { id: 'mode', label: 'Mode', value: (entry) => entry.paymentMode, cell: (entry) => <Badge variant="outline">{entry.paymentMode}</Badge> },
]

export function PurchaseLogTable({ entries }: { entries: Purchase[] }) {
  return (
    <ResponsiveLogTable
      columns={purchaseColumns}
      data={entries}
      emptyTitle="No purchases found"
      getRowId={(entry) => entry.id}
      initialSortId="date"
      noun="purchase"
      searchPlaceholder="Search supplier, bill, category or notes"
      searchText={(entry) => [entry.date, formatDisplayDate(entry.date), entry.supplierName, entry.billNumber, entry.category, entry.paymentMode, entry.notes].join(' ')}
      mobileCard={(entry) => (
        <MobileLogCard title={entry.supplierName} subtitle={`${formatDisplayDate(entry.date)} | Bill ${entry.billNumber || '-'}`} trailing={<Badge variant="outline">{entry.paymentMode}</Badge>}>
          <MobileValue label="Total" value={money(entry.purchaseAmount)} />
          <MobileValue label="Category" value={entry.category} />
          <MobileValue label="Paid" value={money(entry.paidAmount)} />
          <MobileValue label="Unpaid" value={money(entry.unpaidAmount)} />
        </MobileLogCard>
      )}
    />
  )
}

const paymentColumns: LogTableColumn<Payment>[] = [
  { id: 'date', label: 'Date', value: (entry) => entry.date, cell: (entry) => <span className="font-semibold">{formatDisplayDate(entry.date)}</span>, hideable: false, sortDescFirst: true },
  { id: 'party', label: 'Party', value: (entry) => entry.partyName, cell: (entry) => <span className="font-semibold">{entry.partyName}</span> },
  { id: 'type', label: 'Type', value: (entry) => entry.type, cell: (entry) => <Badge variant={entry.type === 'Received' ? 'success' : 'secondary'}>{entry.type}</Badge> },
  { id: 'entryType', label: 'Entry', value: (entry) => entry.entryType ?? 'general', cell: (entry) => (entry.entryType ?? 'General').replace('-', ' ') },
  { id: 'amount', label: 'Amount', value: (entry) => entry.amount, cell: (entry) => <span className="font-semibold">{money(entry.amount)}</span>, align: 'right', sortDescFirst: true },
  { id: 'mode', label: 'Mode', value: (entry) => entry.paymentMode, cell: (entry) => <Badge variant="outline">{entry.paymentMode}</Badge> },
  { id: 'notes', label: 'Notes', value: (entry) => entry.notes, cell: (entry) => notesCell(entry.notes), sortable: false },
]

export function PaymentLogTable({ entries }: { entries: Payment[] }) {
  return (
    <ResponsiveLogTable
      columns={paymentColumns}
      data={entries}
      emptyTitle="No payments found"
      getRowId={(entry) => entry.id}
      initialSortId="date"
      noun="payment"
      searchPlaceholder="Search party, type, mode or notes"
      searchText={(entry) => [entry.date, formatDisplayDate(entry.date), entry.partyName, entry.type, entry.entryType ?? 'general', entry.paymentMode, entry.chequeNumber, entry.notes].join(' ')}
      mobileCard={(entry) => (
        <MobileLogCard title={entry.partyName} subtitle={formatDisplayDate(entry.date)} trailing={<Badge variant={entry.type === 'Received' ? 'success' : 'secondary'}>{entry.type}</Badge>}>
          <MobileValue label="Amount" value={money(entry.amount)} />
          <MobileValue label="Mode" value={entry.paymentMode} />
          <MobileValue label="Entry" value={(entry.entryType ?? 'General').replace('-', ' ')} />
          <MobileValue label="Notes" value={entry.notes || '-'} />
        </MobileLogCard>
      )}
    />
  )
}

function LoanActions({ entry, onDelete }: { entry: LoanEntry; onDelete: (entry: LoanEntry) => Promise<void> | void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label={`Actions for ${entry.personName}`}><Ellipsis className="h-4 w-4" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Loan actions</DropdownMenuLabel>
        <DropdownMenuItem className="text-rose-300 focus:bg-rose-500/10 focus:text-rose-200" onSelect={() => void onDelete(entry)}>Delete loan</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function LoanLogTable({ entries, onDelete }: { entries: LoanEntry[]; onDelete: (entry: LoanEntry) => Promise<void> | void }) {
  const columns = useMemo<LogTableColumn<LoanEntry>[]>(() => [
    { id: 'date', label: 'Loan date', value: (entry) => entry.date, cell: (entry) => <span className="font-semibold">{formatDisplayDate(entry.date)}</span>, hideable: false, sortDescFirst: true },
    { id: 'person', label: 'Person', value: (entry) => entry.personName, cell: (entry) => <span className="font-semibold">{entry.personName}</span> },
    { id: 'payoff', label: 'Payoff date', value: (entry) => entry.promisedPayoffDate, cell: (entry) => formatDisplayDate(entry.promisedPayoffDate) },
    { id: 'original', label: 'Original', value: (entry) => entry.amount, cell: (entry) => money(entry.amount), align: 'right', sortDescFirst: true },
    { id: 'paid', label: 'Paid', value: (entry) => entry.paidAmount, cell: (entry) => money(entry.paidAmount), align: 'right', sortDescFirst: true },
    { id: 'remaining', label: 'Remaining', value: (entry) => entry.remainingAmount, cell: (entry) => <span className="font-semibold">{money(entry.remainingAmount)}</span>, align: 'right', sortDescFirst: true },
    { id: 'status', label: 'Status', value: (entry) => entry.status, cell: (entry) => <Badge variant={entry.status === 'Settled' ? 'success' : 'warning'}>{entry.status}</Badge> },
    { id: 'actions', label: 'Actions', value: () => '', cell: (entry) => <LoanActions entry={entry} onDelete={onDelete} />, align: 'right', hideable: false, sortable: false },
  ], [onDelete])

  return (
    <ResponsiveLogTable
      columns={columns}
      data={entries}
      emptyTitle="No loans found"
      getRowId={(entry) => entry.id}
      initialSortId="date"
      noun="loan"
      searchPlaceholder="Search person, status, date or notes"
      searchText={(entry) => [entry.date, formatDisplayDate(entry.date), entry.personName, entry.status, entry.promisedPayoffDate, entry.notes].join(' ')}
      mobileCard={(entry) => (
        <MobileLogCard title={entry.personName} subtitle={`Loan date ${formatDisplayDate(entry.date)}`} trailing={<LoanActions entry={entry} onDelete={onDelete} />}>
          <MobileValue label="Original" value={money(entry.amount)} />
          <MobileValue label="Status" value={<Badge variant={entry.status === 'Settled' ? 'success' : 'warning'}>{entry.status}</Badge>} />
          <MobileValue label="Paid" value={money(entry.paidAmount)} />
          <MobileValue label="Remaining" value={money(entry.remainingAmount)} />
        </MobileLogCard>
      )}
    />
  )
}

type TransferLogTableProps = {
  entries: CashTransfer[]
  partyName: (entry: CashTransfer, side: 'from' | 'to') => string
}

export function TransferLogTable({ entries, partyName }: TransferLogTableProps) {
  const columns = useMemo<LogTableColumn<CashTransfer>[]>(() => [
    { id: 'date', label: 'Date', value: (entry) => entry.date, cell: (entry) => <span className="font-semibold">{formatDisplayDate(entry.date)}</span>, hideable: false, sortDescFirst: true },
    { id: 'from', label: 'From', value: (entry) => partyName(entry, 'from'), cell: (entry) => partyName(entry, 'from') },
    { id: 'to', label: 'To', value: (entry) => partyName(entry, 'to'), cell: (entry) => <span className="font-semibold">{partyName(entry, 'to')}</span> },
    { id: 'amount', label: 'Amount', value: (entry) => entry.amount, cell: (entry) => <span className="font-semibold">{money(entry.amount)}</span>, align: 'right', sortDescFirst: true },
    { id: 'reason', label: 'Reason', value: (entry) => entry.reason, cell: (entry) => notesCell(entry.reason), sortable: false },
    { id: 'createdBy', label: 'Recorded by', value: (entry) => entry.createdBy, cell: (entry) => <span>{entry.createdBy}<span className="block text-[10px] text-muted-foreground">{formatDisplayTime(entry.createdAt)}</span></span> },
  ], [partyName])

  return (
    <ResponsiveLogTable
      columns={columns}
      data={entries}
      emptyTitle="No cash transfers found"
      getRowId={(entry) => entry.id}
      initialSortId="date"
      noun="transfer"
      searchPlaceholder="Search names, destination, reason or recorder"
      searchText={(entry) => [entry.date, formatDisplayDate(entry.date), partyName(entry, 'from'), partyName(entry, 'to'), entry.reason, entry.createdBy].join(' ')}
      mobileCard={(entry) => (
        <MobileLogCard title={money(entry.amount)} subtitle={formatDisplayDate(entry.date)}>
          <MobileValue label="From" value={partyName(entry, 'from')} />
          <MobileValue label="To" value={partyName(entry, 'to')} />
          <MobileValue label="Reason" value={entry.reason} />
          <MobileValue label="Recorded by" value={entry.createdBy} />
        </MobileLogCard>
      )}
    />
  )
}

const auditColumns: LogTableColumn<SettingsAuditEntry>[] = [
  { id: 'createdAt', label: 'Date and time', value: (entry) => entry.createdAt, cell: (entry) => <span className="font-semibold">{formatDisplayDateTime(entry.createdAt)}</span>, hideable: false, sortDescFirst: true },
  { id: 'actor', label: 'Actor', value: (entry) => entry.actor, cell: (entry) => <span className="font-semibold">{entry.actor}</span> },
  { id: 'action', label: 'Action', value: (entry) => entry.action, cell: (entry) => entry.action, sortable: false },
]

export function AuditLogTable({ entries, hasMore, onLoadMore }: { entries: SettingsAuditEntry[]; hasMore: boolean; onLoadMore: () => void }) {
  return (
    <ResponsiveLogTable
      columns={auditColumns}
      data={entries}
      emptyTitle="No settings activity found"
      getRowId={(entry) => entry.id}
      hasMore={hasMore}
      initialSortId="createdAt"
      noun="audit entry"
      onLoadMore={onLoadMore}
      searchPlaceholder="Search actor or action"
      searchText={(entry) => [entry.createdAt, formatDisplayDateTime(entry.createdAt), entry.actor, entry.action].join(' ')}
      mobileCard={(entry) => (
        <MobileLogCard title={entry.actor} subtitle={formatDisplayDateTime(entry.createdAt)}>
          <div className="col-span-2"><MobileValue label="Action" value={entry.action} /></div>
        </MobileLogCard>
      )}
    />
  )
}
