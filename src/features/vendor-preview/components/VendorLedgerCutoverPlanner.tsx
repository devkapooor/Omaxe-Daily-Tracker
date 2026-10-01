import { useMemo, useState } from 'react'
import { ClipboardCheck, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { today } from '@/app/uiHelpers'
import type { AppUser } from '@/domain/financeTypes'
import {
  confirmsVendorLedgerActivation,
  reviewVendorLedgerCutover,
  VENDOR_LEDGER_ACTIVATION_PHRASE,
  type CutoverVendorDraft,
} from '@/domain/vendorLedgerCutover'
import { rupeesToPaise } from '@/domain/vendorLedgerV2'
import { VendorLedgerPreviewPage } from '@/features/vendor-preview/components/VendorLedgerPreviewPage'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { FieldLabel } from '@/shared/ui/field-label'
import { Input } from '@/shared/ui/input'
import { SectionHeading } from '@/shared/ui/section-heading'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs'
import { Textarea } from '@/shared/ui/textarea'
import { activateVendorLedgerV2 } from '@/store/vendorLedgerV2Repository'

type EditableVendor = CutoverVendorDraft & { openingRupees: string }

export function VendorLedgerPreActivationPage({ currentUser }: { currentUser: AppUser }) {
  return (
    <section className="min-h-0 flex-1 overflow-y-auto pr-1">
      <Tabs defaultValue="cutover">
        <TabsList className="mb-2 grid-cols-2">
          <TabsTrigger value="cutover">Cutover Planning</TabsTrigger>
          <TabsTrigger value="preview">Workflow Preview</TabsTrigger>
        </TabsList>
        <TabsContent value="cutover"><VendorLedgerCutoverPlanner currentUser={currentUser} /></TabsContent>
        <TabsContent value="preview"><VendorLedgerPreviewPage /></TabsContent>
      </Tabs>
    </section>
  )
}

function VendorLedgerCutoverPlanner({ currentUser }: { currentUser: AppUser }) {
  const [activationDate, setActivationDate] = useState(today())
  const [vendors, setVendors] = useState<EditableVendor[]>([])
  const [copied, setCopied] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [activationMessage, setActivationMessage] = useState('')
  const review = useMemo(() => reviewVendorLedgerCutover(activationDate, vendors.map((vendor) => ({
    id: vendor.id,
    canonicalName: vendor.canonicalName,
    openingBalancePaise: vendor.openingBalancePaise,
    openingReason: vendor.openingReason,
  }))), [activationDate, vendors])

  function addVendor() {
    setConfirmation('')
    setVendors((current) => [...current, {
      id: crypto.randomUUID(), canonicalName: '', openingRupees: '0', openingBalancePaise: 0, openingReason: '',
    }])
  }

  function updateVendor(id: string, patch: Partial<EditableVendor>) {
    setConfirmation('')
    setVendors((current) => current.map((vendor) => vendor.id === id ? { ...vendor, ...patch } : vendor))
  }

  function removeVendor(id: string) {
    setConfirmation('')
    setVendors((current) => current.filter((item) => item.id !== id))
  }

  async function copyReview() {
    await navigator.clipboard.writeText(JSON.stringify(review, null, 2))
    setCopied(true)
  }

  async function activate() {
    if (!review.ready || !confirmsVendorLedgerActivation(confirmation) || busy) return
    setBusy(true)
    setActivationMessage('')
    try {
      await activateVendorLedgerV2({
        activationDate: review.activationDate,
        vendors: review.vendors,
        actor: { id: currentUser.id, name: currentUser.name },
        timestamp: new Date().toISOString(),
      })
      setActivationMessage('V2 vendor ledger activated. Loading the operational workspace...')
    } catch (cause) {
      setActivationMessage(cause instanceof Error ? cause.message : 'Unable to activate the V2 vendor ledger.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-3 pb-4">
      <Card className="border-cyan-400/25 bg-[linear-gradient(135deg,rgba(37,99,235,0.18),rgba(34,211,238,0.07))]">
        <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h1 className="text-lg font-black">Controlled V2 Cutover</h1><p className="text-sm text-muted-foreground">Review locally, then use the guarded owner confirmation to activate once.</p></div>
          <Badge variant="outline"><ShieldCheck className="mr-1 size-3" /> Production V2 disabled</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><SectionHeading eyebrow="One activation event" title="Cutover Controls" /></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FieldLabel label="All-vendor Activation Date"><Input type="date" value={activationDate} onChange={(event) => { setConfirmation(''); setActivationDate(event.target.value) }} /></FieldLabel>
          <div className="rounded-xl border border-border bg-secondary/45 p-3 text-sm"><span className="text-muted-foreground">Cheque book:</span><strong className="ml-2">1120-1199</strong><p className="mt-1 text-xs text-muted-foreground">Created only by the confirmed activation below.</p></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="sm:flex-row sm:items-center sm:justify-between"><div><SectionHeading eyebrow="Explicit clean start" title="V2 Vendors And Openings" /><p className="text-sm text-muted-foreground">Every vendor defaults to zero. Do not estimate or copy a legacy balance.</p></div><Button type="button" variant="outline" onClick={addVendor}><Plus className="size-4" /> Add Vendor</Button></CardHeader>
        <CardContent className="grid gap-3">
          {vendors.length === 0 ? <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No vendors added. You may activate an empty clean start and add vendors individually afterward.</p> : null}
          {vendors.map((vendor, index) => <div key={vendor.id} className="grid gap-3 rounded-2xl border border-border bg-secondary/35 p-3 md:grid-cols-[1fr_0.55fr_1.2fr_auto]"><FieldLabel label={`Vendor ${index + 1}`}><Input value={vendor.canonicalName} onChange={(event) => updateVendor(vendor.id, { canonicalName: event.target.value })} placeholder="Verified vendor name" /></FieldLabel><FieldLabel label="Opening Balance"><Input type="number" min="0" step="0.01" value={vendor.openingRupees} onChange={(event) => { const openingRupees = event.target.value; const amount = Number(openingRupees); updateVendor(vendor.id, { openingRupees, openingBalancePaise: Number.isFinite(amount) && amount >= 0 ? rupeesToPaise(amount) : -1 }) }} /></FieldLabel><FieldLabel label="Audit Reason (required above zero)"><Textarea className="min-h-8" value={vendor.openingReason} onChange={(event) => updateVendor(vendor.id, { openingReason: event.target.value })} /></FieldLabel><Button className="self-end" type="button" size="icon" variant="ghost" aria-label={`Remove vendor ${index + 1}`} onClick={() => removeVendor(vendor.id)}><Trash2 className="size-4" /></Button></div>)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><SectionHeading eyebrow="Reconciliation" title="Owner Review Summary" /></CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-2 sm:grid-cols-3"><Summary label="Vendors" value={String(review.vendorCount)} /><Summary label="Audited Openings" value={String(review.adjustedOpeningCount)} /><Summary label="Total Opening" value={`INR ${(review.totalOpeningPaise / 100).toLocaleString('en-IN')}`} /></div>
          {review.errors.length > 0 ? <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100">{review.errors.map((error) => <p key={error}>{error}</p>)}</div> : <div className="flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-3 text-sm text-emerald-100"><ClipboardCheck className="size-4" /> Review candidate reconciles locally. This is not activation approval.</div>}
          <Button type="button" variant="outline" disabled={!review.ready} onClick={() => void copyReview()}>{copied ? 'Review Summary Copied' : 'Copy Review Summary'}</Button>
        </CardContent>
      </Card>
      <Card className="border-amber-400/30">
        <CardHeader><SectionHeading eyebrow="Irreversible clean start" title="Production Activation" /></CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-sm text-muted-foreground">Activation creates only the reviewed V2 vendors, audited opening entries, cheque book 1120-1199, and V2 configuration in one transaction. It does not read or write loans or legacy financial records.</p>
          <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 p-3 text-sm text-amber-100">After activation, this clean start cannot be initialized again. Recheck the vendor count, total opening, and activation date above.</div>
          <FieldLabel label={`Type ${VENDOR_LEDGER_ACTIVATION_PHRASE} to confirm`}>
            <Input
              autoComplete="off"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder={VENDOR_LEDGER_ACTIVATION_PHRASE}
            />
          </FieldLabel>
          {activationMessage ? <p className="rounded-xl border border-border bg-secondary/45 p-3 text-sm">{activationMessage}</p> : null}
          <Button
            type="button"
            variant="destructive"
            disabled={!review.ready || !confirmsVendorLedgerActivation(confirmation) || busy}
            onClick={() => void activate()}
          >
            {busy ? 'Activating...' : 'Activate Reviewed V2 Clean Start'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-border bg-secondary/45 p-3"><p className="text-xs text-muted-foreground">{label}</p><strong className="text-base">{value}</strong></div>
}
