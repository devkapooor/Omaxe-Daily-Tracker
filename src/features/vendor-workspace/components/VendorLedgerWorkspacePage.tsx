import { useMemo, useState } from 'react'
import { ShieldCheck, X } from 'lucide-react'
import { normalizeName, today } from '@/app/uiHelpers'
import type { AppUser } from '@/domain/financeTypes'
import type { PlannerScheduleItemSnapshot } from '@/domain/workspaceMetrics'
import {
  openInvoiceBalancesV2,
  rupeesToPaise,
  type ChequeStatus,
  type VendorSettlementMode,
} from '@/domain/vendorLedgerV2'
import { VendorDirectoryV2 } from '@/features/directory/components/VendorDirectoryV2'
import { OpenInvoicesV2 } from '@/features/register/components/OpenInvoicesV2'
import { PurchaseFormV2, type PurchaseV2Draft } from '@/features/register/components/PurchaseFormV2'
import { VendorSettlementFormV2, type VendorSettlementV2Draft } from '@/features/register/components/VendorSettlementFormV2'
import type { VendorLedgerV2Data } from '@/features/vendor-workspace/hooks/useVendorLedgerV2'
import { VendorLedgerPreActivationPage } from '@/features/vendor-workspace/components/VendorLedgerCutoverPlanner'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { FieldLabel } from '@/shared/ui/field-label'
import { Input } from '@/shared/ui/input'
import { SectionHeading } from '@/shared/ui/section-heading'
import { SelectField } from '@/shared/ui/select-field'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs'
import { Textarea } from '@/shared/ui/textarea'
import {
  applyOwnerSettlementCorrectionV2,
  createSettlementCorrectionRequestV2,
  createPurchaseV2,
  createSettlementV2,
  createVendorChequeV2,
  createVendorReturnV2,
  createVendorV2,
  transitionVendorChequeV2,
  withdrawSettlementCorrectionRequestV2,
} from '@/store/vendorLedgerV2Repository'

type Props = { currentUser: AppUser; ledger: VendorLedgerV2Data; legacyChequeItems: PlannerScheduleItemSnapshot[] }

const chequeActions: Record<ChequeStatus, { label: string; status: Exclude<ChequeStatus, 'draft'> }[]> = {
  draft: [{ label: 'Issue', status: 'issued' }],
  issued: [{ label: 'Present', status: 'presented' }, { label: 'Cancel', status: 'cancelled' }],
  presented: [
    { label: 'Mark Debited', status: 'debited' },
    { label: 'Bounce', status: 'bounced' },
    { label: 'Cancel', status: 'cancelled' },
  ],
  debited: [], cancelled: [], bounced: [],
}

