import { useState } from 'react'
import type { ScheduledNotification } from '@/domain/appTypes'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { FieldLabel } from '@/shared/ui/field-label'
import { Input } from '@/shared/ui/input'
import { SectionHeading } from '@/shared/ui/section-heading'

export function StaffNotificationsSettings({ notifications, onSave }: { notifications: ScheduledNotification[]; onSave: (notices: ScheduledNotification[]) => Promise<void> }) {
  const [previous, setPrevious] = useState(notifications)
  const [notices, setNotices] = useState(notifications)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  if (previous !== notifications) { setPrevious(notifications); setNotices(notifications) }

  async function save() {
    setSaving(true); setError(''); setMessage('')
    try { await onSave(notices); setMessage('Staff notifications saved.') }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save staff notifications.') }
    finally { setSaving(false) }
  }

  return <Card>
    <CardHeader><SectionHeading eyebrow="Owner Only" title="Staff Notifications" description="Staff see each enabled notice at its IST trigger time while the app is open and must acknowledge it before continuing." /></CardHeader>
    <CardContent className="space-y-3">
      {notices.map((notice, index) => <fieldset key={notice.id} disabled={saving} className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-2 xl:grid-cols-12">
        <legend className="px-1 text-xs font-medium">Notification {index + 1}</legend>
        <FieldLabel className="xl:col-span-3" label="Title"><Input value={notice.title} maxLength={100} onChange={(event) => setNotices((items) => items.map((item, i) => i === index ? { ...item, title: event.target.value } : item))} /></FieldLabel>
        <FieldLabel className="xl:col-span-4" label="Message"><Input value={notice.message} maxLength={1000} onChange={(event) => setNotices((items) => items.map((item, i) => i === index ? { ...item, message: event.target.value } : item))} /></FieldLabel>
        <FieldLabel className="xl:col-span-2" label="Trigger Time (IST)"><Input type="time" value={notice.triggerTime} onChange={(event) => setNotices((items) => items.map((item, i) => i === index ? { ...item, triggerTime: event.target.value } : item))} /></FieldLabel>
        <fieldset className="xl:col-span-3"><legend className="mb-1 text-xs font-medium">Show To</legend><div className="flex gap-3 text-xs">{(['billing', 'manager'] as const).map((role) => <label key={role} className="flex items-center gap-1"><input type="checkbox" checked={notice.targetRoles.includes(role)} onChange={(event) => setNotices((items) => items.map((item, i) => i === index ? { ...item, targetRoles: event.target.checked ? [...item.targetRoles, role] : item.targetRoles.filter((value) => value !== role) } : item))} />{role === 'billing' ? 'Billing' : 'Manager'}</label>)}</div></fieldset>
        <div className="flex items-center justify-between gap-2 sm:col-span-2 xl:col-span-12"><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={notice.enabled} onChange={(event) => setNotices((items) => items.map((item, i) => i === index ? { ...item, enabled: event.target.checked } : item))} />Enabled</label><Button type="button" size="sm" variant="ghost" onClick={() => setNotices((items) => items.filter((_, i) => i !== index))}>Remove</Button></div>
      </fieldset>)}
      {!notices.length ? <p className="text-sm text-muted-foreground">No Staff Notifications Configured.</p> : null}
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={saving || notices.length >= 25} onClick={() => setNotices((items) => [...items, { id: crypto.randomUUID(), title: '', message: '', triggerTime: '23:50', targetRoles: ['billing', 'manager'], enabled: true }])}>Add Notification</Button><Button type="button" disabled={saving || notices.some((notice) => !notice.title.trim() || !notice.message.trim() || !notice.targetRoles.length)} onClick={() => void save()}>{saving ? 'Saving…' : 'Save Notifications'}</Button></div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {message ? <p role="status" className="text-sm text-success">{message}</p> : null}
    </CardContent>
  </Card>
}
