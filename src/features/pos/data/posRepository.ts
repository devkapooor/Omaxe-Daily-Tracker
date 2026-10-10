import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getDocsFromServer,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  startAfter,
  startAt,
  endAt,
  updateDoc,
  where,
  writeBatch,
  type QueryConstraint,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/shared/lib/firebase'
import { serverNowIso } from '@/shared/lib/serverClock'
import type { AppUser } from '@/domain/financeTypes'
import { buildPurchasePostingV2, isV2BusinessDate, type VendorAccountStateV2, type VendorLedgerEntryV2, type InvoiceStateV2, type PurchaseV2 } from '@/domain/vendorLedgerV2'
import { vendorLedgerV2Refs } from '@/store/vendorLedgerV2Repository'
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
  type PosGoodsReceipt,
  type PosGoodsReceiptLine,
  type PosStockAudit,
  type PosStockAuditBatch,
  type PosRefundEvent,
} from '../domain/types'
import { calculatePosDashboard } from '../domain/posDashboard'

const root = () => doc(db, 'posSandboxes', POS_SANDBOX_ID)
const posCollection = (name: string) => collection(root(), name)
const posDoc = (name: string, id: string) => doc(root(), name, id)

function productMrpPaise(product: PosProduct | undefined) {
  const raw = Object.entries(product?.sourceValues ?? {}).find(([key]) => key.trim().toLocaleLowerCase('en-IN') === 'printed mrp')?.[1]
  if (!raw?.trim()) return null
  const amount = Number(raw.replace(/[₹,\s]/g, ''))
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : null
}

function sourceValuesWithMrp(sourceValues: Record<string, string>, mrpPaise: number | null) {
  const next = Object.fromEntries(Object.entries(sourceValues).filter(([key]) => key.trim().toLocaleLowerCase('en-IN') !== 'printed mrp'))
  if (mrpPaise !== null) next['Printed MRP'] = (mrpPaise / 100).toFixed(2)
  return next
}

function reversedReceiptProductUpdates(product: PosProduct, line: PosGoodsReceiptLine, movementId: string, timestamp: string, actor: AppUser) {
  const updates: Record<string, unknown> = {
    currentQuantity: product.currentQuantity - line.quantity, revision: product.revision + 1, lastMovementId: movementId,
    updatedAt: timestamp, updatedByUid: actor.id, updatedByName: actor.name,
  }
  if (line.sellingPriceBeforePaise !== undefined && line.sellingPriceBeforePaise !== null && product.sellingPricePaise === line.sellingPricePaise) {
    updates.sellingPricePaise = line.sellingPriceBeforePaise
  }
  if (line.mrpChanged && line.mrpBeforePaise !== undefined && productMrpPaise(product) === line.mrpPaise) {
    updates.sourceValues = sourceValuesWithMrp(product.sourceValues ?? {}, line.mrpBeforePaise)
  }
  return updates
}
const nowIso = serverNowIso
const actorFields = (actor: AppUser) => ({ actorUid: actor.id, actorName: actor.name, actorRole: actor.role })

export class PosProductChangedSinceScanError extends Error {
  constructor(
    readonly productId: string,
    readonly previousStock: number | undefined,
    readonly latestProduct: Pick<PosProduct, 'name' | 'sellingPricePaise' | 'currentQuantity' | 'revision'>,
  ) {
    super(`Stock changed for ${latestProduct.name} after it was scanned; product details may have changed too.`)
    this.name = 'PosProductChangedSinceScanError'
  }
}

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

export async function loadPosStockAuditItems(batchId: string) {
  const snapshot = await getDocs(query(posCollection('stockAudits'), where('batchId', '==', batchId)))
  return snapshot.docs.map((item) => item.data() as PosStockAudit).sort((left, right) => left.productName.localeCompare(right.productName))
}

export type PosStockAuditCountInput = {
  productId: string
  physicalQuantity: number
  expectedRevision?: number
  suppliedCostPaise?: number
}

export type PosStockAuditBatchInput = { id: string; note: string }

// A small atomic ceiling keeps one multi-product audit within Firestore's
// security-rules document-access budget. Larger physical counts are submitted
// by the UI in successive atomic groups of five.
const maxAtomicStockAuditCount = 5

