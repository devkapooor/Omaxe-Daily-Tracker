import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AppUser } from '@/domain/financeTypes'
import type { ScheduledNotification } from '@/domain/appTypes'
import { isScheduledNotificationDue, istDateKey } from '@/features/action-center/domain/scheduledNotifications'
import { serverNowMs } from '@/shared/lib/serverClock'
import { Button } from '@/shared/ui/button'

type Props = { user: AppUser; notices: ScheduledNotification[] }

export function AppBlockingNotice({ user, notices }: Props) {
  const [, setClockPulse] = useState(0)
  const [sessionAcknowledged, setSessionAcknowledged] = useState<string[]>([])
  const eligible = useMemo(() => notices.filter((notice) => notice.enabled && notice.targetRoles.includes(user.role as 'billing' | 'manager')), [notices, user.role])
  const now = (() => { try { return serverNowMs() } catch { return null } })()
  const dateKey = now === null ? '' : istDateKey(now)
  let acknowledged: string[] = []
  if (dateKey) {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(`blocking-notices-ack:${user.id}:${dateKey}`) ?? '[]')
      acknowledged = Array.isArray(parsed) ? parsed.map(String) : []
    } catch { acknowledged = [] }
  }
  const due = now === null ? [] : eligible.filter((notice) => {
    const key = `${user.id}:${notice.id}:${dateKey}`
    return isScheduledNotificationDue(notice, now) && !acknowledged.includes(key) && !sessionAcknowledged.includes(key)
  })

  useEffect(() => {
    const refresh = () => setClockPulse((value) => value + 1)
    const timer = window.setInterval(refresh, 15_000)
    document.addEventListener('visibilitychange', refresh)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh) }
  }, [])

  useEffect(() => {
    const root = document.getElementById('root')
    if (!root) return
    root.inert = due.length > 0
    return () => { root.inert = false }
  }, [due.length])

  if (!due.length || typeof document === 'undefined') return null
  const notice = due[0]
  function acknowledge() {
    const next = [...acknowledged, `${user.id}:${notice.id}:${dateKey}`]
    setSessionAcknowledged((items) => [...items, `${user.id}:${notice.id}:${dateKey}`])
    try { window.localStorage.setItem(`blocking-notices-ack:${user.id}:${dateKey}`, JSON.stringify(next)) } catch { /* Keep this tab usable even when browser storage is unavailable. */ }
  }
  return createPortal(<div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/90 p-5" role="alertdialog" aria-modal="true" aria-labelledby="scheduled-notice-title" aria-describedby="scheduled-notice-message">
    <section className="w-full max-w-lg rounded-xl border border-border bg-card p-6 text-card-foreground shadow-2xl">
      <p className="text-xs font-semibold uppercase tracking-widest text-primary">Action required</p>
      <h1 id="scheduled-notice-title" className="mt-2 text-2xl font-bold">{notice.title}</h1>
      <p id="scheduled-notice-message" className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{notice.message}</p>
      <Button className="mt-6 w-full" onClick={acknowledge}>Acknowledge and continue</Button>
    </section>
  </div>, document.body)
}
