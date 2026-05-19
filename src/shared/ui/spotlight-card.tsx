import * as React from 'react'
import { cn } from '@/shared/lib/utils'

type GlowColor = 'blue' | 'purple' | 'green' | 'red' | 'orange' | 'neutral'

const glowColorMap: Record<GlowColor, { base: number; spread: number }> = {
  blue: { base: 210, spread: 42 },
  purple: { base: 275, spread: 38 },
  green: { base: 126, spread: 24 },
  red: { base: 8, spread: 24 },
  orange: { base: 28, spread: 26 },
  neutral: { base: 132, spread: 12 },
}

const GLOW_STYLE_ID = 'alphahub-glow-card-styles'

type GlowCardProps = React.ComponentProps<'div'> & {
  glowColor?: GlowColor
  spotlightSize?: number
  interactive?: boolean
}

function ensureGlowStyles() {
  if (typeof document === 'undefined' || document.getElementById(GLOW_STYLE_ID)) return

  const style = document.createElement('style')
  style.id = GLOW_STYLE_ID
  style.textContent = `
    [data-glow-card="true"] {
      position: relative;
      overflow: hidden;
      isolation: isolate;
    }

    [data-glow-card="true"]::before,
    [data-glow-card="true"]::after {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: inherit;
      pointer-events: none;
      transition: opacity 180ms ease;
    }

    [data-glow-card="true"]::before {
      border: 1px solid hsl(var(--glow-hue) 22% 84% / 0.72);
      box-shadow:
        inset 0 1px 0 hsl(0 0% 100% / 0.42),
        0 14px 32px hsl(140 18% 14% / 0.07);
    }

    [data-glow-card="true"]::after {
      opacity: var(--glow-opacity, 0.14);
      background:
        radial-gradient(
          circle var(--spotlight-size) at var(--pointer-x) var(--pointer-y),
          hsl(var(--glow-hue) 88% 92% / 0.28),
          hsl(var(--glow-hue) 82% 88% / 0.12) 26%,
          transparent 66%
        );
      mix-blend-mode: screen;
    }

    [data-glow-card="false"]::after {
      opacity: 0.08;
      background:
        radial-gradient(
          circle var(--spotlight-size) at 24% 20%,
          hsl(var(--glow-hue) 74% 92% / 0.22),
          transparent 62%
        );
    }
  `

  document.head.appendChild(style)
}

function useFinePointer() {
  const [isFinePointer, setIsFinePointer] = React.useState(false)

  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return

    const mediaQuery = window.matchMedia('(hover: hover) and (pointer: fine)')
    const sync = () => setIsFinePointer(mediaQuery.matches)

    sync()
    mediaQuery.addEventListener('change', sync)
    return () => mediaQuery.removeEventListener('change', sync)
  }, [])

  return isFinePointer
}

function GlowCard({
  children,
  className,
  glowColor = 'neutral',
  spotlightSize = 220,
  interactive = true,
  style,
  onPointerMove,
  onPointerLeave,
  ...props
}: GlowCardProps) {
  const cardRef = React.useRef<HTMLDivElement>(null)
  const hasFinePointer = useFinePointer()
  const canInteract = interactive && hasFinePointer
  const { base, spread } = glowColorMap[glowColor]

  React.useEffect(() => {
    ensureGlowStyles()
  }, [])

  const mergedStyle = {
    '--glow-base': `${base}`,
    '--glow-spread': `${spread}`,
    '--glow-hue': `calc(var(--glow-base) + (var(--glow-progress, 0.35) * var(--glow-spread)))`,
    '--pointer-x': '50%',
    '--pointer-y': '50%',
    '--spotlight-size': `${spotlightSize}px`,
    '--glow-progress': '0.35',
    '--glow-opacity': canInteract ? '0.14' : '0.08',
    ...style,
  } as React.CSSProperties

  function updatePointer(event: React.PointerEvent<HTMLDivElement>) {
    if (!canInteract || !cardRef.current) {
      onPointerMove?.(event)
      return
    }

    const rect = cardRef.current.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const progress = rect.width > 0 ? Math.min(Math.max(x / rect.width, 0), 1) : 0.35

    cardRef.current.style.setProperty('--pointer-x', `${x}px`)
    cardRef.current.style.setProperty('--pointer-y', `${y}px`)
    cardRef.current.style.setProperty('--glow-progress', progress.toFixed(3))

    onPointerMove?.(event)
  }

  function resetPointer(event: React.PointerEvent<HTMLDivElement>) {
    if (cardRef.current) {
      cardRef.current.style.setProperty('--pointer-x', '50%')
      cardRef.current.style.setProperty('--pointer-y', '50%')
      cardRef.current.style.setProperty('--glow-progress', '0.35')
    }

    onPointerLeave?.(event)
  }

  return (
    <div
      ref={cardRef}
      data-glow-card={canInteract ? 'true' : 'false'}
      className={cn(
        'rounded-[18px] border border-transparent bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(255,255,255,0.8))] text-card-foreground backdrop-blur-xl',
        className,
      )}
      style={mergedStyle}
      onPointerLeave={resetPointer}
      onPointerMove={updatePointer}
      {...props}
    >
      {children}
    </div>
  )
}

export { GlowCard }