export async function reconcilePosStockAuditBatch(counts: PosStockAuditCountInput[], actor: AppUser, batchInput: PosStockAuditBatchInput | string = { id: crypto.randomUUID(), note: 'Stock count' }) {
  const batch = typeof batchInput === 'string' ? { id: batchInput, note: 'Stock count' } : batchInput
  if (!counts.length || counts.length > maxAtomicStockAuditCount) throw new Error(`Audit ${counts.length ? `groups are limited to ${maxAtomicStockAuditCount} products` : 'at least one product must be scanned'}.`)
  if (new Set(counts.map((count) => count.productId)).size !== counts.length) throw new Error('Each product can appear only once in an audit batch.')
  if (counts.some((count) => !Number.isInteger(count.physicalQuantity) || count.physicalQuantity < 0)) throw new Error('Physical quantities must be whole numbers of zero or more.')

  const prepared = counts.map((count) => ({
    ...count,
    productRef: posDoc('products', count.productId),
    costRef: posDoc('productCosts', count.productId),
    auditId: crypto.randomUUID(),
    movementId: crypto.randomUUID(),
  }))

  return runTransaction(db, async (transaction) => {
    const [snapshots, costSnapshots, batchSnapshot] = await Promise.all([
      Promise.all(prepared.map((count) => transaction.get(count.productRef))),
      Promise.all(prepared.map((count) => transaction.get(count.costRef))),
      transaction.get(posDoc('stockAuditBatches', batch.id)),
    ])
    const timestamp = nowIso()
    const results = prepared.map((count, index) => {
      const snapshot = snapshots[index]
      if (!snapshot.exists()) throw new Error('A scanned product no longer exists. Remove it and re-scan.')
      const product = snapshot.data() as PosProduct
      if (count.expectedRevision !== undefined && product.revision !== count.expectedRevision) {
        throw new Error(`${product.name} stock changed after it was scanned. Remove and re-scan that product before saving.`)
      }
      const difference = count.physicalQuantity - product.currentQuantity
      const nextRevision = difference === 0 ? product.revision : product.revision + 1
      const costData = costSnapshots[index].data()
      const recordedCost = typeof costData?.costPaise === 'number' ? costData.costPaise : null
      const unitCostPaise = recordedCost ?? count.suppliedCostPaise
      if (!Number.isSafeInteger(unitCostPaise) || (unitCostPaise ?? 0) < 0) throw new Error(`${product.name} has no purchase cost. Enter its cost before saving.`)
      const costSource: PosStockAudit['costSource'] = recordedCost === null ? 'audit-correction' : String(costData?.importRunId ?? '').startsWith('grn:') ? 'grn' : 'manual'
      const valueImpactPaise = difference * (unitCostPaise ?? 0)
      return { ...count, product, difference, nextRevision, timestamp, unitCostPaise: unitCostPaise ?? 0, costSource, valueImpactPaise, needsCostWrite: recordedCost === null }
    })

    const groupIncrease = results.reduce((sum, item) => sum + Math.max(0, item.valueImpactPaise), 0)
    const groupDecrease = results.reduce((sum, item) => sum + Math.abs(Math.min(0, item.valueImpactPaise)), 0)
    const previous = batchSnapshot.data() as PosStockAuditBatch | undefined
    const batchData: PosStockAuditBatch = {
      id: batch.id, status: 'saving', note: batch.note,
      itemCount: (previous?.itemCount ?? 0) + results.length,
      adjustedItemCount: (previous?.adjustedItemCount ?? 0) + results.filter((item) => item.difference !== 0).length,
      matchedItemCount: (previous?.matchedItemCount ?? 0) + results.filter((item) => item.difference === 0).length,
      increaseValuePaise: (previous?.increaseValuePaise ?? 0) + groupIncrease,
      decreaseValuePaise: (previous?.decreaseValuePaise ?? 0) + groupDecrease,
      netValuePaise: (previous?.netValuePaise ?? 0) + groupIncrease - groupDecrease,
      createdAt: previous?.createdAt ?? timestamp, ...actorFields(actor),
    }
    transaction.set(posDoc('stockAuditBatches', batch.id), batchData)

    for (const result of results) {
      const { product, productRef, costRef, productId, physicalQuantity, auditId, movementId, difference, nextRevision, unitCostPaise, costSource, valueImpactPaise, needsCostWrite } = result
      if (difference !== 0) {
        transaction.update(productRef, {
          currentQuantity: physicalQuantity, revision: nextRevision, lastMovementId: movementId,
          updatedAt: timestamp, updatedByUid: actor.id, updatedByName: actor.name,
        })
        transaction.set(posDoc('stockMovements', movementId), {
          id: movementId, productId, barcode: product.barcode, type: 'stock-audit', quantityDelta: difference,
          beforeQuantity: product.currentQuantity, afterQuantity: physicalQuantity,
          productRevisionBefore: product.revision, productRevisionAfter: nextRevision,
          businessDate: timestamp.slice(0, 10), stockAuditId: auditId, createdAt: timestamp, ...actorFields(actor),
        })
      }
      if (needsCostWrite) transaction.set(costRef, {
        productId, costPaise: unitCostPaise, sourceValue: '', importRunId: `audit:${batch.id}`,
        lastEventId: auditId, updatedAt: timestamp, updatedByUid: actor.id, updatedByName: actor.name,
      }, { merge: true })
      transaction.set(posDoc('stockAudits', auditId), {
        id: auditId, batchId: batch.id, productId, barcode: product.barcode, productName: product.name,
        systemQuantityBefore: product.currentQuantity, physicalQuantity, difference,
        systemQuantityAfter: physicalQuantity, productRevisionBefore: product.revision, productRevisionAfter: nextRevision,
        unitCostPaise, costSource, valueImpactPaise,
        ...(difference !== 0 ? { movementId } : {}), createdAt: timestamp, ...actorFields(actor),
      })
      transaction.set(posDoc('events', auditId), {
        type: 'stock-audited', stockAuditId: auditId, stockAuditBatchId: batch.id, productId, difference, createdAt: timestamp, ...actorFields(actor),
      })
    }
    return results.map(({ auditId, productId, difference, product, physicalQuantity, valueImpactPaise }) => ({
      auditId, productId, difference, systemQuantityBefore: product.currentQuantity, physicalQuantity, valueImpactPaise,
    }))
  })
}

export async function completePosStockAuditBatch(batchId: string, actor: AppUser, interrupted = false) {
  await updateDoc(posDoc('stockAuditBatches', batchId), {
    status: 'completed', interrupted, completedAt: nowIso(), completedByUid: actor.id,
  })
}

