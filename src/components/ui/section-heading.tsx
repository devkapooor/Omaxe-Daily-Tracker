type SectionHeadingProps = {
  eyebrow: string
  title: string
  description?: string
}

export function SectionHeading({ eyebrow, title, description }: SectionHeadingProps) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</p>
      <h2 className="text-lg font-black tracking-tight text-foreground sm:text-xl">{title}</h2>
      {description ? <p className="text-xs leading-5 text-muted-foreground sm:text-sm sm:leading-6">{description}</p> : null}
    </div>
  )
}
