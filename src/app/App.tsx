import { useEffect, useState, useTransition } from 'react'
import type { Page } from '@/domain/appTypes'
import { useAppStore } from '@/store/appStore'
import { isLocalAuthBypassEnabled } from '@/shared/lib/firebase'
import {
  type AppToast,
  type DashboardMonthOffset,
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

function isPage(value: string | null): value is Page {
  return value === 'dashboard' || value === 'actions' || value === 'vendor-preview' || value === 'directory' || value === 'expense' || value === 'cashout' || value === 'movement' || value === 'planner' || value === 'logs' || value === 'settings'
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
    submitCashoutCorrectionRequest,
    approveCashoutCorrectionRequest,
    rejectCashoutCorrectionRequest,
    withdrawCashoutCorrectionRequest,
    saveLoanEntry,
    saveOperationalSettings,
    savePayment,
    saveVendor,
    deletePlannedPayment,
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

  const {
    monthlyPerformance,
    directoryOptions,
    latestClosedDay,
    latestClosedDaySummary,
    marginPercentage,
    normalizedLoans,
    pendingCashNow,
    plannerMetrics,
    totalVendorOutstanding,
    todayCashout,
    todayPaymentNet,
    totalLoans,
    vendorOutstandingByName,
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
        deletePlannedPayment={deletePlannedPayment}
        deleteUserAccount={deleteUserAccount}
        editDailyCashoutEntry={editDailyCashoutEntry}
        directoryOptions={directoryOptions}
        ensureNameInDirectory={ensureNameInDirectory}
        importLegacyData={importLegacyData}
        isBusy={isBusy}
        isPageLoaderVisible={isPageLoaderVisible}
        latestClosedDay={latestClosedDay}
        latestClosedDaySummary={latestClosedDaySummary}
        marginPercentage={marginPercentage}
        monthlyPerformance={monthlyPerformance}
        normalizedLoans={normalizedLoans}
        onLogout={() => void signOutCurrentUser()}
        onPageChange={handlePageChange}
        pendingCashNow={pendingCashNow}
        plannerMetrics={plannerMetrics}
        plannedPayments={plannedPayments}
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
        savePayment={savePayment}
        savePlannedPayment={savePlannedPayment}
        savePlannerBankBalance={savePlannerBankBalance}
        saveVendor={saveVendor}
        setDashboardMonthOffset={setDashboardMonthOffset}
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
      />
    </AppBackground>
  )
}