export async function reconcilePosStockCount(productId: string, physicalQuantity: number, actor: AppUser) {
  const [result] = await reconcilePosStockAuditBatch([{ productId, physicalQuantity }], actor)
  return result
}

export type GoodsReceiptDraftInput = Pick<PosGoodsReceipt, 'vendorId' | 'vendorName' | 'invoiceNumber' | 'invoiceDate' | 'receiptDate' | 'lines'> & { id?: string; invoiceTotalPaise?: number }

export async function savePosGoodsReceiptDraft(input: GoodsReceiptDraftInput, actor: AppUser) {
  if (!input.vendorId.trim() || !input.invoiceNumber.trim()) throw new Error('Choose a vendor and enter the invoice number.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.invoiceDate) || !/^\d{4}-\d{2}-\d{2}$/.test(input.receiptDate)) throw new Error('Enter valid invoice and receipt dates.')
  if (!input.lines.length) throw new Error('Scan at least one product before saving the draft.')
  if (!Number.isSafeInteger(input.invoiceTotalPaise) || (input.invoiceTotalPaise ?? 0) <= 0) throw new Error('Enter the full invoice payable before saving the GRN draft.')
  const id = input.id ?? crypto.randomUUID()
  const reference = posDoc('goodsReceipts', id)
  const timestamp = nowIso()
  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(reference)
    if (existing.exists() && (existing.data().status !== 'draft' || (existing.data().createdByUid !== actor.id && actor.role !== 'owner'))) {
      throw new Error('Only the draft creator or owner can change this draft.')
    }
    transaction.set(reference, {
      id, status: 'draft', vendorId: input.vendorId.trim(), vendorName: input.vendorName.trim(),
      invoiceNumber: input.invoiceNumber.trim(), invoiceDate: input.invoiceDate, receiptDate: input.receiptDate,
      lines: input.lines, totalPaise: input.invoiceTotalPaise || input.lines.reduce((sum, line) => sum + line.quantity * line.unitCostPaise, 0),
      ...(input.invoiceTotalPaise ? { invoiceTotalPaise: input.invoiceTotalPaise } : {}),
      revision: existing.exists() ? Number(existing.data().revision ?? 0) + 1 : 1,
      createdAt: existing.exists() ? existing.data().createdAt : timestamp,
      createdByUid: existing.exists() ? existing.data().createdByUid : actor.id,
      createdByName: existing.exists() ? existing.data().createdByName : actor.name,
      updatedAt: timestamp, updatedByUid: actor.id, updatedByName: actor.name,
    })
  })
  return id
}

export async function deletePosGoodsReceiptDraft(id: string, actor: AppUser) {
  await runTransaction(db, async (transaction) => {
    const reference = posDoc('goodsReceipts', id)
    const snapshot = await transaction.get(reference)
    if (!snapshot.exists() || snapshot.data().status !== 'draft') throw new Error('Only an unsubmitted draft can be deleted here.')
    if (snapshot.data().createdByUid !== actor.id && actor.role !== 'owner') throw new Error('Only the draft creator or owner can delete this draft.')
    transaction.delete(reference)
  })
}

