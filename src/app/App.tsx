import { useEffect, useState, useTransition } from 'react'
import { DatabaseZap } from 'lucide-react'
import type { CashoutDraft, PaymentDraft, PurchaseDraft } from '@/domain/financeTypes'
import type { Page } from '@/domain/appTypes'
import { useAppStore } from '@/data/appStore'
import { isLocalAuthBypassEnabled } from '@/lib/firebase'
import {
  type AppToast,
  type DashboardRange,
  canOpenSettings,
  formatDisplayDate,
  formatDisplayDateTime,
  money,
  resolveActivePage,
} from '@/app/uiHelpers'
import { useDashboardMetrics } from '@/app/useDashboardMetrics'
import { AppTopBar } from '@/components/AppTopBar'
import { CashMovementForm } from '@/components/CashMovementForm'
import { DailyCashoutFinalSummaryPanel } from '@/components/DailyCashoutFinalSummaryPanel'
import { DailyCashoutForm } from '@/components/DailyCashoutForm'
import { DashboardRangeFilter } from '@/components/DashboardRangeFilter'
import { DashboardTables } from '@/components/DashboardTables'
import { DirectoryPage } from '@/components/DirectoryPage'
import { ExpenseForm } from '@/components/ExpenseForm'
import { LoadingScreen } from '@/components/LoadingScreen'
import { LogsPage } from '@/components/LogsPage'
import { LoanForm } from '@/components/LoanForm'
import { LoanRepaymentForm } from '@/components/LoanRepaymentForm'
import { LoginScreen } from '@/components/LoginScreen'
import { MonthlyProjectionPanel } from '@/components/MonthlyProjectionPanel'
import { OfflineScreen } from '@/components/OfflineScreen'
import { PurchaseForm } from '@/components/PurchaseForm'
import { SettingsPage } from '@/components/SettingsPage'
import { SummaryCard } from '@/components/SummaryCard'
import { VendorPaymentForm } from '@/components/VendorPaymentForm'
import { AppBackground } from '@/components/ui/background-components'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const ACTIVE_PAGE_STORAGE_KEY = 'alphahub.active-page'

function isPage(value: string | null): value is Page {
  return value === 'dashboard' || value === 'directory' || value === 'expense' || value === 'cashout' || value === 'movement' || value === 'logs' || value === 'settings'
}

function formatLastUpdated(value: string | null) {
  if (!value) return 'No updates'
  return formatDisplayDateTime(value)
}

