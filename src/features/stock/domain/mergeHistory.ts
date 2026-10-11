export type HistoryStream<T, C> = { id: string; load: (cursor: C | null) => Promise<{ items: T[]; cursor: C | null; hasMore: boolean }> }
/** A cursor belongs to its stream; unconsumed records must survive every page and retry. */
export function mergeHistory<T, C>(sources: HistoryStream<T, C>[], key: (item: T) => string, compare: (a: T, b: T) => number, size = 25, maxReads = 4) {
  const streams = sources.map((source) => ({ source, cursor: null as C | null, buffer: [] as T[], done: false }))
  const seen = new Set<string>()
  let pending: Promise<{ items: T[]; hasMore: boolean }> | null = null
  async function next() {
    const emitted: Array<{ stream: typeof streams[number]; item: T }> = []
    let reads = 0
    try {
      while (emitted.length < size) {
        const empty = streams.filter((stream) => !stream.done && stream.buffer.length === 0)
        if (empty.length) {
          if (reads + empty.length > maxReads) break
          reads += empty.length
          const results = await Promise.allSettled(empty.map(async (stream) => {
            const page = await stream.source.load(stream.cursor)
            stream.cursor = page.cursor; stream.done = !page.hasMore; stream.buffer.push(...page.items)
          }))
          const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
          if (failures.length) throw failures[0].reason
          continue
        }
        const candidates = streams.filter((stream) => stream.buffer.length).sort((a, b) => compare(a.buffer[0], b.buffer[0]))
        const stream = candidates[0]
        if (!stream) break
        const item = stream.buffer.shift()!
        if (!seen.has(key(item))) { seen.add(key(item)); emitted.push({ stream, item }) }
      }
      return { items: emitted.map(({ item }) => item), hasMore: streams.some((stream) => !stream.done || stream.buffer.length > 0) }
    } catch (cause) {
      // Successful reads remain buffered. Put emitted rows back without repeating those reads.
      for (const { stream, item } of emitted.reverse()) { seen.delete(key(item)); stream.buffer.unshift(item) }
      throw cause
    }
  }
  return { next: () => { if (!pending) pending = next().finally(() => { pending = null }); return pending } }
}
