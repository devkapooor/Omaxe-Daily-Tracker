import { useMemo, useState } from 'react'
import type { CashTransfer, DailyCashoutEntry, UserAccount } from '@/domain/appTypes'
import {
  activeWorkspaceUsers,
  formatDisplayDate,
  formatDisplayTime,
  legacyCashHolderLabel,
  type LegacyCashBalance,
  money,
  numberValue,
  type PendingCashUserBalance,
  today,
} from '@/app/uiHelpers'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { FieldLabel } from '@/shared/ui/field-label'
import { Input } from '@/shared/ui/input'
import { NativeSelect } from '@/shared/ui/native-select'
import { SectionHeading } from '@/shared/ui/section-heading'

type CashMovementFormProps = {
  currentUserId: string
  currentUserName: string
  users: UserAccount[]
  userBalances: PendingCashUserBalance[]
  legacyBalances: LegacyCashBalance[]
  legacyCashoutEntries: DailyCashoutEntry[]
  legacyTransferEntries: CashTransfer[]
  migratedCashoutEntries: DailyCashoutEntry[]
  onTransfer: (draft: Omit<CashTransfer, 'id' | 'createdAt'>) => Promise<void>
}

export function CashMovementForm({
  currentUserId,
  currentUserName,
  users,
  userBalances,
  legacyBalances,
  legacyCashoutEntries,
  legacyTransferEntries,
  migratedCashoutEntries,
  onTransfer,
}: CashMovementFormProps) {
  const userOptions = useMemo(
    () =>
      activeWorkspaceUsers(users)
        .map((user) => ({
          id: user.id,
          name: user.name,
          amount: userBalances.find((entry) => entry.userId === user.id)?.amount ?? 0,
        }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    [userBalances, users],
  )

  const [transferFromUserId, setTransferFromUserId] = useState(currentUserId)
  const [transferTo, setTransferTo] = useState<string>('bank')
  const [amount, setAmount] = useState('0')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  const hasLegacyWarnings =
    legacyBalances.some((entry) => entry.amount !== 0) ||
    legacyCashoutEntries.length > 0 ||
    legacyTransferEntries.length > 0

  async function submitTransfer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const fromUser = userOptions.find((user) => user.id === transferFromUserId)
    if (!fromUser) {
      setError('Select the sender.')
      return
    }
    if (!transferTo) {
      setError('Select the destination.')
      return
    }
    if (transferTo !== 'bank' && transferTo === transferFromUserId) {
      setError('Sender and destination cannot be the same person.')
      return
    }

    const transferAmount = numberValue(amount)
    if (transferAmount <= 0) {
      setError('Movement amount must be greater than zero.')
      return
    }
    if (fromUser.amount < transferAmount) {
      setError('Movement amount cannot exceed the sender pending cash balance.')
      return
    }
    if (!reason.trim()) {
      setError('Enter cash movement notes.')
      return
    }

    const toUser = transferTo === 'bank' ? null : userOptions.find((user) => user.id === transferTo)

    try {
      await onTransfer({
        date: today(),
        fromUserId: fromUser.id,
        toType: transferTo === 'bank' ? 'bank' : 'person',
        ...(toUser ? { toUserId: toUser.id } : {}),
        amount: transferAmount,
        reason: reason.trim(),
        createdBy: currentUserName,
        recordType: transferTo === 'bank' ? 'bank-transfer' : 'cash-movement',
      })
      setTransferFromUserId(currentUserId)
      setTransferTo('bank')
      setAmount('0')
      setReason('')
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save the cash movement.')
    }
  }

  return (
    <Card className="flex min-h-full flex-col xl:h-full xl:min-h-0">
      <CardHeader>
        <SectionHeading eyebrow="Cash Control" title="Move Counter Cash To Bank" />
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {userOptions.map((user) => (
            <div key={user.id} className="rounded-[18px] border border-border/70 bg-secondary/55 p-3.5">
              <span className="block text-xs font-extrabold uppercase tracking-[0.2em] text-muted-foreground">
                {user.name}
              </span>
              <strong className="mt-2 block text-xl font-black tracking-tight text-foreground">
                {money(user.amount)}
              </strong>
              <p className="mt-2 text-xs font-medium text-muted-foreground">Pending counter cash balance owned by this login</p>
            </div>
          ))}
        </div>

        {hasLegacyWarnings ? (
          <div className="rounded-[18px] border border-amber-200 bg-amber-50/90 p-4 text-amber-900">
            <p className="text-sm font-bold">Legacy cash records need review</p>
            <p className="mt-1 text-sm">
              Only records with exact user evidence are counted in live balances. Unmatched legacy slot records stay isolated until you review them.
            </p>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              {legacyBalances
                .filter((entry) => entry.amount !== 0 || entry.cashoutCount > 0 || entry.transferInCount > 0 || entry.transferOutCount > 0)
                .map((entry) => (
                  <div key={entry.holder} className="rounded-[16px] border border-amber-200 bg-white/80 p-3">
                    <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-amber-700">{entry.label}</p>
                    <p className="mt-1 text-sm font-bold">{money(entry.amount)}</p>
                    <p className="mt-1 text-xs text-amber-800">
                      Cashouts {entry.cashoutCount} | In {entry.transferInCount} | Out {entry.transferOutCount}
                    </p>
                  </div>
                ))}
            </div>
            {migratedCashoutEntries.length > 0 ? (
              <div className="mt-3 space-y-1 text-xs text-amber-900">
                <p className="font-bold">Auto-matched legacy cashouts now counted under users</p>
                {migratedCashoutEntries.slice(-5).reverse().map((entry) => (
                  <p key={entry.id}>
                    {formatDisplayDate(entry.date)} | {entry.recordedBy} | {money(entry.drawerTotal ?? entry.remainingBalance)}
                  </p>
                ))}
              </div>
            ) : null}
            {legacyCashoutEntries.length > 0 ? (
              <div className="mt-3 space-y-1 text-xs text-amber-900">
                <p className="font-bold">Recent unmatched legacy cashouts</p>
                {legacyCashoutEntries.slice(0, 5).map((entry) => (
                  <p key={entry.id}>
                    {formatDisplayDate(entry.date)} | {entry.recordedBy} | {money(entry.drawerTotal ?? entry.remainingBalance)} | {legacyCashHolderLabel(entry.recordedByHolder)}
                  </p>
                ))}
              </div>
            ) : null}
            {legacyTransferEntries.length > 0 ? (
              <div className="mt-3 space-y-1 text-xs text-amber-900">
                <p className="font-bold">Recent unmatched legacy transfers</p>
                {legacyTransferEntries.slice(-5).reverse().map((entry) => (
                  <p key={entry.id}>
                    {formatDisplayDate(entry.date)} {formatDisplayTime(entry.createdAt)} | {legacyCashHolderLabel(entry.from)} to {entry.toType === 'bank' ? 'Bank' : legacyCashHolderLabel(entry.toPerson)} | {money(entry.amount)}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <form className="grid gap-3.5 md:grid-cols-2" onSubmit={submitTransfer}>
          <FieldLabel label="From">
            <NativeSelect
              value={transferFromUserId}
              onChange={(event) => {
                setTransferFromUserId(event.target.value)
                setError('')
              }}
            >
              <option value="">Select user</option>
              {userOptions.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </NativeSelect>
          </FieldLabel>

          <FieldLabel label="To">
            <NativeSelect
              value={transferTo}
              onChange={(event) => {
                setTransferTo(event.target.value)
                setError('')
              }}
            >
              {userOptions.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
              <option value="bank">Bank</option>
            </NativeSelect>
          </FieldLabel>

          <FieldLabel label="Movement Amount">
            <Input
              type="number"
              min="0"
              step="1"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value)
                setError('')
              }}
            />
          </FieldLabel>

          <FieldLabel className="md:col-span-2" label="Cash Movement Notes">
            <Input
              type="text"
              value={reason}
              placeholder="Reason, deposit note, or movement remarks"
              onChange={(event) => {
                setReason(event.target.value)
                setError('')
              }}
            />
          </FieldLabel>

          {error ? <p className="text-sm font-semibold text-destructive md:col-span-2">{error}</p> : null}
          <Button className="md:col-span-2">Save Cash Movement</Button>
        </form>
      </CardContent>
    </Card>
  )
}
