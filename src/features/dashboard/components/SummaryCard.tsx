import { GlowCard } from '@/shared/ui/spotlight-card'

export function SummaryCard({
  label,
  value,
  updated,
  comparison,
}: {
  label: string
  value: string | number
  updated?: string
  comparison?: {
    label: string
    tone: 'positive' | 'negative' | 'neutral'
  }
}) {
  return (
    <GlowCard className="min-h-32 p-4">
      <span className="block text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{label}</span>
      <strong className="mt-2 block break-words font-mono text-2xl font-semibold tracking-tight tabular-nums text-foreground">{value}</strong>
      {updated ? <p className="mt-1 text-[11px] font-medium text-muted-foreground">{updated}</p> : null}
      {comparison ? (
        <p
          className={
            comparison.tone === 'positive'
            ? 'mt-2 text-[11px] font-medium text-emerald-700'
              : comparison.tone === 'negative'
                ? 'mt-2 text-[11px] font-medium text-rose-700'
                : 'mt-2 text-[11px] font-medium text-muted-foreground'
          }
        >
          {comparison.label}
        </p>
      ) : null}
    </GlowCard>
  )
}

