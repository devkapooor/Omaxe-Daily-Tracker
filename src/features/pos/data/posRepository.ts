import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getDocsFromServer,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  startAfter,
  startAt,
  endAt,
  where,
  or,
  type QueryConstraint,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/shared/lib/firebase'
import { expectedHandover } from '../domain/cashierHandover'
import type { HandoverLedger } from '../domain/cashierHandover'
import { closeLegacyPosRequest, postPosReturn, quotePosReturn } from './refundRepository'
import { serverNowIso } from '@/shared/lib/serverClock'
import type { AppUser } from '@/domain/financeTypes'
import {
  normalizePosProductSearch,
  upcEanEquivalentBarcode,
} from '../domain/posDomain'
import {
  POS_SANDBOX_ID,
  type PosApprovalRequest,
  type PosBill,
  type PosBillState,
  type PosCheckoutConfig,
  type PosHeldCart,
  type PosPaymentMethod,
  type PosProduct,
  type PosGoodsReceipt,
  type PosStockAudit,
  type PosStockAuditBatch,
  type PosRefundEvent,
} from '../domain/types'
import { calculatePosDashboard } from '../domain/posDashboard'

const root = () => doc(db, 'posSandboxes', POS_SANDBOX_ID)
const posCollection = (name: string) => collection(root(), name)
const posDoc = (name: string, id: string) => doc(root(), name, id)

const nowIso = serverNowIso
const actorFields = (actor: AppUser) => ({ actorUid: actor.id, actorName: actor.name, actorRole: actor.role })

export { PosProductChangedSinceScanError } from '../domain/checkoutErrors'
export { finalizePosBill } from './checkoutRepository'

export function subscribePosGoodsReceipts(callback: (receipts: PosGoodsReceipt[]) => void, onError: (error: Error) => void): Unsubscribe {
  return onSnapshot(query(posCollection('goodsReceipts'), orderBy('updatedAt', 'desc'), limit(100)), (snapshot) => {
    callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as PosGoodsReceipt))
  }, onError)
}

export function subscribePosStockAudits(callback: (audits: PosStockAudit[]) => void, onError: (error: Error) => void): Unsubscribe {
  return onSnapshot(query(posCollection('stockAudits'), orderBy('createdAt', 'desc'), limit(50)), (snapshot) => {
    callback(snapshot.docs.map((item) => item.data() as PosStockAudit))
  }, onError)
}

export function subscribePosStockAuditBatches(callback: (audits: PosStockAuditBatch[]) => void, onError: (error: Error) => void): Unsubscribe {
  return onSnapshot(query(posCollection('stockAuditBatches'), orderBy('createdAt', 'desc'), limit(100)), (snapshot) => {
    callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as PosStockAuditBatch))
  }, onError)
}

export type { StockAuditCount as PosStockAuditCountInput, StockReceiptDraft as GoodsReceiptDraftInput } from '@/features/stock/data/stockPostingRepository'
export type PosStockAuditBatchInput = { id: string; note: string }
export { allocateInternalStockBarcode, saveStockReceiptDraft, savePosGoodsReceiptDraft, deleteStockReceiptDraft as deletePosGoodsReceiptDraft, submitStockReceipt as submitPosGoodsReceipt, reversePosGoodsReceipt, previewStockReceiptReversal, beginStockAudit, postStockAuditGroup, reconcilePosStockAuditBatch, reconcilePosStockCount, finishStockAudit as completePosStockAuditBatch } from '@/features/stock/data/stockPostingRepository'

