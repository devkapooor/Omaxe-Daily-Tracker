import type { HTMLAttributes, PropsWithChildren } from 'react'
import { cn } from '@/shared/lib/utils'

type AuroraBackgroundProps = PropsWithChildren<
  HTMLAttributes<HTMLDivElement> & {
    showRadialGradient?: boolean
  }
>

export function AuroraBackground({
  children,
  className,
  showRadialGradient = true,
  ...props
}: AuroraBackgroundProps) {
  return (
    <div
      className={cn(
        'relative min-h-screen overflow-hidden bg-[#041321] text-foreground',
        className,
      )}
      {...props}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className={cn(
            'absolute -inset-[35%] animate-[aurora_28s_linear_infinite] bg-[repeating-linear-gradient(110deg,rgba(6,21,37,0.92)_0%,rgba(6,21,37,0.92)_8%,transparent_12%,transparent_15%,rgba(6,21,37,0.9)_20%),repeating-linear-gradient(110deg,#083344_10%,#075985_20%,#1d4ed8_30%,#0369a1_40%,#0e7490_50%)] bg-[length:300%_200%] bg-[position:50%_50%] opacity-60 blur-[44px] saturate-125',
            showRadialGradient && '[mask-image:radial-gradient(ellipse_at_78%_8%,black_6%,transparent_70%)]',
          )}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_78%,rgba(6,182,212,0.18),transparent_30%),radial-gradient(circle_at_82%_24%,rgba(37,99,235,0.22),transparent_30%),linear-gradient(180deg,rgba(7,28,47,0.38),rgba(3,14,26,0.82))]" />
        <div
          className="absolute inset-0 opacity-[0.025] mix-blend-soft-light"
          style={{
            backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%270 0 180 180%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cfilter id=%27n%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%270.7%27 numOctaves=%273%27 stitchTiles=%27stitch%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23n)%27/%3E%3C/svg%3E")',
            backgroundSize: '180px 180px',
          }}
        />
      </div>
      <div className="relative z-10 min-h-screen">{children}</div>
    </div>
  )
}
