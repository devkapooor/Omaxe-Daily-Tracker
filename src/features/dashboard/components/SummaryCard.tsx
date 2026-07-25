import { GlowCard } from '@/shared/ui/spotlight-card'

export function SummaryCard({
  label,
  value,
  updated,
}: {
  label: string
  value: string | number
  updated?: string
}) {
  return (
    <GlowCard className="p-2.5">
      <span className="block text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#c5a56a] sm:text-[11px]">{label}</span>
      <strong className="mt-1 block text-[1.3rem] font-black tracking-[-0.03em] text-foreground sm:text-[1.55rem]">{value}</strong>
      {updated ? <p className="mt-0.75 text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/90">{updated}</p> : null}
    </GlowCard>
  )
}

