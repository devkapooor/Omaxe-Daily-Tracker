import { useEffect, useMemo, useState } from 'react'
import type { CashoutDraft, PaymentDraft, PurchaseDraft } from '../domain/financeTypes'
import type { Page } from '../domain/appTypes'
import { useAppStore } from '../data/appStore'
import { isLocalAuthBypassEnabled } from '../lib/firebase'
import {
  AppToast,
  DashboardRange,
  canOpenSettings,
  daysBetweenInclusive,
  daysInMonth,
  money,
  monthlyFixedExpense,
  resolveActivePage,
  shiftDate,
  today,
  uniqNames,
} from './uiHelpers'
import { AppTopBar } from '../components/AppTopBar'
import { CashMovementForm } from '../components/CashMovementForm'
import { CashoutForm } from '../components/CashoutForm'
import { DailyCashoutFinalSummaryPanel } from '../components/DailyCashoutFinalSummaryPanel'
import { DailyCashoutForm } from '../components/DailyCashoutForm'
import { DashboardRangeFilter } from '../components/DashboardRangeFilter'
import { DashboardTables } from '../components/DashboardTables'
import { LoadingScreen } from '../components/LoadingScreen'
import { LoanForm } from '../components/LoanForm'
import { LoginScreen } from '../components/LoginScreen'
import { MonthlyProjectionPanel } from '../components/MonthlyProjectionPanel'
import { PurchaseForm } from '../components/PurchaseForm'
import { RecentCashoutList } from '../components/RecentCashoutList'
import { SettingsPage } from '../components/SettingsPage'
import { VendorsPage } from '../components/VendorsPage'

