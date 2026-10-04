import { DatabaseZap } from 'lucide-react'
import type { Dispatch, SetStateAction } from 'react'
import type { AppUser, CashoutDraft, PaymentDraft } from '@/domain/financeTypes'
import type { Page, UserAccount } from '@/domain/appTypes'
import type { PlannerScheduleItemSnapshot } from '@/domain/workspaceMetrics'
import {
  type AppToast,
  type DashboardMonthOffset,
  type LegacyCashBalance,
  type PendingCashUserBalance,
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
import { SettingsPage } from '@/features/settings/components/SettingsPage'
import { RegisterPage } from '@/features/register/components/RegisterPage'
import { DashboardPage } from '@/features/dashboard/components/DashboardPage'
import { ActionCenterPage } from '@/features/action-center/components/ActionCenterPage'
import { VendorLedgerWorkspacePage } from '@/features/vendor-workspace/components/VendorLedgerWorkspacePage'
import { PayrollPage } from '@/features/payroll/components/PayrollPage'
import { PosPage } from '@/features/pos/components/PosPage'
import { PosActionCentrePanel } from '@/features/pos/components/PosActionCentrePanel'
import { CashierDiscrepanciesPanel } from '@/features/pos/components/CashierDiscrepanciesPanel'
import { useVendorLedgerV2 } from '@/features/vendor-workspace/hooks/useVendorLedgerV2'
import { deriveApprovalQueue, OUTDATED_CORRECTION_REASON } from '@/features/action-center/domain/approvalItems'
import type { MonthlyPerformanceMetrics } from '@/features/dashboard/hooks/useDashboardMetrics'
import { Button } from '@/shared/ui/button'
import { StatusPanel } from '@/shared/ui/status-panel'
import type { CashoutCorrectionRequest, CashoutCorrectionValues, CashTransfer, DailyCashoutEntry, LoanEntry, SettingsAuditEntry } from '@/domain/appTypes'
import type { FinanceData } from '@/domain/financeTypes'
import type { OperationalExpenseBreakdown } from '@/store/storeShared'
import { ToastHost } from '@/shared/ui/toast-host'
import { useConfirmationDialog } from '@/shared/ui/confirmation-dialog'
import {
  applySettlementCorrectionV2,
  rejectSettlementCorrectionRequestV2,
  resolveVendorReturnV2,
} from '@/store/vendorLedgerV2Repository'

type AppWorkspaceProps = {
  activePage: Page
  appSettings: {
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
  marginPercentage: number
  monthlyPerformance: MonthlyPerformanceMetrics
  normalizedLoans: LoanEntry[]
  legacyChequeItems: PlannerScheduleItemSnapshot[]
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
  setDashboardMonthOffset: Dispatch<SetStateAction<DashboardMonthOffset>>
  settingsAuditLog: SettingsAuditEntry[]
  showToast: (message: string) => void
  toast: AppToast | null
  todayCashout: number
  todayCashExpenses: number
  todayPaymentNet: number
  totalLoans: number
  totalVendorOutstanding: number
  users: UserAccount[]
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
  deleteUserAccount,
  editDailyCashoutEntry,
  directoryOptions,
  ensureNameInDirectory,
  importLegacyData,
  isBusy,
  isPageLoaderVisible,
  marginPercentage,
  monthlyPerformance,
  normalizedLoans,
  legacyChequeItems,
  onLogout,
  onPageChange,
  pendingCashNow,
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
  setDashboardMonthOffset,
  settingsAuditLog,
  showToast,
  toast,
  todayCashout,
  todayCashExpenses,
  todayPaymentNet,
  totalLoans,
  totalVendorOutstanding,
  users,
}: AppWorkspaceProps) {
  const confirmation = useConfirmationDialog()
  const vendorLedger = useVendorLedgerV2(currentUser)
  const vendorNames = Object.fromEntries(vendorLedger.vendors.map((vendor) => [vendor.id, vendor.canonicalName]))
  const approvalQueue = deriveApprovalQueue(cashoutCorrectionRequests, dailyCashouts, {
    correctionRequests: vendorLedger.correctionRequests,
    returns: vendorLedger.returns,
    settlementStates: vendorLedger.settlementStates,
    vendorNames,
  })
  return (
    <main className="mx-auto flex h-[100dvh] w-full overflow-hidden">
      <AppTopBar
        currentUser={currentUser}
        activePage={activePage}
        pendingApprovalCount={approvalQueue.pendingCount}
        onPageChange={onPageChange}
        onLogout={onLogout}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden px-page-inset pb-page-inset pt-16 xl:pt-page-inset">
        {isPageLoaderVisible ? <LoadingScreen mode="page" message="Opening page..." /> : null}

        {canImportLegacyData ? (
          <StatusPanel variant="warning" className="mb-2.5 flex flex-col gap-2 p-2.5 shadow-[0_10px_22px_rgba(38,78,118,0.08)] md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <DatabaseZap className="mt-0.5 h-4 w-4 flex-none" />
              <span className="text-xs font-semibold sm:text-sm">
                Legacy browser data found. Import it once into Firebase so every device sees the same records.
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              className="border-warning/30 bg-white/80 text-warning hover:border-warning/45 hover:bg-warning/10 hover:text-warning dark:bg-card/80"
              onClick={() => {
                void importLegacyData().then((imported) => {
                  if (imported) showToast('Legacy browser data imported into Firebase.')
                })
              }}
            >
              Import Legacy Data
            </Button>
          </StatusPanel>
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
                if (item.kind === 'cashout-correction') {
                  await approveCashoutCorrectionRequest(item.sourceRequest.id, currentUser)
                  showToast(`Cashout correction approved: ${item.recordedBy}`)
                } else if (item.kind === 'vendor-settlement-correction') {
                  await applySettlementCorrectionV2(item.sourceRequest.id, { id: currentUser.id, name: currentUser.name }, new Date().toISOString())
                  showToast(`Vendor payment correction approved: ${item.vendorName}`)
                }
              } catch (error) {
                showToast(error instanceof Error ? error.message : 'Unable to approve this correction.')
              }
            }}
            onReject={async (item, reason) => {
              try {
                if (item.kind === 'cashout-correction') {
                  await rejectCashoutCorrectionRequest(item.sourceRequest.id, reason, currentUser)
                  showToast(reason === OUTDATED_CORRECTION_REASON ? `Outdated request closed: ${item.recordedBy}` : `Cashout correction rejected: ${item.recordedBy}`)
                } else if (item.kind === 'vendor-settlement-correction') {
                  await rejectSettlementCorrectionRequestV2(item.sourceRequest.id, reason, { id: currentUser.id, name: currentUser.name }, new Date().toISOString())
                  showToast(reason === OUTDATED_CORRECTION_REASON ? `Outdated vendor correction closed: ${item.vendorName}` : `Vendor correction rejected: ${item.vendorName}`)
                }
              } catch (error) {
                showToast(error instanceof Error ? error.message : 'Unable to close this correction request.')
              }
            }}
            onResolveReturn={async (item, decision) => {
              try {
                await resolveVendorReturnV2(item.sourceReturn.id, {
                  ...decision,
                  actor: { id: currentUser.id, name: currentUser.name },
                  timestamp: new Date().toISOString(),
                })
                showToast(`Vendor return marked ${decision.outcome}: ${item.vendorName}`)
              } catch (error) {
                showToast(error instanceof Error ? error.message : 'Unable to resolve this vendor return.')
              }
            }}
            testPosPanel={<div className="space-y-2.5"><CashierDiscrepanciesPanel currentUser={currentUser} showToast={showToast} /><PosActionCentrePanel currentUser={currentUser} showToast={showToast} /></div>}
          />
        ) : null}

        {activePage === 'pos-test' ? (
          <PosPage currentUser={currentUser} showToast={showToast} />
        ) : null}

        {activePage === 'vendor-preview' ? (
          <VendorLedgerWorkspacePage
            currentUser={currentUser}
            ledger={vendorLedger}
            legacyChequeItems={legacyChequeItems}
          />
        ) : null}

        {activePage === 'directory' ? (
          <section className="min-h-0 flex-1 overflow-y-auto pr-1">
            <DirectoryPage
              isBusy={isBusy}
              partyOptions={directoryOptions.party}
              savedPartyNames={savedPartyNames}
              loans={normalizedLoans}
              onAddParty={async (name) => {
                await ensureNameInDirectory('people', name)
                showToast(`Party saved: ${name}`)
              }}
              onRenameParty={async (previousName, nextName) => {
                const renamed = await renamePartyInDirectory(previousName, nextName)
                if (renamed) showToast(`Party renamed: ${previousName} to ${nextName}`)
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
            showToast={showToast}
            todayExpense={todayCashout}
            todayPaymentNet={todayPaymentNet}
          />
        ) : null}
        {activePage === 'cashout' ? (
          <CashoutPage
            correctionRequests={cashoutCorrectionRequests}
            currentUser={currentUser}
            dailyCashouts={dailyCashouts}
            todayCashExpenses={todayCashExpenses}
            onSave={saveDailyCashoutEntry}
            onSubmitCorrection={submitCashoutCorrectionRequest}
            onWithdrawCorrection={withdrawCashoutCorrectionRequest}
            showToast={showToast}
          />
        ) : null}
        {activePage === 'movement' ? (
          <section className="min-h-0 flex-1 overflow-y-auto pr-1">
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

        {activePage === 'payroll' ? (
          <section className="min-h-0 flex-1 overflow-y-auto pr-1">
            <PayrollPage currentUser={currentUser} users={users} showToast={showToast} />
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
          <section className="min-h-0 flex-1 overflow-hidden">
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
