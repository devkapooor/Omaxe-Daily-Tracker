import { cva, type VariantProps } from 'class-variance-authority'
import type { HTMLAttributes } from 'react'
import { cn } from '@/shared/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-medium tracking-[0.02em]',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-border bg-secondary text-secondary-foreground',
        outline: 'border-slate-300 bg-white text-slate-700 dark:border-border dark:bg-card dark:text-foreground',
        success: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-200/30 dark:bg-emerald-400/10 dark:text-emerald-300',
        warning: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-200/30 dark:bg-amber-400/10 dark:text-amber-200',
        destructive: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-destructive/30 dark:bg-destructive/10 dark:text-destructive',
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

