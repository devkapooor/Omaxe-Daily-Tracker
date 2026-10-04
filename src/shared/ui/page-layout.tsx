import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/utils'

type PageLayoutProps = {
  children: ReactNode
  header?: ReactNode
  className?: string
}

export function PageLayout({ children, header, className }: PageLayoutProps) {
  return (
    <section className={cn('flex min-h-0 flex-col gap-card-gap', className)}>
      {header}
      {children}
    </section>
  )
}
