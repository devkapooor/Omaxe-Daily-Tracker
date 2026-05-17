import * as React from 'react'
import { cn } from '@/lib/utils'

function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'rounded-[20px] border border-border/80 bg-white/85 text-card-foreground shadow-[0_12px_28px_rgba(24,32,27,0.06)] backdrop-blur-xl',
        className,
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1.5 p-3.5 sm:p-4', className)} {...props} />
}

function CardTitle({ className, ...props }: React.ComponentProps<'h3'>) {
  return <h3 className={cn('text-lg font-bold tracking-tight text-foreground', className)} {...props} />
}

function CardDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return <p className={cn('text-xs leading-5 text-muted-foreground sm:text-sm', className)} {...props} />
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('px-3.5 pb-3.5 sm:px-4 sm:pb-4', className)} {...props} />
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent }
