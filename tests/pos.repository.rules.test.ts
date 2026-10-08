import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, doc, getDoc, getDocs, setDoc, type Firestore } from 'firebase/firestore'
import type { AppUser } from '../src/domain/financeTypes'

const state = vi.hoisted(() => ({ db: undefined as Firestore | undefined, authTime: 123 }))
vi.mock('@/shared/lib/firebase', () => ({ get db() { return state.db }, functions: {}, auth: { currentUser: { getIdTokenResult: async () => ({ claims: { auth_time: state.authTime } }) } } }))

import {
  approvePosRequest, deleteHeldCart, finalizePosBill, importPosProducts,
  requestBillAction, saveHeldCart, updateDiscountLimit, savePosGoodsReceiptDraft, submitPosGoodsReceipt, reconcilePosStockAuditBatch, reconcilePosStockCount, reversePosGoodsReceipt,
} from '../src/features/pos/data/posRepository'
import { parseApprovedPosCsv } from '../src/features/pos/domain/csvImport'
import { cashierRef, handoverRef, initializeHandover, submitHandover } from '../src/features/pos/data/cashierHandoverRepository'
import { handoverDate } from '../src/features/pos/domain/cashierHandover'
import { setServerClockSample } from '../src/shared/lib/serverClock'
import { createFinanceActions } from '../src/store/actions/createFinanceActions'
import { createSettlementV2 } from '../src/store/vendorLedgerV2Repository'
import { expectedHandover, type HandoverLedger } from '../src/features/pos/domain/cashierHandover'

let environment: RulesTestEnvironment
const owner = { id: 'pos-owner', name: 'POS Owner', role: 'owner' } as AppUser
const billing = { id: 'pos-billing', name: 'POS Billing', role: 'billing' } as AppUser
const timestamp = '2026-10-03T00:00:00.000Z'
const productPath = ['posSandboxes', 'test', 'products', 'qa-product'] as const
const line = { id: 'qa-line', kind: 'product' as const, productId: 'qa-product', barcode: '001', description: 'QA Product', quantity: 2, unitPricePaise: 1000, expectedProductRevision: 1, stockAtScan: 10 }

beforeAll(async () => {
  vi.stubGlobal('navigator', { onLine: true })
  environment = await initializeTestEnvironment({ projectId: 'demo-pos-repository', firestore: { rules: readFileSync('firestore.rules', 'utf8') } })
}, 30_000)

beforeEach(async () => {
  const monotonicNow = performance.now()
  setServerClockSample(Date.now(), monotonicNow, monotonicNow)
  state.authTime = 123
  await environment.clearFirestore()
  await environment.withSecurityRulesDisabled(async (context) => {
    for (const actor of [owner, billing]) await setDoc(doc(context.firestore(), 'users', actor.id), { name: actor.name, role: actor.role, disabled: false, createdAt: timestamp })
  })
  state.db = environment.authenticatedContext(owner.id, { auth_time: state.authTime }).firestore()
  await setDoc(doc(state.db, ...productPath), {
    barcode: '001', name: 'QA Product', searchName: 'qa product', category: 'QA', brand: 'QA', vendor: 'QA', sellingPricePaise: 1000,
    currentQuantity: 10, revision: 1, active: true, createdAt: timestamp, createdByUid: owner.id, createdByName: owner.name,
    updatedAt: timestamp, updatedByUid: owner.id, updatedByName: owner.name,
  })
  await initializeHandover(owner)
  state.db = environment.authenticatedContext(billing.id, { auth_time: state.authTime }).firestore()
})

afterAll(async () => { vi.unstubAllGlobals(); await environment.cleanup() })

async function finalize() {
  return finalizePosBill({ businessDate: '2026-10-03', lines: [line], discount: { mode: 'none', amountPaise: 0 }, payments: [{ method: 'cash', amountPaise: 1000 }, { method: 'upi', amountPaise: 1000 }], cashTenderedPaise: 1500 }, billing)
}

