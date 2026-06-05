import { useMemo, useState } from 'react'
import type { Cashout, DailySales, Payment, Purchase } from '@/domain/financeTypes'
import type { CashTransfer, DailyCashoutEntry, LoanEntry, SettingsAuditEntry, UserAccount } from '@/domain/appTypes'
import { formatDisplayDate, formatDisplayDateTime, formatDisplayTime, legacyCashHolderLabel, money, userNameById } from '@/app/uiHelpers'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { DailyCashoutDetailsModal } from '@/features/cashout/components/DailyCashoutDetailsModal'
import { FieldLabel } from '@/shared/ui/field-label'
import { Input } from '@/shared/ui/input'
import { SectionHeading } from '@/shared/ui/section-heading'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs'

type LogsPageProps = {
  sales: DailySales[]
  expenses: Cashout[]
  purchases: Purchase[]
  payments: Payment[]
  loans: LoanEntry[]
  dailyCashouts: DailyCashoutEntry[]
  cashTransfers: CashTransfer[]
  settingsAuditLog: SettingsAuditEntry[]
  users: UserAccount[]
  onDeleteLoan: (loan: LoanEntry) => Promise<void> | void
}

type LogCardProps = {
  eyebrow: string
  title: string
  children: React.ReactNode
}

type FilterBarProps = {
  dateValue?: string
  onDateChange?: (value: string) => void
  searchValue?: string
  searchPlaceholder?: string
  onSearchChange?: (value: string) => void
}

function LogCard({ eyebrow, title, children }: LogCardProps) {
  return (
    <Card className="flex flex-col xl:h-full xl:min-h-0">
      <CardHeader className="pb-2.5">
        <SectionHeading eyebrow={eyebrow} title={title} />
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3 xl:min-h-0 xl:overflow-hidden">{children}</CardContent>
    </Card>
  )
}

function FilterBar({ dateValue, onDateChange, searchValue, searchPlaceholder, onSearchChange }: FilterBarProps) {
  if (!onDateChange && !onSearchChange) return null
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {onDateChange ? (
        <FieldLabel label="Date">
          <div className="space-y-1">
            <Input type="date" value={dateValue} onChange={(event) => onDateChange(event.target.value)} />
            {dateValue ? <p className="text-[11px] font-semibold text-muted-foreground">Showing: {formatDisplayDate(dateValue)}</p> : null}
          </div>
        </FieldLabel>
      ) : (
        <div />
      )}
      {onSearchChange ? (
        <FieldLabel label="Search">
          <Input value={searchValue} placeholder={searchPlaceholder} onChange={(event) => onSearchChange(event.target.value)} />
        </FieldLabel>
      ) : null}
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return <p className="text-sm font-medium text-muted-foreground">{message}</p>
}

function compareDateDesc(left: string, right: string) {
  return right.localeCompare(left)
}

function compareTimestampDesc(left?: string, right?: string) {
  return (right ?? '').localeCompare(left ?? '')
}

function ChequeMeta({
  paymentMode,
  chequeNumber,
  chequePayDate,
}: {
  paymentMode: string
  chequeNumber?: string
  chequePayDate?: string
}) {
  if (paymentMode !== 'Cheque' || (!chequeNumber && !chequePayDate)) return null
  return (
    <p className="text-muted-foreground">
      Cheque {chequeNumber || '-'} | Pay Date {chequePayDate ? formatDisplayDate(chequePayDate) : '-'}
    </p>
  )
}

function LogEntryCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[16px] border border-border/70 bg-secondary/55 p-3.5 text-sm text-foreground">{children}</div>
}

