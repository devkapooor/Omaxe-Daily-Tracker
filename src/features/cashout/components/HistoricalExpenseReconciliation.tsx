import { useEffect, useRef, useState } from 'react';
import { money } from '@/app/uiHelpers';
import { getHistoricalExpenseReview, postFinanceOperation, type HistoricalExpenseReview } from '@/features/register/data/financeRepository';
import { Button } from '@/shared/ui/button';
import { FieldLabel } from '@/shared/ui/field-label';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';

const cash = (paise: number) => money(paise / 100, 2);
export function HistoricalExpenseReconciliation({ date, disabled, onSaved }: { date: string; disabled: boolean; onSaved: () => void }) {
  const [review, setReview] = useState<HistoricalExpenseReview | null>(null);
  const [total, setTotal] = useState('');
  const [reason, setReason] = useState('');
  const [confirmCorrection, setConfirmCorrection] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const submitting = useRef(false);
  useEffect(() => {
    let active = true;
    getHistoricalExpenseReview(date).then(value => {
      if (!active) return;
      setReview(value);
      setTotal(String((value.savedConfirmedExpensePaise ?? value.confirmedExpensePaise) / 100));
      setConfirmCorrection(false);
      setError('');
    }).catch(cause => {
      if (active) { setReview(null); setError(cause instanceof Error ? cause.message : 'Unable to review historical expenses.'); }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [date, refresh]);
  function reload() { setLoading(true); setRefresh(value => value + 1); }
  const validTotal = /^\d+(\.\d{1,2})?$/.test(total) && Number.isSafeInteger(Math.round(Number(total) * 100));
  const totalPaise = validTotal ? Math.round(Number(total) * 100) : 0;
  const canSave = !!review && !disabled && !busy && !loading && validTotal && reason.trim().length >= 5
    && review.unclassifiedCashCount === 0 && !review.completedCorrectionBlockedReason && (!review.completedCashoutCount || confirmCorrection)
    && (review.revision === 0 || review.reconciliationStale || totalPaise !== review.confirmedExpensePaise);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!canSave || submitting.current || !review) return;
    submitting.current = true;
    setBusy(true); setError(''); setSuccess('');
    try {
      await postFinanceOperation('cashout-expense-reconcile', {
        date, totalPaise, reason: reason.trim(), expectedFingerprint: review.expectedFingerprint,
        correctCompleted: review.completedCashoutCount > 0
      });
      setReason('');
      setSuccess(review.completedCashoutCount ? 'Expense total confirmed and saved Cashout corrected. The live drawer is unchanged.' : 'Expense total confirmed for this date. The live drawer is unchanged.');
      reload();
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to confirm historical expenses.');
    } finally { submitting.current = false; setBusy(false); }
  }
  return <details className="mb-4 rounded-lg border border-border/70 p-3" aria-label="Historical expense reconciliation">
    <summary className="cursor-pointer text-sm font-semibold">Review historical cash expenses</summary>
    <div role="region" aria-label="Historical cash expense review" className="mt-3 space-y-3">
      <p className="text-xs text-muted-foreground">Confirm ordinary cash expenses for {date}. Vendor payments and refunds are added separately. This corrects historical reporting; it does not remove cash from today's drawer or create itemised expense entries.</p>
      {loading ? <p role="status">Loading expense review...</p> : null}
      {review ? <>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <p>Recorded cash expenses: <strong>{cash(review.recordedCashExpensePaise)}</strong></p>
          <p>Current historical adjustment: <strong>{cash(review.adjustmentPaise)}</strong></p>
          <p>Vendor cash payments: <strong>{cash(review.vendorCashPaymentPaise)}</strong></p>
          <p>Cash refunds: <strong>{cash(review.cashRefundPaise)}</strong></p>
        </div>
        {review.legacyCashExpensePaise > 0 ? <p className="text-xs text-muted-foreground">Recorded expenses include {cash(review.legacyCashExpensePaise)} from older records. Those records are retained.</p> : null}
        {review.lastConfirmedAt ? <p className="text-xs text-muted-foreground">Last confirmed total: {cash(review.savedConfirmedExpensePaise ?? 0)}. Reason: {review.lastReason}</p> : null}
        {review.reconciliationStale ? <p role="alert" className="text-sm text-warning">Sources changed after the last confirmation. Review the recorded amounts and confirm the total again before Cashout.</p> : null}
        {review.completedCorrectionBlockedReason ? <p role="alert" className="text-sm text-warning">{review.completedCorrectionBlockedReason}</p> : null}
        {review.unclassifiedCashCount > 0 ? <p role="alert" className="text-sm text-warning">{review.unclassifiedCashCount} cash entries totalling {cash(review.unclassifiedCashPaise)} need source classification. Reconciliation is blocked to avoid counting them incorrectly.</p> : null}
        <form onSubmit={event => void save(event)} className="grid gap-3 sm:grid-cols-2">
          <fieldset disabled={disabled || busy || loading} className="contents">
            <FieldLabel label="Confirmed total cash expenses"><Input type="number" min="0" step="0.01" required value={total} onChange={event => { setTotal(event.target.value); setSuccess(''); }} /></FieldLabel>
            <p className="self-center text-sm">Adjustment against recorded expenses: <strong>{validTotal ? cash(totalPaise - review.recordedCashExpensePaise) : '-'}</strong><br />Cash Paid Out after confirmation: <strong>{validTotal ? cash(totalPaise + review.vendorCashPaymentPaise + review.cashRefundPaise) : '-'}</strong></p>
            <FieldLabel label="Historical expense reason" className="sm:col-span-2"><Textarea className="min-h-16" rows={2} required minLength={5} value={reason} onChange={event => setReason(event.target.value)} placeholder="Explain the missing expense or corrected daily total." /></FieldLabel>
            {review.completedCashoutCount > 0 ? <label className="flex gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={confirmCorrection} onChange={event => setConfirmCorrection(event.target.checked)} />I confirm an audited expense correction to {review.completedCashoutCount} saved Cashout(s). Cash counts, sales and drawer balances stay unchanged.</label> : null}
            <div className="flex flex-wrap gap-2 sm:col-span-2"><Button className="h-auto min-h-10 max-w-full whitespace-normal" type="submit" disabled={!canSave}>{busy ? 'Saving...' : review.completedCashoutCount ? 'Confirm expenses and correct Cashout' : 'Confirm historical expenses'}</Button><Button type="button" variant="outline" disabled={busy || loading || disabled} onClick={() => { setSuccess(''); reload(); }}>Refresh expense review</Button></div>
          </fieldset>
        </form>
      </> : <Button type="button" variant="outline" disabled={loading || disabled} onClick={reload}>Retry expense review</Button>}
      {disabled ? <p className="text-xs text-warning">Cancel or finish the active cash count before changing historical expenses.</p> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {success ? <p role="status" className="text-sm">{success}</p> : null}
    </div>
  </details>;
}
