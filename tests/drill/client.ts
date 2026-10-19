import { auth, db, firebaseConfig, functions } from '@/shared/lib/firebase'
import { collection, doc, getDoc, getDocFromServer, getDocs, setDoc, updateDoc, deleteDoc, writeBatch, Timestamp, serverTimestamp } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { signInWithEmailAndPassword } from 'firebase/auth'
function safe(path = '') {
  if (firebaseConfig.projectId !== 'demo-alphahub-drill' || auth.emulatorConfig?.host !== '127.0.0.1' || auth.emulatorConfig.port !== 9099) throw Error('DRILL_ISOLATION: client target mismatch')
  if (path === 'loans' || path.startsWith('loans/')) throw Error('Loan mutation prohibited')
}
export async function who() {
  safe()
  const uid = auth.currentUser!.uid
  const profile = (await getDoc(doc(db, 'users', uid))).data()!
  return { id: uid, name: profile.name, role: profile.role }
}
export async function authIdentity() { safe(); return { uid: auth.currentUser?.uid ?? null } }
export async function restoreAccount(email: string, password: string) { safe(); await signInWithEmailAndPassword(auth, email, password); return { uid: auth.currentUser?.uid ?? null } }
function firebaseFailure(cause: unknown): never { const error = cause as { code?: string; message?: string }; throw new Error((error.code ?? 'unknown') + ': ' + (error.message ?? String(cause))) }
export async function read(path: string) { try { const value = await getDoc(doc(db, path)); return value.exists() ? { id: value.id, ...value.data() } : null } catch (cause) { return firebaseFailure(cause) } }
export async function list(path: string) { try { return (await getDocs(collection(db, path))).docs.map(value => ({ id: value.id, ...value.data() })) } catch (cause) { return firebaseFailure(cause) } }
export async function write(path: string, value: Record<string, unknown>, mode = 'set') {
  safe(path)
  if (value.entryType === 'loan-payment') throw Error('Loan payments prohibited')
  if (mode === 'update') return updateDoc(doc(db, path), decode(value) as Record<string, unknown>)
  if (mode === 'delete') return deleteDoc(doc(db, path))
  return setDoc(doc(db, path), decode(value) as Record<string, unknown>)
}
function decode(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value
  if ('__serverTimestamp' in value) return serverTimestamp()
  if ('_seconds' in value && '_nanoseconds' in value) return new Timestamp(Number(value._seconds), Number(value._nanoseconds))
  if ('seconds' in value && 'nanoseconds' in value) return new Timestamp(Number(value.seconds), Number(value.nanoseconds))
  if (Array.isArray(value)) return value.map(decode)
  return Object.fromEntries(Object.entries(value).map(([key, next]) => [key, decode(next)]))
}
export async function batch(records: Array<{ path: string; value: Record<string, unknown> }>) {
  const batch = writeBatch(db)
  for (const record of records) { safe(record.path); if (record.value.entryType === 'loan-payment') throw Error('Loan payments prohibited'); batch.set(doc(db, record.path), decode(record.value) as Record<string, unknown>) }
  return batch.commit()
}
export async function call(name: string, data: unknown) { safe(); return (await httpsCallable(functions, name)(data)).data }
/** Direct Rules probe: clone valid source shapes with native SDK timestamps, omit stock posting. */
export async function directBillWithoutStock(sourceId: string, copyId: string) {
  safe()
  const base = 'posSandboxes/test', uid = auth.currentUser!.uid
  const source = (await getDocFromServer(doc(db, base, 'bills', sourceId))).data()!
  const ledger = (await getDocFromServer(doc(db, base, 'handover', 'main'))).data()!
  const cashier = (await getDocFromServer(doc(db, base, 'cashierStates', uid))).data()!
  const sequence = (await getDocFromServer(doc(db, base, 'sequences', source.financialYear))).data()!
  const stamp = new Date().toISOString(), count = sequence.lastNumber + 1
  const batch = writeBatch(db)
  batch.set(doc(db, base, 'bills', copyId), { ...source, id: copyId, sequenceNumber: count, receiptNumber: 'DRILL-DIRECT-' + count, createdAt: stamp })
  batch.set(doc(db, base, 'billStates', copyId), { billId: copyId, state: 'active', revision: 1, returnedQuantities: {}, updatedAt: stamp, updatedByUid: uid })
  batch.set(doc(db, base, 'sequences', source.financialYear), { ...sequence, lastNumber: count, updatedAt: stamp, updatedByUid: uid })
  batch.set(doc(db, base, 'handover', 'main'), { ...ledger, revision: ledger.revision + 1, cashNetPaise: ledger.cashNetPaise + 18000, lastOperation: 'bill', lastOperationId: copyId, updatedByUid: uid })
  batch.set(doc(db, base, 'cashierStates', uid), { ...cashier, needsLogoutCheck: true, lastBillId: copyId, updatedAt: stamp })
  await batch.commit()
  return { copyId, stockPostingOmitted: true }
}

/** Controlled readiness probe only; not used as real-time financial boundary evidence. */
export async function expireTrustedClockForReadiness() {
  safe()
  const { setServerClockSample } = await import('../../src/shared/lib/serverClock')
  const old = performance.now() - 16 * 60 * 1000
  setServerClockSample(Date.now(), old, old)
}