export function LogsPage({
  sales,
  expenses,
  purchases,
  payments,
  loans,
  dailyCashouts,
  cashTransfers,
  settingsAuditLog,
  users,
  onDeleteLoan,
}: LogsPageProps) {
  const [salesDate, setSalesDate] = useState('')
  const [expenseDate, setExpenseDate] = useState('')
  const [expenseSearch, setExpenseSearch] = useState('')
  const [purchaseDate, setPurchaseDate] = useState('')
  const [purchaseSearch, setPurchaseSearch] = useState('')
  const [paymentDate, setPaymentDate] = useState('')
  const [paymentSearch, setPaymentSearch] = useState('')
  const [loanSearch, setLoanSearch] = useState('')
  const [cashoutDate, setCashoutDate] = useState('')
  const [cashoutSearch, setCashoutSearch] = useState('')
  const [selectedCashout, setSelectedCashout] = useState<DailyCashoutEntry | null>(null)
  const [transferDate, setTransferDate] = useState('')
  const [transferSearch, setTransferSearch] = useState('')
  const [auditSearch, setAuditSearch] = useState('')
  const userNames = useMemo(() => userNameById(users), [users])

  function transferPartyName(entry: CashTransfer, side: 'from' | 'to') {
    if (side === 'from') {
      if (entry.fromUserId && userNames.has(entry.fromUserId)) return userNames.get(entry.fromUserId) ?? 'Unknown User'
      return legacyCashHolderLabel(entry.from)
    }

    if (entry.toType === 'bank') return 'Bank'
    if (entry.toUserId && userNames.has(entry.toUserId)) return userNames.get(entry.toUserId) ?? 'Unknown User'
    return legacyCashHolderLabel(entry.toPerson)
  }

  const filteredSales = useMemo(
    () =>
      sales
        .filter((entry) => !salesDate || entry.date === salesDate)
        .sort((left, right) => compareDateDesc(left.date, right.date) || compareTimestampDesc(left.createdAt, right.createdAt)),
    [sales, salesDate],
  )

  const filteredExpenses = useMemo(() => {
    const query = expenseSearch.trim().toLowerCase()
    return expenses
      .filter((entry) => {
        const dateMatch = !expenseDate || entry.date === expenseDate
        const searchMatch =
          !query ||
          entry.paidTo.toLowerCase().includes(query) ||
          entry.category.toLowerCase().includes(query) ||
          entry.notes.toLowerCase().includes(query)
        return dateMatch && searchMatch
      })
      .sort((left, right) => compareDateDesc(left.date, right.date) || compareTimestampDesc(left.createdAt, right.createdAt))
  }, [expenseDate, expenseSearch, expenses])

  const filteredPurchases = useMemo(() => {
    const query = purchaseSearch.trim().toLowerCase()
    return purchases
      .filter((entry) => {
        const dateMatch = !purchaseDate || entry.date === purchaseDate
        const searchMatch =
          !query ||
          entry.supplierName.toLowerCase().includes(query) ||
          entry.billNumber.toLowerCase().includes(query) ||
          entry.category.toLowerCase().includes(query) ||
          entry.notes.toLowerCase().includes(query)
        return dateMatch && searchMatch
      })
      .sort((left, right) => compareDateDesc(left.date, right.date) || compareTimestampDesc(left.createdAt, right.createdAt))
  }, [purchaseDate, purchaseSearch, purchases])

  const filteredPayments = useMemo(() => {
    const query = paymentSearch.trim().toLowerCase()
    return payments
      .filter((entry) => {
        const dateMatch = !paymentDate || entry.date === paymentDate
        const entryType = entry.entryType ?? 'general'
        const searchMatch =
          !query ||
          entry.partyName.toLowerCase().includes(query) ||
          entry.type.toLowerCase().includes(query) ||
          entryType.toLowerCase().includes(query) ||
          entry.notes.toLowerCase().includes(query)
        return dateMatch && searchMatch
      })
      .sort((left, right) => compareDateDesc(left.date, right.date) || compareTimestampDesc(left.createdAt, right.createdAt))
  }, [paymentDate, paymentSearch, payments])

  const filteredLoans = useMemo(() => {
    const query = loanSearch.trim().toLowerCase()
    return loans
      .filter((entry) => !query || entry.personName.toLowerCase().includes(query) || entry.status.toLowerCase().includes(query))
      .sort((left, right) => compareDateDesc(left.date, right.date) || compareTimestampDesc(left.createdAt, right.createdAt))
  }, [loanSearch, loans])

  const filteredDailyCashouts = useMemo(() => {
    const query = cashoutSearch.trim().toLowerCase()
    return dailyCashouts
      .filter((entry) => {
        const dateMatch = !cashoutDate || entry.date === cashoutDate
        const searchMatch =
          !query ||
          entry.recordedBy.toLowerCase().includes(query) ||
          (entry.auditStatus ?? '').toLowerCase().includes(query) ||
          entry.actualCashParticulars.toLowerCase().includes(query)
        return dateMatch && searchMatch
      })
      .sort((left, right) => compareDateDesc(left.date, right.date) || compareTimestampDesc(left.createdAt, right.createdAt))
  }, [cashoutDate, cashoutSearch, dailyCashouts])

  const filteredTransfers = useMemo(() => {
    const query = transferSearch.trim().toLowerCase()
    return cashTransfers
      .filter((entry) => {
        const dateMatch = !transferDate || entry.date === transferDate
        const source = entry.fromUserId && userNames.has(entry.fromUserId)
          ? userNames.get(entry.fromUserId) ?? 'Unknown User'
          : legacyCashHolderLabel(entry.from)
        const destination =
          entry.toType === 'bank'
            ? 'Bank'
            : entry.toUserId && userNames.has(entry.toUserId)
              ? userNames.get(entry.toUserId) ?? 'Unknown User'
              : legacyCashHolderLabel(entry.toPerson)
        const searchMatch =
          !query ||
          source.toLowerCase().includes(query) ||
          destination.toLowerCase().includes(query) ||
          entry.reason.toLowerCase().includes(query) ||
          entry.createdBy.toLowerCase().includes(query)
        return dateMatch && searchMatch
      })
      .sort((left, right) => compareDateDesc(left.date, right.date) || compareTimestampDesc(left.createdAt, right.createdAt))
  }, [cashTransfers, transferDate, transferSearch, userNames])

  const filteredAudit = useMemo(() => {
    const query = auditSearch.trim().toLowerCase()
    return settingsAuditLog
      .filter((entry) => !query || entry.actor.toLowerCase().includes(query) || entry.action.toLowerCase().includes(query))
      .sort((left, right) => compareTimestampDesc(left.createdAt, right.createdAt))
  }, [auditSearch, settingsAuditLog])

  return (
    <section className="grid gap-3 xl:min-h-0 xl:overflow-hidden">
      <Tabs defaultValue="sales" className="grid gap-2.5 xl:min-h-0 xl:flex-1 xl:grid-rows-[auto_minmax(0,1fr)] xl:overflow-hidden">
        <TabsList className="min-h-11 grid-cols-8">
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="purchases">Purchases</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="loans">Loans</TabsTrigger>
          <TabsTrigger value="dailyCashouts">Daily Cashouts</TabsTrigger>
          <TabsTrigger value="cashTransfers">Cash Transfers</TabsTrigger>
          <TabsTrigger value="settingsAudit">Settings Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="min-h-0">
          <LogCard eyebrow="Logs" title="Sales">
            <FilterBar dateValue={salesDate} onDateChange={setSalesDate} />
            <div className="space-y-2.5 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
              {filteredSales.length === 0 ? <EmptyState message="No sales recorded yet." /> : null}
              {filteredSales.map((entry) => (
                <LogEntryCard key={entry.id}>
                  <p className="font-bold">{formatDisplayDate(entry.date)} | {money(entry.totalSales)}</p>
                  <p className="text-muted-foreground">
                    Cash {money(entry.cashSales)} | UPI {money(entry.upiSales)} | Card {money(entry.cardSales)} | Bank {money(entry.bankTransferSales)} | Credit {money(entry.creditSales)}
                  </p>
                  <p className="text-muted-foreground">Returns {money(entry.returnsDiscounts)}</p>
                  {entry.notes ? <p className="text-muted-foreground">{entry.notes}</p> : null}
                </LogEntryCard>
              ))}
            </div>
          </LogCard>
        </TabsContent>

        <TabsContent value="expenses" className="min-h-0">
          <LogCard eyebrow="Logs" title="Expenses">
            <FilterBar dateValue={expenseDate} onDateChange={setExpenseDate} searchValue={expenseSearch} onSearchChange={setExpenseSearch} searchPlaceholder="Paid to, category, notes" />
            <div className="space-y-2.5 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
              {filteredExpenses.length === 0 ? <EmptyState message="No expenses recorded yet." /> : null}
              {filteredExpenses.map((entry) => (
                <LogEntryCard key={entry.id}>
                  <p className="font-bold">{entry.paidTo} | {money(entry.amount)}</p>
                  <p className="text-muted-foreground">{formatDisplayDate(entry.date)} | {entry.category} | {entry.paymentMode}</p>
                  <ChequeMeta paymentMode={entry.paymentMode} chequeNumber={entry.chequeNumber} chequePayDate={entry.chequePayDate} />
                  {entry.notes ? <p className="text-muted-foreground">{entry.notes}</p> : null}
                </LogEntryCard>
              ))}
            </div>
          </LogCard>
        </TabsContent>

        <TabsContent value="purchases" className="min-h-0">
          <LogCard eyebrow="Logs" title="Purchases">
            <FilterBar dateValue={purchaseDate} onDateChange={setPurchaseDate} searchValue={purchaseSearch} onSearchChange={setPurchaseSearch} searchPlaceholder="Vendor, bill number, category" />
            <div className="space-y-2.5 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
              {filteredPurchases.length === 0 ? <EmptyState message="No purchases recorded yet." /> : null}
              {filteredPurchases.map((entry) => (
                <LogEntryCard key={entry.id}>
                  <p className="font-bold">{entry.supplierName} | Bill {entry.billNumber || '-'}</p>
                  <p className="text-muted-foreground">{formatDisplayDate(entry.date)} | {entry.category} | {entry.paymentMode}</p>
                  <p className="text-muted-foreground">Total {money(entry.purchaseAmount)} | Paid {money(entry.paidAmount)} | Unpaid {money(entry.unpaidAmount)}</p>
                  {entry.notes ? <p className="text-muted-foreground">{entry.notes}</p> : null}
                </LogEntryCard>
              ))}
            </div>
          </LogCard>
        </TabsContent>

        <TabsContent value="payments" className="min-h-0">
          <LogCard eyebrow="Logs" title="Payments">
            <FilterBar dateValue={paymentDate} onDateChange={setPaymentDate} searchValue={paymentSearch} onSearchChange={setPaymentSearch} searchPlaceholder="Party, type, notes" />
            <div className="space-y-2.5 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
              {filteredPayments.length === 0 ? <EmptyState message="No payments recorded yet." /> : null}
              {filteredPayments.map((entry) => (
                <LogEntryCard key={entry.id}>
                  <p className="font-bold">{entry.partyName} | {money(entry.amount)}</p>
                  <p className="text-muted-foreground">
                    {formatDisplayDate(entry.date)} | {entry.type} | {(entry.entryType ?? 'General').replace('-', ' ')} | {entry.paymentMode}
                  </p>
                  <ChequeMeta paymentMode={entry.paymentMode} chequeNumber={entry.chequeNumber} chequePayDate={entry.chequePayDate} />
                  {entry.notes ? <p className="text-muted-foreground">{entry.notes}</p> : null}
                </LogEntryCard>
              ))}
            </div>
          </LogCard>
        </TabsContent>

        <TabsContent value="loans" className="min-h-0">
          <LogCard eyebrow="Logs" title="Loans">
            <FilterBar searchValue={loanSearch} onSearchChange={setLoanSearch} searchPlaceholder="Person or status" />
            <div className="space-y-2.5 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
              {filteredLoans.length === 0 ? <EmptyState message="No loans recorded yet." /> : null}
              {filteredLoans.map((entry) => (
                <LogEntryCard key={entry.id}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-2">
                      <p className="font-bold">{entry.personName}</p>
                      <p className="text-muted-foreground">Status {entry.status}</p>
                    </div>
                    <Button type="button" variant="destructive" size="sm" onClick={() => void onDeleteLoan(entry)}>
                      Delete Loan
                    </Button>
                  </div>
                  <div className="grid gap-2 text-muted-foreground md:grid-cols-2 xl:grid-cols-3">
                    <p>Loan Date {formatDisplayDate(entry.date)}</p>
                    <p>Payoff Date {formatDisplayDate(entry.promisedPayoffDate)}</p>
                    <p>Settled At {entry.settledAt ? formatDisplayDateTime(entry.settledAt) : '-'}</p>
                    <p>Original {money(entry.amount)}</p>
                    <p>Paid {money(entry.paidAmount)}</p>
                    <p>Remaining {money(entry.remainingAmount)}</p>
                  </div>
                </LogEntryCard>
              ))}
            </div>
          </LogCard>
        </TabsContent>

        <TabsContent value="dailyCashouts" className="min-h-0">
          <LogCard eyebrow="Logs" title="Daily Cashouts">
            <FilterBar dateValue={cashoutDate} onDateChange={setCashoutDate} searchValue={cashoutSearch} onSearchChange={setCashoutSearch} searchPlaceholder="Recorded by or audit status" />
            <div className="space-y-2.5 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
              {filteredDailyCashouts.length === 0 ? <EmptyState message="No daily cashouts recorded yet." /> : null}
              {filteredDailyCashouts.map((entry) => {
                const drawerTotal = entry.drawerTotal ?? entry.remainingBalance
                return (
                  <LogEntryCard key={entry.id}>
                  <p className="font-bold">{formatDisplayDate(entry.date)} | {entry.recordedBy}</p>
                  {entry.recordedByUserId ? <p className="text-muted-foreground">User ID linked to current account</p> : <p className="text-muted-foreground">Legacy cashout without user identity</p>}
                  <p className="text-muted-foreground">Cash {money(entry.cashSales)} | UPI {money(entry.upiSales)} | Credit {money(entry.creditSales)} | Drawer {money(drawerTotal)}</p>
                  <p className="text-muted-foreground">Audit {entry.auditStatus ?? 'matched'} | Created {formatDisplayDateTime(entry.createdAt)}</p>
                    <button
                      className="mt-2.5 text-sm font-semibold text-primary transition-colors hover:text-primary/80"
                      onClick={() => setSelectedCashout(entry)}
                      type="button"
                    >
                      View Complete Cashout
                    </button>
                  </LogEntryCard>
                )
              })}
            </div>
            <DailyCashoutDetailsModal entry={selectedCashout} onClose={() => setSelectedCashout(null)} />
          </LogCard>
        </TabsContent>

        <TabsContent value="cashTransfers" className="min-h-0">
          <LogCard eyebrow="Logs" title="Cash Transfers">
            <FilterBar dateValue={transferDate} onDateChange={setTransferDate} searchValue={transferSearch} onSearchChange={setTransferSearch} searchPlaceholder="From, destination, reason" />
            <div className="space-y-2.5 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
              {filteredTransfers.length === 0 ? <EmptyState message="No cash transfers recorded yet." /> : null}
              {filteredTransfers.map((entry) => (
                <LogEntryCard key={entry.id}>
                  <p className="font-bold">
                    {formatDisplayDate(entry.date)} | {transferPartyName(entry, 'from')} to {transferPartyName(entry, 'to')}
                  </p>
                  <p className="text-muted-foreground">
                    {money(entry.amount)} | {entry.reason} | Cash Movement
                  </p>
                  <p className="text-muted-foreground">By {entry.createdBy} at {formatDisplayTime(entry.createdAt)}</p>
                </LogEntryCard>
              ))}
            </div>
          </LogCard>
        </TabsContent>

        <TabsContent value="settingsAudit" className="min-h-0">
          <LogCard eyebrow="Logs" title="Settings Audit">
            <FilterBar searchValue={auditSearch} onSearchChange={setAuditSearch} searchPlaceholder="Actor or action" />
            <div className="space-y-2.5 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
              {filteredAudit.length === 0 ? <EmptyState message="No settings activity recorded yet." /> : null}
              {filteredAudit.map((entry) => (
                <LogEntryCard key={entry.id}>
                  {formatDisplayDateTime(entry.createdAt)} | {entry.actor} | {entry.action}
                </LogEntryCard>
              ))}
            </div>
          </LogCard>
        </TabsContent>
      </Tabs>
    </section>
  )
}

