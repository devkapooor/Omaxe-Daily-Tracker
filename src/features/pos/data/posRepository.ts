import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  startAt,
  endAt,
  updateDoc,
  where,
  writeBatch,
  type QueryConstraint,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/shared/lib/firebase'
import type { AppUser } from '@/domain/financeTypes'
import { cashierAuthTime, cashierRef, handoverRef } from './cashierHandoverRepository'
import { HANDOVER_START, applyPayments, handoverDate, type CashierState, type HandoverLedger } from '../domain/cashierHandover'
import {
  financialYearForDate,
  formatPosReceiptNumber,
  normalizePosProductSearch,
  posSubtotal,
  posProductSearchTokens,
  validateDiscount,
  validateSettlement,
  upcEanEquivalentBarcode,
} from '../domain/posDomain'
import {
  POS_EXPECTED_PRODUCT_COUNT,
  POS_EXPECTED_NEGATIVE_QUANTITY_COUNT,
  POS_EXPECTED_ZERO_QUANTITY_COUNT,
  POS_SANDBOX_ID,
  type PosApprovalRequest,
  type PosBill,
  type PosBillState,
  type PosCartLine,
  type PosCheckoutConfig,
  type PosDiscount,
  type PosHeldCart,
  type PosImportRow,
  type PosImportValidation,
  type PosPaymentAllocation,
  type PosPaymentMethod,
  type PosProduct,
  type PosRefundEvent,
} from '../domain/types'
import { calculatePosDashboard } from '../domain/posDashboard'

const root = () => doc(db, 'posSandboxes', POS_SANDBOX_ID)
const posCollection = (name: string) => collection(root(), name)
const posDoc = (name: string, id: string) => doc(root(), name, id)
const nowIso = () => new Date().toISOString()
const actorFields = (actor: AppUser) => ({ actorUid: actor.id, actorName: actor.name, actorRole: actor.role })

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

export async function getPosCost(productId: string) {
  const snapshot = await getDoc(posDoc('productCosts', productId))
  if (!snapshot.exists()) return null
  const value = snapshot.data().costPaise
  return typeof value === 'number' ? value : null
}

export function subscribePosConfig(callback: (config: PosCheckoutConfig) => void, onError: (error: Error) => void) {
  return onSnapshot(posDoc('configuration', 'checkout'), (snapshot) => {
    const data = snapshot.data() as Partial<PosCheckoutConfig> | undefined
    callback({ billingMaxDiscountPercentage: typeof data?.billingMaxDiscountPercentage === 'number' ? data.billingMaxDiscountPercentage : null })
  }, onError)
}

export function subscribeHeldCarts(callback: (carts: PosHeldCart[]) => void, onError: (error: Error) => void) {
  return onSnapshot(query(posCollection('heldCarts'), orderBy('updatedAt', 'desc'), limit(50)), (snapshot) => {
    callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as PosHeldCart))
  }, onError)
}

export function subscribeRecentBills(callback: (bills: PosBill[]) => void, onError: (error: Error) => void) {
  return onSnapshot(query(posCollection('bills'), orderBy('createdAt', 'desc'), limit(50)), (snapshot) => {
    callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as PosBill))
  }, onError)
}

export function subscribePosDashboardBills(from: string, to: string, callback: (bills: PosBill[]) => void, onError: (error: Error) => void) {
  return onSnapshot(query(posCollection('bills'), where('businessDate', '>=', from), where('businessDate', '<=', to), orderBy('businessDate')), (snapshot) => {
    callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as PosBill))
  }, onError)
}

export function subscribePosBillStates(callback: (states: PosBillState[]) => void, onError: (error: Error) => void) {
  return onSnapshot(posCollection('billStates'), (snapshot) => callback(snapshot.docs.map((item) => item.data() as PosBillState)), onError)
}

export function subscribePosDashboardRefunds(from: string, to: string, callback: (refunds: PosRefundEvent[]) => void, onError: (error: Error) => void) {
  return onSnapshot(query(posCollection('events'), where('refundDate', '>=', from), where('refundDate', '<=', to), orderBy('refundDate')), (snapshot) => {
    callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as PosRefundEvent))
  }, onError)
}

type PosCashoutPaymentMix = {
  billCount: number
  refundPaise: number
  methods: Record<PosPaymentMethod, number>
}
const cashoutMixCache = new Map<string, { expiresAt: number; value: PosCashoutPaymentMix }>()
const cashoutMixRequests = new Map<string, Promise<PosCashoutPaymentMix>>()

