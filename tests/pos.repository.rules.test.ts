import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore'
import type { AppUser } from '../src/domain/financeTypes'

const state = vi.hoisted(() => ({ db: undefined as Firestore | undefined }))
vi.mock('@/shared/lib/firebase', () => ({ get db() { return state.db } }))

import {
  approvePosRequest, deleteHeldCart, finalizePosBill, importPosProducts,
  requestBillAction, saveHeldCart, updateDiscountLimit,
} from '../src/features/pos/data/posRepository'
import { parseApprovedPosCsv } from '../src/features/pos/domain/csvImport'

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
  await environment.clearFirestore()
  await environment.withSecurityRulesDisabled(async (context) => {
    for (const actor of [owner, billing]) await setDoc(doc(context.firestore(), 'users', actor.id), { name: actor.name, role: actor.role, disabled: false, createdAt: timestamp })
  })
  state.db = environment.authenticatedContext(owner.id).firestore()
  await setDoc(doc(state.db, ...productPath), {
    barcode: '001', name: 'QA Product', searchName: 'qa product', category: 'QA', brand: 'QA', vendor: 'QA', sellingPricePaise: 1000,
    currentQuantity: 10, revision: 1, active: true, createdAt: timestamp, createdByUid: owner.id, createdByName: owner.name,
    updatedAt: timestamp, updatedByUid: owner.id, updatedByName: owner.name,
  })
  state.db = environment.authenticatedContext(billing.id).firestore()
})

afterAll(async () => { vi.unstubAllGlobals(); await environment.cleanup() })

async function finalize() {
  return finalizePosBill({ businessDate: '2026-10-03', lines: [line], discount: { mode: 'none', amountPaise: 0 }, payments: [{ method: 'cash', amountPaise: 1000 }, { method: 'upi', amountPaise: 1000 }], cashTenderedPaise: 1500 }, billing)
}

describe('POS repository workflows against deployed rules', () => {
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
    state.db = environment.authenticatedContext(owner.id).firestore()
    expect(await approvePosRequest(requestId, owner)).toBe('approved')
    expect((await getDoc(doc(state.db, ...productPath))).data()?.currentQuantity).toBe(10)
    expect((await getDoc(doc(state.db, 'posSandboxes', 'test', 'billStates', bill.id))).data()?.state).toBe('voided')
    await expect(approvePosRequest(requestId, owner)).rejects.toThrow(/no longer pending/)
  })

  it.each(['sellable', 'damaged'] as const)('processes a %s return with the correct stock outcome', async (returnCondition) => {
    const bill = await finalize()
    const requestId = await requestBillAction({ type: 'return', billId: bill.id, reason: 'QA return verification', returnCondition, returnLines: [{ lineId: line.id, quantity: 1 }], refundDate: '2026-10-03', refundAmountPaise: 1000, refundMethod: 'cash' }, billing)
    state.db = environment.authenticatedContext(owner.id).firestore()
    await approvePosRequest(requestId, owner)
    expect((await getDoc(doc(state.db, ...productPath))).data()?.currentQuantity).toBe(returnCondition === 'sellable' ? 9 : 8)
    expect((await getDoc(doc(state.db, 'posSandboxes', 'test', 'billStates', bill.id))).data()?.returnedQuantities).toEqual({ 'qa-line': 1 })
  })

  it('enforces owner configured billing discount limits', async () => {
    state.db = environment.authenticatedContext(owner.id).firestore()
    await updateDiscountLimit(5, owner)
    state.db = environment.authenticatedContext(billing.id).firestore()
    await expect(finalizePosBill({ businessDate: '2026-10-03', lines: [line], discount: { mode: 'percentage', percentage: 10, amountPaise: 200 }, payments: [{ method: 'cash', amountPaise: 1800 }] }, billing)).rejects.toThrow(/exceeds/)
    expect((await getDoc(doc(state.db, ...productPath))).data()?.currentQuantity).toBe(10)
  })

  it('preserves current stock when an already completed CSV is selected again', async () => {
    state.db = environment.authenticatedContext(owner.id).firestore()
    await setDoc(doc(state.db, 'posSandboxes', 'test', 'importRuns', 'qa-checksum'), { status: 'completed', completedRows: 6069 })
    const parsed = parseApprovedPosCsv(readFileSync('data/pos/omaxe-opening-stock-2026-10-02.approved.csv', 'utf8'))
    await expect(importPosProducts({ rows: parsed.products, validation: parsed.validation, file: new File([''], 'approved.csv'), checksum: 'qa-checksum', sourceHeaders: parsed.sourceHeaders, actor: owner })).rejects.toThrow(/already been imported/)
    expect((await getDoc(doc(state.db, ...productPath))).data()?.currentQuantity).toBe(10)
  })
})