export async function submitPosGoodsReceipt(id: string, actor: AppUser) {
  const references = vendorLedgerV2Refs()
  const draftSnapshot = await getDoc(posDoc('goodsReceipts', id))
  const draft = draftSnapshot.data() as PosGoodsReceipt | undefined
  if (!draft || draft.status !== 'draft') throw new Error('GRN draft was not found or was already submitted.')
  for (const line of draft.lines.filter((item) => item.newProduct)) {
    const barcodeMatch = await getDocs(query(posCollection('products'), where('barcode', '==', line.barcode), limit(1)))
    if (!barcodeMatch.empty) throw new Error(`Barcode ${line.barcode} has already been added to the catalog. Re-scan it.`)
  }
  return runTransaction(db, async (transaction) => {
    const receiptRef = posDoc('goodsReceipts', id)
    const receiptSnapshot = await transaction.get(receiptRef)
    if (!receiptSnapshot.exists()) throw new Error('GRN draft was not found.')
    const receipt = receiptSnapshot.data() as PosGoodsReceipt
    if (receipt.status !== 'draft') throw new Error('This GRN has already been submitted.')
    if (!receipt.lines.length) throw new Error('The GRN has no product lines.')
    const receivedLines = receipt.lines
    const totalPaise = receipt.invoiceTotalPaise ?? 0
    if (!Number.isSafeInteger(totalPaise) || totalPaise <= 0) throw new Error('Enter the full vendor invoice payable before submitting.')
    if (receipt.lines.some((line) => !Number.isInteger(line.quantity) || line.quantity <= 0 || !Number.isSafeInteger(line.unitCostPaise) || line.unitCostPaise <= 0 || !Number.isSafeInteger(line.mrpPaise) || (line.mrpPaise ?? -1) < 0 || !Number.isSafeInteger(line.sellingPricePaise) || (line.sellingPricePaise ?? -1) < 0 || (line.newProduct && (!line.category.trim() || !Number.isInteger(line.sellingPricePaise))))) throw new Error('Every GRN line requires a positive whole quantity, unit cost, MRP, and selling price.')
    if (new Set(receivedLines.map((line) => line.productId)).size !== receivedLines.length) throw new Error('A product can appear only once per GRN. Update its quantity on the existing line.')

    const configRef = doc(db, 'appMetadata', 'vendorLedgerV2Config')
    const vendorRef = doc(references.vendors, receipt.vendorId)
    const accountRef = doc(references.vendorAccountStates, receipt.vendorId)
    const configSnap = await transaction.get(configRef)
    const config = configSnap.data()
    if (config?.enabled !== true) throw new Error('The V2 vendor ledger must be activated before GRNs can create payables.')
    if (!config.activationDate || !isV2BusinessDate(receipt.invoiceDate, config.activationDate)) throw new Error('Invoice date is before the approved vendor-ledger activation date.')

    const vendorSnapshot = await transaction.get(vendorRef)
    if (!vendorSnapshot.exists() || vendorSnapshot.data().active !== true) throw new Error('Choose an active vendor.')
    const productRefs = receivedLines.map((line) => posDoc('products', line.productId))
    const productSnapshots = await Promise.all(productRefs.map((reference) => transaction.get(reference)))
    productSnapshots.forEach((snapshot, index) => {
      const line = receivedLines[index]
      if (snapshot.exists() && (snapshot.data().barcode !== line.barcode || snapshot.data().revision < 1)) throw new Error(`Product changed for ${line.productName}. Re-scan it before submitting.`)
      if (!snapshot.exists() && !line.newProduct) throw new Error(`Product ${line.productName} no longer exists. Re-scan its barcode.`)
      if (snapshot.exists() && line.newProduct) throw new Error(`Product ${line.productName} already exists. Re-scan its barcode.`)
      if (!snapshot.exists() && receipt.lines.some((other, otherIndex) => otherIndex !== index && other.barcode === line.barcode)) throw new Error(`Barcode ${line.barcode} appears more than once in this GRN.`)
    })
    const submittedLines = receivedLines.map((line, index) => {
      const existing = productSnapshots[index].data() as PosProduct | undefined
      return {
        ...line,
        sellingPriceBeforePaise: existing?.sellingPricePaise ?? null,
        mrpBeforePaise: productMrpPaise(existing),
      }
    })
    const accountSnapshot = await transaction.get(accountRef)
    const currentAccount = accountSnapshot.data() as VendorAccountStateV2 | undefined
    const purchaseId = `grn-${id}`
    const posting = buildPurchasePostingV2({
      id: purchaseId, vendorId: receipt.vendorId, invoiceNumber: receipt.invoiceNumber, invoiceDate: receipt.invoiceDate,
      receiptDate: receipt.receiptDate, invoiceTotalPaise: totalPaise, actorUserId: actor.id,
      timestamp: nowIso(),
    })
    const reservationRef = doc(references.invoiceReservations, posting.reservation.id)
    const reservationSnap = await transaction.get(reservationRef)
    let payableCreated = false
    let payableOwner = false
    let timestamp = posting.purchase.createdAt
    let payablePurchaseId = purchaseId
    let originatingGoodsReceiptId: string | undefined
    if (reservationSnap.exists()) {
      const existingPurchaseId = String(reservationSnap.data().purchaseId ?? '')
      const existingPurchaseRef = doc(references.purchases, existingPurchaseId)
      const existingInvoiceRef = doc(references.invoiceStates, existingPurchaseId)
      const [existingPurchaseSnap, existingInvoiceSnap] = await Promise.all([
        transaction.get(existingPurchaseRef), transaction.get(existingInvoiceRef),
      ])
      const existingPurchase = existingPurchaseSnap.data() ?? {}
      if (!existingPurchaseSnap.exists() || !existingInvoiceSnap.exists() || !existingPurchase.grnId) {
        throw new Error('This vendor invoice is already recorded outside GRN. Review the vendor ledger before receiving it again.')
      }
      if (existingPurchase.vendorId !== receipt.vendorId || existingPurchase.normalizedInvoiceNumber !== posting.purchase.normalizedInvoiceNumber || existingPurchase.invoiceTotalPaise !== totalPaise) {
        throw new Error('This invoice number already has a payable with different details. Reuse the same vendor and full invoice total for another partial receipt.')
      }
      const originReceiptRef = posDoc('goodsReceipts', String(existingPurchase.grnId))
      const originReceiptSnap = await transaction.get(originReceiptRef)
      if (!originReceiptSnap.exists() || originReceiptSnap.data().status !== 'submitted') throw new Error('The original GRN for this invoice is not active; ask the owner to review it before adding another receipt.')
      originatingGoodsReceiptId = String(existingPurchase.grnId)
      timestamp = nowIso()
      const linkedReceiptIds = Array.isArray(originReceiptSnap.data().linkedReceiptIds) ? originReceiptSnap.data().linkedReceiptIds as string[] : []
      if (!linkedReceiptIds.includes(id)) transaction.update(originReceiptRef, {
        linkedReceiptIds: [...linkedReceiptIds, id], revision: Number(originReceiptSnap.data().revision ?? 0) + 1,
        updatedAt: timestamp, updatedByUid: actor.id, updatedByName: actor.name,
      })
      payablePurchaseId = existingPurchaseId
    } else {
      const purchaseRef = doc(references.purchases, purchaseId)
      const ledgerRef = doc(references.ledgerEntries, posting.ledgerEntry.id)
      const invoiceStateRef = doc(references.invoiceStates, purchaseId)
      const [purchaseSnap, ledgerSnap, invoiceStateSnap] = await Promise.all([
        transaction.get(purchaseRef), transaction.get(ledgerRef), transaction.get(invoiceStateRef),
      ])
      if (purchaseSnap.exists() || ledgerSnap.exists() || invoiceStateSnap.exists()) throw new Error('This GRN payable already exists or conflicts with another record.')
      const purchase = { ...posting.purchase, grnId: id, lines: submittedLines }
      timestamp = posting.purchase.createdAt
      payableCreated = true
      payableOwner = true
      transaction.set(purchaseRef, purchase)
      transaction.set(reservationRef, posting.reservation)
      transaction.set(ledgerRef, posting.ledgerEntry)
      transaction.set(invoiceStateRef, posting.invoiceState)
      transaction.set(accountRef, currentAccount ? {
        ...currentAccount, outstandingPaise: currentAccount.outstandingPaise + totalPaise,
        revision: currentAccount.revision + 1, lastLedgerEntryId: posting.ledgerEntry.id,
        updatedAt: timestamp, updatedByUserId: actor.id,
      } satisfies VendorAccountStateV2 : {
        id: receipt.vendorId, vendorId: receipt.vendorId, outstandingPaise: totalPaise, revision: 1,
        lastLedgerEntryId: posting.ledgerEntry.id, updatedAt: timestamp, updatedByUserId: actor.id,
      } satisfies VendorAccountStateV2)
    }

    receivedLines.forEach((line, index) => {
      const snapshot = productSnapshots[index]
      const movementId = crypto.randomUUID()
      const existing = snapshot.data() as PosProduct | undefined
      const beforeQuantity = existing?.currentQuantity ?? 0
      const afterQuantity = beforeQuantity + line.quantity
      const beforeRevision = existing?.revision ?? 0
      if (snapshot.exists()) {
        const updates: Record<string, unknown> = {
          currentQuantity: afterQuantity, revision: beforeRevision + 1, lastMovementId: movementId,
          sellingPricePaise: line.sellingPricePaise,
          updatedAt: timestamp, updatedByUid: actor.id, updatedByName: actor.name,
        }
        if (line.mrpChanged) {
          const sourceValues = Object.fromEntries(Object.entries(existing?.sourceValues ?? {}).filter(([key]) => key.trim().toLocaleLowerCase('en-IN') !== 'printed mrp'))
          if (line.mrpPaise !== null && line.mrpPaise !== undefined) sourceValues['Printed MRP'] = (line.mrpPaise / 100).toFixed(2)
          updates.sourceValues = sourceValues
        }
        transaction.update(productRefs[index], updates)
      }
      else transaction.set(productRefs[index], {
        id: line.productId, barcode: line.barcode, name: line.productName, searchName: line.productName.toLocaleLowerCase('en-IN'),
        searchTokens: posProductSearchTokens(line.productName), category: line.category, brand: '', vendor: receipt.vendorName,
        sourceValues: line.mrpPaise !== null && line.mrpPaise !== undefined ? { 'Printed MRP': (line.mrpPaise / 100).toFixed(2) } : {},
        sellingPricePaise: line.sellingPricePaise ?? 0, currentQuantity: afterQuantity, revision: 1, active: true,
        createdAt: timestamp, createdByUid: actor.id, createdByName: actor.name, createdFromGoodsReceiptId: id,
        updatedAt: timestamp, updatedByUid: actor.id, updatedByName: actor.name, lastMovementId: movementId,
      })
      transaction.set(posDoc('stockMovements', movementId), {
        id: movementId, productId: line.productId, barcode: line.barcode, type: 'goods-receipt', quantityDelta: line.quantity,
        beforeQuantity, afterQuantity, productRevisionBefore: beforeRevision, productRevisionAfter: beforeRevision + 1,
        businessDate: receipt.receiptDate, goodsReceiptId: id, createdAt: timestamp, ...actorFields(actor),
      })
      transaction.set(posDoc('productCosts', line.productId), {
        productId: line.productId, costPaise: line.unitCostPaise, sourceValue: '', importRunId: `grn:${id}`,
        lastEventId: movementId, updatedAt: timestamp, updatedByUid: actor.id, updatedByName: actor.name,
      }, { merge: true })
    })
    transaction.update(receiptRef, {
      status: 'submitted', totalPaise, invoiceTotalPaise: totalPaise, lines: submittedLines, payablePurchaseId, payableOwner,
      ...(originatingGoodsReceiptId ? { originatingGoodsReceiptId } : {}),
      revision: receipt.revision + 1,
      updatedAt: timestamp, updatedByUid: actor.id, updatedByName: actor.name,
    })
    transaction.set(posDoc('events', crypto.randomUUID()), {
      type: 'goods-receipt-submitted', goodsReceiptId: id, purchaseId: payablePurchaseId, vendorId: receipt.vendorId,
      totalPaise, payableCreated, createdAt: timestamp, ...actorFields(actor),
    })
    return { purchaseId: payablePurchaseId, totalPaise, payableCreated }
  })
}

