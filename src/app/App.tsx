import { useEffect, useState, useTransition } from 'react'
import type { Page } from '@/domain/appTypes'
import { useAppStore } from '@/store/appStore'
import { isLocalAuthBypassEnabled } from '@/shared/lib/firebase'
import {
  type AppToast,
  type DashboardRange,
  resolveActivePage,
} from '@/app/uiHelpers'
import { useDashboardMetrics } from '@/features/dashboard/hooks/useDashboardMetrics'
import { AppWorkspace } from '@/app/AppWorkspace'
import { LoadingScreen } from '@/features/auth/components/LoadingScreen'
import { LoginScreen } from '@/features/auth/components/LoginScreen'
import { OfflineScreen } from '@/features/auth/components/OfflineScreen'
import { AppBackground } from '@/shared/ui/background-components'

const ACTIVE_PAGE_STORAGE_KEY = 'alphahub.active-page'

function isPage(value: string | null): value is Page {
  return value === 'dashboard' || value === 'directory' || value === 'expense' || value === 'cashout' || value === 'movement' || value === 'planner' || value === 'monthlyReports' || value === 'logs' || value === 'settings'
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
    deleteDailyCashoutEntry,
    deleteLoanEntry,
    deleteUserAccount,
    hasAuthenticatedSession,
    hasWorkspaceAccess,
    importLegacyData,
    isBusy,
    loans,
    nameDirectory,
    plannedPayments,
    profileLoaded,
    renamePartyInDirectory,
    savePlannerBankBalance,
    savePlannedPayment,
    settingsAuditLog,
    signIn,
    signOutCurrentUser,
    users,
    vendors,
    workspaceMetrics,
    ensureNameInDirectory,
    saveCashTransfer,
    saveCashout,
    saveDailyCashoutEntry,
    saveLoanEntry,
    saveMonthlyReportMargin,
    saveOperationalSettings,
    savePayment,
    savePurchase,
    saveVendor,
    deletePlannedPayment,
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
    dashboardExpenseTotal,
    dashboardLastUpdated,
    dashboardSales,
    averageDailySales,
    dashboardTables,
    directoryOptions,
    latestClosedDay,
    latestClosedDaySummary,
    monthlyOperationalExpense,
    monthlyReportMetrics,
    marginPercentage,
    normalizedLoans,
    openLoanCount,
    pendingCashNow,
    plannerMetrics,
    projectedMonthlySales,
    projectedProfit,
    projectedLoss,
    totalVendorOutstanding,
    todayCashout,
    todayPaymentNet,
    totalLoans,
    vendorOutstandingByName,
  } = useDashboardMetrics({
    dashboardRange,
    data,
    loans,
    nameDirectory,
    users,
    vendors,
    workspaceMetrics,
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

  if (hasAuthenticatedSession && !authError && (!hasWorkspaceAccess || !profileLoaded || !currentUser)) {
    return (
      <AppBackground>
        <LoadingScreen message={!hasWorkspaceAccess ? 'Verifying workspace access...' : 'Loading your workspace profile...'} />
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
      <AppWorkspace
        activePage={resolvedActivePage}
        appSettings={appSettings}
        averageDailySales={averageDailySales}
        canImportLegacyData={canImportLegacyData}
        cashTransfers={cashTransfers}
        changeOwnPassword={changeOwnPassword}
        createUserAccount={createUserAccount}
        currentUser={currentUser}
        dailyCashouts={dailyCashouts}
        dashboardExpenseTotal={dashboardExpenseTotal}
        dashboardLastUpdated={dashboardLastUpdated}
        dashboardRange={dashboardRange}
        dashboardSales={dashboardSales}
        data={data}
        deleteDailyCashoutEntry={deleteDailyCashoutEntry}
        deleteLoanEntry={deleteLoanEntry}
        deletePlannedPayment={deletePlannedPayment}
        deleteUserAccount={deleteUserAccount}
        directoryOptions={directoryOptions}
        ensureNameInDirectory={ensureNameInDirectory}
        importLegacyData={importLegacyData}
        isBusy={isBusy}
        isPageLoaderVisible={isPageLoaderVisible}
        latestClosedDay={latestClosedDay}
        latestClosedDaySummary={latestClosedDaySummary}
        marginPercentage={marginPercentage}
        monthlyOperationalExpense={monthlyOperationalExpense}
        monthlyReportMetrics={monthlyReportMetrics}
        normalizedLoans={normalizedLoans}
        openLoanCount={openLoanCount}
        onLogout={() => void signOutCurrentUser()}
        onPageChange={handlePageChange}
        pendingCashNow={pendingCashNow}
        plannerMetrics={plannerMetrics}
        plannedPayments={plannedPayments}
        projectedMonthlySales={projectedMonthlySales}
        projectedProfit={projectedProfit}
        projectedLoss={projectedLoss}
        renamePartyInDirectory={renamePartyInDirectory}
        saveCashTransfer={saveCashTransfer}
        saveCashout={saveCashout}
        saveDailyCashoutEntry={saveDailyCashoutEntry}
        saveLoanEntry={saveLoanEntry}
        saveMonthlyReportMargin={saveMonthlyReportMargin}
        saveOperationalSettings={saveOperationalSettings}
        savePayment={savePayment}
        savePlannedPayment={savePlannedPayment}
        savePlannerBankBalance={savePlannerBankBalance}
        savePurchase={savePurchase}
        saveVendor={saveVendor}
        setDashboardRange={setDashboardRange}
        settingsAuditLog={settingsAuditLog}
        showToast={showToast}
        toast={toast}
        todayCashout={todayCashout}
        todayPaymentNet={todayPaymentNet}
        totalLoans={totalLoans}
        totalVendorOutstanding={totalVendorOutstanding}
        users={users}
        savedPartyNames={nameDirectory.people}
        vendors={vendors}
        vendorOutstandingByName={vendorOutstandingByName}
        dashboardTables={dashboardTables}
      />
    </AppBackground>
  )
}