/** Fetch only the selected business day's bills/refunds and states for those bills. */
export function getPosCashoutPaymentMix(date: string): Promise<PosCashoutPaymentMix> {
  const cached = cashoutMixCache.get(date)
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.value)
  const pending = cashoutMixRequests.get(date)
  if (pending) return pending
  const request = loadPosCashoutPaymentMix(date).then((value) => {
    cashoutMixCache.set(date, { value, expiresAt: Date.now() + 30_000 })
    return value
  }).finally(() => cashoutMixRequests.delete(date))
  cashoutMixRequests.set(date, request)
  return request
}

async function loadPosCashoutPaymentMix(date: string): Promise<PosCashoutPaymentMix> {
  const [billSnapshot, refundSnapshot] = await Promise.all([
    getDocs(query(posCollection('bills'), where('businessDate', '==', date))),
    getDocs(query(posCollection('events'), where('refundDate', '==', date))),
  ])
  const bills = billSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as PosBill)
  const refunds = refundSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as PosRefundEvent)
  const stateSnapshots = await Promise.all(Array.from({ length: Math.ceil(bills.length / 30) }, (_, index) => {
    const billIds = bills.slice(index * 30, (index + 1) * 30).map((bill) => bill.id)
    return getDocs(query(posCollection('billStates'), where('billId', 'in', billIds)))
  }))
  const states = stateSnapshots.flatMap((snapshot) => snapshot.docs.map((item) => item.data() as PosBillState))
  const metrics = calculatePosDashboard(bills, states, refunds, date, date)
  return {
    billCount: metrics.billCount,
    refundPaise: metrics.refundsPaise,
    methods: Object.fromEntries(metrics.methods.map((method) => [method.value, method.netPaise])) as Record<PosPaymentMethod, number>,
  }
}

