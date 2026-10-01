import { cva, type VariantProps } from 'class-variance-authority'
import type { HTMLAttributes } from 'react'
import { cn } from '@/shared/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.25 py-0.5 text-[10px] font-semibold tracking-wide',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-border bg-secondary text-secondary-foreground',
        outline: 'border-info/20 bg-info/8 text-info',
        success: 'border-success/20 bg-success/8 text-success',
        warning: 'border-warning/20 bg-warning/8 text-warning',
        destructive: 'border-destructive/20 bg-destructive/8 text-destructive',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export interface BadgeProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge }

