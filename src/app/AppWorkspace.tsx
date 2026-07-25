import { DatabaseZap } from 'lucide-react'
import type { Dispatch, SetStateAction } from 'react'
import type { AppUser, CashoutDraft, PaymentDraft, PurchaseDraft } from '@/domain/financeTypes'
import type { Page, PlannedPayment, UserAccount, VendorRecord } from '@/domain/appTypes'
import {
  type AppToast,
  type DashboardRange,
  type LegacyCashBalance,
  type PendingCashUserBalance,
  canOpenPlanner,
  canOpenSettings,
  formatDisplayDate,
  formatDisplayDateTime,
  legacyCashHolderLabel,
  money,
} from '@/app/uiHelpers'
import { AppTopBar } from '@/features/navigation/components/AppTopBar'
import { CashMovementForm } from '@/features/cash-movement/components/CashMovementForm'
import { DailyCashoutForm } from '@/features/cashout/components/DailyCashoutForm'
import { DirectoryPage } from '@/features/directory/components/DirectoryPage'
import { LoadingScreen } from '@/features/auth/components/LoadingScreen'
import { LogsPage } from '@/features/logs/components/LogsPage'
import { PaymentPlannerPage } from '@/features/planner/components/PaymentPlannerPage'
import { SettingsPage } from '@/features/settings/components/SettingsPage'
import { ExpenseForm } from '@/features/register/components/ExpenseForm'
import { LoanForm } from '@/features/register/components/LoanForm'
import { LoanRepaymentForm } from '@/features/register/components/LoanRepaymentForm'
import { PurchaseForm } from '@/features/register/components/PurchaseForm'
import { VendorPaymentForm } from '@/features/register/components/VendorPaymentForm'
import { DailyCashoutFinalSummaryPanel } from '@/features/dashboard/components/DailyCashoutFinalSummaryPanel'
import { DashboardRangeFilter } from '@/features/dashboard/components/DashboardRangeFilter'
import { DashboardTables } from '@/features/dashboard/components/DashboardTables'
import { MonthlyProjectionPanel } from '@/features/dashboard/components/MonthlyProjectionPanel'
import { SummaryCard } from '@/features/dashboard/components/SummaryCard'
import { Button } from '@/shared/ui/button'
import { GlowCard } from '@/shared/ui/spotlight-card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs'
import type { CashTransfer, DailyCashoutEntry, LoanEntry, SettingsAuditEntry } from '@/domain/appTypes'
import type { FinanceData } from '@/domain/financeTypes'
import type { OperationalExpenseBreakdown } from '@/store/storeShared'

