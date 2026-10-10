import type { Payment, PaymentDraft } from '@/domain/financeTypes'
import type { LoanEntry } from '@/domain/appTypes'
import { money } from '@/app/uiHelpers'
import { LoanForm } from '@/features/register/components/LoanForm'
import { LoanRepaymentForm } from '@/features/register/components/LoanRepaymentForm'
import { LoanLogTable, PaymentLogTable } from '@/features/logs/components/LogDataTables'
import { SummaryCard } from '@/features/dashboard/components/SummaryCard'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { PageHeader, PageHeaderTab, PageHeaderTabsList } from '@/shared/ui/page-header'
import { PageLayout } from '@/shared/ui/page-layout'
import { SectionHeading } from '@/shared/ui/section-heading'
import { Tabs, TabsContent } from '@/shared/ui/tabs'

type LoansPageProps = {
  loans: LoanEntry[]
  payments: Payment[]
  partyOptions: string[]
  saveLoan: (draft: Omit<LoanEntry, 'id' | 'createdAt' | 'paidAmount' | 'remainingAmount' | 'status' | 'settledAt' | 'updatedAt'>) => Promise<void>
  savePayment: (draft: PaymentDraft) => Promise<void>
  onDeleteLoan: (loan: LoanEntry) => Promise<void> | void
  showToast: (message: string) => void
}

export function LoansPage({ loans, payments, partyOptions, saveLoan, savePayment, onDeleteLoan, showToast }: LoansPageProps) {
  const openLoans = loans.filter((loan) => loan.remainingAmount > 0)
  const settledLoans = loans.filter((loan) => loan.remainingAmount <= 0)
  const openBalance = openLoans.reduce((sum, loan) => sum + loan.remainingAmount, 0)
  const loanPayments = payments.filter((payment) => payment.entryType === 'loan-payment')
  const partyTotals = [...loans.reduce((totals, loan) => {
    const key = loan.personName.trim().toLowerCase()
    const total = totals.get(key) ?? { name: loan.personName.trim(), loanCount: 0, principal: 0, repaid: 0, outstanding: 0 }
    total.loanCount += 1
    total.principal += loan.amount
    total.repaid += loan.paidAmount
    total.outstanding += loan.remainingAmount
    totals.set(key, total)
    return totals
  }, new Map<string, { name: string; loanCount: number; principal: number; repaid: number; outstanding: number }>()).values()]
    .sort((left, right) => right.outstanding - left.outstanding || left.name.localeCompare(right.name))

  return (
    <Tabs defaultValue="loans" className="flex min-h-0 flex-1 flex-col gap-card-gap">
      <PageLayout className="min-h-0 flex-1 overflow-hidden" header={(
        <PageHeader title="Loans" tools={(
          <div className="min-w-0 overflow-x-auto">
            <PageHeaderTabsList aria-label="Loan sections" className="grid min-w-max grid-cols-5">
              <PageHeaderTab value="loans">Loans</PageHeaderTab>
              <PageHeaderTab value="loan-details">Loan Details</PageHeaderTab>
              <PageHeaderTab value="new-loan">New Loan</PageHeaderTab>
              <PageHeaderTab value="repayment">Record Repayment</PageHeaderTab>
              <PageHeaderTab value="repayments">Repayment History</PageHeaderTab>
            </PageHeaderTabsList>
          </div>
        )} />
      )}>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <TabsContent value="loans" className="mt-0 grid gap-2.5">
            <div className="grid gap-2.5 sm:grid-cols-3">
              <SummaryCard label="Outstanding Balance" value={money(openBalance)} />
              <SummaryCard label="Open Loans" value={String(openLoans.length)} />
              <SummaryCard label="Settled Loans" value={String(settledLoans.length)} />
            </div>
            <Card>
              <CardHeader>
                <SectionHeading eyebrow="By party" title="Loan Totals" description="Principal, repayments, and outstanding balances grouped by party." />
              </CardHeader>
              <CardContent>
                {partyTotals.length === 0 ? <p className="text-sm text-muted-foreground">No loan records are available.</p> : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[620px] text-left text-sm">
                      <thead className="border-b border-border text-xs text-muted-foreground">
                        <tr><th className="px-2 py-2 font-semibold">Party</th><th className="px-2 py-2 text-right font-semibold">Loans</th><th className="px-2 py-2 text-right font-semibold">Principal</th><th className="px-2 py-2 text-right font-semibold">Repaid</th><th className="px-2 py-2 text-right font-semibold">Outstanding</th></tr>
                      </thead>
                      <tbody>
                        {partyTotals.map((party) => (
                          <tr key={party.name.toLowerCase()} className="border-b border-border/70 last:border-0">
                            <th className="px-2 py-2.5 font-medium text-foreground">{party.name}</th>
                            <td className="px-2 py-2.5 text-right tabular-nums">{party.loanCount}</td>
                            <td className="px-2 py-2.5 text-right tabular-nums">{money(party.principal)}</td>
                            <td className="px-2 py-2.5 text-right tabular-nums">{money(party.repaid)}</td>
                            <td className="px-2 py-2.5 text-right font-semibold tabular-nums">{money(party.outstanding)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="loan-details" className="mt-0 min-h-0">
            <LoanLogTable entries={loans} onDelete={onDeleteLoan} />
          </TabsContent>
          <TabsContent value="new-loan" className="mt-0 min-h-0">
            <LoanForm peopleOptions={partyOptions} onSave={async (draft) => { await saveLoan(draft); showToast(`Loan saved: ${draft.personName} - ${money(draft.amount)}`) }} />
          </TabsContent>
          <TabsContent value="repayment" className="mt-0 min-h-0">
            <LoanRepaymentForm loans={loans} onSave={async (draft) => { await savePayment(draft); showToast(`Loan payment saved: ${draft.partyName} - ${money(draft.amount)}`) }} />
          </TabsContent>
          <TabsContent value="repayments" className="mt-0 min-h-0">
            <PaymentLogTable entries={loanPayments} />
          </TabsContent>
        </div>
      </PageLayout>
    </Tabs>
  )
}
