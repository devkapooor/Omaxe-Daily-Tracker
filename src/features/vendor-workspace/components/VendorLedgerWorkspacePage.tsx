import { FinanceOperationBoundary } from '@/features/register/components/FinanceOperationBoundary'
import { useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { normalizeName, today } from '@/app/uiHelpers'
import { serverNowIso } from '@/shared/lib/serverClock'
import type { AppUser } from '@/domain/financeTypes'
import type { PlannerScheduleItemSnapshot } from '@/domain/workspaceMetrics'
import {
  invoiceBalanceV2,
  type PurchaseV2,
  type VendorV2,
  rupeesToPaise,
  type VendorSettlementMode,
} from '@/domain/vendorLedgerV2'
import { VendorDirectoryV2 } from '@/features/directory/components/VendorDirectoryV2'
import { VendorInvoiceDetails } from './VendorInvoiceDetails'
import { VendorBalances } from './VendorBalances'
import { VendorOpeningCorrection } from './VendorOpeningCorrection'
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
  createVendorV2,
  updateVendorGstin,
  withdrawSettlementCorrectionRequestV2,
} from '@/store/vendorLedgerV2Repository'

type DirectoryProps = { partyNames?: string[]; referenceNames?: string[]; savedPartyNames?: string[]; confirmedPartyNames?: string[]; legacyVendorNames?: string[]; onAddParty?: (name: string) => Promise<void>; onRenameParty?: (before: string, after: string) => Promise<void> }
type Props = DirectoryProps & { currentUser: AppUser; ledger: VendorLedgerV2Data; legacyChequeItems: PlannerScheduleItemSnapshot[]; onOpenRegister:(vendorId?:string,invoiceId?:string)=>void }

