import { useEffect, useState } from 'react'
import { DatabaseZap } from 'lucide-react'
import type { CashoutDraft, PaymentDraft, PurchaseDraft } from '@/domain/financeTypes'
import type { Page } from '@/domain/appTypes'
import { useAppStore } from '@/data/appStore'
import { isLocalAuthBypassEnabled } from '@/lib/firebase'
import {
  type AppToast,
  type DashboardRange,
  canOpenSettings,
  money,
  resolveActivePage,
  today,
} from '@/app/uiHelpers'
import { useDashboardMetrics } from '@/app/useDashboardMetrics'
import { AppTopBar } from '@/components/AppTopBar'
import { CashMovementForm } from '@/components/CashMovementForm'
import { CashoutForm } from '@/components/CashoutForm'
import { DailyCashoutFinalSummaryPanel } from '@/components/DailyCashoutFinalSummaryPanel'
import { DailyCashoutForm } from '@/components/DailyCashoutForm'
import { DashboardRangeFilter } from '@/components/DashboardRangeFilter'
import { DashboardTables } from '@/components/DashboardTables'
import { LoadingScreen } from '@/components/LoadingScreen'
import { LoanForm } from '@/components/LoanForm'
import { LoginScreen } from '@/components/LoginScreen'
import { MonthlyProjectionPanel } from '@/components/MonthlyProjectionPanel'
import { PurchaseForm } from '@/components/PurchaseForm'
import { RecentCashoutList } from '@/components/RecentCashoutList'
import { SettingsPage } from '@/components/SettingsPage'
import { VendorsPage } from '@/components/VendorsPage'
import { AppBackground } from '@/components/ui/background-components'
import { Button } from '@/components/ui/button'

