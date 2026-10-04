import { useCallback, useEffect, useMemo, useState } from 'react'
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import type { Cashout, DailySales, Payment, Purchase } from '@/domain/financeTypes'
import type { CashoutCorrectionRequest, CashoutCorrectionValues, CashTransfer, DailyCashoutEntry, LoanEntry, SettingsAuditEntry, UserAccount } from '@/domain/appTypes'
import { formatDisplayDate, legacyCashHolderLabel, shiftDate, today, userNameById } from '@/app/uiHelpers'
import { db } from '@/shared/lib/firebase'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { DailyCashoutLogTab } from '@/features/logs/components/DailyCashoutLogTab'
import { AuditLogTable, ExpenseLogTable, LoanLogTable, PaymentLogTable, PurchaseLogTable, SalesLogTable, TransferLogTable } from '@/features/logs/components/LogDataTables'
import { FieldLabel } from '@/shared/ui/field-label'
import { Input } from '@/shared/ui/input'
import { NativeSelect } from '@/shared/ui/native-select'
import { SectionHeading } from '@/shared/ui/section-heading'
import { StatusPanel } from '@/shared/ui/status-panel'
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
const logTabTriggerClassName = 'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm'

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

function indiaDateKey(value?: Date) {
  if (!value) return today()
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
  const isCustomRangeIncomplete = rangePreset === 'custom' && (!customStart || !customEnd)
  const canApplyRangeToNonLoanTab = activeTab === 'loans' || !isCustomRangeIncomplete

  function resetResults() {
    setVisibleCount(50)
  }

  useEffect(() => {
    if (activeTab !== 'settingsAudit') return
    if (isCustomRangeIncomplete) return

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
  }, [activeTab, isCustomRangeIncomplete, settingsAuditLog, validRangeEnd, validRangeStart, visibleCount])

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
        .filter((entry) => canApplyRangeToNonLoanTab && isDateWithinRange(entry.date, validRangeStart, validRangeEnd))
        .sort((left, right) => compareDateDesc(left.date, right.date) || compareTimestampDesc(left.createdAt, right.createdAt)),
    [canApplyRangeToNonLoanTab, sales, validRangeEnd, validRangeStart],
  )

  const filteredExpenses = useMemo(() => {
    return expenses
      .filter((entry) => canApplyRangeToNonLoanTab && isDateWithinRange(entry.date, validRangeStart, validRangeEnd))
      .sort((left, right) => compareDateDesc(left.date, right.date) || compareTimestampDesc(left.createdAt, right.createdAt))
  }, [canApplyRangeToNonLoanTab, expenses, validRangeEnd, validRangeStart])

  const filteredPurchases = useMemo(() => {
    return purchases
      .filter((entry) => canApplyRangeToNonLoanTab && isDateWithinRange(entry.date, validRangeStart, validRangeEnd))
      .sort((left, right) => compareDateDesc(left.date, right.date) || compareTimestampDesc(left.createdAt, right.createdAt))
  }, [canApplyRangeToNonLoanTab, purchases, validRangeEnd, validRangeStart])

  const filteredPayments = useMemo(() => {
    return payments
      .filter((entry) => canApplyRangeToNonLoanTab && isDateWithinRange(entry.date, validRangeStart, validRangeEnd))
      .sort((left, right) => compareDateDesc(left.date, right.date) || compareTimestampDesc(left.createdAt, right.createdAt))
  }, [canApplyRangeToNonLoanTab, payments, validRangeEnd, validRangeStart])

  const filteredLoans = useMemo(() => {
    return loans
      .filter((entry) => isDateWithinRange(entry.date, validRangeStart, validRangeEnd))
      .sort((left, right) => compareDateDesc(left.date, right.date) || compareTimestampDesc(left.createdAt, right.createdAt))
  }, [loans, validRangeEnd, validRangeStart])


  const filteredTransfers = useMemo(() => {
    return cashTransfers
      .filter((entry) => canApplyRangeToNonLoanTab && isDateWithinRange(entry.date, validRangeStart, validRangeEnd))
      .sort((left, right) => compareDateDesc(left.date, right.date) || compareTimestampDesc(left.createdAt, right.createdAt))
  }, [canApplyRangeToNonLoanTab, cashTransfers, validRangeEnd, validRangeStart])

  const filteredDailyCashouts = useMemo(
    () => dailyCashouts.filter((entry) => canApplyRangeToNonLoanTab && isDateWithinRange(entry.date, validRangeStart, validRangeEnd)),
    [canApplyRangeToNonLoanTab, dailyCashouts, validRangeEnd, validRangeStart],
  )

  const rangedCorrectionRequests = useMemo(
    () => cashoutCorrectionRequests.filter((entry) => canApplyRangeToNonLoanTab && entry.status !== 'pending' && isDateWithinRange(entry.createdAt, validRangeStart, validRangeEnd)),
    [canApplyRangeToNonLoanTab, cashoutCorrectionRequests, validRangeEnd, validRangeStart],
  )

  const filteredAudit = useMemo(() => {
    if (isCustomRangeIncomplete && activeTab === 'settingsAudit') return []
    return boundedAuditLog.slice()
      .sort((left, right) => compareTimestampDesc(left.createdAt, right.createdAt))
  }, [activeTab, boundedAuditLog, isCustomRangeIncomplete])

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
      <Tabs value={activeTab} onValueChange={(value) => { setActiveTab(value); resetResults() }} className="grid gap-2 xl:min-h-0 xl:flex-1 xl:grid-rows-[auto_minmax(0,1fr)] xl:overflow-hidden">
        <Card>
          <CardContent className="grid gap-2.5 p-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Logs</h1>
            <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(180px,220px)_auto] sm:items-center lg:flex lg:flex-wrap lg:justify-end">
              <NativeSelect aria-label="Date range" value={rangePreset} onChange={(event) => {
                setRangePreset(event.target.value as LogRangePreset)
                resetResults()
              }}>
                <option value="7">Last 7 days</option>
                <option value="15">Last 15 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
                <option value="custom">Custom range</option>
              </NativeSelect>
              {rangePreset === 'custom' ? (
                <div className="grid gap-2 min-[460px]:grid-cols-2 lg:min-w-[350px]">
                  <FieldLabel label="From"><Input type="date" value={customStart} onChange={(event) => { setCustomStart(event.target.value); resetResults() }} /></FieldLabel>
                  <FieldLabel label="To"><Input type="date" value={customEnd} onChange={(event) => { setCustomEnd(event.target.value); resetResults() }} /></FieldLabel>
                </div>
              ) : null}
              <div className="flex min-h-9 items-center gap-2 border-l border-border pl-3 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{activeResultCount} result{activeResultCount === 1 ? '' : 's'}</span>
                <span aria-hidden="true" className="text-border">|</span>
                <span>{activeTab !== 'loans' && isCustomRangeIncomplete ? 'Select both dates' : `${formatDisplayDate(validRangeStart)} to ${formatDisplayDate(validRangeEnd)}`}</span>
              </div>
            </div>
          </CardContent>
          <div className="mx-2.5 border-t border-border pt-2.5 pb-2.5">
            <TabsList aria-label="Log category" className="min-h-9 grid-flow-row grid-cols-2 rounded-md border-0 bg-muted/50 p-1 shadow-none sm:grid-cols-4 xl:grid-flow-col xl:grid-cols-8">
              <TabsTrigger className={logTabTriggerClassName} value="sales">Sales</TabsTrigger>
              <TabsTrigger className={logTabTriggerClassName} value="expenses">Expenses</TabsTrigger>
              <TabsTrigger className={logTabTriggerClassName} value="purchases">Purchases</TabsTrigger>
              <TabsTrigger className={logTabTriggerClassName} value="payments">Payments</TabsTrigger>
              <TabsTrigger className={logTabTriggerClassName} value="loans">Loans</TabsTrigger>
              <TabsTrigger className={logTabTriggerClassName} value="dailyCashouts">Daily Cashouts</TabsTrigger>
              <TabsTrigger className={logTabTriggerClassName} value="cashTransfers">Cash Transfers</TabsTrigger>
              <TabsTrigger className={logTabTriggerClassName} value="settingsAudit">Settings Audit</TabsTrigger>
            </TabsList>
          </div>
          {activeTab !== 'loans' && isCustomRangeIncomplete ? (
            <div className="px-2.5 pb-2.5">
              <StatusPanel variant="warning">Choose both start and end dates to filter this log.</StatusPanel>
            </div>
          ) : null}
        </Card>

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

