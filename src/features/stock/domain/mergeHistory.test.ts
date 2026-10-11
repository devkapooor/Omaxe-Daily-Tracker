import { describe, expect, it } from 'vitest'
import { mergeHistory, type HistoryStream } from './mergeHistory'
type Row = { id: string; time: number }
const compare = (a: Row, b: Row) => b.time - a.time || b.id.localeCompare(a.id)
function stream(id: string, items: Row[], pageSize: number, calls: string[]): HistoryStream<Row, number> {
  return { id, load: async (cursor) => { calls.push(id); const offset = cursor ?? 0; const page = items.slice(offset, offset + pageSize); return { items: page, cursor: offset + page.length, hasMore: offset + page.length < items.length } } }
}
describe('bounded merged history pagination', () => {
  it('preserves unconsumed rows and deterministic ties across every page', async () => {
    const calls: string[] = []
    const all = Array.from({ length: 80 }, (_, index) => ({ id: String(index).padStart(3, '0'), time: Math.floor(index / 2) })).sort(compare)
    const pager = mergeHistory([stream('a', all.filter((_, index) => index % 2 === 0), 25, calls), stream('b', all.filter((_, index) => index % 2 === 1), 25, calls)], (row) => row.id, compare)
    const result: Row[] = []
    let hasMore = true
    while (hasMore) { const page = await pager.next(); expect(page.items.length).toBeLessThanOrEqual(25); result.push(...page.items); hasMore = page.hasMore }
    expect(result).toEqual(all)
    expect(new Set(result.map((row) => row.id)).size).toBe(80)
    expect(calls).toHaveLength(4)
  })
  it('shares concurrent requests rather than advancing twice', async () => {
    const calls: string[] = []
    const pager = mergeHistory([stream('a', [{ id: 'one', time: 1 }], 25, calls)], (row) => row.id, compare)
    const [first, second] = await Promise.all([pager.next(), pager.next()])
    expect(first).toEqual(second); expect(calls).toHaveLength(1)
  })
  it('retries a failed stream without losing or rereading the successful stream', async () => {
    const calls: string[] = []; let fail = true
    const broken: HistoryStream<Row, number> = { id: 'b', load: async () => { if (fail) { fail = false; throw new Error('Temporary failure') } return { items: [{ id: 'b', time: 2 }], cursor: 1, hasMore: false } } }
    const pager = mergeHistory([stream('a', [{ id: 'a', time: 3 }], 25, calls), broken], (row) => row.id, compare)
    await expect(pager.next()).rejects.toThrow('Temporary failure')
    expect((await pager.next()).items.map((row) => row.id)).toEqual(['a', 'b'])
    expect(calls).toHaveLength(1)
  })
  it('bounds sparse legacy scans without falsely claiming exhaustion', async () => {
    let reads = 0
    const pager = mergeHistory<Row, number>([{ id: 'legacy', load: async (cursor) => { reads++; return { items: [], cursor: (cursor ?? 0) + 1, hasMore: true } } }], (row) => row.id, compare)
    expect(await pager.next()).toEqual({ items: [], hasMore: true }); expect(reads).toBe(4)
  })
})
