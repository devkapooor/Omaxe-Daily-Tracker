import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, doc, getDoc, getDocs, query, where, setDoc, type Firestore } from 'firebase/firestore'
import type { AppUser } from '../src/domain/financeTypes'

const state = vi.hoisted(() => ({ db: undefined as Firestore | undefined, authTime: 123, userId: 'pos-billing', checkout: undefined as undefined | ((data: unknown) => Promise<unknown>), stock: {} as Record<string, (data: unknown) => Promise<unknown>> }))
vi.mock('@/shared/lib/firebase', () => ({ get db() { return state.db }, firebaseConfig: { projectId: 'demo-pos-repository' }, functions: {}, auth: { app: { options: { projectId: 'demo-pos-repository' } }, currentUser: { get uid() { return state.userId }, getIdTokenResult: async () => ({ claims: { auth_time: state.authTime } }) } } }))
// Supporting repository/Rules integration only: synthetic request identity.
// The real handler uses canonical emulator records; real Auth/callable transport
// acceptance is independently exercised by tests/drill/checkout.spec.cjs.
vi.mock('firebase/functions', () => ({ httpsCallable: (_functions: unknown, name: string) => async (data: unknown) => {
  const handler = name === 'finalizePosCheckout' ? state.checkout : state.stock[name]
  if (!handler) throw new Error('Unexpected callable in repository integration test.')
  try { return { data: await handler(data) } } catch (error) { const e = error as { code?: string }; if (e.code) e.code = `functions/${e.code}`; throw error }
} }))
const serverRequire = createRequire(new URL('../functions/package.json', import.meta.url))
const { initializeApp: initializeAdminApp, deleteApp: deleteAdminApp } = serverRequire('firebase-admin/app')
const { getFirestore: getAdminFirestore } = serverRequire('firebase-admin/firestore')
const { createCheckoutHandler } = serverRequire('./posCheckout.js')
let checkoutAdminApp: ReturnType<typeof initializeAdminApp>

import {
  approvePosRequest, createPosProductFromBarcode, deleteHeldCart, finalizePosBill, importPosProducts,
  requestBillAction, saveHeldCart, updateDiscountLimit, savePosGoodsReceiptDraft, submitPosGoodsReceipt, reconcilePosStockAuditBatch, reconcilePosStockCount, reversePosGoodsReceipt,
} from '../src/features/pos/data/posRepository'
import { parseApprovedPosCsv } from '../src/features/pos/domain/csvImport'
import { cashierRef, handoverRef, initializeHandover, joinCounter, reserveCount, submitHandover } from '../src/features/pos/data/cashierHandoverRepository'
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
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') throw new Error('Only the isolated local Firestore emulator is permitted.')
  checkoutAdminApp = initializeAdminApp({ projectId: 'demo-pos-repository' }, 'repository-checkout-tests')
  const handler = createCheckoutHandler(getAdminFirestore(checkoutAdminApp))
  state.checkout = data => handler({ auth: { uid: state.userId, token: { auth_time: state.authTime } }, data })
}, 30_000)

