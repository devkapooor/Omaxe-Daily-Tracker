import { useEffect, useMemo, useState } from 'react'
import type { AppUser, UserRole } from '@/domain/financeTypes'
import type { ScheduledNotification, UserAccount } from '@/domain/appTypes'
import type { BusinessIdentity } from '@/domain/businessIdentity'
import type { OperationalExpenseBreakdown } from '@/store/storeShared'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { FieldLabel } from '@/shared/ui/field-label'
import { Input } from '@/shared/ui/input'
import { NativeSelect } from '@/shared/ui/native-select'
import { PageHeader, PageHeaderTab, PageHeaderTabsList } from '@/shared/ui/page-header'
import { PageLayout } from '@/shared/ui/page-layout'
import { SectionHeading } from '@/shared/ui/section-heading'
import { StatusPanel } from '@/shared/ui/status-panel'
import { Tabs, TabsContent } from '@/shared/ui/tabs'
import { subscribePosConfig, updateDiscountLimit } from '@/features/pos/data/posRepository'
import { StaffNotificationsSettings } from './StaffNotificationsSettings'
import { TelegramAlertsSettings } from './TelegramAlertsSettings'

type SettingsPageProps = {
  currentUser: AppUser
  users: UserAccount[]
  isBusy: boolean
  marginPercentage: number
  monthlyOperationalExpense: number
  operationalExpenseBreakdown: OperationalExpenseBreakdown
  businessIdentity: BusinessIdentity
  onSaveBusinessIdentity: (identity: BusinessIdentity) => Promise<void>
  onCreateUser: (draft: {
    name: string
    email: string
    password: string
    mobileNumber: string
    role: Exclude<UserRole, 'owner'>
  }) => Promise<void>
  onDeleteUser: (userId: string) => Promise<void>
  onChangeOwnPassword: (password: string) => Promise<void>
  onSaveOperationalSettings: (operationalExpenseBreakdown: OperationalExpenseBreakdown, marginPercentage: number) => Promise<void>
  scheduledNotifications: ScheduledNotification[]
  onSaveScheduledNotifications: (notices: ScheduledNotification[]) => Promise<void>
}