export async function correctPosGoodsReceiptMrp(
  id: string,
  corrections: Array<{ productId: string; mrpPaise: number | null }>,
  reason: string,
  actor: AppUser,
) {
  if (actor.role !== 'owner') throw new Error('Only the owner can correct a submitted GRN.')
  if (!reason.trim()) throw new Error('Enter a reason for correcting this GRN.')
  if (!corrections.length) throw new Error('Change at least one product MRP.')
  if (corrections.length > 5) throw new Error('Correct up to five products at a time.')
  if (corrections.some(({ mrpPaise }) => mrpPaise !== null && (!Number.isSafeInteger(mrpPaise) || mrpPaise < 0))) throw new Error('MRP must be zero or greater.')
  const uniqueCorrections = new Map(corrections.map((correction) => [correction.productId, correction.mrpPaise]))
  if (uniqueCorrections.size !== corrections.length) throw new Error('A product can only appear once in a correction.')
  const correctionId = crypto.randomUUID()
  return runTransaction(db, async (transaction) => {
    const receiptRef = posDoc('goodsReceipts', id)
    const receiptSnapshot = await transaction.get(receiptRef)
    if (!receiptSnapshot.exists()) throw new Error('GRN was not found.')
    const receipt = receiptSnapshot.data() as PosGoodsReceipt
    if (receipt.status !== 'submitted') throw new Error('Only a submitted GRN can be corrected.')
    const receiptLines = new Map(receipt.lines.map((line) => [line.productId, line]))
    const entries = [...uniqueCorrections.entries()]
    const productRefs = entries.map(([productId]) => posDoc('products', productId))
    const products = await Promise.all(productRefs.map((reference) => transaction.get(reference)))
    const timestamp = nowIso()
    const correctedLines: Array<{ productId: string; barcode: string; productName: string; beforeMrpPaise: number | null; afterMrpPaise: number | null }> = []
    products.forEach((snapshot, index) => {
      const [productId, afterMrpPaise] = entries[index]
      const line = receiptLines.get(productId)
      if (!line) throw new Error('A product in the correction is not part of this GRN.')
      if (!snapshot.exists()) throw new Error(`Product ${line.productName} no longer exists.`)
      const product = snapshot.data() as PosProduct
      const sourceValues = { ...(product.sourceValues ?? {}) }
      const existingMrpKey = Object.keys(sourceValues).find((key) => key.trim().toLocaleLowerCase('en-IN') === 'printed mrp')
      const rawBefore = existingMrpKey ? Number(sourceValues[existingMrpKey].replace(/[₹,\s]/g, '')) : NaN
      const beforeMrpPaise = Number.isFinite(rawBefore) && rawBefore >= 0 ? Math.round(rawBefore * 100) : null
      for (const key of Object.keys(sourceValues)) if (key.trim().toLocaleLowerCase('en-IN') === 'printed mrp') delete sourceValues[key]
      if (afterMrpPaise !== null) sourceValues['Printed MRP'] = (afterMrpPaise / 100).toFixed(2)
      const movementId = crypto.randomUUID()
      transaction.update(productRefs[index], {
        sourceValues, revision: product.revision + 1, lastMovementId: movementId,
        updatedAt: timestamp, updatedByUid: actor.id, updatedByName: actor.name,
      })
      transaction.set(posDoc('stockMovements', movementId), {
        id: movementId, productId, barcode: line.barcode, type: 'goods-receipt-mrp-correction', quantityDelta: 0,
        beforeQuantity: product.currentQuantity, afterQuantity: product.currentQuantity,
        productRevisionBefore: product.revision, productRevisionAfter: product.revision + 1,
        businessDate: receipt.receiptDate, goodsReceiptId: id, correctionId, reason: reason.trim(),
        createdAt: timestamp, ...actorFields(actor),
      })
      correctedLines.push({ productId, barcode: line.barcode, productName: line.productName, beforeMrpPaise, afterMrpPaise })
    })
    const correction = { reason: reason.trim(), createdAt: timestamp, actorUid: actor.id, actorName: actor.name, lines: correctedLines }
    transaction.update(receiptRef, {
      mrpCorrections: [...(receipt.mrpCorrections ?? []), correction], revision: receipt.revision + 1,
      updatedAt: timestamp, updatedByUid: actor.id, updatedByName: actor.name,
    })
    transaction.set(posDoc('events', correctionId), {
      id: correctionId, type: 'goods-receipt-mrp-corrected', goodsReceiptId: id, reason: reason.trim(),
      lines: correctedLines, createdAt: timestamp, ...actorFields(actor),
    })
    return correction
  })
}

