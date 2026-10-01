import { useEffect, useMemo, useState } from 'react'
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import type { Cashout, DailySales, Payment, Purchase } from '@/domain/financeTypes'
import type { CashoutCorrectionRequest, CashoutCorrectionValues, CashTransfer, DailyCashoutEntry, LoanEntry, SettingsAuditEntry, UserAccount } from '@/domain/appTypes'
import { formatDisplayDate, formatDisplayDateTime, formatDisplayTime, legacyCashHolderLabel, money, shiftDate, userNameById } from '@/app/uiHelpers'
import { db } from '@/shared/lib/firebase'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { DailyCashoutLogTab } from '@/features/logs/components/DailyCashoutLogTab'
import { FieldLabel } from '@/shared/ui/field-label'
import { Input } from '@/shared/ui/input'
import { NativeSelect } from '@/shared/ui/native-select'
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
  cashoutCorrectionRequests: CashoutCorrectionRequest[]
  settingsAuditLog: SettingsAuditEntry[]
  users: UserAccount[]
  onDeleteLoan: (loan: LoanEntry) => Promise<void> | void
  onDeleteDailyCashout: (entry: DailyCashoutEntry) => Promise<void> | void
  onEditDailyCashout: (entry: DailyCashoutEntry, values: CashoutCorrectionValues, reason: string) => Promise<void> | void
}

type LogCardProps = {
  eyebrow: string
  title: string
  children: React.ReactNode
}

type FilterBarProps = {
  searchValue?: string
  searchPlaceholder?: string
  onSearchChange?: (value: string) => void
}

function LogCard({ eyebrow, title, children }: LogCardProps) {
  return (
    <Card className="flex flex-col xl:h-full xl:min-h-0">
      <CardHeader className="pb-3">
        <SectionHeading eyebrow={eyebrow} title={title} />
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-2.5 xl:min-h-0 xl:overflow-hidden">{children}</CardContent>
    </Card>
  )
}

function FilterBar({ searchValue, searchPlaceholder, onSearchChange }: FilterBarProps) {
  if (!onSearchChange) return null
  return (
    <FieldLabel label="Search">
      <Input value={searchValue} placeholder={searchPlaceholder} onChange={(event) => onSearchChange(event.target.value)} />
    </FieldLabel>
  )
}

type LogRangePreset = '7' | '15' | '30' | '90' | 'custom'

function LoadMoreButton({ shown, total, onClick }: { shown: number; total: number; onClick: () => void }) {
  if (shown >= total) return null
  return <Button type="button" variant="outline" className="w-full" onClick={onClick}>Load more ({total - shown} remaining)</Button>
}

function EmptyState({ message }: { message: string }) {
  return <p className="text-[12px] font-medium text-muted-foreground">{message}</p>
}

function compareDateDesc(left: string, right: string) {
  return right.localeCompare(left)
}

function compareTimestampDesc(left?: string, right?: string) {
  return (right ?? '').localeCompare(left ?? '')
}

function isDateWithinRange(value: string, start: string, end: string) {
  const date = value.slice(0, 10)
  return date >= start && date <= end
}

function indiaDateKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).formatToParts(value)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function indiaBoundaryIso(date: string, boundary: 'start' | 'end') {
  return new Date(`${date}T${boundary === 'start' ? '00:00:00.000' : '23:59:59.999'}+05:30`).toISOString()
}

function isTimestampWithinIndiaRange(value: string, start: string, end: string) {
  return isDateWithinRange(indiaDateKey(new Date(value)), start, end)
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
  return <div className="rounded-[14px] border border-border/70 bg-[linear-gradient(180deg,rgba(16,40,61,0.96),rgba(9,29,47,0.94))] p-2.5 text-[12px] text-foreground shadow-[0_10px_22px_rgba(1,10,20,0.24)]">{children}</div>
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" variant="destructive" size="sm" onClick={onClick}>
      Delete
    </Button>
  )
}

