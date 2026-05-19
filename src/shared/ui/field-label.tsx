import type { PropsWithChildren } from 'react'
import { cn } from '@/shared/lib/utils'

type FieldLabelProps = PropsWithChildren<{
  className?: string
  label: string
}>

export function FieldLabel({ children, className, label }: FieldLabelProps) {
  return (
    <label className={cn('grid gap-2 text-sm font-semibold text-foreground', className)}>
      <span>{label}</span>
      {children}
    </label>
  )
}

