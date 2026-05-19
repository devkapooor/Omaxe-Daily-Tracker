import * as React from 'react'
import { cn } from '@/shared/lib/utils'
import { GlowCard } from '@/shared/ui/spotlight-card'

type CardProps = React.ComponentProps<'div'> & {
  variant?: 'workspace' | 'quiet'
}

function Card({ className, variant = 'workspace', ...props }: CardProps) {
  if (variant === 'quiet') {
    return (
      <div
        className={cn(
          'rounded-[18px] border border-border/80 bg-white/85 text-card-foreground shadow-[0_10px_22px_rgba(24,32,27,0.05)] backdrop-blur-xl',
          className,
        )}
        {...props}
      />
    )
  }

  return (
    <GlowCard
      className={cn(
        'text-card-foreground shadow-[0_10px_22px_rgba(24,32,27,0.05)]',
        className,
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1.5 p-3 sm:p-3.5', className)} {...props} />
}

function CardTitle({ className, ...props }: React.ComponentProps<'h3'>) {
  return <h3 className={cn('text-lg font-bold tracking-tight text-foreground', className)} {...props} />
}

function CardDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return <p className={cn('text-xs leading-5 text-muted-foreground sm:text-sm', className)} {...props} />
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('px-3 pb-3 sm:px-3.5 sm:pb-3.5', className)} {...props} />
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent }

