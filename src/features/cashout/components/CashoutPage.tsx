import type { AppUser } from '@/domain/financeTypes'
import type { CashoutCorrectionRequest, CashoutCorrectionValues, DailyCashoutEntry } from '@/domain/appTypes'
import { formatDisplayDate, money } from '@/app/uiHelpers'
import { CashoutCorrectionPanel } from '@/features/cashout/components/CashoutCorrectionPanel'
import { DailyCashoutForm } from '@/features/cashout/components/DailyCashoutForm'
import { GlowCard } from '@/shared/ui/spotlight-card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs'

type CashoutPageProps = {
  correctionRequests: CashoutCorrectionRequest[]
  currentUser: AppUser
  dailyCashouts: DailyCashoutEntry[]
  latestClosedDay: string | null
  latestClosedDayExpenses: number
  onSave: (draft: Omit<DailyCashoutEntry, 'id' | 'createdAt'>) => Promise<void>
  onSubmitCorrection: (cashoutId: string, proposed: CashoutCorrectionValues, reason: string, actor: AppUser) => Promise<void>
  onWithdrawCorrection: (requestId: string, actor: AppUser) => Promise<void>
  showToast: (message: string) => void
}

export function CashoutPage(props: CashoutPageProps) {
  const { correctionRequests, currentUser, dailyCashouts, latestClosedDay, latestClosedDayExpenses, onSave, onSubmitCorrection, onWithdrawCorrection, showToast } = props
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5">
      <section>
        <GlowCard className="w-full px-3.5 py-2.5 shadow-[0_10px_22px_rgba(24,32,27,0.06)]">
          <span className="block text-[11px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">
            {latestClosedDay ? `Latest Closed Day Expenses - ${formatDisplayDate(latestClosedDay)}` : 'Today Expenses'}
          </span>
          <strong className="mt-1.5 block text-lg font-black tracking-tight text-foreground">{money(latestClosedDayExpenses)}</strong>
        </GlowCard>
      </section>
      <section className="min-h-0 flex-1 overflow-hidden">
        <Tabs defaultValue="new" className="flex h-full min-h-0 flex-col">
          <TabsList className="mb-1 min-h-9 grid-cols-2"><TabsTrigger value="new">New Cashout</TabsTrigger><TabsTrigger value="corrections">Corrections</TabsTrigger></TabsList>
          <TabsContent value="new" className="min-h-0 flex-1">
            <DailyCashoutForm currentUserId={currentUser.id} currentUserName={currentUser.name} onSave={async (draft) => {
              await onSave(draft)
              showToast(draft.auditStatus === 'matched' ? `Cashout + Sales saved. Drawer total: ${money(draft.drawerTotal ?? draft.remainingBalance)}` : `${draft.auditMessage} Drawer total saved: ${money(draft.drawerTotal ?? draft.remainingBalance)}`)
            }} />
          </TabsContent>
          <TabsContent value="corrections" className="min-h-0 flex-1">
            <CashoutCorrectionPanel currentUser={currentUser} dailyCashouts={dailyCashouts} requests={correctionRequests} onSubmit={async (entry, values, reason) => {
              await onSubmitCorrection(entry.id, values, reason, currentUser)
              showToast('Correction request submitted for owner approval.')
            }} onWithdraw={async (requestId) => {
              await onWithdrawCorrection(requestId, currentUser)
              showToast('Correction request withdrawn.')
            }} />
          </TabsContent>
        </Tabs>
      </section>
    </div>
  )
}
