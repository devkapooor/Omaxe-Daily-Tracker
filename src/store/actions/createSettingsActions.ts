import { doc, setDoc } from 'firebase/firestore'
import { db } from '@/shared/lib/firebase'

type SettingsActionArgs = {
  pushSettingsAudit: (action: string, actor: string) => Promise<void>
}

export function createSettingsActions({ pushSettingsAudit }: SettingsActionArgs) {
  async function saveOperationalSettings(monthlyOperationalExpense: number, marginPercentage: number, actor: string) {
    if (!Number.isFinite(monthlyOperationalExpense) || monthlyOperationalExpense < 0) {
      throw new Error('Monthly operational expense must be zero or more.')
    }
    if (!Number.isFinite(marginPercentage) || marginPercentage < 0 || marginPercentage > 100) {
      throw new Error('Margin percentage must be between 0 and 100.')
    }

    await setDoc(doc(db, 'appMetadata', 'appSettings'), { marginPercentage, monthlyOperationalExpense }, { merge: true })
    await pushSettingsAudit(`Operational settings updated: monthly expense ${monthlyOperationalExpense}, margin ${marginPercentage}%`, actor)
  }

  async function savePlannerBankBalance(currentBankBalance: number, actor: string) {
    if (!Number.isFinite(currentBankBalance) || currentBankBalance < 0) {
      throw new Error('Current bank balance must be zero or more.')
    }

    await setDoc(doc(db, 'appMetadata', 'appSettings'), { currentBankBalance }, { merge: true })
    await pushSettingsAudit(`Planner bank balance updated: ${currentBankBalance}`, actor)
  }

  return {
    saveOperationalSettings,
    savePlannerBankBalance,
  }
}
