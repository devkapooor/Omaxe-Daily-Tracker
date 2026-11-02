import { useEffect, useRef, useState } from 'react';
import { money } from '@/app/uiHelpers';
import { getHistoricalDrawerReview, postFinanceOperation, type HistoricalDrawerReview } from '@/features/register/data/financeRepository';
import { Button } from '@/shared/ui/button';
import { FieldLabel } from '@/shared/ui/field-label';
import { Textarea } from '@/shared/ui/textarea';

export function HistoricalDrawerCorrection({ date, disabled, refreshKey, onSaved }: { date: string; disabled: boolean; refreshKey: number; onSaved: () => void }) {
  const [view, setView] = useState<HistoricalDrawerReview | null>(null);
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const submitting = useRef(false);
  useEffect(() => {
    let active = true;
    getHistoricalDrawerReview(date).then(value => {
      if (active) { setView(value); setConfirmed(false); setError(''); }
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Unable to review the drawer deduction.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [date, refresh, refreshKey]);
  const cash = (value = 0) => money(value / 100, 2);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current || !view?.eligible || !confirmed || reason.trim().length < 5 || disabled || loading || view.countActive) return;
    submitting.current = true; setBusy(true); setError(''); setSuccess('');
    try {
      const result = await postFinanceOperation<{ restoredPaise: number; afterPaise: number }>('cashout-drawer-reversal', {
        date, cashoutId: view.cashoutId, expectedRevision: view.expectedRevision,
        expectedFingerprint: view.expectedFingerprint, expectedRestorePaise: view.restorePaise, reason: reason.trim()
      });
      setSuccess(`Audited drawer correction saved: ${cash(result.restoredPaise)}. Virtual drawer: ${cash(result.afterPaise)}. The historical Cashout and sales are preserved.`);
      setReason(''); setLoading(true); onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to correct the duplicate deduction.'); }
    finally { submitting.current = false; setBusy(false); }
  }
  if (!view?.eligible && !error) return success ? <p role="status" className="mb-4 text-sm">{success}</p> : null;
  return <details className="mb-4 rounded-lg border border-warning/40 p-3" aria-label="Duplicate drawer deduction correction">
    <summary className="cursor-pointer text-sm font-semibold">Correct duplicate drawer deduction</summary>
    <form onSubmit={event => void save(event)} className="mt-3 space-y-3" aria-label="Correct historical drawer deduction">
      <p className="text-xs text-muted-foreground">Use only when this past Cashout recorded cash that had already been removed earlier. It preserves the Cashout, sales and original debit evidence, and adds an audited correction.</p>
      {view?.eligible ? <>
        <p className="text-sm">Original recorded deduction: <strong>{cash(view.originalDebitPaise)}</strong>. Correction still needed in the live drawer: <strong>{cash(view.restorePaise)}</strong>.</p>
        {view.absorbedByLaterCount ? <p className="text-xs text-warning">A later physical count or drawer closing already absorbed some or all of the deduction. Only the remaining effect is corrected; already counted cash is not added again.</p> : null}
        <p className="text-sm">Drawer at review: {cash(view.beforePaise)}. After correction: {cash(view.afterPaise)}. Subsequent sales and expenses are preserved when saving.</p>
        <FieldLabel label="Duplicate deduction correction reason"><Textarea rows={2} className="min-h-16" disabled={disabled || busy} required minLength={5} value={reason} onChange={event => setReason(event.target.value)} /></FieldLabel>
        <label className="flex gap-2 text-sm"><input type="checkbox" disabled={disabled || busy} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I confirm the cash was already removed earlier and this drawer deduction was duplicated.</label>
        {view.countActive ? <p role="alert" className="text-sm text-warning">A physical cash count is active. Finish or cancel it, then refresh this preview.</p> : null}
        <div className="flex flex-wrap gap-2"><Button className="h-auto min-h-10 max-w-full whitespace-normal" type="submit" disabled={disabled || busy || loading || !confirmed || reason.trim().length < 5 || view.countActive}>{busy ? 'Saving...' : 'Apply audited drawer correction'}</Button><Button type="button" variant="outline" disabled={disabled || busy || loading} onClick={() => { setLoading(true); setRefresh(value => value + 1); }}>Refresh drawer preview</Button></div>
      </> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {!view?.eligible ? <Button type="button" variant="outline" disabled={disabled || busy || loading} onClick={() => { setLoading(true); setRefresh(value => value + 1); }}>Retry drawer preview</Button> : null}
    </form>
  </details>;
}