export function subscribePosProducts(
  callback: (products: PosProduct[]) => void,
  onError: (error: Error) => void,
  filters: { prefix?: string; category?: string; brand?: string } = {},
): Unsubscribe {
  const constraints: QueryConstraint[] = []
  if (filters.category) constraints.push(where('category', '==', filters.category))
  if (filters.brand) constraints.push(where('brand', '==', filters.brand))
  constraints.push(orderBy('searchName'))
  if (filters.prefix?.trim()) {
    const prefix = filters.prefix.trim().toLowerCase()
    constraints.push(startAt(prefix), endAt(`${prefix}\uf8ff`))
  }
  constraints.push(limit(200))
  return onSnapshot(query(posCollection('products'), ...constraints), (snapshot) => {
    callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as PosProduct))
  }, (error) => onError(error))
}

export async function searchPosProductsByName(value: string) {
  const normalized = normalizePosProductSearch(value)
  const terms = normalized.split(' ').filter(Boolean)
  if (!terms.length || terms[0].length < 2) return []
  // Search the narrowest word first so multi-word searches are not starved by
  // the first term's candidate limit (for example, "extra mint").
  const indexTerm = [...terms].sort((left, right) => left.length - right.length)[0]
  const [tokenMatches, namePrefixMatches] = await Promise.all([
    getDocs(query(posCollection('products'), where('searchTokens', 'array-contains', indexTerm), limit(500))),
    getDocs(query(posCollection('products'), orderBy('searchName'), startAt(normalized), endAt(`${normalized}\uf8ff`), limit(50))),
  ])
  const products = new Map([...tokenMatches.docs, ...namePrefixMatches.docs].map((item) => [item.id, { id: item.id, ...item.data() } as PosProduct]))
  return [...products.values()]
    .filter((product) => {
      const searchable = normalizePosProductSearch(product.name)
      return terms.every((term) => searchable.includes(term))
    })
}

export async function findPosProductByBarcode(barcode: string) {
  const value = barcode.trim()
  const find = async (candidate: string) => {
    const snapshot = await getDocs(query(posCollection('products'), where('barcode', '==', candidate), limit(1)))
    const item = snapshot.docs[0]
    return item ? ({ id: item.id, ...item.data() } as PosProduct) : null
  }
  const exact = await find(value)
  if (exact) return exact
  const alternatives = new Set<string>()
  if (/^0\d+$/.test(value)) alternatives.add(value.slice(1))
  const equivalent = upcEanEquivalentBarcode(value)
  if (equivalent) alternatives.add(equivalent)
  for (const candidate of alternatives) {
    const match = await find(candidate)
    if (match) return match
  }
  return null
}

export { createStockProduct as createPosProductFromBarcode } from '@/features/stock/data/stockPostingRepository'

export async function getPosCost(productId: string) {
  const snapshot = await getDoc(posDoc('productCosts', productId))
  if (!snapshot.exists()) return null
  const value = snapshot.data().costPaise
  return typeof value === 'number' ? value : null
}

export function subscribePosConfig(callback: (config: PosCheckoutConfig) => void, onError: (error: Error) => void) {
  return onSnapshot(posDoc('configuration', 'checkout'), { includeMetadataChanges: true }, (snapshot) => {
    if (snapshot.metadata.fromCache) return
    const data = snapshot.data() as Partial<PosCheckoutConfig> | undefined
    callback({ billingMaxDiscountPercentage: typeof data?.billingMaxDiscountPercentage === 'number' ? data.billingMaxDiscountPercentage : null })
  }, onError)
}

export function subscribeHeldCarts(callback: (carts: PosHeldCart[]) => void, onError: (error: Error) => void) {
  return onSnapshot(query(posCollection('heldCarts'), orderBy('updatedAt', 'desc'), limit(50)), (snapshot) => {
    callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as PosHeldCart))
  }, onError)
}

export type PosBillPageCursor = QueryDocumentSnapshot<DocumentData>

export async function loadRecentPosBills(count = 10, after: PosBillPageCursor | null = null) {
  const constraints: QueryConstraint[] = [orderBy('createdAt', 'desc')]
  if (after) constraints.push(startAfter(after))
  constraints.push(limit(count))
  const snapshot = await getDocsFromServer(query(posCollection('bills'), ...constraints))
  return {
    bills: snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as PosBill),
    nextCursor: snapshot.docs.at(-1) ?? null,
  }
}

