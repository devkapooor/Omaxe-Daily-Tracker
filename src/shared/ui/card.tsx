import * as React from 'react'
import { cn } from '@/shared/lib/utils'

type CardProps = React.ComponentProps<'div'> & {
  variant?: 'workspace' | 'quiet'
}

function Card({ className, variant = 'workspace', ...props }: CardProps) {
  if (variant === 'quiet') {
    return (
      <div
        className={cn(
          'rounded-md border border-border bg-card text-card-foreground shadow-sm',
          className,
        )}
        {...props}
      />
    )
  }

  return <div className={cn('rounded-md border border-border bg-card text-card-foreground shadow-sm', className)} {...props} />
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1.5 p-4', className)} {...props} />
}

function CardTitle({ className, ...props }: React.ComponentProps<'h3'>) {
  return <h3 className={cn('text-base font-semibold tracking-tight text-foreground', className)} {...props} />
}

function CardDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return <p className={cn('text-xs leading-5 text-muted-foreground', className)} {...props} />
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('px-4 pb-4', className)} {...props} />
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent }

