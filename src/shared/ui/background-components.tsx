import type { PropsWithChildren } from 'react'

export function AppBackground({ children }: PropsWithChildren) {
  return (
    <div className="relative min-h-screen overflow-x-clip bg-background">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.2),transparent_30%),radial-gradient(circle_at_18%_12%,rgba(34,211,238,0.12),transparent_24%)] blur-[92px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.07),transparent_44%)] opacity-90"
      />
      <div className="relative z-10 min-h-screen bg-[linear-gradient(180deg,rgba(8,27,45,0.82),rgba(5,19,33,0.94))]">
        {children}
      </div>
    </div>
  )
}
