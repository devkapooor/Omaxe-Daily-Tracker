import { useMemo, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { today } from '@/app/uiHelpers'
import type { AppUser } from '@/domain/financeTypes'
import {
  openInvoiceBalancesV2,
  rupeesToPaise,
  type ChequeStatus,
} from '@/domain/vendorLedgerV2'
import { VendorDirectoryV2 } from '@/features/directory/components/VendorDirectoryV2'
import { OpenInvoicesV2 } from '@/features/register/components/OpenInvoicesV2'
import { PurchaseFormV2, type PurchaseV2Draft } from '@/features/register/components/PurchaseFormV2'
import { VendorSettlementFormV2, type VendorSettlementV2Draft } from '@/features/register/components/VendorSettlementFormV2'
import { useVendorLedgerV2 } from '@/features/vendor-preview/hooks/useVendorLedgerV2'
import { VendorLedgerPreActivationPage } from '@/features/vendor-preview/components/VendorLedgerCutoverPlanner'
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
  createPurchaseV2,
  createSettlementV2,
  createVendorChequeV2,
  createVendorV2,
  transitionVendorChequeV2,
} from '@/store/vendorLedgerV2Repository'

type Props = { currentUser: AppUser }

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

export function VendorLedgerWorkspacePage({ currentUser }: Props) {
  const ledger = useVendorLedgerV2()
  const [tab, setTab] = useState('directory')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
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
      <div className="grid gap-3 pb-4">
        <Card className="border-cyan-400/25 bg-[linear-gradient(135deg,rgba(37,99,235,0.18),rgba(34,211,238,0.07))]">
          <CardContent className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div><h1 className="text-lg font-black">Vendor Ledger V2</h1><p className="text-sm text-muted-foreground">Clean-start purchases, payments, corrections, and vendor cheques.</p></div>
            <Badge variant="success"><ShieldCheck className="mr-1 size-3" /> Active from {ledger.config.activationDate}</Badge>
          </CardContent>
        </Card>
        {ledger.error || message ? <p className="rounded-xl border border-border bg-secondary/50 px-3 py-2 text-sm">{ledger.error ?? message}</p> : null}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className={`${currentUser.role === 'owner' ? 'grid-cols-7' : 'grid-cols-5'} overflow-x-auto`}>
            <TabsTrigger value="directory">Vendors</TabsTrigger>
            <TabsTrigger value="purchases">Purchases</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="invoices">Invoices</TabsTrigger>
            {currentUser.role === 'owner' ? <TabsTrigger value="corrections">Corrections</TabsTrigger> : null}
            {currentUser.role === 'owner' ? <TabsTrigger value="cheques">Cheques</TabsTrigger> : null}
            <TabsTrigger value="balances">Balances</TabsTrigger>
          </TabsList>
          <TabsContent value="directory" className="grid gap-3 pt-2">
            <VendorCreateForm busy={busy} currentUser={currentUser} onRun={run} />
            <VendorDirectoryV2 currentUserRole="owner" legacyVendorNames={[]} vendors={ledger.vendors} />
          </TabsContent>
          <TabsContent value="purchases" className="pt-2"><PurchaseFormV2 isBusy={busy} vendors={ledger.vendors} onSave={savePurchase} onRecordPayment={openPayment} /></TabsContent>
          <TabsContent value="payments" className="pt-2"><VendorSettlementFormV2 key={`${paymentTarget.vendorId}:${paymentTarget.invoiceId}`} balances={balances} initialInvoiceId={paymentTarget.invoiceId} initialVendorId={paymentTarget.vendorId} isBusy={busy} vendors={ledger.vendors} onSave={saveSettlement} /></TabsContent>
          <TabsContent value="invoices" className="pt-2"><OpenInvoicesV2 balances={balances} vendorNameById={vendorNameById} onRecordPayment={openPayment} /></TabsContent>
          {currentUser.role === 'owner' ? <TabsContent value="corrections" className="pt-2"><CorrectionForm busy={busy} currentUser={currentUser} states={ledger.settlementStates} vendors={vendorNameById} onRun={run} /></TabsContent> : null}
          {currentUser.role === 'owner' ? <TabsContent value="cheques" className="pt-2"><ChequeRegister busy={busy} cheques={ledger.cheques} currentUser={currentUser} vendors={ledger.vendors} onRun={run} /></TabsContent> : null}
          <TabsContent value="balances" className="grid gap-2 pt-2">
            {ledger.accountStates.map((state) => <Card key={state.id}><CardContent className="flex items-center justify-between py-3"><span>{vendorNameById[state.vendorId] ?? state.vendorId}</span><strong>INR {(state.outstandingPaise / 100).toLocaleString('en-IN')}</strong></CardContent></Card>)}
          </TabsContent>
        </Tabs>
      </div>
    </section>
  )
}

function VendorCreateForm({ busy, currentUser, onRun }: { busy: boolean; currentUser: AppUser; onRun: (action: () => Promise<unknown>, success: string) => Promise<void> }) {
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  return <Card><CardHeader><SectionHeading eyebrow="Zero opening" title="Add V2 Vendor" /></CardHeader><CardContent><form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(event) => { event.preventDefault(); const savedName = name.trim(); void onRun(() => createVendorV2({ id: `vendor-${crypto.randomUUID()}`, canonicalName: savedName, contact, actorUserId: currentUser.id, timestamp: new Date().toISOString() }), `Vendor ${savedName} created at zero opening.`).then(() => { setName(''); setContact('') }).catch(() => undefined) }}><FieldLabel label="Vendor Name"><Input value={name} onChange={(event) => setName(event.target.value)} required /></FieldLabel><FieldLabel label="Contact"><Input value={contact} onChange={(event) => setContact(event.target.value)} /></FieldLabel><Button className="self-end" disabled={busy}>Add Vendor</Button></form></CardContent></Card>
}

