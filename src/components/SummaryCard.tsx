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
    <div className="rounded-[22px] border border-border/80 bg-white/85 p-4 shadow-[0_14px_30px_rgba(24,32,27,0.07)] backdrop-blur-xl">
      <span className="block text-[11px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
      <strong className="mt-2.5 block text-2xl font-black tracking-tight text-foreground">{value}</strong>
      {meta ? <p className="mt-1.5 text-[11px] font-semibold text-muted-foreground">{meta}</p> : null}
      {updated ? <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">Updated: {updated}</p> : null}
    </div>
  )
}