export function subscribePosApprovals(callback: (requests: PosApprovalRequest[]) => void, onError: (error: Error) => void) {
  return onSnapshot(query(posCollection('approvals'), orderBy('requestedAt', 'desc'), limit(100)), (snapshot) => {
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

type FinalizeInput = {
  businessDate: string
  lines: PosCartLine[]
  discount: PosDiscount
  payments: PosPaymentAllocation[]
  customerName?: string
  customerMobile?: string
  cashTenderedPaise?: number
}

export async function finalizePosBill(input: FinalizeInput, actor: AppUser) {
  if (!navigator.onLine) throw new Error('Checkout is disabled while offline.')
  if (input.lines.length === 0) throw new Error('Cart is empty.')
  if (input.lines.length > 200) throw new Error('A bill is limited to 200 lines.')
  if (input.lines.some((line) => !Number.isInteger(line.quantity) || line.quantity <= 0 || !Number.isInteger(line.unitPricePaise) || line.unitPricePaise < 0)) {
    throw new Error('Every line must have a whole positive quantity and a valid price.')
  }
  const subtotalPaise = posSubtotal(input.lines)
  const totalPaise = subtotalPaise - input.discount.amountPaise
  validateSettlement(totalPaise, input.payments)
  const billId = crypto.randomUUID()
  const authTime = await cashierAuthTime()
  const financialYear = financialYearForDate(input.businessDate)
  const configRef = posDoc('configuration', 'checkout')
  const sequenceRef = posDoc('sequences', financialYear)
  const billRef = posDoc('bills', billId)
  const billStateRef = posDoc('billStates', billId)
  const productLines = input.lines.filter((line): line is PosCartLine & { productId: string; expectedProductRevision: number } =>
    line.kind === 'product' && typeof line.productId === 'string' && typeof line.expectedProductRevision === 'number')

  return runTransaction(db, async (transaction) => {
    const [configSnapshot, sequenceSnapshot, ledgerSnapshot, cashierSnapshot, ...productSnapshots] = await Promise.all([
      transaction.get(configRef),
      transaction.get(sequenceRef),
      transaction.get(handoverRef()),
      transaction.get(cashierRef(actor.id)),
      ...productLines.map((line) => transaction.get(posDoc('products', line.productId))),
    ])
    const ledger = ledgerSnapshot.data() as HandoverLedger | undefined
    if (!ledger?.initialized) throw new Error('The owner must initialize the shared drawer before billing. Use Set up drawer in POS.')
    const cashier = cashierSnapshot.data() as CashierState | undefined
    if (cashier && (cashier.authTime !== authTime || cashier.closed)) throw new Error('Complete your mandatory login cash count before billing.')
    const configData = configSnapshot.data() as Partial<PosCheckoutConfig> | undefined
    const discountLimit = typeof configData?.billingMaxDiscountPercentage === 'number' ? configData.billingMaxDiscountPercentage : null
    validateDiscount(actor, subtotalPaise, input.discount, discountLimit)
    productSnapshots.forEach((snapshot, index) => {
      const line = productLines[index]
      if (!snapshot.exists()) throw new Error(`Product no longer exists: ${line.description}.`)
      if (snapshot.data().revision !== line.expectedProductRevision) throw new Error(`Stock changed for ${line.description}. Refresh the cart and try again.`)
    })
    const sequenceNumber = Number(sequenceSnapshot.data()?.lastNumber ?? 0) + 1
    const timestamp = nowIso()
    const countDate = handoverDate(timestamp)
    const receiptNumber = formatPosReceiptNumber(input.businessDate, timestamp, sequenceNumber)
    const cashPaid = input.payments.filter((payment) => payment.method === 'cash').reduce((sum, payment) => sum + payment.amountPaise, 0)
    const cashTenderedPaise = input.cashTenderedPaise ?? cashPaid
    if (cashTenderedPaise < cashPaid) throw new Error('Cash tendered cannot be less than the cash allocation.')
    const bill: PosBill = {
      id: billId,
      handoverDate: countDate,
      cashierAuthTime: authTime,
      receiptNumber,
      financialYear,
      sequenceNumber,
      businessDate: input.businessDate,
      ...(input.customerName?.trim() ? { customerName: input.customerName.trim() } : {}),
      ...(input.customerMobile?.trim() ? { customerMobile: input.customerMobile.trim() } : {}),
      lines: input.lines,
      subtotalPaise,
      discount: input.discount,
      totalPaise,
      payments: input.payments,
      ...(cashPaid > 0 ? { cashTenderedPaise, cashChangePaise: cashTenderedPaise - cashPaid } : {}),
      status: 'finalized',
      testOnly: true,
      createdAt: timestamp,
      createdByUid: actor.id,
      createdByName: actor.name,
      createdByRole: actor.role,
    }
    transaction.set(sequenceRef, { financialYear, lastNumber: sequenceNumber, updatedAt: timestamp, updatedByUid: actor.id })
    transaction.set(billRef, bill)
    applyPayments(ledger, input.payments, countDate, 1)
    transaction.set(handoverRef(), { ...ledger, revision: ledger.revision + 1, lastOperation: 'bill', lastOperationId: billId, updatedByUid: actor.id })
    transaction.set(cashierRef(actor.id), { uid: actor.id, authTime, needsLogoutCheck: true, lastBillId: billId, lastReconciliationId: cashier?.lastReconciliationId ?? '', updatedAt: timestamp } satisfies CashierState)
    transaction.set(billStateRef, { billId, state: 'active', revision: 1, returnedQuantities: {}, updatedAt: timestamp, updatedByUid: actor.id })
    productSnapshots.forEach((snapshot, index) => {
      const line = productLines[index]
      const product = snapshot.data() as PosProduct
      const movementId = crypto.randomUUID()
      transaction.update(snapshot.ref, {
        currentQuantity: product.currentQuantity - line.quantity,
        revision: product.revision + 1,
        lastMovementId: movementId,
        updatedAt: timestamp,
        updatedByUid: actor.id,
        updatedByName: actor.name,
      })
      transaction.set(posDoc('stockMovements', movementId), {
        id: movementId, productId: line.productId, barcode: line.barcode, type: 'sale', quantityDelta: -line.quantity,
        beforeQuantity: product.currentQuantity, afterQuantity: product.currentQuantity - line.quantity,
        productRevisionBefore: product.revision, productRevisionAfter: product.revision + 1,
        businessDate: input.businessDate, billId, receiptNumber, createdAt: timestamp, ...actorFields(actor),
      })
    })
    transaction.set(posDoc('events', crypto.randomUUID()), {
      type: 'bill-finalized', billId, receiptNumber, businessDate: input.businessDate,
      totalPaise, createdAt: timestamp, ...actorFields(actor),
    })
    return bill
  })
}

export async function saveSaleFacingProduct(productId: string, values: Pick<PosProduct, 'barcode' | 'name' | 'category' | 'brand' | 'vendor' | 'sellingPricePaise' | 'active'>, expectedRevision: number, actor: AppUser) {
  const productRef = posDoc('products', productId)
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(productRef)
    if (!snapshot.exists()) throw new Error('Product not found.')
    const product = snapshot.data() as PosProduct
    if (product.revision !== expectedRevision) throw new Error('Product changed on another terminal. Refresh and retry.')
    const timestamp = nowIso()
    transaction.update(productRef, { ...values, searchName: values.name.trim().toLowerCase(), searchTokens: posProductSearchTokens(values.name), revision: product.revision + 1, updatedAt: timestamp, updatedByUid: actor.id, updatedByName: actor.name })
    transaction.set(posDoc('events', crypto.randomUUID()), { type: 'product-details-updated', productId, beforeRevision: product.revision, afterRevision: product.revision + 1, createdAt: timestamp, ...actorFields(actor) })
  })
}

export async function adjustPosStock(productId: string, quantityDelta: number, reason: string, sourceReference: string, actor: AppUser) {
  if (!Number.isInteger(quantityDelta) || quantityDelta === 0) throw new Error('Adjustment must be a non-zero whole quantity.')
  if (!reason.trim()) throw new Error('A reason is required.')
  const productRef = posDoc('products', productId)
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(productRef)
    if (!snapshot.exists()) throw new Error('Product not found.')
    const product = snapshot.data() as PosProduct
    const timestamp = nowIso()
    const movementId = crypto.randomUUID()
    transaction.update(productRef, { currentQuantity: product.currentQuantity + quantityDelta, revision: product.revision + 1, lastMovementId: movementId, updatedAt: timestamp, updatedByUid: actor.id, updatedByName: actor.name })
    transaction.set(posDoc('stockMovements', movementId), {
      id: movementId, productId, barcode: product.barcode, type: quantityDelta > 0 ? 'manual-inward' : 'manual-adjustment', quantityDelta,
      beforeQuantity: product.currentQuantity, afterQuantity: product.currentQuantity + quantityDelta,
      productRevisionBefore: product.revision, productRevisionAfter: product.revision + 1,
      businessDate: timestamp.slice(0, 10), reason: reason.trim(), ...(sourceReference.trim() ? { sourceReference: sourceReference.trim() } : {}),
      createdAt: timestamp, ...actorFields(actor),
    })
    transaction.set(posDoc('events', crypto.randomUUID()), { type: 'stock-adjusted', productId, movementId, quantityDelta, reason: reason.trim(), createdAt: timestamp, ...actorFields(actor) })
  })
}

