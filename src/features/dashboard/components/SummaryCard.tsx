import { GlowCard } from '@/shared/ui/spotlight-card'

export function SummaryCard({
  label,
  value,
  meta,
  updated,
}: {
  label: string
  value: string | number
  meta?: string
  updated?: string
}) {
  return (
    <GlowCard className="p-3.5 shadow-[0_10px_22px_rgba(24,32,27,0.06)]">
      <span className="block text-[11px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
      <strong className="mt-2 block text-xl font-black tracking-tight text-foreground">{value}</strong>
      {meta ? <p className="mt-1 text-[11px] font-semibold text-muted-foreground">{meta}</p> : null}
      {updated ? <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">Updated: {updated}</p> : null}
    </GlowCard>
  )
}

