import type { PropsWithChildren } from 'react'

export function AppBackground({ children }: PropsWithChildren) {
  return (
    <div className="relative min-h-screen overflow-x-clip bg-background">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.12),transparent_32%),radial-gradient(circle_at_18%_12%,rgba(34,211,238,0.1),transparent_26%)] blur-[92px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.06),transparent_46%)] opacity-90"
      />
      <div className="relative z-10 min-h-screen bg-[linear-gradient(180deg,rgba(248,251,255,0.82),rgba(241,246,251,0.94))]">
        {children}
      </div>
    </div>
  )
}
