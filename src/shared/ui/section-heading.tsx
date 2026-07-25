type SectionHeadingProps = {
  eyebrow: string
  title: string
  description?: string
}

export function SectionHeading({ eyebrow, title, description }: SectionHeadingProps) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#c5a56a] sm:text-[13px]">{eyebrow}</p>
      <h2 className="text-[1.2rem] font-black tracking-[-0.02em] text-foreground sm:text-[1.35rem]">{title}</h2>
      {description ? <p className="text-xs leading-5 text-muted-foreground sm:text-sm sm:leading-5">{description}</p> : null}
    </div>
  )
}
