import { Button } from '@/shared/ui/button'
import { stockDate } from '../domain/currentStock'

export function StockPageControls({ index, hasMore, loading, previous, next, refresh, at }: { index: number; hasMore: boolean; loading: boolean; previous: () => void; next: () => void; refresh: () => void; at: string }) {
  return <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground" aria-label="Record pagination">
    <span>Page {index + 1}{at ? ` · Updated ${stockDate(at)}` : ''}</span>
    <div className="flex gap-2"><Button size="sm" variant="outline" disabled={loading} onClick={refresh}>Refresh</Button><Button size="sm" variant="outline" disabled={loading || index === 0} onClick={previous}>Previous</Button><Button size="sm" variant="outline" disabled={loading || !hasMore} onClick={next}>Next</Button></div>
  </div>
}
