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
          'rounded-[20px] border border-border/80 bg-[linear-gradient(180deg,rgba(29,30,34,0.96),rgba(22,23,27,0.92))] text-card-foreground shadow-[0_18px_42px_rgba(0,0,0,0.28)] backdrop-blur-xl',
          className,
        )}
        {...props}
      />
    )
  }

  return (
    <GlowCard
      className={cn(
        'border border-border/70 bg-card/90 text-card-foreground shadow-[0_16px_38px_rgba(0,0,0,0.24)]',
        className,
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-2 p-3.5 sm:p-4', className)} {...props} />
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

