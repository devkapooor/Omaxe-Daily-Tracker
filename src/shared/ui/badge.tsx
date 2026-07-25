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
        outline: 'border-[#4a3c24] bg-accent/85 text-accent-foreground',
        success: 'border-emerald-900/60 bg-emerald-950/40 text-emerald-200',
        warning: 'border-amber-900/60 bg-amber-950/40 text-amber-200',
        destructive: 'border-rose-900/60 bg-rose-950/40 text-rose-200',
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

