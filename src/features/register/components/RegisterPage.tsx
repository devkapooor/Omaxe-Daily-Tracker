import type { AppUser, CashoutDraft, PaymentDraft } from '@/domain/financeTypes'
import type { LoanEntry } from '@/domain/appTypes'
import { money } from '@/app/uiHelpers'
import { ExpenseForm } from '@/features/register/components/ExpenseForm'
import { LoanForm } from '@/features/register/components/LoanForm'
import { LoanRepaymentForm } from '@/features/register/components/LoanRepaymentForm'
import { SummaryCard } from '@/features/dashboard/components/SummaryCard'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs'

type RegisterPageProps = {
  currentUser: AppUser
  partyOptions: string[]
  todayExpense: number
  todayPaymentNet: number
  ensureName: (type: 'people' | 'vendors', name: string) => Promise<boolean>
  saveExpense: (draft: CashoutDraft) => Promise<void>
  saveLoan: (draft: Omit<LoanEntry, 'id' | 'createdAt' | 'paidAmount' | 'remainingAmount' | 'status' | 'settledAt' | 'updatedAt'>) => Promise<void>
  savePayment: (draft: PaymentDraft) => Promise<void>
  showToast: (message: string) => void
}

export function RegisterPage(props: RegisterPageProps) {
  const { currentUser, ensureName, partyOptions, saveExpense, saveLoan, savePayment, showToast, todayExpense, todayPaymentNet } = props
  return (
    <section className="grid min-h-0 flex-1 gap-2.5 overflow-hidden">
      <Tabs defaultValue="expenses" className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-2 overflow-hidden">
        <TabsList className={currentUser.role === 'owner' ? 'min-h-9 grid-cols-2' : 'min-h-9 grid-cols-1'}>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          {currentUser.role === 'owner' ? <TabsTrigger value="loans">Loans</TabsTrigger> : null}
        </TabsList>
        <TabsContent value="expenses" className="min-h-0">
          <div className="grid min-h-0 gap-2.5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
            <ExpenseForm currentUser={currentUser} onSave={async (draft) => { await saveExpense(draft); showToast(`Expense saved: ${draft.category} - ${money(draft.amount)}`) }} />
            <aside className="grid content-start gap-2.5"><section className="grid gap-2.5 sm:grid-cols-2"><SummaryCard label="Today Expense" value={money(todayExpense)} /><SummaryCard label="Today Payments (Net)" value={money(todayPaymentNet)} /></section></aside>
          </div>
        </TabsContent>
        {currentUser.role === 'owner' ? <TabsContent value="loans" className="min-h-0">
          <Tabs defaultValue="loan-taken" className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2 overflow-hidden">
            <TabsList className="min-h-9 grid-cols-2"><TabsTrigger value="loan-taken">Loan Taken</TabsTrigger><TabsTrigger value="loan-repayment">Loan Repayment</TabsTrigger></TabsList>
            <TabsContent value="loan-taken" className="min-h-0"><LoanForm peopleOptions={partyOptions} onSave={async (draft) => { await saveLoan(draft); showToast(`Loan saved: ${draft.personName} - ${money(draft.amount)}`) }} /></TabsContent>
            <TabsContent value="loan-repayment" className="min-h-0"><LoanRepaymentForm peopleOptions={partyOptions} onSave={async (draft) => { await ensureName(draft.entryType === 'vendor-payment' ? 'vendors' : 'people', draft.partyName); await savePayment(draft); showToast(`Loan payment saved: ${draft.partyName} - ${money(draft.amount)}`) }} /></TabsContent>
          </Tabs>
        </TabsContent> : null}
      </Tabs>
    </section>
  )
}
