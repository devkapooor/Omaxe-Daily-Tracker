import type { ReactNode } from 'react'

export function AuditDetails({ children, title = 'Audit details' }: { children: ReactNode; title?: string }) {
  return <details className="rounded-md border border-border px-3 py-2 text-sm">
    <summary className="cursor-pointer font-medium">{title}</summary>
    <div className="mt-3 grid gap-3">{children}</div>
  </details>
}
