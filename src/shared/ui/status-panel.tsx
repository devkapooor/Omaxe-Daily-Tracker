import { cva, type VariantProps } from 'class-variance-authority'
import type { HTMLAttributes } from 'react'
import { cn } from '@/shared/lib/utils'

const statusPanelVariants = cva('rounded-md border px-3 py-2.5 text-[13px] font-medium', {
  variants: {
    variant: {
      info: 'border-info/20 bg-info/8 text-info',
      success: 'border-success/20 bg-success/8 text-success',
      warning: 'border-warning/20 bg-warning/8 text-warning',
      destructive: 'border-destructive/20 bg-destructive/8 text-destructive',
    },
  },
  defaultVariants: {
    variant: 'info',
  },
})

export interface StatusPanelProps
  extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof statusPanelVariants> {}

export function StatusPanel({ className, variant, ...props }: StatusPanelProps) {
  return <div className={cn(statusPanelVariants({ variant }), className)} {...props} />
}