type AppWorkspaceProps = {
  activePage: Page
  appSettings: {
    currentBankBalance: number
    marginPercentage: number
    monthlyOperationalExpense: number
    operationalExpenseBreakdown: OperationalExpenseBreakdown
  }
  canImportLegacyData: boolean
  cashTransfers: CashTransfer[]
  changeOwnPassword: (password: string) => Promise<void>
  createUserAccount: (draft: {
    name: string
    email: string
    password: string
    mobileNumber: string
    role: 'billing' | 'manager'
  }, actor: string) => Promise<unknown>
  currentUser: AppUser
  dailyCashouts: DailyCashoutEntry[]
  dashboardExpenseTotal: number
  dashboardLastUpdated: {
    sales: string | null
    expenses: string | null
    loans: string | null
    fixed: string | null
  }
  dashboardRange: DashboardRange
  dashboardSales: number
  data: FinanceData
  deleteDailyCashoutEntry: (entryId: string) => Promise<void>
  deleteLoanEntry: (loanId: string) => Promise<void>
  deletePlannedPayment: (paymentId: string) => Promise<void>
  deleteUserAccount: (userId: string, actor: string) => Promise<void>
  directoryOptions: {
    party: string[]
    vendors: string[]
  }
  ensureNameInDirectory: (type: 'people' | 'vendors', name: string) => Promise<boolean>
  importLegacyData: () => Promise<boolean>
  isBusy: boolean
  isPageLoaderVisible: boolean
  latestClosedDay: string | null
  latestClosedDaySummary: {
    date: string | null
    totalSales: number
    cashSales: number
    upiSales: number
    creditSales: number
    returns: number
    cashExpenses: number
    cashToHand: number
    transfersToday: number
  }
  marginPercentage: number
  monthlyOperationalExpense: number
  normalizedLoans: LoanEntry[]
  onLogout: () => void
  onPageChange: (page: Page) => void
  pendingCashNow: {
    bankTotal: number
    legacyBalances: LegacyCashBalance[]
    legacyCashoutEntries: DailyCashoutEntry[]
    legacyTransferEntries: CashTransfer[]
    migratedCashoutEntries: DailyCashoutEntry[]
    userBalances: PendingCashUserBalance[]
  }
  plannedPayments: PlannedPayment[]
  projectedMonthlySales: number
  renamePartyInDirectory: (previousName: string, nextName: string) => Promise<boolean>
  savedPartyNames: string[]
  saveCashTransfer: (draft: Omit<CashTransfer, 'id' | 'createdAt'>) => Promise<void>
  saveCashout: (draft: CashoutDraft) => Promise<void>
  saveDailyCashoutEntry: (draft: Omit<DailyCashoutEntry, 'id' | 'createdAt'>) => Promise<void>
  saveLoanEntry: (draft: Omit<LoanEntry, 'id' | 'createdAt' | 'paidAmount' | 'remainingAmount' | 'status' | 'settledAt' | 'updatedAt'>) => Promise<void>
  saveOperationalSettings: (operationalExpenseBreakdown: OperationalExpenseBreakdown, marginPercentage: number, actor: string) => Promise<void>
  savePayment: (draft: PaymentDraft) => Promise<void>
  savePlannedPayment: (draft: Omit<PlannedPayment, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  savePlannerBankBalance: (value: number, actor: string) => Promise<void>
  savePurchase: (draft: PurchaseDraft) => Promise<void>
  saveVendor: (vendor: Omit<VendorRecord, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  setDashboardRange: Dispatch<SetStateAction<DashboardRange>>
  settingsAuditLog: SettingsAuditEntry[]
  showToast: (message: string) => void
  toast: AppToast | null
  todayCashout: number
  todayPaymentPaid: number
  todayPaymentReceived: number
  totalLoans: number
  totalVendorOutstanding: number
  users: UserAccount[]
  vendors: VendorRecord[]
  vendorOutstandingByName: Map<string, number>
  averageDailySales: number
}

function formatLastUpdated(value: string | null) {
  if (!value) return 'No updates'
  return formatDisplayDateTime(value)
}

function shouldConfirmAction(title: string, detailLines: string[], warningLine?: string) {
  const lines = [
    title,
    '',
    ...detailLines,
  ]

  if (warningLine) {
    lines.push('', warningLine)
  }

  lines.push('', 'This action cannot be undone.')
  return window.confirm(lines.join('\n'))
}

export function AppWorkspace({
  activePage,
  appSettings,
  averageDailySales,
  canImportLegacyData,
  cashTransfers,
  changeOwnPassword,
  createUserAccount,
  currentUser,
  dailyCashouts,
  dashboardExpenseTotal,
  dashboardLastUpdated,
  dashboardRange,
  dashboardSales,
  data,
  deleteDailyCashoutEntry,
  deleteLoanEntry,
  deletePlannedPayment,
  deleteUserAccount,
  directoryOptions,
  ensureNameInDirectory,
  importLegacyData,
  isBusy,
  isPageLoaderVisible,
  latestClosedDay,
  latestClosedDaySummary,
  marginPercentage,
  monthlyOperationalExpense,
  normalizedLoans,
  onLogout,
  onPageChange,
  pendingCashNow,
  plannedPayments,
  projectedMonthlySales,
  renamePartyInDirectory,
  savedPartyNames,
  saveCashTransfer,
  saveCashout,
  saveDailyCashoutEntry,
  saveLoanEntry,
  saveOperationalSettings,
  savePayment,
  savePlannedPayment,
  savePlannerBankBalance,
  savePurchase,
  saveVendor,
  setDashboardRange,
  settingsAuditLog,
  showToast,
  toast,
  todayCashout,
  todayPaymentPaid,
  todayPaymentReceived,
  totalLoans,
  totalVendorOutstanding,
  users,
  vendors,
  vendorOutstandingByName,
}: AppWorkspaceProps) {
  return (
    <main className="mx-auto flex h-[100dvh] w-full max-w-[1320px] overflow-hidden">
      <AppTopBar
        currentUser={currentUser}
        activePage={activePage}
        onPageChange={onPageChange}
        onLogout={onLogout}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden px-1 pb-1.25 pt-13 sm:px-1.5 xl:px-2 xl:py-1.75">
        {isPageLoaderVisible ? <LoadingScreen mode="page" message="Opening page..." /> : null}

        {canImportLegacyData ? (
          <div className="mb-2.5 flex flex-col gap-2 rounded-[16px] border border-[#5f4823] bg-[linear-gradient(180deg,rgba(62,45,20,0.92),rgba(42,31,14,0.9))] p-2.5 text-amber-100 shadow-[0_10px_22px_rgba(0,0,0,0.2)] md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <DatabaseZap className="mt-0.5 h-4 w-4 flex-none" />
              <span className="text-xs font-semibold sm:text-sm">
                Legacy browser data found. Import it once into Firebase so every device sees the same records.
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              className="border-[#6e572e] bg-background/70 text-amber-100 hover:bg-accent hover:text-accent-foreground"
              onClick={() => {
                void importLegacyData().then((imported) => {
                  if (imported) showToast('Legacy browser data imported into Firebase.')
                })
              }}
            >
              Import Legacy Data
            </Button>
          </div>
        ) : null}

        {toast ? (
          <div className="fixed right-3 top-18 z-[120] max-w-sm rounded-xl border border-[#5f4823] bg-[linear-gradient(180deg,rgba(49,38,20,0.96),rgba(37,28,15,0.94))] px-3 py-2 text-xs font-semibold text-amber-100 shadow-xl sm:text-sm xl:top-18">
            {toast.message}
          </div>
        ) : null}

        {activePage === 'dashboard' && currentUser.role === 'owner' ? (
          <section className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
            <DashboardRangeFilter value={dashboardRange} onChange={setDashboardRange} />
            <MonthlyProjectionPanel
              averageDailySales={averageDailySales}
              projectedMonthlySales={projectedMonthlySales}
              monthlyOperationalExpense={monthlyOperationalExpense}
              marginPercentage={marginPercentage}
            />
            <div className="grid gap-1.5 md:grid-cols-2 xl:grid-cols-5">
              <SummaryCard label="Sales" value={money(dashboardSales)} updated={formatLastUpdated(dashboardLastUpdated.sales)} />
              <SummaryCard label="Expenses" value={money(dashboardExpenseTotal)} updated={formatLastUpdated(dashboardLastUpdated.expenses)} />
              <SummaryCard label="Open Loan Balance" value={money(totalLoans)} updated={formatLastUpdated(dashboardLastUpdated.loans)} />
              <SummaryCard label="Vendor Outstanding" value={money(totalVendorOutstanding)} />
              <SummaryCard label="Monthly Operational Expenses" value={money(monthlyOperationalExpense)} updated={formatLastUpdated(dashboardLastUpdated.fixed)} />
            </div>
            <DailyCashoutFinalSummaryPanel
              dailyFinalSummary={latestClosedDaySummary}
              userBalances={pendingCashNow.userBalances}
              legacyBalances={pendingCashNow.legacyBalances}
            />
            <DashboardTables
              cashouts={data.cashouts}
              purchases={data.purchases}
              payments={data.payments}
              userBalances={pendingCashNow.userBalances}
              legacyBalances={pendingCashNow.legacyBalances}
              pendingCashBankTotal={pendingCashNow.bankTotal}
            />
          </section>
        ) : null}

        {activePage === 'cashout' ? (
          <section className="mb-2.5">
            <GlowCard className="w-full px-3.5 py-2.5 shadow-[0_10px_22px_rgba(24,32,27,0.06)]">
              <span className="block text-[11px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">
                {latestClosedDay ? `Latest Closed Day Expenses - ${formatDisplayDate(latestClosedDay)}` : 'Today Expenses'}
              </span>
              <strong className="mt-1.5 block text-lg font-black tracking-tight text-foreground">
                {money(latestClosedDaySummary.cashExpenses)}
              </strong>
            </GlowCard>
          </section>
        ) : null}

        {activePage === 'directory' ? (
          <section className="mt-1.5 min-h-0 flex-1 overflow-y-auto pr-1">
            <DirectoryPage
              currentUserRole={currentUser.role}
              isBusy={isBusy}
              partyOptions={directoryOptions.party}
              savedPartyNames={savedPartyNames}
              vendors={vendors}
              vendorOutstandingByName={vendorOutstandingByName}
              onAddParty={async (name) => {
                await ensureNameInDirectory('people', name)
                showToast(`Party saved: ${name}`)
              }}
              onRenameParty={async (previousName, nextName) => {
                const renamed = await renamePartyInDirectory(previousName, nextName)
                if (renamed) showToast(`Party renamed: ${previousName} to ${nextName}`)
              }}
              onSaveVendor={async (vendor) => {
                await saveVendor(vendor)
                showToast(`Vendor saved: ${vendor.name}`)
              }}
            />
          </section>
        ) : null}

        {activePage === 'expense' ? (
          <section className="grid min-h-0 flex-1 gap-2.5 overflow-hidden">
            <Tabs defaultValue="expenses" className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-2 overflow-hidden">
              <TabsList className={currentUser.role === 'owner' ? 'min-h-9 grid-cols-4' : 'min-h-9 grid-cols-3'}>
                <TabsTrigger value="expenses">Expenses</TabsTrigger>
                <TabsTrigger value="vendor-payments">Vendor Payments</TabsTrigger>
                <TabsTrigger value="purchases">Purchases</TabsTrigger>
                {currentUser.role === 'owner' ? <TabsTrigger value="loans">Loans</TabsTrigger> : null}
              </TabsList>

              <TabsContent value="expenses" className="min-h-0">
                <div className="grid min-h-0 gap-2.5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
                  <ExpenseForm currentUser={currentUser} onSave={async (draft) => {
                    await saveCashout(draft)
                    showToast(`Expense saved: ${draft.category} - ${money(draft.amount)}`)
                  }} />
                  <aside className="grid content-start gap-2.5">
                    <section className="grid gap-2.5 sm:grid-cols-2">
                      <SummaryCard label="Today Expense" value={money(todayCashout)} />
                      <SummaryCard label="Today Payments (Net)" value={money(todayPaymentReceived - todayPaymentPaid)} />
                    </section>
                  </aside>
                </div>
              </TabsContent>

              <TabsContent value="vendor-payments" className="min-h-0">
                <VendorPaymentForm vendorOptions={directoryOptions.vendors} onSave={async (draft) => {
                  await ensureNameInDirectory(draft.entryType === 'vendor-payment' ? 'vendors' : 'people', draft.partyName)
                  await savePayment(draft)
                  showToast(
                    draft.entryType === 'loan-payment'
                      ? `Loan payment saved: ${draft.partyName} - ${money(draft.amount)}`
                      : `Vendor payment saved: ${draft.partyName} - ${money(draft.amount)}`,
                  )
                }} />
              </TabsContent>

              <TabsContent value="purchases" className="min-h-0">
                <PurchaseForm vendorOptions={directoryOptions.vendors} onSave={async (draft) => {
                  await ensureNameInDirectory('vendors', draft.supplierName)
                  await savePurchase(draft)
                  showToast(`Purchase saved: ${draft.supplierName} - ${money(draft.purchaseAmount)}`)
                }} />
              </TabsContent>

              {currentUser.role === 'owner' ? (
                <TabsContent value="loans" className="min-h-0">
                  <Tabs defaultValue="loan-taken" className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2 overflow-hidden">
                    <TabsList className="min-h-9 grid-cols-2">
                      <TabsTrigger value="loan-taken">Loan Taken</TabsTrigger>
                      <TabsTrigger value="loan-repayment">Loan Repayment</TabsTrigger>
                    </TabsList>

                    <TabsContent value="loan-taken" className="min-h-0">
                      <LoanForm
                        peopleOptions={directoryOptions.party}
                        onSave={async (draft) => {
                          await saveLoanEntry(draft)
                          showToast(`Loan saved: ${draft.personName} - ${money(draft.amount)}`)
                        }}
                      />
                    </TabsContent>

                    <TabsContent value="loan-repayment" className="min-h-0">
                      <LoanRepaymentForm
                        peopleOptions={directoryOptions.party}
                        onSave={async (draft) => {
                          await ensureNameInDirectory(draft.entryType === 'vendor-payment' ? 'vendors' : 'people', draft.partyName)
                          await savePayment(draft)
                          showToast(`Loan payment saved: ${draft.partyName} - ${money(draft.amount)}`)
                        }}
                      />
                    </TabsContent>
                  </Tabs>
                </TabsContent>
              ) : null}
            </Tabs>
          </section>
        ) : null}

        {activePage === 'cashout' ? (
          <section className="mt-2.5 min-h-0 flex-1 overflow-hidden">
            <DailyCashoutForm
              currentUserId={currentUser.id}
              currentUserName={currentUser.name}
              onSave={async (draft) => {
                await saveDailyCashoutEntry(draft)
                showToast(
                  draft.auditStatus === 'matched'
                    ? `Cashout + Sales saved. Drawer total: ${money(draft.drawerTotal ?? draft.remainingBalance)}`
                    : `${draft.auditMessage} Drawer total saved: ${money(draft.drawerTotal ?? draft.remainingBalance)}`,
                )
              }}
            />
          </section>
        ) : null}

        {activePage === 'movement' ? (
          <section className="mt-2.5 min-h-0 flex-1 overflow-y-auto pr-1">
            <CashMovementForm
              currentUserId={currentUser.id}
              currentUserName={currentUser.name}
              legacyBalances={pendingCashNow.legacyBalances}
              legacyCashoutEntries={pendingCashNow.legacyCashoutEntries}
              legacyTransferEntries={pendingCashNow.legacyTransferEntries}
              migratedCashoutEntries={pendingCashNow.migratedCashoutEntries}
              userBalances={pendingCashNow.userBalances}
              users={users}
              onTransfer={async (draft) => {
                await saveCashTransfer(draft)
                const fromName = pendingCashNow.userBalances.find((entry) => entry.userId === draft.fromUserId)?.name ?? legacyCashHolderLabel(draft.from)
                const toName =
                  draft.toType === 'bank'
                    ? 'Bank'
                    : pendingCashNow.userBalances.find((entry) => entry.userId === draft.toUserId)?.name ??
                      legacyCashHolderLabel(draft.toPerson)
                showToast(
                  `Cash movement saved: ${money(draft.amount)} from ${fromName} to ${toName}`,
                )
              }}
            />
          </section>
        ) : null}

        {activePage === 'planner' && canOpenPlanner(currentUser.role) ? (
          <section className="mt-2.5 min-h-0 flex-1 overflow-hidden">
            <PaymentPlannerPage
              currentBankBalance={appSettings.currentBankBalance}
              currentUserName={currentUser.name}
              expenses={data.cashouts}
              payments={data.payments}
              plannedPayments={plannedPayments}
              pendingCashBalances={Object.fromEntries(pendingCashNow.userBalances.map((entry) => [entry.name, entry.amount]))}
              onSaveBankBalance={async (value) => {
                await savePlannerBankBalance(value, currentUser.name)
                showToast('Planner bank balance updated.')
              }}
              onSavePlannedPayment={async (draft) => {
                await savePlannedPayment(draft)
                showToast(`Planned payment saved: ${draft.title}`)
              }}
              onDeletePlannedPayment={async (paymentId) => {
                await deletePlannedPayment(paymentId)
                showToast('Manual planned payment deleted.')
              }}
            />
          </section>
        ) : null}

        {activePage === 'logs' && currentUser.role === 'owner' ? (
          <section className="mt-2.5 min-h-0 flex-1 overflow-y-auto pr-1">
            <LogsPage
              sales={data.sales}
              expenses={data.cashouts}
              purchases={data.purchases}
              payments={data.payments}
              loans={normalizedLoans}
              dailyCashouts={dailyCashouts}
              cashTransfers={cashTransfers}
              settingsAuditLog={settingsAuditLog}
              users={users}
              onDeleteLoan={async (loan) => {
                if (!shouldConfirmAction(
                  'Delete this loan entry?',
                  [
                    `Party: ${loan.personName}`,
                    `Amount: ${money(loan.amount)}`,
                    `Remaining: ${money(loan.remainingAmount)}`,
                    `Loan Date: ${formatDisplayDate(loan.date)}`,
                  ],
                  loan.paidAmount > 0 ? 'Warning: this loan already has repayment applied and balances will be recomputed.' : undefined,
                )) return
                try {
                  await deleteLoanEntry(loan.id)
                  showToast(`Loan deleted: ${loan.personName} - ${money(loan.amount)}`)
                } catch (error) {
                  showToast(error instanceof Error ? error.message : 'Unable to delete this loan entry.')
                }
              }}
              onDeleteDailyCashout={async (entry) => {
                const drawerTotal = entry.drawerTotal ?? entry.remainingBalance
                if (!shouldConfirmAction(
                  'Delete this daily cashout entry?',
                  [
                    `Recorded By: ${entry.recordedBy}`,
                    `Drawer Total: ${money(drawerTotal)}`,
                    `Date: ${formatDisplayDate(entry.date)}`,
                  ],
                  'Warning: linked sales totals for this date will be recalculated.',
                )) return
                try {
                  await deleteDailyCashoutEntry(entry.id)
                  showToast(`Daily cashout deleted: ${entry.recordedBy} - ${formatDisplayDate(entry.date)}`)
                } catch (error) {
                  showToast(error instanceof Error ? error.message : 'Unable to delete this daily cashout entry.')
                }
              }}
            />
          </section>
        ) : null}

        {activePage === 'settings' && canOpenSettings(currentUser.role) ? (
          <section className="mt-2.5 min-h-0 flex-1 overflow-hidden">
            <SettingsPage
              currentUser={currentUser}
              users={users}
              isBusy={isBusy}
              monthlyOperationalExpense={appSettings.monthlyOperationalExpense}
              operationalExpenseBreakdown={appSettings.operationalExpenseBreakdown}
              marginPercentage={appSettings.marginPercentage}
              onCreateUser={async (draft) => {
                await createUserAccount(draft, currentUser.name)
                showToast(`User created: ${draft.name}`)
              }}
              onDeleteUser={async (userId) => {
                await deleteUserAccount(userId, currentUser.name)
                showToast('User deleted.')
              }}
              onChangeOwnPassword={async (password) => {
                await changeOwnPassword(password)
                showToast('Password updated.')
              }}
              onSaveOperationalSettings={async (nextOperationalExpenseBreakdown, nextMarginPercentage) => {
                await saveOperationalSettings(nextOperationalExpenseBreakdown, nextMarginPercentage, currentUser.name)
                showToast('Operational settings updated.')
              }}
            />
          </section>
        ) : null}
      </div>
    </main>
  )
}
