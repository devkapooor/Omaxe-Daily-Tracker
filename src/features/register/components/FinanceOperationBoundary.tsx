import { useEffect, useState } from 'react';
import { financeOperationInFlight, pendingFinanceOperation, recoverFinanceOperation, type PendingFinanceOperation } from '@/features/register/data/financeRepository';
import { Button } from '@/shared/ui/button';

type RecoveredNotice = { uid: string; reference: string };
const recoveredNoticeKey = 'alphahub:finance-recovered';

function readRecoveredNotice(uid: string): RecoveredNotice | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(recoveredNoticeKey) || 'null') as RecoveredNotice | null;
    return value?.uid === uid ? value : null;
  } catch {
    return null;
  }
}

function clearRecoveredNotice(uid: string) {
  try {
    if (readRecoveredNotice(uid)) sessionStorage.removeItem(recoveredNoticeKey);
  } catch {
    // A presentation notice must not interfere with the separate recovery journal.
  }
}

export function FinanceOperationBoundary({
  uid,
  children,
  fill = false
}: {
  uid: string;
  children: React.ReactNode;
  fill?: boolean;
}) {
  const [pending, setPending] = useState<PendingFinanceOperation | null>(() => pendingFinanceOperation(uid)),
    [busy, setBusy] = useState(false),
    [posting, setPosting] = useState(() => financeOperationInFlight(uid)),
    [recovered, setRecovered] = useState(() => readRecoveredNotice(uid)),
    [error, setError] = useState('');
  useEffect(() => {
    const sync = () => {
      const saved = pendingFinanceOperation(uid);
      setPending(saved);
      setPosting(financeOperationInFlight(uid));
      if (saved) clearRecoveredNotice(uid);
      setRecovered(readRecoveredNotice(uid));
    };
    window.addEventListener('alphahub-finance-operation', sync);
    window.addEventListener('storage', sync);
    sync();
    return () => {
      window.removeEventListener('alphahub-finance-operation', sync);
      window.removeEventListener('storage', sync);
    };
  }, [uid]);
  const saving = posting || busy;
  return <div className={fill ? 'flex min-h-0 flex-1 flex-col' : 'contents'}>
    {recovered?.uid === uid && !pending && !saving ? <section role="status" className="mb-2 rounded-lg border border-success/30 p-3 text-sm">
      <div className="flex items-center justify-between gap-3"><p>Original financial result recovered. Review the saved transaction before recording another payment.</p><Button size="sm" variant="ghost" aria-label="Dismiss recovery notice" onClick={() => {
        clearRecoveredNotice(uid);
        setRecovered(null);
      }}>Dismiss</Button></div>
      <details className="mt-1 text-xs text-muted-foreground"><summary className="cursor-pointer">Details</summary><p className="mt-1 break-all">Reference: {recovered.reference}</p></details>
    </section> : null}
    {saving ? <p role="status" className="mb-2 text-sm text-muted-foreground">{busy ? 'Recovering original result...' : 'Saving...'}</p> : pending ? <section role="alert" className="mb-3 rounded-lg border border-warning/40 bg-warning/10 p-3">
      <strong>Financial operation needs recovery</strong>
      <p className="my-2 text-sm">We could not confirm the result. Recover the original result before recording another payment.</p>
      <Button onClick={() => {
        setBusy(true);
        setError('');
        void recoverFinanceOperation().then(() => window.location.reload()).catch(e => setError(e instanceof Error ? e.message : 'Recovery failed.')).finally(() => setBusy(false));
      }}>Recover original result</Button>
      <details className="mt-2 text-xs text-muted-foreground"><summary className="cursor-pointer">Details</summary><p className="mt-1 break-all">Reference: {String(pending.intent.operationId)}</p></details>
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
    </section> : null}
    <fieldset disabled={!!pending || saving} className={`m-0 min-w-0 border-0 p-0 ${fill ? 'flex min-h-0 flex-1 flex-col' : ''}`} aria-busy={saving}>{children}</fieldset>
  </div>;
}
