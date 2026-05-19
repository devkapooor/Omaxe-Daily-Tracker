type SectionHeadingProps = {
  eyebrow: string
  title: string
  description?: string
}

export function SectionHeading({ eyebrow, title, description }: SectionHeadingProps) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</p>
      <h2 className="text-base font-black tracking-tight text-foreground sm:text-lg">{title}</h2>
      {description ? <p className="text-xs leading-5 text-muted-foreground sm:text-sm sm:leading-5">{description}</p> : null}
    </div>
  )
}
