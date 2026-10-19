import { useEffect, useState } from 'react';
import { collection, doc, getDocFromServer, limit, onSnapshot, orderBy, query, startAfter, where, type QueryDocumentSnapshot } from 'firebase/firestore';
import { Eye } from 'lucide-react';
import { db } from '@/shared/lib/firebase';
import type { Cashout } from '@/domain/financeTypes';
import { formatDisplayDate, money } from '@/app/uiHelpers';
import { Button } from '@/shared/ui/button';
import { Card, CardContent } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { NativeSelect } from '@/shared/ui/native-select';
export function RegisterPaymentHistory() {
  const [method, setMethod] = useState(''),
    [type, setType] = useState(''),
    [page, setPage] = useState<{
      items: Cashout[];
      more: boolean;
    }>({
      items: [],
      more: false
    }),
    [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null),
    [next, setNext] = useState<QueryDocumentSnapshot | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [refresh, setRefresh] = useState(0),
    [selected, setSelected] = useState<Cashout | null>(null),
    [source, setSource] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    const filters = [...(method ? [where('paymentMode', '==', method)] : []), ...(type ? [where('sourceKind', '==', type)] : [])];
    const stop = onSnapshot(query(collection(db, 'cashouts'), ...filters, orderBy('createdAt', 'desc'), ...(cursor ? [startAfter(cursor)] : []), limit(26)), s => {
      setPage({
        items: s.docs.slice(0, 25).map(d => ({
          ...d.data(),
          id: d.id
        }) as Cashout),
        more: s.size > 25
      });
      setNext(s.docs[24] || null);
      setLoading(false);
      setError('');
    }, e => {
      setError(e.message);
      setLoading(false);
    });
    return () => stop();
  }, [method, type, cursor, refresh]);
  async function view(item: Cashout) {
    setSelected(item);
    setSource(null);
    try {
      const collectionName = item.chequeNumber ? 'chequesV2' : item.sourceKind === 'vendor-payment' ? 'vendorSettlementsV2' : item.sourceKind === 'pos-return' ? 'posSandboxes/test/approvals' : null;
      if (collectionName) {
        const id = item.chequeNumber || (item.sourceKind === 'pos-return' ? item.approvalId : item.sourceRecordId);
        if (id) {
          const s = await getDocFromServer(doc(db, collectionName, id));
          setSource(s.exists() ? s.data() : {
            status: 'Original record unavailable'
          });
        }
      }
    } catch (e) {
      setSource({
        status: e instanceof Error ? e.message : 'Source unavailable for your role.'
      });
    }
  }
  return <Card><CardContent className="grid gap-3 p-4"><div className="flex flex-wrap gap-2"><NativeSelect aria-label="Payment method filter" value={method} onChange={e => {
          setLoading(true);
          setPage({
            items: [],
            more: false
          });
          setMethod(e.target.value);
          setCursor(null);
        }}><option value="">All methods</option>{['Cash', 'Bank Transfer', 'Cheque', 'UPI', 'Card'].map(m => <option key={m}>{m}</option>)}</NativeSelect><NativeSelect aria-label="Payment type filter" value={type} onChange={e => {
          setLoading(true);
          setPage({
            items: [],
            more: false
          });
          setType(e.target.value);
          setCursor(null);
        }}><option value="">All outflows</option><option value="expense">Ordinary expenses</option><option value="vendor-payment">Vendor payments</option><option value="pos-return">POS refunds</option></NativeSelect><Button variant="outline" onClick={() => {
          setCursor(null);
          setRefresh(n => n + 1);
        }}>Refresh</Button></div>{loading ? <p role="status">Loading payment history…</p> : null}{error ? <p role="alert" className="text-destructive">{error}</p> : null}{!loading && !error && !page.items.length ? <p>No outflows found for these filters.</p> : null}{page.items.map(item => <article key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3"><div><strong>{item.paidTo} — {money(item.amount)}</strong><p className="text-xs text-muted-foreground">{formatDisplayDate(item.date)} · {item.sourceKind || 'Legacy expense'} · {item.paymentMode} · {item.postedByName || item.approvedBy || 'Recorder not recorded'}</p></div><Button size="icon" variant="ghost" aria-label={'View payment ' + item.paidTo} onClick={() => void view(item)}><Eye className="h-4 w-4" /></Button></article>)}<div className="flex gap-2">{cursor ? <Button variant="outline" onClick={() => {
          setLoading(true);
          setCursor(null);
        }}>First page</Button> : null}{page.more ? <Button disabled={loading} onClick={() => {
          setLoading(true);
          setCursor(next);
        }}>Next page</Button> : null}</div>{selected ? <div role="dialog" aria-modal="true" aria-label="Payment details" className="fixed inset-0 z-[140] flex items-center justify-center bg-black/50 p-3"><Card className="max-h-[90dvh] w-full max-w-xl overflow-y-auto"><CardContent className="grid gap-3 p-4"><h2 className="font-semibold">Payment details</h2><Input aria-label="Source reference" readOnly value={selected.sourceRecordId || selected.id} /><p>{selected.paidTo} · {money(selected.amount)} · {selected.paymentMode}</p><p>Type: {selected.sourceKind || 'Legacy expense'} · Status: {selected.paymentStatus || 'Recorded'}</p><p>Recorder: {selected.postedByName || 'Not recorded'}</p><p>{selected.notes || 'No notes recorded.'}</p>{source ? <p className="text-xs">Source status: {String(source.status || source.reviewStatus || 'Recorded')} · Source amount: {typeof source.amountPaise === 'number' ? money(source.amountPaise / 100) : typeof source.refundAmountPaise === 'number' ? money(source.refundAmountPaise / 100) : 'Not recorded'}</p> : null}<Button onClick={() => setSelected(null)}>Close</Button></CardContent></Card></div> : null}</CardContent></Card>;
}
