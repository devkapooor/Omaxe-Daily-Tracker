import * as React from 'react'
import { cn } from '@/shared/lib/utils'

type GlowColor = 'blue' | 'purple' | 'green' | 'red' | 'orange' | 'neutral'

type GlowCardProps = React.ComponentProps<'div'> & {
  glowColor?: GlowColor
  spotlightSize?: number
  interactive?: boolean
}

function GlowCard({
  children,
  className,
  glowColor,
  spotlightSize,
  interactive,
  style,
  ...props
}: GlowCardProps) {
  void glowColor
  void spotlightSize
  void interactive

  return (
    <div
      className={cn(
        'rounded-md border border-border bg-card text-card-foreground shadow-sm',
        className,
      )}
      style={style}
      {...props}
    >
      {children}
    </div>
  )
}

export { GlowCard }

