import * as React from 'react'
import { cn } from '@/shared/lib/utils'

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(({ className, type, ...props }, ref) => {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        'flex h-8 w-full rounded-xl border border-input bg-white/95 px-2.5 py-1.25 text-[12px] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_1px_2px_rgba(38,78,118,0.04)] transition-[border-color,box-shadow,background] outline-none placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/12 disabled:cursor-not-allowed disabled:bg-muted/70 disabled:opacity-70 dark:bg-card dark:shadow-none',
        className,
      )}
      {...props}
    />
  )
})
Input.displayName = 'Input'

export { Input }