export async function reversePosGoodsReceipt(id: string, reason: string, actor: AppUser) {
  if (actor.role !== 'owner') throw new Error('Only the owner can edit or delete a submitted GRN.')
  if (!reason.trim()) throw new Error('Enter a reason for reversing this GRN.')
  const references = vendorLedgerV2Refs()
  const reversalId = crypto.randomUUID()
  return runTransaction(db, async (transaction) => {
    const receiptRef = posDoc('goodsReceipts', id)
    const receiptSnapshot = await transaction.get(receiptRef)
    if (!receiptSnapshot.exists()) throw new Error('GRN was not found.')
    const receipt = receiptSnapshot.data() as PosGoodsReceipt
    if (receipt.status !== 'submitted' || !receipt.payablePurchaseId) throw new Error('Only a submitted GRN can be reversed.')
    if (receipt.payableOwner === false) {
      const originReceiptRef = posDoc('goodsReceipts', String(receipt.originatingGoodsReceiptId ?? ''))
      const productRefs = receipt.lines.map((line) => posDoc('products', line.productId))
      const costRefs = receipt.lines.map((line) => posDoc('productCosts', line.productId))
      const [originSnapshot, products, costs] = await Promise.all([
        transaction.get(originReceiptRef),
        Promise.all(productRefs.map((reference) => transaction.get(reference))),
        Promise.all(costRefs.map((reference) => transaction.get(reference))),
      ])
      if (!originSnapshot.exists() || originSnapshot.data().status !== 'submitted') throw new Error('The invoice GRN is no longer active; ask the owner to review this receipt.')
      products.forEach((product, index) => { if (!product.exists()) throw new Error(`Product ${receipt.lines[index].productName} no longer exists.`) })
      const timestamp = nowIso()
      receipt.lines.forEach((line, index) => {
        const product = products[index].data() as PosProduct
        const movementId = crypto.randomUUID()
        const afterQuantity = product.currentQuantity - line.quantity
        transaction.update(productRefs[index], reversedReceiptProductUpdates(product, line, movementId, timestamp, actor))
        transaction.set(posDoc('stockMovements', movementId), {
          id: movementId, productId: line.productId, barcode: line.barcode, type: 'goods-receipt-reversal', quantityDelta: -line.quantity,
          beforeQuantity: product.currentQuantity, afterQuantity, productRevisionBefore: product.revision,
          productRevisionAfter: product.revision + 1, businessDate: receipt.receiptDate, goodsReceiptId: id,
          reason: reason.trim(), createdAt: timestamp, ...actorFields(actor),
        })
        if (costs[index].exists() && costs[index].data().importRunId === `grn:${id}`) transaction.set(costRefs[index], {
          ...costs[index].data(), costPaise: null, importRunId: `grn-reversal:${id}`,
          updatedAt: timestamp, updatedByUid: actor.id, updatedByName: actor.name,
        })
      })
      const linkedReceiptIds = (Array.isArray(originSnapshot.data().linkedReceiptIds) ? originSnapshot.data().linkedReceiptIds as string[] : []).filter((linkedId) => linkedId !== id)
      transaction.update(originReceiptRef, {
        linkedReceiptIds, revision: Number(originSnapshot.data().revision ?? 0) + 1,
        updatedAt: timestamp, updatedByUid: actor.id, updatedByName: actor.name,
      })
      transaction.update(receiptRef, {
        status: 'reversed', reversalReason: reason.trim(), revision: receipt.revision + 1,
        updatedAt: timestamp, updatedByUid: actor.id, updatedByName: actor.name,
      })
      transaction.set(posDoc('events', crypto.randomUUID()), {
        type: 'goods-receipt-reversed', goodsReceiptId: id, reason: reason.trim(), payableChanged: false,
        createdAt: timestamp, ...actorFields(actor),
      })
      return { reversalId: '', payableReversed: false }
    }
    const purchaseRef = doc(references.purchases, receipt.payablePurchaseId)
    const invoiceStateRef = doc(references.invoiceStates, receipt.payablePurchaseId)
    const accountRef = doc(references.vendorAccountStates, receipt.vendorId)
    const [purchaseSnapshot, invoiceSnapshot, accountSnapshot] = await Promise.all([
      transaction.get(purchaseRef), transaction.get(invoiceStateRef), transaction.get(accountRef),
    ])
    if (!purchaseSnapshot.exists() || !invoiceSnapshot.exists() || !accountSnapshot.exists()) throw new Error('The GRN payable is incomplete; ask the owner to review the vendor ledger.')
    const purchase = purchaseSnapshot.data() as PurchaseV2
    const invoice = invoiceSnapshot.data() as InvoiceStateV2
    const account = accountSnapshot.data() as VendorAccountStateV2
    if ((receipt.linkedReceiptIds ?? []).length > 0) throw new Error('Reverse the linked partial receipts first; the invoice payable belongs to this original GRN.')
    if (invoice.reservedAmountPaise !== 0) throw new Error('A payment is being allocated to this invoice. Retry the reversal after that payment finishes.')
    if (account.outstandingPaise < invoice.openAmountPaise) throw new Error('The vendor outstanding does not cover this invoice open amount; ask the owner to review the ledger.')
    const productRefs = receipt.lines.map((line) => posDoc('products', line.productId))
    const costRefs = receipt.lines.map((line) => posDoc('productCosts', line.productId))
    const [products, costs] = await Promise.all([
      Promise.all(productRefs.map((reference) => transaction.get(reference))),
      Promise.all(costRefs.map((reference) => transaction.get(reference))),
    ])
    products.forEach((product, index) => { if (!product.exists()) throw new Error(`Product ${receipt.lines[index].productName} no longer exists.`) })
    const timestamp = nowIso()
    const reversal: VendorLedgerEntryV2 = {
      id: reversalId, vendorId: receipt.vendorId, eventType: 'reversal', posting: 'financial',
      signedAmountPaise: invoice.openAmountPaise === 0 ? 0 : -invoice.openAmountPaise,
      sourceType: 'goods-receipt', sourceRecordId: receipt.payablePurchaseId,
      sourceRevision: 1, goodsReceiptId: id, reversalOfEntryId: purchase.ledgerEntryId, reason: reason.trim(),
      occurredOn: receipt.receiptDate, createdAt: timestamp, createdByUserId: actor.id,
    }
    transaction.set(doc(references.ledgerEntries, reversalId), reversal)
    transaction.update(accountRef, {
      ...account, outstandingPaise: account.outstandingPaise - invoice.openAmountPaise,
      vendorCreditPaise: (account.vendorCreditPaise ?? 0) + purchase.invoiceTotalPaise - invoice.openAmountPaise,
      revision: account.revision + 1, lastLedgerEntryId: reversalId, updatedAt: timestamp, updatedByUserId: actor.id,
    })
    transaction.update(invoiceStateRef, {
      ...invoice, openAmountPaise: 0, revision: invoice.revision + 1, updatedAt: timestamp, updatedByUserId: actor.id,
      reversalReason: reason.trim(), reversalLedgerEntryId: reversalId,
    })
    receipt.lines.forEach((line, index) => {
      const product = products[index].data() as PosProduct
      const movementId = crypto.randomUUID()
      const afterQuantity = product.currentQuantity - line.quantity
      transaction.update(productRefs[index], reversedReceiptProductUpdates(product, line, movementId, timestamp, actor))
      transaction.set(posDoc('stockMovements', movementId), {
        id: movementId, productId: line.productId, barcode: line.barcode, type: 'goods-receipt-reversal', quantityDelta: -line.quantity,
        beforeQuantity: product.currentQuantity, afterQuantity, productRevisionBefore: product.revision,
        productRevisionAfter: product.revision + 1, businessDate: receipt.receiptDate, goodsReceiptId: id,
        reason: reason.trim(), createdAt: timestamp, ...actorFields(actor),
      })
      if (costs[index].exists() && costs[index].data().importRunId === `grn:${id}`) {
        transaction.set(costRefs[index], {
          ...costs[index].data(), costPaise: null, importRunId: `grn-reversal:${id}`,
          updatedAt: timestamp, updatedByUid: actor.id, updatedByName: actor.name,
        })
      }
    })
    transaction.update(receiptRef, {
      status: 'reversed', reversalLedgerEntryId: reversalId, reversalReason: reason.trim(),
      reversedOpenAmountPaise: invoice.openAmountPaise, vendorCreditPaiseAdded: purchase.invoiceTotalPaise - invoice.openAmountPaise,
      revision: receipt.revision + 1, updatedAt: timestamp, updatedByUid: actor.id, updatedByName: actor.name,
    })
    transaction.set(posDoc('events', crypto.randomUUID()), {
      type: 'goods-receipt-reversed', goodsReceiptId: id, reversalLedgerEntryId: reversalId,
      reason: reason.trim(), createdAt: timestamp, ...actorFields(actor),
    })
    return { reversalId, payableReversed: true }
  })
}

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

