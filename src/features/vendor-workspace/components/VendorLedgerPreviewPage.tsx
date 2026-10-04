import { useMemo, useState } from 'react'
import { Eye, RotateCcw, ShieldCheck } from 'lucide-react'
import { today } from '@/app/uiHelpers'
import { serverNowIso } from '@/shared/lib/serverClock'
import {
  buildPurchasePostingV2,
  openInvoiceBalancesV2,
  type InvoiceAllocationV2,
  type PurchaseV2,
  type VendorV2,
} from '@/domain/vendorLedgerV2'
import { VendorDirectoryV2 } from '@/features/directory/components/VendorDirectoryV2'
import { OpenInvoicesV2 } from '@/features/register/components/OpenInvoicesV2'
import { PurchaseFormV2, type PurchaseV2Draft } from '@/features/register/components/PurchaseFormV2'
import { VendorSettlementFormV2, type VendorSettlementV2Draft } from '@/features/register/components/VendorSettlementFormV2'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card, CardContent } from '@/shared/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs'

const previewTimestamp = '2026-10-01T00:00:00.000Z'

const previewVendors: VendorV2[] = [
  {
    id: 'preview-vendor-northstar', canonicalName: 'Northstar Distributors', aliases: ['Northstar'],
    contact: '98765 43210', address: 'Delhi', suppliedBrands: ['Accessories', 'Audio'], active: true,
    openingBalancePaise: 0, revision: 1, createdAt: previewTimestamp, createdByUserId: 'preview-owner',
    updatedAt: previewTimestamp, updatedByUserId: 'preview-owner',
  },
  {
    id: 'preview-vendor-bluepeak', canonicalName: 'Bluepeak Mobiles', aliases: ['Blue Peak'],
    contact: '91234 56780', address: 'Noida', suppliedBrands: ['Handsets'], active: true,
    openingBalancePaise: 0, revision: 1, createdAt: previewTimestamp, createdByUserId: 'preview-owner',
    updatedAt: previewTimestamp, updatedByUserId: 'preview-owner',
  },
]

function initialPurchase() {
  return buildPurchasePostingV2({
    id: 'preview-purchase-1', vendorId: previewVendors[0].id, invoiceNumber: 'DEMO-1001',
    invoiceDate: today(), invoiceTotalPaise: 48_500_00, category: 'Accessories', notes: 'Preview invoice',
    actorUserId: 'preview-owner', timestamp: serverNowIso(),
  }).purchase
}

export function VendorLedgerPreviewPage() {
  const [tab, setTab] = useState('overview')
  const [purchases, setPurchases] = useState<PurchaseV2[]>(() => [initialPurchase()])
  const [allocations, setAllocations] = useState<InvoiceAllocationV2[]>([])
  const [paymentTarget, setPaymentTarget] = useState({ vendorId: '', invoiceId: '' })
  const [activity, setActivity] = useState('Preview ready. Try recording an invoice or payment.')
  const balances = useMemo(() => openInvoiceBalancesV2(purchases, allocations), [allocations, purchases])
  const vendorNameById = Object.fromEntries(previewVendors.map((vendor) => [vendor.id, vendor.canonicalName]))

  function openPayment(invoiceId: string, vendorId: string) {
    setPaymentTarget({ invoiceId, vendorId })
    setTab('payments')
  }

  async function savePurchase(draft: PurchaseV2Draft) {
    const purchaseId = `preview-purchase-${crypto.randomUUID()}`
    const posting = buildPurchasePostingV2({
      id: purchaseId, ...draft, actorUserId: 'preview-owner', timestamp: serverNowIso(),
    })
    setPurchases((current) => [...current, posting.purchase])
    setActivity(`Preview invoice ${posting.purchase.invoiceNumber} added locally. Nothing was saved.`)
    return { purchaseId }
  }

  async function saveSettlement(draft: VendorSettlementV2Draft) {
    if (draft.invoiceId) {
      const balance = balances.find((candidate) => candidate.purchase.id === draft.invoiceId)
      if (!balance || draft.amountPaise > balance.availableToAllocatePaise) {
        throw new Error('Payment cannot exceed the selected invoice available amount.')
      }
      setAllocations((current) => [...current, {
        id: `preview-allocation-${crypto.randomUUID()}`,
        vendorId: draft.vendorId,
        invoiceId: draft.invoiceId as string,
        sourceType: 'settlement',
        sourceRecordId: `preview-settlement-${crypto.randomUUID()}`,
        amountPaise: draft.amountPaise,
        state: 'posted',
        revision: 1,
        createdAt: serverNowIso(),
        createdByUserId: 'preview-owner',
      }])
    }
    setActivity(`Preview payment of INR ${(draft.amountPaise / 100).toLocaleString('en-IN')} recorded locally. Nothing was saved.`)
  }

  function resetPreview() {
    setPurchases([initialPurchase()])
    setAllocations([])
    setPaymentTarget({ vendorId: '', invoiceId: '' })
    setActivity('Preview reset to demo data.')
    setTab('overview')
  }

  return (
    <section className="min-h-0 flex-1 overflow-y-auto pr-1">
      <div className="grid gap-3 pb-4">
        <Card className="border-cyan-400/30 bg-[linear-gradient(135deg,rgba(37,99,235,0.18),rgba(34,211,238,0.07))]">
          <CardContent className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="rounded-xl border border-cyan-200 bg-cyan-50 p-2 text-cyan-700"><Eye className="size-5" /></span>
              <div>
                <div className="flex flex-wrap items-center gap-2"><h1 className="text-lg font-black text-foreground">Vendor Ledger Preview</h1><Badge variant="outline">Owner only</Badge></div>
                <p className="mt-1 text-sm text-muted-foreground">Preview mode: entries stay in this browser session and are never sent to Firebase.</p>
                <p className="mt-1 text-xs font-semibold text-cyan-800">{activity}</p>
              </div>
            </div>
            <Button type="button" variant="outline" onClick={resetPreview}><RotateCcw className="size-4" /> Reset demo</Button>
          </CardContent>
        </Card>

        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          <ShieldCheck className="size-4 shrink-0" /> Production vendors, balances, purchases, payments, cheques, and loans are not read or changed here.
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid-cols-4">
            <TabsTrigger value="overview">Directory</TabsTrigger>
            <TabsTrigger value="purchases">Purchases</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="invoices">Open Invoices</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="pt-2">
            <VendorDirectoryV2 currentUserRole="owner" legacyVendorNames={['Northstar', 'Old Demo Supplier']} vendors={previewVendors} />
          </TabsContent>
          <TabsContent value="purchases" className="pt-2">
            <PurchaseFormV2 isBusy={false} vendors={previewVendors} onSave={savePurchase} onRecordPayment={openPayment} />
          </TabsContent>
          <TabsContent value="payments" className="pt-2">
            <VendorSettlementFormV2
              key={`${paymentTarget.vendorId}:${paymentTarget.invoiceId}`}
              balances={balances}
              initialInvoiceId={paymentTarget.invoiceId}
              initialVendorId={paymentTarget.vendorId}
              isBusy={false}
              vendors={previewVendors}
              onSave={saveSettlement}
            />
          </TabsContent>
          <TabsContent value="invoices" className="pt-2">
            <OpenInvoicesV2 balances={balances} vendorNameById={vendorNameById} onRecordPayment={openPayment} />
          </TabsContent>
        </Tabs>
      </div>
    </section>
  )
}
