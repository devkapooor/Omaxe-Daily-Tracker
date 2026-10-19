import { useCallback, useEffect, useRef, useState } from 'react';
import { collection, doc, getDocFromServer, limit, onSnapshot, orderBy, query, startAfter, type QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from '@/shared/lib/firebase';
import type { ChequeV2 } from '@/domain/vendorLedgerV2';
import { formatDisplayDate, money, today } from '@/app/uiHelpers';
import { postFinanceOperation, presentDueCheque } from '@/features/register/data/financeRepository';
import { useConfirmationDialog } from '@/shared/ui/confirmation-dialog';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent } from '@/shared/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import { Ban, Check, Eye, Send, TriangleAlert } from 'lucide-react';
import { ChequeViewDialog } from '@/features/register/components/ChequeViewDialog';
export function RegisterCheques() {
  const [rows, setRows] = useState<ChequeV2[]>([]),
    [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null),
    [next, setNext] = useState<QueryDocumentSnapshot | null>(null),
    [more, setMore] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [selectedId, setSelectedId] = useState<string | null>(null),
    {
      confirm,
      dialog
    } = useConfirmationDialog(),
    presenting = useRef(new Set<string>());
  const [presentationErrors, setPresentationErrors] = useState<Record<string, string>>({});
  const deciding = useRef(false);
  const businessDate = today();
  const stageDue = useCallback((item: ChequeV2) => {
    const key = item.id + ':' + item.revision;
    if (presenting.current.has(key)) return;
    presenting.current.add(key);
    setPresentationErrors(previous => { const next = { ...previous }; delete next[item.id]; return next; });
    void presentDueCheque(item.chequeNumber).catch(cause => {
      presenting.current.delete(key);
      setPresentationErrors(previous => ({ ...previous, [item.id]: cause instanceof Error ? cause.message : 'Unable to update cheque status.' }));
    });
  }, []);
  const closeDetails = useCallback(() => setSelectedId(null), []);
  useEffect(() => {
    return onSnapshot(query(collection(db, 'chequesV2'), orderBy('date', 'desc'), ...(cursor ? [startAfter(cursor)] : []), limit(31)), s => {
      const items = s.docs.slice(0, 30).map(d => ({
        ...d.data(),
        id: d.id
      }) as ChequeV2);
      setRows(items);
      setMore(s.size > 30);
      setNext(s.docs[29] || null);
      setLoading(false);
      for (const item of items) {
        if (item.status === 'issued' && !item.trackingOnly && item.origin === 'v2' && item.date <= businessDate) {
          stageDue(item);
        }
      }
    }, e => {
      setError(e.message);
      setLoading(false);
    });
  }, [cursor, businessDate, stageDue]);
  async function decide(c: ChequeV2, toStatus: string) {
    if (deciding.current || (c.status === 'issued' && c.date <= businessDate)) return;
    deciding.current = true; setBusy(true); setError('');
    try {
      const source = await getDocFromServer(doc(db, 'chequesV2', c.id));
      if (!source.exists() || source.get('revision') !== c.revision) throw new Error('Cheque details changed. Review the current row and confirm again.');
      let reason = '';
      const answer = await confirm({
        title: toStatus === 'cancelled' ? 'Cancel cheque' : toStatus === 'bounced' ? 'Record cheque bounce' : toStatus === 'issued' ? 'Issue saved cheque' : 'Confirm bank debit',
        details: ['Cheque ' + c.chequeNumber + ' · ' + money(c.amountPaise / 100)],
        requireReason: ['cancelled', 'bounced'].includes(toStatus),
        warning: ['cancelled', 'bounced'].includes(toStatus) ? 'This releases the pending payment commitment. Bank and drawer balances are not debited.' : toStatus === 'issued' ? 'This issues the saved cheque as a payment commitment; it does not confirm bank debit.' : 'Bank book balance and linked payable update once. This action is final.',
        confirmationText: 'CONFIRM', confirmLabel: 'OK',
      });
      if (!answer) return;
      reason = typeof answer === 'string' ? answer : '';
      const checked = await getDocFromServer(doc(db, 'chequesV2', c.id));
      if (!checked.exists() || checked.get('revision') !== c.revision) throw new Error('Cheque changed while you were confirming. Review its current details and confirm again. No decision was submitted.');
      await postFinanceOperation('cheque-decision', { chequeNumber: c.chequeNumber, expectedRevision: c.revision, toStatus, ...(reason ? { reason } : {}) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Cheque decision failed.');
    } finally {
      deciding.current = false; setBusy(false);
    }
  }
  return (
    <Card className="min-w-0 max-w-full">
      <CardContent className="grid min-w-0 gap-3 p-4">
        <h2 className="font-semibold">Cheques</h2>
        <p className="text-xs text-muted-foreground">Before the cheque date: Issued. On or after the date: In progress. Mark as debited only after the bank confirms payment; this action is final.</p>
        {loading ? <p role="status">Loading cheques…</p> : null}
        {error ? <p role="alert" className="text-destructive">{error}</p> : null}
        <Table aria-label="Cheques" className="min-w-[48rem]" containerClassName="max-w-full">
          <TableHeader><TableRow><TableHead scope="col">Cheque no.</TableHead><TableHead scope="col">Cheque date</TableHead><TableHead scope="col">Payment</TableHead><TableHead scope="col" className="text-right">Amount</TableHead><TableHead scope="col">Status</TableHead><TableHead scope="col" className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {!loading && !rows.length ? <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No cheques recorded.</TableCell></TableRow> : null}
            {rows.map(c => <TableRow key={c.id} aria-label={'Cheque ' + c.chequeNumber}>
              <TableCell className="font-semibold">{c.chequeNumber}</TableCell>
              <TableCell>{formatDisplayDate(c.date)}</TableCell>
              <TableCell><p>{c.purpose === 'vendor-payment' ? 'Vendor payment' : 'Expense'}</p>{c.vendorId ? <p className="max-w-48 truncate text-xs text-muted-foreground" title={c.vendorId}>{c.vendorId}</p> : null}</TableCell>
              <TableCell className="text-right font-semibold tabular-nums">{money(c.amountPaise / 100)}</TableCell>
              <TableCell><Badge>{['issued', 'presented'].includes(c.status) ? c.date > businessDate ? 'Issued' : 'In progress' : c.status.charAt(0).toUpperCase() + c.status.slice(1)}</Badge>{c.status === 'issued' && c.date <= businessDate && !c.trackingOnly && c.origin === 'v2' ? <div className="mt-1 text-xs text-muted-foreground">{presentationErrors[c.id] ? <><p role="alert">{presentationErrors[c.id]}</p><Button size="sm" variant="outline" onClick={() => stageDue(c)}>Retry status update</Button></> : <span role="status">Updating status…</span>}</div> : null}</TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <Button type="button" size="icon" variant="ghost" aria-label={'View cheque ' + c.chequeNumber} title="View cheque details" onClick={() => setSelectedId(c.id)}><Eye className="size-4" /></Button>
                  {!c.trackingOnly && c.origin === 'v2' && ['issued', 'presented'].includes(c.status) ? <>
                    <Button type="button" size="icon" variant="ghost" className="text-primary" disabled={busy || c.date > businessDate || c.status === 'issued'} aria-label={'Mark cheque ' + c.chequeNumber + ' as debited'} title={c.date > businessDate ? 'Debit available on the cheque date' : 'Mark as debited · final'} onClick={() => void decide(c, 'debited')}><Check className="size-4" /></Button>
                    <Button type="button" size="icon" variant="ghost" className="text-destructive" disabled={busy || (c.status === 'issued' && c.date <= businessDate)} aria-label={'Cancel cheque ' + c.chequeNumber} title="Cancel pending cheque" onClick={() => void decide(c, 'cancelled')}><Ban className="size-4" /></Button>
                    <Button type="button" size="icon" variant="ghost" className="text-warning" disabled={busy || c.date > businessDate} aria-label={'Record bounce for cheque ' + c.chequeNumber} title={c.date > businessDate ? 'Bounce available on the cheque date' : 'Record bounced cheque'} onClick={() => void decide(c, 'bounced')}><TriangleAlert className="size-4" /></Button>
                  </> : !c.trackingOnly && c.origin === 'v2' && c.status === 'draft' ? <Button type="button" size="icon" variant="ghost" disabled={busy} aria-label={'Issue saved cheque ' + c.chequeNumber} title="Issue saved cheque" onClick={() => void decide(c, 'issued')}><Send className="size-4" /></Button> : null}
                </div>
              </TableCell>
            </TableRow>)}
          </TableBody>
        </Table>
        <p className="text-xs text-muted-foreground md:hidden">Swipe the table sideways to see all columns.</p>
        <div className="flex gap-2">{cursor ? <Button variant="outline" onClick={() => { setLoading(true); setCursor(null); }}>First page</Button> : null}{more ? <Button disabled={loading} onClick={() => { setLoading(true); setCursor(next); }}>Next page</Button> : null}</div>
        {selectedId ? <ChequeViewDialog key={selectedId} chequeId={selectedId} onClose={closeDetails} /> : null}
        {dialog}
      </CardContent>
    </Card>
  );
}
