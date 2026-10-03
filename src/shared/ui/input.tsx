import * as React from 'react'
import { cn } from '@/shared/lib/utils'

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(({ className, type, ...props }, ref) => {
  return (
    <input
      ref={ref}
      type={type}
        className={cn(
        'flex h-9 w-full rounded-md border border-input bg-card px-3 py-2 text-[13px] text-foreground shadow-sm transition-[border-color,box-shadow,background] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:bg-muted/70 disabled:opacity-70',
        (type === 'number' || type === 'date' || type === 'month' || type === 'time') && 'font-mono tabular-nums',
        className,
      )}
      {...props}
    />
  )
})
Input.displayName = 'Input'

export { Input }

