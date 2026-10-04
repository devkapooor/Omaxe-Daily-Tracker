import { useEffect, useState, useTransition } from 'react'
import type { Page } from '@/domain/appTypes'
import { useAppStore } from '@/store/appStore'
import { isLocalAuthBypassEnabled } from '@/shared/lib/firebase'
import {
  type AppToast,
  type DashboardMonthOffset,
  defaultSignInPage,
  resolveActivePage,
} from '@/app/uiHelpers'
import { useDashboardMetrics } from '@/features/dashboard/hooks/useDashboardMetrics'
import { AppWorkspace } from '@/app/AppWorkspace'
import { LoadingScreen } from '@/features/auth/components/LoadingScreen'
import { LoginScreen } from '@/features/auth/components/LoginScreen'
import { OfflineScreen } from '@/features/auth/components/OfflineScreen'
import { AppBackground } from '@/shared/ui/background-components'
import { AuroraBackground } from '@/shared/ui/aurora-background'
import { ACTIVE_PAGE_STORAGE_KEY, TOAST_DURATION_MS } from '@/config/appConfig'
import { CashierHandoverBoundary } from '@/features/pos/components/CashierHandoverBoundary'
import { synchronizeServerClock } from '@/shared/lib/serverClock'

function isPage(value: string | null): value is Page {
  return value === 'dashboard' || value === 'actions' || value === 'pos-test' || value === 'vendor-preview' || value === 'directory' || value === 'expense' || value === 'cashout' || value === 'movement' || value === 'payroll' || value === 'logs' || value === 'settings'
}

export default function App() {
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  const {
    authError,
    authReady,
    appSettings,
    canImportLegacyData,
    cashTransfers,
    cashoutCorrectionRequests,
    cashoutCorrectionsError,
    cashoutCorrectionsReady,
    changeOwnPassword,
    collectionsReady,
    createUserAccount,
    currentUser,
    dailyCashouts,
    data,
    deleteDailyCashoutEntry,
    deleteLoanEntry,
    deleteUserAccount,
    editDailyCashoutEntry,
    hasAuthenticatedSession,
    hasWorkspaceAccess,
    importLegacyData,
    isBusy,
    loans,
    nameDirectory,
    profileLoaded,
    renamePartyInDirectory,
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
    submitCashoutCorrectionRequest,
    approveCashoutCorrectionRequest,
    rejectCashoutCorrectionRequest,
    withdrawCashoutCorrectionRequest,
    saveLoanEntry,
    saveOperationalSettings,
    saveScheduledNotifications,
    savePayment,
  } = useAppStore()

  const [activePage, setActivePage] = useState<Page>(() => {
    if (typeof window === 'undefined') return 'dashboard'
    const storedPage = window.localStorage.getItem(ACTIVE_PAGE_STORAGE_KEY)
    return isPage(storedPage) ? storedPage : 'dashboard'
  })
  const [dashboardMonthOffset, setDashboardMonthOffset] = useState<DashboardMonthOffset>(0)
  const [toast, setToast] = useState<AppToast | null>(null)
  const [isPageLoaderVisible, setIsPageLoaderVisible] = useState(false)
  const [isPageTransitionPending, startPageTransition] = useTransition()
  const [pageIdentity, setPageIdentity] = useState<{ id: string; role: string } | null>(null)
  if (!currentUser && pageIdentity) setPageIdentity(null)
  if (currentUser && (pageIdentity?.id !== currentUser.id || pageIdentity.role !== currentUser.role)) {
    setPageIdentity({ id: currentUser.id, role: currentUser.role })
    if (currentUser.role !== 'owner') setActivePage(defaultSignInPage(currentUser.role, activePage))
  }

  const {
    monthlyPerformance,
    directoryOptions,
    marginPercentage,
    normalizedLoans,
    pendingCashNow,
    legacyChequeItems,
    totalVendorOutstanding,
    todayCashout,
    todayCashExpenses,
    todayPaymentNet,
    totalLoans,
  } = useDashboardMetrics({
    dashboardMonthOffset,
    dailyCashouts,
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
    if (!currentUser) return
    const syncClock = () => {
      if (document.visibilityState === 'visible') void synchronizeServerClock().catch(() => undefined)
    }
    const timer = window.setInterval(syncClock, 5 * 60 * 1000)
    document.addEventListener('visibilitychange', syncClock)
    window.addEventListener('focus', syncClock)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', syncClock)
      window.removeEventListener('focus', syncClock)
    }
  }, [currentUser])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), TOAST_DURATION_MS)
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
      <AuroraBackground>
        <LoginScreen
          authError={authError}
          isBusy={isBusy}
          onLogin={async (email, password) => {
            await signIn(email, password)
            setToast(null)
          }}
        />
      </AuroraBackground>
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
      <CashierHandoverBoundary key={currentUser.id} currentUser={currentUser} onSignOut={signOutCurrentUser}>{(onLogout) =>
      <AppWorkspace
        activePage={resolvedActivePage}
        appSettings={appSettings}
        canImportLegacyData={canImportLegacyData}
        cashTransfers={cashTransfers}
        cashoutCorrectionRequests={cashoutCorrectionRequests}
        cashoutCorrectionsError={cashoutCorrectionsError}
        cashoutCorrectionsReady={cashoutCorrectionsReady}
        changeOwnPassword={changeOwnPassword}
        createUserAccount={createUserAccount}
        currentUser={currentUser}
        dailyCashouts={dailyCashouts}
        dashboardMonthOffset={dashboardMonthOffset}
        data={data}
        deleteDailyCashoutEntry={deleteDailyCashoutEntry}
        deleteLoanEntry={deleteLoanEntry}
        deleteUserAccount={deleteUserAccount}
        editDailyCashoutEntry={editDailyCashoutEntry}
        directoryOptions={directoryOptions}
        ensureNameInDirectory={ensureNameInDirectory}
        importLegacyData={importLegacyData}
        isBusy={isBusy}
        isPageLoaderVisible={isPageLoaderVisible}
        marginPercentage={marginPercentage}
        monthlyPerformance={monthlyPerformance}
        normalizedLoans={normalizedLoans}
        onLogout={onLogout}
        onPageChange={handlePageChange}
        pendingCashNow={pendingCashNow}
        legacyChequeItems={legacyChequeItems}
        renamePartyInDirectory={renamePartyInDirectory}
        saveCashTransfer={saveCashTransfer}
        saveCashout={saveCashout}
        saveDailyCashoutEntry={saveDailyCashoutEntry}
        submitCashoutCorrectionRequest={submitCashoutCorrectionRequest}
        approveCashoutCorrectionRequest={approveCashoutCorrectionRequest}
        rejectCashoutCorrectionRequest={rejectCashoutCorrectionRequest}
        withdrawCashoutCorrectionRequest={withdrawCashoutCorrectionRequest}
        saveLoanEntry={saveLoanEntry}
        saveOperationalSettings={saveOperationalSettings}
        saveScheduledNotifications={saveScheduledNotifications}
        savePayment={savePayment}
        setDashboardMonthOffset={setDashboardMonthOffset}
        settingsAuditLog={settingsAuditLog}
        showToast={showToast}
        toast={toast}
        todayCashout={todayCashout}
        todayCashExpenses={todayCashExpenses}
        todayPaymentNet={todayPaymentNet}
        totalLoans={totalLoans}
        totalVendorOutstanding={totalVendorOutstanding}
        users={users}
        savedPartyNames={nameDirectory.people}
      />
      }</CashierHandoverBoundary>
    </AppBackground>
  )
}

