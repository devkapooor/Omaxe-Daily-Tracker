import * as React from 'react'
import { cn } from '@/shared/lib/utils'

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(({ className, type, ...props }, ref) => {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        'flex h-8 w-full rounded-xl border border-input bg-[linear-gradient(180deg,rgba(14,38,58,0.98),rgba(9,29,47,0.97))] px-2.5 py-1.25 text-[12px] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] transition-[border-color,box-shadow,background] outline-none placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/12 disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    />
  )
})
Input.displayName = 'Input'

export { Input }

