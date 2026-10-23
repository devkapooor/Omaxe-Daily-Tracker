import { useEffect, useRef, useState } from 'react';
import { doc, getDocFromServer } from 'firebase/firestore';
import type { AppUser } from '@/domain/financeTypes';
import type { VendorV2 } from '@/domain/vendorLedgerV2';
import { auth, db } from '@/shared/lib/firebase';
import { cashoutCategories, money, today } from '@/app/uiHelpers';
import { postFinanceOperation } from '@/features/register/data/financeRepository';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader } from '@/shared/ui/card';
import { FieldLabel } from '@/shared/ui/field-label';
import { Input } from '@/shared/ui/input';
import { NativeSelect } from '@/shared/ui/native-select';
import { Textarea } from '@/shared/ui/textarea';
import { SectionHeading } from '@/shared/ui/section-heading';
import { StockVendorPicker } from '@/features/stock/components/StockVendorPicker';
import { SelectField } from '@/shared/ui/select-field';
import { usePaymentInvoiceChoices } from '@/features/register/hooks/usePaymentInvoiceChoices';
type Target = {
  vendorId: string;
  invoiceId?: string;
};
export function RegisterPaymentForm({
  currentUser,
  onSaved
}: {
  currentUser: AppUser;
  onSaved: () => void;
}) {
  const [target] = useState<Target>(() => {
    const key = 'alphahub:register-target:' + currentUser.id;
    const raw = sessionStorage.getItem(key);
    sessionStorage.removeItem(key);
    return raw ? JSON.parse(raw) as Target : {
      vendorId: ''
    };
  });
  const [kind, setKind] = useState(target.vendorId ? 'vendor-payment' : 'expense'),
    [mode, setMode] = useState('cash'),
    [amount, setAmount] = useState(''),
    [category, setCategory] = useState(cashoutCategories[0]),
    [paidTo, setPaidTo] = useState(''),
    [notes, setNotes] = useState(''),
    [vendorId, setVendorId] = useState(target.vendorId),
    [invoiceId, setInvoiceId] = useState(target.invoiceId || ''),
    [selectedVendor, setSelectedVendor] = useState<VendorV2 | null>(null),
    [paymentsSaved, setPaymentsSaved] = useState(0),
    [payable, setPayable] = useState<number | null>(null),
    [number, setNumber] = useState(''),
    [chequeDate, setChequeDate] = useState(today),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const submitting = useRef(false),
    paymentId = useRef(crypto.randomUUID());
  const chequeAllowed = currentUser.role === 'owner';
  const invoiceChoices = usePaymentInvoiceChoices(kind === 'vendor-payment' ? vendorId : '', paymentsSaved === 0 && vendorId === target.vendorId ? target.invoiceId || '' : '', paymentsSaved);
  useEffect(() => {
    if (!target.vendorId || vendorId !== target.vendorId) return;
    let active = true;
    void getDocFromServer(doc(db, 'vendorsV2', target.vendorId)).then(selected => {
      if (active && selected.exists()) setSelectedVendor({ ...selected.data(), id: selected.id } as VendorV2);
    }).catch(e => {
      if (active) setError(e.message);
    });
    return () => {
      active = false;
    };
  }, [target.vendorId, vendorId]);
  useEffect(() => {
    if (!vendorId) return;
    let active = true;
    void getDocFromServer(doc(db, 'vendorAccountStatesV2', vendorId)).then(account => {
      if (!active) return;
      setPayable(account.exists() ? Number(account.get('outstandingPaise')) : 0);
    }).catch(e => {
      if (active) setError(e.message);
    });
    return () => {
      active = false;
    };
  }, [vendorId, paymentsSaved]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    if (!/^\d+(?:\.\d{1,2})?$/.test(amount) || Number(amount) < 0 || kind === 'vendor-payment' && Number(amount) === 0) {
      setError('Enter a valid amount with up to two decimals.');
      return;
    }
    if (mode === 'cheque' && !chequeAllowed) {
      setError('Owner cheque permission is required.');
      return;
    }
    if (kind === 'vendor-payment' && (!vendorId || invoiceId && (invoiceChoices.loading || !invoiceChoices.items.some(invoice => invoice.id === invoiceId)))) {
      setError('Choose a vendor and a valid open invoice, or use a vendor account payment.');
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      const amountPaise = Math.round(Number(amount) * 100);
      if (mode === 'cheque') {
        await postFinanceOperation('cheque-issue', {
          purpose: kind,
          amountPaise,
          chequeBookId: 'book-1120-1199',
          chequeNumber: number,
          date: chequeDate,
          ...(kind === 'vendor-payment' ? {
            vendorId,
            ...(invoiceId ? {
              invoiceId
            } : {})
          } : {
            paidTo,
            category
          }),
          notes
        });
      } else if (kind === 'vendor-payment') {
        await postFinanceOperation('vendor-payment', {
          id: paymentId.current,
          vendorId,
          ...(invoiceId ? {
            invoiceId
          } : {}),
          date: today(),
          amountPaise,
          mode,
          notes
        });
      } else await postFinanceOperation('expense', {
        amountPaise,
        category,
        paidTo,
        mode,
        notes
      });
      paymentId.current = crypto.randomUUID();
      setAmount('');
      setNotes('');
      setNumber('');
      setInvoiceId('');
      setPayable(null);
      setPaymentsSaved(value => value + 1);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Payment result could not be confirmed. Recover before retrying.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return <Card><CardHeader><SectionHeading eyebrow="Register" title="New Payment" description="Record once. Cash, bank, vendor balances and Logs update together." /></CardHeader><CardContent><form onSubmit={event => void submit(event)} className="grid gap-3 sm:grid-cols-2"><FieldLabel label="Payment type"><NativeSelect value={kind} onChange={e => {
            setKind(e.target.value);
          }}><option value="expense">Ordinary expense</option><option value="vendor-payment">Vendor payment</option></NativeSelect></FieldLabel><FieldLabel label="Payment method"><NativeSelect value={mode} onChange={e => setMode(e.target.value)}><option value="cash">Counter Cash</option><option value="bank-transfer">Bank Transfer</option>{chequeAllowed ? <option value="cheque">Cheque</option> : null}</NativeSelect></FieldLabel>{kind === 'vendor-payment' ? <><FieldLabel label="Vendor"><StockVendorPicker value={vendorId} selected={selectedVendor} onSelect={vendor => {
              setSelectedVendor(vendor);
              setVendorId(vendor.id);
              setInvoiceId('');
              setPayable(null);
            }} /></FieldLabel><FieldLabel label="Invoice allocation"><SelectField value={invoiceId} onValueChange={setInvoiceId} options={[{value:'', label:'Vendor account payment'}, ...invoiceChoices.items.map(invoice => ({value:invoice.id, label:invoice.invoiceId + ' — ' + money((invoice.openAmountPaise - invoice.reservedAmountPaise) / 100) + ' available'}))]} placeholder="Choose invoice or vendor account" panelFooter={<div className="space-y-2 border-t px-2.5 py-2 text-xs text-muted-foreground">{invoiceChoices.loading || invoiceChoices.moreLoading ? <p role="status">Loading invoices…</p> : null}{invoiceChoices.error ? <div role="alert"><p className="text-destructive">{invoiceChoices.error}</p><Button type="button" size="sm" variant="outline" onClick={invoiceChoices.retry}>Retry invoices</Button></div> : null}{invoiceChoices.hasMore ? <Button type="button" size="sm" variant="outline" disabled={invoiceChoices.moreLoading} onClick={invoiceChoices.loadMore}>Load more invoices</Button> : null}</div>} /></FieldLabel><p className="text-xs text-muted-foreground sm:col-span-2">{payable === null ? 'Select a vendor.' : 'Recorded payable: ' + money(payable / 100)}. Server checks payable and cheque commitments before posting.</p></> : <><FieldLabel label="Recipient"><Input required value={paidTo} onChange={e => setPaidTo(e.target.value)} /></FieldLabel><FieldLabel label="Category"><NativeSelect value={category} onChange={e => setCategory(e.target.value)}>{cashoutCategories.map(c => <option key={c}>{c}</option>)}</NativeSelect></FieldLabel></>}<FieldLabel label="Amount (₹)"><Input required type="number" min={kind === 'vendor-payment' ? '0.01' : '0'} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></FieldLabel>{mode === 'cheque' ? <><FieldLabel label="Cheque number"><Input required value={number} onChange={e => setNumber(e.target.value)} /></FieldLabel><FieldLabel label="Cheque date"><Input required type="date" value={chequeDate} onChange={e => setChequeDate(e.target.value)} /></FieldLabel><p className="text-xs text-muted-foreground sm:col-span-2">Saved as Issued. In progress is shown when due; linked payable is reduced only after owner confirms debit. The app does not track bank balances.</p></> : <p className="self-end text-xs text-muted-foreground">{mode === 'cash' ? 'Uses the open shared counter. Counting pauses payments.' : 'Recorded bank outflow; does not use drawer cash.'}</p>}<FieldLabel className="sm:col-span-2" label="Notes"><Textarea value={notes} maxLength={1000} onChange={e => setNotes(e.target.value)} /></FieldLabel>{error ? <p role="alert" className="text-sm text-destructive sm:col-span-2">{error}</p> : null}<Button className="sm:col-span-2" disabled={busy || !auth.currentUser} type="submit">{busy ? 'Posting…' : mode === 'cheque' ? 'Register issued cheque' : 'Record payment'}</Button></form></CardContent></Card>;
}
