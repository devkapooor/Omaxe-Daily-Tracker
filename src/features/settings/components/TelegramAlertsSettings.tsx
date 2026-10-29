import { useEffect, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/shared/lib/firebase'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { SectionHeading } from '@/shared/ui/section-heading'

type TelegramStatus = { enabled: boolean; enabledAt?: string | null; deliveryIssues?: number; deliveryIssuesCapped?: boolean }
type Action = 'status' | 'enable' | 'pause'

export function TelegramAlertsSettings() {
  const [status, setStatus] = useState<TelegramStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const read = httpsCallable<{ action: Action }, TelegramStatus>(functions, 'configureTelegramAlerts')
    void read({ action: 'status' }).then(result => { if (active) setStatus(result.data) }).catch(() => {
      if (active) setError('Telegram setup is unavailable. Finish the server setup, then refresh.')
    })
    return () => { active = false }
  }, [])

  async function update(action: Action) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const change = httpsCallable<{ action: Action }, TelegramStatus>(functions, 'configureTelegramAlerts')
      await change({ action })
      setStatus((await change({ action: 'status' })).data)
      setMessage(action === 'enable' ? 'Alerts enabled. Milestones start from the current sales total.' : action === 'pause' ? 'Telegram alerts and commands paused.' : 'Status refreshed.')
    } catch { setError('Telegram could not be updated. Check server setup and refresh to confirm its status.') }
    finally { setBusy(false) }
  }

  return (
    <Card className="mt-4 max-w-2xl">
      <CardHeader className="px-3 pb-2 pt-3 sm:px-4">
        <SectionHeading eyebrow="Owner only" title="Telegram Sales Alerts" description="₹5,000 daily POS sales milestones, /today and a report for each completed cashout." />
      </CardHeader>
      <CardContent className="space-y-3 px-3 pb-3 sm:px-4">
        <p className="text-sm">Bot: <a className="underline" href="https://t.me/StoreSalesAlertBot" target="_blank" rel="noreferrer">@StoreSalesAlertBot</a> · {status ? status.enabled ? 'Enabled' : 'Paused' : 'Status unavailable'}</p>
        <p className="text-sm text-muted-foreground">Only your configured private Telegram account can receive reports. Business days follow IST. Enabling starts from current sales without sending earlier milestones.</p>
        {status?.deliveryIssues ? <p role="alert" className="text-sm text-destructive">{status.deliveryIssues}{status.deliveryIssuesCapped ? '+' : ''} failed or unconfirmed deliveries need review. Refreshing status does not resend them.</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={busy || !status} onClick={() => { void update(status?.enabled ? 'pause' : 'enable') }}>{busy ? 'Updating...' : status?.enabled ? 'Pause Telegram' : 'Enable Telegram'}</Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => { void update('status') }}>Refresh status</Button>
        </div>
        {message ? <p role="status" className="text-sm">{message}</p> : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  )
}
