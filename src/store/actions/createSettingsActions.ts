import { doc, setDoc } from 'firebase/firestore'
import { db } from '@/shared/lib/firebase'
import { nowIso, type OperationalExpenseBreakdown, type StoreCollectionState } from '@/store/storeShared'

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

  async function savePlannerBankBalance(currentBankBalance: number, actor: string) {
    if (!Number.isFinite(currentBankBalance) || currentBankBalance < 0) {
      throw new Error('Current bank balance must be zero or more.')
    }

    await setDoc(doc(db, 'appMetadata', 'appSettings'), { currentBankBalance }, { merge: true })
    await pushSettingsAudit(`Planner bank balance updated: ${currentBankBalance}`, actor)
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
    savePlannerBankBalance,
  }
}