export async function createPosProductFromBarcode(
  input: { barcode: string; name: string; sellingPricePaise: number },
  actor: AppUser,
) {
  const barcode = input.barcode.trim()
  const name = input.name.trim()
  if (!barcode || !name) throw new Error('Barcode and product name are required.')
  if (!Number.isSafeInteger(input.sellingPricePaise) || input.sellingPricePaise < 0) throw new Error('Enter a valid selling price of zero or more.')

  const existing = await findPosProductByBarcode(barcode)
  if (existing) {
    if (!existing.active) throw new Error('This barcode belongs to an inactive product. Ask a manager to reactivate it.')
    return existing
  }

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(barcode))
  const barcodeKey = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  const productId = `barcode_${barcodeKey}`
  const productRef = posDoc('products', productId)
  const eventId = crypto.randomUUID()
  const eventRef = posDoc('events', eventId)
  const timestamp = nowIso()
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(productRef)
    if (snapshot.exists()) {
      const product = { id: snapshot.id, ...snapshot.data() } as PosProduct
      if (product.barcode !== barcode) throw new Error('Barcode identifier collision. Ask an owner to review the product catalog.')
      if (!product.active) throw new Error('This barcode belongs to an inactive product. Ask a manager to reactivate it.')
      return product
    }

    const product: Omit<PosProduct, 'id'> & { createdFromPosBarcode: true } = {
      barcode,
      name,
      searchName: normalizePosProductSearch(name),
      searchTokens: posProductSearchTokens(name),
      category: 'Uncategorized',
      brand: '',
      vendor: '',
      sellingPricePaise: input.sellingPricePaise,
      currentQuantity: 0,
      revision: 1,
      active: true,
      createdFromPosBarcode: true,
      createdAt: timestamp,
      createdByUid: actor.id,
      createdByName: actor.name,
      updatedAt: timestamp,
      updatedByUid: actor.id,
      updatedByName: actor.name,
    }
    transaction.set(productRef, product)
    transaction.set(eventRef, {
      type: 'product-created-from-barcode',
      productId,
      barcode,
      initialQuantity: 0,
      createdAt: timestamp,
      ...actorFields(actor),
    })
    return { id: productId, ...product } as PosProduct
  })
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
  if (input.lines.some((line) => line.kind !== 'product' || !line.productId)) {
    throw new Error('Resolve or remove every unknown product before finalizing this bill.')
  }
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
      if (snapshot.data().revision !== line.expectedProductRevision) {
        const latest = snapshot.data()
        throw new PosProductChangedSinceScanError(line.productId, line.stockAtScan, {
          name: String(latest.name ?? line.description),
          sellingPricePaise: Number(latest.sellingPricePaise ?? line.unitPricePaise),
          currentQuantity: Number(latest.currentQuantity ?? 0),
          revision: Number(latest.revision ?? 0),
        })
      }
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
  if (actor.role !== 'owner') throw new Error('Only the owner can update POS discount control.')
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
