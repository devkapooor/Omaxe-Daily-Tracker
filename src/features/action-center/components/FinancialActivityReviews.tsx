import { useEffect, useRef, useState } from 'react';
import { collection, getDocsFromServer, limit, orderBy, query, startAfter, where, type QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from '@/shared/lib/firebase';
import type { Cashout } from '@/domain/financeTypes';
import type { DailyCashoutEntry } from '@/domain/appTypes';
import { money, formatDisplayDate } from '@/app/uiHelpers';
import { postFinanceOperation } from '@/features/register/data/financeRepository';
import { FinanceOperationBoundary } from '@/features/register/components/FinanceOperationBoundary';
import { Button } from '@/shared/ui/button';
import { Card, CardContent } from '@/shared/ui/card';
type Activity = Cashout | DailyCashoutEntry;
type Props = {
  uid: string;
  history: boolean;
  outflows: Cashout[];
  cashouts: DailyCashoutEntry[];
  loading: boolean;
  error: string | null;
  more: boolean;
};
export function FinancialActivityReviews({
  uid,
  history,
  outflows,
  cashouts,
  loading,
  error,
  more
}: Props) {
  const [selected, setSelected] = useState<Activity | null>(null),
    [busy, setBusy] = useState(false),
    [issue, setIssue] = useState(''),
    [past, setPast] = useState<Activity[]>([]),
    [historyLoading, setHistoryLoading] = useState(false),
    [cursor, setCursor] = useState<Record<string, QueryDocumentSnapshot | null>>({
      cashouts: null,
      dailyCashouts: null
    }),
    [hasMore, setHasMore] = useState(true),
    [exhausted, setExhausted] = useState<Record<string, boolean>>({});
  const requestGeneration = useRef(0);
  const requestPending = useRef(false);
  async function load(reset = false) {
    if (requestPending.current) return;
    requestPending.current = true;
    const generation = requestGeneration.current;
    setHistoryLoading(true);
    try {
      const names = ['cashouts', 'dailyCashouts'].filter(name => reset || !exhausted[name]);
      const pages = await Promise.all(names.map(name => getDocsFromServer(query(collection(db, name), where('reviewStatus', '==', 'reviewed'), orderBy('createdAt', 'desc'), ...(!reset && cursor[name] ? [startAfter(cursor[name]!)] : []), limit(26)))));
      if (generation !== requestGeneration.current) return;
      const items = pages.flatMap(s => s.docs.slice(0, 25).map(d => ({
        ...d.data(),
        id: d.id
      }) as Activity));
      setPast(old => reset ? items : [...new Map([...old, ...items].map(v => [v.id, v])).values()]);
      setCursor(old => ({ ...old, ...Object.fromEntries(names.map((name, i) => [name, pages[i].docs[24] || null])) }));
      setExhausted(old => ({ ...old, ...Object.fromEntries(names.map((name, i) => [name, pages[i].size <= 25])) }));
      setHasMore(pages.some(s => s.size > 25));
      setIssue('');
    } catch (e) {
      setIssue(e instanceof Error ? e.message : 'Unable to load financial review history.');
    } finally {
      requestPending.current = false;
      if (generation === requestGeneration.current) setHistoryLoading(false);
    }
  }
  useEffect(() => {
    if (!history) return;
    requestGeneration.current += 1;
    let active = true;
    void Promise.all(['cashouts', 'dailyCashouts'].map(name => getDocsFromServer(query(collection(db, name), where('reviewStatus', '==', 'reviewed'), orderBy('createdAt', 'desc'), limit(26))))).then(pages => {
      if (!active) return;
      setPast(pages.flatMap(s => s.docs.slice(0, 25).map(d => ({
        ...d.data(),
        id: d.id
      }) as Activity)));
      setCursor(Object.fromEntries(['cashouts', 'dailyCashouts'].map((name, i) => [name, pages[i].docs[24] || null])));
      setExhausted(Object.fromEntries(['cashouts', 'dailyCashouts'].map((name, i) => [name, pages[i].size <= 25])));
      setHasMore(pages.some(s => s.size > 25));
    }).catch(e => {
      if (active) setIssue(e.message);
    }).finally(() => {
      if (active) setHistoryLoading(false);
    });
    return () => {
      active = false;
      requestGeneration.current += 1;
    };
  }, [history, uid]);
  const rows = [...(history ? past : [...outflows, ...cashouts])].sort((a, b) =>
    (history ? -1 : 1) * (a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)));
  async function review(item: Activity) {
    if (busy) return;
    setBusy(true);
    try {
      await postFinanceOperation('paidTo' in item ? 'outflow-review' : 'cashout-review', 'paidTo' in item ? {
        outflowId: item.id,
        expectedRevision: item.revision || 1
      } : {
        cashoutId: item.id,
        expectedRevision: item.revision || 1
      });
      setSelected(null);
      setIssue('');
    } catch (e) {
      setIssue(e instanceof Error ? e.message : 'Review failed.');
    } finally {
      setBusy(false);
    }
  }
  return <FinanceOperationBoundary uid={uid}><section aria-label="Posted financial activity" className="grid gap-2"><h2 className="font-semibold">Posted payments and Cashout discrepancies</h2><p className="text-xs text-muted-foreground">Informational review. These operations already posted; reviewing never pays, refunds or adjusts balances again.</p>{(history ? historyLoading : loading) ? <p role="status">Loading financial activity…</p> : null}{error || issue ? <p role="alert" className="text-destructive">{error || issue}</p> : null}{rows.map(item => <Card key={item.id}><CardContent className="flex flex-wrap items-center justify-between gap-2 p-3"><div><strong>{'paidTo' in item ? item.paidTo : 'Cashout · ' + item.recordedBy}</strong><p className="text-xs">{formatDisplayDate(item.date)} · {'paidTo' in item ? item.sourceKind : 'Cashout discrepancy'} · {money('paidTo' in item ? item.amount : item.auditDifference || 0)} · {'paidTo' in item ? item.postedByName : item.recordedBy}</p></div><Button variant="outline" size="sm" onClick={() => setSelected(item)}>View posted activity</Button></CardContent></Card>)}{!history && more ? <p className="text-xs">Showing 50 records per source; more appear as these are reviewed. The badge does not claim a complete count.</p> : null}{history ? <div className="flex gap-2"><Button variant="outline" disabled={historyLoading} onClick={() => void load(true)}>Refresh financial history</Button>{hasMore ? <Button disabled={historyLoading} onClick={() => void load()}>More financial history</Button> : null}</div> : null}{selected ? <div role="dialog" aria-modal="true" aria-label="Posted financial activity details" className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 p-3"><Card className="max-h-[90dvh] w-full max-w-xl overflow-y-auto"><CardContent className="grid gap-3 p-4"><h2 className="font-semibold">Posted activity — informational</h2><p>Reference: {selected.id}</p>{'paidTo' in selected ? <><p>{selected.paidTo} · {money(selected.amount)} · {selected.paymentMode}</p><p>Source: {selected.sourceRecordId || 'Not recorded'} · Recorder: {selected.postedByName || 'Not recorded'}</p><p>{selected.notes}</p></> : <><p>{selected.recordedBy} · Counted {money(selected.drawerTotal || 0)} · Expected {money(selected.cashAudit)}</p><p>Difference {money(selected.auditDifference || 0)} · {selected.discrepancyReason}</p></>}<p className="text-xs text-muted-foreground">Review does not change money or source postings.</p>{issue ? <p role="alert" className="text-destructive">{issue}</p> : null}<div className="flex gap-2"><Button disabled={busy} variant="outline" onClick={() => setSelected(null)}>Close</Button>{!history ? <Button disabled={busy} onClick={() => void review(selected)}>Mark Reviewed</Button> : null}</div></CardContent></Card></div> : null}</section></FinanceOperationBoundary>;
}
