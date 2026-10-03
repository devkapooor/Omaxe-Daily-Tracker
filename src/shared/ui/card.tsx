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
          'rounded-[16px] border border-border/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,250,254,0.96))] text-card-foreground shadow-[0_12px_28px_rgba(38,78,118,0.1)] backdrop-blur-xl dark:bg-none dark:bg-card dark:shadow-black/25',
          className,
        )}
        {...props}
      />
    )
  }

  return (
    <GlowCard
      className={cn(
        'border border-border/90 bg-card/96 text-card-foreground shadow-[0_10px_24px_rgba(38,78,118,0.09)] dark:shadow-black/20',
        className,
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-0.75 p-2 sm:p-2.5', className)} {...props} />
}

function CardTitle({ className, ...props }: React.ComponentProps<'h3'>) {
  return <h3 className={cn('text-lg font-bold tracking-tight text-foreground', className)} {...props} />
}

function CardDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return <p className={cn('text-[11px] leading-4 text-muted-foreground sm:text-xs', className)} {...props} />
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('px-2 pb-2 sm:px-2.5 sm:pb-2.5', className)} {...props} />
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent }

