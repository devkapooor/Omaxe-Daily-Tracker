import { doc, getDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { auth, db, functions } from '@/shared/lib/firebase'
import type { WorkspaceMetrics } from '@/domain/workspaceMetrics'

const settingsCall = httpsCallable(functions, 'updateWorkspaceSettings')
const metricsCall = httpsCallable(functions, 'publishWorkspaceMetrics')
const staffViewsCall = httpsCallable<
  { dryRun: boolean; expectedSettingsRevision?: number; expectedMetricsUpdatedAt?: string | null },
  { dryRun: boolean; schemaVersion: number; settingsRevision: number; metricsUpdatedAt: string | null }
>(functions, 'publishStaffViews')
const pending = new Map<string, { signature: string; operationId: string; promise?: Promise<void> }>()
const staffViewRepairs = new Map<string, Promise<void>>()

export function staffViewsAreCurrent(
  settings: Record<string, unknown>,
  metrics: Record<string, unknown>,
  staffSettings: Record<string, unknown> | undefined,
  staffMetrics: Record<string, unknown> | undefined,
) {
  const settingsRevision = typeof settings.sharedSettingsRevision === 'number' ? settings.sharedSettingsRevision : 0
  return staffSettings?.schemaVersion === 1 &&
    staffSettings.sourceRevision === settingsRevision &&
    staffMetrics?.schemaVersion === 1 &&
    staffMetrics.updatedAt === (metrics.updatedAt ?? null)
}

/** Owner-only self-healing for the release-time staff projections. The callable
 * verifies the owner profile and builds both views from canonical server data. */
export function ensureStaffViewsPublished(): Promise<void> {
  const uid = auth.currentUser?.uid
  if (!uid) return Promise.reject(new Error('Sign in as the owner to refresh staff workspace views.'))
  const existing = staffViewRepairs.get(uid)
  if (existing) return existing

  const operation = (async () => {
    const [settingsSnapshot, metricsSnapshot, staffSettingsSnapshot, staffMetricsSnapshot] = await Promise.all([
      getDoc(doc(db, 'appMetadata', 'appSettings')),
      getDoc(doc(db, 'appMetadata', 'workspaceMetrics')),
      getDoc(doc(db, 'appMetadata', 'staffSettings')),
      getDoc(doc(db, 'appMetadata', 'staffWorkspaceMetrics')),
    ])
    if (!settingsSnapshot.exists() || !metricsSnapshot.exists()) {
      throw new Error('Canonical workspace settings or reports are unavailable; staff views were not changed.')
    }
    const settings = settingsSnapshot.data()
    const metrics = metricsSnapshot.data()
    if (staffViewsAreCurrent(
      settings,
      metrics,
      staffSettingsSnapshot.exists() ? staffSettingsSnapshot.data() : undefined,
      staffMetricsSnapshot.exists() ? staffMetricsSnapshot.data() : undefined,
    )) return

    const preview = (await staffViewsCall({ dryRun: true })).data
    if (!preview.dryRun || preview.schemaVersion !== 1) {
      throw new Error('The staff-view publication preview was invalid; no staff views were changed.')
    }
    await staffViewsCall({
      dryRun: false,
      expectedSettingsRevision: preview.settingsRevision,
      expectedMetricsUpdatedAt: preview.metricsUpdatedAt,
    })
  })()

  staffViewRepairs.set(uid, operation)
  void operation.then(
    () => { if (staffViewRepairs.get(uid) === operation) staffViewRepairs.delete(uid) },
    () => { if (staffViewRepairs.get(uid) === operation) staffViewRepairs.delete(uid) },
  )
  return operation
}

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
