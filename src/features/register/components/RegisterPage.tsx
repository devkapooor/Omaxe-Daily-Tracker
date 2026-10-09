import type { AppUser, CashoutDraft, PaymentDraft } from '@/domain/financeTypes'
import type { LoanEntry } from '@/domain/appTypes'
import { money } from '@/app/uiHelpers'
import { ExpenseForm } from '@/features/register/components/ExpenseForm'
import { LoanForm } from '@/features/register/components/LoanForm'
import { LoanRepaymentForm } from '@/features/register/components/LoanRepaymentForm'
import { SummaryCard } from '@/features/dashboard/components/SummaryCard'
import { PageHeader, PageHeaderTab, PageHeaderTabsList } from '@/shared/ui/page-header'
import { PageLayout } from '@/shared/ui/page-layout'
import { Tabs, TabsContent } from '@/shared/ui/tabs'

type RegisterPageProps = {
  currentUser: AppUser
  partyOptions: string[]
  loans: LoanEntry[]
  todayExpense: number
  todayPaymentNet: number
  saveExpense: (draft: CashoutDraft) => Promise<void>
  saveLoan: (draft: Omit<LoanEntry, 'id' | 'createdAt' | 'paidAmount' | 'remainingAmount' | 'status' | 'settledAt' | 'updatedAt'>) => Promise<void>
  savePayment: (draft: PaymentDraft) => Promise<void>
  showToast: (message: string) => void
}

export function RegisterPage(props: RegisterPageProps) {
  const { currentUser, partyOptions, loans, saveExpense, saveLoan, savePayment, showToast, todayExpense, todayPaymentNet } = props
  const isOwner = currentUser.role === 'owner'

  return (
    <Tabs defaultValue="expenses" className="flex min-h-0 flex-1 flex-col gap-card-gap">
      <PageLayout className="min-h-0 flex-1 overflow-hidden" header={(
        <PageHeader title="Register" tools={(
          <div className="min-w-0 overflow-x-auto">
            <PageHeaderTabsList aria-label="Register sections" className={`grid min-w-max ${isOwner ? 'grid-cols-3' : 'grid-cols-1'}`}>
              <PageHeaderTab value="expenses">Expenses</PageHeaderTab>
              {isOwner ? <>
                <PageHeaderTab value="loan-taken">New Loan</PageHeaderTab>
                <PageHeaderTab value="loan-repayment">Loan Repayment</PageHeaderTab>
              </> : null}
            </PageHeaderTabsList>
          </div>
        )} />
      )}>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <TabsContent value="expenses" className="mt-0 min-h-0">
            <div className="grid min-h-0 gap-2.5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
              <ExpenseForm currentUser={currentUser} onSave={async (draft) => { await saveExpense(draft); showToast(`Expense saved: ${draft.category} - ${money(draft.amount)}`) }} />
              <aside className="grid content-start gap-2.5"><section className="grid gap-2.5 sm:grid-cols-2"><SummaryCard label="Today Expense" value={money(todayExpense)} /><SummaryCard label="Today Payments (Net)" value={money(todayPaymentNet)} /></section></aside>
            </div>
          </TabsContent>
          {isOwner ? <>
            <TabsContent value="loan-taken" className="mt-0 min-h-0">
              <LoanForm peopleOptions={partyOptions} onSave={async (draft) => { await saveLoan(draft); showToast(`Loan saved: ${draft.personName} - ${money(draft.amount)}`) }} />
            </TabsContent>
            <TabsContent value="loan-repayment" className="mt-0 min-h-0">
              <LoanRepaymentForm loans={loans} onSave={async (draft) => { await savePayment(draft); showToast(`Loan payment saved: ${draft.partyName} - ${money(draft.amount)}`) }} />
            </TabsContent>
          </> : null}
        </div>
      </PageLayout>
    </Tabs>
  )
}
