import { DatabaseZap } from 'lucide-react'
import type { Dispatch, SetStateAction } from 'react'
import type { AppUser, CashoutDraft, PaymentDraft, PurchaseDraft } from '@/domain/financeTypes'
import type { Page, PlannedPayment, UserAccount, VendorRecord } from '@/domain/appTypes'
import type { WorkspaceMetrics } from '@/domain/workspaceMetrics'
import {
  type AppToast,
  type DashboardMonthOffset,
  type LegacyCashBalance,
  type PendingCashUserBalance,
  canOpenPlanner,
  canOpenSettings,
  formatDisplayDate,
  legacyCashHolderLabel,
  money,
} from '@/app/uiHelpers'
import { AppTopBar } from '@/features/navigation/components/AppTopBar'
import { CashMovementForm } from '@/features/cash-movement/components/CashMovementForm'
import { CashoutPage } from '@/features/cashout/components/CashoutPage'
import { DirectoryPage } from '@/features/directory/components/DirectoryPage'
import { LoadingScreen } from '@/features/auth/components/LoadingScreen'
import { LogsPage } from '@/features/logs/components/LogsPage'
import { PaymentPlannerPage } from '@/features/planner/components/PaymentPlannerPage'
import { SettingsPage } from '@/features/settings/components/SettingsPage'
import { RegisterPage } from '@/features/register/components/RegisterPage'
import { DashboardPage } from '@/features/dashboard/components/DashboardPage'
import { ActionCenterPage } from '@/features/action-center/components/ActionCenterPage'
import { VendorLedgerWorkspacePage } from '@/features/vendor-preview/components/VendorLedgerWorkspacePage'
import { deriveApprovalQueue, OUTDATED_CORRECTION_REASON } from '@/features/action-center/domain/approvalItems'
import type { MonthlyPerformanceMetrics } from '@/features/dashboard/hooks/useDashboardMetrics'
import { Button } from '@/shared/ui/button'
import type { CashoutCorrectionRequest, CashoutCorrectionValues, CashTransfer, DailyCashoutEntry, LoanEntry, SettingsAuditEntry } from '@/domain/appTypes'
import type { FinanceData } from '@/domain/financeTypes'
import type { OperationalExpenseBreakdown } from '@/store/storeShared'
import { ToastHost } from '@/shared/ui/toast-host'
import { useConfirmationDialog } from '@/shared/ui/confirmation-dialog'

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
  cashoutCorrectionRequests: CashoutCorrectionRequest[]
  cashoutCorrectionsError: string | null
  cashoutCorrectionsReady: boolean
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
  dashboardMonthOffset: DashboardMonthOffset
  data: FinanceData
  deleteDailyCashoutEntry: (entryId: string) => Promise<void>
  deleteLoanEntry: (loanId: string) => Promise<void>
  deletePlannedPayment: (paymentId: string) => Promise<void>
  deleteUserAccount: (userId: string, actor: string) => Promise<void>
  editDailyCashoutEntry: (cashoutId: string, proposed: CashoutCorrectionValues, reason: string, actor: AppUser) => Promise<void>
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
  monthlyPerformance: MonthlyPerformanceMetrics
  normalizedLoans: LoanEntry[]
  plannerMetrics: WorkspaceMetrics['planner']
  onLogout: () => void
  onPageChange: (page: Page) => void
  pendingCashNow: {
    bankTotal: number
    legacyBalances: LegacyCashBalance[]
    legacyCashoutEntries: DailyCashoutEntry[]
    legacyTransferEntries: CashTransfer[]
    migratedCashoutEntries: DailyCashoutEntry[]
    userBalances: PendingCashUserBalance[]
    totalCounterCash: number
  }
  plannedPayments: PlannedPayment[]
  renamePartyInDirectory: (previousName: string, nextName: string) => Promise<boolean>
  savedPartyNames: string[]
  saveCashTransfer: (draft: Omit<CashTransfer, 'id' | 'createdAt'>) => Promise<void>
  saveCashout: (draft: CashoutDraft) => Promise<void>
  saveDailyCashoutEntry: (draft: Omit<DailyCashoutEntry, 'id' | 'createdAt'>) => Promise<void>
  submitCashoutCorrectionRequest: (cashoutId: string, proposed: CashoutCorrectionValues, reason: string, actor: AppUser) => Promise<void>
  approveCashoutCorrectionRequest: (requestId: string, actor: AppUser) => Promise<void>
  rejectCashoutCorrectionRequest: (requestId: string, reason: string, actor: AppUser) => Promise<void>
  withdrawCashoutCorrectionRequest: (requestId: string, actor: AppUser) => Promise<void>
  saveLoanEntry: (draft: Omit<LoanEntry, 'id' | 'createdAt' | 'paidAmount' | 'remainingAmount' | 'status' | 'settledAt' | 'updatedAt'>) => Promise<void>
  saveOperationalSettings: (operationalExpenseBreakdown: OperationalExpenseBreakdown, marginPercentage: number, actor: string) => Promise<void>
  savePayment: (draft: PaymentDraft) => Promise<void>
  savePlannedPayment: (draft: Omit<PlannedPayment, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  savePlannerBankBalance: (value: number, actor: string) => Promise<void>
  savePurchase: (draft: PurchaseDraft) => Promise<void>
  saveVendor: (vendor: Omit<VendorRecord, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  setDashboardMonthOffset: Dispatch<SetStateAction<DashboardMonthOffset>>
  settingsAuditLog: SettingsAuditEntry[]
  showToast: (message: string) => void
  toast: AppToast | null
  todayCashout: number
  todayPaymentNet: number
  totalLoans: number
  totalVendorOutstanding: number
  users: UserAccount[]
  vendors: VendorRecord[]
  vendorOutstandingByName: Map<string, number>
}

export function AppWorkspace({
  activePage,
  appSettings,
  canImportLegacyData,
  cashTransfers,
  cashoutCorrectionRequests,
  cashoutCorrectionsError,
  cashoutCorrectionsReady,
  changeOwnPassword,
  createUserAccount,
  currentUser,
  dailyCashouts,
  dashboardMonthOffset,
  data,
  deleteDailyCashoutEntry,
  deleteLoanEntry,
  deletePlannedPayment,
  deleteUserAccount,
  editDailyCashoutEntry,
  directoryOptions,
  ensureNameInDirectory,
  importLegacyData,
  isBusy,
  isPageLoaderVisible,
  latestClosedDay,
  latestClosedDaySummary,
  marginPercentage,
  monthlyPerformance,
  normalizedLoans,
  plannerMetrics,
  onLogout,
  onPageChange,
  pendingCashNow,
  plannedPayments,
  renamePartyInDirectory,
  savedPartyNames,
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
  savePlannedPayment,
  savePlannerBankBalance,
  savePurchase,
  saveVendor,
  setDashboardMonthOffset,
  settingsAuditLog,
  showToast,
  toast,
  todayCashout,
  todayPaymentNet,
  totalLoans,
  totalVendorOutstanding,
  users,
  vendors,
  vendorOutstandingByName,
}: AppWorkspaceProps) {
  const confirmation = useConfirmationDialog()
  const approvalQueue = deriveApprovalQueue(cashoutCorrectionRequests, dailyCashouts)
  return (
    <main className="mx-auto flex h-[100dvh] w-full max-w-[1320px] overflow-hidden">
      <AppTopBar
        currentUser={currentUser}
        activePage={activePage}
        pendingApprovalCount={approvalQueue.pendingCount}
        onPageChange={onPageChange}
        onLogout={onLogout}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden px-1 pb-1.25 pt-13 sm:px-1.5 xl:px-2 xl:py-1.75">
        {isPageLoaderVisible ? <LoadingScreen mode="page" message="Opening page..." /> : null}

        {canImportLegacyData ? (
          <div className="mb-2.5 flex flex-col gap-2 rounded-[16px] border border-amber-400/30 bg-amber-500/10 p-2.5 text-amber-100 shadow-[0_10px_22px_rgba(1,10,20,0.24)] md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <DatabaseZap className="mt-0.5 h-4 w-4 flex-none" />
              <span className="text-xs font-semibold sm:text-sm">
                Legacy browser data found. Import it once into Firebase so every device sees the same records.
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              className="border-amber-400/30 bg-background/70 text-amber-100 hover:border-amber-300/50 hover:bg-amber-500/15 hover:text-amber-50"
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

        <ToastHost toast={toast} />

        {activePage === 'dashboard' && currentUser.role === 'owner' ? (
          <DashboardPage
            marginPercentage={marginPercentage}
            monthOffset={dashboardMonthOffset}
            performance={monthlyPerformance}
            setMonthOffset={setDashboardMonthOffset}
            totalLoans={totalLoans}
            totalVendorOutstanding={totalVendorOutstanding}
          />
        ) : null}

        {activePage === 'actions' && currentUser.role === 'owner' ? (
          <ActionCenterPage
            error={cashoutCorrectionsError}
            isLoading={!cashoutCorrectionsReady}
            queue={approvalQueue}
            onApprove={async (item) => {
              try {
                await approveCashoutCorrectionRequest(item.sourceRequest.id, currentUser)
                showToast(`Cashout correction approved: ${item.recordedBy}`)
              } catch (error) {
                showToast(error instanceof Error ? error.message : 'Unable to approve this correction.')
              }
            }}
            onReject={async (item, reason) => {
              try {
                await rejectCashoutCorrectionRequest(item.sourceRequest.id, reason, currentUser)
                showToast(reason === OUTDATED_CORRECTION_REASON
                  ? `Outdated request closed: ${item.recordedBy}`
                  : `Cashout correction rejected: ${item.recordedBy}`)
              } catch (error) {
                showToast(error instanceof Error ? error.message : 'Unable to close this correction request.')
              }
            }}
          />
        ) : null}

        {activePage === 'vendor-preview' && currentUser.role === 'owner' ? (
          <VendorLedgerWorkspacePage currentUser={currentUser} />
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
          <RegisterPage
            currentUser={currentUser}
            ensureName={ensureNameInDirectory}
            partyOptions={directoryOptions.party}
            saveExpense={saveCashout}
            saveLoan={saveLoanEntry}
            savePayment={savePayment}
            savePurchase={savePurchase}
            showToast={showToast}
            todayExpense={todayCashout}
            todayPaymentNet={todayPaymentNet}
            vendorOptions={directoryOptions.vendors}
          />
        ) : null}
        {activePage === 'cashout' ? (
          <CashoutPage
            correctionRequests={cashoutCorrectionRequests}
            currentUser={currentUser}
            dailyCashouts={dailyCashouts}
            latestClosedDay={latestClosedDay}
            latestClosedDayExpenses={latestClosedDaySummary.cashExpenses}
            onSave={saveDailyCashoutEntry}
            onSubmitCorrection={submitCashoutCorrectionRequest}
            onWithdrawCorrection={withdrawCashoutCorrectionRequest}
            showToast={showToast}
          />
        ) : null}
        {activePage === 'movement' ? (
          <section className="mt-2.5 min-h-0 flex-1 overflow-y-auto pr-1">
            <CashMovementForm
              currentUserId={currentUser.id}
              currentUserName={currentUser.name}
              currentUserRole={currentUser.role}
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
              groupedSchedule={plannerMetrics.groupedSchedule}
              plannedPayments={plannedPayments}
              totalCounterCash={plannerMetrics.totalCounterCash}
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
              cashoutCorrectionRequests={cashoutCorrectionRequests}
              settingsAuditLog={settingsAuditLog}
              users={users}
              onDeleteLoan={async (loan) => {
                if (!await confirmation.confirm({
                  title: 'Delete this loan entry?',
                  details: [
                    `Party: ${loan.personName}`,
                    `Amount: ${money(loan.amount)}`,
                    `Remaining: ${money(loan.remainingAmount)}`,
                    `Loan Date: ${formatDisplayDate(loan.date)}`,
                  ],
                  warning: loan.paidAmount > 0 ? 'Warning: this loan already has repayment applied and balances will be recomputed.' : 'This action cannot be undone.',
                  confirmLabel: 'Delete Loan',
                })) return
                try {
                  await deleteLoanEntry(loan.id)
                  showToast(`Loan deleted: ${loan.personName} - ${money(loan.amount)}`)
                } catch (error) {
                  showToast(error instanceof Error ? error.message : 'Unable to delete this loan entry.')
                }
              }}
              onDeleteDailyCashout={async (entry) => {
                const drawerTotal = entry.drawerTotal ?? entry.remainingBalance
                if (!await confirmation.confirm({
                  title: 'Delete this daily cashout entry?',
                  details: [
                    `Recorded By: ${entry.recordedBy}`,
                    `Drawer Total: ${money(drawerTotal)}`,
                    `Date: ${formatDisplayDate(entry.date)}`,
                  ],
                  warning: 'Warning: linked sales totals for this date will be recalculated. This action cannot be undone.',
                  confirmLabel: 'Delete Cashout',
                })) return
                try {
                  await deleteDailyCashoutEntry(entry.id)
                  showToast(`Daily cashout deleted: ${entry.recordedBy} - ${formatDisplayDate(entry.date)}`)
                } catch (error) {
                  showToast(error instanceof Error ? error.message : 'Unable to delete this daily cashout entry.')
                }
              }}
              onEditDailyCashout={async (entry, values, reason) => {
                await editDailyCashoutEntry(entry.id, values, reason, currentUser)
                showToast(`Cashout corrected: ${entry.recordedBy} - ${formatDisplayDate(entry.date)}`)
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
        {confirmation.dialog}
      </div>
    </main>
  )
}