export function VendorLedgerWorkspacePage({ currentUser, ledger, legacyChequeItems }: Props) {
  const [tab, setTab] = useState('directory')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [vendorFormOpen, setVendorFormOpen] = useState(false)
  const [paymentTarget, setPaymentTarget] = useState({ vendorId: '', invoiceId: '' })
  const balances = useMemo(
    () => openInvoiceBalancesV2(ledger.purchases, ledger.allocations),
    [ledger.allocations, ledger.purchases],
  )
  const vendorNameById = Object.fromEntries(ledger.vendors.map((vendor) => [vendor.id, vendor.canonicalName]))

  if (ledger.loading && !ledger.config) return <p className="p-4 text-sm text-muted-foreground">Checking V2 vendor ledger status...</p>
  if (ledger.config?.enabled !== true) {
    if (currentUser.role === 'owner') return <VendorLedgerPreActivationPage currentUser={currentUser} />
    return <Card><CardContent className="py-5 text-sm text-muted-foreground">The owner must activate the V2 vendor ledger before staff can enter vendor records.</CardContent></Card>
  }

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true)
    try {
      await action()
      setMessage(success)
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Unable to complete this V2 action.')
      throw cause
    } finally {
      setBusy(false)
    }
  }

  function openPayment(invoiceId: string, vendorId: string) {
    setPaymentTarget({ invoiceId, vendorId })
    setTab('payments')
  }

  async function savePurchase(draft: PurchaseV2Draft) {
    const id = crypto.randomUUID()
    await run(() => createPurchaseV2({
      id, ...draft, actorUserId: currentUser.id, timestamp: new Date().toISOString(),
    }), `Purchase ${draft.invoiceNumber} saved.`)
    return { purchaseId: id }
  }

  async function saveSettlement(draft: VendorSettlementV2Draft) {
    await run(() => createSettlementV2({
      id: crypto.randomUUID(), ...draft, actorUserId: currentUser.id, timestamp: new Date().toISOString(),
    }), 'Vendor payment saved.')
  }

  return (
    <section className="min-h-0 flex-1 overflow-y-auto pr-1">
      <div className="grid gap-2.5 pb-4">
        <Card className="border-cyan-400/25 bg-[linear-gradient(135deg,rgba(37,99,235,0.18),rgba(34,211,238,0.07))]">
          <CardContent className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-lg font-black">Vendor Ledger V2</h1>
            <Badge variant="success"><ShieldCheck className="mr-1 size-3" /> Active from {ledger.config.activationDate}</Badge>
          </CardContent>
        </Card>
        {ledger.error || message ? <p className="rounded-xl border border-border bg-secondary/50 px-3 py-2 text-sm">{ledger.error ?? message}</p> : null}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className={`${currentUser.role === 'owner' ? 'grid-cols-8' : 'grid-cols-7'} overflow-x-auto`}>
            <TabsTrigger value="directory">Vendors</TabsTrigger>
            <TabsTrigger value="purchases">Purchases</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="invoices">Invoices</TabsTrigger>
            <TabsTrigger value="returns">Returns</TabsTrigger>
            <TabsTrigger value="corrections">Corrections</TabsTrigger>
            {currentUser.role === 'owner' ? <TabsTrigger value="cheques">Cheques</TabsTrigger> : null}
            <TabsTrigger value="balances">Balances</TabsTrigger>
          </TabsList>
          <TabsContent value="directory" className="grid gap-2.5 pt-2">
            <VendorDirectoryV2 currentUserRole={currentUser.role} legacyVendorNames={[]} onAddVendor={() => setVendorFormOpen(true)} vendors={ledger.vendors} />
          </TabsContent>
          <TabsContent value="purchases" className="pt-2"><PurchaseFormV2 isBusy={busy} vendors={ledger.vendors} onSave={savePurchase} onRecordPayment={openPayment} /></TabsContent>
          <TabsContent value="payments" className="pt-2"><VendorSettlementFormV2 key={`${paymentTarget.vendorId}:${paymentTarget.invoiceId}`} balances={balances} initialInvoiceId={paymentTarget.invoiceId} initialVendorId={paymentTarget.vendorId} isBusy={busy} vendors={ledger.vendors} onSave={saveSettlement} /></TabsContent>
          <TabsContent value="invoices" className="pt-2"><OpenInvoicesV2 balances={balances} vendorNameById={vendorNameById} onRecordPayment={openPayment} /></TabsContent>
          <TabsContent value="returns" className="pt-2"><ReturnsPanel busy={busy} currentUser={currentUser} ledger={ledger} onRun={run} /></TabsContent>
          <TabsContent value="corrections" className="pt-2"><CorrectionForm busy={busy} currentUser={currentUser} ledger={ledger} vendors={vendorNameById} onRun={run} /></TabsContent>
          {currentUser.role === 'owner' ? <TabsContent value="cheques" className="pt-2"><ChequeRegister busy={busy} cheques={ledger.cheques} currentUser={currentUser} legacyChequeItems={legacyChequeItems} vendors={ledger.vendors} onRun={run} /></TabsContent> : null}
          <TabsContent value="balances" className="grid gap-2 pt-2">
            {ledger.accountStates.map((state) => <Card key={state.id}><CardContent className="flex items-center justify-between py-3"><span>{vendorNameById[state.vendorId] ?? state.vendorId}</span><strong>INR {(state.outstandingPaise / 100).toLocaleString('en-IN')}</strong></CardContent></Card>)}
          </TabsContent>
        </Tabs>
      </div>
      {vendorFormOpen ? (
        <VendorCreateModal
          busy={busy}
          currentUser={currentUser}
          onClose={() => setVendorFormOpen(false)}
          onRun={run}
          vendors={ledger.vendors}
        />
      ) : null}
    </section>
  )
}

