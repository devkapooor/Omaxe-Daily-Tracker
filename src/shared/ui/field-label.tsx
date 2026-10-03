import type { PropsWithChildren } from 'react'
import { cn } from '@/shared/lib/utils'

type FieldLabelProps = PropsWithChildren<{
  className?: string
  label: string
}>

export function FieldLabel({ children, className, label }: FieldLabelProps) {
  return (
    <label className={cn('grid gap-1.5 text-[13px] font-medium text-foreground', className)}>
      <span>{label}</span>
      {children}
    </label>
  )
}

