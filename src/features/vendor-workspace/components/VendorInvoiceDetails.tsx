import { useEffect, useState } from 'react'
import type { PurchaseV2 } from '@/domain/vendorLedgerV2'
import type { PosGoodsReceipt } from '@/features/pos/domain/types'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { stockMoney } from '@/features/stock/domain/currentStock'
import { SourceRecord } from '@/features/stock/components/StockSourceDetails'
import { readPage } from '@/features/stock/data/stockQueries'
import { where } from 'firebase/firestore'
import { BusinessReference } from '@/shared/businessReferences'

export function VendorInvoiceDetails({ purchase, vendorName, onClose }: { purchase: PurchaseV2; vendorName: string; onClose: () => void }) {
  const [state, setState] = useState<{ items: PosGoodsReceipt[]; error: string; ready: boolean }>({ items: [], error: '', ready: false })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    void readPage<PosGoodsReceipt>('goodsReceipts', [where('payablePurchaseId', '==', purchase.id)], null, 101, `invoice-grns:${purchase.id}:${attempt}`, '__name__', 'asc').then(page => {
      if (page.items.length > 100) throw new Error('This invoice has more than 100 GRNs; use GRN History to inspect the complete history.')
      if (active) setState({ items: page.items, error: '', ready: true })
    }).catch(cause => { if (active) setState({ items: [], ready: true, error: cause instanceof Error ? cause.message : 'Unable to load linked GRNs.' }) })
    return () => { active = false }
  }, [purchase.id, attempt])
  useEffect(() => { const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }; document.addEventListener('keydown', escape); return () => document.removeEventListener('keydown', escape) }, [onClose])
  return <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 p-3" role="dialog" aria-modal="true" aria-label="Invoice and linked GRNs"><Card className="flex max-h-[90dvh] w-full max-w-4xl flex-col"><CardHeader className="flex-row items-center justify-between border-b"><h2 className="font-semibold">{vendorName} · {purchase.invoiceNumber}</h2><Button autoFocus variant="outline" onClick={onClose}>Close invoice</Button></CardHeader><CardContent className="grid gap-3 overflow-y-auto pt-4 text-sm"><p>Invoice date {purchase.invoiceDate} · Payable {stockMoney(purchase.invoiceTotalPaise)} · <BusinessReference prefix="PURCHASE" id={purchase.id}/></p>{purchase.shortage ? <p>Original invoice {stockMoney(purchase.shortage.originalInvoiceTotalPaise)} · Credit note {purchase.shortage.state === 'pending' ? 'awaited — not deducted yet' : `${purchase.shortage.creditNoteNumber} — included once`}</p> : null}<h3 className="font-semibold">Linked GRNs</h3>{!state.ready ? <p role="status">Loading GRNs…</p> : state.error ? <div role="alert"><p className="text-destructive">{state.error}</p><Button onClick={() => setAttempt(value => value + 1)}>Retry GRNs</Button></div> : !state.items.length ? <p>This invoice has no linked GRN. It may have been entered directly or imported; no receipt has been invented.</p> : state.items.map(receipt => <div key={receipt.id}><p>GRN <BusinessReference prefix="GRN" id={receipt.id}/> · {receipt.status}</p><SourceRecord title="Receipt details" value={receipt as unknown as Record<string, unknown>} /></div>)}</CardContent></Card></div>
}