export type PosCashoutPaymentMix = {
  billCount: number
  refundPaise: number
  methods: Record<PosPaymentMethod, number>
  accounting?: { refundAccountingVersion: 1; grossMethods: Record<PosPaymentMethod, number>; linkedCashRefundPaise: number; windowRefundPaise: number; refundDayRevision: number; refundDayTotalPaise: number; sourceHandoverRevision: number; expectedDrawerPaise: number; ordinaryCashExpensePaise: number }
}
const cashoutMixCache = new Map<string, { expiresAt: number; value: PosCashoutPaymentMix }>()
const cashoutMixRequests = new Map<string, Promise<PosCashoutPaymentMix>>()

/** Fetch only the selected business day's bills/refunds and states for those bills. */
export function getPosCashoutPaymentMix(date: string, fresh = false): Promise<PosCashoutPaymentMix> {
  if (fresh) cashoutMixCache.delete(date)
  const cached = cashoutMixCache.get(date)
  if (cached && cached.expiresAt > performance.now()) return Promise.resolve(cached.value)
  const pending = cashoutMixRequests.get(date)
  if (pending) return pending
  const request = loadPosCashoutPaymentMix(date).then((value) => {
    cashoutMixCache.set(date, { value, expiresAt: performance.now() + 30_000 })
    return value
  }).finally(() => cashoutMixRequests.delete(date))
  cashoutMixRequests.set(date, request)
  return request
}

async function cashoutRecords(name: string, constraints: QueryConstraint[], global = false) {
  const all: Array<Record<string, unknown>> = []
  let cursor: QueryDocumentSnapshot<DocumentData> | undefined
  while (true) {
    const snapshot = await getDocsFromServer(query(global ? collection(db, name) : posCollection(name), ...constraints, orderBy('createdAt', 'desc'), orderBy('__name__', 'desc'), ...(cursor ? [startAfter(cursor)] : []), limit(100)))
    all.push(...snapshot.docs.map(item => ({ ...item.data(), id: item.id })))
    if (snapshot.size < 100) return all
    cursor = snapshot.docs.at(-1)
  }
}
async function loadPosCashoutPaymentMix(date: string): Promise<PosCashoutPaymentMix> {
  const [dayBefore, ledgerBefore] = await Promise.all([getDocFromServer(posDoc('refundDays', date)), getDocFromServer(posDoc('handover', 'main'))])
  const linked = dayBefore.exists()
  let cutoff = ''
  let closedRefund = 0
  if (linked) {
    const closed = await getDocsFromServer(query(collection(db, 'dailyCashouts'), where('date', '==', date), orderBy('createdAt', 'desc'), limit(1)))
    cutoff = closed.docs[0]?.get('createdAt') ?? ''
    closedRefund = closed.docs[0]?.get('refundAccountingVersion') === 1 ? Number(closed.docs[0].get('posRefundDayTotalPaise')) : 0
  }
  const [billsRaw, refundsRaw, cashExpenses] = await Promise.all([
    cashoutRecords('bills', [where('businessDate', '==', date), ...(cutoff ? [where('createdAt', '>', cutoff)] : [])]),
    cashoutRecords('events', [where('refundDate', '==', date), ...(cutoff ? [where('createdAt', '>', cutoff)] : [])]),
    linked ? cashoutRecords('cashouts', [where('date', '==', date), where('paymentMode', '==', 'Cash'), ...(cutoff ? [where('createdAt', '>', cutoff)] : [])], true) : Promise.resolve([]),
  ])
  const bills = billsRaw as PosBill[], refunds = refundsRaw as PosRefundEvent[]
  const stateSnapshots = await Promise.all(Array.from({ length: Math.ceil(bills.length / 30) }, (_, index) => {
    const ids = bills.slice(index * 30, (index + 1) * 30).map(bill => bill.id)
    return getDocsFromServer(query(posCollection('billStates'), where('billId', 'in', ids), limit(ids.length)))
  }))
  const states = stateSnapshots.flatMap(snapshot => snapshot.docs.map(item => item.data() as PosBillState))
  const metrics = calculatePosDashboard(bills, states, refunds, date, date)
  const [dayAfter, ledgerAfter] = await Promise.all([getDocFromServer(posDoc('refundDays', date)), getDocFromServer(posDoc('handover', 'main'))])
  if (ledgerBefore.get('revision') !== ledgerAfter.get('revision') || dayBefore.get('revision') !== dayAfter.get('revision')) throw new Error('Cash activity changed while loading totals. Refresh and review again before closing.')
  const value: PosCashoutPaymentMix = { billCount: metrics.billCount, refundPaise: metrics.refundsPaise, methods: Object.fromEntries(metrics.methods.map(method => [method.value, method.netPaise])) as Record<PosPaymentMethod, number> }
  if (linked) {
    const ledger = ledgerAfter.data() as HandoverLedger
    if (!ledger?.initialized || !ledger.checkpoint) throw new Error('Shared drawer count is unavailable. No refund-aware cashout can be posted.')
    const windowRefund = Number(dayAfter.get('cashRefundPaise')) - closedRefund
    if (!Number.isSafeInteger(windowRefund) || windowRefund < 0) throw new Error('Recorded closing refund totals do not reconcile.');
    value.accounting = { refundAccountingVersion: 1, grossMethods: Object.fromEntries(metrics.methods.map(method => [method.value, method.collectedPaise])) as Record<PosPaymentMethod, number>, linkedCashRefundPaise: windowRefund, windowRefundPaise: metrics.refundsPaise, refundDayRevision: Number(dayAfter.get('revision')), refundDayTotalPaise: Number(dayAfter.get('cashRefundPaise')), sourceHandoverRevision: ledger.revision, expectedDrawerPaise: expectedHandover(ledger, date).cash, ordinaryCashExpensePaise: cashExpenses.filter(expense => expense.sourceKind !== 'pos-return').reduce((sum, expense) => sum + Math.round(Number(expense.amount ?? 0) * 100), 0) }
  }
  return value
}

