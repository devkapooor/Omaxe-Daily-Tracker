type SectionHeadingProps = {
  eyebrow: string
  title: string
  description?: string
}

export function SectionHeading({ eyebrow, title, description }: SectionHeadingProps) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{eyebrow}</p>
      <h2 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">{title}</h2>
      {description ? <p className="max-w-3xl text-xs leading-5 text-muted-foreground sm:text-sm">{description}</p> : null}
    </div>
  )
}
