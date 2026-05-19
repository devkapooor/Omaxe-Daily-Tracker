import { deleteApp, initializeApp } from 'firebase/app'
import { createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword, signOut, updatePassword } from 'firebase/auth'
import { deleteDoc, doc, setDoc } from 'firebase/firestore'
import { auth, db, firebaseConfig } from '@/shared/lib/firebase'
import type { CreateUserInput, StoreCollectionState } from '@/store/storeShared'
import { normalizeName, nowIso } from '@/store/storeShared'

type AuthActionArgs = {
  getState: () => StoreCollectionState
  setAuthError: React.Dispatch<React.SetStateAction<string | null>>
  setIsBusy: React.Dispatch<React.SetStateAction<boolean>>
  ensureNameInDirectory: (type: 'people' | 'vendors', rawName: string) => Promise<boolean>
  pushSettingsAudit: (action: string, actor: string) => Promise<void>
}

export function createAuthActions({
  ensureNameInDirectory,
  getState,
  pushSettingsAudit,
  setAuthError,
  setIsBusy,
}: AuthActionArgs) {
  async function signInWithApp(email: string, password: string) {
    setIsBusy(true)
    setAuthError(null)
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to sign in.')
      throw error
    } finally {
      setIsBusy(false)
    }
  }

  async function createUserAccount(input: CreateUserInput, actor: string) {
    setIsBusy(true)
    setAuthError(null)
    const secondaryApp = initializeApp(firebaseConfig, `create-user-${crypto.randomUUID()}`)
    const secondaryAuth = getAuth(secondaryApp)
    try {
      const name = normalizeName(input.name)
      const email = input.email.trim().toLowerCase()
      const password = input.password
      const mobileNumber = input.mobileNumber.trim()
      const role = input.role

      if (!name) throw new Error('A staff name is required.')
      if (!email.includes('@')) throw new Error('A valid email address is required.')
      if (password.length < 6) throw new Error('Password must be at least 6 characters.')
      if (mobileNumber.length < 10) throw new Error('A valid mobile number is required.')
      if (role !== 'billing' && role !== 'manager') throw new Error('Choose a valid staff role.')

      const credentials = await createUserWithEmailAndPassword(secondaryAuth, email, password)
      const uid = credentials.user.uid
      await setDoc(doc(db, 'users', uid), {
        name,
        email,
        mobileNumber,
        role,
        approvalStatus: 'approved',
        createdAt: nowIso(),
        disabled: false,
      })
      await ensureNameInDirectory('people', name)
      await pushSettingsAudit(`User created: ${name} (${role})`, actor)
      return { uid, email }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to create the user account.')
      throw error
    } finally {
      await secondaryAuth.signOut().catch(() => undefined)
      await deleteApp(secondaryApp).catch(() => undefined)
      setIsBusy(false)
    }
  }

  async function signOutCurrentUser() {
    await signOut(auth)
  }

  async function deleteUserAccount(userId: string, actor: string) {
    const { users } = getState()
    const target = users.find((item) => item.id === userId)
    if (!target || target.role === 'owner') return
    await deleteDoc(doc(db, 'users', userId))
    await pushSettingsAudit(`User deleted: ${target.name} (${target.role})`, actor)
  }

  async function changeOwnPassword(nextPassword: string) {
    if (!auth.currentUser) throw new Error('No authenticated user found.')
    await updatePassword(auth.currentUser, nextPassword)
  }

  return {
    changeOwnPassword,
    createUserAccount,
    deleteUserAccount,
    signIn: signInWithApp,
    signOutCurrentUser,
  }
}
