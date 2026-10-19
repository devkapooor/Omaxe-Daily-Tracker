import { httpsCallable } from 'firebase/functions'
import { auth, functions } from '@/shared/lib/firebase'
import type { WorkspaceMetrics } from '@/domain/workspaceMetrics'

const settingsCall = httpsCallable(functions, 'updateWorkspaceSettings')
const metricsCall = httpsCallable(functions, 'publishWorkspaceMetrics')
const pending = new Map<string, { signature: string; operationId: string; promise?: Promise<void> }>()
export function updateWorkspaceSettings(kind: string, value: unknown): Promise<void> {
  const uid = auth.currentUser?.uid
  if (!uid) return Promise.reject(new Error('Sign in before changing settings.'))
  const signature = JSON.stringify({ kind, value })
  const old = pending.get(uid)
  if (old?.signature === signature && old.promise) return old.promise
  const operation = old?.signature === signature ? old : { signature, operationId: crypto.randomUUID() }
  const promise = settingsCall({ operationId: operation.operationId, kind, value }).then(() => {
    if (pending.get(uid) === operation) pending.delete(uid)
  }).finally(() => { operation.promise = undefined })
  operation.promise = promise
  pending.set(uid, operation)
  return promise
}
export async function publishWorkspaceMetrics(metrics: Omit<WorkspaceMetrics, 'updatedAt'>, expectedUpdatedAt: string | null) {
  await metricsCall({ metrics: { ...metrics, updatedAt: null }, expectedUpdatedAt })
}
