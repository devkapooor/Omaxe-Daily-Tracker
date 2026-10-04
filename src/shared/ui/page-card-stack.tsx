import type { HTMLAttributes } from 'react'
import { cn } from '@/shared/lib/utils'

type PageCardStackProps = HTMLAttributes<HTMLDivElement>

export function PageCardStack({ className, ...props }: PageCardStackProps) {
  return <div className={cn('grid min-w-0 gap-card-gap', className)} {...props} />
}