export function subscribePosApprovals(callback: (requests: PosApprovalRequest[]) => void, onError: (error: Error) => void) {
  return onSnapshot(query(posCollection('approvals'), or(where('status', '==', 'pending'), where('ownerReviewStatus', '==', 'pending')), orderBy('requestedAt', 'asc'), limit(100)), (snapshot) => {
    callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as PosApprovalRequest))
  }, onError)
}

export async function saveHeldCart(
  cart: Omit<PosHeldCart, 'id' | 'revision' | 'createdAt' | 'createdByUid' | 'createdByName' | 'updatedAt' | 'updatedByUid' | 'updatedByName'> & { id?: string },
  actor: AppUser,
) {
  const id = cart.id ?? crypto.randomUUID()
  const reference = posDoc('heldCarts', id)
  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(reference)
    const timestamp = nowIso()
    transaction.set(reference, {
      label: cart.label.trim() || `Held by ${actor.name}`,
      lines: cart.lines,
      ...(cart.customerName?.trim() ? { customerName: cart.customerName.trim() } : {}),
      ...(cart.customerMobile?.trim() ? { customerMobile: cart.customerMobile.trim() } : {}),
      discount: cart.discount,
      revision: existing.exists() ? Number(existing.data().revision ?? 0) + 1 : 1,
      createdAt: existing.exists() ? existing.data().createdAt : timestamp,
      createdByUid: existing.exists() ? existing.data().createdByUid : actor.id,
      createdByName: existing.exists() ? existing.data().createdByName : actor.name,
      updatedAt: timestamp,
      updatedByUid: actor.id,
      updatedByName: actor.name,
    })
  })
  return id
}

