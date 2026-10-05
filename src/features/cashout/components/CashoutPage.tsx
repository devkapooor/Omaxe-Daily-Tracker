import type { AppUser } from '@/domain/financeTypes'
import type { CashoutCorrectionRequest, CashoutCorrectionValues, DailyCashoutEntry } from '@/domain/appTypes'
import { money } from '@/app/uiHelpers'
import { CashoutCorrectionPanel } from '@/features/cashout/components/CashoutCorrectionPanel'
import { DailyCashoutForm } from '@/features/cashout/components/DailyCashoutForm'
import { PageHeader, PageHeaderTab, PageHeaderTabsList } from '@/shared/ui/page-header'
import { PageLayout } from '@/shared/ui/page-layout'
import { Tabs, TabsContent } from '@/shared/ui/tabs'

type CashoutPageProps = {
  correctionRequests: CashoutCorrectionRequest[]
  currentUser: AppUser
  dailyCashouts: DailyCashoutEntry[]
  todayCashExpenses: number
  onSave: (draft: Omit<DailyCashoutEntry, 'id' | 'createdAt'>) => Promise<void>
  onSubmitCorrection: (cashoutId: string, proposed: CashoutCorrectionValues, reason: string, actor: AppUser) => Promise<void>
  onWithdrawCorrection: (requestId: string, actor: AppUser) => Promise<void>
  showToast: (message: string) => void
}

export function CashoutPage(props: CashoutPageProps) {
  const { correctionRequests, currentUser, dailyCashouts, todayCashExpenses, onSave, onSubmitCorrection, onWithdrawCorrection, showToast } = props
  return (
    <Tabs defaultValue="new" className="flex min-h-0 flex-1 flex-col">
      <PageLayout className="min-h-0 flex-1 overflow-hidden" header={(
        <PageHeader title="Cashout" tools={(
          <PageHeaderTabsList aria-label="Cashout sections" className="grid grid-cols-2">
            <PageHeaderTab value="new">New Cashout</PageHeaderTab>
            <PageHeaderTab value="corrections">Corrections</PageHeaderTab>
          </PageHeaderTabsList>
        )} />
      )}>
        <TabsContent value="new" className="m-0 min-h-0 flex-1">
          <DailyCashoutForm currentUserId={currentUser.id} currentUserName={currentUser.name} todayCashExpenses={todayCashExpenses} onSave={async (draft) => {
            await onSave(draft)
            showToast(draft.auditStatus === 'matched' ? `Cashout + Sales saved. ${money(draft.drawerTotal ?? draft.remainingBalance)} removed; POS drawer closed at ₹0.00.` : `${draft.auditMessage} ${money(draft.drawerTotal ?? draft.remainingBalance)} removed; POS drawer closed at ₹0.00.`)
          }} />
        </TabsContent>
        <TabsContent value="corrections" className="m-0 min-h-0 flex-1">
          <CashoutCorrectionPanel currentUser={currentUser} dailyCashouts={dailyCashouts} requests={correctionRequests} onSubmit={async (entry, values, reason) => {
            await onSubmitCorrection(entry.id, values, reason, currentUser)
            showToast('Correction request submitted for owner approval.')
          }} onWithdraw={async (requestId) => {
            await onWithdrawCorrection(requestId, currentUser)
            showToast('Correction request withdrawn.')
          }} />
        </TabsContent>
      </PageLayout>
    </Tabs>
  )
}
