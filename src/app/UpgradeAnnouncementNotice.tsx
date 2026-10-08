import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AppUser } from '@/domain/financeTypes'
import type { UpgradeAnnouncement } from '@/domain/appTypes'
import { Button } from '@/shared/ui/button'

type Props = { user: AppUser; announcement: UpgradeAnnouncement | null }

export function UpgradeAnnouncementNotice({ user, announcement }: Props) {
  const [sessionStartedAt] = useState(() => Date.now())
  const [dismissedId, setDismissedId] = useState<string | null>(null)
  const [expiredId, setExpiredId] = useState<string | null>(null)
  useEffect(() => {
    if (!announcement) return
    const expiresAt = Date.parse(announcement.expiresAt)
    const delay = expiresAt - Date.now()
    if (!Number.isFinite(expiresAt) || delay <= 0) return
    const timer = window.setTimeout(() => setExpiredId(announcement.id), delay)
    return () => window.clearTimeout(timer)
  }, [announcement])
  const shouldShow = useMemo(() => {
    if (!announcement || dismissedId === announcement.id || expiredId === announcement.id) return false
    const publishedAt = Date.parse(announcement.publishedAt)
    const expiresAt = Date.parse(announcement.expiresAt)
    return Number.isFinite(publishedAt) && Number.isFinite(expiresAt) && publishedAt >= sessionStartedAt && expiresAt > sessionStartedAt
  }, [announcement, dismissedId, expiredId, sessionStartedAt])

  if (!shouldShow || !announcement || typeof document === 'undefined') return null

  return createPortal(<div className="fixed inset-0 z-[110] grid place-items-center bg-slate-950/85 p-4" role="alertdialog" aria-modal="true" aria-labelledby="upgrade-announcement-title" aria-describedby="upgrade-announcement-message">
    <section className="w-full max-w-lg rounded-xl border border-border bg-card p-6 text-card-foreground shadow-2xl">
      <p className="text-xs font-semibold uppercase tracking-widest text-primary">App update</p>
      <h1 id="upgrade-announcement-title" className="mt-2 text-2xl font-bold">{announcement.title}</h1>
      <p id="upgrade-announcement-message" className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{announcement.message}</p>
      <p className="mt-4 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm font-semibold">For a complete refresh, press <kbd className="rounded border border-border bg-card px-1.5 py-0.5 font-mono">Ctrl+Shift+R</kbd>.</p>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={() => setDismissedId(announcement.id)}>Later</Button>
        <Button onClick={() => window.location.reload()}>Refresh now</Button>
      </div>
      <span className="sr-only">Announcement for {user.name}</span>
    </section>
  </div>, document.body)
}
