import { updateWorkspaceSettings } from '@/store/sharedViewsRepository'
import { doc, setDoc } from 'firebase/firestore'
import { db } from '@/shared/lib/firebase'
import { nowIso, type OperationalExpenseBreakdown, type StoreCollectionState } from '@/store/storeShared'
import type { ScheduledNotification } from '@/domain/appTypes'
import type { BusinessIdentity } from '@/domain/businessIdentity'
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

    await updateWorkspaceSettings('operations', { marginPercentage, operationalExpenseBreakdown })
    void actor
  }

  async function saveBusinessIdentity(identity: BusinessIdentity) {
    const legalName = identity.businessLegalName.trim()
    const gstin = identity.businessGstin.trim().toUpperCase()
    if (!legalName || legalName.length > 200) throw new Error('Enter the registered legal firm name (up to 200 characters).')
    if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) throw new Error('Enter a valid 15-character GSTIN.')
    await updateWorkspaceSettings('business-identity', { ...identity, businessLegalName: legalName, businessGstin: gstin })
  }

  async function saveScheduledNotifications(value: ScheduledNotification[], actor: string) {
    const parsed = parseScheduledNotifications(value)
    if (parsed.length !== value.length) throw new Error('Each notification needs a title, message, valid trigger time, and at least one staff role.')
    await updateWorkspaceSettings('notifications', parsed)
    void actor
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
    saveBusinessIdentity,
    saveScheduledNotifications,
  }
}
