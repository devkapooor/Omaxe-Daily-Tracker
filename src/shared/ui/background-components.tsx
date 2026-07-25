import type { PropsWithChildren } from 'react'

export function AppBackground({ children }: PropsWithChildren) {
  return (
    <div className="relative min-h-screen overflow-x-clip bg-background">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_top_right,rgba(220,157,58,0.24),transparent_28%),radial-gradient(circle_at_18%_12%,rgba(171,121,36,0.18),transparent_22%)] blur-[92px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_center,rgba(255,191,73,0.08),transparent_42%)] opacity-90"
      />
      <div className="relative z-10 min-h-screen bg-[linear-gradient(180deg,rgba(22,22,24,0.82),rgba(17,17,19,0.92))]">
        {children}
      </div>
    </div>
  )
}