export async function deleteHeldCart(id: string) {
  await deleteDoc(posDoc('heldCarts', id))
}

export async function updateDiscountLimit(value: number | null, actor: AppUser) {
  if (actor.role !== 'owner') throw new Error('Only the owner can update POS discount control.')
  if (value !== null && (!Number.isFinite(value) || value < 0 || value > 100)) throw new Error('Discount limit must be between 0 and 100%.')
  const timestamp = nowIso()
  const eventId = crypto.randomUUID()
  await runTransaction(db, async (transaction) => {
    transaction.set(posDoc('configuration', 'checkout'), { billingMaxDiscountPercentage: value, lastEventId: eventId, updatedAt: timestamp, updatedByUid: actor.id, updatedByName: actor.name }, { merge: true })
    transaction.set(posDoc('events', eventId), { type: 'discount-limit-updated', billingMaxDiscountPercentage: value, createdAt: timestamp, ...actorFields(actor) })
  })
}

/** Compatibility adapter: immediate trusted return only; no browser posting. */
export async function requestBillAction(input: Omit<PosApprovalRequest, 'id' | 'receiptNumber' | 'sourceBillCreatedAt' | 'sourceBillRevision' | 'status' | 'requestedAt' | 'requestedByUid' | 'requestedByName'>, actor: AppUser) {
  if (input.type === 'void') throw new Error('Bill cancellation (void) is retired. Use eligible item returns.')
  if (!input.reason.trim()) throw new Error('A return reason is required.')
  if (input.refundMethod !== 'cash') throw new Error('Customer returns are Cash only.')
  const selection = { billId: input.billId, returnCondition: input.returnCondition ?? 'sellable', returnLines: (input.returnLines ?? []).map(line => ({ lineId: line.lineId, quantity: line.quantity })) }
  const quote = await quotePosReturn(selection, actor)
  if (input.refundAmountPaise !== quote.refundPaise || (input.refundDate && input.refundDate !== quote.businessDate)) throw new Error('Return amount or date differs from the original bill quote. Refresh and confirm the calculated cash amount.')
  const record = await postPosReturn({ ...selection, operationId: crypto.randomUUID(), reason: input.reason, refundMethod: 'cash', refundAmountPaise: quote.refundPaise, sourceBillRevision: quote.sourceBillRevision, businessDate: quote.businessDate, confirmationHash: quote.confirmationHash }, actor)
  return record.id
}

/** On-demand Action Centre preview; no listener or write. Bills are immutable. */
export async function loadPosApprovalSource(billId: string, cachedBill?: PosBill): Promise<{ bill: PosBill; state: PosBillState; loadedAt: string }> {
  const [bill, state] = await Promise.all([
    cachedBill ? Promise.resolve(cachedBill) : getDocFromServer(posDoc('bills', billId)).then((snapshot) => {
      if (!snapshot.exists()) throw new Error('The source bill no longer exists.')
      return { ...snapshot.data(), id: snapshot.id } as PosBill
    }),
    getDocFromServer(posDoc('billStates', billId)),
  ])
  if (!state.exists()) throw new Error('The source bill state no longer exists.')
  return { bill, state: state.data() as PosBillState, loadedAt: new Date().toISOString() }
}

export async function rejectPosApproval(requestId: string, reviewReason: string, actor: AppUser) {
  await closeLegacyPosRequest(requestId, reviewReason, actor)
}

/** Old financial decision API is retired for both returns and voids. */
export async function approvePosRequest(_requestId: string, _actor: AppUser): Promise<'approved' | 'stale'> {
  void _requestId; void _actor
  throw new Error('Owner approval posting is retired. Complete eligible cash returns in Bills; historical voids cannot be posted.')
}

/** Historical browser import is retired; no production reset/import fallback. */
export async function importPosProducts(..._args: unknown[]): Promise<never> {
  void _args
  throw new Error('Browser catalogue import is retired. Use separately approved trusted maintenance.')
}
