import { httpsCallable } from 'firebase/functions'
import { getDocFromServer, doc } from 'firebase/firestore'
import { auth, db, functions, firebaseConfig } from '@/shared/lib/firebase'
import type { AppUser } from '@/domain/financeTypes'
import type { PosGoodsReceipt, PosProduct, PosStockAuditBatch } from '@/features/pos/domain/types'

export type StockPendingOperation = { version: 1; actorId: string; method: string; input: Record<string, unknown> }
const methods = new Set(['createStockProduct', 'saveStockReceiptDraft', 'deleteStockReceiptDraft', 'submitStockReceipt', 'reverseStockReceipt', 'beginStockAudit', 'postStockAuditGroup', 'finishStockAudit'])
const key = (uid: string) => `alphahub:stock-operation:${firebaseConfig.projectId}:${uid}`
const changed = () => window.dispatchEvent(new Event('stock-operation-change'))
const inFlight = new Set<string>()
export const stockOperationInFlight = (uid: string) => inFlight.has(uid)
export function pendingStockOperation(uid: string): StockPendingOperation | null {
  const raw = sessionStorage.getItem(key(uid))
  if (!raw) return null
  const value = JSON.parse(raw) as StockPendingOperation
  if (value.version !== 1 || value.actorId !== uid || !methods.has(value.method) || !value.input || typeof value.input !== 'object' || Array.isArray(value.input)) throw new Error('Pending stock recovery is unreadable. Preserve this tab and ask the owner to check the source records.')
  return value
}
export async function stockCall<T>(method: string, input: Record<string, unknown>, actor: AppUser, recovering = false): Promise<T> {
  if (auth.currentUser?.uid !== actor.id) throw new Error('Sign in to the original account before posting stock.')
  if (!methods.has(method)) throw new Error('Unknown stock operation. Reload before continuing.')
  const pending = pendingStockOperation(actor.id)
  if (pending && !recovering) throw new Error('Recover the pending stock operation before starting another change.')
  if (!recovering) {
    sessionStorage.setItem(key(actor.id), JSON.stringify({ version: 1, actorId: actor.id, method, input }))
    changed()
  }
  inFlight.add(actor.id); changed()
  try {
    const result = (await httpsCallable<Record<string, unknown>, T>(functions, method)(input)).data
    if (auth.currentUser?.uid !== actor.id) throw new Error('This result belongs to the previous account. Return to that account to recover it.')
    sessionStorage.removeItem(key(actor.id)); changed(); return result
  } catch (error) {
    // Only the trusted handler's explicit rejection proves no posting occurred.
    const code = (error as { code?: string }).code
    const details = (error as { details?: { stockRejected?: boolean; stockUnposted?: boolean } }).details
    const identityConflict = ['functions/already-exists', 'functions/permission-denied', 'functions/unauthenticated'].includes(code ?? '')
    if (details?.stockUnposted || (!recovering && !identityConflict && details?.stockRejected)) { sessionStorage.removeItem(key(actor.id)); changed() }
    throw error
  } finally {
    inFlight.delete(actor.id); changed()
  }
}
export async function recoverStockOperation(actor: AppUser) {
  const pending = pendingStockOperation(actor.id)
  if (!pending) throw new Error('There is no pending stock operation.')
  const result = await stockCall<unknown>(pending.method, pending.input, actor, true)
  if (auth.currentUser?.uid !== actor.id) throw new Error('Return to the original account to review this result.')
  window.dispatchEvent(new CustomEvent('stock-operation-recovered', { detail: { actorId: actor.id, method: pending.method, result } }))
  return { method: pending.method, result }
}
export type StockAuditCount = { productId: string; physicalQuantity: number; expectedRevision?: number; suppliedCostPaise?: number }
export type StockAuditResult = { auditId: string; productId: string; difference: number; systemQuantityBefore: number; physicalQuantity: number; valueImpactPaise: number }
export async function beginStockAudit(counts: StockAuditCount[], actor: AppUser, batch: { id: string; note: string }) {
  return stockCall<{ id: string; groupCount: number }>('beginStockAudit', { ...batch, counts, operationId: `${batch.id}-begin` }, actor)
}
export async function postStockAuditGroup(batchId: string, groupIndex: number, actor: AppUser) {
  return stockCall<StockAuditResult[]>('postStockAuditGroup', { id: batchId, groupIndex, operationId: `${batchId}-group-${groupIndex}` }, actor)
}
export async function finishStockAudit(batchId: string, actor: AppUser, interrupted = false) {
  return stockCall<PosStockAuditBatch>('finishStockAudit', { id: batchId, interrupted, operationId: `${batchId}-finish-${interrupted}` }, actor)
}
export type StockReceiptDraft = Pick<PosGoodsReceipt, 'vendorId' | 'vendorName' | 'invoiceNumber' | 'invoiceDate' | 'receiptDate' | 'lines'> & { id?: string; expectedRevision?: number; invoiceTotalPaise?: number }
export async function saveStockReceiptDraft(input: StockReceiptDraft, actor: AppUser) {
  const { vendorName: _vendorName, ...intent } = input
  void _vendorName // Vendor name is resolved from the canonical vendor on the server.
  return stockCall<PosGoodsReceipt>('saveStockReceiptDraft', { ...intent, id: input.id ?? crypto.randomUUID(), expectedRevision: input.expectedRevision ?? 0, operationId: crypto.randomUUID() }, actor)
}
async function source(id: string) {
  const snap = await getDocFromServer(doc(db, 'posSandboxes', 'test', 'goodsReceipts', id))
  if (!snap.exists()) throw new Error('GRN was not found.')
  return snap.data() as PosGoodsReceipt
}
export async function deleteStockReceiptDraft(id: string, actor: AppUser) {
  const receipt = await source(id)
  return stockCall('deleteStockReceiptDraft', { id, expectedRevision: receipt.revision, operationId: crypto.randomUUID() }, actor)
}
export async function submitStockReceipt(id: string, actor: AppUser, expectedRevision?: number) {
  const revision = expectedRevision ?? (await source(id)).revision
  return stockCall<{ purchaseId: string; totalPaise: number; payableCreated: boolean }>('submitStockReceipt', { id, expectedRevision: revision, operationId: crypto.randomUUID() }, actor)
}
export type ReceiptReversalPreview = { id: string; expectedRevision: number; confirmationHash: string; payableReversed: boolean; openPayableRemovedPaise: number; vendorCreditAddedPaise: number; lines: Array<{ productId: string; barcode: string; quantityBefore: number; quantityAfter: number; pricesBefore: { mrpPaise: number | null; sellingPricePaise: number }; pricesAfter: { mrpPaise: number | null; sellingPricePaise: number }; priceRestoration: string; costInvalidated: boolean }> }
export async function previewStockReceiptReversal(id: string, actor: AppUser) {
  if (auth.currentUser?.uid !== actor.id) throw new Error('Sign in before opening reversal.')
  return (await httpsCallable<{ id: string }, ReceiptReversalPreview>(functions, 'previewStockReceiptReversal')({ id })).data
}
export async function reverseStockReceipt(id: string, reason: string, actor: AppUser, preview: ReceiptReversalPreview) {
  return stockCall('reverseStockReceipt', { id, reason, expectedRevision: preview.expectedRevision, confirmationHash: preview.confirmationHash, operationId: crypto.randomUUID() }, actor)
}
export async function createStockProduct(input: { barcode: string; name: string; sellingPricePaise: number }, actor: AppUser) {
  return stockCall<PosProduct>('createStockProduct', { ...input, operationId: crypto.randomUUID() }, actor)
}

/** Supporting legacy repository callers use the same trusted posting contract. */
export async function savePosGoodsReceiptDraft(input: StockReceiptDraft, actor: AppUser) {
  return (await saveStockReceiptDraft(input, actor)).id
}
export async function reversePosGoodsReceipt(id: string, reason: string, actor: AppUser, preview?: ReceiptReversalPreview) {
  return reverseStockReceipt(id, reason, actor, preview ?? await previewStockReceiptReversal(id, actor))
}
export async function reconcilePosStockAuditBatch(counts: StockAuditCount[], actor: AppUser, batch: { id: string; note: string } | string = { id: crypto.randomUUID(), note: 'Stock count' }) {
  if (counts.length > 5) throw new Error('Use the audit manifest/group workflow for more than five products.')
  const input = typeof batch === 'string' ? { id: batch, note: 'Stock count' } : batch
  await beginStockAudit(counts, actor, input)
  return postStockAuditGroup(input.id, 0, actor)
}
export async function reconcilePosStockCount(productId: string, physicalQuantity: number, actor: AppUser, expectedRevision: number) {
  const [result] = await reconcilePosStockAuditBatch([{ productId, physicalQuantity, expectedRevision }], actor)
  return result
}
