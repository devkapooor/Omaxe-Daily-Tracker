import { useEffect, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/shared/lib/firebase';
import type { DailyCashoutEntry, DrawerDenominations } from '@/domain/appTypes';
import { formatDisplayDate, money, today } from '@/app/uiHelpers';
import { drawerTotalFromDenominations } from '@/domain/cashoutCorrections';
import { getFinanceCashoutSummary, postFinanceOperation, type FinanceCashoutQuote } from '@/features/register/data/financeRepository';
import { FinanceOperationBoundary } from '@/features/register/components/FinanceOperationBoundary';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader } from '@/shared/ui/card';
import { FieldLabel } from '@/shared/ui/field-label';
import { Input } from '@/shared/ui/input';
import { SectionHeading } from '@/shared/ui/section-heading';
import { Textarea } from '@/shared/ui/textarea';
type Props = {
  currentUserId: string;
  currentUserName: string;
  todayCashExpenses: number;
  onSave: (draft: Omit<DailyCashoutEntry, 'id' | 'createdAt'>) => Promise<void> | void;
};
const empty: DrawerDenominations = {
  denom500: 0,
  denom200: 0,
  denom100: 0,
  denom50: 0,
  denom20: 0,
  denom10: 0,
  change: 0
};
const cash = (value: number) => money(value / 100);
export function DailyCashoutForm({
  currentUserId,
  currentUserName,
  onSave
}: Props) {
  const storageKey = 'alphahub:cashout-count:' + currentUserId,
    [quote, setQuote] = useState<FinanceCashoutQuote | null>(() => {
      const raw = localStorage.getItem(storageKey);
      try {
        return raw ? JSON.parse(raw) as FinanceCashoutQuote : null;
      } catch {
        return null;
      }
    }),
    [entryDate, setEntryDate] = useState(quote?.date || today()),
    [summary, setSummary] = useState<FinanceCashoutQuote | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [credit, setCredit] = useState('0'),
    [reason, setReason] = useState(''),
    [counts, setCounts] = useState<DrawerDenominations>(empty),
    [refresh, setRefresh] = useState(0);
  const submitting = useRef(false);
  useEffect(() => {
    let active = true,
      running = false,
      queued = false;
    async function load() {
      if (running) {
        queued = true;
        return;
      }
      running = true;
      setLoading(true);
      try {
        const data = await getFinanceCashoutSummary(entryDate);
        if (active) {
          setSummary(data);
          setError('');
        }
      } catch (e) {
        if (active) {
          setSummary(null);
          setError(e instanceof Error ? e.message : 'Unable to load trusted totals.');
        }
      } finally {
        running = false;
        if (active) setLoading(false);
        if (queued && active) {
          queued = false;
          void load();
        }
      }
    }
    let lastRevision: number | undefined;
    const stop = onSnapshot(doc(db, 'posSandboxes', 'test', 'handover', 'main'), {
      includeMetadataChanges: true
    }, s => {
      if (s.metadata.fromCache) return;
      const revision = s.get('revision') as number;
      if (lastRevision === revision) return;
      lastRevision = revision;
      void load();
    }, e => {
      if (active) {
        setError(e.message);
        setLoading(false);
      }
    });
    return () => {
      active = false;
      stop();
    };
  }, [entryDate, refresh]);
  useEffect(() => {
    if (!quote) return;
    return onSnapshot(doc(db, 'financeCashoutQuotes', quote.id), s => {
      if (s.exists() && (s.get('closedAt') || s.get('cancelledAt'))) {
        localStorage.removeItem(storageKey);
        setQuote(null);
        setCounts(empty);
        setRefresh(n => n + 1);
      }
    }, e => setError(e.message));
  }, [quote, storageKey]);
  const view = quote || summary,
    drawerTotal = drawerTotalFromDenominations(counts, true),
    difference = view ? drawerTotal - view.expectedDrawerPaise / 100 : 0;
  async function begin(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      const result = await postFinanceOperation<FinanceCashoutQuote>('cashout-count-start', {
        date: entryDate
      });
      localStorage.setItem(storageKey, JSON.stringify(result));
      setQuote(result);
      setCounts(empty);
      setReason('');
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to start count.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  async function cancel() {
    if (submitting.current || !quote) return;
    submitting.current = true;
    setBusy(true);
    try {
      await postFinanceOperation('cashout-count-cancel', {
        quoteId: quote.id
      });
      localStorage.removeItem(storageKey);
      setQuote(null);
      setCounts(empty);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to cancel count.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  async function close(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current || !quote) return;
    if (difference !== 0 && !reason.trim()) {
      setError('Enter the discrepancy reason.');
      return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      await onSave({
        financeQuoteId: quote.id,
        date: quote.date,
        recordedBy: currentUserName,
        recordedByUserId: currentUserId,
        cashSales: quote.grossMethods.cash / 100,
        upiSales: quote.grossMethods.upi / 100,
        cardSales: quote.grossMethods.card / 100,
        creditSales: Number(credit),
        returns: quote.windowRefundPaise / 100,
        cashExpense: quote.cashPaidOutPaise / 100,
        cashAudit: quote.expectedDrawerPaise / 100,
        drawerDenominations: counts,
        drawerTotal,
        remainingBalance: drawerTotal,
        actualCashParticulars: 'Server derives denomination evidence.',
        pendingCashParticulars: 'Server derives source totals.',
        discrepancyReason: reason
      });
      localStorage.removeItem(storageKey);
      setQuote(null);
      setCounts(empty);
      setCredit('0');
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to confirm closing. Recover the original result before posting another closing.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <FinanceOperationBoundary uid={currentUserId}>
      <Card className="flex min-h-0 flex-col">
        <CardHeader><SectionHeading eyebrow="Daily Details" title="Cashout Register" /></CardHeader>
        <CardContent>
          <form onSubmit={event => void begin(event)}>
            <fieldset disabled={!!quote} aria-hidden={quote ? true : undefined} className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              <FieldLabel label="Cashout For Date"><Input type="date" required disabled={busy} value={entryDate} onChange={e => { setEntryDate(e.target.value); setSummary(null); }} /></FieldLabel>
              <FieldLabel label="Cash Sale Recorded"><Input aria-label="Gross cash collections (before refunds)" readOnly value={view ? view.grossMethods.cash / 100 : '—'} /></FieldLabel>
              <FieldLabel label="Machine Total (UPI + Card)"><Input aria-label="Gross UPI + Card collections" readOnly value={view ? (view.grossMethods.upi + view.grossMethods.card) / 100 : '—'} /></FieldLabel>
              <FieldLabel label="Credit Sale Recorded"><Input aria-label="Declared non-POS credit sales" type="number" min="0" step="0.01" value={credit} onChange={e => setCredit(e.target.value)} /></FieldLabel>
              <FieldLabel label="Cash Paid Out"><Input aria-label="Cash Paid Out (source-linked)" readOnly value={view ? view.cashPaidOutPaise / 100 : '—'} /></FieldLabel>
              <FieldLabel label="Expected Cash (Including Opening Balance)"><Input aria-label="Expected cash including opening balance" readOnly value={view ? view.expectedDrawerPaise / 100 : '—'} /></FieldLabel>
              <FieldLabel label="System Audit (Expected Drawer)"><Input aria-label="Expected drawer / System Audit" readOnly value={view ? view.expectedDrawerPaise / 100 : '—'} /></FieldLabel>
              <FieldLabel label="By"><Input readOnly value={currentUserName} /></FieldLabel>
              <FieldLabel label="Cash Refunds"><Input readOnly value={view ? view.cashRefundPaise / 100 : '—'} /></FieldLabel>
              <p className="text-xs text-muted-foreground md:col-span-2 lg:col-span-3">Cash Sale Recorded is before refunds. Cash Paid Out includes refunds, expenses and vendor cash payments; Cash Refunds is part of that total. Expected cash includes the opening/count balance.</p>
              {view ? <details className="rounded-lg border border-border/70 bg-secondary/35 p-3 text-sm md:col-span-2 lg:col-span-3">
                <summary className="cursor-pointer font-semibold">Reconciliation details · {formatDisplayDate(view.date)}</summary>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3"><p>Gross cash sales: <strong>{cash(view.grossMethods.cash)}</strong></p><p>Cash refunds: <strong>{cash(view.cashRefundPaise)}</strong></p><p>Net cash sales: <strong>{cash(view.netCashCollectionsPaise)}</strong></p><p>Vendor cash payments: <strong>{cash(view.vendorCashPaymentPaise)}</strong></p><p>Other cash expenses: <strong>{cash(view.ordinaryCashExpensePaise)}</strong></p><p>Expected drawer: <strong>{cash(view.expectedDrawerPaise)}</strong></p></div>
                <p className="mt-3 text-xs text-muted-foreground">Latest counted balance {cash(view.openingCheckpointPaise)} + cash movement since that count {cash(view.subsequentNetCashPaise)} = expected drawer {cash(view.expectedDrawerPaise)}. Earlier activity may already be included in the latest count.</p>
                <p className="mt-2 text-xs text-muted-foreground">Receipt amounts remain gross. Refunds and payouts affect cash once. Add missing payments in Register.</p>
              </details> : null}
              {view && view.legacyUntrackedCashOutflowPaise > 0 ? <p className="text-xs text-warning md:col-span-2 lg:col-span-3">Legacy cash entries {cash(view.legacyUntrackedCashOutflowPaise)} lack trusted drawer posting evidence. They are not deducted again automatically. Preserve any manual deduction already made during Cashout.</p> : null}
              {loading ? <p role="status" className="md:col-span-2 lg:col-span-3">Loading trusted totals…</p> : null}
              {error && !quote ? <div role="alert" className="text-sm text-destructive md:col-span-2 lg:col-span-3"><p>{error}</p><Button type="button" variant="outline" onClick={() => setRefresh(n => n + 1)}>Retry totals</Button></div> : null}
              <Button disabled={busy || loading || !summary} type="submit" className="md:col-span-2 lg:col-span-3">{busy ? 'Starting count…' : 'Continue To Cash Drawer'}</Button>
            </fieldset>
          </form>
        </CardContent>
      </Card>
      {quote ? <CashDrawerDialog quoteId={quote.id} busy={busy} onCancel={() => void cancel()}>
        <CardHeader><SectionHeading eyebrow="Cash Drawer Particulars" title="Complete Daily Cashout" /><p className="text-sm text-muted-foreground">Count the drawer for {formatDisplayDate(quote.date)}. Expected cash: <strong>{cash(quote.expectedDrawerPaise)}</strong>.</p></CardHeader>
        <CardContent role="region" aria-label="Complete Daily Cashout">
          <p className="mb-4 text-xs text-muted-foreground">Drawer activity pauses during this five-minute count. Refresh preserves the count reference; recount if it expires.</p>
          <form className="grid gap-5 md:grid-cols-2 lg:grid-cols-3" onSubmit={event => void close(event)}>
            {(Object.keys(empty) as Array<keyof DrawerDenominations>).map(key => <FieldLabel key={key} label={key === 'change' ? 'Loose change (₹)' : key.replace('denom', '')}><Input type="number" min="0" step={key === 'change' ? '0.01' : '1'} required value={counts[key]} onChange={e => setCounts(old => ({ ...old, [key]: Number(e.target.value) }))} /></FieldLabel>)}
            <FieldLabel label="Drawer Total"><Input readOnly value={drawerTotal} /></FieldLabel>
            <FieldLabel label="Difference (count − expected)"><Input readOnly value={difference} /></FieldLabel>
            <FieldLabel className="md:col-span-2 lg:col-span-3" label="Discrepancy reason / closing note"><Textarea required={difference !== 0} value={reason} onChange={e => setReason(e.target.value)} /></FieldLabel>
            <p className="text-xs md:col-span-2 lg:col-span-3">Counted cash goes to {currentUserName}. Drawer closes at ₹0.00; use Cash Movement for later transfers and deposits.</p>
            {error ? <p role="alert" className="text-sm text-destructive md:col-span-2 lg:col-span-3">{error}</p> : null}
            <div className="flex flex-col gap-3 md:col-span-2 lg:col-span-3 sm:flex-row"><Button type="button" variant="outline" disabled={busy} onClick={() => void cancel()}>Cancel count</Button><Button disabled={busy} type="submit">{busy ? 'Saving…' : 'Save Cashout and Close Drawer'}</Button></div>
          </form>
        </CardContent>
      </CashDrawerDialog> : null}
    </FinanceOperationBoundary>
  );
}

function CashDrawerDialog({ quoteId, busy, onCancel, children }: { quoteId: string; busy: boolean; onCancel: () => void; children: React.ReactNode }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef(onCancel);
  const busyRef = useRef(busy);
  useEffect(() => {
    cancelRef.current = onCancel;
    busyRef.current = busy;
  }, [onCancel, busy]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () => [...(dialogRef.current?.querySelectorAll<HTMLElement>('input:not(:disabled),textarea:not(:disabled),button:not(:disabled)') || [])];
    focusable()[0]?.focus();
    function handle(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busyRef.current) { event.preventDefault(); cancelRef.current(); }
      if (event.key !== 'Tab') return;
      const nodes = focusable(), first = nodes[0], last = nodes.at(-1);
      if (!first || !last) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', handle);
    return () => { document.removeEventListener('keydown', handle); previous?.focus(); };
  }, [quoteId]);
  return <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/40 px-3 py-6 backdrop-blur-sm"><Card ref={dialogRef} role="dialog" aria-modal="true" aria-label="Complete Daily Cashout" className="max-h-[90dvh] w-full max-w-3xl overflow-y-auto">{children}</Card></div>;
}