describe('POS repository workflows against deployed rules', () => {
  it('posts a GRN stock receipt and per-receipt vendor payable atomically', async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'appMetadata', 'vendorLedgerV2Config'), { enabled: true, activationDate: '2026-10-01', updatedAt: timestamp, updatedByUserId: owner.id })
      await setDoc(doc(context.firestore(), 'vendorsV2', 'qa-vendor'), {
        id: 'qa-vendor', canonicalName: 'QA Vendor', aliases: [], contact: '', address: '', suppliedBrands: [], active: true,
        openingBalancePaise: 0, revision: 1, createdAt: timestamp, createdByUserId: owner.id, updatedAt: timestamp, updatedByUserId: owner.id,
      })
      for (let index = 1; index < 6; index++) await setDoc(doc(context.firestore(), 'posSandboxes', 'test', 'products', `qa-product-${index}`), {
        barcode: `00${index + 1}`, name: `QA Product ${index}`, searchName: `qa product ${index}`, category: 'QA', brand: 'QA', vendor: 'QA', sellingPricePaise: 1000,
        currentQuantity: 5, revision: 1, active: true, createdAt: timestamp, createdByUid: owner.id, createdByName: owner.name,
        updatedAt: timestamp, updatedByUid: owner.id, updatedByName: owner.name,
      })
    })
    const receiptId = await savePosGoodsReceiptDraft({
      vendorId: 'qa-vendor', vendorName: 'QA Vendor', invoiceNumber: 'INV-1', invoiceDate: '2026-10-03', receiptDate: '2026-10-03',
      lines: Array.from({ length: 6 }, (_, index) => ({ productId: index ? `qa-product-${index}` : 'qa-product', barcode: index ? `00${index + 1}` : '001', productName: index ? `QA Product ${index}` : 'QA Product', category: 'QA', quantity: 3, unitCostPaise: 750, lineTotalPaise: 2250 })),
    }, billing)
    const result = await submitPosGoodsReceipt(receiptId, billing)
    expect(result.totalPaise).toBe(13500)
    expect((await getDoc(doc(state.db!, ...productPath))).data()?.currentQuantity).toBe(13)
    expect((await getDoc(doc(state.db!, 'vendorAccountStatesV2', 'qa-vendor'))).data()?.outstandingPaise).toBe(13500)
    expect((await getDoc(doc(state.db!, 'purchasesV2', `grn-${receiptId}`))).data()?.grnId).toBe(receiptId)
    state.db = environment.authenticatedContext(owner.id, { auth_time: state.authTime }).firestore()
    await reversePosGoodsReceipt(receiptId, 'QA reverse verification', owner)
    expect((await getDoc(doc(state.db, ...productPath))).data()?.currentQuantity).toBe(10)
    expect((await getDoc(doc(state.db, 'vendorAccountStatesV2', 'qa-vendor'))).data()?.outstandingPaise).toBe(0)
    expect((await getDoc(doc(state.db, 'posSandboxes', 'test', 'goodsReceipts', receiptId))).data()?.status).toBe('reversed')
  })

  it('records physical inventory counts and adjusts stock without creating a payable', async () => {
    const changed = await reconcilePosStockCount('qa-product', 7, billing)
    expect(changed).toMatchObject({ difference: -3, systemQuantityBefore: 10, physicalQuantity: 7 })
    const product = (await getDoc(doc(state.db!, ...productPath))).data()!
    expect(product.currentQuantity).toBe(7)
    const audit = (await getDoc(doc(state.db!, 'posSandboxes', 'test', 'stockAudits', changed.auditId))).data()!
    expect(audit).toMatchObject({ systemQuantityBefore: 10, physicalQuantity: 7, difference: -3, actorUid: billing.id })
    const matched = await reconcilePosStockCount('qa-product', 7, billing)
    expect(matched.difference).toBe(0)
    expect((await getDoc(doc(state.db!, ...productPath))).data()?.revision).toBe(product.revision)
  })

  it('reconciles multiple physical counts atomically and links them to one audit batch', async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      for (let index = 2; index <= 5; index++) await setDoc(doc(context.firestore(), 'posSandboxes', 'test', 'products', `qa-product-${index}`), {
        barcode: `00${index}`, name: `QA Product ${index}`, searchName: `qa product ${index}`, category: 'QA', brand: 'QA', vendor: 'QA', sellingPricePaise: 1000,
        currentQuantity: index * 2, revision: 1, active: true, createdAt: timestamp, createdByUid: owner.id, createdByName: owner.name,
        updatedAt: timestamp, updatedByUid: owner.id, updatedByName: owner.name,
      })
    })
    const results = await reconcilePosStockAuditBatch([
      { productId: 'qa-product', physicalQuantity: 7, expectedRevision: 1 },
      ...[2, 3, 4, 5].map((index) => ({ productId: `qa-product-${index}`, physicalQuantity: index * 3, expectedRevision: 1 })),
    ], billing, 'qa-audit-batch')
    expect(results.map(({ difference }) => difference)).toEqual([-3, 2, 3, 4, 5])
    expect((await getDoc(doc(state.db!, ...productPath))).data()?.currentQuantity).toBe(7)
    for (let index = 2; index <= 5; index++) {
      expect((await getDoc(doc(state.db!, 'posSandboxes', 'test', 'products', `qa-product-${index}`))).data()?.currentQuantity).toBe(index * 3)
    }
    for (const result of results) {
      expect((await getDoc(doc(state.db!, 'posSandboxes', 'test', 'stockAudits', result.auditId))).data()).toMatchObject({ batchId: 'qa-audit-batch', actorUid: billing.id })
    }
  })

  it('rejects a stale multi-item audit without partially changing any product', async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'posSandboxes', 'test', 'products', 'qa-product-2'), {
        barcode: '002', name: 'Second QA Product', searchName: 'second qa product', category: 'QA', brand: 'QA', vendor: 'QA', sellingPricePaise: 1000,
        currentQuantity: 4, revision: 1, active: true, createdAt: timestamp, createdByUid: owner.id, createdByName: owner.name,
        updatedAt: timestamp, updatedByUid: owner.id, updatedByName: owner.name,
      })
    })
    await expect(reconcilePosStockAuditBatch([
      { productId: 'qa-product', physicalQuantity: 7, expectedRevision: 1 },
      { productId: 'qa-product-2', physicalQuantity: 9, expectedRevision: 2 },
    ], billing)).rejects.toThrow(/stock changed/)
    expect((await getDoc(doc(state.db!, ...productPath))).data()?.currentQuantity).toBe(10)
    expect((await getDocs(collection(state.db!, 'posSandboxes', 'test', 'stockAudits'))).size).toBe(0)
  })

  it('creates a missing barcode product only as part of a submitted GRN', async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'appMetadata', 'vendorLedgerV2Config'), { enabled: true, activationDate: '2026-10-01', updatedAt: timestamp, updatedByUserId: owner.id })
      await setDoc(doc(context.firestore(), 'vendorsV2', 'qa-vendor'), {
        id: 'qa-vendor', canonicalName: 'QA Vendor', aliases: [], contact: '', address: '', suppliedBrands: [], active: true,
        openingBalancePaise: 0, revision: 1, createdAt: timestamp, createdByUserId: owner.id, updatedAt: timestamp, updatedByUserId: owner.id,
      })
    })
    const receiptId = await savePosGoodsReceiptDraft({
      vendorId: 'qa-vendor', vendorName: 'QA Vendor', invoiceNumber: 'INV-NEW', invoiceDate: '2026-10-03', receiptDate: '2026-10-03',
      lines: [{ productId: 'qa-new-product', barcode: '002', productName: 'New QA Product', category: 'QA', quantity: 2, unitCostPaise: 500, lineTotalPaise: 1000, newProduct: true, sellingPricePaise: 700 }],
    }, billing)
    await submitPosGoodsReceipt(receiptId, billing)
    expect((await getDoc(doc(state.db!, 'posSandboxes', 'test', 'products', 'qa-new-product'))).data()).toMatchObject({ currentQuantity: 2, category: 'QA', sellingPricePaise: 700 })
    state.db = environment.authenticatedContext(owner.id, { auth_time: state.authTime }).firestore()
    expect((await getDoc(doc(state.db, 'posSandboxes', 'test', 'productCosts', 'qa-new-product'))).data()?.costPaise).toBe(500)
  })

  it('keeps an invoice-linked payment as unapplied vendor credit when its GRN is reversed', async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'appMetadata', 'vendorLedgerV2Config'), { enabled: true, activationDate: '2026-10-01', updatedAt: timestamp, updatedByUserId: owner.id })
      await setDoc(doc(context.firestore(), 'vendorsV2', 'qa-vendor'), {
        id: 'qa-vendor', canonicalName: 'QA Vendor', aliases: [], contact: '', address: '', suppliedBrands: [], active: true,
        openingBalancePaise: 0, revision: 1, createdAt: timestamp, createdByUserId: owner.id, updatedAt: timestamp, updatedByUserId: owner.id,
      })
    })
    const receiptId = await savePosGoodsReceiptDraft({
      vendorId: 'qa-vendor', vendorName: 'QA Vendor', invoiceNumber: 'INV-PAID', invoiceDate: '2026-10-03', receiptDate: '2026-10-03',
      lines: [{ productId: 'qa-product', barcode: '001', productName: 'QA Product', category: 'QA', quantity: 1, unitCostPaise: 1000, lineTotalPaise: 1000 }],
    }, billing)
    await submitPosGoodsReceipt(receiptId, billing)
    const purchaseId = `grn-${receiptId}`
    await createSettlementV2({
      id: 'qa-settlement', vendorId: 'qa-vendor', date: '2026-10-03', amountPaise: 1000, mode: 'cash', invoiceId: purchaseId,
      actorUserId: billing.id, timestamp,
    })
    state.db = environment.authenticatedContext(owner.id, { auth_time: state.authTime }).firestore()
    await reversePosGoodsReceipt(receiptId, 'QA paid GRN reversal', owner)
    expect((await getDoc(doc(state.db, 'vendorAccountStatesV2', 'qa-vendor'))).data()).toMatchObject({ outstandingPaise: 0, vendorCreditPaise: 1000 })
    expect((await getDoc(doc(state.db, 'invoiceStatesV2', purchaseId))).data()?.openAmountPaise).toBe(0)
  })

  it('requires a fresh login count after this cashier has billed, then allows checkout', async () => {
    await finalize()
    state.authTime = 456
    state.db = environment.authenticatedContext(billing.id, { auth_time: state.authTime }).firestore()
    await expect(finalize()).rejects.toThrow(/mandatory login cash count/)
    const ledger = (await getDoc(handoverRef())).data()!
    const reconciliation = await submitHandover(billing, 'login', { '10': 1 }, 0, 1000, 0, ledger.revision, handoverDate(), '')
    expect(reconciliation.hasDiscrepancy).toBe(false)
    const next = await finalizePosBill({ businessDate: handoverDate(), lines: [{ ...line, expectedProductRevision: 2 }], discount: { mode: 'none', amountPaise: 0 }, payments: [{ method: 'cash', amountPaise: 2000 }] }, billing)
    expect(next.cashierAuthTime).toBe(456)
  })

  it('saves discrepancies atomically and unlocks without owner approval', async () => {
    await finalize()
    const ledger = (await getDoc(handoverRef())).data()!
    const result = await submitHandover(billing, 'logout', {}, 0, 500, 0, ledger.revision, handoverDate(), 'Short drawer')
    expect(result).toMatchObject({ hasDiscrepancy: true, reviewStatus: 'pending', delta: { cash: -1000, upi: -500, card: 0 } })
    expect((await getDoc(cashierRef(billing.id))).data()?.needsLogoutCheck).toBe(false)
    expect((await getDoc(handoverRef())).data()?.cashNetPaise).toBe(1000)
    expect((await getDoc(handoverRef())).data()?.checkpoint.cashActualPaise).toBe(0)
  })

  it('rejects a stale counting snapshot when another bill changes the shared totals', async () => {
    const revision = (await getDoc(handoverRef())).data()!.revision
    await finalize()
    await expect(submitHandover(billing, 'logout', {}, 0, 0, 0, revision, handoverDate(), '')).rejects.toThrow(/changed the totals/)
  })

  it('blocks checkout with a still-valid token after logout and requires an opening count', async () => {
    await finalize()
    let ledger = (await getDoc(handoverRef())).data()!
    await submitHandover(billing, 'logout', { '10': 1 }, 0, 1000, 0, ledger.revision, handoverDate(), '')
    await expect(finalize()).rejects.toThrow(/mandatory login cash count/)
    ledger = (await getDoc(handoverRef())).data()!
    await submitHandover(billing, 'login', { '10': 1 }, 0, 1000, 0, ledger.revision, handoverDate(), '')
    const bill = await finalizePosBill({ businessDate: handoverDate(), lines: [{ ...line, expectedProductRevision: 2 }], discount: { mode: 'none', amountPaise: 0 }, payments: [{ method: 'cash', amountPaise: 2000 }] }, billing)
    expect(bill.totalPaise).toBe(2000)
  })

  it('accepts only one reconciliation against the same shared revision', async () => {
    const revision = (await getDoc(handoverRef())).data()!.revision
    const results = await Promise.allSettled([
      submitHandover(billing, 'login', {}, 0, 0, 0, revision, handoverDate(), ''),
      submitHandover(billing, 'login', {}, 0, 0, 0, revision, handoverDate(), ''),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect((await getDoc(handoverRef())).data()?.revision).toBe(revision + 1)
  })

  it('saves daily cashout, sales, immutable closure, and zero cash checkpoint atomically', async () => {
    await finalize()
    let ledger = (await getDoc(handoverRef())).data()!
    await submitHandover(billing, 'logout', { '10': 1 }, 0, 1000, 0, ledger.revision, handoverDate(), '')
    state.db = environment.authenticatedContext(owner.id, { auth_time: state.authTime }).firestore()
    const actions = createFinanceActions({
      getState: () => ({ financeData: { sales: [] }, dailyCashouts: [] }) as never,
      setIsBusy: (() => undefined) as never,
      ensureNameInDirectory: async () => false,
    })
    await actions.saveDailyCashoutEntry({
      date: handoverDate(), recordedBy: owner.name, recordedByUserId: owner.id,
      cashSales: 10, upiSales: 10, cardSales: 0, creditSales: 0, returns: 0, cashExpense: 0,
      cashAudit: 10, drawerTotal: 10, remainingBalance: 10,
      drawerDenominations: { denom500: 0, denom200: 0, denom100: 0, denom50: 0, denom20: 0, denom10: 1, change: 0 },
      actualCashParticulars: '10 x 1 = 10', pendingCashParticulars: '',
    })
    const cashouts = await getDocs(collection(state.db, 'dailyCashouts'))
    expect(cashouts.size).toBe(1)
    const cashout = cashouts.docs[0].data()
    expect(cashout).toMatchObject({ cashRemovedPaise: 1000, closingDrawerPaise: 0 })
    expect((await getDoc(doc(state.db, 'posSandboxes', 'test', 'drawerClosures', cashout.id))).data()).toMatchObject({
      countedPaise: 1000, removedPaise: 1000, closingBalancePaise: 0, kind: 'daily-cashout',
    })
    ledger = (await getDoc(handoverRef())).data() as HandoverLedger
    expect(expectedHandover(ledger, handoverDate()).cash).toBe(0)
  })

  it('preserves dashboard-only accounts without a cashier participant record', async () => {
    state.db = environment.authenticatedContext(owner.id, { auth_time: state.authTime }).firestore()
    expect((await getDoc(cashierRef(owner.id))).exists()).toBe(false)
  })

  it('holds a cart without reserving stock and finalizes split payments atomically', async () => {
    const heldId = await saveHeldCart({ label: 'QA hold', lines: [line], discount: { mode: 'none', amountPaise: 0 } }, billing)
    expect((await getDoc(doc(state.db!, ...productPath))).data()?.currentQuantity).toBe(10)
    await deleteHeldCart(heldId)
    const bill = await finalize()
    expect(bill).toMatchObject({ testOnly: true, totalPaise: 2000, cashChangePaise: 500, sequenceNumber: 1 })
    expect((await getDoc(doc(state.db!, ...productPath))).data()).toMatchObject({ currentQuantity: 8, revision: 2 })
    expect((await getDoc(doc(state.db!, 'posSandboxes', 'test', 'bills', bill.id))).exists()).toBe(true)
  })

  it('rejects stale cart stock and mismatched settlements without selling stock', async () => {
    await finalize()
    await expect(finalize()).rejects.toThrow(/Stock changed/)
    await expect(finalizePosBill({ businessDate: '2026-10-03', lines: [line], discount: { mode: 'none', amountPaise: 0 }, payments: [{ method: 'cash', amountPaise: 1999 }] }, billing)).rejects.toThrow(/exactly equal/)
    expect((await getDoc(doc(state.db!, ...productPath))).data()?.currentQuantity).toBe(8)
  })

  it('requires owner approval to void a bill and restores sold stock', async () => {
    const bill = await finalize()
    const requestId = await requestBillAction({ type: 'void', billId: bill.id, reason: 'QA void verification' }, billing)
    await expect(approvePosRequest(requestId, billing)).rejects.toThrow()
    state.db = environment.authenticatedContext(owner.id, { auth_time: state.authTime }).firestore()
    expect(await approvePosRequest(requestId, owner)).toBe('approved')
    expect((await getDoc(doc(state.db, ...productPath))).data()?.currentQuantity).toBe(10)
    expect((await getDoc(doc(state.db, 'posSandboxes', 'test', 'billStates', bill.id))).data()?.state).toBe('voided')
    await expect(approvePosRequest(requestId, owner)).rejects.toThrow(/no longer pending/)
  })

  it.each(['sellable', 'damaged'] as const)('processes a %s return with the correct stock outcome', async (returnCondition) => {
    const bill = await finalize()
    const requestId = await requestBillAction({ type: 'return', billId: bill.id, reason: 'QA return verification', returnCondition, returnLines: [{ lineId: line.id, quantity: 1 }], refundDate: '2026-10-03', refundAmountPaise: 1000, refundMethod: 'cash' }, billing)
    state.db = environment.authenticatedContext(owner.id, { auth_time: state.authTime }).firestore()
    await approvePosRequest(requestId, owner)
    expect((await getDoc(doc(state.db, ...productPath))).data()?.currentQuantity).toBe(returnCondition === 'sellable' ? 9 : 8)
    expect((await getDoc(doc(state.db, 'posSandboxes', 'test', 'billStates', bill.id))).data()?.returnedQuantities).toEqual({ 'qa-line': 1 })
  })

  it('enforces owner configured billing discount limits', async () => {
    state.db = environment.authenticatedContext(owner.id, { auth_time: state.authTime }).firestore()
    await updateDiscountLimit(5, owner)
    state.db = environment.authenticatedContext(billing.id, { auth_time: state.authTime }).firestore()
    await expect(finalizePosBill({ businessDate: '2026-10-03', lines: [line], discount: { mode: 'percentage', percentage: 10, amountPaise: 200 }, payments: [{ method: 'cash', amountPaise: 1800 }] }, billing)).rejects.toThrow(/exceeds/)
    expect((await getDoc(doc(state.db, ...productPath))).data()?.currentQuantity).toBe(10)
  })

  it('preserves current stock when an already completed CSV is selected again', async () => {
    state.db = environment.authenticatedContext(owner.id, { auth_time: state.authTime }).firestore()
    await setDoc(doc(state.db, 'posSandboxes', 'test', 'importRuns', 'qa-checksum'), { status: 'completed', completedRows: 6069 })
    const parsed = parseApprovedPosCsv(readFileSync('data/pos/omaxe-opening-stock-2026-10-02.approved.csv', 'utf8'))
    await expect(importPosProducts({ rows: parsed.products, validation: parsed.validation, file: new File([''], 'approved.csv'), checksum: 'qa-checksum', sourceHeaders: parsed.sourceHeaders, actor: owner })).rejects.toThrow(/already been imported/)
    expect((await getDoc(doc(state.db, ...productPath))).data()?.currentQuantity).toBe(10)
  })
})
