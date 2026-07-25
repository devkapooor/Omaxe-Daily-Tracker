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
    <GlowCard className="p-3.5">
      <span className="block text-xs font-extrabold uppercase tracking-[0.2em] text-[#c5a56a] sm:text-[13px]">{label}</span>
      <strong className="mt-2 block text-lg font-black tracking-[-0.02em] text-foreground sm:text-xl">{value}</strong>
      {updated ? <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/90">{updated}</p> : null}
    </GlowCard>
  )
}