function formatLastUpdated(value: string | null) {
  if (!value) return 'No updates'
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
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
    saveCashTransfer,
    saveCashout,
    saveDailyCashoutEntry,
    saveLoanEntry,
    savePayment,
    savePurchase,
    setUserDisabled,
    settingsAuditLog,
    signIn,
    signOutCurrentUser,
    users,
    vendors,
    ensureNameInDirectory,
    saveVendor,
  } = useAppStore()

  const [activePage, setActivePage] = useState<Page>('dashboard')
  const [dashboardRange, setDashboardRange] = useState<DashboardRange>('today')
  const [cashoutFilterDate, setCashoutFilterDate] = useState(today())
  const [toast, setToast] = useState<AppToast | null>(null)

  const directoryOptions = useMemo(() => {
    const derivedPeople = data.cashouts.map((cashout) => cashout.paidTo)
    const derivedVendors = data.purchases.map((purchase) => purchase.supplierName)
    const userNames = users.map((user) => user.name)
    return {
      people: uniqNames([...nameDirectory.people, ...derivedPeople, ...userNames]),
      vendors: uniqNames([...vendors.map((vendor) => vendor.name), ...nameDirectory.vendors, ...derivedVendors]),
    }
  }, [data.cashouts, data.purchases, nameDirectory.people, nameDirectory.vendors, users, vendors])

  const filteredCashouts = useMemo(
    () =>
      [...data.cashouts]
        .filter((cashout) => cashout.date === cashoutFilterDate)
        .sort((a, b) => `${b.date}${b.createdAt}`.localeCompare(`${a.date}${a.createdAt}`))
        .slice(0, 6),
    [cashoutFilterDate, data.cashouts],
  )

  const todayCashout = useMemo(
    () =>
      data.cashouts
        .filter((cashout) => cashout.date === today())
        .reduce((total, cashout) => total + cashout.amount, 0),
    [data.cashouts],
  )

  const todayPaymentPaid = useMemo(
    () =>
      data.payments
        .filter((payment) => payment.date === today() && payment.type === 'Paid')
        .reduce((total, payment) => total + payment.amount, 0),
    [data.payments],
  )

  const todayPaymentReceived = useMemo(
    () =>
      data.payments
        .filter((payment) => payment.date === today() && payment.type === 'Received')
        .reduce((total, payment) => total + payment.amount, 0),
    [data.payments],
  )

  const dashboardRangeBounds = useMemo(() => {
    const now = today()
    if (dashboardRange === 'yesterday') {
      const y = shiftDate(now, -1)
      return { from: y, to: y }
    }
    if (dashboardRange === 'mtd') {
      return { from: `${now.slice(0, 7)}-01`, to: now }
    }
    return { from: now, to: now }
  }, [dashboardRange])

  const dashboardSales = useMemo(
    () =>
      data.sales
        .filter((sale) => sale.date >= dashboardRangeBounds.from && sale.date <= dashboardRangeBounds.to)
        .reduce((total, sale) => total + sale.totalSales, 0),
    [data.sales, dashboardRangeBounds],
  )

  const dashboardExpenseEntries = useMemo(
    () => data.cashouts.filter((item) => item.date >= dashboardRangeBounds.from && item.date <= dashboardRangeBounds.to).length,
    [data.cashouts, dashboardRangeBounds],
  )

  const dashboardExpenseTotal = useMemo(
    () =>
      data.cashouts
        .filter((item) => item.date >= dashboardRangeBounds.from && item.date <= dashboardRangeBounds.to)
        .reduce((total, item) => total + item.amount, 0),
    [data.cashouts, dashboardRangeBounds],
  )

  const projectedMonthlySales = useMemo(() => {
    const now = today()
    const monthStart = `${now.slice(0, 7)}-01`
    const mtdSales = data.sales
      .filter((sale) => sale.date >= monthStart && sale.date <= now)
      .reduce((total, sale) => total + sale.totalSales, 0)
    const completedDays = daysBetweenInclusive(monthStart, now)
    const averageDailySales = completedDays > 0 ? mtdSales / completedDays : 0
    return averageDailySales * daysInMonth(now)
  }, [data.sales])

  const currentMonthFixedExpense = monthlyFixedExpense
  const totalLoans = useMemo(() => loans.reduce((total, loan) => total + loan.amount, 0), [loans])

  const latestPendingCashBalances = useMemo(() => {
    const latest = dailyCashouts[0]
    if (latest?.pendingCashBalances) return latest.pendingCashBalances
    return { dev: 0, arsh: 0, farhan: 0 }
  }, [dailyCashouts])

  const pendingCashNow = useMemo(() => {
    const balances = {
      Dev: latestPendingCashBalances.dev,
      Arsh: latestPendingCashBalances.arsh,
      Farhan: latestPendingCashBalances.farhan,
    }
    let bankTotal = 0
    cashTransfers.forEach((entry) => {
      balances[entry.from] -= entry.amount
      if (entry.toType === 'person' && entry.toPerson) {
        balances[entry.toPerson] += entry.amount
      } else {
        bankTotal += entry.amount
      }
    })
    return { balances, bankTotal }
  }, [cashTransfers, latestPendingCashBalances])

  const dailyFinalSummary = useMemo(() => {
    const todayDate = today()
    const todayCashoutEntries = dailyCashouts.filter((entry) => entry.date === todayDate)
    const cashSales = todayCashoutEntries.reduce((total, entry) => total + entry.cashSales, 0)
    const upiSales = todayCashoutEntries.reduce((total, entry) => total + entry.upiSales, 0)
    const creditSales = todayCashoutEntries.reduce((total, entry) => total + entry.creditSales, 0)
    const returns = todayCashoutEntries.reduce((total, entry) => total + entry.returns, 0)
    const totalSales = cashSales + upiSales + creditSales - returns
    const cashExpenses = data.cashouts.filter((entry) => entry.date === todayDate).reduce((total, entry) => total + entry.amount, 0)
    const cashToHand = cashSales - cashExpenses
    const transfersToday = cashTransfers.filter((entry) => entry.date === todayDate).reduce((total, entry) => total + entry.amount, 0)

    return {
      totalSales,
      cashSales,
      upiSales,
      creditSales,
      returns,
      cashExpenses,
      cashToHand,
      transfersToday,
    }
  }, [cashTransfers, dailyCashouts, data.cashouts])

  const dashboardLastUpdated = useMemo(() => {
    const salesLastUpdated = data.sales
      .filter((sale) => sale.date >= dashboardRangeBounds.from && sale.date <= dashboardRangeBounds.to)
      .map((sale) => sale.updatedAt)
      .sort((a, b) => b.localeCompare(a))[0] ?? null
    const expenseLastUpdated = data.cashouts
      .filter((entry) => entry.date >= dashboardRangeBounds.from && entry.date <= dashboardRangeBounds.to)
      .map((entry) => entry.updatedAt)
      .sort((a, b) => b.localeCompare(a))[0] ?? null
    const loansLastUpdated = loans.map((loan) => loan.createdAt).sort((a, b) => b.localeCompare(a))[0] ?? null
    return {
      sales: salesLastUpdated,
      expenses: expenseLastUpdated,
      loans: loansLastUpdated,
      fixed: null,
    }
  }, [dashboardRangeBounds.from, dashboardRangeBounds.to, data.cashouts, data.sales, loans])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(timer)
  }, [toast])

  if (!authReady || (currentUser && !collectionsReady)) {
    return <LoadingScreen message="Syncing Firebase workspace..." />
  }

  if (isLocalAuthBypassEnabled && isBusy && !currentUser) {
    return <LoadingScreen message="Opening local workspace..." />
  }

  if (!currentUser) {
    return (
      <LoginScreen
        authError={authError}
        isBusy={isBusy}
        onLogin={async (email, password) => {
          await signIn(email, password)
          setToast(null)
        }}
      />
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
    <main className="cashout-shell">
      <AppTopBar
        currentUser={currentUser}
        activePage={activePage}
        onPageChange={setActivePage}
        onLogout={() => void signOutCurrentUser()}
      />

      {canImportLegacyData && (
        <div className="notice">
          <span>Legacy browser data found. Import it once into Firebase so every device sees the same records.</span>
          <button
            type="button"
            onClick={() => {
              void importLegacyData().then((imported) => {
                if (imported) showToast('Legacy browser data imported into Firebase.')
              })
            }}
          >
            Import Legacy Data
          </button>
        </div>
      )}

      {toast && <div className="entry-toast">{toast.message}</div>}

      {resolvedActivePage === 'dashboard' && currentUser.role === 'owner' && (
        <section className="dashboard-layout">
          <DashboardRangeFilter value={dashboardRange} onChange={setDashboardRange} />
          <div className="dashboard-middle">
            <MonthlyProjectionPanel
              projectedMonthlySales={projectedMonthlySales}
              monthlyFixedExpense={currentMonthFixedExpense}
            />
          </div>
          <div className="cashout-summary dashboard-grid">
            <div className="summary-card">
              <span>Sales</span>
              <strong>{money(dashboardSales)}</strong>
              <p className="card-meta">Source: Sales records</p>
              <p className="card-meta">Updated: {formatLastUpdated(dashboardLastUpdated.sales)}</p>
            </div>
            <div className="summary-card">
              <span>Expense Entries</span>
              <strong>{dashboardExpenseEntries}</strong>
              <p className="card-meta">Source: Expense register entries</p>
              <p className="card-meta">Updated: {formatLastUpdated(dashboardLastUpdated.expenses)}</p>
            </div>
            <div className="summary-card">
              <span>Expenses</span>
              <strong>{money(dashboardExpenseTotal)}</strong>
              <p className="card-meta">Source: Expense register totals</p>
              <p className="card-meta">Updated: {formatLastUpdated(dashboardLastUpdated.expenses)}</p>
            </div>
            <div className="summary-card">
              <span>Total Loans Taken</span>
              <strong>{money(totalLoans)}</strong>
              <p className="card-meta">Source: Loans tab entries</p>
              <p className="card-meta">Updated: {formatLastUpdated(dashboardLastUpdated.loans)}</p>
            </div>
            <div className="summary-card">
              <span>Latest Fixed Expenses</span>
              <strong>{money(monthlyFixedExpense)}</strong>
              <p className="card-meta">Source: Hardcoded monthly fixed expense</p>
              <p className="card-meta">Updated: {formatLastUpdated(dashboardLastUpdated.fixed)}</p>
            </div>
          </div>
          <DailyCashoutFinalSummaryPanel dailyFinalSummary={dailyFinalSummary} pendingCashBalances={pendingCashNow.balances} />
          <DashboardTables
            cashouts={data.cashouts}
            purchases={data.purchases}
            payments={data.payments}
            pendingCashBalances={pendingCashNow.balances}
            pendingCashBankTotal={pendingCashNow.bankTotal}
          />
        </section>
      )}

      {resolvedActivePage === 'cashout' && (
        <section className="daily-summary-row">
          <div className="summary-card compact">
            <span>Today Expenses</span>
            <strong>{money(todayCashout)}</strong>
          </div>
        </section>
      )}

      {resolvedActivePage === 'expense' && (
        <section className="cashout-layout">
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
          <aside className="cashout-side">
            <section className="cashout-summary">
              <div className="summary-card">
                <span>Today Expense</span>
                <strong>{money(todayCashout)}</strong>
              </div>
              <div className="summary-card">
                <span>Today Payments (Net)</span>
                <strong>{money(todayPaymentReceived - todayPaymentPaid)}</strong>
              </div>
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
        <section className="single-screen-layout">
          <DailyCashoutForm
            currentUserName={currentUser.name}
            onSave={(draft) => {
              void saveDailyCashoutEntry(draft)
              showToast(`Cashout + Sales saved. Balance: ${money(draft.remainingBalance)}`)
            }}
          />
        </section>
      )}

      {resolvedActivePage === 'purchase' && (
        <section className="single-screen-layout">
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
        <section className="single-screen-layout">
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
        <section className="single-screen-layout">
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
        <section className="single-screen-layout">
          <CashMovementForm
            currentUserName={currentUser.name}
            balances={pendingCashNow.balances}
            bankTotal={pendingCashNow.bankTotal}
            transfers={cashTransfers}
            onTransfer={(draft) => {
              void saveCashTransfer(draft)
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
      )}
    </main>
  )
}
