import type { AppUser } from '@/domain/financeTypes';
import type { CashoutCorrectionValues } from '@/domain/appTypes';
import type { StoreCollectionState } from '@/store/storeShared';
import { postFinanceOperation } from '@/features/register/data/financeRepository';
export function createCashoutCorrectionActions({
  getState
}: {
  getState: () => StoreCollectionState;
}) {
  function source(cashoutId: string) {
    const entry = getState().dailyCashouts.find(e => e.id === cashoutId);
    if (!entry) throw new Error('Cashout not found.');
    return entry;
  }
  async function submitCashoutCorrectionRequest(cashoutId: string, proposed: CashoutCorrectionValues, reason: string, _actor: AppUser) {
    void _actor;
    const entry = source(cashoutId);
    await postFinanceOperation('cashout-correction', {
      cashoutId,
      expectedRevision: entry.revision || 1,
      proposed,
      reason,
      applyImmediately: false
    });
  }
  async function editDailyCashoutEntry(cashoutId: string, proposed: CashoutCorrectionValues, reason: string, _actor: AppUser) {
    void _actor;
    const entry = source(cashoutId);
    await postFinanceOperation('cashout-correction', {
      cashoutId,
      expectedRevision: entry.revision || 1,
      proposed,
      reason,
      applyImmediately: true
    });
  }
  async function approveCashoutCorrectionRequest(requestId: string, _actor: AppUser) {
    void _actor;
    await postFinanceOperation('cashout-correction-decision', {
      requestId,
      decision: 'approve'
    });
  }
  async function rejectCashoutCorrectionRequest(requestId: string, reason: string, _actor: AppUser) {
    void _actor;
    await postFinanceOperation('cashout-correction-decision', {
      requestId,
      decision: 'reject',
      reason
    });
  }
  async function withdrawCashoutCorrectionRequest(requestId: string, _actor: AppUser) {
    void _actor;
    await postFinanceOperation('cashout-correction-decision', {
      requestId,
      decision: 'withdraw'
    });
  }
  return {
    submitCashoutCorrectionRequest,
    editDailyCashoutEntry,
    approveCashoutCorrectionRequest,
    rejectCashoutCorrectionRequest,
    withdrawCashoutCorrectionRequest
  };
}