export function VendorLedgerWorkspacePage({ currentUser, ledger, onOpenRegister, partyNames = [], referenceNames = [], savedPartyNames = [], confirmedPartyNames = [], legacyVendorNames = [], onAddParty, onRenameParty }: Props) {
  const [tab, setTab] = useState('directory')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [vendorFormOpen, setVendorFormOpen] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<PurchaseV2 | null>(null)
  const [openingVendor, setOpeningVendor] = useState<VendorV2 | null>(null)
  const [invoiceFilter, setInvoiceFilter] = useState('')
  const balances = useMemo(
    () => ledger.purchases.map(purchase => {
      const source = ledger.invoiceStates.find(state => state.invoiceId === purchase.id)
      const balance = source ? { purchase, openAmountPaise: source.openAmountPaise, reservedAmountPaise: source.reservedAmountPaise, availableToAllocatePaise: Math.max(0, source.openAmountPaise - source.reservedAmountPaise) } : invoiceBalanceV2(purchase, ledger.allocations)
      return { ...balance, paidAmountPaise: ledger.allocations.filter(item => item.invoiceId === purchase.id).reduce((sum, item) => sum + (item.state === 'posted' ? item.amountPaise : item.state === 'reversed' ? -item.amountPaise : 0), 0) }
    }).sort((a, b) => b.purchase.invoiceDate.localeCompare(a.purchase.invoiceDate)),
    [ledger.allocations, ledger.purchases, ledger.invoiceStates],
  )
  const vendorNameById = Object.fromEntries(ledger.vendors.map((vendor) => [vendor.id, vendor.canonicalName]))

  if (ledger.loading && !ledger.config) return <PageLayout header={<PageHeader title="Vendor Workspace" />}><p className="p-4 text-sm text-muted-foreground">Checking V2 vendor ledger status...</p></PageLayout>
  if (ledger.config?.enabled !== true) {
    return <FinanceOperationBoundary uid={currentUser.id} fill><PageLayout className="min-h-0 flex-1 overflow-hidden" header={<PageHeader title="Vendor Workspace" />}><div className="min-h-0 flex-1 space-y-3 overflow-y-auto"><p className="rounded border p-3 text-sm">Vendor ledger setup is required for invoices, payments and opening balances. Your other parties remain available.</p>{ledger.error ? <p role="alert" className="text-destructive">{ledger.error}</p> : null}<VendorDirectoryV2 currentUserRole={currentUser.role} vendors={[]} legacyVendorNames={legacyVendorNames} partyNames={partyNames} referenceNames={referenceNames} savedPartyNames={savedPartyNames} confirmedPartyNames={confirmedPartyNames} onAddVendor={() => setVendorFormOpen(true)} onSaveParty={onAddParty} onRenameParty={onRenameParty} />{vendorFormOpen ? <VendorCreateModal busy={busy} currentUser={currentUser} vendors={[]} onClose={() => setVendorFormOpen(false)} onRun={run} onAddParty={onAddParty} partyOnly /> : null}</div></PageLayout></FinanceOperationBoundary>
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
    <FinanceOperationBoundary uid={currentUser.id} fill><Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
      <PageLayout className="min-h-0 flex-1 overflow-hidden" header={(
        <PageHeader title="Vendor Workspace" tools={(
          <div className="min-w-0 overflow-x-auto">
            <PageHeaderTabsList aria-label="Vendor workspace sections" className="grid min-w-max grid-cols-4">
              <PageHeaderTab value="directory">Vendors &amp; Parties</PageHeaderTab>
              <PageHeaderTab value="invoices">Invoices</PageHeaderTab>
              <PageHeaderTab value="corrections">Payment Corrections</PageHeaderTab>
              <PageHeaderTab value="balances">Balances</PageHeaderTab>
            </PageHeaderTabsList>
          </div>
        )} />
      )}>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <PageCardStack className="pb-4">
        {ledger.error || message ? <p className="rounded-xl border border-border bg-secondary/50 px-3 py-2 text-sm">{ledger.error ?? message}</p> : null}

          <TabsContent value="directory" className="grid gap-2.5 pt-2">
            <VendorDirectoryV2 currentUserRole={currentUser.role} legacyVendorNames={legacyVendorNames} onAddVendor={() => setVendorFormOpen(true)} vendors={ledger.vendors} partyNames={partyNames} referenceNames={referenceNames} savedPartyNames={savedPartyNames} confirmedPartyNames={confirmedPartyNames} onSaveParty={onAddParty} onRenameParty={onRenameParty} onEditOpening={setOpeningVendor} onUpdateVendorGstin={async (vendor,gstin) => { await run(() => updateVendorGstin(vendor,gstin), 'Vendor GSTIN updated.') }} />
          </TabsContent>
          <TabsContent value="invoices" className="pt-2"><>{invoiceFilter ? <Button className="mb-2" size="sm" variant="outline" onClick={() => setInvoiceFilter('')}>Clear vendor filter</Button> : null}<OpenInvoicesV2 balances={invoiceFilter ? balances.filter(row => row.purchase.vendorId === invoiceFilter) : balances} vendorNameById={vendorNameById} onRecordPayment={openPayment} onViewInvoice={setSelectedInvoice} /></></TabsContent>
          <TabsContent value="corrections" className="pt-2"><CorrectionForm busy={busy} currentUser={currentUser} ledger={ledger} vendors={vendorNameById} onRun={run} /></TabsContent>
          <TabsContent value="balances" className="grid gap-2 pt-2">
            <VendorBalances vendors={ledger.vendors} states={ledger.accountStates} onInvoices={id => { setInvoiceFilter(id); setTab('invoices') }} />
          </TabsContent>
          </PageCardStack>
        </div>
      </PageLayout>
      {selectedInvoice ? <VendorInvoiceDetails purchase={selectedInvoice} vendorName={vendorNameById[selectedInvoice.vendorId] ?? 'Vendor'} onClose={() => setSelectedInvoice(null)} /> : null}
      {openingVendor && currentUser.role === 'owner' ? <VendorOpeningCorrection vendor={openingVendor} account={ledger.accountStates.find(state => state.vendorId === openingVendor.id)} onClose={() => setOpeningVendor(null)} onSaved={() => setMessage('Opening correction posted with an audit trail.')} /> : null}
      {vendorFormOpen ? (
        <VendorCreateModal
          onAddParty={onAddParty}
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

function VendorCreateModal({ busy, currentUser, onClose, onRun, vendors, activationDate, onAddParty, partyOnly = false }: {
  partyOnly?: boolean
  onAddParty?: (name: string) => Promise<void>
  busy: boolean
  currentUser: AppUser
  onClose: () => void
  onRun: (action: () => Promise<unknown>, success: string) => Promise<void>
  vendors: VendorLedgerV2Data['vendors']
  activationDate?: string
}) {
  const [name, setName] = useState('')
  const [creationType, setCreationType] = useState(partyOnly ? 'party' : 'vendor')
  const [ownerName, setOwnerName] = useState('')
  const [gstin, setGstin] = useState('')
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
    if (creationType === 'party') {
      if (!savedName || !onAddParty) { setFormError('Party name is required.'); return }
      submissionPending.current = true
      try { await onRun(() => onAddParty(savedName), `Party ${savedName} saved without creating a vendor payable.`); onClose() }
      catch (cause) { setFormError(cause instanceof Error ? cause.message : 'Party could not be saved.') }
      finally { submissionPending.current = false }
      return
    }
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
        gstin: gstin.trim().toUpperCase(),
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
              <h2 id="add-vendor-title" className="mt-1 text-xl font-black text-foreground">Add Party / Vendor</h2>
            </div>
            <Button type="button" size="icon" variant="ghost" disabled={busy} aria-label="Close add vendor form" onClick={onClose}>
              <X className="size-5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <form className="grid gap-3.5 md:grid-cols-2" onSubmit={(event) => void handleSubmit(event).catch(() => undefined)}>
            {formError ? <p className="md:col-span-2 rounded-2xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm font-semibold text-rose-700">{formError}</p> : null}
            <FieldLabel className="md:col-span-2" label="Record type"><select className="h-9 rounded-md border bg-card px-3 text-sm" value={creationType} onChange={event => setCreationType(event.target.value)}><option value="vendor" disabled={partyOnly}>Vendor / supplier</option><option value="party">Other party / person</option></select></FieldLabel>
            <FieldLabel label={creationType === 'party' ? 'Party name' : 'Vendor name'}>
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Vendor name" required autoFocus />
            </FieldLabel>
            {creationType === 'vendor' ? <>
            <FieldLabel label="Owner Name">
              <Input value={ownerName} onChange={(event) => setOwnerName(event.target.value)} placeholder="Owner name" required />
            </FieldLabel>
            <FieldLabel label="Vendor GSTIN (optional)">
              <Input value={gstin} maxLength={15} onChange={(event) => setGstin(event.target.value.toUpperCase())} placeholder="15-character GSTIN" />
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
              <Textarea rows={2} className="!h-12 !min-h-12 !max-h-12 resize-none" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Payment terms, service quality, or stock rhythm" />
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
            </> : <p className="text-xs text-muted-foreground">Saves a directory identity only. No supplier account, opening balance, invoice, or payment is created.</p>}
            <div className="flex flex-col-reverse gap-2 md:col-span-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
              <Button disabled={busy}>{busy ? 'Saving...' : creationType === 'party' ? 'Save party' : 'Save vendor'}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
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