export async function savePosCost(productId: string, costPaise: number | null, actor: AppUser) {
  if (costPaise !== null && (!Number.isInteger(costPaise) || costPaise < 0)) throw new Error('Cost is invalid.')
  const timestamp = nowIso()
  const eventId = crypto.randomUUID()
  await runTransaction(db, async (transaction) => {
    transaction.set(posDoc('productCosts', productId), { productId, costPaise, sourceValue: '', importRunId: 'manual', lastEventId: eventId, updatedAt: timestamp, updatedByUid: actor.id, updatedByName: actor.name }, { merge: true })
    transaction.set(posDoc('events', eventId), { type: 'product-cost-updated', productId, createdAt: timestamp, ...actorFields(actor) })
  })
}

export async function updateDiscountLimit(value: number | null, actor: AppUser) {
  if (value !== null && (!Number.isFinite(value) || value < 0 || value > 100)) throw new Error('Discount limit must be between 0 and 100%.')
  const timestamp = nowIso()
  const eventId = crypto.randomUUID()
  await runTransaction(db, async (transaction) => {
    transaction.set(posDoc('configuration', 'checkout'), { billingMaxDiscountPercentage: value, lastEventId: eventId, updatedAt: timestamp, updatedByUid: actor.id, updatedByName: actor.name }, { merge: true })
    transaction.set(posDoc('events', eventId), { type: 'discount-limit-updated', billingMaxDiscountPercentage: value, createdAt: timestamp, ...actorFields(actor) })
  })
}

