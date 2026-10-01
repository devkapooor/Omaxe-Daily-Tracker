import { useCallback, useEffect, useMemo, useState } from 'react'
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import type { Cashout, DailySales, Payment, Purchase } from '@/domain/financeTypes'
import type { CashoutCorrectionRequest, CashoutCorrectionValues, CashTransfer, DailyCashoutEntry, LoanEntry, SettingsAuditEntry, UserAccount } from '@/domain/appTypes'
import { formatDisplayDate, legacyCashHolderLabel, shiftDate, userNameById } from '@/app/uiHelpers'
import { db } from '@/shared/lib/firebase'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { DailyCashoutLogTab } from '@/features/logs/components/DailyCashoutLogTab'
import { AuditLogTable, ExpenseLogTable, LoanLogTable, PaymentLogTable, PurchaseLogTable, SalesLogTable, TransferLogTable } from '@/features/logs/components/LogDataTables'
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

type LogRangePreset = '7' | '15' | '30' | '90' | 'custom'

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

  const transferPartyName = useCallback((entry: CashTransfer, side: 'from' | 'to') => {
    if (side === 'from') {
      if (entry.fromUserId && userNames.has(entry.fromUserId)) return userNames.get(entry.fromUserId) ?? 'Unknown User'
      return legacyCashHolderLabel(entry.from)
    }

    if (entry.toType === 'bank') return 'Bank'
    if (entry.toUserId && userNames.has(entry.toUserId)) return userNames.get(entry.toUserId) ?? 'Unknown User'
    return legacyCashHolderLabel(entry.toPerson)
  }, [userNames])

  const filteredSales = useMemo(
    () =>
      sales
        .filter((entry) => isDateWithinRange(entry.date, validRangeStart, validRangeEnd))
        .sort((left, right) => compareDateDesc(left.date, right.date) || compareTimestampDesc(left.createdAt, right.createdAt)),
    [sales, validRangeEnd, validRangeStart],
  )

  const filteredExpenses = useMemo(() => {
    return expenses
      .filter((entry) => isDateWithinRange(entry.date, validRangeStart, validRangeEnd))
      .sort((left, right) => compareDateDesc(left.date, right.date) || compareTimestampDesc(left.createdAt, right.createdAt))
  }, [expenses, validRangeEnd, validRangeStart])

  const filteredPurchases = useMemo(() => {
    return purchases
      .filter((entry) => isDateWithinRange(entry.date, validRangeStart, validRangeEnd))
      .sort((left, right) => compareDateDesc(left.date, right.date) || compareTimestampDesc(left.createdAt, right.createdAt))
  }, [purchases, validRangeEnd, validRangeStart])

  const filteredPayments = useMemo(() => {
    return payments
      .filter((entry) => isDateWithinRange(entry.date, validRangeStart, validRangeEnd))
      .sort((left, right) => compareDateDesc(left.date, right.date) || compareTimestampDesc(left.createdAt, right.createdAt))
  }, [payments, validRangeEnd, validRangeStart])

  const filteredLoans = useMemo(() => {
    return loans
      .filter((entry) => isDateWithinRange(entry.date, validRangeStart, validRangeEnd))
      .sort((left, right) => compareDateDesc(left.date, right.date) || compareTimestampDesc(left.createdAt, right.createdAt))
  }, [loans, validRangeEnd, validRangeStart])


  const filteredTransfers = useMemo(() => {
    return cashTransfers
      .filter((entry) => isDateWithinRange(entry.date, validRangeStart, validRangeEnd))
      .sort((left, right) => compareDateDesc(left.date, right.date) || compareTimestampDesc(left.createdAt, right.createdAt))
  }, [cashTransfers, validRangeEnd, validRangeStart])

  const filteredDailyCashouts = useMemo(
    () => dailyCashouts.filter((entry) => isDateWithinRange(entry.date, validRangeStart, validRangeEnd)),
    [dailyCashouts, validRangeEnd, validRangeStart],
  )

  const rangedCorrectionRequests = useMemo(
    () => cashoutCorrectionRequests.filter((entry) => entry.status !== 'pending' && isDateWithinRange(entry.createdAt, validRangeStart, validRangeEnd)),
    [cashoutCorrectionRequests, validRangeEnd, validRangeStart],
  )

  const filteredAudit = useMemo(() => {
    return boundedAuditLog
      .sort((left, right) => compareTimestampDesc(left.createdAt, right.createdAt))
  }, [boundedAuditLog])

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
            <SalesLogTable entries={filteredSales} />
          </LogCard>
        </TabsContent>

        <TabsContent value="expenses" className="min-h-0">
          <LogCard eyebrow="Logs" title="Expenses">
            <ExpenseLogTable entries={filteredExpenses} />
          </LogCard>
        </TabsContent>

        <TabsContent value="purchases" className="min-h-0">
          <LogCard eyebrow="Logs" title="Purchases">
            <PurchaseLogTable entries={filteredPurchases} />
          </LogCard>
        </TabsContent>

        <TabsContent value="payments" className="min-h-0">
          <LogCard eyebrow="Logs" title="Payments">
            <PaymentLogTable entries={filteredPayments} />
          </LogCard>
        </TabsContent>

        <TabsContent value="loans" className="min-h-0">
          <LogCard eyebrow="Logs" title="Loans">
            <LoanLogTable entries={filteredLoans} onDelete={onDeleteLoan} />
          </LogCard>
        </TabsContent>

        <TabsContent value="dailyCashouts" className="min-h-0">
          <DailyCashoutLogTab
            correctionRequests={rangedCorrectionRequests}
            entries={filteredDailyCashouts}
            onDelete={onDeleteDailyCashout}
            onEdit={onEditDailyCashout}
          />
        </TabsContent>
        <TabsContent value="cashTransfers" className="min-h-0">
          <LogCard eyebrow="Logs" title="Cash Transfers">
            <TransferLogTable entries={filteredTransfers} partyName={transferPartyName} />
          </LogCard>
        </TabsContent>

        <TabsContent value="settingsAudit" className="min-h-0">
          <LogCard eyebrow="Logs" title="Settings Audit">
            <AuditLogTable entries={filteredAudit} hasMore={boundedAuditLog.length >= visibleCount} onLoadMore={() => setVisibleCount((count) => count + 50)} />
          </LogCard>
        </TabsContent>
      </Tabs>
    </section>
  )
}