export function SettingsPage({
  currentUser,
  users,
  isBusy,
  marginPercentage,
  monthlyOperationalExpense,
  operationalExpenseBreakdown,
  businessIdentity,
  onSaveBusinessIdentity,
  onCreateUser,
  onDeleteUser,
  onChangeOwnPassword,
  onSaveOperationalSettings,
  scheduledNotifications,
  onSaveScheduledNotifications,
}: SettingsPageProps) {
  const [error, setError] = useState('')
  const [userSearch, setUserSearch] = useState('')
  const [posDiscountLimit, setPosDiscountLimit] = useState('')
  const [posSettingsMessage, setPosSettingsMessage] = useState('')
  const [savingPosSettings, setSavingPosSettings] = useState(false)
  const [identityMessage, setIdentityMessage] = useState('')
  const [savingIdentity, setSavingIdentity] = useState(false)
  const canManageUsers = currentUser.role === 'owner'

  useEffect(() => {
    if (!canManageUsers) return
    return subscribePosConfig((config) => {
      setPosDiscountLimit(config.billingMaxDiscountPercentage === null ? '' : String(config.billingMaxDiscountPercentage))
    }, (cause) => setError(cause.message))
  }, [canManageUsers])

  const filteredUsers = useMemo(() => {
    const search = userSearch.trim().toLowerCase()
    if (!search) return users
    return users.filter(
      (user) =>
        user.name.toLowerCase().includes(search) ||
        user.role.toLowerCase().includes(search) ||
        user.email.toLowerCase().includes(search) ||
        user.mobileNumber?.toLowerCase().includes(search),
    )
  }, [userSearch, users])

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
    const nextBreakdown: OperationalExpenseBreakdown = {
      rent: Number(form.get('rent') || 0),
      electricity: Number(form.get('electricity') || 0),
      maintenance: Number(form.get('maintenance') || 0),
      salaries: Number(form.get('salaries') || 0),
      royalty: Number(form.get('royalty') || 0),
      caFee: Number(form.get('caFee') || 0),
      miscellaneous: Number(form.get('miscellaneous') || 0),
    }
    const nextMarginPercentage = Number(form.get('marginPercentage') || 0)

    for (const [label, value] of Object.entries(nextBreakdown)) {
      if (!Number.isFinite(value) || value < 0) {
        setError(`${label} expense must be zero or more.`)
        return
      }
    }
    if (!Number.isFinite(nextMarginPercentage) || nextMarginPercentage < 0 || nextMarginPercentage > 100) {
      setError('Margin percentage must be between 0 and 100.')
      return
    }

    try {
      setError('')
      await onSaveOperationalSettings(nextBreakdown, nextMarginPercentage)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update operational settings.')
    }
  }

  const operationalExpenseTotal = useMemo(
    () => Object.values(operationalExpenseBreakdown).reduce((total, value) => total + value, 0),
    [operationalExpenseBreakdown],
  )
  const displayedOperationalExpenseTotal = useMemo(
    () => (Object.values(operationalExpenseBreakdown).every((value) => value === 0) ? monthlyOperationalExpense : operationalExpenseTotal),
    [monthlyOperationalExpense, operationalExpenseBreakdown, operationalExpenseTotal],
  )

  async function deleteUser(userId: string) {
    try {
      setError('')
      await onDeleteUser(userId)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to delete the user.')
    }
  }

  async function savePosSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = posDiscountLimit.trim() === '' ? null : Number(posDiscountLimit)
    if (value !== null && (!Number.isFinite(value) || value < 0 || value > 100)) {
      setError('Billing discount limit must be between 0 and 100%.')
      return
    }
    try {
      setError('')
      setPosSettingsMessage('')
      setSavingPosSettings(true)
      await updateDiscountLimit(value, currentUser)
      setPosSettingsMessage('POS discount control saved.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save POS settings.')
    } finally {
      setSavingPosSettings(false)
    }
  }

  async function saveBusinessIdentity(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const value = (name: string) => String(form.get(name) ?? '').trim()
    try {
      setError(''); setIdentityMessage(''); setSavingIdentity(true)
      await onSaveBusinessIdentity({
        businessLegalName: value('legalName'),
        businessGstin: value('gstin').toUpperCase(),
        businessFssaiLicense: value('fssai'),
        businessBankName: value('bankName'),
        businessBankAccountHolder: value('accountHolder'),
        businessBankAccountNumber: value('accountNumber'),
        businessBankIfsc: value('ifsc').toUpperCase(),
        businessBankBranch: value('branch'),
      })
      setIdentityMessage('Firm identity saved to the shared Settings master.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save business identity.')
    } finally { setSavingIdentity(false) }
  }

  return (
    <Tabs defaultValue={canManageUsers ? 'staff' : 'password'} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageLayout
        className="min-h-0 flex-1 overflow-hidden"
        header={(
          <PageHeader
            title="Settings"
            tools={(
              <PageHeaderTabsList aria-label="Settings sections" className={`${canManageUsers ? 'grid-flow-row grid-cols-3 xl:grid-flow-col xl:grid-cols-6' : 'grid-cols-2 xl:grid-cols-2'} w-full xl:w-auto`}>
                <PageHeaderTab value="staff">Staff</PageHeaderTab>
                {canManageUsers ? <PageHeaderTab value="operations">Operations</PageHeaderTab> : null}
                {canManageUsers ? <PageHeaderTab value="pos">POS</PageHeaderTab> : null}
                {canManageUsers ? <PageHeaderTab value="notifications">Staff Notifications</PageHeaderTab> : null}
                {canManageUsers ? <PageHeaderTab value="business">Business Identity</PageHeaderTab> : null}
                <PageHeaderTab value="password">Update Password</PageHeaderTab>
              </PageHeaderTabsList>
            )}
          />
        )}
      >
        {error ? <StatusPanel variant="destructive">{error}</StatusPanel> : null}

        <TabsContent value="staff" className="min-h-0 flex-1">
          <div className={canManageUsers ? 'grid min-h-0 gap-2.5 xl:h-full xl:grid-cols-2' : 'grid min-h-0 gap-2.5 xl:h-full'}>
            {canManageUsers ? (
              <Card className="h-fit">
              <CardHeader className="px-3 pb-2 pt-3 sm:px-4">
                <SectionHeading eyebrow="Users" title="Create Staff Account" />
              </CardHeader>
              <CardContent className="px-3 pb-3 sm:px-4 sm:pb-4">
                <form className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3" onSubmit={createUser}>
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
                  <FieldLabel className="sm:col-span-2 xl:col-span-1" label="Password">
                    <Input name="password" placeholder="At least 6 characters" required type="password" onChange={() => setError('')} />
                  </FieldLabel>
                  <div className="sm:col-span-2 xl:col-span-3">
                    <Button disabled={isBusy}>{isBusy ? 'Creating...' : 'Create User'}</Button>
                  </div>
                </form>
              </CardContent>
              </Card>
            ) : null}

            <Card className="flex h-full min-h-0 flex-col">
              <CardHeader className="gap-3 border-b border-border px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
                <SectionHeading eyebrow="Users" title="Account Directory" />
                <FieldLabel className="w-full sm:max-w-sm" label="Search accounts">
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
              <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-3 sm:px-4 sm:pb-4">
                <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                  {filteredUsers.map((user) => (
                    <article
                      className="flex flex-col gap-2 border-b border-border py-2.5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
                      key={user.id}
                    >
                      <div className="min-w-0 space-y-1">
                        <strong className="text-sm font-semibold text-foreground">{user.name}</strong>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{user.role}</Badge>
                          <span className="break-all text-xs text-muted-foreground">{user.email}</span>
                          {user.mobileNumber ? <span className="text-xs text-muted-foreground">{user.mobileNumber}</span> : null}
                        </div>
                      </div>
                      {canManageUsers && user.id !== currentUser.id && user.role !== 'owner' ? (
                        <div className="flex flex-col items-start gap-1 sm:items-end">
                          <Button size="sm" variant="destructive" type="button" onClick={() => void deleteUser(user.id)}>
                            Delete
                          </Button>
                          <span className="max-w-md text-[10px] leading-4 text-muted-foreground">Deletion is blocked while financial, payroll, or audit history is linked to this account.</span>
                        </div>
                      ) : (
                        <span className="text-xs font-medium text-muted-foreground">{user.id === currentUser.id ? 'Current account' : user.role === 'owner' ? 'Protected owner account' : 'Protected'}</span>
                      )}
                    </article>
                  ))}
                  {filteredUsers.length === 0 ? <p className="text-sm font-medium text-muted-foreground">No users match this search.</p> : null}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {canManageUsers ? (
          <TabsContent value="operations" className="min-h-0 flex-1">
            <Card className="h-full">
              <CardHeader className="px-3 pb-2 pt-3 sm:px-4">
                <SectionHeading eyebrow="Operations" title="Projection Settings" />
              </CardHeader>
              <CardContent className="px-3 pb-3 sm:px-4 sm:pb-4">
                <form className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4" onSubmit={updateOperationalSettings}>
                  <FieldLabel label="Rent">
                    <Input
                      defaultValue={String(operationalExpenseBreakdown.rent)}
                      name="rent"
                      type="number"
                      min="0"
                      step="1"
                      onChange={() => setError('')}
                    />
                  </FieldLabel>
                  <FieldLabel label="Electricity">
                    <Input defaultValue={String(operationalExpenseBreakdown.electricity)} name="electricity" type="number" min="0" step="1" onChange={() => setError('')} />
                  </FieldLabel>
                  <FieldLabel label="Maintenance">
                    <Input defaultValue={String(operationalExpenseBreakdown.maintenance)} name="maintenance" type="number" min="0" step="1" onChange={() => setError('')} />
                  </FieldLabel>
                  <FieldLabel label="Salaries">
                    <Input defaultValue={String(operationalExpenseBreakdown.salaries)} name="salaries" type="number" min="0" step="1" onChange={() => setError('')} />
                  </FieldLabel>
                  <FieldLabel label="Royalty">
                    <Input defaultValue={String(operationalExpenseBreakdown.royalty)} name="royalty" type="number" min="0" step="1" onChange={() => setError('')} />
                  </FieldLabel>
                  <FieldLabel label="CA Fee">
                    <Input defaultValue={String(operationalExpenseBreakdown.caFee)} name="caFee" type="number" min="0" step="1" onChange={() => setError('')} />
                  </FieldLabel>
                  <FieldLabel label="Miscellaneous">
                    <Input defaultValue={String(operationalExpenseBreakdown.miscellaneous)} name="miscellaneous" type="number" min="0" step="1" onChange={() => setError('')} />
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
                  <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/50 px-3 py-2.5 sm:col-span-2 xl:col-span-3">
                    <span className="text-xs font-semibold text-muted-foreground">Computed Monthly Total</span>
                    <strong className="text-base font-semibold tabular-nums text-foreground">{displayedOperationalExpenseTotal.toLocaleString('en-IN')}</strong>
                  </div>
                  <div className="flex items-center sm:col-span-2 xl:col-span-1">
                    <Button disabled={isBusy}>{isBusy ? 'Saving...' : 'Save Projection Settings'}</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}

        {canManageUsers ? <TabsContent value="business" className="min-h-0 flex-1 overflow-y-auto">
          <Card className="max-w-2xl">
            <CardHeader className="px-3 pb-2 pt-3 sm:px-4"><SectionHeading eyebrow="Owner only" title="Business Identity" description="Save firm registration and bank details here. Firm name and GSTIN appear on Stock Return debit notes. Bank details are visible only to the owner." /></CardHeader>
            <CardContent className="px-3 pb-3 sm:px-4 sm:pb-4">
              <form key={[businessIdentity.businessLegalName, businessIdentity.businessGstin, businessIdentity.businessFssaiLicense, businessIdentity.businessBankName, businessIdentity.businessBankAccountHolder, businessIdentity.businessBankAccountNumber, businessIdentity.businessBankIfsc, businessIdentity.businessBankBranch].join('|')} className="grid gap-3 sm:grid-cols-2" onSubmit={saveBusinessIdentity} onChange={() => { setIdentityMessage(''); setError('') }}>
                <FieldLabel className="sm:col-span-2" label="Registered legal firm name"><Input name="legalName" defaultValue={businessIdentity.businessLegalName} maxLength={200} required /></FieldLabel>
                <FieldLabel label="GSTIN"><Input name="gstin" defaultValue={businessIdentity.businessGstin} maxLength={15} autoCapitalize="characters" onChange={event => { event.currentTarget.value = event.currentTarget.value.toUpperCase() }} required /></FieldLabel>
                <FieldLabel label="FSSAI licence number (optional)"><Input name="fssai" defaultValue={businessIdentity.businessFssaiLicense} inputMode="numeric" pattern="[0-9]{14}" maxLength={14} title="Enter the 14-digit FSSAI licence number, or leave blank." /></FieldLabel>
                <p className="border-t border-border pt-3 text-sm font-semibold sm:col-span-2">Bank account details (optional)</p>
                <FieldLabel label="Bank name"><Input name="bankName" defaultValue={businessIdentity.businessBankName} maxLength={120} /></FieldLabel>
                <FieldLabel label="Account holder name"><Input name="accountHolder" defaultValue={businessIdentity.businessBankAccountHolder} maxLength={200} /></FieldLabel>
                <FieldLabel label="Account number"><Input name="accountNumber" defaultValue={businessIdentity.businessBankAccountNumber} inputMode="numeric" pattern="[0-9]+" maxLength={34} autoComplete="off" title="Enter the account number using digits only." /></FieldLabel>
                <FieldLabel label="IFSC"><Input name="ifsc" defaultValue={businessIdentity.businessBankIfsc} maxLength={11} autoCapitalize="characters" pattern="[A-Z]{4}0[A-Z0-9]{6}" onChange={event => { event.currentTarget.value = event.currentTarget.value.toUpperCase() }} title="Enter the 11-character IFSC, or leave blank." /></FieldLabel>
                <FieldLabel className="sm:col-span-2" label="Branch"><Input name="branch" defaultValue={businessIdentity.businessBankBranch} maxLength={200} /></FieldLabel>
                <div className="sm:col-span-2"><Button disabled={savingIdentity}>{savingIdentity ? 'Saving...' : 'Save Business Identity'}</Button></div>
                {identityMessage ? <p role="status" className="text-sm text-emerald-700 sm:col-span-2">{identityMessage}</p> : null}
              </form>
            </CardContent>
          </Card>
        </TabsContent> : null}

        {canManageUsers ? (
          <TabsContent value="pos" className="min-h-0 flex-1 overflow-y-auto">
            <Card className="max-w-2xl">
              <CardHeader className="px-3 pb-2 pt-3 sm:px-4">
                <SectionHeading eyebrow="Owner only" title="POS Discount Control" description="Set the maximum discount Billing staff can apply. Managers and the owner can exceed it only with an override reason." />
              </CardHeader>
              <CardContent className="px-3 pb-3 sm:px-4 sm:pb-4">
                <form className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end" onSubmit={savePosSettings}>
                  <FieldLabel label="Billing maximum percentage (blank disables)">
                    <Input type="number" min="0" max="100" step="0.01" value={posDiscountLimit} onChange={(event) => { setPosDiscountLimit(event.target.value); setError(''); setPosSettingsMessage('') }} />
                  </FieldLabel>
                  <Button disabled={savingPosSettings}>{savingPosSettings ? 'Saving...' : 'Save POS Settings'}</Button>
                  {posSettingsMessage ? <p className="text-xs font-medium text-success sm:col-span-2">{posSettingsMessage}</p> : null}
                </form>
              </CardContent>
            </Card>
            <TelegramAlertsSettings />
          </TabsContent>
        ) : null}

        {canManageUsers ? <TabsContent value="notifications" className="min-h-0 flex-1 overflow-y-auto">
          <StaffNotificationsSettings notifications={scheduledNotifications} onSave={onSaveScheduledNotifications} />
        </TabsContent> : null}

        <TabsContent value="password" className="grid min-h-0 max-w-2xl flex-1 gap-4 overflow-y-auto">
          <Card className="h-fit">
            <CardHeader className="px-3 pb-2 pt-3 sm:px-4">
              <SectionHeading eyebrow="Security" title="Update My Password" />
            </CardHeader>
            <CardContent className="px-3 pb-3 sm:px-4 sm:pb-4">
              <form className="grid gap-4" onSubmit={changeOwnUserPassword}>
                <FieldLabel label="New Password">
                  <Input name="password" placeholder="At least 6 characters" required type="password" onChange={() => setError('')} />
                </FieldLabel>
                <Button disabled={isBusy}>{isBusy ? 'Saving...' : 'Save Password'}</Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </PageLayout>
    </Tabs>
  )
}

