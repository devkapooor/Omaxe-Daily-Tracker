import type { ScheduledNotification } from '@/domain/appTypes'

export const DEFAULT_SCHEDULED_NOTIFICATIONS: ScheduledNotification[] = [{
  id: 'cashout-window-opening',
  title: 'Cashout window opening',
  message: 'The Cashout window opens at 11:55 PM IST and closes at 12:20 AM. Acknowledge to continue.',
  triggerTime: '23:50',
  targetRoles: ['manager', 'billing'],
  enabled: true,
}]

export function parseScheduledNotifications(value: unknown): ScheduledNotification[] {
  if (!Array.isArray(value)) return DEFAULT_SCHEDULED_NOTIFICATIONS
  return value.slice(0, 25).flatMap((item): ScheduledNotification[] => {
    if (!item || typeof item !== 'object') return []
    const notice = item as Partial<ScheduledNotification>
    if (
      typeof notice.id !== 'string' || !notice.id.trim() ||
      typeof notice.title !== 'string' || !notice.title.trim() || notice.title.length > 100 ||
      typeof notice.message !== 'string' || !notice.message.trim() || notice.message.length > 1000 ||
      typeof notice.triggerTime !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(notice.triggerTime) ||
      typeof notice.enabled !== 'boolean' || !Array.isArray(notice.targetRoles)
    ) return []
    const targetRoles = [...new Set(notice.targetRoles.filter((role): role is 'manager' | 'billing' => role === 'manager' || role === 'billing'))]
    if (!targetRoles.length) return []
    return [{
      id: notice.id,
      title: notice.title.trim(),
      message: notice.message.trim(),
      triggerTime: notice.triggerTime,
      targetRoles,
      enabled: notice.enabled,
    }]
  })
}

export function istDateKey(serverTimeMs: number) {
  const values = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(serverTimeMs))
  const part = (type: string) => values.find((value) => value.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function isScheduledNotificationDue(notice: ScheduledNotification, serverTimeMs: number) {
  if (!notice.enabled || !Number.isFinite(serverTimeMs)) return false
  const values = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(serverTimeMs))
  const hour = Number(values.find((value) => value.type === 'hour')?.value)
  const minute = Number(values.find((value) => value.type === 'minute')?.value)
  const [triggerHour, triggerMinute] = notice.triggerTime.split(':').map(Number)
  return hour * 60 + minute >= triggerHour * 60 + triggerMinute
}
