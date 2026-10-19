import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, getDocs, collection, query, where, documentId, setDoc, updateDoc } from 'firebase/firestore'
import { readFileSync } from 'node:fs'
let env: RulesTestEnvironment
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-shared-view-rules', firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync('firestore.rules', 'utf8') } })
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore()
    for (const role of ['owner', 'manager', 'billing', 'disabled']) await setDoc(doc(db, 'users', role), { name: role, role: role === 'disabled' ? 'owner' : role, disabled: role === 'disabled', approvalStatus: 'approved' })
    await setDoc(doc(db, 'appMetadata', 'appSettings'), { currentBankBalance: 12345.67 })
    await setDoc(doc(db, 'appMetadata', 'workspaceMetrics'), { planner: { groupedSchedule: [{ items: [{ amount: 300, runningBalanceAfter: 12045.67, status: 'available' }] }] } })
    await setDoc(doc(db, 'appMetadata', 'staffSettings'), { schemaVersion: 1, marginPercentage: 25 })
    await setDoc(doc(db, 'appMetadata', 'staffWorkspaceMetrics'), { schemaVersion: 1, planner: { groupedSchedule: [{ items: [{ amount: 300 }] }] } })
    await setDoc(doc(db, 'settingsAudit', 'bank'), { beforeBalancePaise: 1234567 })
    await setDoc(doc(db, 'sharedViewOperations', 'private'), { actorUid: 'owner' })
  })
}, 60000)
afterAll(async () => env.cleanup())
describe('owner-only bank confidentiality across overlapping Rules', () => {
  for (const role of ['owner', 'manager', 'billing', 'disabled', 'missing', 'unauthenticated']) it(role + ' has the correct read/write boundary', async () => {
    const db = role === 'unauthenticated' ? env.unauthenticatedContext().firestore() : env.authenticatedContext(role).firestore()
    for (const path of ['appMetadata/appSettings', 'appMetadata/workspaceMetrics', 'settingsAudit/bank']) {
      if (role === 'owner') await assertSucceeds(getDoc(doc(db, path)))
      else await assertFails(getDoc(doc(db, path)))
    }
    for (const path of ['appMetadata/staffSettings', 'appMetadata/staffWorkspaceMetrics']) {
      if (['owner', 'manager', 'billing'].includes(role)) { const s = await assertSucceeds(getDoc(doc(db, path))); expect(JSON.stringify(s.data())).not.toContain('12345') }
      else await assertFails(getDoc(doc(db, path)))
      await assertFails(setDoc(doc(db, path), { currentBankBalance: 1 }))
    }
    await assertFails(getDoc(doc(db, 'sharedViewOperations/private')))
    for (const path of ['appMetadata/appSettings', 'appMetadata/workspaceMetrics', 'sharedViewOperations/forged']) await assertFails(setDoc(doc(db, path), { currentBankBalance: 1 }))
    if (role !== 'owner') {
      await assertFails(getDocs(collection(db, 'appMetadata')))
      await assertFails(getDocs(query(collection(db, 'appMetadata'), where(documentId(), '==', 'appSettings'))))
      await assertFails(getDocs(query(collection(db, 'appMetadata'), where(documentId(), '==', 'workspaceMetrics'))))
    }
  })
  it('old owner settings writers fail closed while unrelated owner configuration stays available', async () => {
    const db = env.authenticatedContext('owner').firestore()
    await assertFails(updateDoc(doc(db, 'appMetadata', 'appSettings'), { marginPercentage: 50 }))
    await assertFails(setDoc(doc(db, 'appMetadata', 'workspaceMetrics'), { planner: {} }))
    await assertSucceeds(setDoc(doc(db, 'appMetadata', 'unrelated-owner-setting'), { enabled: true }))
  })
})
