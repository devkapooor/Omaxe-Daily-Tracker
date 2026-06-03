import type { Dispatch, SetStateAction } from 'react'
import { doc, setDoc } from 'firebase/firestore'
import { db } from '@/shared/lib/firebase'
import type { StoreCollectionState } from './storeShared'
import { NameDirectoryType, normalizeName, nowIso, uniqNames } from './storeShared'
import { createAuthActions } from '@/store/actions/createAuthActions'
import { createFinanceActions } from '@/store/actions/createFinanceActions'
import { createSettingsActions } from '@/store/actions/createSettingsActions'

export type CreateActionsArgs = {
  getState: () => StoreCollectionState
  setAuthError: Dispatch<SetStateAction<string | null>>
  setIsBusy: Dispatch<SetStateAction<boolean>>
}

export function createAppStoreActions({ getState, setAuthError, setIsBusy }: CreateActionsArgs) {
  async function pushSettingsAudit(action: string, actor: string) {
    const id = `settings-audit-${crypto.randomUUID()}`
    await setDoc(doc(db, 'settingsAudit', id), {
      action,
      actor,
      createdAt: nowIso(),
    })
  }

  async function ensureNameInDirectory(type: NameDirectoryType, rawName: string) {
    const { nameDirectory } = getState()
    const normalized = normalizeName(rawName)
    if (!normalized) return false
    const existing = nameDirectory[type].some((item) => item.toLowerCase() === normalized.toLowerCase())
    if (existing) return false

    const next = {
      ...nameDirectory,
      [type]: uniqNames([...nameDirectory[type], normalized]),
    }
    await setDoc(doc(db, 'appMetadata', 'nameDirectory'), next, { merge: true })
    return true
  }

  async function renamePartyInDirectory(previousRawName: string, nextRawName: string) {
    const { nameDirectory } = getState()
    const previousName = normalizeName(previousRawName)
    const nextName = normalizeName(nextRawName)

    if (!previousName) throw new Error('Current party name is required.')
    if (!nextName) throw new Error('New party name is required.')

    const previousKey = previousName.toLowerCase()
    const nextKey = nextName.toLowerCase()
    const existingIndex = nameDirectory.people.findIndex((item) => item.toLowerCase() === previousKey)

    if (existingIndex === -1) throw new Error('This saved party could not be found.')
    if (previousKey === nextKey) return false
    if (nameDirectory.people.some((item) => item.toLowerCase() === nextKey)) {
      throw new Error('A saved party with this name already exists.')
    }

    const nextPeople = [...nameDirectory.people]
    nextPeople[existingIndex] = nextName
    await setDoc(
      doc(db, 'appMetadata', 'nameDirectory'),
      { people: uniqNames(nextPeople) },
      { merge: true },
    )
    return true
  }

  const settingsActions = createSettingsActions({ pushSettingsAudit })
  const financeActions = createFinanceActions({ getState, setIsBusy, ensureNameInDirectory })
  const authActions = createAuthActions({ getState, setAuthError, setIsBusy, ensureNameInDirectory, pushSettingsAudit })

  return {
    ...authActions,
    ...financeActions,
    renamePartyInDirectory,
    ...settingsActions,
  }
}