function formatLastUpdated(value: string | null) {
  if (!value) return 'No updates'
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function SummaryCard({
  label,
  value,
  meta,
  updated,
}: {
  label: string
  value: string | number
  meta?: string
  updated?: string
}) {
  return (
    <div className="rounded-[22px] border border-border/80 bg-white/85 p-4 shadow-[0_14px_30px_rgba(24,32,27,0.07)] backdrop-blur-xl">
      <span className="block text-[11px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
      <strong className="mt-2.5 block text-2xl font-black tracking-tight text-foreground">{value}</strong>
      {meta ? <p className="mt-1.5 text-[11px] font-semibold text-muted-foreground">{meta}</p> : null}
      {updated ? <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">Updated: {updated}</p> : null}
    </div>
  )
}

export default function App() {
  const {
    authError,
    authReady,
    canImportLegacyData,
    cashTransfers,
    changeOwnPassword,
    collectionsReady,
    createUserAccount,
    currentUser,
    dailyCashouts,
    data,
    importLegacyData,
    isBusy,
    loans,
    nameDirectory,
    setUserDisabled,
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
    savePayment,
    savePurchase,
    saveVendor,
  } = useAppStore()

  const [activePage, setActivePage] = useState<Page>('dashboard')
  const [dashboardRange, setDashboardRange] = useState<DashboardRange>('today')
  const [cashoutFilterDate, setCashoutFilterDate] = useState(today())
  const [toast, setToast] = useState<AppToast | null>(null)

  const {
    currentHolder,
    dailyFinalSummary,
    dashboardExpenseEntries,
    dashboardExpenseTotal,
    dashboardLastUpdated,
    dashboardSales,
    directoryOptions,
    filteredCashouts,
    holderAssignments,
    monthlyFixedExpense,
    pendingCashNow,
    projectedMonthlySales,
    todayCashout,
    todayPaymentPaid,
    todayPaymentReceived,
    totalLoans,
  } = useDashboardMetrics({
    cashTransfers,
    cashoutFilterDate,
    currentUserId: currentUser?.id,
    dailyCashouts,
    dashboardRange,
    data,
    loans,
    nameDirectory,
    users,
    vendors,
  })

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(timer)
  }, [toast])

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

  function handleSaveCashout(draft: CashoutDraft) {
    void ensureNameInDirectory('people', draft.paidTo)
    void saveCashout(draft)
    showToast(`Expense saved: ${draft.paidTo} - ${money(draft.amount)}`)
  }

  function handleSavePayment(draft: PaymentDraft) {
    void ensureNameInDirectory('people', draft.partyName)
    void savePayment(draft)
    showToast(`Payment ${draft.type.toLowerCase()} saved: ${draft.partyName} - ${money(draft.amount)}`)
  }

  function handleSavePurchase(draft: PurchaseDraft) {
    void ensureNameInDirectory('vendors', draft.supplierName)
    void savePurchase(draft)
    showToast(`Purchase saved: ${draft.supplierName} - ${money(draft.purchaseAmount)}`)
  }

  function showToast(message: string) {
    setToast({
      id: crypto.randomUUID(),
      message,
    })
  }

  return (
    <AppBackground>
      <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-3 pb-6 pt-28 sm:px-4 md:pt-32">
        <AppTopBar
          currentUser={currentUser}
          activePage={activePage}
          onPageChange={setActivePage}
          onLogout={() => void signOutCurrentUser()}
        />

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
          <section className="space-y-3">
            <DashboardRangeFilter value={dashboardRange} onChange={setDashboardRange} />
            <MonthlyProjectionPanel projectedMonthlySales={projectedMonthlySales} monthlyFixedExpense={monthlyFixedExpense} />
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <SummaryCard
                label="Sales"
                value={money(dashboardSales)}
                meta="Source: Sales records"
                updated={formatLastUpdated(dashboardLastUpdated.sales)}
              />
              <SummaryCard
                label="Expense Entries"
                value={dashboardExpenseEntries}
                meta="Source: Expense register entries"
                updated={formatLastUpdated(dashboardLastUpdated.expenses)}
              />
              <SummaryCard
                label="Expenses"
                value={money(dashboardExpenseTotal)}
                meta="Source: Expense register totals"
                updated={formatLastUpdated(dashboardLastUpdated.expenses)}
              />
              <SummaryCard
                label="Total Loans Taken"
                value={money(totalLoans)}
                meta="Source: Loans tab entries"
                updated={formatLastUpdated(dashboardLastUpdated.loans)}
              />
              <SummaryCard
                label="Latest Fixed Expenses"
                value={money(monthlyFixedExpense)}
                meta="Source: Hardcoded monthly fixed expense"
                updated={formatLastUpdated(dashboardLastUpdated.fixed)}
              />
            </div>
            <DailyCashoutFinalSummaryPanel
              dailyFinalSummary={dailyFinalSummary}
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
            <div className="w-fit rounded-[22px] border border-border/80 bg-white/85 px-4 py-3 shadow-[0_14px_30px_rgba(24,32,27,0.07)] backdrop-blur-xl">
              <span className="block text-[11px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">Today Expenses</span>
              <strong className="mt-2 block text-xl font-black tracking-tight text-foreground">{money(todayCashout)}</strong>
            </div>
          </section>
        )}

        {resolvedActivePage === 'expense' && (
          <section className="grid gap-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
            <CashoutForm
              currentUser={currentUser}
              peopleOptions={directoryOptions.people}
              onCreatePerson={(name) => {
                void ensureNameInDirectory('people', name)
                return true
              }}
              onSaveCashout={handleSaveCashout}
              onSavePayment={handleSavePayment}
            />
            <aside className="grid gap-3">
              <section className="grid gap-3 sm:grid-cols-2">
                <SummaryCard label="Today Expense" value={money(todayCashout)} />
                <SummaryCard label="Today Payments (Net)" value={money(todayPaymentReceived - todayPaymentPaid)} />
              </section>
              <RecentCashoutList
                cashouts={filteredCashouts}
                filterDate={cashoutFilterDate}
                onFilterDateChange={setCashoutFilterDate}
              />
            </aside>
          </section>
        )}

        {resolvedActivePage === 'cashout' && (
          <section className="mt-3">
            <DailyCashoutForm
              currentUserHolder={currentHolder}
              currentUserName={currentUser.name}
              onSave={(draft) => {
                void saveDailyCashoutEntry(draft)
                showToast(`Cashout + Sales saved. Balance: ${money(draft.remainingBalance)}`)
              }}
            />
          </section>
        )}

        {resolvedActivePage === 'purchase' && (
          <section className="mt-3">
            <PurchaseForm
              vendorOptions={directoryOptions.vendors}
              onCreateVendor={(name) => {
                void saveVendor({
                  name,
                  ownerName: '',
                  contact: '',
                  address: '',
                  companiesProvided: '',
                  notes: 'Quick-created from purchase form.',
                })
                return true
              }}
              onSave={handleSavePurchase}
            />
          </section>
        )}

        {resolvedActivePage === 'vendors' && (
          <section className="mt-3">
            <VendorsPage
              vendors={vendors}
              isBusy={isBusy}
              onSaveVendor={async (vendor) => {
                await saveVendor(vendor)
                showToast(`Vendor saved: ${vendor.name}`)
              }}
            />
          </section>
        )}

        {resolvedActivePage === 'loans' && currentUser.role === 'owner' && (
          <section className="mt-3">
            <LoanForm
              peopleOptions={directoryOptions.people}
              onCreatePerson={(name) => {
                void ensureNameInDirectory('people', name)
                return true
              }}
              onSave={(draft) => {
                void saveLoanEntry(draft)
                showToast(`Loan saved: ${draft.personName} - ${money(draft.amount)}`)
              }}
            />
          </section>
        )}

        {resolvedActivePage === 'movement' && (
          <section className="mt-3">
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

        {resolvedActivePage === 'settings' && canOpenSettings(currentUser.role) && (
          <section className="mt-3">
            <SettingsPage
              currentUser={currentUser}
              users={users}
              isBusy={isBusy}
              onCreateUser={async (draft) => {
                await createUserAccount(draft, currentUser.name)
                showToast(`User created: ${draft.name}`)
              }}
              onSetUserDisabled={async (userId, disabled) => {
                await setUserDisabled(userId, disabled, currentUser.name)
                showToast(disabled ? 'User access disabled.' : 'User access restored.')
              }}
              onChangeOwnPassword={async (password) => {
                await changeOwnPassword(password)
                showToast('Password updated.')
              }}
              settingsAuditLog={settingsAuditLog}
            />
          </section>
        )}
      </main>
    </AppBackground>
  )
}
