import { useMemo, useState } from 'react'
import type { AppUser, UserRole } from '../domain/financeTypes'
import type { SettingsAuditEntry, UserAccount } from '../domain/appTypes'

type SettingsPageProps = {
  currentUser: AppUser
  users: UserAccount[]
  isBusy: boolean
  onCreateUser: (draft: { email: string; password: string; name: string; role: UserRole }) => Promise<void>
  onSetUserDisabled: (userId: string, disabled: boolean) => Promise<void>
  onChangeOwnPassword: (password: string) => Promise<void>
  settingsAuditLog: SettingsAuditEntry[]
}

export function SettingsPage({
  currentUser,
  users,
  isBusy,
  onCreateUser,
  onSetUserDisabled,
  onChangeOwnPassword,
  settingsAuditLog,
}: SettingsPageProps) {
  const [error, setError] = useState('')
  const [userSearch, setUserSearch] = useState('')
  const canCreateUsers = currentUser.role === 'owner'
  const addableRoles: UserRole[] = ['manager', 'billing']
  const filteredUsers = useMemo(() => {
    const search = userSearch.trim().toLowerCase()
    const visibleUsers = users.filter((user) => user.role !== 'owner' || user.id === currentUser.id)
    if (!search) return visibleUsers
    return visibleUsers.filter(
      (user) =>
        user.name.toLowerCase().includes(search) ||
        user.role.toLowerCase().includes(search) ||
        user.email.toLowerCase().includes(search),
    )
  }, [currentUser.id, userSearch, users])

  async function createUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name') || '').trim()
    const email = String(form.get('email') || '').trim().toLowerCase()
    const password = String(form.get('password') || '').trim()
    const role = String(form.get('role') || 'billing') as UserRole

    if (name.length < 2) {
      setError('Name must be at least 2 characters.')
      return
    }
    if (!email.includes('@')) {
      setError('A valid email address is required.')
      return
    }
    if (users.some((user) => user.email.toLowerCase() === email)) {
      setError('A user with this email already exists.')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (!addableRoles.includes(role)) {
      setError('You cannot create this role.')
      return
    }

    try {
      setError('')
      await onCreateUser({ name, email, password, role })
      event.currentTarget.reset()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create user.')
    }
  }

  async function changeOwnUserPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const password = String(form.get('password') || '').trim()

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    try {
      setError('')
      await onChangeOwnPassword(password)
      event.currentTarget.reset()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update your password.')
    }
  }

  async function toggleUserDisabled(userId: string, disabled: boolean) {
    try {
      setError('')
      await onSetUserDisabled(userId, disabled)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update access.')
    }
  }

  return (
    <section className="settings-layout">
      <>
        {canCreateUsers ? (
          <form className="cashout-card settings-form" onSubmit={createUser}>
            <div className="card-title">
              <p className="eyebrow">Access</p>
              <h2>Create User</h2>
            </div>
            <label>
              Name
              <input name="name" placeholder="User name" required />
            </label>
            <label>
              Email
              <input name="email" placeholder="name@company.com" required type="email" />
            </label>
            <label>
              Role
              <select name="role">
                {addableRoles.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Temporary Password
              <input name="password" placeholder="At least 6 characters" required type="password" onChange={() => setError('')} />
            </label>
            <p className="pin-note">Firebase creates the auth login and the Firestore profile together.</p>
            {error && <p className="form-error light">{error}</p>}
            <button className="primary" disabled={isBusy}>
              {isBusy ? 'Creating...' : 'Create User'}
            </button>
          </form>
        ) : (
          <section className="cashout-card settings-form">
            <div className="card-title">
              <p className="eyebrow">Access</p>
              <h2>Create User</h2>
            </div>
            <p className="pin-note">Only the owner can create staff accounts.</p>
          </section>
        )}

        <form className="cashout-card settings-form" onSubmit={changeOwnUserPassword}>
          <div className="card-title">
            <p className="eyebrow">Security</p>
            <h2>Update My Password</h2>
          </div>
          <label>
            New Password
            <input name="password" placeholder="At least 6 characters" required type="password" onChange={() => setError('')} />
          </label>
          {error && <p className="form-error light">{error}</p>}
          <button className="primary" disabled={isBusy}>
            {isBusy ? 'Saving...' : 'Save Password'}
          </button>
        </form>

        <section className="cashout-card user-list-card">
          <div className="card-title">
            <p className="eyebrow">Users</p>
            <h2>Account Directory</h2>
          </div>
          <label>
            Search User
            <input
              value={userSearch}
              placeholder="Name, role, or email"
              onChange={(event) => {
                setUserSearch(event.target.value)
                setError('')
              }}
            />
          </label>
          <div className="user-list">
            {filteredUsers.map((user) => (
              <article className="user-row" key={user.id}>
                <div>
                  <strong>{user.name}</strong>
                  <span>{user.role}</span>
                  <span>{user.email}</span>
                </div>
                {canCreateUsers && user.id !== currentUser.id ? (
                  <div className="pin-change-form">
                    <span className="pin-note">{user.disabled ? 'Access disabled' : 'Access active'}</span>
                    <button className="ghost-light" type="button" onClick={() => void toggleUserDisabled(user.id, !user.disabled)}>
                      {user.disabled ? 'Restore' : 'Disable'}
                    </button>
                  </div>
                ) : (
                  <span className="pin-note">{user.id === currentUser.id ? 'Current account' : 'Protected'}</span>
                )}
              </article>
            ))}
            {filteredUsers.length === 0 && <p className="empty-state">No users match this search.</p>}
          </div>
        </section>

        <section className="cashout-card user-list-card">
          <div className="card-title">
            <p className="eyebrow">Audit</p>
            <h2>Recent Settings Activity</h2>
          </div>
          <div className="table-shell">
            {settingsAuditLog.length === 0 && <p className="empty-state">No settings activity recorded yet.</p>}
            {settingsAuditLog.slice(0, 10).map((entry) => (
              <div className="table-row" key={entry.id}>
                <span>
                  {new Date(entry.createdAt).toLocaleString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  | {entry.actor} | {entry.action}
                </span>
              </div>
            ))}
          </div>
        </section>
      </>
    </section>
  )
}
