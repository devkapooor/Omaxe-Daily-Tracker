import { firebaseConfig } from '@/shared/lib/firebase'
import type { FinalizeInput } from './checkoutRepository'

export type PendingCheckout = { version: 1; actorUid: string; operationId: string; input: FinalizeInput; startedAt: string }
const key = (uid: string) => `alphahub:checkout:v1:${firebaseConfig.projectId}:${uid}`
export function loadPendingCheckout(uid: string): { pending: PendingCheckout | null; error: string } {
  try {
    const raw = window.sessionStorage.getItem(key(uid))
    if (!raw) return { pending: null, error: '' }
    const pending = JSON.parse(raw) as PendingCheckout
    const input = pending.input
    if (pending.version !== 1 || pending.actorUid !== uid || typeof pending.operationId !== 'string' || !/^[0-9a-f-]{36}$/i.test(pending.operationId) || pending.operationId !== input?.operationId ||
      typeof input.businessDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.businessDate) || !Array.isArray(input.lines) || input.lines.length === 0 || input.lines.length > 200 ||
      input.lines.some(line => line.kind !== 'product' || typeof line.productId !== 'string' || typeof line.description !== 'string' || !Number.isSafeInteger(line.quantity) || line.quantity <= 0 || !Number.isSafeInteger(line.unitPricePaise) || line.unitPricePaise < 0) ||
      !input.discount || !['none', 'amount', 'percentage'].includes(input.discount.mode) || !Number.isSafeInteger(input.discount.amountPaise) ||
      !Array.isArray(input.payments) || input.payments.length === 0 || input.payments.some(payment => !['cash', 'upi', 'card'].includes(payment.method) || !Number.isSafeInteger(payment.amountPaise))) throw new Error('Invalid checkout recovery record.')
    return { pending, error: '' }
  } catch {
    return { pending: null, error: 'Checkout recovery storage is unavailable or invalid. Check bill history before starting another checkout.' }
  }
}
export function savePendingCheckout(uid: string, input: FinalizeInput): PendingCheckout {
  const pending: PendingCheckout = { version: 1, actorUid: uid, operationId: input.operationId ?? crypto.randomUUID(), input: structuredClone(input), startedAt: new Date().toISOString() }
  pending.input.operationId = pending.operationId
  // Persist before dispatch. If storage fails, no request is sent.
  const encoded = JSON.stringify(pending)
  window.sessionStorage.setItem(key(uid), encoded)
  if (window.sessionStorage.getItem(key(uid)) !== encoded) throw new Error('Unable to preserve checkout recovery. No checkout was sent.')
  return pending
}
export function clearPendingCheckout(uid: string, operationId: string) {
  const record = loadPendingCheckout(uid)
  if (record.pending?.operationId === operationId) window.sessionStorage.removeItem(key(uid))
}
