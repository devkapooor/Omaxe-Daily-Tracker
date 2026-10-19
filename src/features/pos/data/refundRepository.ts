import { httpsCallable } from 'firebase/functions'
import { auth, firebaseConfig, functions } from '@/shared/lib/firebase'
import type { AppUser } from '@/domain/financeTypes'
import type { PosApprovalRequest } from '../domain/types'

export type ReturnSelection = { billId: string; returnCondition: 'sellable' | 'damaged'; returnLines: Array<{ lineId: string; quantity: number }> }
export type ReturnQuote = {
  billId: string; receiptNumber: string; sourceBillCreatedAt: string; sourceBillRevision: number
  businessDate: string; refundMethod: 'cash'; refundPaise: number; confirmationHash: string; availableCashPaise: number | null
  selected: Array<{ lineId: string; quantity: number; refundPaise: number }>
  lines: Array<{ lineId: string; description: string; barcode: string; billedQuantity: number; returnedQuantity: number; remainingQuantity: number; unitPricePaise: number; lineNetPaise: number }>
}
export type ReturnPostInput = ReturnSelection & { operationId: string; reason: string; refundMethod: 'cash'; refundAmountPaise: number; sourceBillRevision: number; businessDate: string; confirmationHash: string; legacyRequestId?: string }
type PendingReturn = { version: 1; actorUid: string; method: string; input: Record<string, unknown> }
const methods = new Set(['postPosReturn', 'reviewPosReturn', 'closeLegacyPosRequest'])
const key = (uid: string) => `alphahub:refund:v1:${firebaseConfig.projectId}:${uid}`
const active = new Set<string>()
const changed = () => window.dispatchEvent(new Event('refund-operation-change'))
export const refundInFlight = (uid: string) => active.has(uid)
export function pendingRefund(uid: string): PendingReturn | null {
  const raw = sessionStorage.getItem(key(uid))
  if (!raw) return null
  const value = JSON.parse(raw) as PendingReturn
  if (value.version !== 1 || value.actorUid !== uid || !methods.has(value.method) || !value.input || typeof value.input !== 'object' || typeof value.input.operationId !== 'string') throw new Error('Refund recovery storage is unreadable. Preserve this tab and check the original return history before continuing.')
  return value
}
export async function quotePosReturn(input: ReturnSelection, actor: Pick<AppUser, 'id'>): Promise<ReturnQuote> {
  if (auth.currentUser?.uid !== actor.id) throw new Error('Sign in to view the original return allowance.')
  const result = (await httpsCallable<ReturnSelection, ReturnQuote>(functions, 'quotePosReturn')(input)).data
  if (auth.currentUser?.uid !== actor.id) throw new Error('This quote belongs to the previous account. Reopen the bill in your current account.')
  return result
}
async function refundCall<T>(method: string, input: Record<string, unknown>, actor: AppUser, recovering = false): Promise<T> {
  if (auth.currentUser?.uid !== actor.id) throw new Error('Sign in to the original account before posting or recovering a return.')
  if (!methods.has(method)) throw new Error('Unknown return operation. Reload the application.')
  if (pendingRefund(actor.id) && !recovering) throw new Error('Recover the pending refund operation before making another change.')
  if (!recovering) {
    const encoded = JSON.stringify({ version: 1, actorUid: actor.id, method, input })
    sessionStorage.setItem(key(actor.id), encoded)
    if (sessionStorage.getItem(key(actor.id)) !== encoded) throw new Error('Refund recovery storage could not be saved. No request was sent.')
  }
  active.add(actor.id); changed()
  try {
    const result = (await httpsCallable<Record<string, unknown>, T>(functions, method)(input)).data
    if (auth.currentUser?.uid !== actor.id) throw new Error('Return to the original account to recover its refund result.')
    sessionStorage.removeItem(key(actor.id)); changed()
    if (method === 'postPosReturn') window.dispatchEvent(new Event('pos-return-posted'))
    return result
  } catch (error) {
    const e = error as { code?: string; details?: { refundRejected?: boolean; refundUnposted?: boolean } }
    if (e.details?.refundUnposted || (!recovering && !['functions/already-exists', 'functions/permission-denied', 'functions/unauthenticated'].includes(e.code ?? '') && e.details?.refundRejected)) { sessionStorage.removeItem(key(actor.id)); changed() }
    throw error
  } finally { active.delete(actor.id); changed() }
}
export const postPosReturn = (input: ReturnPostInput, actor: AppUser) => refundCall<PosApprovalRequest>('postPosReturn', input, actor)
export const reviewPosReturn = (returnId: string, actor: AppUser) => refundCall<{ id: string }>('reviewPosReturn', { operationId: crypto.randomUUID(), returnId }, actor)
export const closeLegacyPosRequest = (requestId: string, reason: string, actor: AppUser) => refundCall('closeLegacyPosRequest', { operationId: crypto.randomUUID(), requestId, reason }, actor)
export async function prepareRefundCashout(date: string) {
  if (!auth.currentUser) throw new Error('Sign in before preparing Cashout.')
  const actorUid = auth.currentUser.uid
  const result = (await httpsCallable<{ operationId: string; date: string }, { id: string; actorUid: string; date: string; posCashRefundPaise: number; windowRefundPaise: number; posRefundDayRevision: number; posRefundDayTotalPaise: number; posSourceHandoverRevision: number }>(functions, 'prepareRefundCashout')({ operationId: crypto.randomUUID(), date })).data
  if (auth.currentUser?.uid !== actorUid || result.actorUid !== actorUid) throw new Error('Cashout quote belongs to the previous account.')
  return result
}
export async function recoverRefund(actor: AppUser) {
  const pending = pendingRefund(actor.id)
  if (!pending) throw new Error('No pending refund operation exists in this tab.')
  const result = await refundCall<PosApprovalRequest | { id: string }>(pending.method, pending.input, actor, true)
  window.dispatchEvent(new CustomEvent('refund-operation-recovered', { detail: { actorUid: actor.id, method: pending.method, result } }))
  return result
}
