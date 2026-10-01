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
    <GlowCard className="p-2.5">
      <span className="block text-[10px] font-extrabold uppercase tracking-[0.16em] text-cyan-300 sm:text-[11px]">{label}</span>
      <strong className="mt-1 block text-[1.3rem] font-black tracking-[-0.03em] text-foreground sm:text-[1.55rem]">{value}</strong>
      {updated ? <p className="mt-0.75 text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/90">{updated}</p> : null}
      {comparison ? (
        <p
          className={
            comparison.tone === 'positive'
              ? 'mt-1.5 text-[10px] font-bold text-emerald-300'
              : comparison.tone === 'negative'
                ? 'mt-1.5 text-[10px] font-bold text-rose-300'
                : 'mt-1.5 text-[10px] font-bold text-muted-foreground'
          }
        >
          {comparison.label}
        </p>
      ) : null}
    </GlowCard>
  )
}

