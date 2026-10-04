import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase'

const MAX_SERVER_TIME_AGE_MS = 15 * 60 * 1000
const getServerTime = httpsCallable<void, { serverTimeMs: number }>(functions, 'getServerTime')

let serverTimeAtSyncMs: number | null = null
let monotonicTimeAtSyncMs: number | null = null
let syncAgeBaseMs: number | null = null
let syncInFlight: Promise<number> | null = null

function monotonicNow() {
  return globalThis.performance.now()
}

export function setServerClockSample(serverTimeMs: number, requestStartedAt: number, responseReceivedAt: number) {
  if (!Number.isFinite(serverTimeMs) || responseReceivedAt < requestStartedAt) {
    throw new Error('The server returned an invalid clock sample.')
  }
  const roundTripMs = responseReceivedAt - requestStartedAt
  serverTimeAtSyncMs = serverTimeMs + roundTripMs / 2
  monotonicTimeAtSyncMs = responseReceivedAt
  syncAgeBaseMs = responseReceivedAt
}

export function isServerClockSynchronized() {
  return serverTimeAtSyncMs !== null && monotonicTimeAtSyncMs !== null
}

export function isServerClockFresh() {
  return syncAgeBaseMs !== null && monotonicNow() - syncAgeBaseMs <= MAX_SERVER_TIME_AGE_MS
}

export function serverClockSyncAgeMs() {
  return syncAgeBaseMs === null ? Number.POSITIVE_INFINITY : Math.max(0, monotonicNow() - syncAgeBaseMs)
}

export function serverNowMs() {
  if (!isServerClockSynchronized() || !isServerClockFresh()) {
    throw new Error('Trusted server time is unavailable. Reconnect and synchronize the workspace before continuing.')
  }
  return serverTimeAtSyncMs! + (monotonicNow() - monotonicTimeAtSyncMs!)
}

export function serverNowDate() {
  return new Date(serverNowMs())
}

export function serverNowIso() {
  return serverNowDate().toISOString()
}

/** Fetch a signed-in server timestamp; this makes no Firestore reads or writes. */
export function synchronizeServerClock() {
  if (syncInFlight) return syncInFlight
  const requestStartedAt = monotonicNow()
  syncInFlight = getServerTime().then(({ data }) => {
    const responseReceivedAt = monotonicNow()
    setServerClockSample(data.serverTimeMs, requestStartedAt, responseReceivedAt)
    return serverNowMs()
  }).finally(() => { syncInFlight = null })
  return syncInFlight
}
