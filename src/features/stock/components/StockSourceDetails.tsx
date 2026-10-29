import { useEffect, useRef, useState } from 'react'
import type { AppUser } from '@/domain/financeTypes'
import type { PosStockAudit, PosStockAuditBatch } from '@/features/pos/domain/types'
import { Button } from '@/shared/ui/button'
import { StatusPanel } from '@/shared/ui/status-panel'
import { stockDate, stockMoney } from '../domain/currentStock'
import { readSource } from '../data/stockQueries'
import type { StockHistoryEntry } from '../data/stockHistoryRepository'
import { BusinessReference, type BusinessPrefix } from '@/shared/businessReferences'
import { AuditDetails } from '@/shared/ui/audit-details'

type RecordValue = Record<string, unknown>
const labels: Record<string, string> = { submittedAt: 'Submitted at', updatedAt: 'Last updated at', revision: 'Revision', reference: 'Reference', submittedByName: 'Submitted by', submittedByUid: 'Submitter ID', updatedByName: 'Last updated by', updatedByUid: 'Last updater ID', sourceKind: 'Source workflow', sourceRecordId: 'Internal source ID', priceRestoration: 'Price restoration', id: 'Internal record ID', receiptNumber: 'Bill number', status: 'Status', businessDate: 'Business date', receiptDate: 'Receipt date', invoiceDate: 'Invoice date', invoiceNumber: 'Invoice', vendorName: 'Vendor', createdAt: 'Recorded at', actorName: 'Recorded by', actorUid: 'Recorded user ID', createdByName: 'Created by', createdByUid: 'Creator ID', quantityDelta: 'Quantity change', reason: 'Reason', note: 'Reason / note', reversalReason: 'Reversal reason', type: 'Event', returnCondition: 'Return condition', reviewedByName: 'Reviewed by', reviewedByUid: 'Reviewer user ID', reviewReason: 'Review reason', reviewedAt: 'Reviewed at', refundDate: 'Refund date', customerName: 'Customer', totalPaise: 'Total', invoiceTotalPaise: 'Invoice total', receivedValuePaise: 'Received value', valuePaise: 'Return value', refundAmountPaise: 'Refund', payablePurchaseId: 'Vendor invoice reference', originatingGoodsReceiptId: 'Original GRN', beforeMrpPaise: 'Previous MRP', afterMrpPaise: 'New MRP', beforeSellingPricePaise: 'Previous selling price', afterSellingPricePaise: 'New selling price', barcode: 'Barcode', productName: 'Product', physicalQuantity: 'Counted quantity', systemQuantityBefore: 'Previous quantity', difference: 'Quantity adjustment' }
const price = (value: unknown) => stockMoney(typeof value === 'number' ? value : null)
function FieldValue({ name, value, record }: { name: string; value: unknown; record: RecordValue }) {
  if (value === null || value === undefined) return <>Not recorded</>
  const prefix: BusinessPrefix | undefined = name === 'payablePurchaseId' ? 'PURCHASE' : name === 'originatingGoodsReceiptId' || name === 'goodsReceiptId' ? 'GRN' : name === 'vendorReturnId' ? 'RETURN' : name === 'productId' ? 'PRODUCT' : name === 'batchId' ? 'AUDIT' : name === 'correctionId' ? 'PRICE' : name === 'id' && 'invoiceNumber' in record && 'vendorId' in record ? 'GRN' : name === 'id' && 'outcome' in record && 'stockPostingVersion' in record ? 'RETURN' : name === 'id' && 'adjustedItemCount' in record ? 'AUDIT' : undefined
  if (prefix && typeof value === 'string') return <BusinessReference prefix={prefix} id={value}/>
  if (name.endsWith('Paise')) return <>{price(value)}</>
  if (name.endsWith('At')) return <>{stockDate(typeof value === 'string' ? value : '')}</>
  return <>{String(value)}</>
}
export function SourceRecord({ value, title }: { value: RecordValue; title: string }) {
  const lines = (Array.isArray(value.lines) ? value.lines : Array.isArray(value.returnLines) ? value.returnLines : []) as RecordValue[]
  const corrections = (Array.isArray(value.mrpCorrections) ? value.mrpCorrections : []) as RecordValue[]
  const auditFields = new Set(['id', 'submittedAt', 'submittedByName', 'submittedByUid', 'updatedAt', 'updatedByName', 'updatedByUid', 'revision', 'sourceKind', 'sourceRecordId', 'createdAt', 'actorName', 'actorUid', 'createdByName', 'createdByUid', 'reviewedByName', 'reviewedByUid', 'reviewReason', 'reviewedAt'])
  const fields = Object.entries(labels).filter(([name]) => name in value)
  const summaryFields = fields.filter(([name]) => !auditFields.has(name))
  const technicalFields = fields.filter(([name]) => auditFields.has(name))
  const hasUnitPrice = lines.some(line => line.unitCostPaise !== undefined || line.unitPricePaise !== undefined)
  const hasLineTotal = lines.some(line => line.lineTotalPaise !== undefined)
  const hasSelling = lines.some(line => line.sellingPricePaise !== undefined || line.sellingPriceBeforePaise !== undefined)
  const hasMrp = lines.some(line => line.mrpPaise !== undefined)
  const hasMrpChange = lines.some(line => line.beforeMrpPaise !== undefined || line.mrpBeforePaise !== undefined)
  return <section className="space-y-3 rounded-md border p-3"><h3 className="font-semibold">{title}</h3>
    {summaryFields.length ? <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">{summaryFields.map(([name, label]) => <div key={name} className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="break-words text-sm"><FieldValue name={name} value={value[name]} record={value}/></dd></div>)}</dl> : null}
    {lines.length ? <div className="overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2 text-xs text-muted-foreground">Product / barcode</th><th className="p-2 text-xs text-muted-foreground">Quantity</th>{hasUnitPrice ? <th className="p-2 text-xs text-muted-foreground">Unit price / cost</th> : null}{hasLineTotal ? <th className="p-2 text-xs text-muted-foreground">Line total</th> : null}{hasSelling ? <th className="p-2 text-xs text-muted-foreground">Selling price</th> : null}{hasMrp ? <th className="p-2 text-xs text-muted-foreground">MRP</th> : null}{hasMrpChange ? <th className="p-2 text-xs text-muted-foreground">MRP change</th> : null}</tr></thead><tbody>{lines.map((line, index) => <tr key={String(line.id ?? line.productId ?? line.lineId ?? index)} className="border-t"><td className="p-2">{String(line.productName ?? line.description ?? 'Not recorded')}<small className="block text-muted-foreground">{String(line.barcode ?? '')}</small></td><td className="p-2">{String(line.quantity ?? 'Not recorded')}</td>{hasUnitPrice ? <td className="p-2">{price(line.unitCostPaise ?? line.unitPricePaise)}</td> : null}{hasLineTotal ? <td className="p-2">{price(line.lineTotalPaise)}</td> : null}{hasSelling ? <td className="p-2">{'sellingPriceBeforePaise' in line ? price(line.sellingPriceBeforePaise) + ' to ' + price(line.sellingPricePaise) : price(line.sellingPricePaise)}</td> : null}{hasMrp ? <td className="p-2">{price(line.mrpPaise)}</td> : null}{hasMrpChange ? <td className="p-2">{price(line.beforeMrpPaise ?? line.mrpBeforePaise)} to {price(line.afterMrpPaise ?? line.mrpPaise)}</td> : null}</tr>)}</tbody></table></div> : null}
    {technicalFields.length ? <AuditDetails><dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">{technicalFields.map(([name, label]) => <div key={name} className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="break-words text-sm"><FieldValue name={name} value={value[name]} record={value}/></dd></div>)}</dl></AuditDetails> : null}
    {corrections.length ? <details className="rounded-md border border-border px-3 py-2 text-sm"><summary className="cursor-pointer font-medium">Historical price corrections ({corrections.length})</summary><div className="mt-3 grid gap-3">{corrections.map((correction, index) => <SourceRecord key={index} title="Historical MRP correction" value={correction} />)}</div></details> : null}
  </section>
}
export function StockSourceDetails({ entry, currentUser, onClose }: { entry: StockHistoryEntry; currentUser: AppUser; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<Array<{ title: string; value: RecordValue }> | null>(null)
  const [error, setError] = useState('')
  const [approval, setApproval] = useState<RecordValue | null>(null)
  const [approvalError, setApprovalError] = useState('')
  const [openingApproval, setOpeningApproval] = useState(false)
  useEffect(() => { dialog.current?.showModal(); const element = dialog.current; return () => element?.close() }, [])
  useEffect(() => {
    let active = true
    async function load() {
      const records: Array<{ title: string; value: RecordValue }> = []
      async function add(name: string, id: string, title: string) {
        const value = await readSource<RecordValue>(name, id)
        if (!value) throw new Error(`${title} no longer exists or is unavailable.`)
        records.push({ title, value }); return value
      }
      if (entry.goodsReceiptId) { await add('goodsReceipts', entry.goodsReceiptId, 'Goods receipt'); if (entry.type === 'goods-receipt-mrp-correction' && entry.correctionId) await add('events', entry.correctionId, 'Historical correction evidence') }
      else if (entry.billId) await add('bills', entry.billId, 'Bill')
      else if (entry.stockAuditId) {
        const audit = await add('stockAudits', entry.stockAuditId, 'Physical count') as PosStockAudit
        if (audit.batchId) { const batch = await readSource<PosStockAuditBatch>('stockAuditBatches', audit.batchId); if (batch) records.push({ title: 'Audit reason', value: { id: batch.id, note: batch.note, actorName: batch.actorName, createdAt: batch.createdAt } }) }
      } else records.push({ title: 'Recorded movement evidence', value: entry as unknown as RecordValue })
      if (entry.type === 'stock-price-correction' && currentUser.role === 'owner') {
        const record = await readSource<RecordValue>('stockPriceChanges', entry.correctionId ?? entry.id)
        if (record) { const before = record.before as RecordValue | undefined, after = record.after as RecordValue | undefined; records.push({ title: 'Owner price-change record', value: { ...record, beforeMrpPaise: before?.mrpPaise ?? null, afterMrpPaise: after?.mrpPaise ?? null, beforeSellingPricePaise: before?.sellingPricePaise ?? null, afterSellingPricePaise: after?.sellingPricePaise ?? null } }) }
      }
      return records
    }
    void load().then((records) => { if (active) { setResult(records); setError('') } }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Unable to open source.') })
    return () => { active = false }
  }, [entry, currentUser.role, attempt])
  async function openApproval() {
    if (!entry.approvalId || openingApproval) return
    setOpeningApproval(true); setApprovalError('')
    try { const value = await readSource<RecordValue>('approvals', entry.approvalId); if (!value) throw new Error('Approval not found.'); setApproval(value) }
    catch { setApprovalError('These approval details are restricted to the owner or requester, or are unavailable.') }
    finally { setOpeningApproval(false) }
  }
  return <dialog ref={dialog} onCancel={(event) => { event.preventDefault(); onClose() }} aria-label="Stock history source details" className="m-auto max-h-[88dvh] w-[calc(100%_-_2rem)] max-w-4xl overflow-y-auto rounded-lg border bg-card p-4 text-foreground backdrop:bg-black/50"><div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-lg font-semibold">Source details</h2><Button variant="outline" onClick={onClose}>Close</Button></div><SourceRecord title={entry.sourceKind === 'damaged-return' ? 'Damaged return - no stock change' : 'Stock event'} value={entry as unknown as RecordValue} />
    {error ? <StatusPanel variant="destructive">{error}<Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>Retry</Button></StatusPanel> : !result ? <StatusPanel>Loading source</StatusPanel> : <div className="mt-3 space-y-3">{result.map(({ title, value }) => <SourceRecord key={title} title={title} value={value} />)}</div>}
    {entry.approvalId ? <div className="mt-3 space-y-2"><Button variant="outline" disabled={openingApproval} onClick={() => void openApproval()}>Open return / historical void record</Button>{approvalError ? <p role="alert" className="text-sm text-destructive">{approvalError}</p> : null}{approval ? <SourceRecord title="Approval details" value={approval} /> : null}</div> : null}
  </dialog>
}
