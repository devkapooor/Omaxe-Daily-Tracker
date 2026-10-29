import { useEffect, useState } from 'react';
import { financeOperationInFlight, pendingFinanceOperation, recoverFinanceOperation, type PendingFinanceOperation } from '@/features/register/data/financeRepository';
import { Button } from '@/shared/ui/button';
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
    [error, setError] = useState('');
  useEffect(() => {
    const sync = () => { setPending(pendingFinanceOperation(uid)); setPosting(financeOperationInFlight(uid)); };
    window.addEventListener('alphahub-finance-operation', sync);
    window.addEventListener('storage', sync);
    sync();
    return () => {
      window.removeEventListener('alphahub-finance-operation', sync);
      window.removeEventListener('storage', sync);
    };
  }, [uid]);
  const recovered = (() => {
    try {
      const value = JSON.parse(sessionStorage.getItem('alphahub:finance-recovered') || 'null') as {
        uid: string;
        reference: string;
      } | null;
      return value?.uid === uid ? value : null;
    } catch {
      return null;
    }
  })();
  return <div className={fill ? 'flex min-h-0 flex-1 flex-col' : 'contents'}>{recovered ? <p role="status" className="mb-2 rounded-lg border border-success/30 p-3 text-sm">Original financial result recovered. Reference: {recovered.reference}. Review its source before recording another payment.</p> : null}{pending ? <section role={posting ? 'status' : 'alert'} className="mb-3 rounded-lg border border-warning/40 bg-warning/10 p-3"><strong>{posting ? 'Recording financial operationâ€¦' : 'Financial operation needs recovery'}</strong><p className="my-2 text-sm">Confirm the original result before recording another payment. Reference: {String(pending.intent.operationId)}</p><Button disabled={busy || posting} onClick={() => {
        setBusy(true);
        void recoverFinanceOperation().then(() => window.location.reload()).catch(e => setError(e instanceof Error ? e.message : 'Recovery failed.')).finally(() => setBusy(false));
      }}>{busy ? 'Recoveringâ€¦' : 'Recover original result'}</Button>{error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}</section> : null}<fieldset disabled={!!pending || posting || busy} className={`m-0 min-w-0 border-0 p-0 ${fill ? 'flex min-h-0 flex-1 flex-col' : ''}`} aria-busy={posting || busy}>{children}</fieldset></div>;
}