function CorrectionForm({ busy, currentUser, onRun, states, vendors }: { busy: boolean; currentUser: AppUser; onRun: (action: () => Promise<unknown>, success: string) => Promise<void>; states: ReturnType<typeof useVendorLedgerV2>['settlementStates']; vendors: Record<string, string> }) {
  const [selectedId, setSelectedId] = useState('')
  const selected = states.find((state) => state.id === selectedId)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const options = states.map((state) => ({ label: `${vendors[state.vendorId] ?? state.vendorId} | INR ${(state.amountPaise / 100).toLocaleString('en-IN')} | ${state.date}`, value: state.id }))
  return <Card><CardHeader><SectionHeading eyebrow="Owner audit" title="Correct Vendor Payment" /><p className="text-sm text-muted-foreground">The original payment remains unchanged; a compensating audit entry records the correction.</p></CardHeader><CardContent><form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); if (!selected) return; void onRun(() => applyOwnerSettlementCorrectionV2({ id: crypto.randomUUID(), sourceRecordId: selected.id, proposed: { date: selected.date, amountPaise: rupeesToPaise(Number(amount)), mode: selected.mode, notes: selected.notes }, reason, actor: { id: currentUser.id, name: currentUser.name }, timestamp: new Date().toISOString() }), 'Audited payment correction applied.').then(() => { setAmount(''); setReason('') }).catch(() => undefined) }}><FieldLabel label="Saved Payment"><SelectField searchable options={options} value={selectedId} onValueChange={(value) => { setSelectedId(value); const state = states.find((item) => item.id === value); setAmount(state ? String(state.amountPaise / 100) : '') }} /></FieldLabel><FieldLabel label="Correct Amount"><Input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required /></FieldLabel><FieldLabel className="md:col-span-2" label="Mandatory Reason"><Textarea value={reason} onChange={(event) => setReason(event.target.value)} required /></FieldLabel><Button className="md:col-span-2" disabled={busy || !selected}>Apply Audited Correction</Button></form></CardContent></Card>
}

function ChequeRegister({ busy, cheques, currentUser, onRun, vendors }: { busy: boolean; cheques: ReturnType<typeof useVendorLedgerV2>['cheques']; currentUser: AppUser; onRun: (action: () => Promise<unknown>, success: string) => Promise<void>; vendors: ReturnType<typeof useVendorLedgerV2>['vendors'] }) {
  const [vendorId, setVendorId] = useState('')
  const [number, setNumber] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today())
  const vendorOptions = vendors.filter((vendor) => vendor.active).map((vendor) => ({ label: vendor.canonicalName, value: vendor.id }))
  return <div className="grid gap-3"><Card><CardHeader><SectionHeading eyebrow="Leaves 1120-1199" title="Register Vendor Cheque" /></CardHeader><CardContent><form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" onSubmit={(event) => { event.preventDefault(); void onRun(() => createVendorChequeV2({ chequeBookId: 'book-1120-1199', chequeNumber: number, vendorId, date, amountPaise: rupeesToPaise(Number(amount)), actorUserId: currentUser.id, timestamp: new Date().toISOString() }), `Cheque ${number} registered.`).then(() => { setNumber(''); setAmount('') }).catch(() => undefined) }}><FieldLabel label="Vendor"><SelectField searchable options={vendorOptions} value={vendorId} onValueChange={setVendorId} /></FieldLabel><FieldLabel label="Cheque Number"><Input value={number} onChange={(event) => setNumber(event.target.value)} required /></FieldLabel><FieldLabel label="Cheque Date"><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></FieldLabel><FieldLabel label="Amount"><Input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required /></FieldLabel><Button className="self-end" disabled={busy}>Register</Button></form></CardContent></Card>{[...cheques].sort((a, b) => a.chequeNumberValue - b.chequeNumberValue).map((cheque) => <Card key={cheque.id}><CardContent className="grid gap-3 py-3 sm:grid-cols-[1fr_auto] sm:items-center"><div><strong>Cheque {cheque.chequeNumber}</strong><p className="text-sm text-muted-foreground">{vendors.find((vendor) => vendor.id === cheque.vendorId)?.canonicalName ?? cheque.vendorId} | INR {(cheque.amountPaise / 100).toLocaleString('en-IN')} | {cheque.date}</p></div><div className="flex flex-wrap items-center gap-2"><Badge variant={cheque.status === 'debited' ? 'success' : cheque.status === 'bounced' || cheque.status === 'cancelled' ? 'destructive' : 'warning'}>{cheque.status}</Badge>{chequeActions[cheque.status].map((action) => <Button key={action.status} size="sm" variant={action.status === 'debited' ? 'default' : 'outline'} disabled={busy} onClick={() => void onRun(() => transitionVendorChequeV2({ chequeNumber: cheque.chequeNumber, expectedRevision: cheque.revision, toStatus: action.status, actorUserId: currentUser.id, timestamp: new Date().toISOString() }), `Cheque ${cheque.chequeNumber} marked ${action.status}.`).catch(() => undefined)}>{action.label}</Button>)}</div></CardContent></Card>)}</div>
}