export function LogsPage({
  sales,
  expenses,
  purchases,
  payments,
  loans,
  dailyCashouts,
  cashTransfers,
  cashoutCorrectionRequests,
  settingsAuditLog,
  users,
  onDeleteLoan,
  onDeleteDailyCashout,
  onEditDailyCashout,
}: LogsPageProps) {
  const [activeTab, setActiveTab] = useState('sales')
  const [rangePreset, setRangePreset] = useState<LogRangePreset>('7')
  const [customStart, setCustomStart] = useState(indiaDateKey())
  const [customEnd, setCustomEnd] = useState(indiaDateKey())
  const [visibleCount, setVisibleCount] = useState(50)
  const [expenseSearch, setExpenseSearch] = useState('')
  const [purchaseSearch, setPurchaseSearch] = useState('')
  const [paymentSearch, setPaymentSearch] = useState('')
  const [loanSearch, setLoanSearch] = useState('')
  const [transferSearch, setTransferSearch] = useState('')
  const [auditSearch, setAuditSearch] = useState('')
  const [boundedAuditLog, setBoundedAuditLog] = useState(settingsAuditLog)
  const userNames = useMemo(() => userNameById(users), [users])
  const rangeEnd = rangePreset === 'custom' ? customEnd : indiaDateKey()
  const rangeStart = rangePreset === 'custom' ? customStart : shiftDate(rangeEnd, -(Number(rangePreset) - 1))
  const validRangeStart = rangeStart <= rangeEnd ? rangeStart : rangeEnd
  const validRangeEnd = rangeStart <= rangeEnd ? rangeEnd : rangeStart

  function resetResults() {
    setVisibleCount(50)
  }

  useEffect(() => {
    if (activeTab !== 'settingsAudit') return

    const auditQuery = query(
      collection(db, 'settingsAudit'),
      where('createdAt', '>=', indiaBoundaryIso(validRangeStart, 'start')),
      where('createdAt', '<=', indiaBoundaryIso(validRangeEnd, 'end')),
      orderBy('createdAt', 'desc'),
      limit(visibleCount),
    )
    return onSnapshot(
      auditQuery,
      (snapshot) => setBoundedAuditLog(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<SettingsAuditEntry, 'id'>) }))),
      () => setBoundedAuditLog(settingsAuditLog.filter((entry) => isTimestampWithinIndiaRange(entry.createdAt, validRangeStart, validRangeEnd)).slice(0, visibleCount)),
    )
  }, [activeTab, settingsAuditLog, validRangeEnd, validRangeStart, visibleCount])

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
        .filter((entry) => isDateWithinRange(entry.date, validRangeStart, validRangeEnd))
        .sort((left, right) => compareDateDesc(left.date, right.date) || compareTimestampDesc(left.createdAt, right.createdAt)),
    [sales, validRangeEnd, validRangeStart],
  )

  const filteredExpenses = useMemo(() => {
    const query = expenseSearch.trim().toLowerCase()
    return expenses
      .filter((entry) => {
        const searchMatch =
          !query ||
          entry.paidTo.toLowerCase().includes(query) ||
          entry.category.toLowerCase().includes(query) ||
          entry.notes.toLowerCase().includes(query)
        return isDateWithinRange(entry.date, validRangeStart, validRangeEnd) && searchMatch
      })
      .sort((left, right) => compareDateDesc(left.date, right.date) || compareTimestampDesc(left.createdAt, right.createdAt))
  }, [expenseSearch, expenses, validRangeEnd, validRangeStart])

  const filteredPurchases = useMemo(() => {
    const query = purchaseSearch.trim().toLowerCase()
    return purchases
      .filter((entry) => {
        const searchMatch =
          !query ||
          entry.supplierName.toLowerCase().includes(query) ||
          entry.billNumber.toLowerCase().includes(query) ||
          entry.category.toLowerCase().includes(query) ||
          entry.notes.toLowerCase().includes(query)
        return isDateWithinRange(entry.date, validRangeStart, validRangeEnd) && searchMatch
      })
      .sort((left, right) => compareDateDesc(left.date, right.date) || compareTimestampDesc(left.createdAt, right.createdAt))
  }, [purchaseSearch, purchases, validRangeEnd, validRangeStart])

  const filteredPayments = useMemo(() => {
    const query = paymentSearch.trim().toLowerCase()
    return payments
      .filter((entry) => {
        const entryType = entry.entryType ?? 'general'
        const searchMatch =
          !query ||
          entry.partyName.toLowerCase().includes(query) ||
          entry.type.toLowerCase().includes(query) ||
          entryType.toLowerCase().includes(query) ||
          entry.notes.toLowerCase().includes(query)
        return isDateWithinRange(entry.date, validRangeStart, validRangeEnd) && searchMatch
      })
      .sort((left, right) => compareDateDesc(left.date, right.date) || compareTimestampDesc(left.createdAt, right.createdAt))
  }, [paymentSearch, payments, validRangeEnd, validRangeStart])

  const filteredLoans = useMemo(() => {
    const query = loanSearch.trim().toLowerCase()
    return loans
      .filter((entry) => isDateWithinRange(entry.date, validRangeStart, validRangeEnd) && (!query || entry.personName.toLowerCase().includes(query) || entry.status.toLowerCase().includes(query)))
      .sort((left, right) => compareDateDesc(left.date, right.date) || compareTimestampDesc(left.createdAt, right.createdAt))
  }, [loanSearch, loans, validRangeEnd, validRangeStart])


  const filteredTransfers = useMemo(() => {
    const query = transferSearch.trim().toLowerCase()
    return cashTransfers
      .filter((entry) => {
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
        return isDateWithinRange(entry.date, validRangeStart, validRangeEnd) && searchMatch
      })
      .sort((left, right) => compareDateDesc(left.date, right.date) || compareTimestampDesc(left.createdAt, right.createdAt))
  }, [cashTransfers, transferSearch, userNames, validRangeEnd, validRangeStart])

  const filteredDailyCashouts = useMemo(
    () => dailyCashouts.filter((entry) => isDateWithinRange(entry.date, validRangeStart, validRangeEnd)),
    [dailyCashouts, validRangeEnd, validRangeStart],
  )

  const rangedCorrectionRequests = useMemo(
    () => cashoutCorrectionRequests.filter((entry) => entry.status !== 'pending' && isDateWithinRange(entry.createdAt, validRangeStart, validRangeEnd)),
    [cashoutCorrectionRequests, validRangeEnd, validRangeStart],
  )

  const filteredAudit = useMemo(() => {
    const query = auditSearch.trim().toLowerCase()
    return boundedAuditLog
      .filter((entry) => !query || entry.actor.toLowerCase().includes(query) || entry.action.toLowerCase().includes(query))
      .sort((left, right) => compareTimestampDesc(left.createdAt, right.createdAt))
  }, [auditSearch, boundedAuditLog])

  const activeResultCount = {
    sales: filteredSales.length,
    expenses: filteredExpenses.length,
    purchases: filteredPurchases.length,
    payments: filteredPayments.length,
    loans: filteredLoans.length,
    dailyCashouts: filteredDailyCashouts.length,
    cashTransfers: filteredTransfers.length,
    settingsAudit: filteredAudit.length,
  }[activeTab] ?? 0

  return (
    <section className="grid gap-2.5 xl:min-h-0 xl:overflow-hidden">
      <div className="grid gap-3 rounded-[18px] border border-border/70 bg-secondary/35 p-3 sm:grid-cols-[minmax(150px,220px)_1fr_auto] sm:items-end">
        <FieldLabel label="Log range">
          <NativeSelect value={rangePreset} onChange={(event) => {
            setRangePreset(event.target.value as LogRangePreset)
            resetResults()
          }}>
            <option value="7">Last 7 days</option>
            <option value="15">Last 15 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="custom">Custom range</option>
          </NativeSelect>
        </FieldLabel>
        {rangePreset === 'custom' ? (
          <div className="grid gap-2 min-[460px]:grid-cols-2">
            <FieldLabel label="From"><Input type="date" value={customStart} onChange={(event) => { setCustomStart(event.target.value); resetResults() }} /></FieldLabel>
            <FieldLabel label="To"><Input type="date" value={customEnd} onChange={(event) => { setCustomEnd(event.target.value); resetResults() }} /></FieldLabel>
          </div>
        ) : <div className="hidden sm:block" />}
        <div className="rounded-xl border border-border/60 bg-background/45 px-3 py-2 text-xs font-semibold text-muted-foreground sm:text-right">
          <span className="block text-foreground">{activeResultCount} result{activeResultCount === 1 ? '' : 's'}</span>
          {formatDisplayDate(validRangeStart)} to {formatDisplayDate(validRangeEnd)}
        </div>
      </div>
      <Tabs value={activeTab} onValueChange={(value) => { setActiveTab(value); resetResults() }} className="grid gap-2 xl:min-h-0 xl:flex-1 xl:grid-rows-[auto_minmax(0,1fr)] xl:overflow-hidden">
        <TabsList className="min-h-9 grid-flow-row grid-cols-2 sm:grid-cols-4 xl:grid-flow-col xl:grid-cols-8">
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
            <div className="space-y-2 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
              {filteredSales.length === 0 ? <EmptyState message="No sales recorded yet." /> : null}
              {filteredSales.slice(0, visibleCount).map((entry) => (
                <LogEntryCard key={entry.id}>
                  <p className="font-bold">{formatDisplayDate(entry.date)} | {money(entry.totalSales)}</p>
                  <p className="text-muted-foreground">
                    Cash {money(entry.cashSales)} | UPI {money(entry.upiSales)} | Card {money(entry.cardSales)} | Bank {money(entry.bankTransferSales)} | Credit {money(entry.creditSales)}
                  </p>
                  <p className="text-muted-foreground">Returns {money(entry.returnsDiscounts)}</p>
                  {entry.notes ? <p className="text-muted-foreground">{entry.notes}</p> : null}
                </LogEntryCard>
              ))}
              <LoadMoreButton shown={Math.min(visibleCount, filteredSales.length)} total={filteredSales.length} onClick={() => setVisibleCount((count) => count + 50)} />
            </div>
          </LogCard>
        </TabsContent>

        <TabsContent value="expenses" className="min-h-0">
          <LogCard eyebrow="Logs" title="Expenses">
            <FilterBar searchValue={expenseSearch} onSearchChange={(value) => { setExpenseSearch(value); resetResults() }} searchPlaceholder="Paid to, category, notes" />
            <div className="space-y-2 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
              {filteredExpenses.length === 0 ? <EmptyState message="No expenses recorded yet." /> : null}
              {filteredExpenses.slice(0, visibleCount).map((entry) => (
                <LogEntryCard key={entry.id}>
                  <p className="font-bold">{entry.paidTo} | {money(entry.amount)}</p>
                  <p className="text-muted-foreground">{formatDisplayDate(entry.date)} | {entry.category} | {entry.paymentMode}</p>
                  <ChequeMeta paymentMode={entry.paymentMode} chequeNumber={entry.chequeNumber} chequePayDate={entry.chequePayDate} />
                  {entry.notes ? <p className="text-muted-foreground">{entry.notes}</p> : null}
                </LogEntryCard>
              ))}
              <LoadMoreButton shown={Math.min(visibleCount, filteredExpenses.length)} total={filteredExpenses.length} onClick={() => setVisibleCount((count) => count + 50)} />
            </div>
          </LogCard>
        </TabsContent>

        <TabsContent value="purchases" className="min-h-0">
          <LogCard eyebrow="Logs" title="Purchases">
            <FilterBar searchValue={purchaseSearch} onSearchChange={(value) => { setPurchaseSearch(value); resetResults() }} searchPlaceholder="Vendor, bill number, category" />
            <div className="space-y-2 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
              {filteredPurchases.length === 0 ? <EmptyState message="No purchases recorded yet." /> : null}
              {filteredPurchases.slice(0, visibleCount).map((entry) => (
                <LogEntryCard key={entry.id}>
                  <p className="font-bold">{entry.supplierName} | Bill {entry.billNumber || '-'}</p>
                  <p className="text-muted-foreground">{formatDisplayDate(entry.date)} | {entry.category} | {entry.paymentMode}</p>
                  <p className="text-muted-foreground">Total {money(entry.purchaseAmount)} | Paid {money(entry.paidAmount)} | Unpaid {money(entry.unpaidAmount)}</p>
                  {entry.notes ? <p className="text-muted-foreground">{entry.notes}</p> : null}
                </LogEntryCard>
              ))}
              <LoadMoreButton shown={Math.min(visibleCount, filteredPurchases.length)} total={filteredPurchases.length} onClick={() => setVisibleCount((count) => count + 50)} />
            </div>
          </LogCard>
        </TabsContent>

        <TabsContent value="payments" className="min-h-0">
          <LogCard eyebrow="Logs" title="Payments">
            <FilterBar searchValue={paymentSearch} onSearchChange={(value) => { setPaymentSearch(value); resetResults() }} searchPlaceholder="Party, type, notes" />
            <div className="space-y-2 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
              {filteredPayments.length === 0 ? <EmptyState message="No payments recorded yet." /> : null}
              {filteredPayments.slice(0, visibleCount).map((entry) => (
                <LogEntryCard key={entry.id}>
                  <p className="font-bold">{entry.partyName} | {money(entry.amount)}</p>
                  <p className="text-muted-foreground">
                    {formatDisplayDate(entry.date)} | {entry.type} | {(entry.entryType ?? 'General').replace('-', ' ')} | {entry.paymentMode}
                  </p>
                  <ChequeMeta paymentMode={entry.paymentMode} chequeNumber={entry.chequeNumber} chequePayDate={entry.chequePayDate} />
                  {entry.notes ? <p className="text-muted-foreground">{entry.notes}</p> : null}
                </LogEntryCard>
              ))}
              <LoadMoreButton shown={Math.min(visibleCount, filteredPayments.length)} total={filteredPayments.length} onClick={() => setVisibleCount((count) => count + 50)} />
            </div>
          </LogCard>
        </TabsContent>

        <TabsContent value="loans" className="min-h-0">
          <LogCard eyebrow="Logs" title="Loans">
            <FilterBar searchValue={loanSearch} onSearchChange={(value) => { setLoanSearch(value); resetResults() }} searchPlaceholder="Person or status" />
            <div className="space-y-2 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
              {filteredLoans.length === 0 ? <EmptyState message="No loans recorded yet." /> : null}
              {filteredLoans.slice(0, visibleCount).map((entry) => (
                <LogEntryCard key={entry.id}>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-2">
                      <p className="font-bold">{entry.personName}</p>
                      <p className="text-muted-foreground">Status {entry.status}</p>
                      {entry.notes ? <p className="text-muted-foreground">{entry.notes}</p> : null}
                    </div>
                    <DeleteButton onClick={() => void onDeleteLoan(entry)} />
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
              <LoadMoreButton shown={Math.min(visibleCount, filteredLoans.length)} total={filteredLoans.length} onClick={() => setVisibleCount((count) => count + 50)} />
            </div>
          </LogCard>
        </TabsContent>

        <TabsContent value="dailyCashouts" className="min-h-0">
          <DailyCashoutLogTab
            correctionRequests={rangedCorrectionRequests}
            entries={filteredDailyCashouts}
            visibleCount={visibleCount}
            onLoadMore={() => setVisibleCount((count) => count + 50)}
            onDelete={onDeleteDailyCashout}
            onEdit={onEditDailyCashout}
          />
        </TabsContent>
        <TabsContent value="cashTransfers" className="min-h-0">
          <LogCard eyebrow="Logs" title="Cash Transfers">
            <FilterBar searchValue={transferSearch} onSearchChange={(value) => { setTransferSearch(value); resetResults() }} searchPlaceholder="From, destination, reason" />
            <div className="space-y-2 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
              {filteredTransfers.length === 0 ? <EmptyState message="No cash transfers recorded yet." /> : null}
              {filteredTransfers.slice(0, visibleCount).map((entry) => (
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
              <LoadMoreButton shown={Math.min(visibleCount, filteredTransfers.length)} total={filteredTransfers.length} onClick={() => setVisibleCount((count) => count + 50)} />
            </div>
          </LogCard>
        </TabsContent>

        <TabsContent value="settingsAudit" className="min-h-0">
          <LogCard eyebrow="Logs" title="Settings Audit">
            <FilterBar searchValue={auditSearch} onSearchChange={(value) => { setAuditSearch(value); resetResults() }} searchPlaceholder="Actor or action" />
            <div className="space-y-2 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
              {filteredAudit.length === 0 ? <EmptyState message="No settings activity recorded yet." /> : null}
              {filteredAudit.map((entry) => (
                <LogEntryCard key={entry.id}>
                  {formatDisplayDateTime(entry.createdAt)} | {entry.actor} | {entry.action}
                </LogEntryCard>
              ))}
              {boundedAuditLog.length >= visibleCount ? <Button type="button" variant="outline" className="w-full" onClick={() => setVisibleCount((count) => count + 50)}>Load more</Button> : null}
            </div>
          </LogCard>
        </TabsContent>
      </Tabs>
    </section>
  )
}