export async function requestBillAction(input: Omit<PosApprovalRequest, 'id' | 'receiptNumber' | 'sourceBillCreatedAt' | 'sourceBillRevision' | 'status' | 'requestedAt' | 'requestedByUid' | 'requestedByName'>, actor: AppUser) {
  if (!input.reason.trim()) throw new Error('A reason is required.')
  const billSnapshot = await getDoc(posDoc('bills', input.billId))
  const stateSnapshot = await getDoc(posDoc('billStates', input.billId))
  if (!billSnapshot.exists() || !stateSnapshot.exists()) throw new Error('Bill not found.')
  const bill = billSnapshot.data() as PosBill
  const requestId = crypto.randomUUID()
  await setDoc(posDoc('approvals', requestId), {
    ...input,
    reason: input.reason.trim(),
    receiptNumber: bill.receiptNumber,
    sourceBillCreatedAt: bill.createdAt,
    sourceBillRevision: stateSnapshot.data().revision,
    status: 'pending',
    requestedAt: nowIso(),
    requestedByUid: actor.id,
    requestedByName: actor.name,
  })
  return requestId
}

export async function rejectPosApproval(requestId: string, reviewReason: string, actor: AppUser) {
  if (!reviewReason.trim()) throw new Error('A review reason is required.')
  await updateDoc(posDoc('approvals', requestId), { status: 'rejected', reviewedAt: nowIso(), reviewedByUid: actor.id, reviewedByName: actor.name, reviewReason: reviewReason.trim() })
}

export async function approvePosRequest(requestId: string, actor: AppUser): Promise<'approved' | 'stale'> {
  const requestRef = posDoc('approvals', requestId)
  return runTransaction(db, async (transaction) => {
    const requestSnapshot = await transaction.get(requestRef)
    if (!requestSnapshot.exists()) throw new Error('Request not found.')
    const request = { id: requestSnapshot.id, ...requestSnapshot.data() } as PosApprovalRequest
    if (request.status !== 'pending') throw new Error('Request is no longer pending.')
    const billRef = posDoc('bills', request.billId)
    const stateRef = posDoc('billStates', request.billId)
    const [billSnapshot, stateSnapshot, ledgerSnapshot] = await Promise.all([transaction.get(billRef), transaction.get(stateRef), transaction.get(handoverRef())])
    if (ledgerSnapshot.exists() && !ledgerSnapshot.data().initialized) throw new Error('Drawer setup is running. Retry this approval once setup finishes.')
    if (!billSnapshot.exists() || !stateSnapshot.exists()) throw new Error('Source bill no longer exists.')
    const bill = billSnapshot.data() as PosBill
    const state = stateSnapshot.data() as { state: string; revision: number; returnedQuantities?: Record<string, number> }
    if (state.revision !== request.sourceBillRevision || state.state === 'voided') {
      transaction.update(requestRef, { status: 'stale', reviewedAt: nowIso(), reviewedByUid: actor.id, reviewedByName: actor.name, reviewReason: 'Bill state changed after this request was submitted.' })
      return 'stale' as const
    }
    const requestedByLine = request.type === 'void'
      ? Object.fromEntries(bill.lines.map((line) => [line.id, line.quantity]))
      : Object.fromEntries((request.returnLines ?? []).map((line) => [line.lineId, line.quantity]))
    const requestedLines = bill.lines.filter((line) => Number(requestedByLine[line.id] ?? 0) > 0)
    if (requestedLines.length === 0) throw new Error('Return request has no item quantities.')
    const affectedLines = requestedLines.filter((line) => line.kind === 'product' && line.productId)
    const productSnapshots = await Promise.all(affectedLines.map((line) => transaction.get(posDoc('products', line.productId!))))
    const timestamp = nowIso()
    if (ledgerSnapshot.data()?.initialized) {
      const ledger = ledgerSnapshot.data() as HandoverLedger
      const payments = request.type === 'void' ? (bill.createdAt >= HANDOVER_START ? bill.payments : []) : [{ method: request.refundMethod ?? '', amountPaise: request.refundAmountPaise ?? 0 }]
      applyPayments(ledger, payments, handoverDate(timestamp), -1)
      transaction.set(handoverRef(), { ...ledger, revision: ledger.revision + 1, lastOperation: 'refund', lastOperationId: request.id, updatedByUid: actor.id })
    }
    const returned = { ...(state.returnedQuantities ?? {}) }
    requestedLines.forEach((line) => {
      const quantity = Number(requestedByLine[line.id])
      if (!Number.isInteger(quantity) || quantity <= 0 || quantity + Number(returned[line.id] ?? 0) > line.quantity) throw new Error(`Invalid return quantity for ${line.description}.`)
      returned[line.id] = Number(returned[line.id] ?? 0) + quantity
    })
    affectedLines.forEach((line, index) => {
      const quantity = Number(requestedByLine[line.id])
      const snapshot = productSnapshots[index]
      if (!snapshot.exists()) throw new Error(`Mapped product is missing: ${line.description}.`)
      const product = snapshot.data() as PosProduct
      const restoresStock = request.type === 'void' || request.returnCondition === 'sellable'
      if (restoresStock) {
        const movementId = crypto.randomUUID()
        transaction.update(snapshot.ref, { currentQuantity: product.currentQuantity + quantity, revision: product.revision + 1, lastMovementId: movementId, updatedAt: timestamp, updatedByUid: actor.id, updatedByName: actor.name })
        transaction.set(posDoc('stockMovements', movementId), {
          id: movementId, productId: line.productId, barcode: line.barcode, type: request.type === 'void' ? 'void-reversal' : 'sellable-return', quantityDelta: quantity,
          beforeQuantity: product.currentQuantity, afterQuantity: product.currentQuantity + quantity,
          productRevisionBefore: product.revision, productRevisionAfter: product.revision + 1,
          businessDate: request.refundDate ?? timestamp.slice(0, 10), originalBusinessDate: bill.businessDate,
          billId: request.billId, approvalId: request.id, createdAt: timestamp, ...actorFields(actor),
        })
      }
    })
    transaction.update(stateRef, { state: request.type === 'void' ? 'voided' : 'partially-returned', revision: state.revision + 1, returnedQuantities: returned, updatedAt: timestamp, updatedByUid: actor.id })
    transaction.update(requestRef, { status: 'approved', handoverDate: handoverDate(timestamp), reviewedAt: timestamp, reviewedByUid: actor.id, reviewedByName: actor.name, reviewReason: 'Approved in POS Action Centre.' })
    transaction.set(posDoc('events', crypto.randomUUID()), { type: request.type === 'void' ? 'bill-voided' : 'bill-return-approved', billId: request.billId, approvalId: request.id, refundDate: request.refundDate ?? null, refundAmountPaise: request.refundAmountPaise ?? 0, refundMethod: request.refundMethod ?? null, returnCondition: request.returnCondition ?? null, createdAt: timestamp, ...actorFields(actor) })
    return 'approved' as const
  })
}

