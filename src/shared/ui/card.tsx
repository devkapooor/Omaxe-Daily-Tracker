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
          'rounded-[16px] border border-border/80 bg-[linear-gradient(180deg,rgba(29,30,34,0.96),rgba(22,23,27,0.92))] text-card-foreground shadow-[0_10px_22px_rgba(0,0,0,0.2)] backdrop-blur-xl',
          className,
        )}
        {...props}
      />
    )
  }

  return (
    <GlowCard
      className={cn(
        'border border-border/70 bg-card/90 text-card-foreground shadow-[0_10px_22px_rgba(0,0,0,0.18)]',
        className,
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1 p-2.5 sm:p-3', className)} {...props} />
}

function CardTitle({ className, ...props }: React.ComponentProps<'h3'>) {
  return <h3 className={cn('text-lg font-bold tracking-tight text-foreground', className)} {...props} />
}

function CardDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return <p className={cn('text-xs leading-5 text-muted-foreground sm:text-sm', className)} {...props} />
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('px-2.5 pb-2.5 sm:px-3 sm:pb-3', className)} {...props} />
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent }

