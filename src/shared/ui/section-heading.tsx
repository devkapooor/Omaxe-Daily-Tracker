type SectionHeadingProps = {
  eyebrow: string
  title: string
  description?: string
}

export function SectionHeading({ eyebrow, title, description }: SectionHeadingProps) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#c5a56a]">{eyebrow}</p>
      <h2 className="text-[1rem] font-black tracking-[-0.02em] text-foreground sm:text-[1.12rem]">{title}</h2>
      {description ? <p className="text-[10px] leading-4 text-muted-foreground sm:text-[11px] sm:leading-4.5">{description}</p> : null}
    </div>
  )
}