export async function mapTemporaryItem(billId: string, lineId: string, productId: string, expectedRevision: number, actor: AppUser) {
  const billRef = posDoc('bills', billId)
  const productRef = posDoc('products', productId)
  const eventRef = posDoc('events', `temporary-map_${billId}_${lineId}`)
  await runTransaction(db, async (transaction) => {
    const [billSnapshot, productSnapshot, existingMapping] = await Promise.all([transaction.get(billRef), transaction.get(productRef), transaction.get(eventRef)])
    if (existingMapping.exists()) throw new Error('This temporary line is already mapped.')
    if (!billSnapshot.exists() || !productSnapshot.exists()) throw new Error('Bill or product not found.')
    const bill = billSnapshot.data() as PosBill
    const line = bill.lines.find((candidate) => candidate.id === lineId && candidate.kind === 'temporary')
    if (!line) throw new Error('Temporary bill line not found.')
    const product = productSnapshot.data() as PosProduct
    if (product.revision !== expectedRevision) throw new Error('Product stock changed. Refresh and retry.')
    const timestamp = nowIso()
    const movementId = crypto.randomUUID()
    transaction.update(productRef, { currentQuantity: product.currentQuantity - line.quantity, revision: product.revision + 1, lastMovementId: movementId, updatedAt: timestamp, updatedByUid: actor.id, updatedByName: actor.name })
    transaction.set(posDoc('stockMovements', movementId), { id: movementId, productId, barcode: product.barcode, type: 'temporary-item-mapped-sale', quantityDelta: -line.quantity, beforeQuantity: product.currentQuantity, afterQuantity: product.currentQuantity - line.quantity, productRevisionBefore: product.revision, productRevisionAfter: product.revision + 1, businessDate: bill.businessDate, mappedAt: timestamp, billId, lineId, createdAt: timestamp, ...actorFields(actor) })
    transaction.set(eventRef, { type: 'temporary-item-mapped', billId, lineId, productId, movementId, originalBusinessDate: bill.businessDate, originalLineEvidence: line, createdAt: timestamp, ...actorFields(actor) })
  })
}