beforeEach(async () => {
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) })
  vi.stubGlobal('sessionStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) })
  vi.stubGlobal('window', { dispatchEvent: () => true })
  const monotonicNow = performance.now()
  setServerClockSample(Date.now(), monotonicNow, monotonicNow)
  state.authTime = 123
  await environment.clearFirestore()
  await environment.withSecurityRulesDisabled(async (context) => {
    for (const actor of [owner, billing]) await setDoc(doc(context.firestore(), 'users', actor.id), { name: actor.name, role: actor.role, disabled: false, createdAt: timestamp })
  })
  state.userId = owner.id
    state.db = environment.authenticatedContext(owner.id, { auth_time: state.authTime }).firestore()
  await environment.withSecurityRulesDisabled(async context => {
  await setDoc(doc(context.firestore(), ...productPath), {
    barcode: '001', name: 'QA Product', searchName: 'qa product', category: 'QA', brand: 'QA', vendor: 'QA', sellingPricePaise: 1000,
    currentQuantity: 10, revision: 1, active: true, createdAt: timestamp, createdByUid: owner.id, createdByName: owner.name,
    updatedAt: timestamp, updatedByUid: owner.id, updatedByName: owner.name,
  })
  await setDoc(doc(context.firestore(), 'posSandboxes', 'test', 'productCosts', 'qa-product'), {
    productId: 'qa-product', costPaise: 500, sourceValue: '5.00', importRunId: 'qa-seed', updatedAt: timestamp, updatedByUid: owner.id, updatedByName: owner.name,
  })
    await setDoc(doc(context.firestore(), 'appMetadata', 'vendorLedgerV2Config'), { enabled: true, activationDate: '2026-10-01' })
    await setDoc(doc(context.firestore(), 'vendorsV2', 'qa-vendor'), { id: 'qa-vendor', canonicalName: 'QA Vendor', active: true })
  })
  await initializeHandover(owner)
  state.userId = billing.id
    state.db = environment.authenticatedContext(billing.id, { auth_time: state.authTime }).firestore()
  await count('login', {}, 0, 0, 0)
  const ops = serverRequire('./financeOperations.js').createFinanceOperations(getAdminFirestore(checkoutAdminApp))
  const register = serverRequire('./registerPayments.js').createRegisterHandlers(ops)
  const cashout = serverRequire('./financeCashout.js').createCashoutHandlers(ops)
  const handlers: Record<string, (request: unknown) => Promise<unknown>> = { 'vendor-payment': register.settlement, 'cashout-count-start': cashout.prepare, 'cashout-close': cashout.close }
  state.stock.postFinanceOperation = (data: unknown) => { const d = data as { kind: string; intent: unknown }; if (!handlers[d.kind]) throw new Error('Unexpected finance kind'); return handlers[d.kind]({ auth: { uid: state.userId, token: { auth_time: state.authTime } }, data: d.intent }) }
  const receiving = serverRequire('./stockReceiving.js').createStockReceivingHandlers(getAdminFirestore(checkoutAdminApp))
  const audit = serverRequire('./stockAudit.js').createStockAuditHandlers(getAdminFirestore(checkoutAdminApp))
  const refunds = serverRequire('./posRefunds.js').createPosRefundHandlers(getAdminFirestore(checkoutAdminApp))
  for (const [name, handler] of Object.entries({ quotePosReturn: refunds.quote, postPosReturn: refunds.post, reviewPosReturn: refunds.review, closeLegacyPosRequest: refunds.closeLegacy, prepareRefundCashout: refunds.prepareCashout })) state.stock[name] = (data: unknown) => (handler as (request: unknown) => Promise<unknown>)({ auth: { uid: state.userId, token: { auth_time: state.authTime } }, data })
  for (const [name, handler] of Object.entries({ createStockProduct: receiving.createProduct, saveStockReceiptDraft: receiving.saveDraft, deleteStockReceiptDraft: receiving.deleteDraft, submitStockReceipt: receiving.submit, previewStockReceiptReversal: receiving.previewReverse, reverseStockReceipt: receiving.reverse, beginStockAudit: audit.begin, postStockAuditGroup: audit.group, finishStockAudit: audit.finish })) state.stock[name] = (data: unknown) => (handler as (request: unknown) => Promise<unknown>)({ auth: { uid: state.userId }, data })

})

afterAll(async () => { vi.unstubAllGlobals(); await environment.cleanup(); await deleteAdminApp(checkoutAdminApp) })

async function count(kind: 'login' | 'logout', denominations: Record<string, number>, coins: number, upi: number, card: number, note = '') {
  const reservation = await reserveCount(billing, kind)
  return submitHandover(billing, kind, denominations, coins, upi, card, reservation.revision, handoverDate(), note, reservation.id)
}

async function finalize() {
  return finalizePosBill({ businessDate: handoverDate(), lines: [line], discount: { mode: 'none', amountPaise: 0 }, payments: [{ method: 'cash', amountPaise: 1000 }, { method: 'upi', amountPaise: 1000 }], cashTenderedPaise: 1500 }, billing)
}