export default function App() {
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  const {
    authError,
    authReady,
    appSettings,
    canImportLegacyData,
    cashTransfers,
    changeOwnPassword,
    collectionsReady,
    createUserAccount,
    currentUser,
    dailyCashouts,
    data,
    deleteUserAccount,
    importLegacyData,
    isBusy,
    loans,
    nameDirectory,
    settingsAuditLog,
    signIn,
    signOutCurrentUser,
    users,
    vendors,
    ensureNameInDirectory,
    saveCashTransfer,
    saveCashout,
    saveDailyCashoutEntry,
    saveLoanEntry,
    saveOperationalSettings,
    savePayment,
    savePurchase,
    saveVendor,
  } = useAppStore()

  const [activePage, setActivePage] = useState<Page>(() => {
    if (typeof window === 'undefined') return 'dashboard'
    const storedPage = window.localStorage.getItem(ACTIVE_PAGE_STORAGE_KEY)
    return isPage(storedPage) ? storedPage : 'dashboard'
  })
  const [dashboardRange, setDashboardRange] = useState<DashboardRange>('yesterday')
  const [toast, setToast] = useState<AppToast | null>(null)
  const [isPageLoaderVisible, setIsPageLoaderVisible] = useState(false)
  const [isPageTransitionPending, startPageTransition] = useTransition()

  const {
    currentHolder,
    dashboardExpenseTotal,
    dashboardLastUpdated,
    dashboardSales,
    averageDailySales,
    directoryOptions,
    holderAssignments,
    latestClosedDay,
    latestClosedDaySummary,
    monthlyOperationalExpense,
    marginPercentage,
    normalizedLoans,
    pendingCashNow,
    projectedMonthlySales,
    totalVendorOutstanding,
    todayCashout,
    todayPaymentPaid,
    todayPaymentReceived,
    totalLoans,
    vendorOutstandingByName,
  } = useDashboardMetrics({
    cashTransfers,
    currentUserId: currentUser?.id,
    dailyCashouts,
    dashboardRange,
    data,
    loans,
    nameDirectory,
    monthlyOperationalExpense: appSettings.monthlyOperationalExpense,
    marginPercentage: appSettings.marginPercentage,
    users,
    vendors,
  })

  useEffect(() => {
    function handleNetworkChange() {
      setIsOnline(navigator.onLine)
    }

    window.addEventListener('online', handleNetworkChange)
    window.addEventListener('offline', handleNetworkChange)
    return () => {
      window.removeEventListener('online', handleNetworkChange)
      window.removeEventListener('offline', handleNetworkChange)
    }
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (!currentUser) return
    window.localStorage.setItem(ACTIVE_PAGE_STORAGE_KEY, resolveActivePage(currentUser.role, activePage))
  }, [activePage, currentUser])

  useEffect(() => {
    if (isPageTransitionPending) {
      const showTimer = window.setTimeout(() => setIsPageLoaderVisible(true), 200)
      return () => window.clearTimeout(showTimer)
    }

    const hideTimer = window.setTimeout(() => setIsPageLoaderVisible(false), 0)
    return () => window.clearTimeout(hideTimer)
  }, [isPageTransitionPending])

  if (!isOnline) {
    return (
      <AppBackground>
        <OfflineScreen />
      </AppBackground>
    )
  }

  if (!authReady || (currentUser && !collectionsReady)) {
    return (
      <AppBackground>
        <LoadingScreen message="Syncing Firebase workspace..." />
      </AppBackground>
    )
  }

  if (isLocalAuthBypassEnabled && isBusy && !currentUser) {
    return (
      <AppBackground>
        <LoadingScreen message="Opening local workspace..." />
      </AppBackground>
    )
  }

  if (!currentUser) {
    return (
      <AppBackground>
        <LoginScreen
          authError={authError}
          isBusy={isBusy}
          onLogin={async (email, password) => {
            await signIn(email, password)
            setToast(null)
          }}
        />
      </AppBackground>
    )
  }

  const resolvedActivePage = resolveActivePage(currentUser.role, activePage)

  async function handleSaveCashout(draft: CashoutDraft) {
    await saveCashout(draft)
    showToast(`Expense saved: ${draft.category} - ${money(draft.amount)}`)
  }

  async function handleSavePayment(draft: PaymentDraft) {
    await ensureNameInDirectory(draft.entryType === 'vendor-payment' ? 'vendors' : 'people', draft.partyName)
    await savePayment(draft)
    showToast(
      draft.entryType === 'loan-payment'
        ? `Loan payment saved: ${draft.partyName} - ${money(draft.amount)}`
        : `Vendor payment saved: ${draft.partyName} - ${money(draft.amount)}`,
    )
  }

  async function handleSavePurchase(draft: PurchaseDraft) {
    await ensureNameInDirectory('vendors', draft.supplierName)
    await savePurchase(draft)
    showToast(`Purchase saved: ${draft.supplierName} - ${money(draft.purchaseAmount)}`)
  }

  function showToast(message: string) {
    setToast({
      id: crypto.randomUUID(),
      message,
    })
  }

  function handlePageChange(page: Page) {
    startPageTransition(() => {
      setActivePage(page)
    })
  }

  return (
    <AppBackground>
      <main className="mx-auto flex h-[100dvh] w-full max-w-[1800px] flex-col overflow-hidden px-2 pb-4 pt-20 sm:px-3 md:pt-24 lg:px-4 lg:pt-28">
        <AppTopBar
          currentUser={currentUser}
          activePage={resolvedActivePage}
          onPageChange={handlePageChange}
          onLogout={() => void signOutCurrentUser()}
        />

        {isPageLoaderVisible ? <LoadingScreen mode="page" message="Opening page..." /> : null}

        {canImportLegacyData && (
          <div className="mb-3 flex flex-col gap-2.5 rounded-[22px] border border-emerald-200 bg-emerald-50/90 p-3 text-emerald-800 shadow-sm md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <DatabaseZap className="mt-0.5 h-4 w-4 flex-none" />
              <span className="text-xs font-semibold sm:text-sm">
                Legacy browser data found. Import it once into Firebase so every device sees the same records.
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              className="border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-100"
              onClick={() => {
                void importLegacyData().then((imported) => {
                  if (imported) showToast('Legacy browser data imported into Firebase.')
                })
              }}
            >
              Import Legacy Data
            </Button>
          </div>
        )}

        {toast && (
          <div className="fixed right-4 top-4 z-[120] max-w-sm rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 shadow-xl sm:text-sm">
            {toast.message}
          </div>
        )}

        {resolvedActivePage === 'dashboard' && currentUser.role === 'owner' && (
          <section className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            <DashboardRangeFilter value={dashboardRange} onChange={setDashboardRange} />
            <MonthlyProjectionPanel
              averageDailySales={averageDailySales}
              projectedMonthlySales={projectedMonthlySales}
              monthlyOperationalExpense={monthlyOperationalExpense}
              marginPercentage={marginPercentage}
            />
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <SummaryCard
                label="Sales"
                value={money(dashboardSales)}
                meta="Source: Sales records"
                updated={formatLastUpdated(dashboardLastUpdated.sales)}
              />
              <SummaryCard
                label="Expenses"
                value={money(dashboardExpenseTotal)}
                meta="Source: Expense register totals"
                updated={formatLastUpdated(dashboardLastUpdated.expenses)}
              />
              <SummaryCard
                label="Open Loan Balance"
                value={money(totalLoans)}
                meta="Source: unpaid remaining loan balances"
                updated={formatLastUpdated(dashboardLastUpdated.loans)}
              />
              <SummaryCard
                label="Vendor Outstanding"
                value={money(totalVendorOutstanding)}
                meta="Source: all open vendor balances"
              />
              <SummaryCard
                label="Monthly Operational Expenses"
                value={money(monthlyOperationalExpense)}
                meta="Source: owner-managed settings"
                updated={formatLastUpdated(dashboardLastUpdated.fixed)}
              />
            </div>
            <DailyCashoutFinalSummaryPanel
              dailyFinalSummary={latestClosedDaySummary}
              pendingCashBalances={pendingCashNow.balances}
              holderAssignments={holderAssignments}
            />
            <DashboardTables
              cashouts={data.cashouts}
              purchases={data.purchases}
              payments={data.payments}
              pendingCashBalances={pendingCashNow.balances}
              pendingCashBankTotal={pendingCashNow.bankTotal}
              holderAssignments={holderAssignments}
            />
          </section>
        )}

        {resolvedActivePage === 'cashout' && (
          <section className="mb-3">
            <div className="w-full rounded-[22px] border border-border/80 bg-white/85 px-4 py-3 shadow-[0_14px_30px_rgba(24,32,27,0.07)] backdrop-blur-xl">
              <span className="block text-[11px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">
                {latestClosedDay ? `Latest Closed Day Expenses - ${formatDisplayDate(latestClosedDay)}` : 'Today Expenses'}
              </span>
              <strong className="mt-2 block text-xl font-black tracking-tight text-foreground">
                {money(latestClosedDaySummary.cashExpenses)}
              </strong>
            </div>
          </section>
        )}

        {resolvedActivePage === 'directory' && (
          <section className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
            <DirectoryPage
              currentUserRole={currentUser.role}
              isBusy={isBusy}
              partyOptions={directoryOptions.party}
              vendors={vendors}
              vendorOutstandingByName={vendorOutstandingByName}
              onAddParty={async (name) => {
                await ensureNameInDirectory('people', name)
                showToast(`Party saved: ${name}`)
              }}
              onSaveVendor={async (vendor) => {
                await saveVendor(vendor)
                showToast(`Vendor saved: ${vendor.name}`)
              }}
            />
          </section>
        )}

        {resolvedActivePage === 'expense' && (
          <section className="grid min-h-0 flex-1 gap-3 overflow-hidden">
            <Tabs defaultValue="expenses" className="grid min-h-0 flex-1 gap-3 overflow-hidden">
              <TabsList className="w-full justify-start">
                <TabsTrigger value="expenses">Expenses</TabsTrigger>
                <TabsTrigger value="vendor-payments">Vendor Payments</TabsTrigger>
                <TabsTrigger value="purchases">Purchases</TabsTrigger>
                {currentUser.role === 'owner' ? <TabsTrigger value="loans">Loans</TabsTrigger> : null}
              </TabsList>

              <TabsContent value="expenses" className="min-h-0">
                <div className="grid min-h-0 gap-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
                  <ExpenseForm
                    currentUser={currentUser}
                    onSave={handleSaveCashout}
                  />
                  <aside className="grid content-start gap-3">
                    <section className="grid gap-3 sm:grid-cols-2">
                      <SummaryCard label="Today Expense" value={money(todayCashout)} />
                      <SummaryCard label="Today Payments (Net)" value={money(todayPaymentReceived - todayPaymentPaid)} />
                    </section>
                  </aside>
                </div>
              </TabsContent>

              <TabsContent value="vendor-payments" className="min-h-0">
                <VendorPaymentForm
                  vendorOptions={directoryOptions.vendors}
                  onSave={handleSavePayment}
                />
              </TabsContent>

              <TabsContent value="purchases" className="min-h-0">
                <PurchaseForm vendorOptions={directoryOptions.vendors} onSave={handleSavePurchase} />
              </TabsContent>

              {currentUser.role === 'owner' ? (
                <TabsContent value="loans" className="min-h-0">
                  <Tabs defaultValue="loan-taken" className="grid min-h-0 gap-3 overflow-hidden">
                    <TabsList className="w-full justify-start">
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
                        onSave={handleSavePayment}
                      />
                    </TabsContent>
                  </Tabs>
                </TabsContent>
              ) : null}
            </Tabs>
          </section>
        )}

        {resolvedActivePage === 'cashout' && (
          <section className="mt-3 min-h-0 flex-1 overflow-hidden">
            <DailyCashoutForm
              currentUserHolder={currentHolder}
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
        )}

        {resolvedActivePage === 'movement' && (
          <section className="mt-3 min-h-0 flex-1 overflow-hidden">
            <CashMovementForm
              currentHolder={currentHolder}
              currentUserName={currentUser.name}
              holderAssignments={holderAssignments}
              balances={pendingCashNow.balances}
              bankTotal={pendingCashNow.bankTotal}
              transfers={cashTransfers}
              onTransfer={async (draft) => {
                await saveCashTransfer(draft)
                showToast(
                  draft.toType === 'bank'
                    ? `Transferred ${money(draft.amount)} from ${draft.from} to Bank`
                    : `Transferred ${money(draft.amount)} from ${draft.from} to ${draft.toPerson}`,
                )
              }}
            />
          </section>
        )}

        {resolvedActivePage === 'logs' && currentUser.role === 'owner' && (
          <section className="mt-3 min-h-0 flex-1 overflow-hidden">
            <LogsPage
              sales={data.sales}
              expenses={data.cashouts}
              purchases={data.purchases}
              payments={data.payments}
              loans={normalizedLoans}
              dailyCashouts={dailyCashouts}
              cashTransfers={cashTransfers}
              settingsAuditLog={settingsAuditLog}
            />
          </section>
        )}

        {resolvedActivePage === 'settings' && canOpenSettings(currentUser.role) && (
          <section className="mt-3 min-h-0 flex-1 overflow-hidden">
            <SettingsPage
              currentUser={currentUser}
              users={users}
              isBusy={isBusy}
              monthlyOperationalExpense={appSettings.monthlyOperationalExpense}
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
              onSaveOperationalSettings={async (monthlyOperationalExpense, nextMarginPercentage) => {
                await saveOperationalSettings(monthlyOperationalExpense, nextMarginPercentage, currentUser.name)
                showToast('Operational settings updated.')
              }}
            />
          </section>
        )}
      </main>
    </AppBackground>
  )
}
