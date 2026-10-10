import { collection, getDocsFromServer, limit, orderBy, query, startAfter, type DocumentData, type QueryDocumentSnapshot } from 'firebase/firestore'
import type { CashoutCorrectionRequest } from '@/domain/appTypes'
import type { VendorLedgerCorrectionRequestV2, VendorReturnV2 } from '@/domain/vendorLedgerV2'
import type { CashierReconciliation } from '@/features/pos/domain/cashierHandover'
import type { PosApprovalRequest } from '@/features/pos/domain/types'
import { db } from '@/shared/lib/firebase'
import { vendorLedgerV2Collections } from '@/store/vendorLedgerV2Repository'

export type HistoryRecord =
  | { kind: 'cashout'; value: CashoutCorrectionRequest }
  | { kind: 'vendor-correction'; value: VendorLedgerCorrectionRequestV2 }
  | { kind: 'vendor-return'; value: VendorReturnV2 }
  | { kind: 'pos'; value: PosApprovalRequest }
  | { kind: 'handover'; value: CashierReconciliation }

type Source = { id: string; name: string; path: string[]; field: 'reviewedAt' | 'createdAt'; kind: HistoryRecord['kind']; matchedOnly?: boolean }
type Cursor = QueryDocumentSnapshot<DocumentData> | null
type Stream = { source: Source; cursor: Cursor; done: boolean; buffer: HistoryRecord[] }
const batchSize = 10
const pageSize = 25
// A sparse matched-handover stream must not scan an entire collection in one click.
const maxBatchesPerPage = 10

function sources(vendorEnabled: boolean): Source[] {
  return [
    { id: 'cashout', name: 'Cashout Corrections', path: ['cashoutCorrectionRequests'], field: 'reviewedAt', kind: 'cashout' },
    ...(vendorEnabled ? [
      { id: 'vendor-correction', name: 'Vendor Payment Corrections', path: [vendorLedgerV2Collections.correctionRequests], field: 'reviewedAt', kind: 'vendor-correction' } as Source,
      { id: 'vendor-return', name: 'Vendor Returns', path: [vendorLedgerV2Collections.returns], field: 'reviewedAt', kind: 'vendor-return' } as Source,
    ] : []),
    { id: 'pos', name: 'POS Requests', path: ['posSandboxes', 'test', 'approvals'], field: 'reviewedAt', kind: 'pos' },
    { id: 'handover-reviewed', name: 'Reviewed Handovers', path: ['posSandboxes', 'test', 'reconciliations'], field: 'reviewedAt', kind: 'handover' },
    { id: 'handover-matched', name: 'Matched Handovers', path: ['posSandboxes', 'test', 'reconciliations'], field: 'createdAt', kind: 'handover', matchedOnly: true },
  ]
}

export function historyRecordTime(record: HistoryRecord) {
  if (record.kind === 'handover' && record.value.reviewStatus === 'matched') return record.value.createdAt
  return record.value.reviewedAt ?? (record.kind === 'pos' ? record.value.requestedAt : record.value.createdAt)
}
function recordKey(record: HistoryRecord) { return `${record.kind}:${record.value.id}` }

async function fill(stream: Stream) {
  const { source } = stream
  const ref = collection(db, source.path[0], ...source.path.slice(1))
  const snapshot = await getDocsFromServer(query(ref, orderBy(source.field, 'desc'), ...(stream.cursor ? [startAfter(stream.cursor)] : []), limit(batchSize)))
  const records = snapshot.docs.flatMap((item): HistoryRecord[] => {
    const value: DocumentData = { ...item.data(), id: item.id }
    if (source.matchedOnly ? value.reviewStatus !== 'matched' : source.kind === 'handover' ? value.reviewStatus !== 'reviewed' : source.kind === 'vendor-return' ? value.outcome === 'pending' : value.status === 'pending') return []
    return [{ kind: source.kind, value } as HistoryRecord]
  })
  // Update only after a successful read; failed streams keep their cursor for Retry.
  stream.cursor = snapshot.docs.at(-1) ?? stream.cursor
  stream.done = snapshot.docs.length < batchSize
  stream.buffer.push(...records)
}

/** Merge chronologically ordered streams without fetching their full collections. */
export function createActionHistoryPager(vendorEnabled: boolean) {
  const streams: Stream[] = sources(vendorEnabled).map((source) => ({ source, cursor: null, done: false, buffer: [] }))
  const seen = new Set<string>()
  let inFlight: Promise<{ records: HistoryRecord[]; hasMore: boolean }> | null = null
  const hasMore = () => streams.some((stream) => !stream.done || stream.buffer.length > 0)

  async function nextPage() {
    const records: HistoryRecord[] = []
    let remainingBatches = maxBatchesPerPage
    while (records.length < pageSize) {
      const candidates = streams.filter((stream) => stream.buffer.length > 0)
      candidates.sort((left, right) => historyRecordTime(right.buffer[0]).localeCompare(historyRecordTime(left.buffer[0])) || recordKey(left.buffer[0]).localeCompare(recordKey(right.buffer[0])))
      const headTime = candidates[0] ? historyRecordTime(candidates[0].buffer[0]) : null
      const empty = streams.filter((stream) => !stream.done && stream.buffer.length === 0)
      // Unread timestamps cannot be newer than the last raw cursor timestamp.
      // Render known newer heads even when the matched-handover stream is sparse.
      const blocking = empty.filter((stream) => !headTime || !stream.cursor || headTime < String(stream.cursor.data()[stream.source.field]))
      if (blocking.length) {
        if (remainingBatches < blocking.length) break
        remainingBatches -= blocking.length
        const results = await Promise.allSettled(blocking.map(async (stream) => {
          try { await fill(stream) } catch (cause) { throw new Error(`${stream.source.name}: ${cause instanceof Error ? cause.message : 'Unable to load history.'}`) }
        }))
        const errors = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        if (errors.length) {
          // Preserve already merged entries too: a retry must not drop them or reread them.
          records.forEach((record) => seen.delete(recordKey(record)))
          records.forEach((record) => { const target = streams.find((stream) => stream.source.kind === record.kind && (record.kind !== 'handover' || Boolean(stream.source.matchedOnly) === (record.value.reviewStatus === 'matched'))); target?.buffer.push(record) })
          streams.forEach((stream) => stream.buffer.sort((left, right) => historyRecordTime(right).localeCompare(historyRecordTime(left))))
          throw new Error(errors.map((result) => result.reason instanceof Error ? result.reason.message : String(result.reason)).join('\n'))
        }
        continue
      }
      const next = candidates[0]?.buffer.shift()
      if (!next) break
      const key = recordKey(next)
      if (!seen.has(key)) { records.push(next); seen.add(key) }
    }
    return { records, hasMore: hasMore() }
  }

  return {
    next: () => {
      if (!inFlight) { inFlight = nextPage().finally(() => { inFlight = null }) }
      return inFlight
    },
  }
}
