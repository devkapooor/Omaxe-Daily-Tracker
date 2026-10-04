import { describe, expect, it } from 'vitest'
import { DEFAULT_SCHEDULED_NOTIFICATIONS, isScheduledNotificationDue, istDateKey, parseScheduledNotifications } from './scheduledNotifications'

describe('scheduled notification schedules', () => {
  it('uses the fixed IST day and trigger even on a device in another timezone', () => {
    const notice = { ...DEFAULT_SCHEDULED_NOTIFICATIONS[0], triggerTime: '23:50' }
    expect(istDateKey(Date.parse('2026-10-04T18:19:00.000Z'))).toBe('2026-10-04')
    expect(isScheduledNotificationDue(notice, Date.parse('2026-10-04T18:19:00.000Z'))).toBe(false)
    expect(isScheduledNotificationDue(notice, Date.parse('2026-10-04T18:20:00.000Z'))).toBe(true)
  })

  it('rejects malformed notices and keeps valid role targets unique', () => {
    const parsed = parseScheduledNotifications([
      { ...DEFAULT_SCHEDULED_NOTIFICATIONS[0], targetRoles: ['billing', 'manager', 'billing', 'owner'] },
      { ...DEFAULT_SCHEDULED_NOTIFICATIONS[0], triggerTime: '25:00' },
    ])
    expect(parsed).toHaveLength(1)
    expect(parsed[0].targetRoles).toEqual(['billing', 'manager'])
  })
})
