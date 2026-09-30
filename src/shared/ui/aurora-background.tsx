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
        'relative min-h-screen overflow-hidden bg-[#eef7ff] text-slate-950',
        className,
      )}
      {...props}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className={cn(
            'absolute -inset-[35%] animate-[aurora_28s_linear_infinite] bg-[repeating-linear-gradient(110deg,rgba(255,255,255,0.92)_0%,rgba(255,255,255,0.92)_7%,transparent_10%,transparent_12%,rgba(255,255,255,0.92)_16%),repeating-linear-gradient(110deg,#06b6d4_10%,#60a5fa_18%,#818cf8_26%,#38bdf8_34%,#22d3ee_42%)] bg-[length:300%_200%] bg-[position:50%_50%] opacity-55 blur-[32px] saturate-150',
            showRadialGradient && '[mask-image:radial-gradient(ellipse_at_85%_5%,black_8%,transparent_68%)]',
          )}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_78%,rgba(14,165,233,0.22),transparent_30%),radial-gradient(circle_at_85%_74%,rgba(99,102,241,0.18),transparent_28%),linear-gradient(135deg,rgba(255,255,255,0.78),rgba(239,246,255,0.48))]" />
      </div>
      <div className="relative z-10 min-h-screen">{children}</div>
    </div>
  )
}
