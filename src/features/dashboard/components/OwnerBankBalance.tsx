import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import type { AppUser } from '@/domain/financeTypes';
import { db } from '@/shared/lib/firebase';
import { money } from '@/app/uiHelpers';
import { postFinanceOperation } from '@/features/register/data/financeRepository';
import { useConfirmationDialog } from '@/shared/ui/confirmation-dialog';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { FieldLabel } from '@/shared/ui/field-label';
import { Card, CardContent } from '@/shared/ui/card';
import { FinanceOperationBoundary } from '@/features/register/components/FinanceOperationBoundary';
export function OwnerBankBalance({
  currentUser
}: {
  currentUser: AppUser;
}) {
  const [bank, setBank] = useState<{
      initialized: boolean;
      balancePaise: number;
      revision: number;
    } | null>(null),
    [baseline, setBaseline] = useState(''),
    [reason, setReason] = useState(''),
    [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    {
      confirm,
      dialog
    } = useConfirmationDialog();
  useEffect(() => {
    const fail = (e: Error) => setError(e.message);
    const stopBank = currentUser.role === 'owner' ? onSnapshot(doc(db, 'bankBalanceControl', 'main'), s => setBank(s.exists() ? s.data() as {
      initialized: boolean;
      balancePaise: number;
      revision: number;
    } : null), fail) : () => {};
    return stopBank;
  }, [currentUser.id, currentUser.role]);
  async function save() {
    if (busy) return;
    if (!/^\d+(?:\.\d{1,2})?$/.test(baseline) || !reason.trim()) {
      setError('Enter a bank balance and reconciliation reason.');
      return;
    }
    if (!(await confirm({
      title: 'Confirm recorded bank baseline',
      details: ['Bank book balance: ' + money(Number(baseline)), reason],
      warning: 'This is a recorded balance, not a bank statement connection. Historical payments will not be replayed.',
      confirmationText: 'CONFIRM',
      confirmLabel: 'OK'
    }))) return;
    setBusy(true);
    try {
      await postFinanceOperation('bank-baseline', {
        balancePaise: Math.round(Number(baseline) * 100),
        expectedRevision: bank?.revision || 0,
        reason
      });
      setEditing(false);
      setReason('');
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bank confirmation failed.');
    } finally {
      setBusy(false);
    }
  }
  if (currentUser.role !== 'owner') return null;
  return <FinanceOperationBoundary uid={currentUser.id}><Card><CardContent className="grid gap-3 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p>Recorded bank balance <strong>{bank?.initialized ? money(bank.balancePaise / 100) : 'Owner confirmation required'}</strong></p><Button type="button" variant="outline" onClick={() => setEditing(v => !v)}>{bank?.initialized ? 'Reconcile bank book balance' : 'Confirm bank opening balance'}</Button></div>{editing ? <div className="grid gap-2 sm:grid-cols-2"><FieldLabel label="Confirmed bank balance (₹)"><Input type="number" min="0" step="0.01" value={baseline} onChange={e => setBaseline(e.target.value)} /></FieldLabel><FieldLabel label="Reconciliation reason"><Input value={reason} onChange={e => setReason(e.target.value)} /></FieldLabel><Button disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Confirm recorded balance'}</Button></div> : null}{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}{dialog}</CardContent></Card></FinanceOperationBoundary>;
}