export async function importPosProducts(args: {
  rows: PosImportRow[]
  validation: PosImportValidation
  file: File
  checksum: string
  sourceHeaders: string[]
  actor: AppUser
  onProgress?: (completed: number) => void
}) {
  if (args.validation.errors.length > 0) throw new Error(args.validation.errors[0])
  if (args.validation.rowCount !== POS_EXPECTED_PRODUCT_COUNT) throw new Error(`Expected ${POS_EXPECTED_PRODUCT_COUNT} products; found ${args.validation.rowCount}.`)
  if (args.validation.negativeQuantityCount !== POS_EXPECTED_NEGATIVE_QUANTITY_COUNT) throw new Error(`Expected ${POS_EXPECTED_NEGATIVE_QUANTITY_COUNT} negative opening quantities; found ${args.validation.negativeQuantityCount}.`)
  if (args.validation.zeroQuantityCount !== POS_EXPECTED_ZERO_QUANTITY_COUNT) throw new Error(`Expected ${POS_EXPECTED_ZERO_QUANTITY_COUNT} zero opening quantities; found ${args.validation.zeroQuantityCount}.`)
  if (args.rows.some((row) => row.productId.includes('/'))) throw new Error('Product IDs cannot contain a forward slash.')
  const runId = args.checksum
  const runRef = posDoc('importRuns', runId)
  const existing = await getDoc(runRef)
  if (existing.exists() && existing.data().status === 'completed') {
    throw new Error('This stock CSV has already been imported. Existing stock has been preserved.')
  }
  const completedRows = existing.exists() && existing.data().status === 'running' ? Number(existing.data().completedRows ?? 0) : 0
  const startedAt = existing.data()?.startedAt ?? nowIso()
  await setDoc(runRef, {
    status: 'running', fileName: args.file.name, fileSize: args.file.size, fileLastModified: args.file.lastModified,
    checksumSha256: args.checksum, sourceHeaders: args.sourceHeaders, validation: args.validation,
    upstreamSourceEvidence: {
      fileName: args.rows[0]?.sourceValues['Source Workbook Name'] ?? '',
      fileSize: args.rows[0]?.sourceValues['Source Workbook Size'] ?? '',
      lastModified: args.rows[0]?.sourceValues['Source Workbook Last Modified'] ?? '',
      checksumSha256: args.rows[0]?.sourceValues['Source Workbook SHA256'] ?? '',
    },
    completedRows, totalRows: args.rows.length, startedAt, updatedAt: nowIso(), ...actorFields(args.actor),
  }, { merge: true })
  for (let offset = completedRows; offset < args.rows.length; offset += 175) {
    const chunk = args.rows.slice(offset, offset + 175)
    const batch = writeBatch(db)
    const timestamp = nowIso()
    chunk.forEach((row) => {
      batch.set(posDoc('products', row.productId), {
        barcode: row.barcode, name: row.name, searchName: row.name.toLowerCase(), searchTokens: posProductSearchTokens(row.name), category: row.category, brand: row.brand, vendor: row.vendor,
        sellingPricePaise: row.sellingPricePaise, currentQuantity: row.openingQuantity, revision: 1, active: true,
        sourceValues: row.sourceValues, importRunId: runId, createdAt: timestamp, createdByUid: args.actor.id, createdByName: args.actor.name,
        updatedAt: timestamp, updatedByUid: args.actor.id, updatedByName: args.actor.name,
      })
      batch.set(posDoc('productCosts', row.productId), { productId: row.productId, costPaise: row.costPaise, sourceValue: row.sourceValues[args.sourceHeaders.find((header) => /cost|purchase|buying/i.test(header)) ?? ''] ?? '', importRunId: runId, updatedAt: timestamp, updatedByUid: args.actor.id, updatedByName: args.actor.name })
    })
    await batch.commit()
    const nextCompleted = offset + chunk.length
    await updateDoc(runRef, { completedRows: nextCompleted, updatedAt: nowIso() })
    args.onProgress?.(nextCompleted)
  }
  await updateDoc(runRef, { status: 'completed', completedRows: args.rows.length, completedAt: nowIso(), updatedAt: nowIso() })
}
