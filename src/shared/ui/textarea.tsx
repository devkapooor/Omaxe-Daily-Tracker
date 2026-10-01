import * as React from 'react'
import { cn } from '@/shared/lib/utils'

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[72px] w-full rounded-xl border border-input bg-[linear-gradient(180deg,rgba(14,38,58,0.98),rgba(9,29,47,0.97))] px-2.5 py-1.75 text-[12px] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] transition-[border-color,box-shadow,background] outline-none placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/12 disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    />
  )
})
Textarea.displayName = 'Textarea'

export { Textarea }