describe('POS repository workflows against deployed rules', () => {
  it('creates unknown barcode products in live inventory at zero stock and does not duplicate them', async () => {
    const input = { barcode: '8901234567890', name: 'New scanned product', sellingPricePaise: 1250 }
    const first = await createPosProductFromBarcode(input, billing)
    const second = await createPosProductFromBarcode(input, billing)

    expect(second.id).toBe(first.id)
    expect(first).toMatchObject({ barcode: input.barcode, name: input.name, currentQuantity: 0, sellingPricePaise: 1250, category: 'Uncategorized', active: true })
    expect((await getDocs(collection(state.db!, 'posSandboxes', 'test', 'products'))).docs.filter((item) => item.data().barcode === input.barcode)).toHaveLength(1)
    expect((await getDocs(collection(state.db!, 'posSandboxes', 'test', 'stockMovements'))).size).toBe(0)
    expect((await getDocs(collection(state.db!, 'posSandboxes', 'test', 'events'))).docs.filter((item) => item.data().type === 'product-created-from-barcode')).toHaveLength(1)
  })

  it('rejects unresolved temporary lines before creating any bill', async () => {
    await expect(finalizePosBill({
      businessDate: handoverDate(),
      lines: [{ id: 'unresolved-line', kind: 'temporary', barcode: '999999', description: 'Unknown', quantity: 1, unitPricePaise: 100 }],
      discount: { mode: 'none', amountPaise: 0 },
      payments: [{ method: 'cash', amountPaise: 100 }],
    }, billing)).rejects.toThrow(/Resolve or remove every unknown product/)
    expect((await getDocs(collection(state.db!, 'posSandboxes', 'test', 'bills'))).size).toBe(0)
  })

    it('posts a GRN stock receipt and full-invoice vendor payable atomically', async () => {
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
      lines: Array.from({ length: 6 }, (_, index) => ({ productId: index ? `qa-product-${index}` : 'qa-product', barcode: index ? `00${index + 1}` : '001', productName: index ? `QA Product ${index}` : 'QA Product', category: 'QA', expectedRevision: 1, quantity: 3, unitCostPaise: 750, lineTotalPaise: 2250, sellingPricePaise: 1300, mrpPaise: 1500, mrpChanged: true })),
      invoiceTotalPaise: 13500,
    }, billing)
    const result = await submitPosGoodsReceipt(receiptId, billing)
    expect(result.totalPaise).toBe(13500)
    expect((await getDoc(doc(state.db!, ...productPath))).data()?.currentQuantity).toBe(13)
    expect((await getDoc(doc(state.db!, ...productPath))).data()?.sourceValues?.['Printed MRP']).toBe('15.00')
    expect((await getDoc(doc(state.db!, ...productPath))).data()?.sellingPricePaise).toBe(1300)
    expect((await getDoc(doc(state.db!, 'vendorAccountStatesV2', 'qa-vendor'))).data()?.outstandingPaise).toBe(13500)
    expect((await getDoc(doc(state.db!, 'purchasesV2', `grn-${receiptId}`))).data()?.grnId).toBe(receiptId)
    state.userId = owner.id
    state.db = environment.authenticatedContext(owner.id, { auth_time: state.authTime }).firestore()
    // Preserve and exercise a historical correction without re-enabling its retired write path.
    await environment.withSecurityRulesDisabled(async (context) => {
      const database = context.firestore()
      const receiptRef = doc(database, 'posSandboxes', 'test', 'goodsReceipts', receiptId)
      const receipt = (await getDoc(receiptRef)).data()!
      await setDoc(receiptRef, { ...receipt, mrpCorrections: [{ reason: 'Historical package MRP correction', createdAt: timestamp, actorUid: owner.id, actorName: owner.name, lines: [{ productId: 'qa-product', barcode: '001', productName: 'QA Product', beforeMrpPaise: 1500, afterMrpPaise: 17500 }] }] })
      const productRef = doc(database, ...productPath)
      const product = (await getDoc(productRef)).data()!
      await setDoc(productRef, { ...product, sourceValues: { ...product.sourceValues, 'Printed MRP': '175.00' }, revision: product.revision + 1 })
    })
    expect((await getDoc(doc(state.db, ...productPath))).data()?.sourceValues?.['Printed MRP']).toBe('175.00')
    expect((await getDoc(doc(state.db, 'posSandboxes', 'test', 'goodsReceipts', receiptId))).data()?.mrpCorrections).toHaveLength(1)
    await reversePosGoodsReceipt(receiptId, 'QA reverse verification', owner)
    expect((await getDoc(doc(state.db, ...productPath))).data()?.currentQuantity).toBe(10)
    expect((await getDoc(doc(state.db, ...productPath))).data()?.sellingPricePaise).toBe(1000)
    expect((await getDoc(doc(state.db, 'vendorAccountStatesV2', 'qa-vendor'))).data()?.outstandingPaise).toBe(0)
    expect((await getDoc(doc(state.db, 'posSandboxes', 'test', 'goodsReceipts', receiptId))).data()?.status).toBe('reversed')
  })

  it('links partial receipts to one full-invoice payable', async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'appMetadata', 'vendorLedgerV2Config'), { enabled: true, activationDate: '2026-10-01', updatedAt: timestamp, updatedByUserId: owner.id })
      await setDoc(doc(context.firestore(), 'vendorsV2', 'qa-vendor'), {
        id: 'qa-vendor', canonicalName: 'QA Vendor', aliases: [], contact: '', address: '', suppliedBrands: [], active: true,
        openingBalancePaise: 0, revision: 1, createdAt: timestamp, createdByUserId: owner.id, updatedAt: timestamp, updatedByUserId: owner.id,
      })
    })
    const receiptInput = {
      vendorId: 'qa-vendor', vendorName: 'QA Vendor', invoiceNumber: 'INV-PARTIAL', invoiceDate: '2026-10-03', receiptDate: '2026-10-03',
      lines: [{ productId: 'qa-product', barcode: '001', productName: 'QA Product', category: 'QA', expectedRevision: 1, quantity: 1, unitCostPaise: 1000, sellingPricePaise: 1200, mrpPaise: 1500, mrpChanged: true, lineTotalPaise: 1000 }],
      invoiceTotalPaise: 2500,
    }
    const firstId = await savePosGoodsReceiptDraft(receiptInput, billing)
    const firstResult = await submitPosGoodsReceipt(firstId, billing)
    const secondId = await savePosGoodsReceiptDraft({ ...receiptInput, lines: receiptInput.lines.map(line => ({ ...line, expectedRevision: 2 })) }, billing)
    const secondResult = await submitPosGoodsReceipt(secondId, billing)
    expect(firstResult.payableCreated).toBe(true)
    expect(secondResult).toMatchObject({ payableCreated: false, purchaseId: `grn-${firstId}`, totalPaise: 2500 })
    expect((await getDoc(doc(state.db!, 'vendorAccountStatesV2', 'qa-vendor'))).data()?.outstandingPaise).toBe(2500)
    expect((await getDoc(doc(state.db!, ...productPath))).data()?.currentQuantity).toBe(12)
    state.userId = owner.id
    state.db = environment.authenticatedContext(owner.id, { auth_time: state.authTime }).firestore()
    await reversePosGoodsReceipt(secondId, 'Reverse later partial', owner)
    expect((await getDoc(doc(state.db, 'vendorAccountStatesV2', 'qa-vendor'))).data()?.outstandingPaise).toBe(2500)
    expect((await getDoc(doc(state.db, ...productPath))).data()?.currentQuantity).toBe(11)
    await reversePosGoodsReceipt(firstId, 'Reverse original receipt', owner)
    expect((await getDoc(doc(state.db, 'vendorAccountStatesV2', 'qa-vendor'))).data()?.outstandingPaise).toBe(0)
    expect((await getDoc(doc(state.db, ...productPath))).data()?.currentQuantity).toBe(10)
  })

  it('rejects GRN submission when a required product value is missing', async () => {
    const receiptId = await savePosGoodsReceiptDraft({
      vendorId: 'qa-vendor', vendorName: 'QA Vendor', invoiceNumber: 'INV-INCOMPLETE', invoiceDate: '2026-10-03', receiptDate: '2026-10-03',
      lines: [{ productId: 'qa-product', barcode: '001', productName: 'QA Product', category: 'QA', expectedRevision: 1, quantity: 1, unitCostPaise: 1000, lineTotalPaise: 1000, sellingPricePaise: 1200 }],
      invoiceTotalPaise: 1000,
    }, billing)
    await expect(submitPosGoodsReceipt(receiptId, billing)).rejects.toThrow(/MRP/)
  })

  it('records physical inventory counts and adjusts stock without creating a payable', async () => {
    const changed = await reconcilePosStockCount('qa-product', 7, billing, 1)
    expect(changed).toMatchObject({ difference: -3, systemQuantityBefore: 10, physicalQuantity: 7 })
    const product = (await getDoc(doc(state.db!, ...productPath))).data()!
    expect(product.currentQuantity).toBe(7)
    const audit = (await getDoc(doc(state.db!, 'posSandboxes', 'test', 'stockAudits', changed.auditId))).data()!
    expect(audit).toMatchObject({ systemQuantityBefore: 10, physicalQuantity: 7, difference: -3, actorUid: billing.id })
    const matched = await reconcilePosStockCount('qa-product', 7, billing, 2)
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
      for (let index = 2; index <= 5; index++) await setDoc(doc(context.firestore(), 'posSandboxes', 'test', 'productCosts', `qa-product-${index}`), {
        productId: `qa-product-${index}`, costPaise: 500, sourceValue: '5.00', importRunId: 'qa-seed', updatedAt: timestamp, updatedByUid: owner.id, updatedByName: owner.name,
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
      await setDoc(doc(context.firestore(), 'posSandboxes', 'test', 'productCosts', 'qa-product-2'), {
        productId: 'qa-product-2', costPaise: 500, sourceValue: '5.00', importRunId: 'qa-seed', updatedAt: timestamp, updatedByUid: owner.id, updatedByName: owner.name,
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
      lines: [{ productId: 'qa-new-product', barcode: '002', productName: 'New QA Product', category: 'QA', expectedRevision: 1, quantity: 2, unitCostPaise: 500, lineTotalPaise: 1000, newProduct: true, sellingPricePaise: 700, mrpPaise: 1000, mrpChanged: true }],
      invoiceTotalPaise: 1000,
    }, billing)
    await submitPosGoodsReceipt(receiptId, billing)
    expect((await getDoc(doc(state.db!, 'posSandboxes', 'test', 'products', 'qa-new-product'))).data()).toMatchObject({ currentQuantity: 2, category: 'QA', sellingPricePaise: 700 })
    state.userId = owner.id
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
      lines: [{ productId: 'qa-product', barcode: '001', productName: 'QA Product', category: 'QA', expectedRevision: 1, quantity: 1, unitCostPaise: 1000, sellingPricePaise: 1200, mrpPaise: 1500, mrpChanged: true, lineTotalPaise: 1000 }],
      invoiceTotalPaise: 1000,
    }, billing)
    await submitPosGoodsReceipt(receiptId, billing)
    const purchaseId = `grn-${receiptId}`
    const savedLedger = await getAdminFirestore(checkoutAdminApp).doc('posSandboxes/test/handover/main').get()
    await savedLedger.ref.update({ checkpoint: { ...savedLedger.data().checkpoint, cashActualPaise: 1000 } })
    await createSettlementV2({
      id: 'qa-settlement', vendorId: 'qa-vendor', date: handoverDate(), amountPaise: 1000, mode: 'cash', invoiceId: purchaseId,
      actorUserId: billing.id, timestamp,
    })
    state.userId = owner.id
    state.db = environment.authenticatedContext(owner.id, { auth_time: state.authTime }).firestore()
    await reversePosGoodsReceipt(receiptId, 'QA paid GRN reversal', owner)
    expect((await getDoc(doc(state.db, 'vendorAccountStatesV2', 'qa-vendor'))).data()).toMatchObject({ outstandingPaise: 0, vendorCreditPaise: 1000 })
    expect((await getDoc(doc(state.db, 'invoiceStatesV2', purchaseId))).data()?.openAmountPaise).toBe(0)
  })

  it('joins the open counter after reauthentication without repeating the opening count', async () => {
    await finalize()
    const before = (await getDocs(query(collection(state.db!, 'posSandboxes', 'test', 'reconciliations'), where('uid', '==', billing.id)))).size
    state.authTime = 456
    state.userId = billing.id
    state.db = environment.authenticatedContext(billing.id, { auth_time: state.authTime }).firestore()
    await expect(finalize()).rejects.toThrow(/Join the open shared counter/)
    await joinCounter(billing)
    expect((await getDocs(query(collection(state.db, 'posSandboxes', 'test', 'reconciliations'), where('uid', '==', billing.id)))).size).toBe(before)
    const next = await finalizePosBill({ businessDate: handoverDate(), lines: [{ ...line, expectedProductRevision: 2 }], discount: { mode: 'none', amountPaise: 0 }, payments: [{ method: 'cash', amountPaise: 2000 }] }, billing)
    expect(next.receiptNumber).toBeTruthy()
  })

  it('saves discrepancies atomically and unlocks without owner approval', async () => {
    await finalize()
    const result = await count('logout', {}, 0, 500, 0, 'Short drawer')
    expect(result).toMatchObject({ hasDiscrepancy: true, reviewStatus: 'pending', delta: { cash: -1000, upi: -500, card: 0 } })
    expect((await getDoc(cashierRef(billing.id))).data()?.needsLogoutCheck).toBe(false)
    expect((await getDoc(handoverRef())).data()?.cashNetPaise).toBe(1000)
    expect((await getDoc(handoverRef())).data()?.checkpoint.cashActualPaise).toBe(0)
  })

  it('blocks checkout during a live count and rejects a stale counting revision', async () => {
    await finalize()
    const reservation = await reserveCount(billing, 'logout')
    await expect(finalize()).rejects.toThrow(/counting the shared drawer/)
    await expect(submitHandover(billing, 'logout', {}, 0, 0, 0, reservation.revision - 1, handoverDate(), '', reservation.id)).rejects.toThrow(/changed the totals/)
  })

  it('requires rejoining after logout and keeps the shared counter open', async () => {
    await finalize()
    await count('logout', { '10': 1 }, 0, 1000, 0)
    await expect(finalize()).rejects.toThrow(/Join the open shared counter/)
    await joinCounter(billing)
    expect((await getDoc(cashierRef(billing.id))).data()?.closed).toBe(false)
    expect((await getDoc(handoverRef())).data()?.counterSession.status).toBe('open')
  })

  it('accepts only one reconciliation for the same reservation', async () => {
    const reservation = await reserveCount(billing, 'logout')
    const results = await Promise.allSettled([
      submitHandover(billing, 'logout', {}, 0, 0, 0, reservation.revision, handoverDate(), '', reservation.id),
      submitHandover(billing, 'logout', {}, 0, 0, 0, reservation.revision, handoverDate(), '', reservation.id),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect((await getDoc(handoverRef())).data()?.revision).toBe(reservation.revision + 1)
  })

  it('saves daily cashout, sales, immutable closure, and zero cash checkpoint atomically', async () => {
    await finalize()
    let ledger = (await getDoc(handoverRef())).data()!
    await count('logout', { '10': 1 }, 0, 1000, 0)
    state.userId = owner.id
    state.db = environment.authenticatedContext(owner.id, { auth_time: state.authTime }).firestore()
    await joinCounter(owner)
    const quote = await state.stock.postFinanceOperation({ kind: 'cashout-count-start', intent: { operationId: crypto.randomUUID(), date: handoverDate() } })
    localStorage.setItem('alphahub:cashout-count:' + owner.id, JSON.stringify(quote))
    const actions = createFinanceActions({
      getState: () => ({ financeData: { sales: [] }, dailyCashouts: [] }) as never,
      setIsBusy: (() => undefined) as never,
      ensureNameInDirectory: async () => false,
    })
    await actions.saveDailyCashoutEntry({
      financeQuoteId: (quote as { id: string }).id, date: handoverDate(), recordedBy: owner.name, recordedByUserId: owner.id,
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
    state.userId = owner.id
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
    await expect(finalizePosBill({ businessDate: handoverDate(), lines: [line], discount: { mode: 'none', amountPaise: 0 }, payments: [{ method: 'cash', amountPaise: 1999 }] }, billing)).rejects.toThrow(/exactly equal/)
    expect((await getDoc(doc(state.db!, ...productPath))).data()?.currentQuantity).toBe(8)
  })

  it('B3 retires void creation/approval without changing bill, stock or cash', async () => {
    const bill = await finalize()
    await expect(requestBillAction({ type: 'void', billId: bill.id, reason: 'QA void verification' }, billing)).rejects.toThrow(/retired/)
    await expect(approvePosRequest(bill.id, billing)).rejects.toThrow(/retired/)
    state.userId = owner.id
    state.db = environment.authenticatedContext(owner.id, { auth_time: state.authTime }).firestore()
    await expect(approvePosRequest(bill.id, owner)).rejects.toThrow(/retired/)
    expect((await getDoc(doc(state.db, ...productPath))).data()?.currentQuantity).toBe(8)
    expect((await getDoc(doc(state.db, 'posSandboxes', 'test', 'billStates', bill.id))).data()?.state).toBe('active')
    expect((await getDoc(handoverRef())).data()?.cashNetPaise).toBe(1000)
  })

  it.each(['sellable', 'damaged'] as const)('processes a %s return with the correct stock outcome', async (returnCondition) => {
    const bill = await finalize()
    const requestId = await requestBillAction({ type: 'return', billId: bill.id, reason: 'QA return verification', returnCondition, returnLines: [{ lineId: line.id, quantity: 1 }], refundDate: handoverDate(), refundAmountPaise: 1000, refundMethod: 'cash' }, billing)
    expect((await getDoc(doc(state.db!, 'posSandboxes', 'test', 'approvals', requestId))).data()?.status).toBe('posted')
    expect((await getDoc(handoverRef())).data()?.cashNetPaise).toBe(0)
    expect((await getDoc(doc(state.db, ...productPath))).data()?.currentQuantity).toBe(returnCondition === 'sellable' ? 9 : 8)
    expect((await getDoc(doc(state.db, 'posSandboxes', 'test', 'billStates', bill.id))).data()?.returnedQuantities).toEqual({ 'qa-line': 1 })
  })

  it('enforces owner configured billing discount limits', async () => {
    state.userId = owner.id
    state.db = environment.authenticatedContext(owner.id, { auth_time: state.authTime }).firestore()
    await updateDiscountLimit(5, owner)
    state.userId = billing.id
    state.db = environment.authenticatedContext(billing.id, { auth_time: state.authTime }).firestore()
    await expect(finalizePosBill({ businessDate: handoverDate(), lines: [line], discount: { mode: 'percentage', percentage: 10, amountPaise: 200 }, payments: [{ method: 'cash', amountPaise: 1800 }] }, billing)).rejects.toThrow(/exceeds/)
    expect((await getDoc(doc(state.db, ...productPath))).data()?.currentQuantity).toBe(10)
  })

  it('preserves current stock when an already completed CSV is selected again', async () => {
    state.userId = owner.id
    state.db = environment.authenticatedContext(owner.id, { auth_time: state.authTime }).firestore()
    await environment.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'posSandboxes', 'test', 'importRuns', 'qa-checksum'), { status: 'completed', completedRows: 6069 }))
    const parsed = parseApprovedPosCsv(readFileSync('data/pos/omaxe-opening-stock-2026-10-02.approved.csv', 'utf8'))
    await expect(importPosProducts({ rows: parsed.products, validation: parsed.validation, file: new File([''], 'approved.csv'), checksum: 'qa-checksum', sourceHeaders: parsed.sourceHeaders, actor: owner })).rejects.toThrow(/import is retired/)
    expect((await getDoc(doc(state.db, ...productPath))).data()?.currentQuantity).toBe(10)
  })
})