function VendorCreateModal({ busy, currentUser, onClose, onRun, vendors }: {
  busy: boolean
  currentUser: AppUser
  onClose: () => void
  onRun: (action: () => Promise<unknown>, success: string) => Promise<void>
  vendors: VendorLedgerV2Data['vendors']
}) {
  const [name, setName] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [contact, setContact] = useState('')
  const [address, setAddress] = useState('')
  const [companiesProvided, setCompaniesProvided] = useState('')
  const [notes, setNotes] = useState('')
  const [formError, setFormError] = useState('')

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const savedName = normalizeName(name)
    const savedOwnerName = normalizeName(ownerName)
    const savedContact = contact.trim()
    const savedAddress = address.trim()
    const suppliedBrands = companiesProvided.split(',').map((company) => company.trim()).filter(Boolean)
    if (!savedName || !savedOwnerName || !savedContact || !savedAddress || suppliedBrands.length === 0) {
      setFormError('Vendor name, owner, contact, address, and at least one company are required.')
      return
    }
    if (vendors.some((vendor) => vendor.active && normalizeName(vendor.canonicalName).toLocaleLowerCase('en-IN') === savedName.toLocaleLowerCase('en-IN'))) {
      setFormError('An active vendor with this name already exists.')
      return
    }
    setFormError('')
    await onRun(() => createVendorV2({
      id: `vendor-${crypto.randomUUID()}`,
      canonicalName: savedName,
      ownerName: savedOwnerName,
      contact: savedContact,
      address: savedAddress,
      suppliedBrands,
      notes: notes.trim(),
      actorUserId: currentUser.id,
      timestamp: new Date().toISOString(),
    }), `Vendor ${savedName} created at zero opening.`)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-950/65 px-3 py-5 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="add-vendor-title">
      <Card className="max-h-[92dvh] w-full max-w-[46rem] overflow-y-auto border-cyan-200 shadow-[0_24px_80px_rgba(38,78,118,0.22)]">
        <CardHeader className="gap-3 border-b border-border/70">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-700">Vendor directory</p>
              <h2 id="add-vendor-title" className="mt-1 text-xl font-black text-foreground">Add V2 Vendor</h2>
            </div>
            <Button type="button" size="icon" variant="ghost" disabled={busy} aria-label="Close add vendor form" onClick={onClose}>
              <X className="size-5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <form className="grid gap-3.5 md:grid-cols-2" onSubmit={(event) => void handleSubmit(event).catch(() => undefined)}>
            {formError ? <p className="md:col-span-2 rounded-2xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm font-semibold text-rose-700">{formError}</p> : null}
            <FieldLabel label="Vendor Name">
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Vendor name" required autoFocus />
            </FieldLabel>
            <FieldLabel label="Owner Name">
              <Input value={ownerName} onChange={(event) => setOwnerName(event.target.value)} placeholder="Owner name" required />
            </FieldLabel>
            <FieldLabel label="Contact">
              <Input value={contact} onChange={(event) => setContact(event.target.value)} placeholder="Contact number" required />
            </FieldLabel>
            <FieldLabel label="Address">
              <Input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Vendor address" required />
            </FieldLabel>
            <FieldLabel className="md:col-span-2" label="Companies Provided">
              <Input value={companiesProvided} onChange={(event) => setCompaniesProvided(event.target.value)} placeholder="Example: ITC, HUL, Britannia" required />
            </FieldLabel>
            <FieldLabel className="md:col-span-2" label="Notes / Comments">
              <Textarea className="min-h-24" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Payment terms, service quality, or stock rhythm" />
            </FieldLabel>
            <div className="md:col-span-2 rounded-2xl border border-cyan-400/20 bg-cyan-400/5 px-3.5 py-3 text-sm text-muted-foreground">
              <strong className="text-foreground">Opening outstanding: INR 0.</strong> New vendors begin at zero so no legacy balance is copied into the V2 ledger.
            </div>
            <div className="flex flex-col-reverse gap-2 md:col-span-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
              <Button disabled={busy}>{busy ? 'Saving...' : 'Save Vendor'}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

function ReturnsPanel({ busy, currentUser, ledger, onRun }: {
  busy: boolean
  currentUser: AppUser
  ledger: VendorLedgerV2Data
  onRun: (action: () => Promise<unknown>, success: string) => Promise<void>
}) {
  const [vendorId, setVendorId] = useState('')
  const [sourcePurchaseId, setSourcePurchaseId] = useState('')
  const [date, setDate] = useState(today())
  const [description, setDescription] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unit, setUnit] = useState('pieces')
  const [value, setValue] = useState('')
  const [reason, setReason] = useState('')
  const vendorOptions = ledger.vendors.filter((vendor) => vendor.active).map((vendor) => ({ label: vendor.canonicalName, value: vendor.id }))
  const purchaseOptions = [{ label: 'No invoice link', value: '' }, ...ledger.purchases.filter((purchase) => purchase.vendorId === vendorId).map((purchase) => ({ label: `${purchase.invoiceNumber} | INR ${(purchase.invoiceTotalPaise / 100).toLocaleString('en-IN')}`, value: purchase.id }))]
  return <div className="grid gap-2.5"><Card><CardHeader><SectionHeading eyebrow="Vendor stock return" title="Record Return Request" description="Returns do not change balances until the owner records vendor credit. Replacements have no financial effect." /></CardHeader><CardContent><form className="grid gap-3 md:grid-cols-2 lg:grid-cols-3" onSubmit={(event) => { event.preventDefault(); void onRun(() => createVendorReturnV2({ id: crypto.randomUUID(), vendorId, ...(sourcePurchaseId ? { sourcePurchaseId } : {}), date, description, quantity: Number(quantity), unit, valuePaise: rupeesToPaise(Number(value)), reason, actorUserId: currentUser.id, timestamp: new Date().toISOString() }), 'Vendor return sent to the Action Centre.').then(() => { setDescription(''); setValue(''); setReason('') }).catch(() => undefined) }}><FieldLabel label="Vendor"><SelectField searchable options={vendorOptions} value={vendorId} onValueChange={(next) => { setVendorId(next); setSourcePurchaseId('') }} /></FieldLabel><FieldLabel label="Related Invoice (Optional)"><SelectField searchable options={purchaseOptions} value={sourcePurchaseId} onValueChange={setSourcePurchaseId} /></FieldLabel><FieldLabel label="Return Date"><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></FieldLabel><FieldLabel label="Item Description"><Input value={description} onChange={(event) => setDescription(event.target.value)} required /></FieldLabel><FieldLabel label="Quantity"><Input type="number" min="0.01" step="0.01" value={quantity} onChange={(event) => setQuantity(event.target.value)} required /></FieldLabel><FieldLabel label="Unit"><Input value={unit} onChange={(event) => setUnit(event.target.value)} required /></FieldLabel><FieldLabel label="Return Value"><Input type="number" min="0.01" step="0.01" value={value} onChange={(event) => setValue(event.target.value)} required /></FieldLabel><FieldLabel className="md:col-span-2" label="Mandatory Reason"><Textarea value={reason} onChange={(event) => setReason(event.target.value)} required /></FieldLabel><Button className="lg:col-span-3" disabled={busy || !vendorId}>Submit Return</Button></form></CardContent></Card><Card><CardHeader><SectionHeading eyebrow="Return history" title="Recorded Returns" /></CardHeader><CardContent className="grid gap-2">{ledger.returns.length === 0 ? <p className="text-sm text-muted-foreground">No vendor returns recorded.</p> : [...ledger.returns].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm"><div><strong>{ledger.vendors.find((vendor) => vendor.id === item.vendorId)?.canonicalName ?? item.vendorId}</strong><p className="text-muted-foreground">{item.description} | {item.quantity} {item.unit} | INR {(item.valuePaise / 100).toLocaleString('en-IN')}</p></div><Badge variant={item.outcome === 'vendor-credit' ? 'success' : item.outcome === 'rejected' ? 'destructive' : item.outcome === 'pending' ? 'warning' : 'secondary'}>{item.outcome}</Badge></div>)}</CardContent></Card></div>
}

function CorrectionForm({ busy, currentUser, ledger, onRun, vendors }: { busy: boolean; currentUser: AppUser; ledger: VendorLedgerV2Data; onRun: (action: () => Promise<unknown>, success: string) => Promise<void>; vendors: Record<string, string> }) {
  const [selectedId, setSelectedId] = useState('')
  const states = currentUser.role === 'owner'
    ? ledger.settlementStates
    : ledger.settlementStates.filter((state) => ledger.settlements.find((item) => item.id === state.id)?.createdByUserId === currentUser.id)
  const selected = states.find((state) => state.id === selectedId)
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [mode, setMode] = useState<VendorSettlementMode>('bank-transfer')
  const [notes, setNotes] = useState('')
  const [reason, setReason] = useState('')
  const options = states.map((state) => ({ label: `${vendors[state.vendorId] ?? state.vendorId} | INR ${(state.amountPaise / 100).toLocaleString('en-IN')} | ${state.date}`, value: state.id }))
  const selectState = (value: string) => { const state = states.find((item) => item.id === value); setSelectedId(value); setAmount(state ? String(state.amountPaise / 100) : ''); setDate(state?.date ?? ''); setMode(state?.mode ?? 'bank-transfer'); setNotes(state?.notes ?? '') }
  const pending = ledger.correctionRequests.filter((request) => request.status === 'pending')
  return <div className="grid gap-2.5"><Card><CardHeader><SectionHeading eyebrow={currentUser.role === 'owner' ? 'Owner audit' : 'Approval workflow'} title={currentUser.role === 'owner' ? 'Correct Vendor Payment' : 'Request Payment Correction'} /><p className="text-sm text-muted-foreground">The original payment remains unchanged. {currentUser.role === 'owner' ? 'A compensating audit entry is posted immediately.' : 'The owner must approve your request before any balance changes.'}</p></CardHeader><CardContent><form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); if (!selected) return; const action = currentUser.role === 'owner' ? applyOwnerSettlementCorrectionV2({ id: crypto.randomUUID(), sourceRecordId: selected.id, proposed: { date, amountPaise: rupeesToPaise(Number(amount)), mode, notes }, reason, actor: { id: currentUser.id, name: currentUser.name }, timestamp: new Date().toISOString() }) : createSettlementCorrectionRequestV2({ id: crypto.randomUUID(), sourceRecordId: selected.id, proposed: { date, amountPaise: rupeesToPaise(Number(amount)), mode, notes }, reason, actor: { id: currentUser.id, name: currentUser.name }, timestamp: new Date().toISOString() }); void onRun(() => action, currentUser.role === 'owner' ? 'Audited payment correction applied.' : 'Correction request sent to the Action Centre.').then(() => { setSelectedId(''); setAmount(''); setReason('') }).catch(() => undefined) }}><FieldLabel label="Saved Payment"><SelectField searchable options={options} value={selectedId} onValueChange={selectState} /></FieldLabel><FieldLabel label="Correct Amount"><Input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required /></FieldLabel><FieldLabel label="Correct Date"><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></FieldLabel><FieldLabel label="Correct Mode"><SelectField options={[{ label: 'Cash', value: 'cash' }, { label: 'UPI', value: 'upi' }, { label: 'Card', value: 'card' }, { label: 'Bank Transfer', value: 'bank-transfer' }]} value={mode} onValueChange={(value) => setMode(value as VendorSettlementMode)} /></FieldLabel><FieldLabel className="md:col-span-2" label="Correct Notes"><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></FieldLabel><FieldLabel className="md:col-span-2" label="Mandatory Reason"><Textarea value={reason} onChange={(event) => setReason(event.target.value)} required /></FieldLabel><Button className="md:col-span-2" disabled={busy || !selected || pending.some((request) => request.sourceRecordId === selected.id)}>{currentUser.role === 'owner' ? 'Apply Audited Correction' : 'Send Correction Request'}</Button></form></CardContent></Card>{ledger.correctionRequests.length ? <Card><CardHeader><SectionHeading eyebrow="Audit trail" title="Correction Requests" /></CardHeader><CardContent className="grid gap-2">{[...ledger.correctionRequests].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((request) => <div key={request.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm"><div><strong>{vendors[request.vendorId] ?? request.vendorId}</strong><p className="text-muted-foreground">INR {(request.before.amountPaise / 100).toLocaleString('en-IN')} to INR {(request.proposed.amountPaise / 100).toLocaleString('en-IN')} | {request.reason}</p></div><div className="flex items-center gap-2"><Badge variant={request.status === 'approved' ? 'success' : request.status === 'rejected' ? 'destructive' : request.status === 'pending' ? 'warning' : 'secondary'}>{request.status}</Badge>{request.status === 'pending' && request.requestedByUserId === currentUser.id && currentUser.role !== 'owner' ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void onRun(() => withdrawSettlementCorrectionRequestV2(request.id, { id: currentUser.id, name: currentUser.name }, new Date().toISOString()), 'Correction request withdrawn.').catch(() => undefined)}>Withdraw</Button> : null}</div></div>)}</CardContent></Card> : null}</div>
}

function ChequeRegister({ busy, cheques, currentUser, legacyChequeItems, onRun, vendors }: { busy: boolean; cheques: VendorLedgerV2Data['cheques']; currentUser: AppUser; legacyChequeItems: PlannerScheduleItemSnapshot[]; onRun: (action: () => Promise<unknown>, success: string) => Promise<void>; vendors: VendorLedgerV2Data['vendors'] }) {
  const [vendorId, setVendorId] = useState('')
  const [number, setNumber] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today())
  const vendorOptions = vendors.filter((vendor) => vendor.active).map((vendor) => ({ label: vendor.canonicalName, value: vendor.id }))
  const v2Numbers = new Set(cheques.map((cheque) => cheque.chequeNumber.replace(/^0+/, '')))
  const readOnlyLegacy = legacyChequeItems.filter((item) => item.chequeNumber && !v2Numbers.has(item.chequeNumber.replace(/^0+/, '')))
  return <div className="grid gap-2.5"><Card><CardHeader><SectionHeading eyebrow="Leaves 1120-1199" title="Unified Cheque Register" description="V2 cheques are managed here. Existing scheduled legacy cheques remain visible and read-only." /></CardHeader><CardContent><form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" onSubmit={(event) => { event.preventDefault(); void onRun(() => createVendorChequeV2({ chequeBookId: 'book-1120-1199', chequeNumber: number, vendorId, date, amountPaise: rupeesToPaise(Number(amount)), actorUserId: currentUser.id, timestamp: new Date().toISOString() }), `Cheque ${number} registered.`).then(() => { setNumber(''); setAmount('') }).catch(() => undefined) }}><FieldLabel label="Vendor"><SelectField searchable options={vendorOptions} value={vendorId} onValueChange={setVendorId} /></FieldLabel><FieldLabel label="Cheque Number"><Input value={number} onChange={(event) => setNumber(event.target.value)} required /></FieldLabel><FieldLabel label="Cheque Date"><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></FieldLabel><FieldLabel label="Amount"><Input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required /></FieldLabel><Button className="self-end" disabled={busy}>Register</Button></form></CardContent></Card>{[...cheques].sort((a, b) => a.chequeNumberValue - b.chequeNumberValue).map((cheque) => <Card key={cheque.id}><CardContent className="grid gap-3 py-3 sm:grid-cols-[1fr_auto] sm:items-center"><div><strong>Cheque {cheque.chequeNumber}</strong><p className="text-sm text-muted-foreground">{vendors.find((vendor) => vendor.id === cheque.vendorId)?.canonicalName ?? cheque.vendorId} | INR {(cheque.amountPaise / 100).toLocaleString('en-IN')} | {cheque.date}</p></div><div className="flex flex-wrap items-center gap-2"><Badge variant={cheque.status === 'debited' ? 'success' : cheque.status === 'bounced' || cheque.status === 'cancelled' ? 'destructive' : 'warning'}>{cheque.status}</Badge>{chequeActions[cheque.status].map((action) => <Button key={action.status} size="sm" variant={action.status === 'debited' ? 'default' : 'outline'} disabled={busy} onClick={() => void onRun(() => transitionVendorChequeV2({ chequeNumber: cheque.chequeNumber, expectedRevision: cheque.revision, toStatus: action.status, actorUserId: currentUser.id, timestamp: new Date().toISOString() }), `Cheque ${cheque.chequeNumber} marked ${action.status}.`).catch(() => undefined)}>{action.label}</Button>)}</div></CardContent></Card>)}{readOnlyLegacy.map((item) => <Card key={`legacy-${item.id}`}><CardContent className="flex flex-wrap items-center justify-between gap-2 py-3"><div><strong>Cheque {item.chequeNumber}</strong><p className="text-sm text-muted-foreground">{item.title} | INR {item.amount.toLocaleString('en-IN')} | {item.date}</p></div><Badge variant="secondary">Legacy read-only</Badge></CardContent></Card>)}</div>
}
