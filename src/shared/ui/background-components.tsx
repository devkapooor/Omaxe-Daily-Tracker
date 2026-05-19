import type { PropsWithChildren } from 'react'

export function AppBackground({ children }: PropsWithChildren) {
  return (
    <div className="relative min-h-screen overflow-x-clip bg-background">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_top_right,rgba(70,130,180,0.42),transparent_32%),radial-gradient(circle_at_88%_16%,rgba(118,165,206,0.32),transparent_26%)] blur-[84px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_center,rgba(255,249,145,0.5),transparent_44%)] opacity-80 mix-blend-multiply"
      />
      <div className="relative z-10 min-h-screen bg-[linear-gradient(180deg,rgba(255,255,255,0.74),rgba(255,255,255,0.86))]">
        {children}
      </div>
    </div>
  )
}
