import { useState } from 'react';
import type { AppUser, CashoutDraft } from '@/domain/financeTypes';
import { RegisterPaymentForm } from '@/features/register/components/RegisterPaymentForm';
import { RegisterPaymentHistory } from '@/features/register/components/RegisterPaymentHistory';
import { RegisterCheques } from '@/features/register/components/RegisterCheques';
import { RegisterDrawerStatus } from '@/features/register/components/RegisterDrawerStatus';
import { FinanceOperationBoundary } from '@/features/register/components/FinanceOperationBoundary';
import { PageHeader, PageHeaderTab, PageHeaderTabsList } from '@/shared/ui/page-header';
import { PageLayout } from '@/shared/ui/page-layout';
import { Tabs, TabsContent } from '@/shared/ui/tabs';
type Props = {
  currentUser: AppUser;
  todayExpense: number;
  todayPaymentNet: number;
  saveExpense: (draft: CashoutDraft) => Promise<void>;
  showToast: (message: string) => void;
};
export function RegisterPage({
  currentUser,
  showToast
}: Props) {
  const [tab, setTab] = useState('new');
  return <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col"><PageLayout className="min-h-0 flex-1 overflow-hidden" header={<PageHeader title="Register" tools={<PageHeaderTabsList aria-label="Register sections"><PageHeaderTab value="new">New Payment</PageHeaderTab><PageHeaderTab value="history">Payment History</PageHeaderTab>{currentUser.role === 'owner' ? <PageHeaderTab value="cheques">Cheques</PageHeaderTab> : null}</PageHeaderTabsList>} />}><div className="min-h-0 flex-1 overflow-y-auto pr-1"><FinanceOperationBoundary uid={currentUser.id}><RegisterDrawerStatus /><TabsContent value="new"><RegisterPaymentForm currentUser={currentUser} onSaved={() => showToast('Payment recorded. Linked balances updated.')} /></TabsContent><TabsContent value="history"><RegisterPaymentHistory /></TabsContent>{currentUser.role === 'owner' ? <TabsContent value="cheques"><RegisterCheques /></TabsContent> : null}</FinanceOperationBoundary></div></PageLayout></Tabs>;
}
