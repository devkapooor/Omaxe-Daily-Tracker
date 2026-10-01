import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/shared/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl text-[12px] font-semibold transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-70',
  {
    variants: {
      variant: {
        default: 'border border-blue-300/20 bg-[linear-gradient(180deg,#4b91f7,#2563eb)] text-primary-foreground shadow-[0_12px_28px_rgba(37,99,235,0.24)] hover:brightness-110',
        secondary: 'border border-border/80 bg-secondary/92 text-secondary-foreground hover:bg-secondary',
        outline: 'border border-border bg-card/88 text-foreground hover:border-cyan-400/45 hover:bg-accent hover:text-accent-foreground',
        ghost: 'text-foreground hover:bg-accent hover:text-accent-foreground',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
      },
      size: {
        default: 'h-8 px-3 py-1.5',
        sm: 'h-7 rounded-lg px-2.5',
        lg: 'h-9 rounded-xl px-4',
        icon: 'h-8 w-8 rounded-lg',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  },
)
Button.displayName = 'Button'

export { Button }

