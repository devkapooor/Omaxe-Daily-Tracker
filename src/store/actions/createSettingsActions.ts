import { doc, setDoc } from 'firebase/firestore'
import { db } from '@/shared/lib/firebase'
import { nowIso, type OperationalExpenseBreakdown, type StoreCollectionState } from '@/store/storeShared'
import type { ScheduledNotification, UpgradeAnnouncement } from '@/domain/appTypes'
import { parseScheduledNotifications } from '@/features/action-center/domain/scheduledNotifications'

type SettingsActionArgs = {
  getState: () => StoreCollectionState
  pushSettingsAudit: (action: string, actor: string) => Promise<void>
}

export function createSettingsActions({ getState, pushSettingsAudit }: SettingsActionArgs) {
  async function saveOperationalSettings(operationalExpenseBreakdown: OperationalExpenseBreakdown, marginPercentage: number, actor: string) {
    for (const [label, value] of Object.entries(operationalExpenseBreakdown)) {
      if (!Number.isFinite(value) || value < 0) {
        throw new Error(`${label} expense must be zero or more.`)
      }
    }
    if (!Number.isFinite(marginPercentage) || marginPercentage < 0 || marginPercentage > 100) {
      throw new Error('Margin percentage must be between 0 and 100.')
    }

    const monthlyOperationalExpense = Object.values(operationalExpenseBreakdown).reduce((total, value) => total + value, 0)

    await setDoc(
      doc(db, 'appMetadata', 'appSettings'),
      { marginPercentage, monthlyOperationalExpense, operationalExpenseBreakdown },
      { merge: true },
    )
    await pushSettingsAudit(
      `Operational settings updated: total monthly expense ${monthlyOperationalExpense}, margin ${marginPercentage}%`,
      actor,
    )
  }

  async function saveScheduledNotifications(value: ScheduledNotification[], actor: string) {
    const notices = parseScheduledNotifications(value)
    if (notices.length !== value.length) throw new Error('Each notification needs a title, message, valid trigger time, and at least one staff role.')
    await setDoc(doc(db, 'appMetadata', 'appSettings'), { scheduledNotifications: notices }, { merge: true })
    await pushSettingsAudit(`Scheduled blocking notifications updated (${notices.length} configured)`, actor)
  }

  async function publishUpgradeAnnouncement(title: string, message: string, durationHours: number, actor: string) {
    const cleanTitle = title.trim()
    const cleanMessage = message.trim()
    if (!cleanTitle || cleanTitle.length > 100) throw new Error('Enter an announcement title of 1–100 characters.')
    if (!cleanMessage || cleanMessage.length > 500) throw new Error('Enter an announcement message of 1–500 characters.')
    if (![1, 4, 24].includes(durationHours)) throw new Error('Choose a valid announcement duration.')
    const publishedAt = nowIso()
    const announcement: UpgradeAnnouncement = {
      id: crypto.randomUUID(),
      title: cleanTitle,
      message: cleanMessage,
      publishedAt,
      expiresAt: new Date(Date.parse(publishedAt) + durationHours * 60 * 60 * 1000).toISOString(),
      publishedBy: actor,
    }
    await setDoc(doc(db, 'appMetadata', 'appSettings'), { upgradeAnnouncement: announcement }, { merge: true })
    await pushSettingsAudit(`App upgrade announcement published for ${durationHours} hour(s)`, actor)
  }

  async function clearUpgradeAnnouncement(actor: string) {
    await setDoc(doc(db, 'appMetadata', 'appSettings'), { upgradeAnnouncement: null }, { merge: true })
    await pushSettingsAudit('App upgrade announcement cleared', actor)
  }

  async function saveMonthlyReportMargin(month: string, marginPercentage: number, actor: string) {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new Error('Month must be in YYYY-MM format.')
    }
    if (!Number.isFinite(marginPercentage) || marginPercentage < 0 || marginPercentage > 100) {
      throw new Error('Margin percentage must be between 0 and 100.')
    }

    const existing = getState().monthlyReports.find((entry) => entry.month === month)
    const timestamp = nowIso()

    await setDoc(
      doc(db, 'monthlyReports', month),
      {
        month,
        marginPercentage,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
        updatedBy: actor,
      },
      { merge: true },
    )
    await pushSettingsAudit(`Monthly report margin updated: ${month} -> ${marginPercentage}%`, actor)
  }

  return {
    saveMonthlyReportMargin,
    saveOperationalSettings,
    saveScheduledNotifications,
    publishUpgradeAnnouncement,
    clearUpgradeAnnouncement,
  }
}
