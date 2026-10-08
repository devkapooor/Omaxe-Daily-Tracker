const STORAGE_KEY = 'alphahub.remembered-accounts.v1'

export type RememberedAccount = {
  uid: string
  name: string
  email: string
}

export function getRememberedAccounts(): RememberedAccount[] {
  if (typeof window === 'undefined') return []
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is RememberedAccount =>
      Boolean(item && typeof item.uid === 'string' && typeof item.name === 'string' && typeof item.email === 'string'),
    ).slice(0, 8)
  } catch {
    return []
  }
}

export function rememberAccount(account: RememberedAccount) {
  if (typeof window === 'undefined' || !account.uid || !account.email) return
  const accounts = getRememberedAccounts().filter((saved) => saved.uid !== account.uid)
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([{ ...account }, ...accounts].slice(0, 8)))
}

export function forgetAccount(uid: string) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(getRememberedAccounts().filter((account) => account.uid !== uid)))
}

export function clearRememberedAccounts() {
  if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEY)
}
