import { useMemo, useState } from 'react'
import type { AppUser, UserRole } from '@/domain/financeTypes'
import type { UserAccount } from '@/domain/appTypes'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { FieldLabel } from '@/components/ui/field-label'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { SectionHeading } from '@/components/ui/section-heading'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

type SettingsPageProps = {
  currentUser: AppUser
  users: UserAccount[]
  isBusy: boolean
  marginPercentage: number
  monthlyOperationalExpense: number
  onCreateUser: (draft: {
    name: string
    email: string
    password: string
    mobileNumber: string
    role: Exclude<UserRole, 'owner'>
  }) => Promise<void>
  onDeleteUser: (userId: string) => Promise<void>
  onChangeOwnPassword: (password: string) => Promise<void>
  onSaveOperationalSettings: (monthlyOperationalExpense: number, marginPercentage: number) => Promise<void>
}

export function SettingsPage({
  currentUser,
  users,
  isBusy,
  marginPercentage,
  monthlyOperationalExpense,
  onCreateUser,
  onDeleteUser,
  onChangeOwnPassword,
  onSaveOperationalSettings,
}: SettingsPageProps) {
  const [error, setError] = useState('')
  const [userSearch, setUserSearch] = useState('')
  const canManageUsers = currentUser.role === 'owner'

  const filteredUsers = useMemo(() => {
    const search = userSearch.trim().toLowerCase()
    const visibleUsers = users.filter((user) => user.role !== 'owner' || user.id === currentUser.id)
    if (!search) return visibleUsers
    return visibleUsers.filter(
      (user) =>
        user.name.toLowerCase().includes(search) ||
        user.role.toLowerCase().includes(search) ||
        user.email.toLowerCase().includes(search) ||
        user.mobileNumber?.toLowerCase().includes(search),
    )
  }, [currentUser.id, userSearch, users])

  async function createUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const name = String(form.get('name') || '').trim()
    const email = String(form.get('email') || '').trim().toLowerCase()
    const password = String(form.get('password') || '').trim()
    const mobileNumber = String(form.get('mobileNumber') || '').trim()
    const role = String(form.get('role') || 'billing') as Exclude<UserRole, 'owner'>

    if (!name) {
      setError('Enter a staff name.')
      return
    }
    if (!email.includes('@')) {
      setError('Enter a valid email address.')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (mobileNumber.length < 10) {
      setError('Enter a valid mobile number with at least 10 digits.')
      return
    }
    if (role !== 'billing' && role !== 'manager') {
      setError('Choose a valid staff role.')
      return
    }

    try {
      setError('')
      await onCreateUser({ name, email, password, mobileNumber, role })
      formElement.reset()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create the user.')
    }
  }

  async function changeOwnUserPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const password = String(form.get('password') || '').trim()

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    try {
      setError('')
      await onChangeOwnPassword(password)
      formElement.reset()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update your password.')
    }
  }

  async function updateOperationalSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const amount = Number(form.get('monthlyOperationalExpense') || 0)
    const nextMarginPercentage = Number(form.get('marginPercentage') || 0)

    if (!Number.isFinite(amount) || amount < 0) {
      setError('Monthly operational expense must be zero or more.')
      return
    }
    if (!Number.isFinite(nextMarginPercentage) || nextMarginPercentage < 0 || nextMarginPercentage > 100) {
      setError('Margin percentage must be between 0 and 100.')
      return
    }

    try {
      setError('')
      await onSaveOperationalSettings(amount, nextMarginPercentage)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update operational settings.')
    }
  }

  async function deleteUser(userId: string) {
    try {
      setError('')
      await onDeleteUser(userId)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to delete the user.')
    }
  }

  return (
    <section className="grid min-h-0 gap-4 overflow-hidden">
      {error ? (
        <div className="rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>
      ) : null}
      <Tabs defaultValue={canManageUsers ? 'create' : 'password'} className="grid min-h-0 flex-1 gap-4 overflow-hidden">
        <TabsList className="w-full justify-start">
          {canManageUsers ? <TabsTrigger value="create">Create User</TabsTrigger> : null}
          {canManageUsers ? <TabsTrigger value="operations">Operations</TabsTrigger> : null}
          <TabsTrigger value="directory">Account Directory</TabsTrigger>
          <TabsTrigger value="password">Update Password</TabsTrigger>
        </TabsList>

        {canManageUsers ? (
          <TabsContent value="create" className="min-h-0">
            <Card className="max-w-3xl">
              <CardHeader className="pb-3">
                <SectionHeading eyebrow="Users" title="Create Staff Account" />
              </CardHeader>
              <CardContent>
                <form className="grid gap-4 sm:grid-cols-2" onSubmit={createUser}>
                  <FieldLabel label="Staff Name">
                    <Input name="name" placeholder="Enter full name" required onChange={() => setError('')} />
                  </FieldLabel>
                  <FieldLabel label="Role">
                    <NativeSelect defaultValue="billing" name="role" onChange={() => setError('')}>
                      <option value="billing">Billing</option>
                      <option value="manager">Manager</option>
                    </NativeSelect>
                  </FieldLabel>
                  <FieldLabel label="Email Address">
                    <Input name="email" placeholder="staff@company.com" required type="email" onChange={() => setError('')} />
                  </FieldLabel>
                  <FieldLabel label="Mobile Number">
                    <Input name="mobileNumber" placeholder="10-digit mobile number" required type="tel" onChange={() => setError('')} />
                  </FieldLabel>
                  <FieldLabel className="sm:col-span-2" label="Password">
                    <Input name="password" placeholder="At least 6 characters" required type="password" onChange={() => setError('')} />
                  </FieldLabel>
                  <div className="sm:col-span-2">
                    <Button disabled={isBusy}>{isBusy ? 'Creating...' : 'Create User'}</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}

        {canManageUsers ? (
          <TabsContent value="operations" className="min-h-0">
            <Card className="max-w-3xl">
              <CardHeader className="pb-3">
                <SectionHeading eyebrow="Operations" title="Projection Settings" />
              </CardHeader>
              <CardContent>
                <form className="grid gap-4 sm:grid-cols-2" onSubmit={updateOperationalSettings}>
                  <FieldLabel label="Monthly Operational Expense">
                    <Input
                      defaultValue={String(monthlyOperationalExpense)}
                      name="monthlyOperationalExpense"
                      type="number"
                      min="0"
                      step="1"
                      onChange={() => setError('')}
                    />
                  </FieldLabel>
                  <FieldLabel label="Margin %">
                    <Input
                      defaultValue={String(marginPercentage)}
                      name="marginPercentage"
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      onChange={() => setError('')}
                    />
                  </FieldLabel>
                  <div className="sm:col-span-2">
                    <Button disabled={isBusy}>{isBusy ? 'Saving...' : 'Save Projection Settings'}</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}

        <TabsContent value="directory" className="min-h-0">
          <Card className="flex h-full min-h-0 flex-col">
            <CardHeader className="gap-4 sm:flex-row sm:items-end sm:justify-between">
              <SectionHeading eyebrow="Users" title="Account Directory" />
              <FieldLabel className="w-full sm:max-w-sm" label="Search User">
                <Input
                  value={userSearch}
                  placeholder="Name, role, email, or mobile"
                  onChange={(event) => {
                    setUserSearch(event.target.value)
                    setError('')
                  }}
                />
              </FieldLabel>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-hidden">
              <div className="grid min-h-0 gap-3 overflow-y-auto pr-1">
                {filteredUsers.map((user) => (
                  <article
                    className="flex flex-col gap-4 rounded-[20px] border border-border/70 bg-secondary/55 p-4 lg:flex-row lg:items-center lg:justify-between"
                    key={user.id}
                  >
                    <div className="space-y-1">
                      <strong className="text-base font-bold text-foreground">{user.name}</strong>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{user.role}</Badge>
                        <span className="text-sm text-muted-foreground">{user.email}</span>
                        {user.mobileNumber ? <span className="text-sm text-muted-foreground">{user.mobileNumber}</span> : null}
                      </div>
                    </div>
                    {canManageUsers && user.id !== currentUser.id ? (
                      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
                        <span className="text-sm font-medium text-muted-foreground">Delete removes app access for this user.</span>
                        <Button variant="destructive" type="button" onClick={() => void deleteUser(user.id)}>
                          Delete
                        </Button>
                      </div>
                    ) : (
                      <span className="text-sm font-medium text-muted-foreground">{user.id === currentUser.id ? 'Current account' : 'Protected'}</span>
                    )}
                  </article>
                ))}
                {filteredUsers.length === 0 ? <p className="text-sm font-medium text-muted-foreground">No users match this search.</p> : null}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="password" className="min-h-0">
          <Card className="max-w-2xl">
            <CardHeader className="pb-3">
              <SectionHeading eyebrow="Security" title="Update My Password" />
            </CardHeader>
            <CardContent>
              <form className="grid gap-4" onSubmit={changeOwnUserPassword}>
                <FieldLabel label="New Password">
                  <Input name="password" placeholder="At least 6 characters" required type="password" onChange={() => setError('')} />
                </FieldLabel>
                <Button disabled={isBusy}>{isBusy ? 'Saving...' : 'Save Password'}</Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </section>
  )
}
