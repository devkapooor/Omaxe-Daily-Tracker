import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore'

let environment: RulesTestEnvironment
const path = ['posSandboxes', 'test', 'stockPriceChanges', 'price-change'] as const
beforeAll(async () => {
  environment = await initializeTestEnvironment({ projectId: 'demo-stock-price-rules', firestore: { rules: readFileSync('firestore.rules', 'utf8') } })
  await environment.clearFirestore()
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    for (const role of ['owner', 'manager', 'billing']) await setDoc(doc(db, 'users', role), { role, name: role, disabled: false })
    await setDoc(doc(db, 'users', 'disabled'), { role: 'owner', name: 'Disabled', disabled: true })
    await setDoc(doc(db, ...path), { reviewStatus: 'pending', reason: 'Correct MRP', actorUid: 'billing' })
    await setDoc(doc(db, 'posSandboxes', 'test', 'products', 'product'), { createdAt: '2026-10-01', createdByUid: 'owner', revision: 1, sellingPricePaise: 1000 })
  })
}, 30_000)
afterAll(async () => { await environment?.cleanup() })

describe('server-owned stock price evidence', () => {
  it('lets the owner read the pending feed', async () => {
    const db = environment.authenticatedContext('owner').firestore()
    await assertSucceeds(getDocs(query(collection(db, 'posSandboxes', 'test', 'stockPriceChanges'), where('reviewStatus', '==', 'pending'))))
  })
  it('denies audit access to billing, manager, disabled and unauthenticated sessions', async () => {
    for (const uid of ['billing', 'manager', 'disabled']) await assertFails(getDoc(doc(environment.authenticatedContext(uid).firestore(), ...path)))
    await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), ...path)))
  })
  it('denies all direct evidence writes, including owner review or deletion', async () => {
    for (const uid of ['owner', 'billing', 'manager']) {
      const db = environment.authenticatedContext(uid).firestore()
      await assertFails(setDoc(doc(db, 'posSandboxes', 'test', 'stockPriceChanges', 'forged'), { actorUid: uid, reviewStatus: 'pending' }))
      await assertFails(updateDoc(doc(db, ...path), { reviewStatus: 'reviewed' }))
      await assertFails(deleteDoc(doc(db, ...path)))
    }
  })
  it('denies generic client price edits and forged last-editor attribution', async () => {
    const db = environment.authenticatedContext('billing').firestore()
    const ref = doc(db, 'posSandboxes', 'test', 'products', 'product')
    await assertFails(updateDoc(ref, { sellingPricePaise: 2000, revision: 2, updatedAt: '2026-10-12', updatedByUid: 'billing', updatedByName: 'Billing' }))
    await assertFails(updateDoc(ref, { lastPriceEdit: { byName: 'Forged' }, revision: 2 }))
  })
})
