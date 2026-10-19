import { FinanceOperationBoundary } from '@/features/register/components/FinanceOperationBoundary'
import { useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { normalizeName, today } from '@/app/uiHelpers'
import { serverNowIso } from '@/shared/lib/serverClock'
import type { AppUser } from '@/domain/financeTypes'
import type { PlannerScheduleItemSnapshot } from '@/domain/workspaceMetrics'
import {
  openInvoiceBalancesV2,
  rupeesToPaise,
  type VendorSettlementMode,
} from '@/domain/vendorLedgerV2'
import { VendorDirectoryV2 } from '@/features/directory/components/VendorDirectoryV2'
import { OpenInvoicesV2 } from '@/features/register/components/OpenInvoicesV2'
import type { VendorLedgerV2Data } from '@/features/vendor-workspace/hooks/useVendorLedgerV2'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { FieldLabel } from '@/shared/ui/field-label'
import { Input } from '@/shared/ui/input'
import { PageCardStack } from '@/shared/ui/page-card-stack'
import { PageHeader, PageHeaderTab, PageHeaderTabsList } from '@/shared/ui/page-header'
import { PageLayout } from '@/shared/ui/page-layout'
import { SectionHeading } from '@/shared/ui/section-heading'
import { SelectField } from '@/shared/ui/select-field'
import { Tabs, TabsContent } from '@/shared/ui/tabs'
import { Textarea } from '@/shared/ui/textarea'
import {
  applyOwnerSettlementCorrectionV2,
  createSettlementCorrectionRequestV2,
  createVendorReturnV2,
  createVendorV2,
  withdrawSettlementCorrectionRequestV2,
} from '@/store/vendorLedgerV2Repository'

type Props = { currentUser: AppUser; ledger: VendorLedgerV2Data; legacyChequeItems: PlannerScheduleItemSnapshot[]; onOpenRegister:(vendorId?:string,invoiceId?:string)=>void }

export function VendorLedgerWorkspacePage({ currentUser, ledger, onOpenRegister }: Props) {
  const [tab, setTab] = useState('directory')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [vendorFormOpen, setVendorFormOpen] = useState(false)
  const balances = useMemo(
    () => openInvoiceBalancesV2(ledger.purchases, ledger.allocations),
    [ledger.allocations, ledger.purchases],
  )
  const vendorNameById = Object.fromEntries(ledger.vendors.map((vendor) => [vendor.id, vendor.canonicalName]))

  if (ledger.loading && !ledger.config) return <PageLayout header={<PageHeader title="Vendor Workspace" />}><p className="p-4 text-sm text-muted-foreground">Checking V2 vendor ledger status...</p></PageLayout>
  if (ledger.config?.enabled !== true) {
    return <PageLayout header={<PageHeader title="Vendor Workspace" />}><Card><CardHeader><SectionHeading eyebrow="Vendor setup" title="Vendor ledger setup required" /></CardHeader><CardContent className="space-y-2 text-sm text-muted-foreground"><p>The vendor ledger is not enabled. Payment and opening-balance entry are unavailable.</p><p>{currentUser.role === 'owner' ? 'The former browser activation flow has been retired. A reviewed server-based setup is required before enabling this ledger. Existing financial records have not been changed.' : 'Ask the owner to arrange the reviewed ledger setup.'}</p>{ledger.error ? <p role="alert" className="text-destructive">{ledger.error}</p> : null}</CardContent></Card></PageLayout>
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

  function openPayment(invoiceId:string,vendorId:string){onOpenRegister(vendorId,invoiceId)}

  return (
    <FinanceOperationBoundary uid={currentUser.id}><Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
      <PageLayout className="min-h-0 flex-1 overflow-hidden" header={(
        <PageHeader title="Vendor Workspace" tools={(
          <div className="min-w-0 overflow-x-auto">
            <PageHeaderTabsList aria-label="Vendor workspace sections" className="grid min-w-max grid-cols-5">
              <PageHeaderTab value="directory">Vendors</PageHeaderTab>
              <PageHeaderTab value="invoices">Invoices</PageHeaderTab>
              <PageHeaderTab value="returns">Returns</PageHeaderTab>
              <PageHeaderTab value="corrections">Corrections</PageHeaderTab>
              <PageHeaderTab value="balances">Balances</PageHeaderTab>
            </PageHeaderTabsList>
          </div>
        )} />
      )}>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <PageCardStack className="pb-4">
        {ledger.error || message ? <p className="rounded-xl border border-border bg-secondary/50 px-3 py-2 text-sm">{ledger.error ?? message}</p> : null}

          <TabsContent value="directory" className="grid gap-2.5 pt-2">
            <VendorDirectoryV2 currentUserRole={currentUser.role} legacyVendorNames={[]} onAddVendor={() => setVendorFormOpen(true)} vendors={ledger.vendors} />
          </TabsContent>
          <TabsContent value="invoices" className="pt-2"><OpenInvoicesV2 balances={balances} vendorNameById={vendorNameById} onRecordPayment={openPayment} /></TabsContent>
          <TabsContent value="returns" className="pt-2"><ReturnsPanel busy={busy} currentUser={currentUser} ledger={ledger} onRun={run} /></TabsContent>
          <TabsContent value="corrections" className="pt-2"><CorrectionForm busy={busy} currentUser={currentUser} ledger={ledger} vendors={vendorNameById} onRun={run} /></TabsContent>
          <TabsContent value="balances" className="grid gap-2 pt-2">
            {ledger.accountStates.map((state) => <Card key={state.id}><CardContent className="flex items-center justify-between gap-3 py-3"><span>{vendorNameById[state.vendorId] ?? state.vendorId}</span><span className="text-right"><strong className="block">Payable INR {(state.outstandingPaise / 100).toLocaleString('en-IN')}</strong>{state.vendorCreditPaise ? <small className="text-muted-foreground">Unapplied vendor credit INR {(state.vendorCreditPaise / 100).toLocaleString('en-IN')}</small> : null}</span></CardContent></Card>)}
          </TabsContent>
          </PageCardStack>
        </div>
      </PageLayout>
      {vendorFormOpen ? (
        <VendorCreateModal
          busy={busy}
          currentUser={currentUser}
          onClose={() => setVendorFormOpen(false)}
          onRun={run}
          vendors={ledger.vendors}
          activationDate={ledger.config.activationDate}
        />
      ) : null}
    </Tabs></FinanceOperationBoundary>
  )
}

function VendorCreateModal({ busy, currentUser, onClose, onRun, vendors, activationDate }: {
  busy: boolean
  currentUser: AppUser
  onClose: () => void
  onRun: (action: () => Promise<unknown>, success: string) => Promise<void>
  vendors: VendorLedgerV2Data['vendors']
  activationDate?: string
}) {
  const [name, setName] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [contact, setContact] = useState('')
  const [address, setAddress] = useState('')
  const [companiesProvided, setCompaniesProvided] = useState('')
  const [notes, setNotes] = useState('')
  const [formError, setFormError] = useState('')
  const [openingAmount, setOpeningAmount] = useState('0')
  const [openingDate, setOpeningDate] = useState(today)
  const [openingReason, setOpeningReason] = useState('')
  const [vendorId] = useState(() => `vendor-${crypto.randomUUID()}`)
  const [creationTimestamp] = useState(serverNowIso)
  const submissionPending = useRef(false)
  const canSetOpening = currentUser.role === 'owner'

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || submissionPending.current) return
    const savedName = normalizeName(name)
    const savedOwnerName = normalizeName(ownerName)
    const savedContact = contact.trim()
    const savedAddress = address.trim()
    const suppliedBrands = companiesProvided.split(',').map((company) => company.trim()).filter(Boolean)
    if (!savedName || !savedOwnerName || !savedContact || !savedAddress || suppliedBrands.length === 0) {
      setFormError('Vendor name, owner, contact, address, and at least one company are required.')
      return
    }
    if (vendors.some((vendor) => vendor.id !== vendorId && vendor.active && normalizeName(vendor.canonicalName).toLocaleLowerCase('en-IN') === savedName.toLocaleLowerCase('en-IN'))) {
      setFormError('An active vendor with this name already exists.')
      return
    }
    if (canSetOpening && !/^\d+(?:\.\d{1,2})?$/.test(openingAmount.trim())) {
      setFormError('Enter an opening payable of zero or more, with at most two decimal places.')
      return
    }
    setFormError('')
    submissionPending.current = true
    try {
      const openingBalancePaise = canSetOpening ? rupeesToPaise(Number(openingAmount)) : 0
      await onRun(() => createVendorV2({
        id: vendorId,
        canonicalName: savedName,
        ownerName: savedOwnerName,
        contact: savedContact,
        address: savedAddress,
        suppliedBrands,
        notes: notes.trim(),
        openingBalancePaise,
        ...(openingBalancePaise > 0 ? { openingDate, openingReason } : {}),
        actorUserId: currentUser.id,
        timestamp: creationTimestamp,
      }), `Vendor ${savedName} created with opening payable INR ${(openingBalancePaise / 100).toLocaleString('en-IN')}.`)
      onClose()
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Unable to save the vendor.')
    } finally {
      submissionPending.current = false
    }
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
            {canSetOpening ? <>
              <FieldLabel label="Opening Balance (₹)">
                <Input type="number" min="0" step="0.01" required disabled={busy} value={openingAmount} onChange={(event) => setOpeningAmount(event.target.value)} aria-describedby="vendor-opening-help" />
              </FieldLabel>
              {Number(openingAmount) > 0 ? <FieldLabel label="Opening Date">
                <Input type="date" min={activationDate} required disabled={busy} value={openingDate} onChange={(event) => setOpeningDate(event.target.value)} />
              </FieldLabel> : null}
              <p id="vendor-opening-help" className="md:col-span-2 text-xs text-muted-foreground">Amount already owed to this vendor. Adds to the vendor payable; no cash payment is recorded. Leave at 0 when nothing is owed.</p>
              {Number(openingAmount) > 0 ? <FieldLabel className="md:col-span-2" label="Opening Balance Reason">
                <Textarea required disabled={busy} value={openingReason} onChange={(event) => setOpeningReason(event.target.value)} placeholder="Example: Verified balance from the vendor statement" />
              </FieldLabel> : null}
            </> : <p className="md:col-span-2 text-xs text-muted-foreground">Opening balance: INR 0. Only the owner can enter an opening payable.</p>}
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
  return <div className="grid gap-2.5"><Card><CardHeader><SectionHeading eyebrow="Vendor stock return" title="Record Return Request" description="Returns do not change balances until the owner records vendor credit. Replacements have no financial effect." /></CardHeader><CardContent><form className="grid gap-3 md:grid-cols-2 lg:grid-cols-3" onSubmit={(event) => { event.preventDefault(); void onRun(() => createVendorReturnV2({ id: crypto.randomUUID(), vendorId, ...(sourcePurchaseId ? { sourcePurchaseId } : {}), date, description, quantity: Number(quantity), unit, valuePaise: rupeesToPaise(Number(value)), reason, actorUserId: currentUser.id, timestamp: serverNowIso() }), 'Vendor return sent to the Action Centre.').then(() => { setDescription(''); setValue(''); setReason('') }).catch(() => undefined) }}><FieldLabel label="Vendor"><SelectField searchable options={vendorOptions} value={vendorId} onValueChange={(next) => { setVendorId(next); setSourcePurchaseId('') }} /></FieldLabel><FieldLabel label="Related Invoice (Optional)"><SelectField searchable options={purchaseOptions} value={sourcePurchaseId} onValueChange={setSourcePurchaseId} /></FieldLabel><FieldLabel label="Return Date"><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></FieldLabel><FieldLabel label="Item Description"><Input value={description} onChange={(event) => setDescription(event.target.value)} required /></FieldLabel><FieldLabel label="Quantity"><Input type="number" min="0.01" step="0.01" value={quantity} onChange={(event) => setQuantity(event.target.value)} required /></FieldLabel><FieldLabel label="Unit"><Input value={unit} onChange={(event) => setUnit(event.target.value)} required /></FieldLabel><FieldLabel label="Return Value"><Input type="number" min="0.01" step="0.01" value={value} onChange={(event) => setValue(event.target.value)} required /></FieldLabel><FieldLabel className="md:col-span-2" label="Mandatory Reason"><Textarea value={reason} onChange={(event) => setReason(event.target.value)} required /></FieldLabel><Button className="lg:col-span-3" disabled={busy || !vendorId}>Submit Return</Button></form></CardContent></Card><Card><CardHeader><SectionHeading eyebrow="Return history" title="Recorded Returns" /></CardHeader><CardContent className="grid gap-2">{ledger.returns.length === 0 ? <p className="text-sm text-muted-foreground">No vendor returns recorded.</p> : [...ledger.returns].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm"><div><strong>{ledger.vendors.find((vendor) => vendor.id === item.vendorId)?.canonicalName ?? item.vendorId}</strong><p className="text-muted-foreground">{item.description} | {item.quantity} {item.unit} | INR {(item.valuePaise / 100).toLocaleString('en-IN')}</p></div><Badge variant={item.outcome === 'vendor-credit' ? 'success' : item.outcome === 'rejected' ? 'destructive' : item.outcome === 'pending' ? 'warning' : 'secondary'}>{item.outcome}</Badge></div>)}</CardContent></Card></div>
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
  return <div className="grid gap-2.5"><Card><CardHeader><SectionHeading eyebrow={currentUser.role === 'owner' ? 'Owner audit' : 'Approval workflow'} title={currentUser.role === 'owner' ? 'Correct Vendor Payment' : 'Request Payment Correction'} /><p className="text-sm text-muted-foreground">The original payment remains unchanged. {currentUser.role === 'owner' ? 'A compensating audit entry is posted immediately.' : 'The owner must approve your request before any balance changes.'}</p></CardHeader><CardContent><form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); if (!selected) return; const action = currentUser.role === 'owner' ? applyOwnerSettlementCorrectionV2({ id: crypto.randomUUID(), sourceRecordId: selected.id, proposed: { date, amountPaise: rupeesToPaise(Number(amount)), mode, notes }, reason, actor: { id: currentUser.id, name: currentUser.name }, timestamp: serverNowIso() }) : createSettlementCorrectionRequestV2({ id: crypto.randomUUID(), sourceRecordId: selected.id, proposed: { date, amountPaise: rupeesToPaise(Number(amount)), mode, notes }, reason, actor: { id: currentUser.id, name: currentUser.name }, timestamp: serverNowIso() }); void onRun(() => action, currentUser.role === 'owner' ? 'Audited payment correction applied.' : 'Correction request sent to the Action Centre.').then(() => { setSelectedId(''); setAmount(''); setReason('') }).catch(() => undefined) }}><FieldLabel label="Saved Payment"><SelectField searchable options={options} value={selectedId} onValueChange={selectState} /></FieldLabel><FieldLabel label="Correct Amount"><Input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required /></FieldLabel><FieldLabel label="Correct Date"><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></FieldLabel><FieldLabel label="Correct Mode"><SelectField options={[{ label: 'Cash', value: 'cash' }, { label: 'UPI', value: 'upi' }, { label: 'Card', value: 'card' }, { label: 'Bank Transfer', value: 'bank-transfer' }]} value={mode} onValueChange={(value) => setMode(value as VendorSettlementMode)} /></FieldLabel><FieldLabel className="md:col-span-2" label="Correct Notes"><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></FieldLabel><FieldLabel className="md:col-span-2" label="Mandatory Reason"><Textarea value={reason} onChange={(event) => setReason(event.target.value)} required /></FieldLabel><Button className="md:col-span-2" disabled={busy || !selected || pending.some((request) => request.sourceRecordId === selected.id)}>{currentUser.role === 'owner' ? 'Apply Audited Correction' : 'Send Correction Request'}</Button></form></CardContent></Card>{ledger.correctionRequests.length ? <Card><CardHeader><SectionHeading eyebrow="Audit trail" title="Correction Requests" /></CardHeader><CardContent className="grid gap-2">{[...ledger.correctionRequests].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((request) => <div key={request.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm"><div><strong>{vendors[request.vendorId] ?? request.vendorId}</strong><p className="text-muted-foreground">INR {(request.before.amountPaise / 100).toLocaleString('en-IN')} to INR {(request.proposed.amountPaise / 100).toLocaleString('en-IN')} | {request.reason}</p></div><div className="flex items-center gap-2"><Badge variant={request.status === 'approved' ? 'success' : request.status === 'rejected' ? 'destructive' : request.status === 'pending' ? 'warning' : 'secondary'}>{request.status}</Badge>{request.status === 'pending' && request.requestedByUserId === currentUser.id && currentUser.role !== 'owner' ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void onRun(() => withdrawSettlementCorrectionRequestV2(request.id, { id: currentUser.id, name: currentUser.name }, serverNowIso()), 'Correction request withdrawn.').catch(() => undefined)}>Withdraw</Button> : null}</div></div>)}</CardContent></Card> : null}</div>
}
